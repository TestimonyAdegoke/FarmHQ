import Link from "next/link";
import { Clock3, HandCoins, UserCheck, Users } from "lucide-react";
import { createTimesheetAction, createWorkforceMemberAction, updateTimesheetStatusAction } from "@/app/actions";
import { bulkApproveTimesheetsAction, createAdvanceAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { AttendanceRegister } from "@/components/attendance-register";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { labourCost } from "@/lib/ledger";
import { label, payBases, paymentMethods } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate, toDateInput } from "@/lib/utils";

export const metadata = { title: "Workers & Attendance" };

function rateText(w: { payBasis: string; defaultHourlyRate: unknown; dailyRate: unknown; monthlySalary: unknown; pieceRate: unknown; pieceUnit: string | null }, money: (n: number) => string) {
  if (w.payBasis === "DAILY") return w.dailyRate != null ? `${money(Number(w.dailyRate))}/day` : "No daily rate";
  if (w.payBasis === "MONTHLY") return w.monthlySalary != null ? `${money(Number(w.monthlySalary))}/month` : "No salary set";
  if (w.payBasis === "PIECE_RATE") return w.pieceRate != null ? `${money(Number(w.pieceRate))}/${w.pieceUnit || "piece"}` : "No piece rate";
  return w.defaultHourlyRate != null ? `${money(Number(w.defaultHourlyRate))}/hour` : "No hourly rate";
}

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await tenantContext("workforce.view");
  const tab = (await searchParams).tab || "pending";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [farms, cycles, workers, pending, recent, monthSheets, presentToday, advances, accounts] = await Promise.all([
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm, status: { in: ["PLANNED", "ACTIVE", "PAUSED"] } }, orderBy: { name: "asc" } }),
    db.workforceMember.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm }, include: { farm: true }, orderBy: { name: "asc" } }),
    db.timesheet.findMany({ where: { tenantId: ctx.tenantId, status: "SUBMITTED", ...ctx.scope.byFarm }, include: { worker: true, farm: true, cycle: true }, orderBy: { workDate: "desc" }, take: 200 }),
    db.timesheet.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { worker: true, farm: true, cycle: true, payRun: { select: { runNo: true } } }, orderBy: [{ workDate: "desc" }, { createdAt: "desc" }], take: 100 }),
    db.timesheet.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm, status: "APPROVED", workDate: { gte: monthStart } }, select: { hours: true, hourlyRate: true, amount: true } }),
    db.timesheet.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm, workDate: { gte: today, lt: new Date(today.getTime() + 86_400_000) } }, distinct: ["workerId"], select: { workerId: true } }),
    db.workerAdvance.findMany({ where: { tenantId: ctx.tenantId, payRunId: null, ...ctx.scope.via("worker") }, include: { worker: true }, orderBy: { issuedAt: "desc" } }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const canManage = ctx.can("workforce.manage");
  const canAttend = canManage || ctx.can("workforce.attendance");
  const monthCost = monthSheets.reduce((s, t) => s + labourCost(t), 0);
  const advanceTotal = advances.reduce((s, a) => s + Number(a.amount), 0);
  const tabs = [["pending", `Awaiting approval (${pending.length})`], ["recent", "Recent work"], ["workers", `Workers (${workers.length})`], ["advances", `Advances (${advances.length})`]] as const;

  return <>
    <PageHeader eyebrow="People" title="Workers & attendance" description="Daily attendance, labour costs per farm and cycle, wage advances and approvals. Pay workers from Payroll." action={<Link className="button secondary small" href="/payroll">Go to payroll</Link>} />
    <section className="metrics">
      <MetricCard label="Active workers" value={String(workers.length)} hint={`${workers.filter(w => ["DAILY", "PIECE_RATE"].includes(w.payBasis)).length} casual / piece-rate`} icon={<Users size={18} />} />
      <MetricCard label="At work today" value={String(presentToday.length)} hint="From attendance & timesheets" icon={<UserCheck size={18} />} />
      <MetricCard label="Labour cost this month" value={money(monthCost)} hint="Approved work" icon={<Clock3 size={18} />} />
      <MetricCard label="Unrecovered advances" value={money(advanceTotal)} hint={`${pending.length} timesheets to approve`} icon={<HandCoins size={18} />} />
    </section>

    {canAttend && workers.length ? <AttendanceRegister workers={workers.map(w => ({ id: w.id, name: w.name, jobTitle: w.jobTitle, payBasis: w.payBasis, farmId: w.farmId, pieceUnit: w.pieceUnit }))} farms={farms.map(f => ({ id: f.id, name: f.name }))} cycles={cycles.map(c => ({ id: c.id, name: c.name, farmId: c.farmId }))} today={toDateInput(new Date())} /> : null}

    {canManage ? <div className="grid-2">
      <FormDetails title="Add worker" hint="Permanent staff, casual labourers, contractors and seasonal hands." open={!workers.length}>
        <ActionForm action={createWorkforceMemberAction} success="Worker added">
          <div className="form-grid two">
            <div className="field"><label>Full name</label><input name="name" required /></div>
            <div className="field"><label>Phone</label><input name="phone" type="tel" inputMode="tel" /></div>
            <div className="field"><label>Job / role</label><input name="jobTitle" placeholder="Farmhand / poultry attendant / driver" /></div>
            <div className="field"><label>Staff no.</label><input name="employeeNo" /></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">Shared / central</option>}{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Employment</label><select name="employmentType" defaultValue="TEMPORARY"><option value="PERMANENT">Permanent</option><option value="TEMPORARY">Casual / temporary</option><option value="SEASONAL">Seasonal</option><option value="CONTRACTOR">Contractor</option></select></div>
            <div className="field span-2"><label>How are they paid?</label><select name="payBasis" defaultValue="DAILY">{payBases.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>Daily rate</label><input name="dailyRate" type="number" inputMode="decimal" min="0" step="0.01" /></div>
            <div className="field"><label>Monthly salary</label><input name="monthlySalary" type="number" inputMode="decimal" min="0" step="0.01" /></div>
            <div className="field"><label>Hourly rate</label><input name="defaultHourlyRate" type="number" inputMode="decimal" min="0" step="0.01" /></div>
            <div className="field"><label>Piece rate &amp; unit</label><div style={{ display: "flex", gap: 6 }}><input name="pieceRate" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Rate" /><input name="pieceUnit" placeholder="crate" /></div></div>
            <div className="field"><label>Pay by</label><select name="paymentMethod" defaultValue=""><option value="">Not set</option>{paymentMethods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>Bank / mobile money number</label><input name="paymentAccount" /></div>
            <div className="field"><label>Start date</label><input name="startDate" type="date" /></div>
          </div>
          <div className="form-actions"><button className="button">Add worker</button></div>
        </ActionForm>
      </FormDetails>
      <div>
        <FormDetails title="Give a wage advance" hint="Recovered automatically from the worker's next pay run.">
          <ActionForm action={createAdvanceAction}>
            <div className="form-grid two">
              <div className="field span-2"><label>Worker</label><select name="workerId" required defaultValue=""><option value="" disabled>Select worker</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
              <div className="field"><label>Amount</label><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></div>
              <div className="field"><label>Date</label><input name="issuedAt" type="date" defaultValue={toDateInput(new Date())} /></div>
              <div className="field"><label>Paid from</label><select name="accountId" defaultValue=""><option value="">Not tracked</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div className="field"><label>Reason</label><input name="reason" placeholder="School fees, medical…" /></div>
            </div>
            <div className="form-actions"><button className="button">Record advance</button></div>
          </ActionForm>
        </FormDetails>
        <FormDetails title="Record individual work" hint="One worker, with a specific rate, hours or piece count.">
          <ActionForm action={createTimesheetAction} success="Work recorded">
            <div className="form-grid two">
              <div className="field"><label>Worker</label><select name="workerId" required defaultValue=""><option value="" disabled>Select worker</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
              <div className="field"><label>Date</label><input name="workDate" type="date" /></div>
              <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Worker&apos;s farm</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
              <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not allocated</option>{cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="field"><label>Hours</label><input name="hours" required type="number" min="0.25" step="0.25" defaultValue="8" /></div>
              <div className="field"><label>Pieces (piece-rate)</label><input name="pieceQuantity" type="number" min="0" step="any" /></div>
              <div className="field"><label>Pay amount override</label><input name="amount" type="number" min="0" step="0.01" placeholder="Auto from rate" /></div>
              <div className="field"><label>Status</label><select name="status" defaultValue="APPROVED"><option value="SUBMITTED">Needs approval</option><option value="APPROVED">Approved</option></select></div>
              <div className="field span-2"><label>Work done</label><input name="activity" required /></div>
            </div>
            <div className="form-actions"><button className="button">Save</button></div>
          </ActionForm>
        </FormDetails>
      </div>
    </div> : null}

    <div className="tabs">{tabs.map(([k, l]) => <Link key={k} href={`/workforce?tab=${k}`} className={tab === k ? "active" : ""}>{l}</Link>)}</div>

    {tab === "workers" ? (workers.length ? <div className="table-wrap"><table><thead><tr><th>Worker</th><th>Farm</th><th>Pay</th><th>Phone</th><th>Pay to</th></tr></thead><tbody>{workers.map(w => <tr key={w.id}><td><Link className="link" href={`/workforce/${w.id}`}>{w.name}</Link><div className="sub">{w.jobTitle || ""} {w.employeeNo ? `· ${w.employeeNo}` : ""}</div></td><td>{w.farm?.name || "Shared"}</td><td>{rateText(w, money)}<div className="sub">{label(w.employmentType)}</div></td><td>{w.phone || "—"}</td><td>{w.paymentMethod ? label(w.paymentMethod) : "—"}<div className="sub">{w.paymentAccount || ""}</div></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No workers yet" text="Add your farm staff and casual workers to start taking attendance." /></div>)
      : tab === "advances" ? (advances.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Worker</th><th>Reason</th><th className="text-right">Amount</th></tr></thead><tbody>{advances.map(a => <tr key={a.id}><td>{safeDate(a.issuedAt)}</td><td>{a.worker.name}</td><td>{a.reason || "—"}</td><td className="text-right">{money(a.amount)}</td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No outstanding advances" text="Advances given to workers appear here until they are recovered in payroll." /></div>)
        : tab === "recent" ? (recent.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Worker</th><th>Work</th><th>Farm / cycle</th><th>Hours</th><th className="text-right">Cost</th><th>Status</th></tr></thead><tbody>{recent.map(t => <tr key={t.id}><td>{safeDate(t.workDate)}</td><td>{t.worker.name}</td><td>{t.activity}{t.pieceQuantity ? <div className="sub">{formatNumber(t.pieceQuantity, 2)} {t.worker.pieceUnit || "pieces"}</div> : null}</td><td>{t.farm?.name || "Shared"}<div className="sub">{t.cycle?.name || ""}</div></td><td>{formatNumber(t.hours, 2)}</td><td className="text-right">{money(labourCost(t))}</td><td><span className={`status ${t.status === "SUBMITTED" ? "warn" : t.status === "REJECTED" ? "neutral" : ""}`}>{t.payRun ? `paid · ${t.payRun.runNo}` : t.status.toLowerCase()}</span></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No work recorded" text="Take attendance above to start building labour records." /></div>)
          : pending.length ? <div className="card">
            <div className="card-head"><h2>Awaiting approval</h2>{canManage ? <div className="inline-actions"><ActionForm action={bulkApproveTimesheetsAction} confirm={`Approve all ${pending.length} submitted timesheets?`}><input type="hidden" name="status" value="APPROVED" /><button className="button small">Approve all</button></ActionForm></div> : null}</div>
            <div className="table-wrap"><table><thead><tr><th>Date</th><th>Worker</th><th>Work</th><th>Farm / cycle</th><th>Hours</th><th className="text-right">Cost</th><th></th></tr></thead><tbody>{pending.map(t => <tr key={t.id}><td>{safeDate(t.workDate)}</td><td>{t.worker.name}</td><td>{t.activity}</td><td>{t.farm?.name || "Shared"}<div className="sub">{t.cycle?.name || ""}</div></td><td>{formatNumber(t.hours, 2)}</td><td className="text-right">{money(labourCost(t))}</td><td>{canManage ? <div className="inline-actions">
              <ActionForm action={updateTimesheetStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="APPROVED" /><button className="button secondary small">Approve</button></ActionForm>
              <ActionForm action={updateTimesheetStatusAction}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="REJECTED" /><button className="button secondary small">Reject</button></ActionForm>
            </div> : null}</td></tr>)}</tbody></table></div>
          </div> : <div className="card"><EmptyState title="Nothing to approve" text="Attendance taken by supervisors waits here for a manager's approval." /></div>}
  </>;
}
