import "server-only";

import { db } from "@/lib/db";
import { farmIdWhere, farmWhere, relatedFarmWhere, type FarmScope } from "@/lib/farm-scope";
import { labourCost } from "@/lib/ledger";

/**
 * Report calculations shared by the report pages and their CSV downloads, so a download always matches the screen.
 * Every function takes the member's farm scope; an empty scope means the whole organisation.
 */
export type ReportRange = { from?: Date; to?: Date };

const within = (range: ReportRange) => (range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } : undefined);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** Approved and paid spending; drafts, submissions and rejected items are not money spent yet. */
const SPENT = ["APPROVED", "PAID"] as const;

export type MonthRow = { month: string; income: number; spending: number; profit: number; cashCollected: number };

/** Income, approved spending and cash collected per calendar month. With a range, every month in it is listed. */
export async function monthlyProfitAndLoss(tenantId: string, scope: FarmScope, range: ReportRange = {}): Promise<MonthRow[]> {
  const [revenues, expenses, payments] = await Promise.all([
    db.revenue.findMany({ where: { tenantId, ...farmWhere(scope), occurredAt: within(range) }, select: { occurredAt: true, amount: true } }),
    db.expense.findMany({ where: { tenantId, ...farmWhere(scope), status: { in: [...SPENT] }, incurredAt: within(range) }, select: { incurredAt: true, amount: true } }),
    db.paymentReceived.findMany({ where: { tenantId, ...relatedFarmWhere(scope, "invoice"), receivedAt: within(range) }, select: { receivedAt: true, amount: true } }),
  ]);
  const rows = new Map<string, MonthRow>();
  const row = (key: string) => rows.get(key) ?? rows.set(key, { month: key, income: 0, spending: 0, profit: 0, cashCollected: 0 }).get(key)!;
  if (range.from && range.to) {
    for (let d = new Date(range.from.getFullYear(), range.from.getMonth(), 1); d <= range.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) row(monthKey(d));
  }
  revenues.forEach(r => { row(monthKey(r.occurredAt)).income += Number(r.amount); });
  expenses.forEach(e => { row(monthKey(e.incurredAt)).spending += Number(e.amount); });
  payments.forEach(p => { row(monthKey(p.receivedAt)).cashCollected += Number(p.amount); });
  return [...rows.values()].map(r => ({ ...r, profit: r.income - r.spending })).sort((a, b) => a.month.localeCompare(b.month));
}

export type ProductSalesRow = { product: string; unit: string; quantity: number; value: number; invoices: number };

/** Invoiced sales (void invoices excluded) by product and unit, largest value first. */
export async function salesByProduct(tenantId: string, scope: FarmScope, range: ReportRange = {}): Promise<ProductSalesRow[]> {
  const lines = await db.invoiceItem.findMany({
    where: { tenantId, invoice: { status: { not: "VOID" }, issueDate: within(range), ...farmWhere(scope) } },
    select: { description: true, quantity: true, unit: true, lineTotal: true, invoiceId: true, product: { select: { name: true } } },
  });
  // Keyed by product and unit so crates and kilograms of the same product are never added together.
  const rows = new Map<string, ProductSalesRow & { ids: Set<string> }>();
  for (const l of lines) {
    const product = l.product?.name || l.description;
    const key = `${product}\u0000${l.unit}`;
    const r = rows.get(key) ?? rows.set(key, { product, unit: l.unit, quantity: 0, value: 0, invoices: 0, ids: new Set() }).get(key)!;
    r.quantity += Number(l.quantity);
    r.value += Number(l.lineTotal);
    r.ids.add(l.invoiceId);
  }
  return [...rows.values()].map(({ ids, ...r }) => ({ ...r, invoices: ids.size })).sort((a, b) => b.value - a.value);
}

export type CustomerSalesRow = { customer: string; invoices: number; value: number };

/** Invoiced sales (void invoices excluded) by customer, largest first. */
export async function salesByCustomer(tenantId: string, scope: FarmScope, range: ReportRange = {}): Promise<CustomerSalesRow[]> {
  const invoices = await db.invoice.findMany({
    where: { tenantId, status: { not: "VOID" }, issueDate: within(range), ...farmWhere(scope) },
    select: { customerId: true, customer: { select: { name: true } }, items: { select: { lineTotal: true } } },
  });
  const rows = new Map<string, CustomerSalesRow>();
  for (const i of invoices) {
    const r = rows.get(i.customerId) ?? rows.set(i.customerId, { customer: i.customer.name, invoices: 0, value: 0 }).get(i.customerId)!;
    r.invoices += 1;
    r.value += i.items.reduce((s, l) => s + Number(l.lineTotal), 0);
  }
  return [...rows.values()].filter(r => r.value).sort((a, b) => b.value - a.value);
}

