import { CheckCircle2, XCircle } from "lucide-react";
import { addStockCountLineAction, cancelStockCountSessionAction, closeStockCountSessionAction, createStockCountSessionAction } from "@/app/v04-ops-actions";
import { db } from "@/lib/db";
import { formatNumber, humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";
import { FormDetails } from "@/components/form-details";

const sessionTone = (status: string) => status==="OPEN"?"info":status==="CANCELLED"?"neutral":"";

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

  return <div className="stack">
    <ActionForm className="form-card" action={addStockCountLineAction} success="Count line saved">
      <div className="card-head"><div><h2>Enter count</h2><div className="card-sub">The system quantity is taken when each line is saved.</div></div></div>
      <div className="form-grid two">
        <div className="field span-2"><label>Open count</label><select name="sessionId" required defaultValue=""><option value="" disabled>Select count</option>{open.map(session=><option key={session.id} value={session.id}>{session.sessionNo} · {warehouseNames.get(session.warehouseId)||"Warehouse"}</option>)}</select></div>
        <div className="field"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="field"><label>Lot number</label><input name="lotNumber"/></div>
        <div className="field"><label>Counted quantity</label><input name="countedQuantity" required type="number" min="0" step="0.001"/></div>
        <div className="field"><label>Notes</label><input name="notes"/></div>
      </div>
      <div className="form-actions"><button className="button" disabled={!open.length||!products.length}>Save count line</button></div>
    </ActionForm>

    <FormDetails title="Start stock count" hint="Nothing changes in stock until the count is closed." open={!open.length}>
      <ActionForm action={createStockCountSessionAction} success="Count started">
        <div className="form-grid two">
          <div className="field"><label>Warehouse</label><select name="warehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label>Notes</label><input name="notes"/></div>
        </div>
        <div className="form-actions"><button className="button" disabled={!warehouses.length}>Start count</button></div>
      </ActionForm>
    </FormDetails>

    {sessions.map(session=><div className="card" key={session.id}>
      <div className="card-head">
        <div><h2>{session.sessionNo}</h2><div className="card-sub">{warehouseNames.get(session.warehouseId)||"Warehouse"} · started {safeDate(session.startedAt)} · {session.lines.length} line{session.lines.length===1?"":"s"}</div></div>
        <div className="inline-actions"><span className={`status ${sessionTone(session.status)}`}>{humanize(session.status)}</span>{session.status==="OPEN"?<>
          <ActionForm action={closeStockCountSessionAction}><input type="hidden" name="id" value={session.id}/><button className="button small"><CheckCircle2 size={15}/> Close &amp; post</button></ActionForm>
          <ActionForm action={cancelStockCountSessionAction}><input type="hidden" name="id" value={session.id}/><button className="button secondary small"><XCircle size={15}/> Cancel</button></ActionForm>
        </>:null}</div>
      </div>
      {session.lines.length?<div className="table-wrap"><table><thead><tr><th>Product</th><th>Lot</th><th className="text-right">System</th><th className="text-right">Counted</th><th className="text-right">Variance</th><th>Adjustment</th></tr></thead><tbody>{session.lines.map(line=>{
        const product=productNames.get(line.productId);
        const variance=line.variance==null?null:Number(line.variance);
        return <tr key={line.id}><td>{product?.name||line.productId}</td><td>{line.lotNumber||"—"}</td><td className="text-right nowrap">{formatNumber(line.systemQuantity,3)} {product?.unit||""}</td><td className="text-right">{line.countedQuantity==null?"—":formatNumber(line.countedQuantity,3)}</td><td className="text-right">{variance==null?"—":<span className={`status ${variance!==0?"warn":""}`}>{variance>0?"+":""}{formatNumber(variance,3)}</span>}</td><td>{line.adjustmentTxnId?"Posted":"—"}</td></tr>;
      })}</tbody></table></div>:<p className="muted small-text">No lines counted yet.</p>}
    </div>)}
  </div>;
}
