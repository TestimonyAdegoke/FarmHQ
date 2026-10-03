"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AutomationSeverity,
  ComplianceActionStatus,
  CountSessionStatus,
  InventoryTxnType,
} from "@/generated/prisma/client";
import { audit, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { runNotificationDeliveries, validateWebhookUrl } from "@/lib/notification-delivery";
import { complianceRecordIdWhere, farmWhere, memberCan, warehouseIdWhere } from "@/lib/farm-scope";
import { attempt } from "@/lib/forms";

function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}
function optional(form: FormData, key: string) {
  return text(form, key) || undefined;
}
function numberValue(form: FormData, key: string) {
  const raw = text(form, key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
function dateValue(form: FormData, key: string) {
  const raw = text(form, key);
  return raw ? new Date(raw + "T12:00:00") : undefined;
}
const negativeTypes = new Set<string>([
  InventoryTxnType.ISSUE,
  InventoryTxnType.TRANSFER_OUT,
  InventoryTxnType.ADJUSTMENT_OUT,
  InventoryTxnType.SALE,
  InventoryTxnType.WASTE,
]);

async function warehouseStock(tenantId: string, warehouseId: string, productId: string, lotNumber?: string) {
  const txns = await db.inventoryTransaction.findMany({
    where: {
      tenantId,
      warehouseId,
      productId,
      ...(lotNumber ? { lotNumber } : {}),
    },
    select: { type: true, quantity: true },
  });
  return txns.reduce((sum, txn) => {
    const quantity = Number(txn.quantity);
    return sum + (negativeTypes.has(txn.type) ? -quantity : quantity);
  }, 0);
}

async function createStockCountSessionActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "inventory.manage")) throw new Error("Forbidden");
  const warehouseId = text(form, "warehouseId");
  const warehouse = await db.warehouse.findFirst({
    where: { id: warehouseId, tenantId: session.tenantId, active: true, ...farmWhere(membership.farmScope) },
    select: { id: true },
  });
  if (!warehouse) throw new Error("Warehouse not found");
  const stamp = new Date().toISOString().slice(0,10).replaceAll("-","");
  const sessionNo = "CNT-" + stamp + "-" + randomBytes(3).toString("hex").toUpperCase();
  const created = await db.stockCountSession.create({
    data: {
      tenantId: session.tenantId,
      warehouseId,
      sessionNo,
      startedById: session.userId,
      notes: optional(form, "notes"),
    },
  });
  await audit("stock_count_session.create", "StockCountSession", created.id, { sessionNo, warehouseId });
  revalidatePath("/stock-control");
}

async function addStockCountLineActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "inventory.manage")) throw new Error("Forbidden");
  const sessionId = text(form, "sessionId");
  const productId = text(form, "productId");
  const countedQuantity = z.number().nonnegative().parse(numberValue(form, "countedQuantity"));
  const lotNumber = optional(form, "lotNumber");
  const [countSession, product] = await Promise.all([
    db.stockCountSession.findFirst({
      where: { id: sessionId, tenantId: session.tenantId, status: CountSessionStatus.OPEN, ...(await warehouseIdWhere(session.tenantId, membership.farmScope)) },
      select: { id: true, warehouseId: true, sessionNo: true },
    }),
    db.product.findFirst({
      where: { id: productId, tenantId: session.tenantId, active: true },
      select: { id: true },
    }),
  ]);
  if (!countSession || !product) throw new Error("Invalid count session or product");
  const systemQuantity = await warehouseStock(session.tenantId, countSession.warehouseId, productId, lotNumber);
  const variance = countedQuantity - systemQuantity;
  const line = await db.stockCountLine.upsert({
    where: { sessionId_productId: { sessionId, productId } },
    create: {
      tenantId: session.tenantId,
      sessionId,
      productId,
      lotNumber,
      systemQuantity,
      countedQuantity,
      variance,
      notes: optional(form, "notes"),
    },
    update: {
      lotNumber,
      systemQuantity,
      countedQuantity,
      variance,
      notes: optional(form, "notes"),
    },
  });
  await audit("stock_count_line.save", "StockCountLine", line.id, { sessionId, productId, systemQuantity, countedQuantity, variance });
  revalidatePath("/stock-control");
}

async function closeStockCountSessionActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "inventory.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const countSession = await db.stockCountSession.findFirst({
    where: { id, tenantId: session.tenantId, status: CountSessionStatus.OPEN, ...(await warehouseIdWhere(session.tenantId, membership.farmScope)) },
    include: { lines: true },
  });
  if (!countSession) throw new Error("Open count session not found");
  if (!countSession.lines.length) throw new Error("Add at least one count line before closing");
  if (countSession.lines.some(line => line.countedQuantity == null || line.variance == null)) throw new Error("All count lines must have counted quantities");

  const products = await db.product.findMany({
    where: { tenantId: session.tenantId, id: { in: countSession.lines.map(line=>line.productId) } },
    select: { id: true, standardCost: true },
  });
  const productCost = new Map(products.map(product=>[product.id, product.standardCost]));

  await db.$transaction(async (tx) => {
    for (const line of countSession.lines) {
      const variance = Number(line.variance || 0);
      let adjustmentTxnId: string | undefined;
      if (Math.abs(variance) > 0.000001) {
        const adjustment = await tx.inventoryTransaction.create({
          data: {
            tenantId: session.tenantId,
            warehouseId: countSession.warehouseId,
            productId: line.productId,
            type: variance > 0 ? InventoryTxnType.ADJUSTMENT_IN : InventoryTxnType.ADJUSTMENT_OUT,
            quantity: Math.abs(variance),
            unitCost: productCost.get(line.productId),
            lotNumber: line.lotNumber,
            reference: countSession.sessionNo,
            notes: "Physical stock count adjustment",
          },
        });
        adjustmentTxnId = adjustment.id;
      }
      await tx.stockCountLine.update({
        where: { id: line.id },
        data: { adjustmentTxnId },
      });
    }
    await tx.stockCountSession.update({
      where: { id: countSession.id },
      data: { status: CountSessionStatus.CLOSED, closedAt: new Date() },
    });
  });
  await audit("stock_count_session.close", "StockCountSession", id, { sessionNo: countSession.sessionNo, lines: countSession.lines.length });
  revalidatePath("/stock-control");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

