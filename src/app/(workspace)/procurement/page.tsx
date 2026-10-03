import { Building2, CheckCircle2, PackageCheck, Plus, ShoppingCart } from "lucide-react";
import { createPurchaseOrderAction, createPurchaseRequestAction, createVendorAction, receivePurchaseOrderAction, updatePurchaseRequestStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate, toDateInput } from "@/lib/utils";
import { recordVendorPaymentAction } from "@/app/commerce-actions";
import { ActionForm } from "@/components/action-form";
import { FormDetails } from "@/components/form-details";
import { purchaseOrderTotals } from "@/lib/ledger";
import { label, paymentMethods } from "@/lib/options";

export const metadata = { title: "Purchasing" };

export default async function ProcurementPage() {
  const ctx = await tenantContext("procurement.view");
  const [vendors, farms, products, warehouses, requests, accounts, vendorPayments, orders] = await Promise.all([
    db.vendor.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm }, orderBy: { name: "asc" } }),
    db.purchaseRequest.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { farm: true, items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.moneyAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.vendorPayment.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.via("purchaseOrder") }, include: { vendor: true, purchaseOrder: true, account: true }, orderBy: { paidAt: "desc" }, take: 30 }),
    db.purchaseOrder.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { vendor: true, farm: true, warehouse: true, items: { include: { product: true } }, payments: true }, orderBy: { orderDate: "desc" }, take: 100 }),
  ]);
  const committed = orders.filter(o=>!["CANCELLED","DRAFT"].includes(o.status)).reduce((sum,o)=>sum+o.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0),0);
  const pendingRequests = requests.filter(r=>["DRAFT","SUBMITTED"].includes(r.status)).length;
  const payable = orders.filter(o=>!["CANCELLED","DRAFT"].includes(o.status)).reduce((s,o)=>s+purchaseOrderTotals(o).balance,0);
  const canPay = ctx.can("procurement.manage") || ctx.can("finance.manage");
  const openOrders = orders.filter(o=>!["RECEIVED","CANCELLED"].includes(o.status)).length;

  return <><PageHeader eyebrow="Source to stock" title="Purchasing" description="Manage suppliers, internal requests, purchase orders and goods receipt into the inventory ledger."/>
    <section className="metrics"><MetricCard label="Owed to suppliers" value={formatMoney(payable,ctx.tenant.currency)} hint={`${vendors.length} active suppliers`} icon={<Building2 size={18}/>}/><MetricCard label="Pending requests" value={String(pendingRequests)} hint="Draft + submitted" icon={<ShoppingCart size={18}/>}/><MetricCard label="Open purchase orders" value={String(openOrders)} hint="Awaiting completion" icon={<PackageCheck size={18}/>}/><MetricCard label="Committed value" value={formatMoney(committed,ctx.tenant.currency)} hint="Non-cancelled orders" icon={<CheckCircle2 size={18}/>}/></section>

    <div className="grid-2" style={{marginBottom:20}}>
      <ActionForm className="form-card" action={createVendorAction} style={{margin:0}}><div className="card-head"><h3>Add vendor</h3><Building2 size={19}/></div><div className="form-grid two"><div className="field span-2"><label>Name</label><input name="name" required/></div><div className="field"><label>Email</label><input name="email" type="email"/></div><div className="field"><label>Phone</label><input name="phone"/></div><div className="field span-2"><label>Address</label><input name="address"/></div></div><div className="form-actions"><button className="button">Add vendor</button></div></ActionForm>
      <ActionForm className="form-card" action={createPurchaseRequestAction} style={{margin:0}}><div className="card-head"><h3>Create purchase request</h3><Plus size={19}/></div><div className="form-grid two"><div className="field span-2"><label>Request title</label><input name="title" required placeholder="Fertilizer for wet season maize"/></div><div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">Organization-wide</option>}{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Needed by</label><input name="neededBy" type="date"/></div><div className="field"><label>Product</label><select name="productId" defaultValue=""><option value="">Uncatalogued item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>Description</label><input name="description" required/></div><div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div><div className="field"><label>Unit</label><input name="unit" required placeholder="bag / litre / unit"/></div><div className="field"><label>Est. unit cost</label><input name="estimatedUnitCost" type="number" min="0" step="0.01"/></div><div className="field"><label>Status</label><select name="status" defaultValue="SUBMITTED"><option>DRAFT</option><option>SUBMITTED</option></select></div><div className="field span-2"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button">Create request</button></div></ActionForm>
    </div>

    <ActionForm className="form-card" action={createPurchaseOrderAction}><div className="card-head"><div><h3>Create purchase order</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Product-linked lines can be received directly into the destination warehouse.</div></div><ShoppingCart size={19}/></div><div className="form-grid">
      <div className="field"><label>Vendor</label><select name="vendorId" required defaultValue=""><option value="" disabled>Select vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
      <div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">Organization-wide</option>}{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
      <div className="field"><label>Source request</label><select name="requestId" defaultValue=""><option value="">No source request</option>{requests.filter(r=>!["REJECTED","CANCELLED","ORDERED"].includes(r.status)).map(r=><option key={r.id} value={r.id}>{r.requestNo} · {r.title}</option>)}</select></div>
      <div className="field"><label>Destination warehouse</label><select name="warehouseId" defaultValue=""><option value="">No stock receipt</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div className="field"><label>Product</label><select name="productId" defaultValue=""><option value="">Uncatalogued item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="field"><label>Description</label><input name="description" required/></div>
      <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
      <div className="field"><label>Unit</label><input name="unit" required/></div>
      <div className="field"><label>Unit price</label><input name="unitPrice" required type="number" min="0" step="0.01"/></div>
      <div className="field"><label>Expected date</label><input name="expectedAt" type="date"/></div>
      <div className="field"><label>Status</label><select name="status" defaultValue="ORDERED"><option>DRAFT</option><option>APPROVED</option><option>ORDERED</option></select></div>
      <div className="field span-2"><label>Notes</label><input name="notes"/></div>
    </div><div className="form-actions"><button className="button" disabled={!vendors.length}>Create purchase order</button></div></ActionForm>

    <div className="grid-2" style={{marginBottom:20}}>
      <div className="card"><div className="card-head"><h2>Purchase requests</h2></div>{requests.length?<div className="table-wrap"><table><thead><tr><th>Request</th><th>Item</th><th>Need by</th><th>Status</th><th></th></tr></thead><tbody>{requests.slice(0,30).map(r=>{const i=r.items[0];return <tr key={r.id}><td><b>{r.requestNo}</b><div className="muted" style={{fontSize:12}}>{r.title}</div></td><td>{i?.product?.name||i?.description||"—"}<div className="muted" style={{fontSize:12}}>{i?`${formatNumber(i.quantity,3)} ${i.unit}`:""}</div></td><td>{safeDate(r.neededBy)}</td><td><span className={`status ${["DRAFT","SUBMITTED"].includes(r.status)?"neutral":r.status==="REJECTED"?"warn":""}`}>{r.status}</span></td><td>{r.status==="SUBMITTED"?<ActionForm action={updatePurchaseRequestStatusAction}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="status" value="APPROVED"/><button className="button secondary small">Approve</button></ActionForm>:null}</td></tr>})}</tbody></table></div>:<EmptyState title="No purchase requests" text="Internal requests will appear here."/>}</div>
      <div className="card"><div className="card-head"><h2>Purchase orders</h2></div>{orders.length?<div className="table-wrap"><table><thead><tr><th>PO</th><th>Vendor</th><th>Value</th><th>Owed</th><th>Status</th><th></th></tr></thead><tbody>{orders.slice(0,30).map(o=>{const total=o.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0);const canReceive=o.status!=="RECEIVED"&&o.status!=="CANCELLED"&&!!o.warehouseId&&o.items.some(i=>i.productId);return <tr key={o.id}><td><b>{o.orderNo}</b><div className="muted" style={{fontSize:12}}>{safeDate(o.orderDate)}</div></td><td>{o.vendor.name}<div className="muted" style={{fontSize:12}}>{o.warehouse?.name||"No destination"}</div></td><td>{formatMoney(total,ctx.tenant.currency)}</td><td>{(()=>{const b=purchaseOrderTotals(o).balance;return b>0&&o.status!=="CANCELLED"?<span className="status warn">{formatMoney(b,ctx.tenant.currency)}</span>:<span className="status">paid</span>})()}</td><td><span className={`status ${o.status==="RECEIVED"?"":o.status==="CANCELLED"?"warn":"neutral"}`}>{o.status.replaceAll("_"," ")}</span></td><td>{canReceive?<ActionForm action={receivePurchaseOrderAction}><input type="hidden" name="id" value={o.id}/><button className="button secondary small">Receive all</button></ActionForm>:null}</td></tr>})}</tbody></table></div>:<EmptyState title="No purchase orders" text="Create an order once a vendor and requested items are known."/>}</div>
    </div>

    <div className="grid-2">
      {canPay ? <FormDetails title="Pay a supplier" hint={`You currently owe suppliers ${formatMoney(payable,ctx.tenant.currency)} on purchase orders.`}>
        <ActionForm action={recordVendorPaymentAction}>
          <div className="form-grid two">
            <div className="field span-2"><label>Purchase order</label><select name="purchaseOrderId" defaultValue=""><option value="">Not for a specific PO</option>{orders.filter(o=>!["CANCELLED","DRAFT"].includes(o.status)&&purchaseOrderTotals(o).balance>0).map(o=><option key={o.id} value={o.id}>{o.orderNo} · {o.vendor.name} · owes {formatMoney(purchaseOrderTotals(o).balance,ctx.tenant.currency)}</option>)}</select></div>
            <div className="field span-2"><label>Supplier (if no PO)</label><select name="vendorId" defaultValue=""><option value="">From the purchase order</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            <div className="field"><label>Amount</label><input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required/></div>
            <div className="field"><label>Date</label><input name="paidAt" type="date" defaultValue={toDateInput(new Date())}/></div>
            <div className="field"><label>Method</label><select name="method" defaultValue="BANK_TRANSFER">{paymentMethods.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>From account</label><select name="accountId" defaultValue=""><option value="">Not tracked</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field span-2"><label>Reference</label><input name="reference"/></div>
          </div>
          <div className="form-actions"><button className="button">Record payment</button></div>
        </ActionForm>
      </FormDetails> : <div/>}
      <div className="card"><div className="card-head"><h2>Recent supplier payments</h2></div>{vendorPayments.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th>PO</th><th>Method</th><th className="text-right">Amount</th></tr></thead><tbody>{vendorPayments.map(p=><tr key={p.id}><td>{safeDate(p.paidAt)}</td><td>{p.vendor.name}</td><td>{p.purchaseOrder?.orderNo||"—"}</td><td>{label(p.method)}<div className="sub">{p.account?.name||""}</div></td><td className="text-right">{formatMoney(p.amount,ctx.tenant.currency)}</td></tr>)}</tbody></table></div>:<p className="muted">No supplier payments recorded yet.</p>}</div>
    </div>
  </>;
}
