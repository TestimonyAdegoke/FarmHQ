import { CheckCircle2, ClipboardList, Plus, XCircle } from "lucide-react";
import { addStockCountLineAction, cancelStockCountSessionAction, closeStockCountSessionAction, createStockCountSessionAction } from "@/app/v04-ops-actions";
import { db } from "@/lib/db";
import { formatNumber, safeDate } from "@/lib/utils";

export async function StockCountSessions({ tenantId, warehouses, products }:{
  tenantId:string;
  warehouses:{id:string;name:string}[];
  products:{id:string;name:string;unit:string}[];
}) {
  const sessions = await db.stockCountSession.findMany({
    where:{tenantId},
    include:{lines:true},
    orderBy:{startedAt:"desc"},
    take:50,
  });
  const open = sessions.filter(session=>session.status==="OPEN");
  const warehouseNames = new Map(warehouses.map(item=>[item.id,item.name]));
  const productNames = new Map(products.map(item=>[item.id,item]));

  return <div style={{display:"grid",gap:20,marginBottom:20}}>
    <div className="grid-2">
      <form className="form-card" action={createStockCountSessionAction} style={{margin:0}}>
        <div className="card-head"><div><h3>Start count session</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Build a count sheet first; adjustments post only when the session is closed.</div></div><ClipboardList size={19}/></div>
        <div className="field"><label>Warehouse</label><select name="warehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="field" style={{marginTop:14}}><label>Notes</label><input name="notes"/></div>
        <div className="form-actions"><button className="button" disabled={!warehouses.length}><Plus size={16}/> Start count</button></div>
      </form>

      <form className="form-card" action={addStockCountLineAction} style={{margin:0}}>
        <div className="card-head"><div><h3>Add / update count line</h3><div className="muted" style={{fontSize:13,marginTop:4}}>System quantity is snapshotted when the line is entered.</div></div><Plus size={19}/></div>
        <div className="form-grid two">
          <div className="field span-2"><label>Open session</label><select name="sessionId" required defaultValue=""><option value="" disabled>Select session</option>{open.map(session=><option key={session.id} value={session.id}>{session.sessionNo} · {warehouseNames.get(session.warehouseId)||"Warehouse"}</option>)}</select></div>
          <div className="field"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label>Lot number</label><input name="lotNumber"/></div>
          <div className="field"><label>Counted quantity</label><input name="countedQuantity" required type="number" min="0" step="0.001"/></div>
          <div className="field"><label>Notes</label><input name="notes"/></div>
        </div>
        <div className="form-actions"><button className="button" disabled={!open.length||!products.length}>Save count line</button></div>
      </form>
    </div>

    {sessions.length?<div className="card"><div className="card-head"><div><h2>Count sessions</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Closing a session posts one immutable adjustment per non-zero line.</div></div></div><div style={{display:"grid",gap:14}}>{sessions.map(session=><div key={session.id} style={{border:"1px solid var(--line)",borderRadius:14,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div><b>{session.sessionNo}</b><div className="muted" style={{fontSize:12}}>{warehouseNames.get(session.warehouseId)||"Warehouse"} · started {safeDate(session.startedAt)} · {session.lines.length} line(s)</div></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><span className={"status "+(session.status==="OPEN"?"neutral":"")}>{session.status}</span>{session.status==="OPEN"?<><form action={closeStockCountSessionAction}><input type="hidden" name="id" value={session.id}/><button className="button small"><CheckCircle2 size={15}/> Close & post</button></form><form action={cancelStockCountSessionAction}><input type="hidden" name="id" value={session.id}/><button className="button secondary small"><XCircle size={15}/> Cancel</button></form></>:null}</div>
      </div>
      {session.lines.length?<div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>Product</th><th>Lot</th><th>System</th><th>Counted</th><th>Variance</th><th>Adjustment</th></tr></thead><tbody>{session.lines.map(line=>{const product=productNames.get(line.productId);const variance=line.variance==null?null:Number(line.variance);return <tr key={line.id}><td>{product?.name||line.productId}</td><td>{line.lotNumber||"—"}</td><td>{formatNumber(line.systemQuantity,3)} {product?.unit||""}</td><td>{line.countedQuantity==null?"—":formatNumber(line.countedQuantity,3)}</td><td>{variance==null?"—":<span className={"status "+(variance!==0?"warn":"")}>{variance>0?"+":""}{formatNumber(variance,3)}</span>}</td><td>{line.adjustmentTxnId?"Posted":"—"}</td></tr>})}</tbody></table></div>:null}
    </div>)}</div></div>:null}
  </div>;
}
