/**
 * Seeds a realistic demo organisation (a mixed poultry, crop and fish farm in Ogun State, Nigeria) so a new
 * environment can be explored immediately. Safe to re-run: it does nothing if the demo owner already exists.
 *
 *   npm run db:seed
 *
 * Demo logins (override with DEMO_OWNER_EMAIL / DEMO_PASSWORD):
 *   owner       demo.owner@farmhq.test
 *   supervisor  demo.supervisor@farmhq.test   (Field supervisor: attendance & tasks)
 *   password    FarmHQ-demo-2026
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL || "demo.owner@farmhq.test";
const SUPERVISOR_EMAIL = "demo.supervisor@farmhq.test";
const PASSWORD = process.env.DEMO_PASSWORD || "FarmHQ-demo-2026";

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d; };

async function main() {
  if (await db.user.findUnique({ where: { email: OWNER_EMAIL } })) {
    console.log(`Demo data already present (${OWNER_EMAIL}). Nothing to do.`);
    return;
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const tenant = await db.tenant.create({ data: { name: "Sunrise Agro Farms Ltd", slug: `sunrise-agro-${Date.now().toString(36)}`, currency: "NGN", timezone: "Africa/Lagos" } });
  const t = tenant.id;
  const owner = await db.user.create({ data: { name: "Adaeze Okafor", email: OWNER_EMAIL, phone: "+2348030000001", passwordHash } });
  const supervisor = await db.user.create({ data: { name: "Musa Bello", email: SUPERVISOR_EMAIL, phone: "+2348030000002", passwordHash } });
  await db.membership.createMany({ data: [{ tenantId: t, userId: owner.id, role: "OWNER" }, { tenantId: t, userId: supervisor.id, role: "FIELD_SUPERVISOR" }] });

  const farm = await db.farm.create({ data: { tenantId: t, name: "Sunrise Farm, Ewekoro", code: "SUN-01", type: "MIXED", country: "Nigeria", state: "Ogun", address: "Km 4 Itori–Ewekoro Road", latitude: 6.9317, longitude: 3.2108, areaHa: 24 } });
  const [field, layerHouse, pond] = await Promise.all([
    db.productionUnit.create({ data: { tenantId: t, farmId: farm.id, name: "North Field", type: "FIELD", areaHa: 8 } }),
    db.productionUnit.create({ data: { tenantId: t, farmId: farm.id, name: "Layer House 1", type: "POULTRY_HOUSE" } }),
    db.productionUnit.create({ data: { tenantId: t, farmId: farm.id, name: "Fish Pond A", type: "POND", areaHa: 0.2 } }),
  ]);
  const [maize, layers, catfish] = await Promise.all([
    db.productionCycle.create({ data: { tenantId: t, farmId: farm.id, unitId: field.id, name: "Maize, 2026 late season", type: "CROP", commodity: "Maize", variety: "SAMMAZ 52", status: "ACTIVE", startDate: daysAgo(70), expectedEndDate: daysAgo(-40), targetQuantity: 32, targetUnit: "tonne", budgetAmount: 4_800_000 } }),
    db.productionCycle.create({ data: { tenantId: t, farmId: farm.id, unitId: layerHouse.id, name: "Layers batch 2026-A (2,000 birds)", type: "POULTRY", commodity: "Eggs", variety: "Isa Brown", status: "ACTIVE", startDate: daysAgo(160), budgetAmount: 9_500_000 } }),
    db.productionCycle.create({ data: { tenantId: t, farmId: farm.id, unitId: pond.id, name: "Catfish pond A, cycle 3", type: "AQUACULTURE", commodity: "Catfish", status: "ACTIVE", startDate: daysAgo(90), expectedEndDate: daysAgo(-30), budgetAmount: 2_100_000 } }),
  ]);

  const store = await db.warehouse.create({ data: { tenantId: t, farmId: farm.id, name: "Main Store" } });
  const coldRoom = await db.warehouse.create({ data: { tenantId: t, farmId: farm.id, name: "Egg Room" } });
  const product = (name: string, category: string, unit: string, standardCost: number, sellingPrice: number | null, reorderLevel: number | null) =>
    db.product.create({ data: { tenantId: t, name, category, unit, standardCost, sellingPrice, reorderLevel } });
  const [eggs, maizeGrain, layerFeed, npk, fish] = await Promise.all([
    product("Eggs (crate of 30)", "Produce", "crate", 3200, 4800, 40),
    product("Maize grain (100kg bag)", "Produce", "bag", 38000, 52000, null),
    product("Layer mash (25kg bag)", "Feed", "bag", 14500, null, 30),
    product("NPK 15-15-15 (50kg bag)", "Fertilizer", "bag", 42000, null, 10),
    product("Live catfish", "Produce", "kg", 1800, 2800, null),
  ]);
  await db.inventoryTransaction.createMany({ data: [
    { tenantId: t, warehouseId: coldRoom.id, productId: eggs.id, cycleId: layers.id, type: "PRODUCTION", quantity: 180, unitCost: 3200, reference: "Opening egg stock", occurredAt: daysAgo(3) },
    { tenantId: t, warehouseId: store.id, productId: maizeGrain.id, type: "OPENING", quantity: 45, unitCost: 38000, reference: "Opening balance", occurredAt: daysAgo(30) },
    { tenantId: t, warehouseId: store.id, productId: layerFeed.id, type: "PURCHASE", quantity: 60, unitCost: 14500, reference: "Opening balance", occurredAt: daysAgo(20) },
    { tenantId: t, warehouseId: store.id, productId: layerFeed.id, cycleId: layers.id, type: "ISSUE", quantity: 34, unitCost: 14500, reference: "Feed issued to Layer House 1", occurredAt: daysAgo(5) },
    { tenantId: t, warehouseId: store.id, productId: npk.id, type: "PURCHASE", quantity: 20, unitCost: 42000, occurredAt: daysAgo(60) },
    { tenantId: t, warehouseId: store.id, productId: npk.id, cycleId: maize.id, type: "ISSUE", quantity: 16, unitCost: 42000, reference: "Top dressing, North Field", occurredAt: daysAgo(40) },
    { tenantId: t, warehouseId: store.id, productId: fish.id, cycleId: catfish.id, type: "PRODUCTION", quantity: 120, unitCost: 1800, reference: "Partial harvest", occurredAt: daysAgo(2) },
  ] });

  await db.moneyAccount.createMany({ data: [
    { tenantId: t, name: "Farm cash box", type: "CASH", openingBalance: 185_000 },
    { tenantId: t, name: "GTBank current", type: "BANK", provider: "Guaranty Trust Bank", accountNumber: "0123456789", openingBalance: 2_450_000 },
    { tenantId: t, name: "MTN MoMo wallet", type: "MOBILE_MONEY", provider: "MTN MoMo PSB", accountNumber: "08030000001", openingBalance: 96_000 },
  ] });

  await db.customer.createMany({ data: [
    { tenantId: t, name: "Mama Tola Eggs (Kuto market)", phone: "+2348051112233", address: "Kuto Market, Abeokuta", paymentTermsDays: 7, creditLimit: 300_000 },
    { tenantId: t, name: "Golden Crust Bakery", phone: "+2348092223344", email: "orders@goldencrust.test", address: "Oke-Ilewo, Abeokuta", paymentTermsDays: 14, creditLimit: 800_000 },
    { tenantId: t, name: "Ogun Feed Millers", phone: "+2347013334455", address: "Sango-Ota", paymentTermsDays: 30 },
  ] });
  await db.vendor.createMany({ data: [
    { tenantId: t, name: "Agro-Allied Inputs Ltd", phone: "+2348024445566" },
    { tenantId: t, name: "Vital Feeds Distributor", phone: "+2348065556677" },
  ] });

  const workers = await Promise.all([
    db.workforceMember.create({ data: { tenantId: t, farmId: farm.id, name: "Chinedu Eze", jobTitle: "Farm manager", employmentType: "PERMANENT", payBasis: "MONTHLY", monthlySalary: 250_000, paymentMethod: "BANK_TRANSFER", paymentAccount: "Access 0098765432", phone: "+2348031230001" } }),
    db.workforceMember.create({ data: { tenantId: t, farmId: farm.id, name: "Bisi Adeyemi", jobTitle: "Poultry attendant", employmentType: "PERMANENT", payBasis: "MONTHLY", monthlySalary: 85_000, paymentMethod: "MOBILE_MONEY", paymentAccount: "08031230002", phone: "+2348031230002" } }),
    db.workforceMember.create({ data: { tenantId: t, farmId: farm.id, name: "Ibrahim Sani", jobTitle: "Farmhand", employmentType: "TEMPORARY", payBasis: "DAILY", dailyRate: 4000, paymentMethod: "CASH", phone: "+2348031230003" } }),
    db.workforceMember.create({ data: { tenantId: t, farmId: farm.id, name: "Grace Johnson", jobTitle: "Farmhand", employmentType: "SEASONAL", payBasis: "DAILY", dailyRate: 4000, paymentMethod: "MOBILE_MONEY", paymentAccount: "08031230004", phone: "+2348031230004" } }),
    db.workforceMember.create({ data: { tenantId: t, farmId: farm.id, name: "Emeka Obi", jobTitle: "Harvester", employmentType: "SEASONAL", payBasis: "PIECE_RATE", pieceRate: 350, pieceUnit: "bag", paymentMethod: "CASH", phone: "+2348031230005" } }),
  ]);
  const [, , ibrahim, grace] = workers;
  for (const d of [6, 5, 4, 3]) {
    for (const w of [ibrahim, grace]) {
      await db.timesheet.create({ data: { tenantId: t, workerId: w.id, farmId: farm.id, cycleId: maize.id, workDate: daysAgo(d), hours: 8, hourlyRate: 500, amount: 4000, activity: "Weeding, North Field", status: "APPROVED" } });
    }
  }
  await db.timesheet.create({ data: { tenantId: t, workerId: ibrahim.id, farmId: farm.id, cycleId: layers.id, workDate: daysAgo(1), hours: 8, hourlyRate: 500, amount: 4000, activity: "Pen cleaning", status: "SUBMITTED" } });

  await db.expense.createMany({ data: [
    { tenantId: t, farmId: farm.id, cycleId: layers.id, category: "Veterinary", description: "Newcastle vaccine (Lasota) & vitamins", amount: 68_000, status: "PAID", incurredAt: daysAgo(12), paidAt: daysAgo(12), vendor: "Vet Pharm Abeokuta" },
    { tenantId: t, farmId: farm.id, category: "Fuel", description: "Diesel for generator (100 L)", amount: 118_000, status: "APPROVED", incurredAt: daysAgo(4), vendor: "NNPC Ewekoro" },
    { tenantId: t, farmId: farm.id, cycleId: catfish.id, category: "Feed", description: "Floating fish feed 6mm, 10 bags", amount: 245_000, status: "SUBMITTED", incurredAt: daysAgo(2), vendor: "Vital Feeds Distributor" },
  ] });
  for (let d = 6; d >= 1; d--) {
    await db.poultryDailyRecord.create({ data: { tenantId: t, cycleId: layers.id, recordDate: daysAgo(d), openingBirds: 1960 - (6 - d) * 2, mortality: d % 3 === 0 ? 3 : 1, culls: 0, feedKg: 230, waterLiters: 460, eggs: 1640 + d * 7 } });
  }
  await db.task.createMany({ data: [
    { tenantId: t, farmId: farm.id, cycleId: maize.id, title: "Scout North Field for fall armyworm", priority: "HIGH", dueAt: daysAgo(-1), createdById: owner.id, assignedToId: supervisor.id },
    { tenantId: t, farmId: farm.id, cycleId: layers.id, title: "Order 40 bags of layer mash", priority: "URGENT", dueAt: daysAgo(0), createdById: owner.id, assignedToId: owner.id },
    { tenantId: t, farmId: farm.id, title: "Service borehole pump", priority: "MEDIUM", dueAt: daysAgo(-5), createdById: owner.id },
  ] });

  console.log(`Demo organisation "${tenant.name}" created. Sign in as ${OWNER_EMAIL} (owner) or ${SUPERVISOR_EMAIL} (supervisor).`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
