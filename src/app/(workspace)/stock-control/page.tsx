import Link from "next/link";
import { ArrowRightLeft, ClipboardCheck, PackageSearch, Scale } from "lucide-react";
import { transferInventoryAction } from "@/app/v03-actions";
import { addStockCountLineAction, cancelStockCountSessionAction, closeStockCountSessionAction, createStockCountSessionAction } from "@/app/v04-ops-actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Stock Control" };

const negative = new Set(["ISSUE","TRANSFER_OUT","ADJUSTMENT_OUT","SALE","WASTE"]);

export default async function StockControlPage({ searchParams }: { searchParams: Promise<{ sessionId?:string }> }) {
  const ctx = await tenantContext("inventory.view");
  const query = await searchParams;
  const [warehouses, products, txns, sessions, legacyCounts] = await Promise.all([
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true }, include: { farm: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.inventoryTransaction.findMany({ where: { tenantId: ctx.tenantId }, select: { warehouseId: true, productId: true, type: true, quantity: true } }),
    db.stockCountSession.findMany({ where: { tenantId: ctx.tenantId }, include: { lines: true }, orderBy: { startedAt:"desc" }, take:40 }),
    db.stockCount.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { countedAt: "desc" }, take: 30 }),
  ]);

  const balance = new Map<string,number>();
  for (const txn of txns) {
    const key = txn.warehouseId + ":" + txn.productId;
    const q = Number(txn.quantity);
    balance.set(key,(balance.get(key)||0)+(negative.has(txn.type)?-q:q));
  }
  const warehouseNames = new Map(warehouses.map(w=>[w.id,w.name]));
  const productNames = new Map(products.map(p=>[p.id,p]));
  const positions = [...balance.entries()].filter(([,qty])=>qty!==0).map(([key,qty])=>{
    const [warehouseId,productId]=key.split(":");
    return {warehouseId,productId,qty};
  }).sort((a,b)=>(warehouseNames.get(a.warehouseId)||"").localeCompare(warehouseNames.get(b.warehouseId)||""));

  const openSessions = sessions.filter(session=>session.status==="OPEN");
  const selected = sessions.find(session=>session.id===query.sessionId) || openSessions[0];
  const selectedVariance = selected?.lines.reduce((sum,line)=>sum+Math.abs(Number(line.variance||0)),0) || 0;

  return <><PageHeader eyebrow="Warehouse accuracy" title="Stock control" description="Move stock between stores and run auditable physical count sessions that post ledger adjustments only when the count is closed."/>
    <section className="metrics">
      <MetricCard label="Warehouses" value={String(warehouses.length)} hint="Active stock locations" icon={<PackageSearch size={18}/>}/>
      <MetricCard label="Stock positions" value={String(positions.length)} hint="Non-zero warehouse/product balances" icon={<Scale size={18}/>}/>
      <MetricCard label="Open counts" value={String(openSessions.length)} hint={String(sessions.length)+" recent sessions"} icon={<ClipboardCheck size={18}/>}/>
      <MetricCard label="Selected variance" value={formatNumber(selectedVariance,3)} hint="Absolute units before posting" icon={<ArrowRightLeft size={18}/>}/>
    </section>

    <div className="grid-2" style={{marginBottom:20}}>
      <ActionForm className="form-card" action={transferInventoryAction} style={{margin:0}}>
        <div className="card-head"><div><h3>Transfer stock</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Posts matched transfer-out and transfer-in ledger entries.</div></div><ArrowRightLeft size={19}/></div>
        <div className="field"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="form-grid two" style={{marginTop:14}}>
          <div className="field"><label>From warehouse</label><select name="fromWarehouseId" required defaultValue=""><option value="" disabled>Source</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="field"><label>To warehouse</label><select name="toWarehouseId" required defaultValue=""><option value="" disabled>Destination</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
          <div className="field"><label>Reference</label><input name="reference" placeholder="Internal transfer no."/></div>
        </div>
        <div className="form-actions"><button className="button" disabled={warehouses.length<2||!products.length}>Transfer stock</button></div>
      </ActionForm>

      <ActionForm className="form-card" action={createStockCountSessionAction} style={{margin:0}}>
        <div className="card-head"><div><h3>Start stock count</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Counts remain open until reviewed; no inventory adjustment is posted before closure.</div></div><ClipboardCheck size={19}/></div>
        <div className="field"><label>Warehouse</label><select name="warehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <div className="field" style={{marginTop:14}}><label>Notes</label><input name="notes" placeholder="Month-end count / spot check"/></div>
        <div className="form-actions"><button className="button" disabled={!warehouses.length}>Start count session</button></div>
      </ActionForm>
    </div>

    <div className="card" style={{marginBottom:20}}>
      <div className="card-head"><div><h2>Count sessions</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Open a session to enter or review product counts.</div></div></div>
      {sessions.length?<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{sessions.map(session=><Link key={session.id} href={"/stock-control?sessionId="+session.id} className={"button small "+(selected?.id===session.id?"":"secondary")}>{session.sessionNo} · {warehouseNames.get(session.warehouseId)||"Warehouse"} · {session.status}</Link>)}</div>:<EmptyState title="No count sessions" text="Start the first physical inventory count above."/>}
    </div>

    {selected?<div className="grid-2" style={{marginBottom:20}}>
      <ActionForm className="form-card" action={addStockCountLineAction} style={{margin:0}}>
        <div className="card-head"><div><h3>{selected.sessionNo}</h3><div className="muted" style={{fontSize:13,marginTop:4}}>{warehouseNames.get(selected.warehouseId)||"Warehouse"} · started {safeDate(selected.startedAt)}</div></div><span className={"status "+(selected.status==="OPEN"?"neutral":"")}>{selected.status}</span></div>
        <input type="hidden" name="sessionId" value={selected.id}/>
        <div className="form-grid two">
          <div className="field"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label>Lot / batch</label><input name="lotNumber" placeholder="Optional"/></div>
          <div className="field"><label>Counted quantity</label><input name="countedQuantity" required type="number" min="0" step="0.001"/></div>
          <div className="field"><label>Notes</label><input name="notes"/></div>
        </div>
        <div className="form-actions"><button className="button" disabled={selected.status!=="OPEN"}>Save count line</button></div>
      </ActionForm>
      <div className="card">
        <div className="card-head"><div><h3>Session controls</h3><div className="muted" style={{fontSize:13,marginTop:4}}>{selected.lines.length} product line(s) · {formatNumber(selectedVariance,3)} absolute variance</div></div></div>
        {selected.status==="OPEN"?<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <ActionForm action={closeStockCountSessionAction}><input type="hidden" name="id" value={selected.id}/><button className="button" disabled={!selected.lines.length}>Close & post adjustments</button></ActionForm>
          <ActionForm action={cancelStockCountSessionAction}><input type="hidden" name="id" value={selected.id}/><button className="button secondary">Cancel session</button></ActionForm>
        </div>:<div className="alert"><div><b>Session {selected.status.toLowerCase()}</b><small>{selected.closedAt?"Closed "+safeDate(selected.closedAt):"No further changes are allowed."}</small></div></div>}
      </div>
    </div>:null}

    {selected?.lines.length?<div className="card" style={{marginBottom:20}}>
      <div className="card-head"><h2>Count lines</h2></div>
      <div className="table-wrap"><table><thead><tr><th>Product</th><th>Lot</th><th>System</th><th>Counted</th><th>Variance</th><th>Adjustment</th></tr></thead><tbody>{selected.lines.map(line=>{
        const product=productNames.get(line.productId);
        const variance=Number(line.variance||0);
        return <tr key={line.id}><td><b>{product?.name||line.productId}</b></td><td>{line.lotNumber||"All lots"}</td><td>{formatNumber(line.systemQuantity,3)} {product?.unit||""}</td><td>{line.countedQuantity==null?"—":formatNumber(line.countedQuantity,3)}</td><td><span className={"status "+(variance!==0?"warn":"")}>{variance>0?"+":""}{formatNumber(variance,3)}</span></td><td>{line.adjustmentTxnId?"Posted":selected.status==="CLOSED"?"None":"Pending closure"}</td></tr>;
      })}</tbody></table></div>
    </div>:null}

    {positions.length?<div className="card" style={{marginBottom:20}}><div className="card-head"><h2>Warehouse stock positions</h2></div><div className="table-wrap"><table><thead><tr><th>Warehouse</th><th>Product</th><th>On hand</th></tr></thead><tbody>{positions.map(p=>{const product=productNames.get(p.productId);return <tr key={p.warehouseId+":"+p.productId}><td>{warehouseNames.get(p.warehouseId)||p.warehouseId}</td><td><b>{product?.name||p.productId}</b></td><td>{formatNumber(p.qty,3)} {product?.unit||""}</td></tr>})}</tbody></table></div></div>:null}

    {legacyCounts.length?<div className="card"><div className="card-head"><div><h2>Legacy direct counts</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Historical counts created before session-based counting.</div></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Warehouse</th><th>Product</th><th>System</th><th>Counted</th><th>Variance</th></tr></thead><tbody>{legacyCounts.map(count=><tr key={count.id}><td>{safeDate(count.countedAt)}</td><td>{warehouseNames.get(count.warehouseId)||"—"}</td><td>{productNames.get(count.productId)?.name||"—"}</td><td>{formatNumber(count.systemQuantity,3)}</td><td>{formatNumber(count.countedQuantity,3)}</td><td>{formatNumber(count.variance,3)}</td></tr>)}</tbody></table></div></div>:null}
  </>;
}
