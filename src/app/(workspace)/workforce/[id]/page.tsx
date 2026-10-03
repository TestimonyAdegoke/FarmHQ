import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updateWorkerAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { FormDetails } from "@/components/form-details";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { labourCost } from "@/lib/ledger";
import { payBases, paymentMethods } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, humanize, safeDate } from "@/lib/utils";

export const metadata = { title: "Worker" };

const runTone = (status: string) => status === "PAID" ? "" : status === "CANCELLED" ? "neutral" : status === "APPROVED" ? "info" : "warn";
const sheetTone = (status: string, paid: boolean) => paid ? "" : status === "SUBMITTED" ? "warn" : status === "REJECTED" ? "danger" : "info";

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await tenantContext("workforce.view");
  const { id } = await params;
  const worker = await db.workforceMember.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      farm: true,
      timesheets: { include: { cycle: true }, orderBy: { workDate: "desc" }, take: 60 },
      advances: { include: { payRun: { select: { runNo: true } } }, orderBy: { issuedAt: "desc" }, take: 30 },
      payRunLines: { include: { payRun: true }, orderBy: { payRun: { periodEnd: "desc" } }, take: 24 },
    },
  });
  if (!worker) notFound();
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const n = (v: unknown) => v == null ? "" : String(Number(v));
  const rate = worker.payBasis === "DAILY" ? (worker.dailyRate != null ? `${money(worker.dailyRate)}/day` : "No daily rate")
    : worker.payBasis === "MONTHLY" ? (worker.monthlySalary != null ? `${money(worker.monthlySalary)}/month` : "No salary set")
    : worker.payBasis === "PIECE_RATE" ? (worker.pieceRate != null ? `${money(worker.pieceRate)}/${worker.pieceUnit || "piece"}` : "No piece rate")
    : worker.defaultHourlyRate != null ? `${money(worker.defaultHourlyRate)}/hour` : "No hourly rate";
  const outstanding = worker.advances.filter(a => !a.payRun).reduce((s, a) => s + Number(a.amount), 0);
  const paidTotal = worker.payRunLines.filter(l => l.payRun.status === "PAID").reduce((s, l) => s + Number(l.netPay), 0);

  return <>
    <div className="doc-actions"><Link href="/workforce?tab=workers" className="button secondary small"><ArrowLeft size={15} /> Workers</Link></div>
    <PageHeader eyebrow={worker.active ? "Worker" : "Former worker"} title={worker.name} description={[worker.jobTitle, worker.farm?.name, worker.phone, worker.startDate ? `since ${safeDate(worker.startDate)}` : null].filter(Boolean).join(" · ")} />
    {ctx.can("workforce.manage") ? <FormDetails title="Edit worker & pay details" hint="Name, status, pay basis, rates and how they are paid.">
      <ActionForm action={updateWorkerAction} reset={false} success="Saved">
        <input type="hidden" name="id" value={worker.id} />
        <div className="form-grid">
          <div className="field"><label>Name</label><input name="name" required defaultValue={worker.name} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={worker.phone || ""} /></div>
          <div className="field"><label>Job / role</label><input name="jobTitle" defaultValue={worker.jobTitle || ""} /></div>
          <div className="field"><label>Status</label><select name="active" defaultValue={String(worker.active)}><option value="true">Active</option><option value="false">Left / inactive</option></select></div>
          <div className="field span-2"><label>Pay basis</label><select name="payBasis" defaultValue={worker.payBasis}>{payBases.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>Daily rate</label><input name="dailyRate" type="number" step="0.01" min="0" defaultValue={n(worker.dailyRate)} /></div>
          <div className="field"><label>Monthly salary</label><input name="monthlySalary" type="number" step="0.01" min="0" defaultValue={n(worker.monthlySalary)} /></div>
          <div className="field"><label>Hourly rate</label><input name="defaultHourlyRate" type="number" step="0.01" min="0" defaultValue={n(worker.defaultHourlyRate)} /></div>
          <div className="field"><label>Piece rate</label><input name="pieceRate" type="number" step="0.01" min="0" defaultValue={n(worker.pieceRate)} /></div>
          <div className="field"><label>Piece unit</label><input name="pieceUnit" defaultValue={worker.pieceUnit || ""} /></div>
          <div className="field"><label>Pay by</label><select name="paymentMethod" defaultValue={worker.paymentMethod || ""}><option value="">Not set</option>{paymentMethods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field span-2"><label>Bank / mobile money number</label><input name="paymentAccount" defaultValue={worker.paymentAccount || ""} /></div>
        </div>
        <div className="form-actions"><button className="button">Save changes</button></div>
      </ActionForm>
    </FormDetails> : null}

    <div className="grid-main-side">
      <div className="stack">
        <div className="card"><div className="card-head"><h2>Recent work</h2></div>{worker.timesheets.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Work</th><th>Cycle</th><th className="text-right">Hours</th><th className="text-right">Cost</th><th>Status</th></tr></thead><tbody>{worker.timesheets.map(t => <tr key={t.id}><td className="nowrap">{safeDate(t.workDate)}</td><td>{t.activity}</td><td>{t.cycle?.name || "—"}</td><td className="text-right">{formatNumber(t.hours, 2)}{t.pieceQuantity ? <div className="sub">{formatNumber(t.pieceQuantity, 2)} {worker.pieceUnit || "pieces"}</div> : null}</td><td className="text-right">{money(labourCost(t))}</td><td><span className={`status ${sheetTone(t.status, Boolean(t.payRunId))}`}>{t.payRunId ? "Paid" : humanize(t.status)}</span></td></tr>)}</tbody></table></div> : <p className="muted">No work recorded yet.</p>}</div>
        <div className="card"><div className="card-head"><h2>Pay history</h2></div>{worker.payRunLines.length ? <div className="table-wrap"><table><thead><tr><th>Pay run</th><th>Period</th><th>Status</th><th className="text-right">Gross</th><th className="text-right">Net paid</th></tr></thead><tbody>{worker.payRunLines.map(l => <tr key={l.id}><td><Link className="link" href={`/payroll/${l.payRunId}`}>{l.payRun.runNo}</Link></td><td>{safeDate(l.payRun.periodStart)} – {safeDate(l.payRun.periodEnd)}</td><td><span className={`status ${runTone(l.payRun.status)}`}>{humanize(l.payRun.status)}</span></td><td className="text-right">{money(l.grossPay)}</td><td className="text-right"><b>{money(l.netPay)}</b></td></tr>)}</tbody></table></div> : <p className="muted">Not included in any pay run yet.</p>}</div>
      </div>
      <div className="stack">
        <div className="card"><div className="card-head"><h2>Profile</h2><span className={`status ${worker.active ? "" : "neutral"}`}>{worker.active ? "Active" : "Inactive"}</span></div>
          <dl className="kv">
            <dt>Pay</dt><dd>{rate}</dd>
            <dt>Pay basis</dt><dd>{humanize(worker.payBasis)}</dd>
            <dt>Employment</dt><dd>{humanize(worker.employmentType)}</dd>
            <dt>Farm</dt><dd>{worker.farm?.name || "Shared"}</dd>
            <dt>Staff no.</dt><dd>{worker.employeeNo || "—"}</dd>
            <dt>Phone</dt><dd>{worker.phone || "—"}</dd>
            <dt>Pay by</dt><dd>{worker.paymentMethod ? humanize(worker.paymentMethod) : "—"}</dd>
            <dt>Pay to</dt><dd>{worker.paymentAccount || "—"}</dd>
            <dt>Start date</dt><dd>{worker.startDate ? safeDate(worker.startDate) : "—"}</dd>
            <dt>Net paid (listed runs)</dt><dd>{money(paidTotal)}</dd>
            <dt>Advances outstanding</dt><dd>{money(outstanding)}</dd>
          </dl>
        </div>
        <div className="card"><div className="card-head"><h2>Advances</h2></div>{worker.advances.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Reason</th><th className="text-right">Amount</th><th>Recovered</th></tr></thead><tbody>{worker.advances.map(a => <tr key={a.id}><td className="nowrap">{safeDate(a.issuedAt)}</td><td>{a.reason || "—"}</td><td className="text-right">{money(a.amount)}</td><td>{a.payRun ? <span className="status">{a.payRun.runNo}</span> : <span className="status warn">Outstanding</span>}</td></tr>)}</tbody></table></div> : <p className="muted">No advances.</p>}</div>
      </div>
    </div>
  </>;
}
