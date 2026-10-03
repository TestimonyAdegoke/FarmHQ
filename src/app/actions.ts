"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role, FarmType, UnitType, CycleType, CycleStatus, TaskPriority, TaskStatus, ExpenseStatus, EquipmentStatus, CropActivityType, ActivityStatus, ObservationSeverity, ProcurementStatus, PurchaseOrderStatus, LivestockEventType, RevenueType, EmploymentType, PayBasis, PaymentMethod, TimesheetStatus, EquipmentLogType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit, clearSession, createSession, requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { normalizePhone, slugify } from "@/lib/utils";
import { attempt, fail } from "@/lib/forms";
import { stockPositions } from "@/lib/ledger";

function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function optional(form: FormData, key: string) {
  const value = text(form, key);
  return value || undefined;
}

function numberValue(form: FormData, key: string) {
  const value = text(form, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integerValue(form: FormData, key: string) {
  const value = numberValue(form, key);
  return value == null ? undefined : Math.trunc(value);
}

function dateValue(form: FormData, key: string) {
  const value = text(form, key);
  return value ? new Date(`${value}T12:00:00`) : undefined;
}

async function uniqueSlug(name: string) {
  const base = slugify(name) || "farmhq";
  let candidate = base;
  let index = 2;
  while (await db.tenant.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index++}`;
  }
  return candidate;
}

export async function bootstrapAction(form: FormData) {
  if ((await db.user.count()) > 0) redirect("/login");

  const schema = z.object({
    name: z.string().min(2),
    organization: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(10),
  });

  const data = schema.parse({
    name: text(form, "name"),
    organization: text(form, "organization"),
    email: text(form, "email").toLowerCase(),
    password: text(form, "password"),
  });

  const passwordHash = await bcrypt.hash(data.password, 12);
  const slug = await uniqueSlug(data.organization);

  const result = await db.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: data.organization, slug } });
    const user = await tx.user.create({ data: { name: data.name, email: data.email, passwordHash } });
    const membership = await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: Role.OWNER } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, userId: user.id, action: "tenant.bootstrap", entityType: "Tenant", entityId: tenant.id } });
    return { tenant, user, membership };
  });

  await createSession({ userId: result.user.id, tenantId: result.tenant.id, role: result.membership.role });
  redirect("/dashboard");
}

/** Matches "0803 000 0001", "2348030000001" and "+234 803 000 0001" to the same account; ambiguous matches are rejected. */
async function findUserByPhone(input: string) {
  const digits = normalizePhone(input).replace("+", "");
  if (digits.length < 7) return null;
  const matches = await db.user.findMany({ where: { phone: { endsWith: digits.slice(-10) } }, include: { memberships: { orderBy: { createdAt: "asc" } } }, take: 2 });
  return matches.length === 1 ? matches[0] : null;
}

export async function loginAction(form: FormData) {
  const email = text(form, "email").toLowerCase();
  const password = text(form, "password");
  // Field managers often have no email address, so a registered phone number also works as the login.
  const user = email.includes("@")
    ? await db.user.findUnique({ where: { email }, include: { memberships: { orderBy: { createdAt: "asc" } } } })
    : await findUserByPhone(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)) || !user.memberships.length) {
    redirect("/login?error=invalid");
  }
  const membership = user.memberships[0];
  await createSession({ userId: user.id, tenantId: membership.tenantId, role: membership.role });
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function switchTenantAction(form: FormData) {
  const { session } = await requireSession();
  const tenantId = text(form, "tenantId");
  const membership = await db.membership.findUnique({ where: { tenantId_userId: { tenantId, userId: session.userId } } });
  if (!membership) return;
  await createSession({ userId: session.userId, tenantId, role: membership.role });
  redirect("/dashboard");
}

async function createFarmActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "farm.manage")) throw new Error("Forbidden");
  const name = z.string().min(2).parse(text(form, "name"));
  const farm = await db.farm.create({
    data: {
      tenantId: session.tenantId,
      name,
      code: optional(form, "code"),
      type: (optional(form, "type") as FarmType) || FarmType.MIXED,
      country: optional(form, "country"),
      state: optional(form, "state"),
      address: optional(form, "address"),
      areaHa: numberValue(form, "areaHa"),
    },
  });
  await audit("farm.create", "Farm", farm.id, { name: farm.name });
  revalidatePath("/farms");
  revalidatePath("/dashboard");
}

async function createUnitActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "farm.manage")) throw new Error("Forbidden");
  const farmId = text(form, "farmId");
  const farm = await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } });
  if (!farm) throw new Error("Farm not found");
  const unit = await db.productionUnit.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      name: z.string().min(2).parse(text(form, "name")),
      code: optional(form, "code"),
      type: (optional(form, "type") as UnitType) || UnitType.FIELD,
      areaHa: numberValue(form, "areaHa"),
    },
  });
  await audit("unit.create", "ProductionUnit", unit.id, { name: unit.name });
  revalidatePath("/fields");
  revalidatePath("/dashboard");
}

async function createCycleActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "production.manage")) throw new Error("Forbidden");
  const farmId = text(form, "farmId");
  const unitId = optional(form, "unitId");
  const farm = await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } });
  if (!farm) throw new Error("Farm not found");
  if (unitId && !(await db.productionUnit.findFirst({ where: { id: unitId, farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Production unit not found");
  const cycle = await db.productionCycle.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      unitId,
      name: z.string().min(2).parse(text(form, "name")),
      type: (optional(form, "type") as CycleType) || CycleType.CROP,
      commodity: z.string().min(2).parse(text(form, "commodity")),
      variety: optional(form, "variety"),
      status: (optional(form, "status") as CycleStatus) || CycleStatus.PLANNED,
      startDate: dateValue(form, "startDate"),
      expectedEndDate: dateValue(form, "expectedEndDate"),
      targetQuantity: numberValue(form, "targetQuantity"),
      targetUnit: optional(form, "targetUnit"),
      budgetAmount: numberValue(form, "budgetAmount"),
      notes: optional(form, "notes"),
    },
  });
  await audit("cycle.create", "ProductionCycle", cycle.id, { name: cycle.name });
  revalidatePath("/production");
  revalidatePath("/dashboard");
}

async function createTaskActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "task.manage")) throw new Error("Forbidden");
  const farmId = optional(form, "farmId");
  const cycleId = optional(form, "cycleId");
  if (farmId && !(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  if (cycleId && !(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Cycle not found");
  const task = await db.task.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      cycleId,
      title: z.string().min(2).parse(text(form, "title")),
      description: optional(form, "description"),
      priority: (optional(form, "priority") as TaskPriority) || TaskPriority.MEDIUM,
      dueAt: dateValue(form, "dueAt"),
      createdById: session.userId,
      assignedToId: optional(form, "assignedToId"),
    },
  });
  await audit("task.create", "Task", task.id, { title: task.title });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

async function updateTaskStatusActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "task.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const status = z.nativeEnum(TaskStatus).parse(text(form, "status"));
  const existing = await db.task.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!existing) throw new Error("Task not found");
  await db.task.update({ where: { id }, data: { status, completedAt: status === TaskStatus.DONE ? new Date() : null } });
  await audit("task.status", "Task", id, { status });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

async function createWarehouseActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "inventory.manage")) throw new Error("Forbidden");
  const warehouse = await db.warehouse.create({
    data: { tenantId: session.tenantId, name: z.string().min(2).parse(text(form, "name")), farmId: optional(form, "farmId") },
  });
  await audit("warehouse.create", "Warehouse", warehouse.id, { name: warehouse.name });
  revalidatePath("/inventory");
}

async function createProductActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "inventory.manage")) throw new Error("Forbidden");
  const product = await db.product.create({
    data: {
      tenantId: session.tenantId,
      name: z.string().min(2).parse(text(form, "name")),
      sku: optional(form, "sku"),
      category: z.string().min(2).parse(text(form, "category")),
      unit: z.string().min(1).parse(text(form, "unit")),
      reorderLevel: numberValue(form, "reorderLevel"),
      standardCost: numberValue(form, "standardCost"),
      sellingPrice: numberValue(form, "sellingPrice"),
    },
  });
  await audit("product.create", "Product", product.id, { name: product.name });
  revalidatePath("/inventory");
}

async function postInventoryActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "inventory.manage")) throw new Error("Forbidden");
  const warehouseId = text(form, "warehouseId");
  const productId = text(form, "productId");
  const cycleId = optional(form, "cycleId");
  const [warehouse, product, cycle] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, tenantId: session.tenantId }, select: { id: true } }),
    db.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true } }),
    cycleId ? db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve({ id: "" }),
  ]);
  if (!warehouse || !product || (cycleId && !cycle)) throw new Error("Invalid warehouse, product or production cycle");
  const type = text(form, "type") as "RECEIPT" | "ISSUE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
  if (!["RECEIPT","ISSUE","ADJUSTMENT_IN","ADJUSTMENT_OUT"].includes(type)) throw new Error("Invalid transaction type");
  const quantity = z.number().positive().parse(numberValue(form, "quantity"));
  if (type === "ISSUE" || type === "ADJUSTMENT_OUT") {
    const onHand = (await stockPositions(session.tenantId)).byLocation.get(`${warehouseId}:${productId}`) || 0;
    if (quantity > onHand + 1e-9) fail(`Only ${Math.max(0, Math.round(onHand * 1000) / 1000)} available in this store. Receive stock first or reduce the quantity.`);
  }
  const tx = await db.inventoryTransaction.create({
    data: {
      tenantId: session.tenantId, warehouseId, productId, cycleId, type,
      quantity,
      unitCost: numberValue(form, "unitCost"), lotNumber: optional(form, "lotNumber"), reference: optional(form, "reference"),
    },
  });
  await audit("inventory.post", "InventoryTransaction", tx.id, { type, productId, warehouseId });
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

async function createExpenseActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "finance.manage")) throw new Error("Forbidden");
  const status = (optional(form, "status") as ExpenseStatus) || ExpenseStatus.APPROVED;
  const accountId = status === ExpenseStatus.PAID ? optional(form, "accountId") : undefined;
  if (accountId && !(await db.moneyAccount.findFirst({ where: { id: accountId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Payment account not found");
  const expense = await db.expense.create({
    data: {
      tenantId: session.tenantId,
      farmId: optional(form, "farmId"),
      cycleId: optional(form, "cycleId"),
      category: z.string().min(2).parse(text(form, "category")),
      description: z.string().min(2).parse(text(form, "description")),
      amount: z.number().positive().parse(numberValue(form, "amount")),
      status,
      accountId,
      paidAt: status === ExpenseStatus.PAID ? dateValue(form, "incurredAt") || new Date() : undefined,
      incurredAt: dateValue(form, "incurredAt") || new Date(),
      vendor: optional(form, "vendor"),
      reference: optional(form, "reference"),
    },
  });
  await audit("expense.create", "Expense", expense.id, { amount: expense.amount.toString(), category: expense.category });
  revalidatePath("/finance");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

async function createAnimalActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "livestock.manage")) throw new Error("Forbidden");
  const farmId = text(form, "farmId");
  if (!(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  const animal = await db.animal.create({
    data: {
      tenantId: session.tenantId, farmId, unitId: optional(form, "unitId"),
      tag: z.string().min(1).parse(text(form, "tag")), species: z.string().min(2).parse(text(form, "species")),
      breed: optional(form, "breed"), sex: optional(form, "sex"), birthDate: dateValue(form, "birthDate"), notes: optional(form, "notes"),
    },
  });
  await audit("animal.create", "Animal", animal.id, { tag: animal.tag });
  revalidatePath("/livestock");
}

async function createEquipmentActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "equipment.manage")) throw new Error("Forbidden");
  const equipment = await db.equipment.create({
    data: {
      tenantId: session.tenantId,
      farmId: optional(form, "farmId"),
      name: z.string().min(2).parse(text(form, "name")),
      code: optional(form, "code"),
      category: z.string().min(2).parse(text(form, "category")),
      status: (optional(form, "status") as EquipmentStatus) || EquipmentStatus.AVAILABLE,
      purchaseDate: dateValue(form, "purchaseDate"),
      purchaseValue: numberValue(form, "purchaseValue"),
      meterReading: numberValue(form, "meterReading"),
      meterUnit: optional(form, "meterUnit"),
      nextServiceAt: numberValue(form, "nextServiceAt"),
    },
  });
  await audit("equipment.create", "Equipment", equipment.id, { name: equipment.name });
  revalidatePath("/equipment");
}

async function createInvitationActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "team.manage")) throw new Error("Forbidden");
  const email = z.string().email().parse(text(form, "email").toLowerCase());
  const role = z.nativeEnum(Role).parse(text(form, "role"));
  const token = randomBytes(24).toString("hex");
  const invitation = await db.invitation.create({
    data: { tenantId: session.tenantId, email, role, token, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  await audit("invitation.create", "Invitation", invitation.id, { email, role });
  revalidatePath("/team");
}

async function updateTenantActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "tenant.manage")) throw new Error("Forbidden");
  const name = z.string().min(2).parse(text(form, "name"));
  const currency = z.string().length(3).parse(text(form, "currency").toUpperCase());
  const timezone = z.string().min(2).parse(text(form, "timezone"));
  await db.tenant.update({ where: { id: session.tenantId }, data: { name, currency, timezone } });
  await audit("tenant.update", "Tenant", session.tenantId, { name, currency, timezone });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function createCropActivityActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "production.manage")) throw new Error("Forbidden");
  const cycleId = text(form, "cycleId");
  const cycle = await db.productionCycle.findFirst({
    where: { id: cycleId, tenantId: session.tenantId, type: CycleType.CROP },
    select: { id: true, farmId: true, unitId: true },
  });
  if (!cycle) throw new Error("Crop production cycle not found");
  const unitId = optional(form, "unitId") || cycle.unitId || undefined;
  if (unitId && !(await db.productionUnit.findFirst({ where: { id: unitId, farmId: cycle.farmId, tenantId: session.tenantId }, select: { id: true } }))) {
    throw new Error("Production unit not found");
  }
  const activity = await db.cropActivity.create({
    data: {
      tenantId: session.tenantId,
      farmId: cycle.farmId,
      unitId,
      cycleId,
      type: z.nativeEnum(CropActivityType).parse(text(form, "type")),
      title: z.string().min(2).parse(text(form, "title")),
      status: (optional(form, "status") as ActivityStatus) || ActivityStatus.PLANNED,
      plannedAt: dateValue(form, "plannedAt"),
      areaHa: numberValue(form, "areaHa"),
      notes: optional(form, "notes"),
    },
  });
  await audit("crop.activity.create", "CropActivity", activity.id, { cycleId, type: activity.type });
  revalidatePath("/crop-operations");
  revalidatePath("/production");
}

async function updateCropActivityStatusActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "production.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const status = z.nativeEnum(ActivityStatus).parse(text(form, "status"));
  const activity = await db.cropActivity.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!activity) throw new Error("Activity not found");
  await db.cropActivity.update({ where: { id }, data: { status, completedAt: status === ActivityStatus.COMPLETED ? new Date() : null } });
  await audit("crop.activity.status", "CropActivity", id, { status });
  revalidatePath("/crop-operations");
}

async function createScoutingObservationActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "production.manage")) throw new Error("Forbidden");
  const farmId = text(form, "farmId");
  const unitId = optional(form, "unitId");
  const cycleId = optional(form, "cycleId");
  if (!(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  if (unitId && !(await db.productionUnit.findFirst({ where: { id: unitId, farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Production unit not found");
  if (cycleId && !(await db.productionCycle.findFirst({ where: { id: cycleId, farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Production cycle not found");
  const observation = await db.scoutingObservation.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      unitId,
      cycleId,
      observedAt: dateValue(form, "observedAt") || new Date(),
      category: z.string().min(2).parse(text(form, "category")),
      issue: z.string().min(2).parse(text(form, "issue")),
      severity: (optional(form, "severity") as ObservationSeverity) || ObservationSeverity.MEDIUM,
      affectedAreaHa: numberValue(form, "affectedAreaHa"),
      latitude: numberValue(form, "latitude"),
      longitude: numberValue(form, "longitude"),
      recommendation: optional(form, "recommendation"),
      photoUrl: optional(form, "photoUrl"),
    },
  });
  await audit("scouting.create", "ScoutingObservation", observation.id, { severity: observation.severity, category: observation.category });
  revalidatePath("/crop-operations");
  revalidatePath("/dashboard");
}

async function resolveScoutingObservationActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "production.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const observation = await db.scoutingObservation.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!observation) throw new Error("Observation not found");
  await db.scoutingObservation.update({ where: { id }, data: { resolvedAt: new Date() } });
  await audit("scouting.resolve", "ScoutingObservation", id);
  revalidatePath("/crop-operations");
  revalidatePath("/dashboard");
}

async function createHarvestRecordActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "production.manage")) throw new Error("Forbidden");
  const cycleId = text(form, "cycleId");
  const cycle = await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId }, select: { id: true, farmId: true, unitId: true } });
  if (!cycle) throw new Error("Production cycle not found");
  const quantity = z.number().positive().parse(numberValue(form, "quantity"));
  const unit = z.string().min(1).parse(text(form, "unit"));
  const unitId = optional(form, "unitId") || cycle.unitId || undefined;
  const warehouseId = optional(form, "warehouseId");
  const productId = optional(form, "productId");
  if ((warehouseId && !productId) || (productId && !warehouseId)) throw new Error("Select both output product and warehouse to post harvested stock");

  const result = await db.$transaction(async (tx) => {
    const harvest = await tx.harvestRecord.create({
      data: {
        tenantId: session.tenantId,
        farmId: cycle.farmId,
        unitId,
        cycleId,
        quantity,
        unit,
        grade: optional(form, "grade"),
        lotNumber: optional(form, "lotNumber"),
        harvestedAt: dateValue(form, "harvestedAt") || new Date(),
        notes: optional(form, "notes"),
      },
    });
    if (warehouseId && productId) {
      const [warehouse, product] = await Promise.all([
        tx.warehouse.findFirst({ where: { id: warehouseId, tenantId: session.tenantId }, select: { id: true } }),
        tx.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true, standardCost: true } }),
      ]);
      if (!warehouse || !product) throw new Error("Invalid output warehouse or product");
      await tx.inventoryTransaction.create({
        data: {
          tenantId: session.tenantId,
          warehouseId,
          productId,
          cycleId,
          type: "PRODUCTION",
          quantity,
          unitCost: product.standardCost,
          lotNumber: optional(form, "lotNumber"),
          reference: `Harvest ${harvest.id}`,
          occurredAt: dateValue(form, "harvestedAt") || new Date(),
        },
      });
    }
    return harvest;
  });
  await audit("harvest.create", "HarvestRecord", result.id, { cycleId, quantity, unit });
  revalidatePath("/crop-operations");
  revalidatePath("/inventory");
  revalidatePath("/profitability");
}

async function createRevenueActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "finance.manage")) throw new Error("Forbidden");
  const farmId = optional(form, "farmId");
  const cycleId = optional(form, "cycleId");
  if (farmId && !(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  if (cycleId && !(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Production cycle not found");
  const revenue = await db.revenue.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      cycleId,
      type: (optional(form, "type") as RevenueType) || RevenueType.OTHER,
      description: z.string().min(2).parse(text(form, "description")),
      amount: z.number().positive().parse(numberValue(form, "amount")),
      occurredAt: dateValue(form, "occurredAt") || new Date(),
      customer: optional(form, "customer"),
      reference: optional(form, "reference"),
    },
  });
  await audit("revenue.create", "Revenue", revenue.id, { amount: revenue.amount.toString(), type: revenue.type });
  revalidatePath("/finance");
  revalidatePath("/profitability");
  revalidatePath("/dashboard");
}

async function createVendorActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "procurement.manage")) throw new Error("Forbidden");
  const vendor = await db.vendor.create({
    data: {
      tenantId: session.tenantId,
      name: z.string().min(2).parse(text(form, "name")),
      email: optional(form, "email"),
      phone: optional(form, "phone"),
      address: optional(form, "address"),
    },
  });
  await audit("vendor.create", "Vendor", vendor.id, { name: vendor.name });
  revalidatePath("/procurement");
}

async function createPurchaseRequestActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "procurement.manage")) throw new Error("Forbidden");
  const farmId = optional(form, "farmId");
  const productId = optional(form, "productId");
  if (farmId && !(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  if (productId && !(await db.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Product not found");
  const requestNo = `PR-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const request = await db.purchaseRequest.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      requestNo,
      title: z.string().min(2).parse(text(form, "title")),
      status: (optional(form, "status") as ProcurementStatus) || ProcurementStatus.SUBMITTED,
      neededBy: dateValue(form, "neededBy"),
      notes: optional(form, "notes"),
      requestedById: session.userId,
      items: {
        create: {
          tenantId: session.tenantId,
          productId,
          description: z.string().min(2).parse(text(form, "description")),
          quantity: z.number().positive().parse(numberValue(form, "quantity")),
          unit: z.string().min(1).parse(text(form, "unit")),
          estimatedUnitCost: numberValue(form, "estimatedUnitCost"),
        },
      },
    },
  });
  await audit("purchase_request.create", "PurchaseRequest", request.id, { requestNo });
  revalidatePath("/procurement");
}

async function updatePurchaseRequestStatusActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "procurement.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const status = z.nativeEnum(ProcurementStatus).parse(text(form, "status"));
  const request = await db.purchaseRequest.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } });
  if (!request) throw new Error("Purchase request not found");
  await db.purchaseRequest.update({ where: { id }, data: { status, approvedAt: status === ProcurementStatus.APPROVED ? new Date() : undefined } });
  await audit("purchase_request.status", "PurchaseRequest", id, { status });
  revalidatePath("/procurement");
}

async function createPurchaseOrderActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "procurement.manage")) throw new Error("Forbidden");
  const vendorId = text(form, "vendorId");
  const farmId = optional(form, "farmId");
  const requestId = optional(form, "requestId");
  const warehouseId = optional(form, "warehouseId");
  const productId = optional(form, "productId");
  const [vendor, farm, request, warehouse, product] = await Promise.all([
    db.vendor.findFirst({ where: { id: vendorId, tenantId: session.tenantId }, select: { id: true } }),
    farmId ? db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve({ id: "" }),
    requestId ? db.purchaseRequest.findFirst({ where: { id: requestId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve({ id: "" }),
    warehouseId ? db.warehouse.findFirst({ where: { id: warehouseId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve({ id: "" }),
    productId ? db.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true } }) : Promise.resolve({ id: "" }),
  ]);
  if (!vendor || (farmId && !farm) || (requestId && !request) || (warehouseId && !warehouse) || (productId && !product)) throw new Error("Invalid procurement reference");
  const orderNo = `PO-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const po = await db.purchaseOrder.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      vendorId,
      requestId,
      warehouseId,
      orderNo,
      status: (optional(form, "status") as PurchaseOrderStatus) || PurchaseOrderStatus.ORDERED,
      orderDate: dateValue(form, "orderDate") || new Date(),
      expectedAt: dateValue(form, "expectedAt"),
      notes: optional(form, "notes"),
      items: {
        create: {
          tenantId: session.tenantId,
          productId,
          description: z.string().min(2).parse(text(form, "description")),
          quantity: z.number().positive().parse(numberValue(form, "quantity")),
          unit: z.string().min(1).parse(text(form, "unit")),
          unitPrice: z.number().nonnegative().parse(numberValue(form, "unitPrice") || 0),
        },
      },
    },
    include: { items: true },
  });
  if (requestId) await db.purchaseRequest.update({ where: { id: requestId }, data: { status: ProcurementStatus.ORDERED } });
  await audit("purchase_order.create", "PurchaseOrder", po.id, { orderNo, vendorId });
  revalidatePath("/procurement");
}

async function receivePurchaseOrderActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "procurement.manage") || !can(membership.role, "inventory.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const po = await db.purchaseOrder.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { items: true },
  });
  if (!po || !po.warehouseId) throw new Error("Purchase order or destination warehouse not found");
  const receivable = po.items.filter((item) => item.productId && Number(item.receivedQty) < Number(item.quantity));
  if (!receivable.length) throw new Error("No product-linked outstanding quantities to receive");
  await db.$transaction(async (tx) => {
    for (const item of receivable) {
      const outstanding = Number(item.quantity) - Number(item.receivedQty);
      await tx.inventoryTransaction.create({
        data: {
          tenantId: session.tenantId,
          warehouseId: po.warehouseId!,
          productId: item.productId!,
          type: "PURCHASE",
          quantity: outstanding,
          unitCost: item.unitPrice,
          reference: po.orderNo,
          occurredAt: new Date(),
        },
      });
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: item.quantity } });
    }
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: PurchaseOrderStatus.RECEIVED } });
  });
  await audit("purchase_order.receive", "PurchaseOrder", po.id, { orderNo: po.orderNo });
  revalidatePath("/procurement");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}

async function createAnimalHealthEventActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "livestock.manage")) throw new Error("Forbidden");
  const animalId = text(form, "animalId");
  if (!(await db.animal.findFirst({ where: { id: animalId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Animal not found");
  const event = await db.animalHealthEvent.create({
    data: {
      tenantId: session.tenantId,
      animalId,
      type: z.nativeEnum(LivestockEventType).parse(text(form, "type")),
      eventDate: dateValue(form, "eventDate") || new Date(),
      title: z.string().min(2).parse(text(form, "title")),
      details: optional(form, "details"),
      weightKg: numberValue(form, "weightKg"),
      medication: optional(form, "medication"),
      dosage: optional(form, "dosage"),
      veterinarian: optional(form, "veterinarian"),
      nextDueAt: dateValue(form, "nextDueAt"),
    },
  });
  await audit("animal.health_event.create", "AnimalHealthEvent", event.id, { animalId, type: event.type });
  revalidatePath("/livestock");
}

async function createPoultryDailyRecordActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "livestock.manage")) throw new Error("Forbidden");
  const cycleId = text(form, "cycleId");
  if (!(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId, type: CycleType.POULTRY }, select: { id: true } }))) throw new Error("Poultry cycle not found");
  const record = await db.poultryDailyRecord.create({
    data: {
      tenantId: session.tenantId,
      cycleId,
      recordDate: dateValue(form, "recordDate") || new Date(),
      openingBirds: integerValue(form, "openingBirds"),
      mortality: integerValue(form, "mortality") || 0,
      culls: integerValue(form, "culls") || 0,
      feedKg: numberValue(form, "feedKg"),
      waterLiters: numberValue(form, "waterLiters"),
      eggs: integerValue(form, "eggs"),
      avgWeightKg: numberValue(form, "avgWeightKg"),
      notes: optional(form, "notes"),
    },
  });
  await audit("poultry.daily.create", "PoultryDailyRecord", record.id, { cycleId });
  revalidatePath("/poultry");
}

async function createAquacultureRecordActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "livestock.manage")) throw new Error("Forbidden");
  const cycleId = text(form, "cycleId");
  if (!(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId, type: CycleType.AQUACULTURE }, select: { id: true } }))) throw new Error("Aquaculture cycle not found");
  const record = await db.aquacultureRecord.create({
    data: {
      tenantId: session.tenantId,
      cycleId,
      recordDate: dateValue(form, "recordDate") || new Date(),
      sampleSize: integerValue(form, "sampleSize"),
      avgWeightG: numberValue(form, "avgWeightG"),
      mortality: integerValue(form, "mortality") || 0,
      feedKg: numberValue(form, "feedKg"),
      ph: numberValue(form, "ph"),
      dissolvedOxygen: numberValue(form, "dissolvedOxygen"),
      temperatureC: numberValue(form, "temperatureC"),
      notes: optional(form, "notes"),
    },
  });
  await audit("aquaculture.record.create", "AquacultureRecord", record.id, { cycleId });
  revalidatePath("/aquaculture");
}

async function createWorkforceMemberActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "workforce.manage")) throw new Error("Forbidden");
  const farmId = optional(form, "farmId");
  if (farmId && !(await db.farm.findFirst({ where: { id: farmId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Farm not found");
  const worker = await db.workforceMember.create({
    data: {
      tenantId: session.tenantId,
      farmId,
      employeeNo: optional(form, "employeeNo"),
      name: z.string().min(2).parse(text(form, "name")),
      phone: optional(form, "phone"),
      jobTitle: optional(form, "jobTitle"),
      employmentType: (optional(form, "employmentType") as EmploymentType) || EmploymentType.PERMANENT,
      defaultHourlyRate: numberValue(form, "defaultHourlyRate"),
      payBasis: z.nativeEnum(PayBasis).parse(text(form, "payBasis") || "DAILY"),
      dailyRate: numberValue(form, "dailyRate"),
      monthlySalary: numberValue(form, "monthlySalary"),
      pieceRate: numberValue(form, "pieceRate"),
      pieceUnit: optional(form, "pieceUnit"),
      paymentMethod: optional(form, "paymentMethod") ? z.nativeEnum(PaymentMethod).parse(text(form, "paymentMethod")) : undefined,
      paymentAccount: optional(form, "paymentAccount"),
      startDate: dateValue(form, "startDate"),
    },
  });
  await audit("workforce.member.create", "WorkforceMember", worker.id, { name: worker.name });
  revalidatePath("/workforce");
}

async function createTimesheetActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "workforce.manage")) throw new Error("Forbidden");
  const workerId = text(form, "workerId");
  const worker = await db.workforceMember.findFirst({ where: { id: workerId, tenantId: session.tenantId }, select: { id: true, defaultHourlyRate: true, farmId: true, payBasis: true, dailyRate: true, pieceRate: true } });
  if (!worker) throw new Error("Worker not found");
  const farmId = optional(form, "farmId") || worker.farmId || undefined;
  const cycleId = optional(form, "cycleId");
  if (cycleId && !(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Production cycle not found");
  const hourlyRate = numberValue(form, "hourlyRate") ?? Number(worker.defaultHourlyRate || 0);
  const pieceQuantity = numberValue(form, "pieceQuantity");
  // Daily-rated and piece-rate workers are costed by the day / unit rather than by the hour.
  const amount = numberValue(form, "amount")
    ?? (worker.payBasis === "DAILY" && worker.dailyRate != null && numberValue(form, "hourlyRate") == null ? Math.round(Number(worker.dailyRate) * (numberValue(form, "hours") || 8) / 8 * 100) / 100 : undefined)
    ?? (worker.payBasis === "PIECE_RATE" && worker.pieceRate != null && pieceQuantity != null ? Number(worker.pieceRate) * pieceQuantity : undefined);
  const timesheet = await db.timesheet.create({
    data: {
      tenantId: session.tenantId,
      workerId,
      farmId,
      cycleId,
      workDate: dateValue(form, "workDate") || new Date(),
      hours: z.number().positive().parse(numberValue(form, "hours")),
      hourlyRate: z.number().nonnegative().parse(hourlyRate),
      activity: z.string().min(2).parse(text(form, "activity")),
      amount,
      pieceQuantity,
      status: (optional(form, "status") as TimesheetStatus) || TimesheetStatus.SUBMITTED,
      notes: optional(form, "notes"),
    },
  });
  await audit("timesheet.create", "Timesheet", timesheet.id, { workerId, hours: timesheet.hours.toString() });
  revalidatePath("/workforce");
  revalidatePath("/profitability");
}

async function updateTimesheetStatusActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "workforce.manage")) throw new Error("Forbidden");
  const id = text(form, "id");
  const status = z.nativeEnum(TimesheetStatus).parse(text(form, "status"));
  if (!(await db.timesheet.findFirst({ where: { id, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Timesheet not found");
  await db.timesheet.update({ where: { id }, data: { status } });
  await audit("timesheet.status", "Timesheet", id, { status });
  revalidatePath("/workforce");
  revalidatePath("/profitability");
}

async function createEquipmentLogActionImpl(form: FormData) {
  const { session, membership } = await requireSession();
  if (!can(membership.role, "equipment.manage")) throw new Error("Forbidden");
  const equipmentId = text(form, "equipmentId");
  const equipment = await db.equipment.findFirst({ where: { id: equipmentId, tenantId: session.tenantId }, select: { id: true, farmId: true } });
  if (!equipment) throw new Error("Equipment not found");
  const farmId = optional(form, "farmId") || equipment.farmId || undefined;
  const cycleId = optional(form, "cycleId");
  if (cycleId && !(await db.productionCycle.findFirst({ where: { id: cycleId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error("Production cycle not found");
  const meterReading = numberValue(form, "meterReading");
  const log = await db.$transaction(async (tx) => {
    const created = await tx.equipmentLog.create({
      data: {
        tenantId: session.tenantId,
        equipmentId,
        farmId,
        cycleId,
        type: z.nativeEnum(EquipmentLogType).parse(text(form, "type")),
        logDate: dateValue(form, "logDate") || new Date(),
        hours: numberValue(form, "hours"),
        fuelLiters: numberValue(form, "fuelLiters"),
        cost: numberValue(form, "cost"),
        meterReading,
        notes: optional(form, "notes"),
      },
    });
    if (meterReading != null) await tx.equipment.update({ where: { id: equipmentId }, data: { meterReading } });
    return created;
  });
  await audit("equipment.log.create", "EquipmentLog", log.id, { equipmentId, type: log.type });
  revalidatePath("/equipment");
  revalidatePath("/profitability");
}

export async function acceptInvitationAction(form: FormData) {
  const token = text(form, "token");
  const password = z.string().min(10).parse(text(form, "password"));
  const invitation = await db.invitation.findUnique({ where: { token }, include: { tenant: true } });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date()) redirect(`/invite/${token}?error=expired`);

  let user = await db.user.findUnique({ where: { email: invitation.email } });
  if (user) {
    if (!(await bcrypt.compare(password, user.passwordHash))) redirect(`/invite/${token}?error=password`);
  } else {
    const name = z.string().min(2).parse(text(form, "name"));
    user = await db.user.create({
      data: {
        name,
        email: invitation.email,
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
  }

  const membership = await db.$transaction(async (tx) => {
    const member = await tx.membership.upsert({
      where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user!.id } },
      update: { role: invitation.role },
      create: { tenantId: invitation.tenantId, userId: user!.id, role: invitation.role },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
    await tx.auditLog.create({
      data: {
        tenantId: invitation.tenantId,
        userId: user!.id,
        action: "invitation.accept",
        entityType: "Invitation",
        entityId: invitation.id,
        metadata: { email: invitation.email, role: invitation.role },
      },
    });
    return member;
  });

  await createSession({ userId: user.id, tenantId: invitation.tenantId, role: membership.role });
  redirect("/dashboard");
}


// Public actions return { ok, error } so forms can show a readable message instead of a crashed page.

export async function createFarmAction(form: FormData) {
  return attempt(async () => { await createFarmActionImpl(form); });
}

export async function createUnitAction(form: FormData) {
  return attempt(async () => { await createUnitActionImpl(form); });
}

export async function createCycleAction(form: FormData) {
  return attempt(async () => { await createCycleActionImpl(form); });
}

export async function createTaskAction(form: FormData) {
  return attempt(async () => { await createTaskActionImpl(form); });
}

export async function updateTaskStatusAction(form: FormData) {
  return attempt(async () => { await updateTaskStatusActionImpl(form); });
}

export async function createWarehouseAction(form: FormData) {
  return attempt(async () => { await createWarehouseActionImpl(form); });
}

export async function createProductAction(form: FormData) {
  return attempt(async () => { await createProductActionImpl(form); });
}

export async function postInventoryAction(form: FormData) {
  return attempt(async () => { await postInventoryActionImpl(form); });
}

export async function createExpenseAction(form: FormData) {
  return attempt(async () => { await createExpenseActionImpl(form); });
}

export async function createAnimalAction(form: FormData) {
  return attempt(async () => { await createAnimalActionImpl(form); });
}

export async function createEquipmentAction(form: FormData) {
  return attempt(async () => { await createEquipmentActionImpl(form); });
}

export async function createInvitationAction(form: FormData) {
  return attempt(async () => { await createInvitationActionImpl(form); });
}

export async function updateTenantAction(form: FormData) {
  return attempt(async () => { await updateTenantActionImpl(form); });
}

export async function createCropActivityAction(form: FormData) {
  return attempt(async () => { await createCropActivityActionImpl(form); });
}

export async function updateCropActivityStatusAction(form: FormData) {
  return attempt(async () => { await updateCropActivityStatusActionImpl(form); });
}

export async function createScoutingObservationAction(form: FormData) {
  return attempt(async () => { await createScoutingObservationActionImpl(form); });
}

export async function resolveScoutingObservationAction(form: FormData) {
  return attempt(async () => { await resolveScoutingObservationActionImpl(form); });
}

export async function createHarvestRecordAction(form: FormData) {
  return attempt(async () => { await createHarvestRecordActionImpl(form); });
}

export async function createRevenueAction(form: FormData) {
  return attempt(async () => { await createRevenueActionImpl(form); });
}

export async function createVendorAction(form: FormData) {
  return attempt(async () => { await createVendorActionImpl(form); });
}

export async function createPurchaseRequestAction(form: FormData) {
  return attempt(async () => { await createPurchaseRequestActionImpl(form); });
}

export async function updatePurchaseRequestStatusAction(form: FormData) {
  return attempt(async () => { await updatePurchaseRequestStatusActionImpl(form); });
}

export async function createPurchaseOrderAction(form: FormData) {
  return attempt(async () => { await createPurchaseOrderActionImpl(form); });
}

export async function receivePurchaseOrderAction(form: FormData) {
  return attempt(async () => { await receivePurchaseOrderActionImpl(form); });
}

export async function createAnimalHealthEventAction(form: FormData) {
  return attempt(async () => { await createAnimalHealthEventActionImpl(form); });
}

export async function createPoultryDailyRecordAction(form: FormData) {
  return attempt(async () => { await createPoultryDailyRecordActionImpl(form); });
}

export async function createAquacultureRecordAction(form: FormData) {
  return attempt(async () => { await createAquacultureRecordActionImpl(form); });
}

export async function createWorkforceMemberAction(form: FormData) {
  return attempt(async () => { await createWorkforceMemberActionImpl(form); });
}

export async function createTimesheetAction(form: FormData) {
  return attempt(async () => { await createTimesheetActionImpl(form); });
}

export async function updateTimesheetStatusAction(form: FormData) {
  return attempt(async () => { await updateTimesheetStatusActionImpl(form); });
}

export async function createEquipmentLogAction(form: FormData) {
  return attempt(async () => { await createEquipmentLogActionImpl(form); });
}
