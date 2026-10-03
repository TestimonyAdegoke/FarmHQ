import { ArrowRightLeft, ClipboardCheck, PackageSearch, Scale } from "lucide-react";
import { createStockCountAction, transferInventoryAction } from "@/app/v03-actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StockCountSessions } from "@/components/stock-count-sessions";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Stock Control" };

const negative = new Set(["ISSUE","TRANSFER_OUT","ADJUSTMENT_OUT","SALE","WASTE"]);

export default async function StockControlPage() {
  const ctx = await tenantContext();
  const [warehouses, products, txns, counts] = await Promise.all([
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true }, include: { farm: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.inventoryTransaction.findMany({ where: { tenantId: ctx.tenantId }, select: { warehouseId: true, productId: true, type: true, quantity: true } }),
    db.stockCount.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { countedAt: "desc" }, take: 100 }),
  ]);
  const balance = new Map<string,number>();
  for (const txn of txns) {
    const key = txn.warehouseId + ":" + txn.productId;
    const q = Number(txn.quantity);
    balance.set(key,(balance.get(key)||0)+(negative.has(txn.type)?-q:q));
  }
  const warehouseNames = new Map(warehouses.map(w=>[w.id,w.name]));
  const productNames = new Map(products.map(p=>[p.id,p]));
  const totalVariance = counts.reduce((sum,c)=>sum+Math.abs(Number(c.variance)),0);
  const nonZeroCounts = counts.filter(c=>Number(c.variance)!==0).length;
  const positions = [...balance.entries()].filter(([,qty])=>qty!==0).map(([key,qty])=>{const parts=key.split(":");return {warehouseId:parts[0],productId:parts[1],qty};}).sort((a,b)=>(warehouseNames.get(a.warehouseId)||"").localeCompare(warehouseNames.get(b.warehouseId)||""));

  return <><PageHeader eyebrow="Warehouse accuracy" title="Stock control" description="Move stock between stores and reconcile physical counts against the immutable inventory ledger."/>
    <section className="metrics"><MetricCard label="Warehouses" value={String(warehouses.length)} hint="Active stock locations" icon={<PackageSearch size={18}/>}/><MetricCard label="Stock positions" value={String(positions.length)} hint="Non-zero warehouse/product balances" icon={<Scale size={18}/>}/><MetricCard label="Physical counts" value={String(counts.length)} hint="Latest 100 records" icon={<ClipboardCheck size={18}/>}/><MetricCard label="Count variances" value={String(nonZeroCounts)} hint={formatNumber(totalVariance,3) + " absolute units adjusted"} icon={<ArrowRightLeft size={18}/>}/></section>
    <StockCountSessions tenantId={ctx.tenantId} warehouses={warehouses.map(w=>({id:w.id,name:w.name}))} products={products.map(p=>({id:p.id,name:p.name,unit:p.unit}))}/>
    <div className="grid-2" style={{marginBottom:20}}>
      <form className="form-card" action={transferInventoryAction} style={{margin:0}}><div className="card-head"><div><h3>Transfer stock</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Posts matched transfer-out and transfer-in ledger entries.</div></div><ArrowRightLeft size={19}/></div><div className="field"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="form-grid two" style={{marginTop:14}}><div className="field"><label>From warehouse</label><select name="fromWarehouseId" required defaultValue=""><option value="" disabled>Source</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div><div className="field"><label>To warehouse</label><select name="toWarehouseId" required defaultValue=""><option value="" disabled>Destination</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div><div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div><div className="field"><label>Reference</label><input name="reference" placeholder="Internal transfer no."/></div></div><div className="form-actions"><button className="button" disabled={warehouses.length<2||!products.length}>Transfer stock</button></div></form>
      <form className="form-card" action={createStockCountAction} style={{margin:0}}><div className="card-head"><div><h3>Post physical count</h3><div className="muted" style={{fontSize:13,marginTop:4}}>FarmHQ calculates variance and posts the required adjustment automatically.</div></div><ClipboardCheck size={19}/></div><div className="form-grid two"><div className="field"><label>Warehouse</label><select name="warehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div><div className="field"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>Counted quantity</label><input name="countedQuantity" required type="number" min="0" step="0.001"/></div><div className="field"><label>Count date</label><input name="countedAt" type="date"/></div><div className="field span-2"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button" disabled={!warehouses.length||!products.length}>Reconcile count</button></div></form>
    </div>
    {positions.length?<div className="card" style={{marginBottom:20}}><div className="card-head"><h2>Warehouse stock positions</h2></div><div className="table-wrap"><table><thead><tr><th>Warehouse</th><th>Product</th><th>On hand</th></tr></thead><tbody>{positions.map(p=>{const product=productNames.get(p.productId);return <tr key={p.warehouseId+":"+p.productId}><td>{warehouseNames.get(p.warehouseId)||p.warehouseId}</td><td><b>{product?.name||p.productId}</b></td><td>{formatNumber(p.qty,3)} {product?.unit||""}</td></tr>})}</tbody></table></div></div>:<div className="card" style={{marginBottom:20}}><EmptyState title="No stock positions" text="Inventory receipts and purchases will create warehouse balances."/></div>}
    {counts.length?<div className="card"><div className="card-head"><h2>Recent stock counts</h2></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Warehouse</th><th>Product</th><th>System</th><th>Counted</th><th>Variance</th><th>Adjustment</th></tr></thead><tbody>{counts.map(c=>{const product=productNames.get(c.productId);const variance=Number(c.variance);return <tr key={c.id}><td>{safeDate(c.countedAt)}</td><td>{warehouseNames.get(c.warehouseId)||"—"}</td><td>{product?.name||"—"}</td><td>{formatNumber(c.systemQuantity,3)}</td><td>{formatNumber(c.countedQuantity,3)}</td><td><span className={"status "+(variance!==0?"warn":"")}>{variance>0?"+":""}{formatNumber(variance,3)}</span></td><td>{c.adjustmentTxnId?"Posted":"None"}</td></tr>})}</tbody></table></div></div>:null}
  </>;
}
