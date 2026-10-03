import { ArrowDownLeft, ArrowUpRight, Landmark, Smartphone, Wallet } from "lucide-react";
import { createMoneyAccountAction, toggleMoneyAccountAction, transferFundsAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { accountBalances } from "@/lib/ledger";
import { label } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, safeDate, toDateInput } from "@/lib/utils";

export const metadata = { title: "Cash & Bank" };

type Movement = { date: Date; account: string; text: string; ref?: string | null; amount: number };

export default async function AccountsPage() {
  const ctx = await tenantContext("finance.view");
  const t = ctx.tenantId;
  const [accounts, balances, receipts, vendorPaid, expenses, transfers, advances, payRuns] = await Promise.all([
    db.moneyAccount.findMany({ where: { tenantId: t }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    accountBalances(t),
    db.paymentReceived.findMany({ where: { tenantId: t, accountId: { not: null } }, include: { account: true, customer: true }, orderBy: { receivedAt: "desc" }, take: 40 }),
    db.vendorPayment.findMany({ where: { tenantId: t, accountId: { not: null } }, include: { account: true, vendor: true }, orderBy: { paidAt: "desc" }, take: 40 }),
    db.expense.findMany({ where: { tenantId: t, status: "PAID", accountId: { not: null } }, include: { account: true }, orderBy: { paidAt: "desc" }, take: 40 }),
    db.accountTransfer.findMany({ where: { tenantId: t }, include: { fromAccount: true, toAccount: true }, orderBy: { transferredAt: "desc" }, take: 40 }),
    db.workerAdvance.findMany({ where: { tenantId: t, accountId: { not: null } }, include: { account: true, worker: true }, orderBy: { issuedAt: "desc" }, take: 40 }),
    db.payRun.findMany({ where: { tenantId: t, status: "PAID", accountId: { not: null } }, include: { account: true, lines: { select: { netPay: true } } }, orderBy: { paidAt: "desc" }, take: 20 }),
  ]);
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const active = accounts.filter(a => a.active);
  const total = active.reduce((s, a) => s + (balances.get(a.id)?.balance || 0), 0);
  const byType = (type: string) => active.filter(a => a.type === type).reduce((s, a) => s + (balances.get(a.id)?.balance || 0), 0);
  const movements: Movement[] = [
    ...receipts.map(r => ({ date: r.receivedAt, account: r.account!.name, text: `Payment from ${r.customer.name}`, ref: r.receiptNo, amount: Number(r.amount) })),
    ...vendorPaid.map(p => ({ date: p.paidAt, account: p.account!.name, text: `Paid supplier ${p.vendor.name}`, ref: p.reference, amount: -Number(p.amount) })),
    ...expenses.map(e => ({ date: e.paidAt || e.incurredAt, account: e.account!.name, text: `${e.category}: ${e.description}`, ref: e.reference, amount: -Number(e.amount) })),
    ...transfers.flatMap(x => [
      { date: x.transferredAt, account: x.fromAccount.name, text: `Transfer to ${x.toAccount.name}`, ref: x.reference, amount: -Number(x.amount) },
      { date: x.transferredAt, account: x.toAccount.name, text: `Transfer from ${x.fromAccount.name}`, ref: x.reference, amount: Number(x.amount) },
    ]),
    ...advances.map(a => ({ date: a.issuedAt, account: a.account!.name, text: `Wage advance to ${a.worker.name}`, ref: a.reason, amount: -Number(a.amount) })),
    ...payRuns.map(r => ({ date: r.paidAt || r.updatedAt, account: r.account!.name, text: `Payroll ${r.runNo}`, ref: r.runNo, amount: -r.lines.reduce((s, l) => s + Number(l.netPay), 0) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 60);
  const canManage = ctx.can("finance.manage");

  return <>
    <PageHeader eyebrow="Money" title="Cash & bank" description="Know exactly how much money the farm has, and where: cash box, bank accounts and mobile-money wallets." />
    <section className="metrics">
      <MetricCard label="Total available" value={money(total)} hint={`${active.length} active accounts`} icon={<Wallet size={18} />} />
      <MetricCard label="Cash" value={money(byType("CASH"))} hint="Cash boxes / petty cash" icon={<Wallet size={18} />} />
      <MetricCard label="Bank" value={money(byType("BANK"))} hint="Bank accounts" icon={<Landmark size={18} />} />
      <MetricCard label="Mobile money" value={money(byType("MOBILE_MONEY"))} hint="Wallets (M-Pesa, MoMo, OPay…)" icon={<Smartphone size={18} />} />
    </section>

    {canManage ? <div className="grid-2">
      <FormDetails title="Add account" hint="Start with what you have today as the opening balance." open={!accounts.length}>
        <ActionForm action={createMoneyAccountAction}>
          <div className="form-grid two">
            <div className="field"><label>Name</label><input name="name" required placeholder="Farm cash box / GTBank / MTN MoMo" /></div>
            <div className="field"><label>Type</label><select name="type" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK">Bank account</option><option value="MOBILE_MONEY">Mobile money</option><option value="OTHER">Other</option></select></div>
            <div className="field"><label>Bank / provider</label><input name="provider" placeholder="e.g. Access Bank, M-Pesa" /></div>
            <div className="field"><label>Account / wallet number</label><input name="accountNumber" /></div>
            <div className="field span-2"><label>Opening balance ({ctx.tenant.currency})</label><input name="openingBalance" type="number" step="0.01" defaultValue="0" /></div>
          </div>
          <div className="form-actions"><button className="button">Add account</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Move money between accounts" hint="e.g. banking cash sales, or loading a mobile-money wallet.">
        <ActionForm action={transferFundsAction}>
          <div className="form-grid two">
            <div className="field"><label>From</label><select name="fromAccountId" required defaultValue=""><option value="" disabled>Select</option>{active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field"><label>To</label><select name="toAccountId" required defaultValue=""><option value="" disabled>Select</option>{active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field"><label>Amount</label><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required /></div>
            <div className="field"><label>Date</label><input name="transferredAt" type="date" defaultValue={toDateInput(new Date())} /></div>
            <div className="field span-2"><label>Reference</label><input name="reference" placeholder="Deposit slip / transaction ID" /></div>
          </div>
          <div className="form-actions"><button className="button" disabled={active.length < 2}>Record transfer</button></div>
        </ActionForm>
      </FormDetails>
    </div> : null}

    {accounts.length ? <div className="table-wrap" style={{ marginBottom: 20 }}><table><thead><tr><th>Account</th><th>Type</th><th className="text-right">Opening</th><th className="text-right">Money in</th><th className="text-right">Money out</th><th className="text-right">Balance</th><th></th></tr></thead><tbody>{accounts.map(a => {
      const b = balances.get(a.id);
      return <tr key={a.id} style={a.active ? undefined : { opacity: .55 }}>
        <td><b>{a.name}</b><div className="sub">{[a.provider, a.accountNumber].filter(Boolean).join(" · ")}</div></td>
        <td>{label(a.type)}</td>
        <td className="text-right">{money(a.openingBalance)}</td>
        <td className="text-right">{money(b?.inflow || 0)}</td>
        <td className="text-right">{money(b?.outflow || 0)}</td>
        <td className="text-right"><span className={`status ${(b?.balance || 0) < 0 ? "danger" : ""}`}>{money(b?.balance || 0)}</span></td>
        <td>{canManage ? <ActionForm action={toggleMoneyAccountAction}><input type="hidden" name="id" value={a.id} /><button className="button secondary small">{a.active ? "Archive" : "Restore"}</button></ActionForm> : null}</td>
      </tr>;
    })}</tbody></table></div> : <div className="card" style={{ marginBottom: 20 }}><EmptyState title="No accounts yet" text="Add your cash box, bank account and mobile-money wallet to track the farm's money." /></div>}

    <div className="card"><div className="card-head"><h2>Recent money movements</h2></div>
      {movements.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Details</th><th className="text-right">Amount</th></tr></thead><tbody>{movements.map((m, i) => <tr key={i}><td>{safeDate(m.date)}</td><td>{m.account}</td><td>{m.text}<div className="sub">{m.ref || ""}</div></td><td className="text-right nowrap">{m.amount >= 0 ? <span style={{ color: "var(--brand)" }}><ArrowDownLeft size={13} /> {money(m.amount)}</span> : <span style={{ color: "var(--danger)" }}><ArrowUpRight size={13} /> {money(-m.amount)}</span>}</td></tr>)}</tbody></table></div> : <p className="muted">Payments, expenses, transfers and wages paid through an account appear here.</p>}
    </div>
  </>;
}
