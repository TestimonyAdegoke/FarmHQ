"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TraceEventType, TraceLotStatus, IotDeviceKind } from "@/generated/prisma/client";
import { audit, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { attempt } from "@/lib/forms";

function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}
function optional(form: FormData, key: string) {
  return text(form, key) || undefined;
}
function numberValue(form: FormData, key: string) {
  const value = Number(text(form, key));
  return Number.isFinite(value) ? value : undefined;
}
function dateValue(form: FormData, key: string) {
  const raw = text(form, key);
  return raw ? new Date(raw + "T12:00:00") : undefined;
}
function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function createTraceLotActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "inventory.manage") && !can(membership.role, "production.manage")) throw new Error("Forbidden");

  const lotCode = z.string().min(2).max(80).parse(text(form, "lotCode"));
  const productId = optional(form, "productId");
  const farmId = optional(form, "farmId");
  const cycleId = optional(form, "cycleId");
  const harvestRecordId = optional(form, "harvestRecordId");
  const parentLotId = optional(form, "parentLotId");

  const [product, farm, cycle, harvest, parent] = await Promise.all([
    productId ? db.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve(null),
    farmId ? db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve(null),
    cycleId ? db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve(null),
    harvestRecordId ? db.harvestRecord.findFirst({ where: { id: harvestRecordId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve(null),
    parentLotId ? db.traceLot.findFirst({ where: { id: parentLotId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (productId && !product) throw new Error("Product not found");
  if (farmId && !farm) throw new Error("Farm not found");
  if (cycleId && !cycle) throw new Error("Production cycle not found");
  if (harvestRecordId && !harvest) throw new Error("Harvest record not found");
  if (parentLotId && !parent) throw new Error("Parent lot not found");

  const publicToken = randomBytes(18).toString("base64url");
  const lot = await db.$transaction(async (tx) => {
    const created = await tx.traceLot.create({
      data: {
        tenantId: session.tenantId,
        lotCode,
        publicToken,
        productId,
        farmId,
        cycleId,
        harvestRecordId,
        parentLotId,
        quantity: numberValue(form, "quantity"),
        unit: optional(form, "unit"),
        grade: optional(form, "grade"),
        harvestedAt: dateValue(form, "harvestedAt"),
        expiresAt: dateValue(form, "expiresAt"),
        notes: optional(form, "notes"),
        createdById: session.userId,
      },
    });
    await tx.traceEvent.create({
      data: {
        tenantId: session.tenantId,
        lotId: created.id,
        type: harvestRecordId ? TraceEventType.HARVESTED : TraceEventType.CREATED,
        quantity: created.quantity,
        unit: created.unit,
        reference: optional(form, "reference"),
        notes: "Trace lot created",
        createdById: session.userId,
      },
    });
    return created;
  });
  await audit("trace_lot.create", "TraceLot", lot.id, { lotCode: lot.lotCode });
  revalidatePath("/traceability");
}

async function createTraceEventActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "inventory.manage") && !can(membership.role, "production.manage") && !can(membership.role, "sales.manage")) throw new Error("Forbidden");
  const lotId = text(form, "lotId");
  const lot = await db.traceLot.findFirst({ where: { id: lotId, tenantId: session.tenantId } });
  if (!lot) throw new Error("Trace lot not found");

  const type = z.nativeEnum(TraceEventType).parse(text(form, "type"));
  const event = await db.$transaction(async (tx) => {
    const created = await tx.traceEvent.create({
      data: {
        tenantId: session.tenantId,
        lotId,
        type,
        warehouseId: optional(form, "warehouseId"),
        quantity: numberValue(form, "quantity"),
        unit: optional(form, "unit"),
        reference: optional(form, "reference"),
        location: optional(form, "location"),
        notes: optional(form, "notes"),
        occurredAt: dateValue(form, "occurredAt") || new Date(),
        createdById: session.userId,
      },
    });
    const status = type === TraceEventType.SOLD
      ? TraceLotStatus.SOLD
      : type === TraceEventType.DELIVERED
        ? TraceLotStatus.CLOSED
        : undefined;
    if (status) await tx.traceLot.update({ where: { id: lotId }, data: { status } });
    return created;
  });
  await audit("trace_event.create", "TraceEvent", event.id, { lotId, type });
  revalidatePath("/traceability");
}

async function updateTraceLotStatusActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "inventory.manage") && !can(membership.role, "production.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const status = z.nativeEnum(TraceLotStatus).parse(text(form, "status"));
  const lot = await db.traceLot.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!lot) throw new Error("Trace lot not found");
  await db.traceLot.update({ where: { id }, data: { status } });
  await audit("trace_lot.status", "TraceLot", id, { status });
  revalidatePath("/traceability");
}

async function createIotDeviceActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "tenant.manage") && !can(membership.role, "equipment.manage")) throw new Error("Forbidden");

  const farmId = text(form, "farmId");
  const unitId = optional(form, "unitId");
  const secret = z.string().min(16).max(256).parse(text(form, "secret"));
  const [farm, unit] = await Promise.all([
    db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }),
    unitId ? db.productionUnit.findFirst({ where: { id: unitId, tenantId: session.tenantId, farmId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (!farm || (unitId && !unit)) throw new Error("Invalid farm or production unit");

  const device = await db.iotDevice.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      unitId,
      name: z.string().min(2).max(100).parse(text(form, "name")),
      code: z.string().min(2).max(80).parse(text(form, "code")),
      kind: z.nativeEnum(IotDeviceKind).parse(text(form, "kind")),
      apiKeyHash: sha256(secret),
    },
  });
  await audit("iot_device.create", "IotDevice", device.id, { code: device.code, kind: device.kind });
  revalidatePath("/iot");
}

async function toggleIotDeviceActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "tenant.manage") && !can(membership.role, "equipment.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const device = await db.iotDevice.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true, active: true } });
  if (!device) throw new Error("Device not found");
  await db.iotDevice.update({ where: { id }, data: { active: !device.active } });
  await audit("iot_device.toggle", "IotDevice", id, { active: !device.active });
  revalidatePath("/iot");
}


// Public actions return { ok, error } so forms can show a readable message instead of a crashed page.

export async function createTraceLotAction(form: FormData) {
  return attempt(async () => { await createTraceLotActionImpl(form); });
}

export async function createTraceEventAction(form: FormData) {
  return attempt(async () => { await createTraceEventActionImpl(form); });
}

export async function updateTraceLotStatusAction(form: FormData) {
  return attempt(async () => { await updateTraceLotStatusActionImpl(form); });
}

export async function createIotDeviceAction(form: FormData) {
  return attempt(async () => { await createIotDeviceActionImpl(form); });
}

export async function toggleIotDeviceAction(form: FormData) {
  return attempt(async () => { await toggleIotDeviceActionImpl(form); });
}