export type CategorySpendRow = { category: string; transactions: number; amount: number; share: number };

/** Approved and paid spending by category, largest first, with each category's share of the total. */
export async function spendingByCategory(tenantId: string, scope: FarmScope, range: ReportRange = {}): Promise<CategorySpendRow[]> {
  const groups = await db.expense.groupBy({
    by: ["category"],
    where: { tenantId, ...farmWhere(scope), status: { in: [...SPENT] }, incurredAt: within(range) },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const total = groups.reduce((s, g) => s + Number(g._sum.amount || 0), 0);
  return groups
    .map(g => ({ category: g.category, transactions: g._count._all, amount: Number(g._sum.amount || 0), share: total ? Number(g._sum.amount || 0) / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export type CycleProfitRow = {
  id: string; cycle: string; commodity: string; type: string; status: string; farm: string; unit: string | null;
  direct: number; inputs: number; labour: number; equipment: number; cost: number; revenue: number; margin: number;
  budget: number; output: number; outputUnit: string | null;
};

/** Full cost (approved expenses, issued inputs, approved labour, equipment) against revenue for every cycle. */
export async function cycleProfitability(tenantId: string, scope: FarmScope): Promise<CycleProfitRow[]> {
  const cycles = await db.productionCycle.findMany({
    where: { tenantId, ...farmWhere(scope) },
    include: { farm: true, unit: true, expenses: true, revenues: true, harvestRecords: true, timesheets: true, equipmentLogs: true, inventoryTxns: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
  return cycles.map(c => {
    const direct = c.expenses.filter(e => (SPENT as readonly string[]).includes(e.status)).reduce((s, e) => s + Number(e.amount), 0);
    const inputs = c.inventoryTxns.filter(t => ["ISSUE", "ADJUSTMENT_OUT", "WASTE"].includes(t.type)).reduce((s, t) => s + Number(t.quantity) * Number(t.unitCost || t.product.standardCost || 0), 0);
    const labour = c.timesheets.filter(t => t.status === "APPROVED").reduce((s, t) => s + labourCost(t), 0);
    const equipment = c.equipmentLogs.reduce((s, l) => s + Number(l.cost || 0), 0);
    const cost = direct + inputs + labour + equipment;
    const revenue = c.revenues.reduce((s, r) => s + Number(r.amount), 0);
    const units = [...new Set(c.harvestRecords.map(h => h.unit))];
    // Output is only comparable when every harvest was recorded in the same unit.
    const output = units.length === 1 ? c.harvestRecords.reduce((s, h) => s + Number(h.quantity), 0) : 0;
    return {
      id: c.id, cycle: c.name, commodity: c.commodity, type: c.type, status: c.status, farm: c.farm.name, unit: c.unit?.name ?? null,
      direct, inputs, labour, equipment, cost, revenue, margin: revenue - cost,
      budget: Number(c.budgetAmount || 0), output, outputUnit: units.length === 1 ? units[0] : null,
    };
  });
}

export type FarmActivityRow = { id: string; farm: string; cycles: number; units: number };

/** Production cycles and units per active farm. */
export async function farmActivity(tenantId: string, scope: FarmScope): Promise<FarmActivityRow[]> {
  const farms = await db.farm.findMany({ where: { tenantId, active: true, ...farmIdWhere(scope) }, include: { _count: { select: { cycles: true, units: true } } }, orderBy: { name: "asc" } });
  return farms.map(f => ({ id: f.id, farm: f.name, cycles: f._count.cycles, units: f._count.units }));
}

export type CycleCostRow = { id: string; cycle: string; commodity: string; recordedCost: number; budget: number };

/** Every expense recorded against each cycle, compared with its budget, highest cost first. */
export async function cycleCostPosition(tenantId: string, scope: FarmScope): Promise<CycleCostRow[]> {
  const cycles = await db.productionCycle.findMany({ where: { tenantId, ...farmWhere(scope) }, include: { expenses: { select: { amount: true } } } });
  return cycles
    .map(c => ({ id: c.id, cycle: c.name, commodity: c.commodity, recordedCost: c.expenses.reduce((s, e) => s + Number(e.amount), 0), budget: Number(c.budgetAmount || 0) }))
    .sort((a, b) => b.recordedCost - a.recordedCost);
}
