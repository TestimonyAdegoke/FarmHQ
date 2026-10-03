import { Building2, CheckCircle2, PackageCheck, ShoppingCart } from "lucide-react";
import { createPurchaseOrderAction, createPurchaseRequestAction, createVendorAction, receivePurchaseOrderAction, updatePurchaseRequestStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, humanize, safeDate, toDateInput } from "@/lib/utils";
import { recordVendorPaymentAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { FormDetails } from "@/components/form-details";
import { purchaseOrderTotals } from "@/lib/ledger";
import { label, paymentMethods } from "@/lib/options";

export const metadata = { title: "Purchasing" };

const requestTone: Record<string,string> = { DRAFT:"neutral", SUBMITTED:"warn", APPROVED:"info", REJECTED:"danger", ORDERED:"", CANCELLED:"neutral" };
const orderTone: Record<string,string> = { DRAFT:"neutral", APPROVED:"info", ORDERED:"info", PARTIALLY_RECEIVED:"warn", RECEIVED:"", CANCELLED:"neutral" };

export default async function ProcurementPage() {
  const ctx = await tenantContext("procurement.view");
  const [vendors, farms, products, warehouses, requests, accounts, vendorPayments, orders] = await Promise.all([
    db.vendor.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.purchaseRequest.findMany({ where: { tenantId: ctx.tenantId }, include: { farm: true, items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.vendorPayment.findMany({ where: { tenantId: ctx.tenantId }, include: { vendor: true, purchaseOrder: true, account: true }, orderBy: { paidAt: "desc" }, take: 30 }),
    db.purchaseOrder.findMany({ where: { tenantId: ctx.tenantId }, include: { vendor: true, farm: true, warehouse: true, items: { include: { product: true } }, payments: true }, orderBy: { orderDate: "desc" }, take: 100 }),
  ]);
  const committed = orders.filter(o=>!["CANCELLED","DRAFT"].includes(o.status)).reduce((sum,o)=>sum+o.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0),0);
  const pendingRequests = requests.filter(r=>["DRAFT","SUBMITTED"].includes(r.status)).length;
  const payable = orders.filter(o=>!["CANCELLED","DRAFT"].includes(o.status)).reduce((s,o)=>s+purchaseOrderTotals(o).balance,0);
  const canPay = ctx.can("procurement.manage") || ctx.can("finance.manage");
  const openOrders = orders.filter(o=>!["RECEIVED","CANCELLED"].includes(o.status)).length;
  const money = (n: number | string | { toString(): string }) => formatMoney(n,ctx.tenant.currency);

  return <>
    <PageHeader eyebrow="Source to stock" title="Purchasing" description="Suppliers, internal requests, purchase orders, and receiving goods straight into stock."/>
    <section className="metrics">
      <MetricCard label="Owed to suppliers" value={money(payable)} hint={`${vendors.length} active suppliers`} icon={<Building2 size={16}/>}/>
      <MetricCard label="Pending requests" value={String(pendingRequests)} hint="Draft or submitted" icon={<ShoppingCart size={16}/>}/>
      <MetricCard label="Open purchase orders" value={String(openOrders)} hint="Not yet fully received" icon={<PackageCheck size={16}/>}/>
      <MetricCard label="Committed value" value={money(committed)} hint="All orders not cancelled" icon={<CheckCircle2 size={16}/>}/>
    </section>

    <div className="drawers">
      <FormDetails title="Create purchase order" hint="Lines linked to a product can be received straight into the chosen warehouse." open={!!vendors.length&&!orders.length}>
        <ActionForm action={createPurchaseOrderAction} success="Purchase order created">
          <div className="form-grid two">
            <div className="field"><label>Supplier</label><select name="vendorId" required defaultValue=""><option value="" disabled>Select supplier</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Source request</label><select name="requestId" defaultValue=""><option value="">No source request</option>{requests.filter(r=>!["REJECTED","CANCELLED","ORDERED"].includes(r.status)).map(r=><option key={r.id} value={r.id}>{r.requestNo} · {r.title}</option>)}</select></div>
            <div className="field"><label>Destination warehouse</label><select name="warehouseId" defaultValue=""><option value="">No stock receipt</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label>Product</label><select name="productId" defaultValue=""><option value="">Uncatalogued item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label>Description</label><input name="description" required/></div>
            <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
            <div className="field"><label>Unit</label><input name="unit" required/></div>
            <div className="field"><label>Unit price</label><input name="unitPrice" required type="number" min="0" step="0.01"/></div>
            <div className="field"><label>Expected date</label><input name="expectedAt" type="date"/></div>
            <div className="field"><label>Status</label><select name="status" defaultValue="ORDERED"><option value="DRAFT">Draft</option><option value="APPROVED">Approved</option><option value="ORDERED">Ordered</option></select></div>
            <div className="field"><label>Notes</label><input name="notes"/></div>
          </div>
          <div className="form-actions"><button className="button" disabled={!vendors.length}>Create purchase order</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Create purchase request" hint="Ask for something to be bought; it can be approved and turned into an order.">
        <ActionForm action={createPurchaseRequestAction} success="Request created">
          <div className="form-grid two">
            <div className="field span-2"><label>Request title</label><input name="title" required placeholder="Fertilizer for wet season maize"/></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Needed by</label><input name="neededBy" type="date"/></div>
            <div className="field"><label>Product</label><select name="productId" defaultValue=""><option value="">Uncatalogued item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label>Description</label><input name="description" required/></div>
            <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
            <div className="field"><label>Unit</label><input name="unit" required placeholder="bag / litre / unit"/></div>
            <div className="field"><label>Est. unit cost</label><input name="estimatedUnitCost" type="number" min="0" step="0.01"/></div>
            <div className="field"><label>Status</label><select name="status" defaultValue="SUBMITTED"><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option></select></div>
            <div className="field span-2"><label>Notes</label><input name="notes"/></div>
          </div>
          <div className="form-actions"><button className="button">Create request</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Add supplier" hint="Who you buy inputs, feed and services from." open={!vendors.length}>
        <ActionForm action={createVendorAction} success="Supplier added">
          <div className="form-grid two">
            <div className="field span-2"><label>Name</label><input name="name" required/></div>
            <div className="field"><label>Email</label><input name="email" type="email"/></div>
            <div className="field"><label>Phone</label><input name="phone"/></div>
            <div className="field span-2"><label>Address</label><input name="address"/></div>
          </div>
          <div className="form-actions"><button className="button">Add supplier</button></div>
        </ActionForm>
      </FormDetails>
      {canPay ? <FormDetails title="Pay a supplier" hint={`You owe suppliers ${money(payable)} on purchase orders.`}>
        <ActionForm action={recordVendorPaymentAction} success="Payment recorded">
          <div className="form-grid two">
            <div className="field span-2"><label>Purchase order</label><select name="purchaseOrderId" defaultValue=""><option value="">Not for a specific PO</option>{orders.filter(o=>!["CANCELLED","DRAFT"].includes(o.status)&&purchaseOrderTotals(o).balance>0).map(o=><option key={o.id} value={o.id}>{o.orderNo} · {o.vendor.name} · owes {money(purchaseOrderTotals(o).balance)}</option>)}</select></div>
            <div className="field span-2"><label>Supplier (if no PO)</label><select name="vendorId" defaultValue=""><option value="">From the purchase order</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            <div className="field"><label>Amount</label><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required/></div>
            <div className="field"><label>Date</label><input name="paidAt" type="date" defaultValue={toDateInput(new Date())}/></div>
            <div className="field"><label>Method</label><select name="method" defaultValue="BANK_TRANSFER">{paymentMethods.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>From account</label><select name="accountId" defaultValue=""><option value="">Not tracked</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field span-2"><label>Reference</label><input name="reference"/></div>
          </div>
          <div className="form-actions"><button className="button">Record payment</button></div>
        </ActionForm>
      </FormDetails> : null}
    </div>

    <div className="card"><div className="card-head"><div><h2>Purchase orders</h2><div className="card-sub">Latest 30 orders</div></div></div>
      {orders.length ? <div className="table-wrap"><table><thead><tr><th>PO</th><th>Supplier</th><th className="text-right">Value</th><th className="text-right">Owed</th><th>Status</th><th></th></tr></thead><tbody>{orders.slice(0,30).map(o=>{
        const total=o.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0);
        const canReceive=o.status!=="RECEIVED"&&o.status!=="CANCELLED"&&!!o.warehouseId&&o.items.some(i=>i.productId);
        const owed=purchaseOrderTotals(o).balance;
        return <tr key={o.id}>
          <td><b>{o.orderNo}</b><div className="sub">{safeDate(o.orderDate)}</div></td>
          <td>{o.vendor.name}<div className="sub">{o.warehouse?.name||"No destination"}</div></td>
          <td className="text-right">{money(total)}</td>
          <td className="text-right">{owed>0&&o.status!=="CANCELLED"?<span className="status warn">{money(owed)}</span>:<span className="status">Paid</span>}</td>
          <td><span className={`status ${orderTone[o.status]??"neutral"}`}>{humanize(o.status)}</span></td>
          <td>{canReceive?<div className="inline-actions"><ActionForm action={receivePurchaseOrderAction} confirm="Receive every outstanding item on this order into stock?"><input type="hidden" name="id" value={o.id}/><button className="button secondary small">Receive all</button></ActionForm></div>:null}</td>
        </tr>;
      })}</tbody></table></div> : <EmptyState title="No purchase orders" text="Create an order once you know the supplier and what you are buying." icon={<PackageCheck size={20}/>}/>}
    </div>

    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Purchase requests</h2></div>
        {requests.length ? <div className="table-wrap"><table><thead><tr><th>Request</th><th>Item</th><th>Need by</th><th>Status</th><th></th></tr></thead><tbody>{requests.slice(0,30).map(r=>{
          const i=r.items[0];
          return <tr key={r.id}>
            <td><b>{r.requestNo}</b><div className="sub">{r.title}</div></td>
            <td>{i?.product?.name||i?.description||"—"}<div className="sub">{i?`${formatNumber(i.quantity,3)} ${i.unit}`:""}</div></td>
            <td>{safeDate(r.neededBy)}</td>
            <td><span className={`status ${requestTone[r.status]??"neutral"}`}>{humanize(r.status)}</span></td>
            <td>{r.status==="SUBMITTED"?<div className="inline-actions"><ActionForm action={updatePurchaseRequestStatusAction}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="status" value="APPROVED"/><button className="button secondary small">Approve</button></ActionForm></div>:null}</td>
          </tr>;
        })}</tbody></table></div> : <EmptyState title="No purchase requests" text="Requests from your team for things to buy will appear here." icon={<ShoppingCart size={20}/>}/>}
      </div>
      <div className="card"><div className="card-head"><h2>Recent supplier payments</h2></div>
        {vendorPayments.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th>PO</th><th>Method</th><th className="text-right">Amount</th></tr></thead><tbody>{vendorPayments.map(p=><tr key={p.id}><td>{safeDate(p.paidAt)}</td><td>{p.vendor.name}</td><td>{p.purchaseOrder?.orderNo||"—"}</td><td>{label(p.method)}<div className="sub">{p.account?.name||""}</div></td><td className="text-right">{money(p.amount)}</td></tr>)}</tbody></table></div> : <p className="muted">No supplier payments recorded yet.</p>}
      </div>
    </div>
  </>;
}