async function cancelStockCountSessionActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "inventory.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const countSession = await db.stockCountSession.findFirst({
    where: { id, tenantId: session.tenantId, status: CountSessionStatus.OPEN, ...(await warehouseIdWhere(session.tenantId, membership.farmScope)) },
    select: { id: true, sessionNo: true },
  });
  if (!countSession) throw new Error("Open count session not found");
  await db.stockCountSession.update({ where: { id }, data: { status: CountSessionStatus.CANCELLED, closedAt: new Date() } });
  await audit("stock_count_session.cancel", "StockCountSession", id, { sessionNo: countSession.sessionNo });
  revalidatePath("/stock-control");
}

async function createComplianceActionActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "farm.manage") && !memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const complianceRecordId = text(form, "complianceRecordId");
  const record = await db.complianceRecord.findFirst({
    where: { id: complianceRecordId, tenantId: session.tenantId, ...farmWhere(membership.farmScope) },
    select: { id: true },
  });
  if (!record) throw new Error("Compliance record not found");
  const assignedToId = optional(form, "assignedToId");
  if (assignedToId) {
    const membershipRecord = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId: session.tenantId, userId: assignedToId } },
      select: { id: true },
    });
    if (!membershipRecord) throw new Error("Assignee is not a tenant member");
  }
  const action = await db.complianceAction.create({
    data: {
      tenantId: session.tenantId,
      complianceRecordId,
      title: z.string().min(2).max(300).parse(text(form, "title")),
      assignedToId,
      dueAt: dateValue(form, "dueAt"),
      createdById: session.userId,
    },
  });
  await audit("compliance_action.create", "ComplianceAction", action.id, { complianceRecordId });
  revalidatePath("/compliance");
}

async function updateComplianceActionStatusActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "farm.manage") && !memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const status = z.nativeEnum(ComplianceActionStatus).parse(text(form, "status"));
  const action = await db.complianceAction.findFirst({ where: { id, tenantId: session.tenantId, ...(await complianceRecordIdWhere(session.tenantId, membership.farmScope)) }, select: { id: true } });
  if (!action) throw new Error("Compliance action not found");
  await db.complianceAction.update({
    where: { id },
    data: {
      status,
      completionNotes: optional(form, "completionNotes"),
      completedAt: status === ComplianceActionStatus.COMPLETED || status === ComplianceActionStatus.WAIVED ? new Date() : null,
    },
  });
  await audit("compliance_action.status", "ComplianceAction", id, { status });
  revalidatePath("/compliance");
}

async function createNotificationEndpointActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const url = validateWebhookUrl(text(form, "url"));
  const endpoint = await db.notificationEndpoint.create({
    data: {
      tenantId: session.tenantId,
      name: z.string().min(2).max(100).parse(text(form, "name")),
      url,
      minimumSeverity: z.nativeEnum(AutomationSeverity).parse(text(form, "minimumSeverity")),
      createdById: session.userId,
    },
  });
  await audit("notification_endpoint.create", "NotificationEndpoint", endpoint.id, { minimumSeverity: endpoint.minimumSeverity });
  revalidatePath("/automations");
}

async function toggleNotificationEndpointActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const endpoint = await db.notificationEndpoint.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true, active: true } });
  if (!endpoint) throw new Error("Notification endpoint not found");
  await db.notificationEndpoint.update({ where: { id }, data: { active: !endpoint.active } });
  await audit("notification_endpoint.toggle", "NotificationEndpoint", id, { active: !endpoint.active });
  revalidatePath("/automations");
}

async function deliverNotificationsActionImpl() {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const result = await runNotificationDeliveries(session.tenantId);
  await audit("notification_delivery.run", "NotificationEndpoint", undefined, result);
  revalidatePath("/automations");
}


// Public actions return { ok, error } so forms can show a readable message instead of a crashed page.

export async function createStockCountSessionAction(form: FormData) {
  return attempt(async () => { await createStockCountSessionActionImpl(form); });
}

export async function addStockCountLineAction(form: FormData) {
  return attempt(async () => { await addStockCountLineActionImpl(form); });
}

export async function closeStockCountSessionAction(form: FormData) {
  return attempt(async () => { await closeStockCountSessionActionImpl(form); });
}

export async function cancelStockCountSessionAction(form: FormData) {
  return attempt(async () => { await cancelStockCountSessionActionImpl(form); });
}

export async function createComplianceActionAction(form: FormData) {
  return attempt(async () => { await createComplianceActionActionImpl(form); });
}

export async function updateComplianceActionStatusAction(form: FormData) {
  return attempt(async () => { await updateComplianceActionStatusActionImpl(form); });
}

export async function createNotificationEndpointAction(form: FormData) {
  return attempt(async () => { await createNotificationEndpointActionImpl(form); });
}

export async function toggleNotificationEndpointAction(form: FormData) {
  return attempt(async () => { await toggleNotificationEndpointActionImpl(form); });
}

export async function deliverNotificationsAction() {
  return attempt(async () => { await deliverNotificationsActionImpl(); });
}
