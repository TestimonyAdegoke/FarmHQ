import Link from "next/link";
import { Banknote, CalendarRange, HandCoins, Users } from "lucide-react";
import { createPayRunAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { labourCost } from "@/lib/ledger";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, humanize, safeDate, toDateInput } from "@/lib/utils";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const ctx = await tenantContext("workforce.view");
  const now = new Date();
  const [runs, unpaid, farms, advances] = await Promise.all([
    db.payRun.findMany({ where: { tenantId: ctx.tenantId }, include: { lines: { select: { netPay: true, grossPay: true } } }, orderBy: { periodEnd: "desc" }, take: 50 }),
    db.timesheet.findMany({ where: { tenantId: ctx.tenantId, status: "APPROVED", payRunId: null }, select: { hours: true, hourlyRate: true, amount: true, workerId: true } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.workerAdvance.aggregate({ where: { tenantId: ctx.tenantId, payRunId: null }, _sum: { amount: true } }),
  ]);
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const owed = unpaid.reduce((s, t) => s + labourCost(t), 0);
  const paidThisYear = runs.filter(r => r.status === "PAID" && r.periodEnd.getFullYear() === now.getFullYear()).reduce((s, r) => s + r.lines.reduce((a, l) => a + Number(l.netPay), 0), 0);
  const draft = runs.filter(r => ["DRAFT", "APPROVED"].includes(r.status));

  return <>
    <PageHeader eyebrow="People" title="Payroll" description="Turn approved attendance and salaries into a pay run, recover wage advances, approve it and record payment." />
    <section className="metrics">
      <MetricCard label="Wages earned, not yet paid" value={money(owed)} hint={`${new Set(unpaid.map(t => t.workerId)).size} workers with approved work`} icon={<HandCoins size={16} />} />
      <MetricCard label="Advances to recover" value={money(advances._sum.amount || 0)} hint="Deducted in the next pay run" icon={<Banknote size={16} />} />
      <MetricCard label="Pay runs in progress" value={String(draft.length)} hint="Draft or approved, not yet paid" icon={<CalendarRange size={16} />} />
      <MetricCard label="Paid this year" value={money(paidThisYear)} hint="Net wages paid" icon={<Users size={16} />} />
    </section>

    {ctx.can("workforce.manage") ? <FormDetails title="Start a pay run" hint="Approved unpaid work plus monthly salaries for the period, less outstanding advances." open={!runs.length}>
      <ActionForm action={createPayRunAction} reset={false}>
        <div className="form-grid">
          <div className="field"><label>Period start</label><input name="periodStart" type="date" required defaultValue={toDateInput(new Date(now.getFullYear(), now.getMonth(), 1))} /></div>
          <div className="field"><label>Period end</label><input name="periodEnd" type="date" required defaultValue={toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0))} /></div>
          <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">All farms</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="field"><label>Notes</label><input name="notes" placeholder="e.g. October wages" /></div>
        </div>
        <div className="form-actions"><button className="button">Calculate pay run</button></div>
      </ActionForm>
    </FormDetails> : null}

    {runs.length ? <div className="table-wrap"><table><thead><tr><th>Pay run</th><th>Period</th><th className="text-right">Workers</th><th className="text-right">Gross</th><th className="text-right">Net pay</th><th>Status</th></tr></thead><tbody>{runs.map(r => <tr key={r.id}>
      <td><Link className="link" href={`/payroll/${r.id}`}>{r.runNo}</Link><div className="sub">{r.notes || ""}</div></td>
      <td className="nowrap">{safeDate(r.periodStart)} – {safeDate(r.periodEnd)}</td>
      <td className="text-right">{r.lines.length}</td>
      <td className="text-right">{money(r.lines.reduce((s, l) => s + Number(l.grossPay), 0))}</td>
      <td className="text-right"><b>{money(r.lines.reduce((s, l) => s + Number(l.netPay), 0))}</b></td>
      <td><span className={`status ${r.status === "PAID" ? "" : r.status === "CANCELLED" ? "neutral" : r.status === "APPROVED" ? "info" : "warn"}`}>{humanize(r.status)}</span></td>
    </tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No pay runs yet" text="Approve attendance in Workers & Attendance, then start your first pay run." /></div>}
  </>;
}
