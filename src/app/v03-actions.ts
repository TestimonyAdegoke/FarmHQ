"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AutomationSeverity,
  AutomationTrigger,
  ComplianceRecordType,
  ComplianceStatus,
  InventoryTxnType,
} from "@/generated/prisma/client";
import { audit, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertFarmAccess, farmWhere, isScoped, memberCan, resolveFarmId } from "@/lib/farm-scope";
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
function integerValue(form: FormData, key: string) {
  const value = numberValue(form, key);
  return value == null ? undefined : Math.trunc(value);
}
function dateValue(form: FormData, key: string) {
  const raw = text(form, key);
  return raw ? new Date(`${raw}T12:00:00`) : undefined;
}
const negativeTypes = new Set<string>([
  InventoryTxnType.ISSUE,
  InventoryTxnType.TRANSFER_OUT,
  InventoryTxnType.ADJUSTMENT_OUT,
  InventoryTxnType.SALE,
  InventoryTxnType.WASTE,
]);

async function warehouseStock(tenantId: string, warehouseId: string, productId: string) {
  const txns = await db.inventoryTransaction.findMany({
    where: { tenantId, warehouseId, productId },
    select: { type: true, quantity: true },
  });
  return txns.reduce((sum, txn) => {
    const quantity = Number(txn.quantity);
    return sum + (negativeTypes.has(txn.type) ? -quantity : quantity);
  }, 0);
}

async function updateFarmCoordinatesActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "farm.manage")) throw new Error("Forbidden");
  const farmId = text(form, "farmId");
  const latitude = z.number().min(-90).max(90).parse(numberValue(form, "latitude"));
  const longitude = z.number().min(-180).max(180).parse(numberValue(form, "longitude"));
  assertFarmAccess(membership.farmScope, farmId);
  const farm = await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } });
  if (!farm) throw new Error("Farm not found");
  await db.farm.update({ where: { id: farmId }, data: { latitude, longitude } });
  await audit("farm.coordinates.update", "Farm", farmId, { latitude, longitude });
  revalidatePath("/maps");
  revalidatePath("/weather");
}

async function saveUnitGeometryActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "farm.manage")) throw new Error("Forbidden");
  const unitId = text(form, "unitId");
  const geometryText = text(form, "geometryGeoJson");
  const unit = await db.productionUnit.findFirst({
    where: { id: unitId, tenantId: session.tenantId, ...farmWhere(membership.farmScope) },
    select: { id: true },
  });
  if (!unit) throw new Error("Production unit not found");
  let geometry: unknown;
  try {
    geometry = JSON.parse(geometryText);
  } catch {
    throw new Error("Invalid GeoJSON");
  }
  const schema = z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.array(z.number()).length(2))).min(1),
  });
  const parsed = schema.parse(geometry);
  const ring = parsed.coordinates[0];
  if (ring.length < 4) throw new Error("A field boundary needs at least three vertices");
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) throw new Error("GeoJSON polygon must be closed");
  const areaHa = numberValue(form, "areaHa");
  await db.productionUnit.update({ where: { id: unitId }, data: { geometryGeoJson: parsed, areaHa } });
  await audit("unit.geometry.update", "ProductionUnit", unitId, { vertices: ring.length - 1, areaHa });
  revalidatePath("/maps");
  revalidatePath("/fields");
}

async function transferInventoryActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "inventory.manage")) throw new Error("Forbidden");
  const fromWarehouseId = text(form, "fromWarehouseId");
  const toWarehouseId = text(form, "toWarehouseId");
  const productId = text(form, "productId");
  const quantity = z.number().positive().parse(numberValue(form, "quantity"));
  if (fromWarehouseId === toWarehouseId) throw new Error("Source and destination warehouses must differ");

  const [from, to, product] = await Promise.all([
    db.warehouse.findFirst({ where: { id: fromWarehouseId, tenantId: session.tenantId, ...farmWhere(membership.farmScope) }, select: { id: true } }),
    db.warehouse.findFirst({ where: { id: toWarehouseId, tenantId: session.tenantId, ...farmWhere(membership.farmScope) }, select: { id: true } }),
    db.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true, standardCost: true } }),
  ]);
  if (!from || !to || !product) throw new Error("Invalid warehouse or product");
  const available = await warehouseStock(session.tenantId, fromWarehouseId, productId);
  if (available < quantity) throw new Error(`Insufficient stock. Available: ${available}`);

  const reference = optional(form, "reference") || `TRF-${Date.now().toString(36).toUpperCase()}`;
  await db.$transaction([
    db.inventoryTransaction.create({
      data: {
        tenantId: session.tenantId,
        warehouseId: fromWarehouseId,
        productId,
        type: InventoryTxnType.TRANSFER_OUT,
        quantity,
        unitCost: product.standardCost,
        reference,
      },
    }),
    db.inventoryTransaction.create({
      data: {
        tenantId: session.tenantId,
        warehouseId: toWarehouseId,
        productId,
        type: InventoryTxnType.TRANSFER_IN,
        quantity,
        unitCost: product.standardCost,
        reference,
      },
    }),
  ]);
  await audit("inventory.transfer", "InventoryTransaction", undefined, { fromWarehouseId, toWarehouseId, productId, quantity, reference });
  revalidatePath("/stock-control");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

