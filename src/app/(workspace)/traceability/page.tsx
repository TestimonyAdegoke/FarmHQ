import Image from "next/image";
import Link from "next/link";
import { GitBranch, Plus, QrCode, ScanLine } from "lucide-react";
import { createTraceEventAction, createTraceLotAction, updateTraceLotStatusAction } from "@/app/v04-actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Traceability" };

export default async function TraceabilityPage() {
  const ctx = await tenantContext("inventory.view");
  const [lots, products, farms, cycles, harvests, warehouses] = await Promise.all([
    db.traceLot.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { events: { orderBy: { occurredAt: "desc" }, take: 5 }, children: { select: { id: true, lotCode: true } }, parent: { select: { id: true, lotCode: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.harvestRecord.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, orderBy: { harvestedAt: "desc" }, take: 200 }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm }, orderBy: { name: "asc" } }),
  ]);
  const productNames = new Map(products.map(p=>[p.id,p.name]));
  const farmNames = new Map(farms.map(f=>[f.id,f.name]));
  const cycleNames = new Map(cycles.map(c=>[c.id,c.name]));
  const active = lots.filter(l=>["ACTIVE","RELEASED"].includes(l.status)).length;
  const quarantined = lots.filter(l=>l.status==="QUARANTINED").length;
  const linkedHarvests = lots.filter(l=>l.harvestRecordId).length;

  return <><PageHeader eyebrow="Farm-to-customer chain" title="Traceability" description="Create independently scannable lots, record custody and processing events, and preserve parent/child lineage through repacking and transformation."/>
    <section className="metrics">
      <MetricCard label="Trace lots" value={String(lots.length)} hint={String(active)+" active or released"} icon={<QrCode size={18}/>}/>
      <MetricCard label="Harvest-linked" value={String(linkedHarvests)} hint="Lots tied to source harvests" icon={<ScanLine size={18}/>}/>
      <MetricCard label="Quarantined" value={String(quarantined)} hint="Requires release before movement" icon={<GitBranch size={18}/>}/>
      <MetricCard label="Lineage links" value={String(lots.filter(l=>l.parentLotId).length)} hint="Child lots preserving source chain" icon={<GitBranch size={18}/>}/>
    </section>

    <div className="grid-2" style={{marginBottom:20}}>
      <ActionForm className="form-card" action={createTraceLotAction} style={{margin:0}}>
        <div className="card-head"><div><h3>Create trace lot</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Every lot receives a non-guessable public trace token and QR endpoint.</div></div><Plus size={19}/></div>
        <div className="form-grid two">
          <div className="field"><label>Lot code</label><input name="lotCode" required placeholder="MAIZE-26-001"/></div>
          <div className="field"><label>Product</label><select name="productId" defaultValue=""><option value="">Not catalogued</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">Not linked</option>}{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field span-2"><label>Source harvest</label><select name="harvestRecordId" defaultValue=""><option value="">No direct harvest link</option>{harvests.map(h=><option key={h.id} value={h.id}>{safeDate(h.harvestedAt)} · {h.lotNumber||h.id.slice(-8)} · {formatNumber(h.quantity,3)} {h.unit}</option>)}</select></div>
          <div className="field span-2"><label>Parent lot</label><select name="parentLotId" defaultValue=""><option value="">Original lot</option>{lots.map(l=><option key={l.id} value={l.id}>{l.lotCode}</option>)}</select></div>
          <div className="field"><label>Quantity</label><input name="quantity" type="number" min="0" step="0.001"/></div>
          <div className="field"><label>Unit</label><input name="unit" placeholder="kg / tonnes / crates"/></div>
          <div className="field"><label>Grade</label><input name="grade"/></div>
          <div className="field"><label>Harvest date</label><input name="harvestedAt" type="date"/></div>
          <div className="field"><label>Expiry / best before</label><input name="expiresAt" type="date"/></div>
          <div className="field"><label>Reference</label><input name="reference"/></div>
          <div className="field span-2"><label>Notes</label><input name="notes"/></div>
        </div>
        <div className="form-actions"><button className="button">Create lot</button></div>
      </ActionForm>

      <ActionForm className="form-card" action={createTraceEventAction} style={{margin:0}}>
        <div className="card-head"><div><h3>Add chain event</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Record handling, inspection, movement, sale and delivery without rewriting history.</div></div><GitBranch size={19}/></div>
        <div className="form-grid two">
          <div className="field span-2"><label>Lot</label><select name="lotId" required defaultValue=""><option value="" disabled>Select lot</option>{lots.map(l=><option key={l.id} value={l.id}>{l.lotCode}</option>)}</select></div>
          <div className="field"><label>Event</label><select name="type" defaultValue="TRANSFERRED">{["RECEIVED","TRANSFERRED","PACKED","GRADED","INSPECTED","SOLD","DELIVERED","ADJUSTED","NOTE"].map(v=><option key={v}>{v}</option>)}</select></div>
          <div className="field"><label>Date</label><input name="occurredAt" type="date"/></div>
          <div className="field"><label>Warehouse</label><select name="warehouseId" defaultValue=""><option value="">No warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="field"><label>Location</label><input name="location"/></div>
          <div className="field"><label>Quantity</label><input name="quantity" type="number" min="0" step="0.001"/></div>
          <div className="field"><label>Unit</label><input name="unit"/></div>
          <div className="field"><label>Reference</label><input name="reference"/></div>
          <div className="field span-2"><label>Notes</label><input name="notes"/></div>
        </div>
        <div className="form-actions"><button className="button" disabled={!lots.length}>Add event</button></div>
      </ActionForm>
    </div>

    {lots.length ? <div style={{display:"grid",gap:14}}>{lots.map(lot=><div className="card" key={lot.id}>
      <div style={{display:"grid",gridTemplateColumns:"100px minmax(0,1fr)",gap:18,alignItems:"start"}}>
        <Link href={"/trace/"+lot.publicToken} target="_blank"><Image src={"/api/trace/qr/"+lot.publicToken} alt={"QR for "+lot.lotCode} width={96} height={96} unoptimized/></Link>
        <div>
          <div className="card-head" style={{marginBottom:10}}><div><h2 style={{margin:0}}>{lot.lotCode}</h2><div className="muted" style={{fontSize:13,marginTop:4}}>{lot.productId?productNames.get(lot.productId)||"Catalog product":"Uncatalogued"} · {lot.farmId?farmNames.get(lot.farmId)||"Farm":"No farm"}{lot.cycleId?" · "+(cycleNames.get(lot.cycleId)||"Cycle"):""}</div></div><span className={"status "+(lot.status==="QUARANTINED"?"warn":"")}>{lot.status}</span></div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:13}}><span><b>{lot.quantity!=null?formatNumber(lot.quantity,3):"—"}</b> {lot.unit||""}</span><span>Grade: <b>{lot.grade||"—"}</b></span><span>Harvest: <b>{safeDate(lot.harvestedAt)}</b></span>{lot.parent?<span>Parent: <b>{lot.parent.lotCode}</b></span>:null}{lot.children.length?<span>Children: <b>{lot.children.map(c=>c.lotCode).join(", ")}</b></span>:null}</div>
          <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}><Link className="button secondary small" href={"/trace/"+lot.publicToken} target="_blank">Open public trace</Link><ActionForm action={updateTraceLotStatusAction} style={{display:"flex",gap:6}}><input type="hidden" name="id" value={lot.id}/><select name="status" defaultValue={lot.status} style={{minWidth:125}}>{["ACTIVE","QUARANTINED","RELEASED","CONSUMED","SOLD","CLOSED"].map(v=><option key={v}>{v}</option>)}</select><button className="button secondary small">Update</button></ActionForm></div>
          {lot.events.length?<div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap"}}>{lot.events.map(e=><span className="status neutral" key={e.id}>{safeDate(e.occurredAt)} · {e.type.replaceAll("_"," ")}</span>)}</div>:null}
        </div>
      </div>
    </div>)}</div> : <div className="card"><EmptyState title="No trace lots yet" text="Create the first harvest or inventory lot above."/></div>}
  </>;
}
