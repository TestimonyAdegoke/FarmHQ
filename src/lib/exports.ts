import "server-only";

import { db } from "@/lib/db";
import { farmWhere, relatedFarmWhere, type FarmScope } from "@/lib/farm-scope";
import { invoiceBalance, invoiceDisplayStatus, labourCost, stockPositions } from "@/lib/ledger";
import type { Permission } from "@/lib/permissions";
import { cycleCostPosition, cycleProfitability, farmActivity, monthlyProfitAndLoss, salesByCustomer, salesByProduct, spendingByCategory } from "@/lib/reports";

type Range = { from?: Date; to?: Date };
type Row = Record<string, string | number | null | undefined>;

const d = (value?: Date | null) => (value ? value.toISOString().slice(0, 10) : "");
const n = (value: unknown) => (value == null ? "" : Number(value));
const money = (value: number) => Math.round(value * 100) / 100;
const pct = (ratio: number) => Math.round(ratio * 1000) / 10;
const between = (range: Range) => (range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } : undefined);

// Loaders receive the member's farm scope; `organisationWide` datasets are not available to farm-scoped members.
export type Dataset = { label: string; description: string; permission: Permission; organisationWide?: boolean; /** Summaries that mirror a report page, rather than raw records. */ kind?: "report"; load: (tenantId: string, range: Range, scope: FarmScope) => Promise<Row[]> };