async function createStockCountActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "inventory.manage")) throw new Error("Forbidden");
  const warehouseId = text(form, "warehouseId");
  const productId = text(form, "productId");
  const countedQuantity = z.number().nonnegative().parse(numberValue(form, "countedQuantity"));
  const [warehouse, product] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, tenantId: session.tenantId, ...farmWhere(membership.farmScope) }, select: { id: true } }),
    db.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true, standardCost: true } }),
  ]);
  if (!warehouse || !product) throw new Error("Invalid warehouse or product");
  const systemQuantity = await warehouseStock(session.tenantId, warehouseId, productId);
  const variance = countedQuantity - systemQuantity;

  const count = await db.$transaction(async (tx) => {
    let adjustmentTxnId: string | undefined;
    if (Math.abs(variance) > 0.000001) {
      const adjustment = await tx.inventoryTransaction.create({
        data: {
          tenantId: session.tenantId,
          warehouseId,
          productId,
          type: variance > 0 ? InventoryTxnType.ADJUSTMENT_IN : InventoryTxnType.ADJUSTMENT_OUT,
          quantity: Math.abs(variance),
          unitCost: product.standardCost,
          reference: `STOCK-COUNT-${Date.now().toString(36).toUpperCase()}`,
          notes: optional(form, "notes"),
        },
      });
      adjustmentTxnId = adjustment.id;
    }
    return tx.stockCount.create({
      data: {
        tenantId: session.tenantId,
        warehouseId,
        productId,
        countedQuantity,
        systemQuantity,
        variance,
        countedById: session.userId,
        countedAt: dateValue(form, "countedAt") || new Date(),
        notes: optional(form, "notes"),
        adjustmentTxnId,
      },
    });
  });
  await audit("stock_count.create", "StockCount", count.id, { warehouseId, productId, countedQuantity, systemQuantity, variance });
  revalidatePath("/stock-control");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

async function createComplianceRecordActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "farm.manage") && !memberCan(membership, "production.manage")) throw new Error("Forbidden");
  const farmId = resolveFarmId(membership.farmScope, optional(form, "farmId"));
  if (farmId && !(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  const record = await db.complianceRecord.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      type: z.nativeEnum(ComplianceRecordType).parse(text(form, "type")),
      status: z.nativeEnum(ComplianceStatus).parse(text(form, "status")),
      title: z.string().min(2).parse(text(form, "title")),
      authority: optional(form, "authority"),
      reference: optional(form, "reference"),
      dueAt: dateValue(form, "dueAt"),
      completedAt: dateValue(form, "completedAt"),
      notes: optional(form, "notes"),
      createdById: session.userId,
    },
  });
  await audit("compliance.create", "ComplianceRecord", record.id, { type: record.type, status: record.status });
  revalidatePath("/compliance");
}

