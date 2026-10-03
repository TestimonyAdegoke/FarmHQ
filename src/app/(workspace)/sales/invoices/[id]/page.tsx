import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { recordInvoicePaymentAction, voidInvoiceAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { db } from "@/lib/db";
import { invoiceBalance, invoiceDisplayStatus } from "@/lib/ledger";
import { invoiceStatusClass, label, paymentMethods } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, humanize, safeDate, toDateInput, whatsappLink } from "@/lib/utils";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const ctx = await tenantContext("sales.view");
  const { id } = await params;
  const created = (await searchParams).created === "1";
  const [invoice, accounts] = await Promise.all([
    db.invoice.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { customer: true, items: { include: { product: true } }, payments: { include: { account: true }, orderBy: { receivedAt: "asc" } }, salesOrder: { select: { orderNo: true } } } }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!invoice) notFound();
  const farm = invoice.farmId ? await db.farm.findFirst({ where: { id: invoice.farmId, tenantId: ctx.tenantId }, select: { name: true, address: true, state: true, country: true } }) : null;
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const balance = invoiceBalance(invoice);
  const status = invoiceDisplayStatus(invoice);
  const open = ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status);
  const canCollect = ctx.can("sales.manage") || ctx.can("finance.manage");
  const shareText = [
    ctx.tenant.name,
    `Invoice ${invoice.invoiceNo} for ${invoice.customer.name}`,
    ...invoice.items.map(i => `• ${i.description}: ${formatNumber(i.quantity, 3)} ${i.unit} x ${money(i.unitPrice)}`),
    `Total: ${money(invoice.total)}`,
    `Paid: ${money(invoice.amountPaid)}`,
    `Balance due: ${money(balance)}${invoice.dueDate && balance > 0 ? ` by ${safeDate(invoice.dueDate)}` : ""}`,
    invoice.notes || "",
    "Thank you for your business.",
  ].filter(Boolean).join("\n");

  return <>
    <div className="doc-actions no-print">
      <Link href="/sales/invoices" className="button secondary small"><ArrowLeft size={15} /> Invoices</Link>
      <PrintButton />
      <a className="button secondary small" href={whatsappLink(invoice.customer.phone, shareText)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Send on WhatsApp</a>
      <Link href={`/sales/customers/${invoice.customerId}`} className="button secondary small">Customer statement</Link>
    </div>
    {created ? <div className="success-banner no-print">Saved. {balance > 0 ? "Share the invoice with the customer, or record a payment below." : "The invoice is fully paid. Share the receipt with the customer."}</div> : null}

    <article className="doc">
      <div className="doc-head">
        <div><h1>{ctx.tenant.name}</h1><div className="muted" style={{ marginTop: 6 }}>{farm ? [farm.name, farm.address, farm.state, farm.country].filter(Boolean).join(", ") : ""}</div></div>
        <div className="text-right">
          <div className="eyebrow">{invoice.status === "PAID" ? "Invoice & receipt" : "Invoice"}</div>
          <h2 style={{ margin: "6px 0" }}>{invoice.invoiceNo}</h2>
          {invoice.status === "PAID" ? <span className="stamp paid">PAID</span> : invoice.status === "VOID" ? <span className="stamp void">VOID</span> : <span className={`status ${invoiceStatusClass(status)}`}>{humanize(status)}</span>}
        </div>
      </div>
      <div className="doc-meta">
        <div><small>Bill to</small><b>{invoice.customer.name}</b><div>{invoice.customer.phone || ""}</div><div className="muted">{invoice.customer.address || ""}</div></div>
        <div><small>Invoice date</small>{safeDate(invoice.issueDate)}<small style={{ marginTop: 10 }}>Due date</small>{invoice.dueDate ? safeDate(invoice.dueDate) : "On receipt"}</div>
        <div><small>Order reference</small>{invoice.salesOrder?.orderNo || "—"}<small style={{ marginTop: 10 }}>Balance due</small><b>{money(balance)}</b></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead><tbody>
        {invoice.items.map(i => <tr key={i.id}><td>{i.description}</td><td className="text-right nowrap">{formatNumber(i.quantity, 3)} {i.unit}</td><td className="text-right">{money(i.unitPrice)}</td><td className="text-right">{money(i.lineTotal)}</td></tr>)}
      </tbody></table></div>
      <div className="doc-totals">
        <div><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
        {Number(invoice.discount) ? <div><span>Discount</span><span>−{money(invoice.discount)}</span></div> : null}
        {Number(invoice.tax) ? <div><span>Tax / VAT</span><span>{money(invoice.tax)}</span></div> : null}
        <div className="grand"><span>Total</span><span>{money(invoice.total)}</span></div>
        <div><span>Paid</span><span>{money(invoice.amountPaid)}</span></div>
        <div><b>Balance due</b><b>{money(balance)}</b></div>
      </div>
      {invoice.payments.length ? <><h3 style={{ marginTop: 26 }}>Payments received</h3><div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th></tr></thead><tbody>{invoice.payments.map(p => <tr key={p.id}><td><b>{p.receiptNo}</b></td><td>{safeDate(p.receivedAt)}</td><td>{label(p.method)}<div className="sub">{p.account?.name || ""}</div></td><td>{p.reference || "—"}</td><td className="text-right">{money(p.amount)}</td></tr>)}</tbody></table></div></> : null}
      {invoice.notes ? <p className="muted" style={{ whiteSpace: "pre-wrap", marginTop: 20 }}>{invoice.notes}</p> : null}
      <p className="muted small-text" style={{ marginTop: 26 }}>Thank you for your business.</p>
    </article>

    {open && canCollect ? <div className="grid-2 no-print">
      <ActionForm action={recordInvoicePaymentAction} className="form-card" success="Payment saved">
        <div className="card-head"><div><h2>Record payment</h2><div className="card-sub">Balance due {money(balance)}</div></div></div>
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <div className="form-grid two">
          <div className="field"><label>Amount</label><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" max={balance} defaultValue={balance.toFixed(2)} required /></div>
          <div className="field"><label>Date</label><input name="receivedAt" type="date" defaultValue={toDateInput(new Date())} /></div>
          <div className="field"><label>Method</label><select name="method" defaultValue="CASH">{paymentMethods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>Into account</label><select name="accountId" defaultValue=""><option value="">Not tracked</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field span-2"><label>Reference</label><input name="reference" placeholder="Transfer / mobile money transaction ID" /></div>
        </div>
        <div className="form-actions"><button className="button">Save payment</button></div>
      </ActionForm>
      {ctx.can("sales.manage") && Number(invoice.amountPaid) === 0 ? <ActionForm action={voidInvoiceAction} className="form-card" confirm="Void this invoice? Its revenue will be removed from your reports." success="Invoice voided">
        <div className="card-head"><div><h2>Void invoice</h2><div className="card-sub">Only for invoices issued in error. Stock is not returned automatically; post a stock return if goods came back.</div></div></div>
        <input type="hidden" name="id" value={invoice.id} />
        <div className="field"><label>Reason</label><input name="reason" required placeholder="Wrong customer / duplicate / price error" /></div>
        <div className="form-actions"><button className="button danger">Void invoice</button></div>
      </ActionForm> : null}
    </div> : null}
  </>;
}
