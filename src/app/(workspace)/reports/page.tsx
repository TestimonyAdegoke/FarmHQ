import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { datasets } from "@/lib/exports";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber } from "@/lib/utils";

export const metadata = { title: "Reports & Export" };

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string; from?: string; to?: string }> }) {
  const ctx = await tenantContext("analytics.view");
  const params = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = Number(params.year) || thisYear;
  const start = new Date(year, 0, 1), end = new Date(year + 1, 0, 1);
  const [revenues, expenses, lines, payments] = await Promise.all([
    db.revenue.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm, occurredAt: { gte: start, lt: end } }, select: { occurredAt: true, amount: true } }),
    db.expense.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm, status: { in: ["APPROVED", "PAID"] }, incurredAt: { gte: start, lt: end } }, select: { incurredAt: true, amount: true, category: true } }),
    db.invoiceItem.findMany({ where: { tenantId: ctx.tenantId, invoice: { status: { not: "VOID" }, issueDate: { gte: start, lt: end }, ...ctx.scope.byFarm } }, select: { description: true, quantity: true, unit: true, lineTotal: true, product: { select: { name: true } }, invoice: { select: { customer: { select: { name: true } } } } } }),
    db.paymentReceived.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.via("invoice"), receivedAt: { gte: start, lt: end } }, select: { receivedAt: true, amount: true } }),
  ]);
  const money = (n: number) => formatMoney(n, ctx.tenant.currency);
  const monthly = months.map((m, i) => ({ m, income: 0, spend: 0, cash: 0, i }));
  revenues.forEach(r => { monthly[r.occurredAt.getMonth()].income += Number(r.amount); });
  expenses.forEach(e => { monthly[e.incurredAt.getMonth()].spend += Number(e.amount); });
  payments.forEach(p => { monthly[p.receivedAt.getMonth()].cash += Number(p.amount); });
  const totals = monthly.reduce((t, r) => ({ income: t.income + r.income, spend: t.spend + r.spend, cash: t.cash + r.cash }), { income: 0, spend: 0, cash: 0 });
  const peak = Math.max(1, ...monthly.map(r => Math.max(r.income, r.spend)));
  const byProduct = new Map<string, { qty: number; unit: string; value: number }>();
  const byCustomer = new Map<string, number>();
  lines.forEach(l => {
    const key = l.product?.name || l.description;
    const entry = byProduct.get(key) || { qty: 0, unit: l.unit, value: 0 };
    entry.qty += Number(l.quantity); entry.value += Number(l.lineTotal);
    byProduct.set(key, entry);
    byCustomer.set(l.invoice.customer.name, (byCustomer.get(l.invoice.customer.name) || 0) + Number(l.lineTotal));
  });
  const byCategory = new Map<string, number>();
  expenses.forEach(e => byCategory.set(e.category, (byCategory.get(e.category) || 0) + Number(e.amount)));
  const allowed = Object.entries(datasets).filter(([, def]) => ctx.can(def.permission) && !(def.organisationWide && ctx.scope.limited));
  const qs = new URLSearchParams({ ...(params.from ? { from: params.from } : {}), ...(params.to ? { to: params.to } : {}) }).toString();

  return <>
    <PageHeader eyebrow="Money" title="Reports & export" description="Your year at a glance, plus spreadsheet downloads for your accountant, bank or cooperative." action={<nav className="segmented" aria-label="Year">{[thisYear - 2, thisYear - 1, thisYear].map(y => <Link key={y} href={`/reports?year=${y}`} className={y === year ? "active" : ""}>{y}</Link>)}</nav>} />

    <div className="card">
      <div className="card-head"><div><h2>Profit & loss by month, {year}</h2><div className="card-sub">Income {money(totals.income)} · Spending {money(totals.spend)} · Result <b style={{ color: totals.income - totals.spend < 0 ? "var(--danger)" : "var(--brand)" }}>{money(totals.income - totals.spend)}</b></div></div></div>
      <div className="table-wrap"><table><thead><tr><th>Month</th><th style={{ width: "34%" }}></th><th className="text-right">Income</th><th className="text-right">Spending</th><th className="text-right">Profit / loss</th><th className="text-right">Cash collected</th></tr></thead><tbody>
        {monthly.map(r => <tr key={r.m}><td><b>{r.m}</b></td><td><div style={{ display: "grid", gap: 3 }}><div className="progress"><span style={{ width: `${r.income / peak * 100}%` }} /></div><div className="progress"><span style={{ width: `${r.spend / peak * 100}%`, background: "var(--warning)" }} /></div></div></td><td className={`text-right ${r.income ? "" : "num-zero"}`}>{money(r.income)}</td><td className={`text-right ${r.spend ? "" : "num-zero"}`}>{money(r.spend)}</td><td className={`text-right ${r.income - r.spend < 0 ? "num-neg" : r.income - r.spend > 0 ? "num-pos" : "num-zero"}`}>{money(r.income - r.spend)}</td><td className={`text-right ${r.cash ? "" : "num-zero"}`}>{money(r.cash)}</td></tr>)}
      </tbody></table></div>
      <div className="muted small-text" style={{ marginTop: 10 }}><span style={{ color: "var(--brand)" }}>■</span> Income &nbsp; <span style={{ color: "var(--warning)" }}>■</span> Spending</div>
    </div>

    <div className="grid-3">
      <div className="card"><div className="card-head"><h2>Best-selling products</h2></div>{[...byProduct.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([name, v]) => <div className="progress-row" key={name}><div className="progress-label"><span>{name}</span><b>{money(v.value)}</b></div><div className="progress"><span style={{ width: `${v.value / Math.max(1, ...[...byProduct.values()].map(x => x.value)) * 100}%` }} /></div><small className="muted">{formatNumber(v.qty, 2)} {v.unit} sold</small></div>)}{!byProduct.size ? <p className="muted">No invoiced sales this year.</p> : null}</div>
      <div className="card"><div className="card-head"><h2>Top customers</h2></div>{[...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, v]) => <div className="progress-row" key={name}><div className="progress-label"><span>{name}</span><b>{money(v)}</b></div><div className="progress"><span style={{ width: `${v / Math.max(...byCustomer.values()) * 100}%` }} /></div></div>)}{!byCustomer.size ? <p className="muted">No customers invoiced this year.</p> : null}</div>
      <div className="card"><div className="card-head"><h2>Where money went</h2></div>{[...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, v]) => <div className="progress-row" key={name}><div className="progress-label"><span>{name}</span><b>{money(v)}</b></div><div className="progress"><span style={{ width: `${v / Math.max(...byCategory.values()) * 100}%`, background: "var(--warning)" }} /></div></div>)}{!byCategory.size ? <p className="muted">No approved spending this year.</p> : null}</div>
    </div>

    <div className="card">
      <div className="card-head"><div><h2>Download data (CSV)</h2><div className="card-sub">Opens in Excel, Google Sheets or LibreOffice. Leave dates empty for all records.</div></div></div>
      <form className="inline-actions" style={{ marginBottom: 16 }}><label className="inline-field">From<input type="date" name="from" defaultValue={params.from || ""} /></label><label className="inline-field">To<input type="date" name="to" defaultValue={params.to || ""} /></label><input type="hidden" name="year" value={year} /><button className="button secondary small" style={{ alignSelf: "flex-end" }}>Apply dates</button></form>
      <div className="menu-grid">{allowed.map(([key, def]) => <a key={key} className="menu-tile" href={`/api/export/${key}${qs ? `?${qs}` : ""}`}><span className="icon-box"><Download size={17} /></span><b>{def.label}</b><small>{def.description}</small></a>)}</div>
    </div>
  </>;
}