async function createChemicalApplicationActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "production.manage")) throw new Error("Forbidden");
  const farmId = text(form, "farmId");
  const unitId = optional(form, "unitId");
  const cycleId = optional(form, "cycleId");
  assertFarmAccess(membership.farmScope, farmId);
  const [farm, unit, cycle] = await Promise.all([
    db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }),
    unitId ? db.productionUnit.findFirst({ where: { id: unitId, tenantId: session.tenantId, farmId }, select: { id: true } }) : Promise.resolve({ id: "" }),
    cycleId ? db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId, farmId }, select: { id: true } }) : Promise.resolve({ id: "" }),
  ]);
  if (!farm || (unitId && !unit) || (cycleId && !cycle)) throw new Error("Invalid farm, field or cycle");
  const application = await db.chemicalApplication.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      unitId,
      cycleId,
      productName: z.string().min(2).parse(text(form, "productName")),
      activeIngredient: optional(form, "activeIngredient"),
      quantity: z.number().positive().parse(numberValue(form, "quantity")),
      unit: z.string().min(1).parse(text(form, "unit")),
      ratePerHa: numberValue(form, "ratePerHa"),
      applicationDate: dateValue(form, "applicationDate") || new Date(),
      operator: optional(form, "operator"),
      phiDays: integerValue(form, "phiDays"),
      reiHours: integerValue(form, "reiHours"),
      weatherNote: optional(form, "weatherNote"),
      notes: optional(form, "notes"),
    },
  });
  await audit("chemical_application.create", "ChemicalApplication", application.id, { farmId, productName: application.productName });
  revalidatePath("/compliance");
}

async function createDocumentRecordActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "farm.manage") && !memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const farmId = resolveFarmId(membership.farmScope, optional(form, "farmId"));
  const cycleId = optional(form, "cycleId");
  if (farmId && !(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  if (cycleId && !(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId, ...farmWhere(membership.farmScope) }, select: { id: true } }))) throw new Error("Production cycle not found");
  const record = await db.documentRecord.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      cycleId,
      category: z.string().min(2).parse(text(form, "category")),
      title: z.string().min(2).parse(text(form, "title")),
      fileUrl: z.string().url().parse(text(form, "fileUrl")),
      expiresAt: dateValue(form, "expiresAt"),
      notes: optional(form, "notes"),
      createdById: session.userId,
    },
  });
  await audit("document.create", "DocumentRecord", record.id, { category: record.category });
  revalidatePath("/compliance");
}

async function createAutomationRuleActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const rule = await db.automationRule.create({
    data: {
      tenantId: session.tenantId,
      name: z.string().min(2).parse(text(form, "name")),
      trigger: z.nativeEnum(AutomationTrigger).parse(text(form, "trigger")),
      severity: z.nativeEnum(AutomationSeverity).parse(text(form, "severity")),
      threshold: numberValue(form, "threshold"),
      createdById: session.userId,
    },
  });
  await audit("automation_rule.create", "AutomationRule", rule.id, { trigger: rule.trigger });
  revalidatePath("/automations");
}

async function notificationExists(tenantId: string, ruleId: string, entityType: string, entityId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db.notification.findFirst({
    where: { tenantId, ruleId, entityType, entityId, createdAt: { gte: since } },
    select: { id: true },
  });
}

