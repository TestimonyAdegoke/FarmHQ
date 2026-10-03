import Link from "next/link";
import { AlarmClock, CircleDollarSign, HandCoins, ShoppingBag, Zap } from "lucide-react";
import { cancelSalesOrderAction, createSalesOrderAction, fulfillSalesOrderAction, saveCustomerAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { LineItemsEditor } from "@/components/line-items-editor";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { customerBalances } from "@/lib/ledger";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Sales" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await tenantContext("sales.view");
  const view = (await searchParams).view === "customers" ? "customers" : "orders";
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [customers, farms, cycles, warehouses, products, orders, balances, collected] = await Promise.all([
    db.customer.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["PLANNED", "ACTIVE", "PAUSED"] } }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.salesOrder.findMany({ where: { tenantId: ctx.tenantId }, include: { customer: true, farm: true, cycle: true, invoice: { select: { id: true, invoiceNo: true, status: true } }, items: { include: { product: true } } }, orderBy: { orderDate: "desc" }, take: 100 }),
    customerBalances(ctx.tenantId),
    db.paymentReceived.aggregate({ where: { tenantId: ctx.tenantId, receivedAt: { gte: monthStart } }, _sum: { amount: true } }),
  ]);
  const canManage = ctx.can("sales.manage");
  const receivable = [...balances.values()].reduce((s, b) => s + b.outstanding, 0);
  const overdue = [...balances.values()].reduce((s, b) => s + b.overdue, 0);
  const open = orders.filter(o => ["DRAFT", "CONFIRMED"].includes(o.status));
  const money = (n: number | string | { toString(): string }) => formatMoney(n, ctx.tenant.currency);

  return <>
    <PageHeader eyebrow="Sell & get paid" title="Sales" description="Customers, orders, deliveries and money owed to the farm." action={canManage ? <div className="inline-actions"><Link className="button" href="/sales/quick"><Zap size={16} /> Quick sale</Link><Link className="button secondary" href="/sales/invoices">Invoices</Link></div> : undefined} />
    <section className="metrics">
      <MetricCard label="Owed to you" value={money(receivable)} hint="Unpaid invoices" icon={<HandCoins size={18} />} />
      <MetricCard label="Overdue" value={money(overdue)} hint="Past due date" icon={<AlarmClock size={18} />} />
      <MetricCard label="Collected this month" value={money(collected._sum.amount || 0)} hint="Payments received" icon={<CircleDollarSign size={18} />} />
      <MetricCard label="Orders to deliver" value={String(open.length)} hint={`${customers.length} active customers`} icon={<ShoppingBag size={18} />} />
    </section>

    {canManage ? <div className="grid-2">
      <FormDetails title="New sales order" hint="For orders you will deliver later. For immediate sales use Quick sale.">
        <ActionForm action={createSalesOrderAction} success="Order created">
          <div className="form-grid two">
            <div className="field"><label>Customer</label><select name="customerId" required defaultValue=""><option value="" disabled>Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Deliver from store</label><select name="warehouseId" defaultValue=""><option value="">No stock movement</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Order date</label><input name="orderDate" type="date" /></div>
            <div className="field"><label>Delivery date</label><input name="deliveryDate" type="date" /></div>
          </div>
          <LineItemsEditor products={products.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.sellingPrice != null ? Number(p.sellingPrice) : null }))} currency={ctx.tenant.currency} />
          <div className="form-grid two" style={{ marginTop: 12 }}>
            <div className="field"><label>Status</label><select name="status" defaultValue="CONFIRMED"><option value="CONFIRMED">Confirmed</option><option value="DRAFT">Draft / quotation</option></select></div>
            <div className="field"><label>Notes</label><input name="notes" /></div>
          </div>
          <div className="form-actions"><button className="button" disabled={!customers.length}>Create order</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Add customer" hint="Buyers, off-takers, market traders and processors.">
        <ActionForm action={saveCustomerAction}>
          <div className="form-grid two">
            <div className="field span-2"><label>Name</label><input name="name" required /></div>
            <div className="field"><label>Phone / WhatsApp</label><input name="phone" type="tel" inputMode="tel" /></div>
            <div className="field"><label>Email</label><input name="email" type="email" /></div>
            <div className="field"><label>Payment terms (days)</label><input name="paymentTermsDays" type="number" min="0" step="1" placeholder="0 = cash, 30 = 30 days" /></div>
            <div className="field"><label>Credit limit</label><input name="creditLimit" type="number" min="0" step="0.01" /></div>
            <div className="field span-2"><label>Address / market location</label><input name="address" /></div>
          </div>
          <div className="form-actions"><button className="button">Add customer</button></div>
        </ActionForm>
      </FormDetails>
    </div> : null}

    <div className="tabs"><Link href="/sales" className={view === "orders" ? "active" : ""}>Orders</Link><Link href="/sales?view=customers" className={view === "customers" ? "active" : ""}>Customers &amp; balances</Link></div>

    {view === "customers" ? (customers.length ? <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>Terms</th><th className="text-right">Owed</th><th className="text-right">Overdue</th><th></th></tr></thead><tbody>{customers.map(c => {
      const b = balances.get(c.id);
      const overLimit = c.creditLimit != null && (b?.outstanding || 0) > Number(c.creditLimit);
      return <tr key={c.id}><td><Link className="link" href={`/sales/customers/${c.id}`}>{c.name}</Link>{overLimit ? <div><span className="status warn">Over credit limit</span></div> : null}</td><td>{c.phone || "—"}<div className="sub">{c.email || ""}</div></td><td>{c.paymentTermsDays ? `${c.paymentTermsDays} days` : "Cash"}</td><td className="text-right">{money(b?.outstanding || 0)}</td><td className="text-right">{b?.overdue ? <span className="status danger">{money(b.overdue)}</span> : "—"}</td><td><Link className="button secondary small" href={`/sales/customers/${c.id}`}>Statement</Link></td></tr>;
    })}</tbody></table></div> : <div className="card"><EmptyState title="No customers yet" text="Add your buyers so you can track what each one owes." /></div>)
      : orders.length ? <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Farm / cycle</th><th className="text-right">Value</th><th>Status</th><th></th></tr></thead><tbody>{orders.map(o => {
        const total = o.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
        const first = o.items[0];
        return <tr key={o.id}>
          <td><b>{o.orderNo}</b><div className="sub">{safeDate(o.orderDate)}</div></td>
          <td>{o.customer.name}</td>
          <td>{first?.product?.name || first?.description || "—"}<div className="sub">{first ? `${formatNumber(first.quantity, 3)} ${first.unit}` : ""}{o.items.length > 1 ? ` · +${o.items.length - 1} more` : ""}</div></td>
          <td>{o.farm?.name || "Organization"}<div className="sub">{o.cycle?.name || ""}</div></td>
          <td className="text-right">{money(total)}</td>
          <td><span className={`status ${o.status === "CANCELLED" ? "neutral" : ["DRAFT", "CONFIRMED"].includes(o.status) ? "info" : ""}`}>{o.status === "INVOICED" ? "Delivered" : o.status.toLowerCase()}</span></td>
          <td><div className="inline-actions">
            {o.invoice ? <Link className="button secondary small" href={`/sales/invoices/${o.invoice.id}`}>{o.invoice.invoiceNo}</Link> : null}
            {canManage && ["DRAFT", "CONFIRMED"].includes(o.status) ? <>
              <ActionForm action={fulfillSalesOrderAction} confirm={`Deliver ${o.orderNo} and issue the invoice?`}><input type="hidden" name="id" value={o.id} /><button className="button small">Deliver &amp; invoice</button></ActionForm>
              <ActionForm action={cancelSalesOrderAction} confirm={`Cancel ${o.orderNo}?`}><input type="hidden" name="id" value={o.id} /><button className="button secondary small">Cancel</button></ActionForm>
            </> : null}
          </div></td>
        </tr>;
      })}</tbody></table></div> : <div className="card"><EmptyState title="No sales orders" text="Use Quick sale for cash sales, or create an order to deliver later." /></div>}
  </>;
}
