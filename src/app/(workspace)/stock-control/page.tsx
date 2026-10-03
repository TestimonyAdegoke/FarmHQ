import Link from "next/link";
import { ArrowRightLeft, ClipboardCheck, PackageSearch, Scale } from "lucide-react";
import { transferInventoryAction } from "@/app/v03-actions";
import { addStockCountLineAction, cancelStockCountSessionAction, closeStockCountSessionAction, createStockCountSessionAction } from "@/app/v04-ops-actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Stock Control" };

const negative = new Set(["ISSUE","TRANSFER_OUT","ADJUSTMENT_OUT","SALE","WASTE"]);
const sessionTone = (status: string) => status==="OPEN"?"info":status==="CANCELLED"?"neutral":"";

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

  return <>
    <PageHeader eyebrow="Warehouse accuracy" title="Stock control" description="Move stock between stores and run physical counts. Count differences are only posted to stock when you close the count."/>
    <section className="metrics">
      <MetricCard label="Warehouses" value={String(warehouses.length)} hint="Active stock locations" icon={<PackageSearch size={16}/>}/>
      <MetricCard label="Stock positions" value={String(positions.length)} hint="Products held in each store" icon={<Scale size={16}/>}/>
      <MetricCard label="Open counts" value={String(openSessions.length)} hint={`${sessions.length} recent counts`} icon={<ClipboardCheck size={16}/>}/>
      <MetricCard label="Selected variance" value={formatNumber(selectedVariance,3)} hint="Total units off, before posting" icon={<ArrowRightLeft size={16}/>}/>
    </section>

    <div className="drawers">
      <FormDetails title="Transfer stock" hint="Moves stock out of one store and into another in a single step.">
        <ActionForm action={transferInventoryAction} success="Stock transferred">
          <div className="form-grid two">
            <div className="field span-2"><label>Product</label><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label>From warehouse</label><select name="fromWarehouseId" required defaultValue=""><option value="" disabled>Source</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label>To warehouse</label><select name="toWarehouseId" required defaultValue=""><option value="" disabled>Destination</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
            <div className="field"><label>Reference</label><input name="reference" placeholder="Internal transfer no."/></div>
          </div>
          <div className="form-actions"><button className="button" disabled={warehouses.length<2||!products.length}>Transfer stock</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Start stock count" hint="The count stays open for entry; nothing changes in stock until you close it." open={!sessions.length}>
        <ActionForm action={createStockCountSessionAction} success="Count started">
          <div className="form-grid two">
            <div className="field"><label>Warehouse</label><select name="warehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label>Notes</label><input name="notes" placeholder="Month-end count / spot check"/></div>
          </div>
          <div className="form-actions"><button className="button" disabled={!warehouses.length}>Start count</button></div>
        </ActionForm>
      </FormDetails>
    </div>

    {selected ? <div className="grid-main-side">
      <ActionForm className="form-card" action={addStockCountLineAction} success="Count line saved">
        <div className="card-head"><div><h2>Count {selected.sessionNo}</h2><div className="card-sub">{warehouseNames.get(selected.warehouseId)||"Warehouse"} · started {safeDate(selected.startedAt)}</div></div><span className={`status ${sessionTone(selected.status)}`}>{humanize(selected.status)}</span></div>
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
        <div className="card-head"><h2>This count</h2></div>
        <dl className="kv">
          <dt>Products counted</dt><dd>{selected.lines.length}</dd>
          <dt>Total variance</dt><dd>{formatNumber(selectedVariance,3)}</dd>
          <dt>Status</dt><dd>{humanize(selected.status)}</dd>
          {selected.closedAt ? <><dt>Closed</dt><dd>{safeDate(selected.closedAt)}</dd></> : null}
        </dl>
        {selected.status==="OPEN" ? <div className="form-actions">
          <ActionForm action={cancelStockCountSessionAction} confirm="Cancel this count? Lines entered so far will not be posted."><input type="hidden" name="id" value={selected.id}/><button className="button secondary">Cancel count</button></ActionForm>
          <ActionForm action={closeStockCountSessionAction}><input type="hidden" name="id" value={selected.id}/><button className="button" disabled={!selected.lines.length}>Close &amp; post adjustments</button></ActionForm>
        </div> : <p className="muted small-text">This count is {humanize(selected.status).toLowerCase()}. No further changes are allowed.</p>}
      </div>
    </div> : null}

    {selected?.lines.length ? <div className="card">
      <div className="card-head"><div><h2>Count lines</h2><div className="card-sub">{selected.sessionNo} · system quantity is taken when each line is entered</div></div></div>
      <div className="table-wrap"><table><thead><tr><th>Product</th><th>Lot</th><th className="text-right">System</th><th className="text-right">Counted</th><th className="text-right">Variance</th><th>Adjustment</th></tr></thead><tbody>{selected.lines.map(line=>{
        const product=productNames.get(line.productId);
        const variance=Number(line.variance||0);
        return <tr key={line.id}><td><b>{product?.name||line.productId}</b></td><td>{line.lotNumber||"All lots"}</td><td className="text-right nowrap">{formatNumber(line.systemQuantity,3)} {product?.unit||""}</td><td className="text-right">{line.countedQuantity==null?"—":formatNumber(line.countedQuantity,3)}</td><td className="text-right"><span className={`status ${variance!==0?"warn":""}`}>{variance>0?"+":""}{formatNumber(variance,3)}</span></td><td>{line.adjustmentTxnId?"Posted":selected.status==="CLOSED"?"None":<span className="muted">Pending closure</span>}</td></tr>;
      })}</tbody></table></div>
    </div> : null}

    <div className="card">
      <div className="card-head"><div><h2>Count sessions</h2><div className="card-sub">Open a count to enter or review product counts</div></div></div>
      {sessions.length ? <div className="table-wrap"><table><thead><tr><th>Count</th><th>Warehouse</th><th>Started</th><th className="text-right">Lines</th><th>Status</th></tr></thead><tbody>{sessions.map(session=><tr key={session.id}>
        <td><Link className="link" href={"/stock-control?sessionId="+session.id}>{session.sessionNo}</Link>{selected?.id===session.id ? <div className="sub">Showing above</div> : null}</td>
        <td>{warehouseNames.get(session.warehouseId)||"Warehouse"}</td>
        <td>{safeDate(session.startedAt)}</td>
        <td className="text-right">{session.lines.length}</td>
        <td><span className={`status ${sessionTone(session.status)}`}>{humanize(session.status)}</span></td>
      </tr>)}</tbody></table></div> : <EmptyState title="No counts yet" text="Start your first physical stock count to check what is really on the shelf." icon={<ClipboardCheck size={20}/>}/>}
    </div>

    {positions.length ? <div className="card"><div className="card-head"><h2>Stock by warehouse</h2></div>
      <div className="table-wrap"><table><thead><tr><th>Warehouse</th><th>Product</th><th className="text-right">On hand</th></tr></thead><tbody>{positions.map(p=>{const product=productNames.get(p.productId);return <tr key={p.warehouseId+":"+p.productId}><td>{warehouseNames.get(p.warehouseId)||p.warehouseId}</td><td><b>{product?.name||p.productId}</b></td><td className="text-right nowrap">{formatNumber(p.qty,3)} {product?.unit||""}</td></tr>;})}</tbody></table></div>
    </div> : null}

    {legacyCounts.length ? <div className="card"><div className="card-head"><div><h2>Earlier direct counts</h2><div className="card-sub">Counts recorded before count sessions were introduced</div></div></div>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Warehouse</th><th>Product</th><th className="text-right">System</th><th className="text-right">Counted</th><th className="text-right">Variance</th></tr></thead><tbody>{legacyCounts.map(count=><tr key={count.id}><td>{safeDate(count.countedAt)}</td><td>{warehouseNames.get(count.warehouseId)||"—"}</td><td>{productNames.get(count.productId)?.name||"—"}</td><td className="text-right">{formatNumber(count.systemQuantity,3)}</td><td className="text-right">{formatNumber(count.countedQuantity,3)}</td><td className="text-right">{formatNumber(count.variance,3)}</td></tr>)}</tbody></table></div>
    </div> : null}
  </>;
}
