import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { setPayRunStatusAction, updatePayRunLineAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { db } from "@/lib/db";
import { label } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate, whatsappLink } from "@/lib/utils";

export const metadata = { title: "Pay run" };

const unitLabel: Record<string, string> = { HOURLY: "hours", DAILY: "days", MONTHLY: "months", PIECE_RATE: "pieces" };
const unitsOf = (l: { basis: string; worker: { pieceUnit: string | null } }) => l.basis === "PIECE_RATE" && l.worker.pieceUnit ? `${l.worker.pieceUnit}s` : unitLabel[l.basis];

export default async function PayRunPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await tenantContext("workforce.view");
  const { id } = await params;
  const [run, accounts] = await Promise.all([
    db.payRun.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { account: true, lines: { include: { worker: true }, orderBy: { worker: { name: "asc" } } } } }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!run) notFound();
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const sum = (key: "grossPay" | "allowances" | "deductions" | "advanceRecovery" | "netPay") => run.lines.reduce((s, l) => s + Number(l[key]), 0);
  const editable = run.status === "DRAFT" && ctx.can("workforce.manage");
  const period = `${safeDate(run.periodStart)} – ${safeDate(run.periodEnd)}`;
  const payslipText = (l: (typeof run.lines)[number]) => [
    `${ctx.tenant.name} payslip`, `${l.worker.name} · ${run.runNo}`, `Period: ${period}`,
    `Gross pay: ${money(l.grossPay)} (${formatNumber(l.units, 2)} ${unitsOf(l)})`,
    Number(l.allowances) ? `Allowances: ${money(l.allowances)}` : "", Number(l.deductions) ? `Deductions: ${money(l.deductions)}` : "",
    Number(l.advanceRecovery) ? `Advance recovered: ${money(l.advanceRecovery)}` : "", `Net pay: ${money(l.netPay)}`,
  ].filter(Boolean).join("\n");

  return <>
    <div className="doc-actions no-print">
      <Link href="/payroll" className="button secondary small"><ArrowLeft size={15} /> Payroll</Link>
      <PrintButton label="Print payroll sheet" />
    </div>
    <article className="doc" style={{ maxWidth: "none" }}>
      <div className="doc-head">
        <div><h1>{ctx.tenant.name}</h1><div className="muted" style={{ marginTop: 6 }}>Payroll sheet · {period}</div></div>
        <div style={{ textAlign: "right" }}><div className="eyebrow">Pay run</div><h2 style={{ margin: "6px 0" }}>{run.runNo}</h2>{run.status === "PAID" ? <span className="stamp paid">PAID</span> : <span className={`status ${run.status === "CANCELLED" ? "neutral" : "warn"}`}>{run.status.toLowerCase()}</span>}</div>
      </div>
      <div className="doc-meta">
        <div><small>Workers</small>{run.lines.length}</div>
        <div><small>Total net pay</small><b>{money(sum("netPay"))}</b></div>
        <div><small>Paid from</small>{run.account?.name || "—"}{run.paidAt ? <div className="sub">{safeDate(run.paidAt)}</div> : null}</div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Worker</th><th>Basis</th><th className="text-right">Units</th><th className="text-right">Gross</th><th className="text-right">Allowances</th><th className="text-right">Deductions</th><th className="text-right">Advance</th><th className="text-right">Net pay</th><th className="no-print"></th></tr></thead><tbody>
        {run.lines.map(l => <tr key={l.id}>
          <td><b>{l.worker.name}</b><div className="sub">{l.paymentMethod ? label(l.paymentMethod) : ""} {l.worker.paymentAccount || ""}</div>{l.notes ? <div className="sub">{l.notes}</div> : null}</td>
          <td>{label(l.basis)}</td>
          <td className="text-right">{formatNumber(l.units, 2)} {unitsOf(l)}</td>
          <td className="text-right">{money(l.grossPay)}</td>
          {editable ? <td colSpan={2} className="no-print"><ActionForm action={updatePayRunLineAction} reset={false}><input type="hidden" name="id" value={l.id} /><div className="inline-actions" style={{ justifyContent: "flex-end" }}><input name="allowances" type="number" min="0" step="0.01" defaultValue={Number(l.allowances)} aria-label="Allowances" style={{ width: 100 }} /><input name="deductions" type="number" min="0" step="0.01" defaultValue={Number(l.deductions)} aria-label="Deductions" style={{ width: 100 }} /><button className="button secondary small">Update</button></div></ActionForm></td> : <><td className="text-right">{money(l.allowances)}</td><td className="text-right">{money(l.deductions)}</td></>}
          <td className="text-right">{Number(l.advanceRecovery) ? `−${money(l.advanceRecovery)}` : "—"}</td>
          <td className="text-right"><b>{money(l.netPay)}</b></td>
          <td className="no-print">{l.worker.phone ? <a className="icon-button" title="Send payslip on WhatsApp" href={whatsappLink(l.worker.phone, payslipText(l))} target="_blank" rel="noreferrer"><MessageCircle size={15} /></a> : null}</td>
        </tr>)}
      </tbody><tfoot><tr><td colSpan={3}><b>Totals</b></td><td className="text-right"><b>{money(sum("grossPay"))}</b></td><td className="text-right">{money(sum("allowances"))}</td><td className="text-right">{money(sum("deductions"))}</td><td className="text-right">{money(sum("advanceRecovery"))}</td><td className="text-right"><b>{money(sum("netPay"))}</b></td><td className="no-print"></td></tr></tfoot></table></div>
      <div className="grid-2" style={{ marginTop: 40 }}><div><div style={{ borderTop: "1px solid var(--ink)", paddingTop: 6 }} className="small-text">Prepared by</div></div><div><div style={{ borderTop: "1px solid var(--ink)", paddingTop: 6 }} className="small-text">Approved by</div></div></div>
    </article>

    <div className="inline-actions no-print" style={{ marginTop: 20 }}>
      {run.status === "DRAFT" && ctx.can("workforce.manage") ? <ActionForm action={setPayRunStatusAction} confirm="Approve this pay run? Lines can no longer be edited."><input type="hidden" name="id" value={run.id} /><input type="hidden" name="status" value="APPROVED" /><button className="button">Approve pay run</button></ActionForm> : null}
      {run.status === "APPROVED" && ctx.can("finance.manage") ? <ActionForm action={setPayRunStatusAction} confirm={`Record ${money(sum("netPay"))} as paid?`}><input type="hidden" name="id" value={run.id} /><input type="hidden" name="status" value="PAID" /><select name="accountId" required defaultValue=""><option value="" disabled>Paid from account…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="button">Mark as paid</button></ActionForm> : null}
      {run.status === "APPROVED" && ctx.can("workforce.manage") ? <ActionForm action={setPayRunStatusAction}><input type="hidden" name="id" value={run.id} /><input type="hidden" name="status" value="DRAFT" /><button className="button secondary">Back to draft</button></ActionForm> : null}
      {["DRAFT", "APPROVED"].includes(run.status) && ctx.can("workforce.manage") ? <ActionForm action={setPayRunStatusAction} confirm="Cancel this pay run? The work and advances become available for a new pay run."><input type="hidden" name="id" value={run.id} /><input type="hidden" name="status" value="CANCELLED" /><button className="button secondary">Cancel pay run</button></ActionForm> : null}
      {run.status === "APPROVED" && !ctx.can("finance.manage") ? <span className="muted small-text">Waiting for someone with finance access to record payment.</span> : null}
    </div>
  </>;
}