async function runAutomationRulesActionImpl() {
  const { session, membership } = await requireSession();
  if (!memberCan(membership, "tenant.manage")) throw new Error("Forbidden");
  const rules = await db.automationRule.findMany({ where: { tenantId: session.tenantId, active: true } });
  let created = 0;

  for (const rule of rules) {
    if (rule.trigger === AutomationTrigger.LOW_STOCK) {
      const [products, txns] = await Promise.all([
        db.product.findMany({ where: { tenantId: session.tenantId, active: true }, select: { id: true, name: true, unit: true, reorderLevel: true } }),
        db.inventoryTransaction.findMany({ where: { tenantId: session.tenantId }, select: { productId: true, type: true, quantity: true } }),
      ]);
      const totals = new Map<string, number>();
      for (const txn of txns) {
        const q = Number(txn.quantity);
        totals.set(txn.productId, (totals.get(txn.productId) || 0) + (negativeTypes.has(txn.type) ? -q : q));
      }
      for (const product of products) {
        const threshold = rule.threshold != null ? Number(rule.threshold) : product.reorderLevel != null ? Number(product.reorderLevel) : undefined;
        if (threshold == null) continue;
        const onHand = totals.get(product.id) || 0;
        if (onHand <= threshold && !(await notificationExists(session.tenantId, rule.id, "Product", product.id))) {
          await db.notification.create({
            data: {
              tenantId: session.tenantId, ruleId: rule.id, severity: rule.severity,
              title: `Low stock: ${product.name}`,
              body: `${onHand} ${product.unit} on hand; threshold is ${threshold}.`,
              entityType: "Product", entityId: product.id,
            },
          });
          created++;
        }
      }
    }

    if (rule.trigger === AutomationTrigger.TASK_OVERDUE) {
      const tasks = await db.task.findMany({
        where: { tenantId: session.tenantId, dueAt: { lt: new Date() }, status: { in: ["TODO","IN_PROGRESS","BLOCKED"] } },
        select: { id: true, title: true, dueAt: true },
      });
      for (const task of tasks) {
        if (!(await notificationExists(session.tenantId, rule.id, "Task", task.id))) {
          await db.notification.create({
            data: { tenantId: session.tenantId, ruleId: rule.id, severity: rule.severity, title: `Overdue task: ${task.title}`, body: "This work item is past its due date and remains open.", entityType: "Task", entityId: task.id },
          });
          created++;
        }
      }
    }

    if (rule.trigger === AutomationTrigger.SCOUTING_HIGH) {
      const observations = await db.scoutingObservation.findMany({
        where: { tenantId: session.tenantId, resolvedAt: null, severity: { in: ["HIGH","CRITICAL"] } },
        select: { id: true, issue: true, severity: true },
      });
      for (const observation of observations) {
        if (!(await notificationExists(session.tenantId, rule.id, "ScoutingObservation", observation.id))) {
          await db.notification.create({
            data: { tenantId: session.tenantId, ruleId: rule.id, severity: observation.severity === "CRITICAL" ? AutomationSeverity.CRITICAL : rule.severity, title: observation.issue, body: `${observation.severity.toLowerCase()} scouting exception requires attention.`, entityType: "ScoutingObservation", entityId: observation.id },
          });
          created++;
        }
      }
    }

    if (rule.trigger === AutomationTrigger.EQUIPMENT_SERVICE_DUE) {
      const equipment = await db.equipment.findMany({
        where: { tenantId: session.tenantId, meterReading: { not: null }, nextServiceAt: { not: null } },
        select: { id: true, name: true, meterReading: true, nextServiceAt: true, meterUnit: true },
      });
      for (const asset of equipment) {
        if (Number(asset.meterReading) >= Number(asset.nextServiceAt) && !(await notificationExists(session.tenantId, rule.id, "Equipment", asset.id))) {
          await db.notification.create({
            data: { tenantId: session.tenantId, ruleId: rule.id, severity: rule.severity, title: `Service due: ${asset.name}`, body: `Current meter ${asset.meterReading} ${asset.meterUnit || ""}; service threshold ${asset.nextServiceAt}.`, entityType: "Equipment", entityId: asset.id },
          });
          created++;
        }
      }
    }
  }

  await audit("automation.run", "AutomationRule", undefined, { rules: rules.length, notificationsCreated: created });
  revalidatePath("/automations");
  revalidatePath("/dashboard");
}

async function markNotificationReadActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  const id = text(form, "id");
  if (isScoped(membership.farmScope)) throw new Error("Notification not found");
  const notification = await db.notification.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!notification) throw new Error("Notification not found");
  await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/automations");
}


// Public actions return { ok, error } so forms can show a readable message instead of a crashed page.

export async function updateFarmCoordinatesAction(form: FormData) {
  return attempt(async () => { await updateFarmCoordinatesActionImpl(form); });
}

export async function saveUnitGeometryAction(form: FormData) {
  return attempt(async () => { await saveUnitGeometryActionImpl(form); });
}

export async function transferInventoryAction(form: FormData) {
  return attempt(async () => { await transferInventoryActionImpl(form); });
}

export async function createStockCountAction(form: FormData) {
  return attempt(async () => { await createStockCountActionImpl(form); });
}

export async function createComplianceRecordAction(form: FormData) {
  return attempt(async () => { await createComplianceRecordActionImpl(form); });
}

export async function createChemicalApplicationAction(form: FormData) {
  return attempt(async () => { await createChemicalApplicationActionImpl(form); });
}

export async function createDocumentRecordAction(form: FormData) {
  return attempt(async () => { await createDocumentRecordActionImpl(form); });
}

export async function createAutomationRuleAction(form: FormData) {
  return attempt(async () => { await createAutomationRuleActionImpl(form); });
}

export async function runAutomationRulesAction() {
  return attempt(async () => { await runAutomationRulesActionImpl(); });
}

export async function markNotificationReadAction(form: FormData) {
  return attempt(async () => { await markNotificationReadActionImpl(form); });
}