export const datasets: Record<string, Dataset> = {
  invoices: {
    label: "Invoices", description: "Every invoice with totals, payments and balance", permission: "sales.view",
    load: async (tenantId, range, scope) => (await db.invoice.findMany({ where: { tenantId, issueDate: between(range), ...farmWhere(scope) }, include: { customer: true }, orderBy: { issueDate: "asc" } })).map(i => ({
      invoice_no: i.invoiceNo, issue_date: d(i.issueDate), due_date: d(i.dueDate), customer: i.customer.name, customer_phone: i.customer.phone, subtotal: n(i.subtotal), discount: n(i.discount), tax: n(i.tax), total: n(i.total), paid: n(i.amountPaid), balance: i.status === "VOID" ? 0 : invoiceBalance(i), status: invoiceDisplayStatus(i),
    })),
  },
  "invoice-lines": {
    label: "Sales by item", description: "Invoice lines: what was sold, how much and at what price", permission: "sales.view",
    load: async (tenantId, range, scope) => (await db.invoiceItem.findMany({ where: { tenantId, invoice: { issueDate: between(range), status: { not: "VOID" }, ...farmWhere(scope) } }, include: { invoice: { include: { customer: true } }, product: true }, orderBy: { invoice: { issueDate: "asc" } } })).map(l => ({
      invoice_no: l.invoice.invoiceNo, date: d(l.invoice.issueDate), customer: l.invoice.customer.name, product: l.product?.name || "", description: l.description, quantity: n(l.quantity), unit: l.unit, unit_price: n(l.unitPrice), line_total: n(l.lineTotal),
    })),
  },
  payments: {
    label: "Payments received", description: "Receipts from customers by method and account", permission: "sales.view",
    load: async (tenantId, range, scope) => (await db.paymentReceived.findMany({ where: { tenantId, receivedAt: between(range), ...relatedFarmWhere(scope, "invoice") }, include: { customer: true, invoice: true, account: true }, orderBy: { receivedAt: "asc" } })).map(p => ({
      receipt_no: p.receiptNo, date: d(p.receivedAt), customer: p.customer.name, invoice_no: p.invoice?.invoiceNo || "", method: p.method, account: p.account?.name || "", reference: p.reference, amount: n(p.amount),
    })),
  },
  expenses: {
    label: "Expenses", description: "All spending with farm, cycle, status and account", permission: "finance.view",
    load: async (tenantId, range, scope) => (await db.expense.findMany({ where: { tenantId, incurredAt: between(range), ...farmWhere(scope) }, include: { farm: true, cycle: true, account: true }, orderBy: { incurredAt: "asc" } })).map(e => ({
      date: d(e.incurredAt), category: e.category, description: e.description, paid_to: e.vendor, farm: e.farm?.name || "", cycle: e.cycle?.name || "", status: e.status, account: e.account?.name || "", reference: e.reference, amount: n(e.amount),
    })),
  },
  income: {
    label: "Income", description: "Revenue by farm, cycle and type", permission: "finance.view",
    load: async (tenantId, range, scope) => (await db.revenue.findMany({ where: { tenantId, occurredAt: between(range), ...farmWhere(scope) }, include: { farm: true, cycle: true }, orderBy: { occurredAt: "asc" } })).map(r => ({
      date: d(r.occurredAt), type: r.type, description: r.description, customer: r.customer, farm: r.farm?.name || "", cycle: r.cycle?.name || "", reference: r.reference, amount: n(r.amount),
    })),
  },
  "supplier-payments": {
    label: "Supplier payments", description: "Money paid to suppliers", permission: "procurement.view",
    load: async (tenantId, range, scope) => (await db.vendorPayment.findMany({ where: { tenantId, paidAt: between(range), ...relatedFarmWhere(scope, "purchaseOrder") }, include: { vendor: true, purchaseOrder: true, account: true }, orderBy: { paidAt: "asc" } })).map(p => ({
      date: d(p.paidAt), supplier: p.vendor.name, purchase_order: p.purchaseOrder?.orderNo || "", method: p.method, account: p.account?.name || "", reference: p.reference, amount: n(p.amount),
    })),
  },
  stock: {
    label: "Stock on hand", description: "Current quantity per store and product (ignores date range)", permission: "inventory.view",
    load: async (tenantId, _range, scope) => {
      const [{ byLocation }, products, warehouses] = await Promise.all([stockPositions(tenantId, db, scope), db.product.findMany({ where: { tenantId } }), db.warehouse.findMany({ where: { tenantId, ...farmWhere(scope) } })]);
      const p = new Map(products.map(x => [x.id, x]));
      const w = new Map(warehouses.map(x => [x.id, x]));
      return [...byLocation.entries()].map(([key, qty]) => { const [wid, pid] = key.split(":"); const product = p.get(pid); return { store: w.get(wid)?.name, product: product?.name, sku: product?.sku, category: product?.category, quantity: Math.round(qty * 1000) / 1000, unit: product?.unit, standard_cost: n(product?.standardCost), value: Math.round(qty * Number(product?.standardCost || 0) * 100) / 100 }; });
    },
  },
  "stock-movements": {
    label: "Stock movements", description: "The full inventory ledger", permission: "inventory.view",
    load: async (tenantId, range, scope) => (await db.inventoryTransaction.findMany({ where: { tenantId, occurredAt: between(range), ...relatedFarmWhere(scope, "warehouse") }, include: { product: true, warehouse: true, cycle: true }, orderBy: { occurredAt: "asc" } })).map(t => ({
      date: d(t.occurredAt), type: t.type, store: t.warehouse.name, product: t.product.name, quantity: n(t.quantity), unit: t.product.unit, unit_cost: n(t.unitCost), lot: t.lotNumber, cycle: t.cycle?.name || "", reference: t.reference,
    })),
  },
  labour: {
    label: "Labour & attendance", description: "Every timesheet with hours, cost and status", permission: "workforce.view",
    load: async (tenantId, range, scope) => (await db.timesheet.findMany({ where: { tenantId, workDate: between(range), ...farmWhere(scope) }, include: { worker: true, farm: true, cycle: true, payRun: true }, orderBy: { workDate: "asc" } })).map(t => ({
      date: d(t.workDate), worker: t.worker.name, pay_basis: t.worker.payBasis, activity: t.activity, farm: t.farm?.name || "", cycle: t.cycle?.name || "", hours: n(t.hours), pieces: n(t.pieceQuantity), cost: labourCost(t), status: t.status, pay_run: t.payRun?.runNo || "",
    })),
  },
  payroll: {
    label: "Payroll", description: "Pay run lines per worker", permission: "workforce.view", organisationWide: true,
    load: async (tenantId, range) => (await db.payRunLine.findMany({ where: { tenantId, payRun: { periodEnd: between(range) } }, include: { payRun: true, worker: true }, orderBy: { payRun: { periodEnd: "asc" } } })).map(l => ({
      pay_run: l.payRun.runNo, period_start: d(l.payRun.periodStart), period_end: d(l.payRun.periodEnd), status: l.payRun.status, worker: l.worker.name, basis: l.basis, units: n(l.units), gross: n(l.grossPay), allowances: n(l.allowances), deductions: n(l.deductions), advance_recovered: n(l.advanceRecovery), net_pay: n(l.netPay), pay_to: l.worker.paymentAccount,
    })),
  },
  customers: {
    label: "Customer balances", description: "What each customer owes today (ignores date range)", permission: "sales.view",
    load: async (tenantId, _range, scope) => {
      const customers = await db.customer.findMany({ where: { tenantId }, include: { invoices: { where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, ...farmWhere(scope) } } }, orderBy: { name: "asc" } });
      return customers.map(c => ({ customer: c.name, phone: c.phone, email: c.email, terms_days: c.paymentTermsDays, credit_limit: n(c.creditLimit), open_invoices: c.invoices.length, outstanding: c.invoices.reduce((s, i) => s + invoiceBalance(i), 0), overdue: c.invoices.filter(i => invoiceDisplayStatus(i) === "OVERDUE").reduce((s, i) => s + invoiceBalance(i), 0) }));
    },
  },

  // ----- Reports: the same figures as the report pages (src/lib/reports.ts). -----
  "report-profit-loss": {
    kind: "report", label: "Profit & loss by month", description: "Income, approved spending, result and cash collected per month", permission: "analytics.view",
    load: async (tenantId, range, scope) => (await monthlyProfitAndLoss(tenantId, scope, range)).map(r => ({ month: r.month, income: money(r.income), spending: money(r.spending), profit_loss: money(r.profit), cash_collected: money(r.cashCollected) })),
  },
  "report-sales-by-product": {
    kind: "report", label: "Sales by product", description: "What sold, how much and for how much, best sellers first", permission: "analytics.view",
    load: async (tenantId, range, scope) => (await salesByProduct(tenantId, scope, range)).map(r => ({ product: r.product, quantity: r.quantity, unit: r.unit, sales_value: money(r.value), invoices: r.invoices, average_price: r.quantity ? money(r.value / r.quantity) : "" })),
  },
  "report-sales-by-customer": {
    kind: "report", label: "Sales by customer", description: "Invoiced sales per customer, largest first", permission: "analytics.view",
    load: async (tenantId, range, scope) => (await salesByCustomer(tenantId, scope, range)).map(r => ({ customer: r.customer, invoices: r.invoices, sales_value: money(r.value) })),
  },
  "report-spending-by-category": {
    kind: "report", label: "Spending by category", description: "Approved and paid spending per category with its share", permission: "analytics.view",
    load: async (tenantId, range, scope) => (await spendingByCategory(tenantId, scope, range)).map(r => ({ category: r.category, transactions: r.transactions, amount: money(r.amount), share_pct: pct(r.share) })),
  },
  "report-cycle-profitability": {
    kind: "report", label: "Profitability by cycle", description: "Full cost, revenue and margin for every production cycle (ignores date range)", permission: "finance.view",
    load: async (tenantId, _range, scope) => (await cycleProfitability(tenantId, scope)).map(r => ({
      cycle: r.cycle, commodity: r.commodity, type: r.type, status: r.status, farm: r.farm, unit: r.unit ?? "",
      direct_expenses: money(r.direct), inputs: money(r.inputs), labour: money(r.labour), equipment: money(r.equipment), total_cost: money(r.cost),
      revenue: money(r.revenue), margin: money(r.margin), margin_pct: r.revenue ? pct(r.margin / r.revenue) : "",
      budget: r.budget ? money(r.budget) : "", budget_used_pct: r.budget ? pct(r.cost / r.budget) : "",
      output: r.output || "", output_unit: r.outputUnit ?? "", cost_per_output_unit: r.output ? money(r.cost / r.output) : "",
    })),
  },
  "report-farm-activity": {
    kind: "report", label: "Farm activity", description: "Production cycles and units per farm (ignores date range)", permission: "analytics.view",
    load: async (tenantId, _range, scope) => (await farmActivity(tenantId, scope)).map(r => ({ farm: r.farm, production_cycles: r.cycles, production_units: r.units })),
  },
  "report-cycle-costs": {
    kind: "report", label: "Cycle cost against budget", description: "Expenses recorded per cycle compared with its budget (ignores date range)", permission: "analytics.view",
    load: async (tenantId, _range, scope) => (await cycleCostPosition(tenantId, scope)).map(r => ({ cycle: r.cycle, commodity: r.commodity, recorded_cost: money(r.recordedCost), budget: r.budget ? money(r.budget) : "", budget_used_pct: r.budget ? pct(r.recordedCost / r.budget) : "" })),
  },
};

export function toCsv(rows: Row[]) {
  if (!rows.length) return "﻿no records\n";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const s = value == null ? "" : String(value);
    // Neutralise spreadsheet formula injection and quote anything with separators.
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\r\n") + "\r\n";
}
