import Link from "next/link";
import { AlarmClock, FileText, HandCoins, ReceiptText } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { createInvoiceAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { LineItemsEditor } from "@/components/line-items-editor";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { invoiceBalance, invoiceDisplayStatus } from "@/lib/ledger";
import { invoiceStatusClass, revenueTypes } from "@/lib/options";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, humanize, safeDate } from "@/lib/utils";

export const metadata = { title: "Invoices" };

const filters = [["open", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["void", "Void"], ["all", "All"]] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const ctx = await tenantContext("sales.view");
  const params = await searchParams;
  const filter = filters.some(([k]) => k === params.status) ? params.status! : "open";
  const q = (params.q || "").trim();
  const now = new Date();
  const where: Prisma.InvoiceWhereInput = { tenantId: ctx.tenantId, ...ctx.scope.byFarm };
  if (filter === "open") where.status = { in: ["ISSUED", "PARTIALLY_PAID"] };
  if (filter === "overdue") Object.assign(where, { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } });
  if (filter === "paid") where.status = "PAID";
  if (filter === "void") where.status = "VOID";
  if (q) where.OR = [{ invoiceNo: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }];
  const [invoices, openAgg, customers, products, farms, cycles] = await Promise.all([
    db.invoice.findMany({ where, include: { customer: true }, orderBy: [{ issueDate: "desc" }, { invoiceNo: "desc" }], take: 200 }),
    db.invoice.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, ...ctx.scope.byFarm }, select: { total: true, amountPaid: true, dueDate: true, status: true } }),
    db.customer.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["PLANNED", "ACTIVE", "PAUSED"] }, ...ctx.scope.byFarm }, orderBy: { name: "asc" } }),
  ]);
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);
  const outstanding = openAgg.reduce((s, i) => s + invoiceBalance(i), 0);
  const overdue = openAgg.filter(i => invoiceDisplayStatus(i) === "OVERDUE");
  // Ageing buckets help decide who to call first.
  const buckets = [0, 0, 0, 0];
  for (const i of overdue) {
    const days = (now.getTime() - i.dueDate!.getTime()) / 86_400_000;
    buckets[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3] += invoiceBalance(i);
  }

  return <>
    <PageHeader eyebrow="Sell & get paid" title="Invoices" description="Every bill you have issued, what has been paid and who still owes." action={<Link className="button secondary small" href="/sales">Orders &amp; customers</Link>} />
    <section className="metrics">
      <MetricCard label="Outstanding" value={money(outstanding)} hint={`${openAgg.length} unpaid invoices`} icon={<HandCoins size={16} />} />
      <MetricCard label="Overdue" value={money(overdue.reduce((s, i) => s + invoiceBalance(i), 0))} hint={`${overdue.length} invoices past due`} icon={<AlarmClock size={16} />} />
      <MetricCard label="1–30 days late" value={money(buckets[0])} hint={`31–60: ${money(buckets[1])}`} icon={<ReceiptText size={16} />} />
      <MetricCard label="Over 60 days late" value={money(buckets[2] + buckets[3])} hint={`90+: ${money(buckets[3])}`} icon={<FileText size={16} />} />
    </section>

    {ctx.can("sales.manage") ? <FormDetails title="Create invoice" hint="Bill a customer directly: services, tractor hire, or produce delivered without an order.">
      <ActionForm action={createInvoiceAction} reset={false}>
        <div className="form-grid">
          <div className="field span-2"><label>Customer</label><select name="customerId" defaultValue=""><option value="">New customer (enter name)</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>New customer name</label><input name="newCustomerName" placeholder="Only if not in the list" /></div>
          <div className="field"><label>Phone</label><input name="newCustomerPhone" type="tel" inputMode="tel" /></div>
          <div className="field"><label>Invoice date</label><input name="issueDate" type="date" /></div>
          <div className="field"><label>Due date</label><input name="dueDate" type="date" /></div>
          <div className="field"><label>Income type</label><select name="revenueType" defaultValue="HARVEST_SALE">{revenueTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">Organization-wide</option>}{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="field span-2"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field span-2"><label>Notes / payment instructions</label><input name="notes" placeholder="Bank / mobile money details shown on the invoice" /></div>
        </div>
        <LineItemsEditor products={products.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.sellingPrice != null ? Number(p.sellingPrice) : null }))} currency={ctx.tenant.currency} adjustments />
        <div className="form-actions"><button className="button">Issue invoice</button></div>
      </ActionForm>
    </FormDetails> : null}

    <div className="toolbar">
      <div className="segmented">{filters.map(([key, label]) => <Link key={key} href={`/sales/invoices?status=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={filter === key ? "active" : ""}>{label}</Link>)}</div>
      <form><input type="hidden" name="status" value={filter} /><input name="q" defaultValue={q} placeholder="Search invoice or customer" aria-label="Search invoices" /><button className="button secondary small">Search</button></form>
    </div>

    {invoices.length ? <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th></tr></thead><tbody>{invoices.map(i => {
      const status = invoiceDisplayStatus(i);
      return <tr key={i.id}>
        <td><Link className="link" href={`/sales/invoices/${i.id}`}>{i.invoiceNo}</Link><div className="sub">{safeDate(i.issueDate)}</div></td>
        <td>{i.customer.name}<div className="sub">{i.customer.phone || ""}</div></td>
        <td>{safeDate(i.dueDate)}</td>
        <td className="text-right">{money(i.total)}</td>
        <td className="text-right"><b>{i.status === "VOID" ? "—" : money(invoiceBalance(i))}</b></td>
        <td><span className={`status ${invoiceStatusClass(status)}`}>{humanize(status)}</span></td>
      </tr>;
    })}</tbody></table></div> : <div className="card"><EmptyState title="No invoices here" text={filter === "open" ? "Nobody owes you money right now." : "Try another filter."} /></div>}
  </>;
}
