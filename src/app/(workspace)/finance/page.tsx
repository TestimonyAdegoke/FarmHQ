import Link from "next/link";
import { CircleDollarSign, HandCoins, Receipt, WalletCards } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { createExpenseAction, createRevenueAction } from "@/app/actions";
import { updateExpenseStatusAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { invoiceBalance, purchaseOrderTotals } from "@/lib/ledger";
import { revenueTypes } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, safeDate } from "@/lib/utils";

export const metadata = { title: "Expenses & Income" };

const periods = [["month", "This month"], ["quarter", "Last 3 months"], ["year", "This year"], ["all", "All time"]] as const;

function periodStart(period: string) {
  const now = new Date();
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return undefined;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ period?: string; tab?: string }> }) {
  const ctx = await tenantContext("finance.view");
  const params = await searchParams;
  const period = periods.some(([k]) => k === params.period) ? params.period! : "month";
  const tab = params.tab === "income" ? "income" : params.tab === "approvals" ? "approvals" : "expenses";
  const since = periodStart(period);
  const expenseWhere: Prisma.ExpenseWhereInput = { tenantId: ctx.tenantId, ...(since ? { incurredAt: { gte: since } } : {}) };
  const revenueWhere: Prisma.RevenueWhereInput = { tenantId: ctx.tenantId, ...(since ? { occurredAt: { gte: since } } : {}) };
  const [farms, cycles, accounts, expenses, revenues, pending, openInvoices, openPOs] = await Promise.all([
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.expense.findMany({ where: expenseWhere, include: { farm: true, cycle: true, account: true }, orderBy: { incurredAt: "desc" }, take: 300 }),
    db.revenue.findMany({ where: revenueWhere, include: { farm: true, cycle: true }, orderBy: { occurredAt: "desc" }, take: 300 }),
    db.expense.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } }, include: { farm: true, cycle: true }, orderBy: { incurredAt: "asc" }, take: 100 }),
    db.invoice.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, select: { total: true, amountPaid: true } }),
    db.purchaseOrder.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] } }, include: { items: true, payments: true } }),
  ]);
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const spent = expenses.filter(e => ["APPROVED", "PAID"].includes(e.status)).reduce((s, e) => s + Number(e.amount), 0);
  const income = revenues.reduce((s, r) => s + Number(r.amount), 0);
  const receivable = openInvoices.reduce((s, i) => s + invoiceBalance(i), 0);
  const payable = openPOs.reduce((s, po) => s + purchaseOrderTotals(po).balance, 0) + pending.filter(e => e.status === "APPROVED").reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = new Map<string, number>();
  expenses.filter(e => ["APPROVED", "PAID"].includes(e.status)).forEach(e => byCategory.set(e.category, (byCategory.get(e.category) || 0) + Number(e.amount)));
  const canManage = ctx.can("finance.manage");
  const periodLabel = periods.find(([k]) => k === period)![1].toLowerCase();
  const tabLink = (t: string) => `/finance?period=${period}&tab=${t}`;

  return <>
    <PageHeader eyebrow="Money" title="Expenses & income" description="Capture spending at source, approve and pay it, and link everything to the farm and production cycle it belongs to." action={<div className="inline-actions">{periods.map(([k, l]) => <Link key={k} href={`/finance?period=${k}&tab=${tab}`} className={`button small ${period === k ? "" : "secondary"}`}>{l}</Link>)}</div>} />
    <section className="metrics">
      <MetricCard label="Income" value={money(income)} hint={periodLabel} icon={<CircleDollarSign size={18} />} />
      <MetricCard label="Spending" value={money(spent)} hint={`Approved + paid, ${periodLabel}`} icon={<WalletCards size={18} />} />
      <MetricCard label="Profit / loss" value={money(income - spent)} hint={income ? `${((income - spent) / income * 100).toFixed(0)}% margin` : periodLabel} icon={<Receipt size={18} />} />
      <MetricCard label="Owed to you / by you" value={money(receivable)} hint={`You owe ${money(payable)}`} icon={<HandCoins size={18} />} />
    </section>

    {canManage ? <div className="grid-2">
      <FormDetails title="Record expense" hint="Fuel, feed, transport, repairs, casual labour paid in cash…">
        <ActionForm action={createExpenseAction} success="Expense recorded">
          <div className="form-grid two">
            <div className="field"><label>Category</label><input name="category" required placeholder="Fuel / Feed / Transport" list="expense-categories" /></div>
            <div className="field"><label>Amount ({ctx.tenant.currency})</label><input name="amount" required type="number" inputMode="decimal" min="0.01" step="0.01" /></div>
            <div className="field span-2"><label>Description</label><input name="description" required /></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not allocated</option>{cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Paid to</label><input name="vendor" /></div>
            <div className="field"><label>Date</label><input name="incurredAt" type="date" /></div>
            <div className="field"><label>Status</label><select name="status" defaultValue="PAID"><option value="PAID">Already paid</option><option value="APPROVED">Approved, not yet paid</option><option value="SUBMITTED">Needs approval</option><option value="DRAFT">Draft</option></select></div>
            <div className="field"><label>Paid from account</label><select name="accountId" defaultValue=""><option value="">Not tracked</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field span-2"><label>Receipt / reference</label><input name="reference" /></div>
          </div>
          <datalist id="expense-categories">{["Feed", "Fertilizer", "Seeds", "Agro-chemicals", "Veterinary", "Fuel", "Transport", "Repairs & maintenance", "Casual labour", "Rent / land lease", "Utilities", "Packaging", "Market levies"].map(c => <option key={c} value={c} />)}</datalist>
          <div className="form-actions"><button className="button">Record expense</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Record other income" hint="Grants, services, rentals. Produce sales are recorded automatically from invoices.">
        <ActionForm action={createRevenueAction} success="Income recorded">
          <div className="form-grid two">
            <div className="field"><label>Type</label><select name="type" defaultValue="OTHER">{revenueTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>Amount ({ctx.tenant.currency})</label><input name="amount" required type="number" inputMode="decimal" min="0.01" step="0.01" /></div>
            <div className="field span-2"><label>Description</label><input name="description" required /></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not allocated</option>{cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>From</label><input name="customer" /></div>
            <div className="field"><label>Date</label><input name="occurredAt" type="date" /></div>
          </div>
          <div className="form-actions"><button className="button">Record income</button></div>
        </ActionForm>
      </FormDetails>
    </div> : null}

    <div className="tabs"><Link href={tabLink("expenses")} className={tab === "expenses" ? "active" : ""}>Expenses</Link><Link href={tabLink("approvals")} className={tab === "approvals" ? "active" : ""}>To approve / pay ({pending.length})</Link><Link href={tabLink("income")} className={tab === "income" ? "active" : ""}>Income</Link></div>

    {tab === "approvals" ? (pending.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Farm / cycle</th><th className="text-right">Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{pending.map(e => <tr key={e.id}>
      <td>{safeDate(e.incurredAt)}</td><td><b>{e.description}</b><div className="sub">{e.category}{e.vendor ? ` · ${e.vendor}` : ""}</div></td><td>{e.farm?.name || "Organization"}<div className="sub">{e.cycle?.name || ""}</div></td><td className="text-right">{money(e.amount)}</td>
      <td><span className={`status ${e.status === "APPROVED" ? "info" : "warn"}`}>{e.status === "APPROVED" ? "approved, unpaid" : e.status.toLowerCase()}</span></td>
      <td>{canManage ? <div className="inline-actions">{e.status === "APPROVED" ? <ActionForm action={updateExpenseStatusAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="PAID" /><select name="accountId" defaultValue="" aria-label="Paid from"><option value="">Paid from…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="button small">Mark paid</button></ActionForm> : <>
        <ActionForm action={updateExpenseStatusAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="APPROVED" /><button className="button small">Approve</button></ActionForm>
        <ActionForm action={updateExpenseStatusAction} confirm="Reject this expense?"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="REJECTED" /><button className="button secondary small">Reject</button></ActionForm>
      </>}</div> : null}</td>
    </tr>)}</tbody></table></div> : <div className="card"><EmptyState title="Nothing waiting" text="Submitted expenses and approved bills awaiting payment show here." /></div>)
      : tab === "income" ? (revenues.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Farm / cycle</th><th>Type</th><th>From</th><th className="text-right">Amount</th></tr></thead><tbody>{revenues.map(r => <tr key={r.id}><td>{safeDate(r.occurredAt)}</td><td><b>{r.invoiceId ? <Link className="link" href={`/sales/invoices/${r.invoiceId}`}>{r.description}</Link> : r.description}</b><div className="sub">{r.reference || ""}</div></td><td>{r.farm?.name || "Organization"}<div className="sub">{r.cycle?.name || ""}</div></td><td>{r.type.replaceAll("_", " ").toLowerCase()}</td><td>{r.customer || "—"}</td><td className="text-right">{money(r.amount)}</td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No income in this period" text="Sales invoices and other income will appear here." /></div>)
        : <div className="grid-main-side">
          {expenses.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Farm / cycle</th><th className="text-right">Amount</th><th>Status</th></tr></thead><tbody>{expenses.map(e => <tr key={e.id}><td>{safeDate(e.incurredAt)}</td><td><b>{e.description}</b><div className="sub">{e.category}{e.account ? ` · from ${e.account.name}` : ""}</div></td><td>{e.farm?.name || "Organization"}<div className="sub">{e.cycle?.name || ""}</div></td><td className="text-right">{money(e.amount)}</td><td><span className={`status ${["DRAFT", "SUBMITTED"].includes(e.status) ? "warn" : ["REJECTED", "VOID"].includes(e.status) ? "neutral" : ""}`}>{e.status.toLowerCase()}</span></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No expenses in this period" text="Record farm spending so you can see your true costs." /></div>}
          <div className="card"><div className="card-head"><h2>Spending by category</h2></div>{[...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => <div className="progress-row" key={name}><div className="progress-label"><span>{name}</span><b>{money(value)}</b></div><div className="progress"><span style={{ width: `${spent ? Math.max(4, value / spent * 100) : 0}%` }} /></div></div>)}{!byCategory.size && <p className="muted">No approved spending yet.</p>}</div>
        </div>}
  </>;
}
