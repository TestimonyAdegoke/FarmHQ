import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { receiveCustomerPaymentAction, saveCustomerAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { db } from "@/lib/db";
import { invoiceBalance, isOverdue } from "@/lib/ledger";
import { label, paymentMethods } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, safeDate, toDateInput, whatsappLink } from "@/lib/utils";
import { AlarmClock, HandCoins, ReceiptText, Wallet } from "lucide-react";

export const metadata = { title: "Customer statement" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await tenantContext("sales.view");
  const { id } = await params;
  const [customer, accounts] = await Promise.all([
    db.customer.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { invoices: { orderBy: { issueDate: "asc" } }, payments: { orderBy: { receivedAt: "asc" }, include: { invoice: { select: { invoiceNo: true } } } } } }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!customer) notFound();
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const live = customer.invoices.filter(i => i.status !== "VOID" && i.status !== "DRAFT");
  const openInvoices = live.filter(i => ["ISSUED", "PARTIALLY_PAID"].includes(i.status));
  const outstanding = openInvoices.reduce((s, i) => s + invoiceBalance(i), 0);
  const overdue = openInvoices.filter(i => isOverdue(i)).reduce((s, i) => s + invoiceBalance(i), 0);
  const credit = customer.payments.filter(p => !p.invoiceId).reduce((s, p) => s + Number(p.amount), 0);
  const billed = live.reduce((s, i) => s + Number(i.total), 0);
  const entries = [
    ...live.map(i => ({ date: i.issueDate, ref: i.invoiceNo, href: `/sales/invoices/${i.id}`, text: "Invoice", debit: Number(i.total), credit: 0 })),
    ...customer.payments.map(p => ({ date: p.receivedAt, ref: p.receiptNo, href: p.invoiceId ? `/sales/invoices/${p.invoiceId}` : undefined, text: `Payment (${label(p.method)})${p.invoice ? ` for ${p.invoice.invoiceNo}` : " on account"}`, debit: 0, credit: Number(p.amount) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
    .reduce<{ rows: { date: Date; ref: string; href?: string; text: string; debit: number; credit: number; balance: number }[]; balance: number }>((acc, e) => {
      const balance = acc.balance + e.debit - e.credit;
      return { rows: [...acc.rows, { ...e, balance }], balance };
    }, { rows: [], balance: 0 }).rows;
  const net = outstanding - credit;
  const reminder = `Hello ${customer.name}, this is ${ctx.tenant.name}. Your account balance is ${money(net)}${overdue ? `, of which ${money(overdue)} is overdue` : ""}. Open invoices: ${openInvoices.map(i => `${i.invoiceNo} (${money(invoiceBalance(i))})`).join(", ") || "none"}. Thank you.`;

  return <>
    <div className="doc-actions no-print">
      <Link href="/sales?view=customers" className="button secondary small"><ArrowLeft size={15} /> Customers</Link>
      <PrintButton label="Print statement" />
      {net > 0 ? <a className="button secondary small" href={whatsappLink(customer.phone, reminder)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Send reminder</a> : null}
    </div>
    <PageHeader eyebrow="Customer statement" title={customer.name} description={[customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "No contact details yet"} />
    <section className="metrics">
      <MetricCard label="Balance owed" value={money(net)} hint={credit ? `after ${money(credit)} credit` : "Open invoices"} icon={<HandCoins size={18} />} />
      <MetricCard label="Overdue" value={money(overdue)} hint={customer.paymentTermsDays ? `${customer.paymentTermsDays}-day terms` : "Cash terms"} icon={<AlarmClock size={18} />} />
      <MetricCard label="Total billed" value={money(billed)} hint={`${live.length} invoices`} icon={<ReceiptText size={18} />} />
      <MetricCard label="Credit limit" value={customer.creditLimit != null ? money(customer.creditLimit) : "None"} hint={customer.creditLimit != null && outstanding > Number(customer.creditLimit) ? "Limit exceeded" : "Within limit"} icon={<Wallet size={18} />} />
    </section>

    <div className="grid-2 no-print" style={{ marginBottom: 20 }}>
      {(ctx.can("sales.manage") || ctx.can("finance.manage")) && outstanding > 0 ? <FormDetails title="Receive payment" hint="Applied to the oldest unpaid invoices first." open>
        <ActionForm action={receiveCustomerPaymentAction}>
          <input type="hidden" name="customerId" value={customer.id} />
          <div className="form-grid two">
            <div className="field"><label>Amount</label><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={outstanding.toFixed(2)} /></div>
            <div className="field"><label>Date</label><input name="receivedAt" type="date" defaultValue={toDateInput(new Date())} /></div>
            <div className="field"><label>Method</label><select name="method" defaultValue="CASH">{paymentMethods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>Into account</label><select name="accountId" defaultValue=""><option value="">Not tracked</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field span-2"><label>Reference</label><input name="reference" /></div>
          </div>
          <div className="form-actions"><button className="button">Save payment</button></div>
        </ActionForm>
      </FormDetails> : <div />}
      {ctx.can("sales.manage") ? <FormDetails title="Edit customer details">
        <ActionForm action={saveCustomerAction} reset={false}>
          <input type="hidden" name="id" value={customer.id} />
          <div className="form-grid two">
            <div className="field span-2"><label>Name</label><input name="name" required defaultValue={customer.name} /></div>
            <div className="field"><label>Phone / WhatsApp</label><input name="phone" type="tel" defaultValue={customer.phone || ""} /></div>
            <div className="field"><label>Email</label><input name="email" type="email" defaultValue={customer.email || ""} /></div>
            <div className="field"><label>Payment terms (days)</label><input name="paymentTermsDays" type="number" min="0" defaultValue={customer.paymentTermsDays ?? ""} /></div>
            <div className="field"><label>Credit limit</label><input name="creditLimit" type="number" min="0" step="0.01" defaultValue={customer.creditLimit ? Number(customer.creditLimit) : ""} /></div>
            <div className="field span-2"><label>Address</label><input name="address" defaultValue={customer.address || ""} /></div>
          </div>
          <div className="form-actions"><button className="button">Save</button></div>
        </ActionForm>
      </FormDetails> : null}
    </div>

    <div className="card"><div className="card-head"><h2>Account activity</h2><span className="muted small-text">As of {safeDate(new Date())}</span></div>
      {entries.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Document</th><th>Details</th><th className="text-right">Billed</th><th className="text-right">Paid</th><th className="text-right">Balance</th></tr></thead><tbody>{entries.map((e, i) => {
        return <tr key={i}><td>{safeDate(e.date)}</td><td>{e.href ? <Link className="link" href={e.href}>{e.ref}</Link> : e.ref}</td><td>{e.text}</td><td className="text-right">{e.debit ? money(e.debit) : ""}</td><td className="text-right">{e.credit ? money(e.credit) : ""}</td><td className="text-right"><b>{money(e.balance)}</b></td></tr>;
      })}</tbody></table></div> : <p className="muted">No invoices or payments yet.</p>}
    </div>
  </>;
}
