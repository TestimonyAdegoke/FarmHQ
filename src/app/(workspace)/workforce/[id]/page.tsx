import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updateWorkerAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { FormDetails } from "@/components/form-details";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { labourCost } from "@/lib/ledger";
import { label, payBases, paymentMethods } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Worker" };

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

  return <>
    <div className="doc-actions"><Link href="/workforce?tab=workers" className="button secondary small"><ArrowLeft size={15} /> Workers</Link></div>
    <PageHeader eyebrow={worker.active ? "Worker" : "Former worker"} title={worker.name} description={[worker.jobTitle, worker.farm?.name, worker.phone, worker.startDate ? `since ${safeDate(worker.startDate)}` : null].filter(Boolean).join(" · ")} />
    {ctx.can("workforce.manage") ? <FormDetails title="Edit worker & pay details">
      <ActionForm action={updateWorkerAction} reset={false}>
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

    <div className="grid-2" style={{ marginBottom: 20 }}>
      <div className="card"><div className="card-head"><h2>Pay history</h2></div>{worker.payRunLines.length ? <div className="table-wrap"><table><thead><tr><th>Pay run</th><th>Period</th><th className="text-right">Gross</th><th className="text-right">Net paid</th></tr></thead><tbody>{worker.payRunLines.map(l => <tr key={l.id}><td><Link className="link" href={`/payroll/${l.payRunId}`}>{l.payRun.runNo}</Link><div className="sub">{l.payRun.status.toLowerCase()}</div></td><td>{safeDate(l.payRun.periodStart)} – {safeDate(l.payRun.periodEnd)}</td><td className="text-right">{money(l.grossPay)}</td><td className="text-right"><b>{money(l.netPay)}</b></td></tr>)}</tbody></table></div> : <p className="muted">Not included in any pay run yet.</p>}</div>
      <div className="card"><div className="card-head"><h2>Advances</h2></div>{worker.advances.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Reason</th><th className="text-right">Amount</th><th>Recovered</th></tr></thead><tbody>{worker.advances.map(a => <tr key={a.id}><td>{safeDate(a.issuedAt)}</td><td>{a.reason || "—"}</td><td className="text-right">{money(a.amount)}</td><td>{a.payRun ? <span className="status">{a.payRun.runNo}</span> : <span className="status warn">outstanding</span>}</td></tr>)}</tbody></table></div> : <p className="muted">No advances.</p>}</div>
    </div>
    <div className="card"><div className="card-head"><h2>Recent work</h2></div>{worker.timesheets.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Work</th><th>Cycle</th><th>Hours</th><th className="text-right">Cost</th><th>Status</th></tr></thead><tbody>{worker.timesheets.map(t => <tr key={t.id}><td>{safeDate(t.workDate)}</td><td>{t.activity}</td><td>{t.cycle?.name || "—"}</td><td>{formatNumber(t.hours, 2)}{t.pieceQuantity ? <div className="sub">{formatNumber(t.pieceQuantity, 2)} {worker.pieceUnit || "pieces"}</div> : null}</td><td className="text-right">{money(labourCost(t))}</td><td><span className={`status ${t.status === "SUBMITTED" ? "warn" : ""}`}>{t.payRunId ? "paid" : label(t.status)}</span></td></tr>)}</tbody></table></div> : <p className="muted">No work recorded yet.</p>}</div>
  </>;
}
