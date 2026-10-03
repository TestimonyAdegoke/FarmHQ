import { AlertTriangle, CheckCircle2, Leaf, PackageCheck, Plus } from "lucide-react";
import { createCropActivityAction, createHarvestRecordAction, createScoutingObservationAction, resolveScoutingObservationAction, updateCropActivityStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Crop Operations" };

export default async function CropOperationsPage() {
  const ctx = await tenantContext("production.view");
  const [farms, units, cycles, activities, observations, harvests, warehouses, products] = await Promise.all([
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.productionUnit.findMany({ where: { tenantId: ctx.tenantId, active: true, type: { in: ["FIELD","PLOT","GREENHOUSE","ORCHARD","NURSERY"] } }, include: { farm: true }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, type: "CROP", status: { in: ["PLANNED","ACTIVE","PAUSED"] } }, include: { farm: true }, orderBy: { name: "asc" } }),
    db.cropActivity.findMany({ where: { tenantId: ctx.tenantId }, include: { farm: true, unit: true, cycle: true }, orderBy: [{ plannedAt: "desc" }, { createdAt: "desc" }], take: 100 }),
    db.scoutingObservation.findMany({ where: { tenantId: ctx.tenantId }, include: { farm: true, unit: true, cycle: true }, orderBy: { observedAt: "desc" }, take: 100 }),
    db.harvestRecord.findMany({ where: { tenantId: ctx.tenantId }, include: { farm: true, productionUnit: true, cycle: true }, orderBy: { harvestedAt: "desc" }, take: 100 }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const openActivities = activities.filter(a => !["COMPLETED","CANCELLED"].includes(a.status)).length;
  const unresolved = observations.filter(o => !o.resolvedAt);
  const critical = unresolved.filter(o => ["HIGH","CRITICAL"].includes(o.severity)).length;
  const completed = activities.filter(a => a.status === "COMPLETED").length;

  return <><PageHeader eyebrow="Field execution" title="Crop operations" description="Plan agronomic work, scout fields, record issues and capture harvests against each production cycle."/>
    <section className="metrics">
      <MetricCard label="Open activities" value={String(openActivities)} hint="Planned + in progress" icon={<Leaf size={18}/>}/>
      <MetricCard label="Completed activities" value={String(completed)} hint="Latest 100 loaded" icon={<CheckCircle2 size={18}/>}/>
      <MetricCard label="Open observations" value={String(unresolved.length)} hint={`${critical} high / critical`} icon={<AlertTriangle size={18}/>}/>
      <MetricCard label="Harvest records" value={String(harvests.length)} hint="Latest 100 loaded" icon={<PackageCheck size={18}/>}/>
    </section>

    <div className="grid-2" style={{marginBottom:20}}>
      <ActionForm className="form-card" action={createCropActivityAction} style={{margin:0}}><div className="card-head"><div><h3>Plan field activity</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Work is anchored to a crop cycle for costing and traceability.</div></div><Plus size={19}/></div><div className="form-grid two">
        <div className="field span-2"><label>Crop cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select crop cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name} · {c.farm.name}</option>)}</select></div>
        <div className="field"><label>Activity type</label><select name="type" defaultValue="LAND_PREPARATION"><option>LAND_PREPARATION</option><option>PLANTING</option><option>IRRIGATION</option><option>FERTILIZATION</option><option>SPRAYING</option><option>WEEDING</option><option>SCOUTING</option><option>HARVEST</option><option>OTHER</option></select></div>
        <div className="field"><label>Status</label><select name="status" defaultValue="PLANNED"><option>PLANNED</option><option>IN_PROGRESS</option></select></div>
        <div className="field span-2"><label>Activity</label><input name="title" required placeholder="Apply NPK 15-15-15"/></div>
        <div className="field"><label>Production unit</label><select name="unitId" defaultValue=""><option value="">Use cycle unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name} · {u.farm.name}</option>)}</select></div>
        <div className="field"><label>Planned date</label><input name="plannedAt" type="date"/></div>
        <div className="field"><label>Area (ha)</label><input name="areaHa" type="number" min="0" step="0.001"/></div>
        <div className="field"><label>Notes</label><input name="notes"/></div>
      </div><div className="form-actions"><button className="button" disabled={!cycles.length}>Add activity</button></div></ActionForm>

      <ActionForm className="form-card" action={createScoutingObservationAction} style={{margin:0}}><div className="card-head"><div><h3>Record scouting observation</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Capture pests, disease, crop stress and agronomic exceptions.</div></div><AlertTriangle size={19}/></div><div className="form-grid two">
        <div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        <div className="field"><label>Field / unit</label><select name="unitId" defaultValue=""><option value="">Farm-wide</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field"><label>Cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Observed date</label><input name="observedAt" type="date"/></div>
        <div className="field"><label>Category</label><input name="category" required placeholder="Pest / Disease / Nutrition"/></div>
        <div className="field"><label>Severity</label><select name="severity" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></div>
        <div className="field span-2"><label>Issue</label><input name="issue" required placeholder="Fall armyworm observed on southern edge"/></div>
        <div className="field"><label>Affected area (ha)</label><input name="affectedAreaHa" type="number" min="0" step="0.001"/></div>
        <div className="field"><label>Recommendation</label><input name="recommendation"/></div>
        <div className="field"><label>Latitude</label><input name="latitude" type="number" step="0.0000001"/></div>
        <div className="field"><label>Longitude</label><input name="longitude" type="number" step="0.0000001"/></div>
      </div><div className="form-actions"><button className="button" disabled={!farms.length}>Save observation</button></div></ActionForm>
    </div>

    <ActionForm className="form-card" action={createHarvestRecordAction}><div className="card-head"><div><h3>Record harvest</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Optionally post harvested output directly into an inventory warehouse and lot.</div></div><PackageCheck size={19}/></div><div className="form-grid">
      <div className="field"><label>Production cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label>Unit / field</label><select name="unitId" defaultValue=""><option value="">Use cycle unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
      <div className="field"><label>Unit</label><input name="unit" required placeholder="kg / tonnes / crates"/></div>
      <div className="field"><label>Grade</label><input name="grade" placeholder="A"/></div>
      <div className="field"><label>Harvest date</label><input name="harvestedAt" type="date"/></div>
      <div className="field"><label>Lot / batch</label><input name="lotNumber"/></div>
      <div className="field"><label>Output product</label><select name="productId" defaultValue=""><option value="">Do not post stock</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="field"><label>Destination warehouse</label><select name="warehouseId" defaultValue=""><option value="">Do not post stock</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div className="field span-2"><label>Notes</label><input name="notes"/></div>
    </div><div className="form-actions"><button className="button" disabled={!cycles.length}>Record harvest</button></div></ActionForm>

    <div className="grid-2" style={{marginBottom:20}}>
      <div className="card"><div className="card-head"><h2>Activity plan</h2></div>{activities.length?<div className="table-wrap"><table><thead><tr><th>Activity</th><th>Cycle</th><th>Planned</th><th>Status</th><th></th></tr></thead><tbody>{activities.slice(0,30).map(a=><tr key={a.id}><td><b>{a.title}</b><div className="muted" style={{fontSize:12}}>{a.type.replaceAll("_"," ")}</div></td><td>{a.cycle.name}<div className="muted" style={{fontSize:12}}>{a.unit?.name||a.farm.name}</div></td><td>{safeDate(a.plannedAt)}</td><td><span className={`status ${a.status==="PLANNED"?"neutral":""}`}>{a.status.replaceAll("_"," ")}</span></td><td>{a.status!=="COMPLETED"&&a.status!=="CANCELLED"?<ActionForm action={updateCropActivityStatusAction}><input type="hidden" name="id" value={a.id}/><input type="hidden" name="status" value="COMPLETED"/><button className="button secondary small">Complete</button></ActionForm>:null}</td></tr>)}</tbody></table></div>:<EmptyState title="No crop activities" text="Plan the first field operation above."/>}</div>
      <div className="card"><div className="card-head"><h2>Scouting exceptions</h2></div>{observations.length?<div className="table-wrap"><table><thead><tr><th>Observation</th><th>Farm</th><th>Severity</th><th></th></tr></thead><tbody>{observations.slice(0,30).map(o=><tr key={o.id}><td><b>{o.issue}</b><div className="muted" style={{fontSize:12}}>{o.category} · {safeDate(o.observedAt)}</div></td><td>{o.farm.name}<div className="muted" style={{fontSize:12}}>{o.unit?.name||""}</div></td><td><span className={`status ${["HIGH","CRITICAL"].includes(o.severity)?"warn":"neutral"}`}>{o.severity}</span></td><td>{!o.resolvedAt?<ActionForm action={resolveScoutingObservationAction}><input type="hidden" name="id" value={o.id}/><button className="button secondary small">Resolve</button></ActionForm>:<span className="muted">Resolved</span>}</td></tr>)}</tbody></table></div>:<EmptyState title="No scouting observations" text="Field issues and recommendations will appear here."/>}</div>
    </div>

    {harvests.length?<div className="card"><div className="card-head"><h2>Recent harvests</h2></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Cycle</th><th>Farm / field</th><th>Quantity</th><th>Grade</th><th>Lot</th></tr></thead><tbody>{harvests.map(h=><tr key={h.id}><td>{safeDate(h.harvestedAt)}</td><td><b>{h.cycle.name}</b></td><td>{h.farm.name}<div className="muted" style={{fontSize:12}}>{h.productionUnit?.name||""}</div></td><td>{formatNumber(h.quantity,3)} {h.unit}</td><td>{h.grade||"—"}</td><td>{h.lotNumber||"—"}</td></tr>)}</tbody></table></div></div>:null}
  </>;
}
