import { Building2, CheckCircle2, PackageCheck, Plus, ShoppingCart } from "lucide-react";
import { createPurchaseOrderAction, createPurchaseRequestAction, createVendorAction, receivePurchaseOrderAction, updatePurchaseRequestStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Procurement" };

export default async function ProcurementPage() {
  const ctx = await tenantContext();
  const [vendors, farms, products, warehouses, requests, orders] = await Promise.all([
    db.vendor.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.purchaseRequest.findMany({ where: { tenantId: ctx.tenantId }, include: { farm: true, items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.purchaseOrder.findMany({ where: { tenantId: ctx.tenantId }, include: { vendor: true, farm: true, warehouse: true, items: { include: { product: true } } }, orderBy: { orderDate: "desc" }, take: 100 }),
  ]);
  const committed = orders.filter(o=>!["CANCELLED","DRAFT"].includes(o.status)).reduce((sum,o)=>sum+o.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0),0);
  const pendingRequests = requests.filter(r=>["DRAFT","SUBMITTED"].includes(r.status)).length;
  const openOrders = orders.filter(o=>!["RECEIVED","CANCELLED"].includes(o.status)).length;

  return <><PageHeader eyebrow="Source to stock" title="Procurement" description="Manage suppliers, internal requests, purchase orders and goods receipt into the inventory ledger."/>
    <section className="metrics"><MetricCard label="Vendors" value={String(vendors.length)} hint="Active suppliers" icon={<Building2 size={18}/>}/><MetricCard label="Pending requests" value={String(pendingRequests)} hint="Draft + submitted" icon={<ShoppingCart size={18}/>}/><MetricCard label="Open purchase orders" value={String(openOrders)} hint="Awaiting completion" icon={<PackageCheck size={18}/>}/><MetricCard label="Committed value" value={formatMoney(committed,ctx.tenant.currency)} hint="Non-cancelled orders" icon={<CheckCircle2 size={18}/>}/></section>

    <div className="grid-2" style={{marginBottom:20}}>
      <form className="form-card" action={createVendorAction} style={{margin:0}}><div className="card-head"><h3>Add vendor</h3><Building2 size={19}/></div><div className="form-grid two"><div className="field span-2"><label>Name</label><input name="name" required/></div><div className="field"><label>Email</label><input name="email" type="email"/></div><div className="field"><label>Phone</label><input name="phone"/></div><div className="field span-2"><label>Address</label><input name="address"/></div></div><div className="form-actions"><button className="button">Add vendor</button></div></form>
      <form className="form-card" action={createPurchaseRequestAction} style={{margin:0}}><div className="card-head"><h3>Create purchase request</h3><Plus size={19}/></div><div className="form-grid two"><div className="field span-2"><label>Request title</label><input name="title" required placeholder="Fertilizer for wet season maize"/></div><div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Needed by</label><input name="neededBy" type="date"/></div><div className="field"><label>Product</label><select name="productId" defaultValue=""><option value="">Uncatalogued item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>Description</label><input name="description" required/></div><div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div><div className="field"><label>Unit</label><input name="unit" required placeholder="bag / litre / unit"/></div><div className="field"><label>Est. unit cost</label><input name="estimatedUnitCost" type="number" min="0" step="0.01"/></div><div className="field"><label>Status</label><select name="status" defaultValue="SUBMITTED"><option>DRAFT</option><option>SUBMITTED</option></select></div><div className="field span-2"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button">Create request</button></div></form>
    </div>

    <form className="form-card" action={createPurchaseOrderAction}><div className="card-head"><div><h3>Create purchase order</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Product-linked lines can be received directly into the destination warehouse.</div></div><ShoppingCart size={19}/></div><div className="form-grid">
      <div className="field"><label>Vendor</label><select name="vendorId" required defaultValue=""><option value="" disabled>Select vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
      <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Organization-wide</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
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
    </div><div className="form-actions"><button className="button" disabled={!vendors.length}>Create purchase order</button></div></form>

    <div className="grid-2" style={{marginBottom:20}}>
      <div className="card"><div className="card-head"><h2>Purchase requests</h2></div>{requests.length?<div className="table-wrap"><table><thead><tr><th>Request</th><th>Item</th><th>Need by</th><th>Status</th><th></th></tr></thead><tbody>{requests.slice(0,30).map(r=>{const i=r.items[0];return <tr key={r.id}><td><b>{r.requestNo}</b><div className="muted" style={{fontSize:12}}>{r.title}</div></td><td>{i?.product?.name||i?.description||"—"}<div className="muted" style={{fontSize:12}}>{i?`${formatNumber(i.quantity,3)} ${i.unit}`:""}</div></td><td>{safeDate(r.neededBy)}</td><td><span className={`status ${["DRAFT","SUBMITTED"].includes(r.status)?"neutral":r.status==="REJECTED"?"warn":""}`}>{r.status}</span></td><td>{r.status==="SUBMITTED"?<form action={updatePurchaseRequestStatusAction}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="status" value="APPROVED"/><button className="button secondary small">Approve</button></form>:null}</td></tr>})}</tbody></table></div>:<EmptyState title="No purchase requests" text="Internal requests will appear here."/>}</div>
      <div className="card"><div className="card-head"><h2>Purchase orders</h2></div>{orders.length?<div className="table-wrap"><table><thead><tr><th>PO</th><th>Vendor</th><th>Value</th><th>Status</th><th></th></tr></thead><tbody>{orders.slice(0,30).map(o=>{const total=o.items.reduce((s,i)=>s+Number(i.quantity)*Number(i.unitPrice),0);const canReceive=o.status!=="RECEIVED"&&o.status!=="CANCELLED"&&!!o.warehouseId&&o.items.some(i=>i.productId);return <tr key={o.id}><td><b>{o.orderNo}</b><div className="muted" style={{fontSize:12}}>{safeDate(o.orderDate)}</div></td><td>{o.vendor.name}<div className="muted" style={{fontSize:12}}>{o.warehouse?.name||"No destination"}</div></td><td>{formatMoney(total,ctx.tenant.currency)}</td><td><span className={`status ${o.status==="RECEIVED"?"":o.status==="CANCELLED"?"warn":"neutral"}`}>{o.status.replaceAll("_"," ")}</span></td><td>{canReceive?<form action={receivePurchaseOrderAction}><input type="hidden" name="id" value={o.id}/><button className="button secondary small">Receive all</button></form>:null}</td></tr>})}</tbody></table></div>:<EmptyState title="No purchase orders" text="Create an order once a vendor and requested items are known."/>}</div>
    </div>
  </>;
}
