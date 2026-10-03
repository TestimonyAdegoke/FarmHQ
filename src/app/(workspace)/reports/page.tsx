import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { DownloadLink } from "@/components/download-link";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { datasets } from "@/lib/exports";
import { monthlyProfitAndLoss, salesByCustomer, salesByProduct, spendingByCategory } from "@/lib/reports";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber } from "@/lib/utils";

export const metadata = { title: "Reports & Export" };

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string; from?: string; to?: string }> }) {
  const ctx = await tenantContext("analytics.view");
  const params = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = Number(params.year) || thisYear;
  const range = { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59, 999) };
  const yearFrom = `${year}-01-01`, yearTo = `${year}-12-31`;
  const [monthly, byProduct, byCustomer, byCategory] = await Promise.all([
    monthlyProfitAndLoss(ctx.tenantId, ctx.farmScope, range),
    salesByProduct(ctx.tenantId, ctx.farmScope, range),
    salesByCustomer(ctx.tenantId, ctx.farmScope, range),
    spendingByCategory(ctx.tenantId, ctx.farmScope, range),
  ]);
  const money = (n: number) => formatMoney(n, ctx.tenant.currency);
  const totals = monthly.reduce((t, r) => ({ income: t.income + r.income, spend: t.spend + r.spending, cash: t.cash + r.cashCollected }), { income: 0, spend: 0, cash: 0 });
  const peak = Math.max(1, ...monthly.map(r => Math.max(r.income, r.spending)));
  const topProduct = Math.max(1, ...byProduct.map(p => p.value));
  const topCustomer = Math.max(1, ...byCustomer.map(c => c.value));
  const topCategory = Math.max(1, ...byCategory.map(c => c.amount));

  const allowed = Object.entries(datasets).filter(([, def]) => ctx.can(def.permission) && !(def.organisationWide && ctx.scope.limited));
  const reports = allowed.filter(([, def]) => def.kind === "report");
  const records = allowed.filter(([, def]) => def.kind !== "report");
  const qs = new URLSearchParams({ ...(params.from ? { from: params.from } : {}), ...(params.to ? { to: params.to } : {}) }).toString();
  const tile = ([key, def]: (typeof allowed)[number]) => <a key={key} className="menu-tile" href={`/api/export/${key}${qs ? `?${qs}` : ""}`} download><span className="icon-box">{def.kind === "report" ? <FileSpreadsheet size={17} /> : <Download size={17} />}</span><b>{def.label}</b><small>{def.description}</small></a>;

  return <>
    <PageHeader eyebrow="Money" title="Reports & export" description="Your year at a glance. Every report downloads as a spreadsheet for your accountant, bank or cooperative." action={<div className="inline-actions no-print"><nav className="segmented" aria-label="Year">{[thisYear - 2, thisYear - 1, thisYear].map(y => <Link key={y} href={`/reports?year=${y}`} className={y === year ? "active" : ""}>{y}</Link>)}</nav><PrintButton /></div>} />

    <div className="card">
      <div className="card-head"><div><h2>Profit & loss by month, {year}</h2><div className="card-sub">Income {money(totals.income)} · Spending {money(totals.spend)} · Result <b className={totals.income - totals.spend < 0 ? "num-neg" : "num-pos"}>{money(totals.income - totals.spend)}</b></div></div><DownloadLink dataset="report-profit-loss" from={yearFrom} to={yearTo} /></div>
      <div className="table-wrap"><table><thead><tr><th>Month</th><th style={{ width: "34%" }}></th><th className="text-right">Income</th><th className="text-right">Spending</th><th className="text-right">Profit / loss</th><th className="text-right">Cash collected</th></tr></thead><tbody>
        {monthly.map((r, i) => <tr key={r.month}><td><b>{months[i] ?? r.month}</b></td><td><div style={{ display: "grid", gap: 3 }}><div className="progress"><span style={{ width: `${r.income / peak * 100}%` }} /></div><div className="progress"><span style={{ width: `${r.spending / peak * 100}%`, background: "var(--warning)" }} /></div></div></td><td className={`text-right ${r.income ? "" : "num-zero"}`}>{money(r.income)}</td><td className={`text-right ${r.spending ? "" : "num-zero"}`}>{money(r.spending)}</td><td className={`text-right ${r.profit < 0 ? "num-neg" : r.profit > 0 ? "num-pos" : "num-zero"}`}>{money(r.profit)}</td><td className={`text-right ${r.cashCollected ? "" : "num-zero"}`}>{money(r.cashCollected)}</td></tr>)}
      </tbody></table></div>
      <div className="legend" style={{ marginTop: 12 }}><span><i />Income</span><span><i className="warn" />Spending</span></div>
    </div>

    <div className="grid-3">
      <div className="card"><div className="card-head"><h2>Best-selling products</h2><DownloadLink dataset="report-sales-by-product" from={yearFrom} to={yearTo} /></div>{byProduct.slice(0, 8).map(p => <div className="progress-row" key={`${p.product}-${p.unit}`}><div className="progress-label"><span>{p.product}</span><b>{money(p.value)}</b></div><div className="progress"><span style={{ width: `${p.value / topProduct * 100}%` }} /></div><small className="muted">{formatNumber(p.quantity, 2)} {p.unit} sold</small></div>)}{!byProduct.length ? <p className="muted">No invoiced sales this year.</p> : null}</div>
      <div className="card"><div className="card-head"><h2>Top customers</h2><DownloadLink dataset="report-sales-by-customer" from={yearFrom} to={yearTo} /></div>{byCustomer.slice(0, 8).map(c => <div className="progress-row" key={c.customer}><div className="progress-label"><span>{c.customer}</span><b>{money(c.value)}</b></div><div className="progress"><span style={{ width: `${c.value / topCustomer * 100}%` }} /></div></div>)}{!byCustomer.length ? <p className="muted">No customers invoiced this year.</p> : null}</div>
      <div className="card"><div className="card-head"><h2>Where money went</h2><DownloadLink dataset="report-spending-by-category" from={yearFrom} to={yearTo} /></div>{byCategory.slice(0, 8).map(c => <div className="progress-row" key={c.category}><div className="progress-label"><span>{c.category}</span><b>{money(c.amount)}</b></div><div className="progress"><span style={{ width: `${c.amount / topCategory * 100}%`, background: "var(--warning)" }} /></div></div>)}{!byCategory.length ? <p className="muted">No approved spending this year.</p> : null}</div>
    </div>

    <div className="card no-print">
      <div className="card-head"><div><h2>Download reports &amp; data</h2><div className="card-sub">Spreadsheets (CSV) that open in Excel, Google Sheets or LibreOffice. Leave the dates empty for everything on record.</div></div></div>
      <form className="inline-actions"><label className="inline-field">From<input type="date" name="from" defaultValue={params.from || ""} /></label><label className="inline-field">To<input type="date" name="to" defaultValue={params.to || ""} /></label><input type="hidden" name="year" value={year} /><button className="button secondary small" style={{ alignSelf: "flex-end" }}>Apply dates</button></form>
      {reports.length ? <><h3 className="export-group">Reports</h3><div className="menu-grid">{reports.map(tile)}</div></> : null}
      {records.length ? <><h3 className="export-group">Records</h3><div className="menu-grid">{records.map(tile)}</div></> : null}
    </div>
  </>;
}
