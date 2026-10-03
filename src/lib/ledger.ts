import "server-only";

import type { InventoryTxnType, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const OUTBOUND_TYPES: InventoryTxnType[] = ["ISSUE", "TRANSFER_OUT", "ADJUSTMENT_OUT", "SALE", "WASTE"];

export function signedQuantity(type: InventoryTxnType, quantity: number) {
  return OUTBOUND_TYPES.includes(type) ? -quantity : quantity;
}

/** Labour cost for a timesheet: explicit amount (daily / piece-rate work) or hours x hourly rate. */
export function labourCost(t: { hours: unknown; hourlyRate: unknown; amount?: unknown }) {
  if (t.amount != null) return Number(t.amount);
  return Number(t.hours) * Number(t.hourlyRate);
}

type Client = Prisma.TransactionClient | typeof db;

/** On-hand quantity per warehouse+product (key `${warehouseId}:${productId}`) and per product (key productId). */
export async function stockPositions(tenantId: string, client: Client = db) {
  const rows = await client.inventoryTransaction.groupBy({
    by: ["warehouseId", "productId", "type"],
    where: { tenantId },
    _sum: { quantity: true },
  });
  const byLocation = new Map<string, number>();
  const byProduct = new Map<string, number>();
  for (const row of rows) {
    const q = signedQuantity(row.type, Number(row._sum.quantity || 0));
    const key = `${row.warehouseId}:${row.productId}`;
    byLocation.set(key, (byLocation.get(key) || 0) + q);
    byProduct.set(row.productId, (byProduct.get(row.productId) || 0) + q);
  }
  return { byLocation, byProduct };
}

export type AccountBalance = { inflow: number; outflow: number; balance: number };

/** Account balance = opening + receipts + transfers in − transfers out − supplier payments − paid expenses − payroll − advances. */
export async function accountBalances(tenantId: string) {
  const [accounts, receipts, vendorPaid, expenses, transfersOut, transfersIn, advances, payRuns] = await Promise.all([
    db.moneyAccount.findMany({ where: { tenantId }, select: { id: true, openingBalance: true } }),
    db.paymentReceived.groupBy({ by: ["accountId"], where: { tenantId, accountId: { not: null } }, _sum: { amount: true } }),
    db.vendorPayment.groupBy({ by: ["accountId"], where: { tenantId, accountId: { not: null } }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["accountId"], where: { tenantId, status: "PAID", accountId: { not: null } }, _sum: { amount: true } }),
    db.accountTransfer.groupBy({ by: ["fromAccountId"], where: { tenantId }, _sum: { amount: true } }),
    db.accountTransfer.groupBy({ by: ["toAccountId"], where: { tenantId }, _sum: { amount: true } }),
    db.workerAdvance.groupBy({ by: ["accountId"], where: { tenantId, accountId: { not: null } }, _sum: { amount: true } }),
    db.payRun.findMany({ where: { tenantId, status: "PAID", accountId: { not: null } }, select: { accountId: true, lines: { select: { netPay: true } } } }),
  ]);
  const result = new Map<string, AccountBalance>();
  for (const a of accounts) result.set(a.id, { inflow: 0, outflow: 0, balance: Number(a.openingBalance) });
  const add = (id: string | null, amount: unknown, direction: 1 | -1) => {
    const entry = id ? result.get(id) : undefined;
    if (!entry) return;
    const value = Number(amount || 0);
    if (direction === 1) entry.inflow += value; else entry.outflow += value;
    entry.balance += direction * value;
  };
  receipts.forEach(r => add(r.accountId, r._sum.amount, 1));
  transfersIn.forEach(r => add(r.toAccountId, r._sum.amount, 1));
  transfersOut.forEach(r => add(r.fromAccountId, r._sum.amount, -1));
  vendorPaid.forEach(r => add(r.accountId, r._sum.amount, -1));
  expenses.forEach(r => add(r.accountId, r._sum.amount, -1));
  advances.forEach(r => add(r.accountId, r._sum.amount, -1));
  payRuns.forEach(r => add(r.accountId, r.lines.reduce((s, l) => s + Number(l.netPay), 0), -1));
  return result;
}

export function invoiceBalance(invoice: { total: unknown; amountPaid: unknown }) {
  return Math.max(0, Number(invoice.total) - Number(invoice.amountPaid));
}

export function isOverdue(invoice: { status: string; dueDate: Date | null }, now = new Date()) {
  return ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status) && invoice.dueDate != null && invoice.dueDate < now;
}

/** Display status that folds "overdue" into the stored status. */
export function invoiceDisplayStatus(invoice: { status: string; dueDate: Date | null }) {
  return isOverdue(invoice) ? "OVERDUE" : invoice.status;
}

/** Outstanding receivables per customer from open invoices. */
export async function customerBalances(tenantId: string) {
  const rows = await db.invoice.findMany({
    where: { tenantId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
    select: { customerId: true, total: true, amountPaid: true, dueDate: true, status: true },
  });
  const map = new Map<string, { outstanding: number; overdue: number }>();
  for (const r of rows) {
    const entry = map.get(r.customerId) || { outstanding: 0, overdue: 0 };
    const balance = invoiceBalance(r);
    entry.outstanding += balance;
    if (isOverdue(r)) entry.overdue += balance;
    map.set(r.customerId, entry);
  }
  return map;
}

/** Purchase order value and amount paid, for payables. */
export function purchaseOrderTotals(po: { items: { quantity: unknown; unitPrice: unknown }[]; payments: { amount: unknown }[] }) {
  const total = po.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  const paid = po.payments.reduce((s, p) => s + Number(p.amount), 0);
  return { total, paid, balance: Math.max(0, total - paid) };
}

type Numbered = "invoice" | "receipt" | "payRun";

/** Sequential, human-friendly document numbers per tenant and year, e.g. INV-2026-00042. */
export async function nextDocumentNumber(client: Client, tenantId: string, kind: Numbered) {
  const year = new Date().getFullYear();
  const prefix = `${{ invoice: "INV", receipt: "RCT", payRun: "PAY" }[kind]}-${year}-`;
  let last: string | undefined;
  if (kind === "invoice") last = (await client.invoice.findFirst({ where: { tenantId, invoiceNo: { startsWith: prefix } }, orderBy: { invoiceNo: "desc" }, select: { invoiceNo: true } }))?.invoiceNo;
  if (kind === "receipt") last = (await client.paymentReceived.findFirst({ where: { tenantId, receiptNo: { startsWith: prefix } }, orderBy: { receiptNo: "desc" }, select: { receiptNo: true } }))?.receiptNo;
  if (kind === "payRun") last = (await client.payRun.findFirst({ where: { tenantId, runNo: { startsWith: prefix } }, orderBy: { runNo: "desc" }, select: { runNo: true } }))?.runNo;
  const next = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}
