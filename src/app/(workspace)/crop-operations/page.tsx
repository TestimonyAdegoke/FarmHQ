import Link from "next/link";
import { AlertTriangle, CheckCircle2, Leaf, PackageCheck } from "lucide-react";
import { createCropActivityAction, createHarvestRecordAction, createScoutingObservationAction, resolveScoutingObservationAction, updateCropActivityStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Crop Operations" };

const activityTypes = ["LAND_PREPARATION","PLANTING","IRRIGATION","FERTILIZATION","SPRAYING","WEEDING","SCOUTING","HARVEST","OTHER"];
const severities = ["LOW","MEDIUM","HIGH","CRITICAL"];
const activityTone: Record<string, string> = { PLANNED: "neutral", IN_PROGRESS: "info", CANCELLED: "neutral" };
const severityTone: Record<string, string> = { LOW: "neutral", MEDIUM: "neutral", HIGH: "warn", CRITICAL: "danger" };

export default async function CropOperationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await tenantContext("production.view");
  const requested = (await searchParams).tab;
  const tab = requested === "scouting" || requested === "harvests" ? requested : "activities";
  const [farms, units, cycles, activities, observations, harvests, warehouses, products] = await Promise.all([
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, orderBy: { name: "asc" } }),
    db.productionUnit.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm, type: { in: ["FIELD","PLOT","GREENHOUSE","ORCHARD","NURSERY"] } }, include: { farm: true }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm, type: "CROP", status: { in: ["PLANNED","ACTIVE","PAUSED"] } }, include: { farm: true }, orderBy: { name: "asc" } }),
    db.cropActivity.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { farm: true, unit: true, cycle: true }, orderBy: [{ plannedAt: "desc" }, { createdAt: "desc" }], take: 100 }),
    db.scoutingObservation.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { farm: true, unit: true, cycle: true }, orderBy: { observedAt: "desc" }, take: 100 }),
    db.harvestRecord.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { farm: true, productionUnit: true, cycle: true }, orderBy: { harvestedAt: "desc" }, take: 100 }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const openActivities = activities.filter(a => !["COMPLETED","CANCELLED"].includes(a.status)).length;
  const unresolved = observations.filter(o => !o.resolvedAt);
  const critical = unresolved.filter(o => ["HIGH","CRITICAL"].includes(o.severity)).length;
  const completed = activities.filter(a => a.status === "COMPLETED").length;
  const cycleHint = cycles.length ? undefined : "Start a crop cycle under Production first.";

  return <><PageHeader eyebrow="Operations" title="Crop operations" description="Plan field work, scout for pests and disease, and record harvests against each crop cycle."/>
    <section className="metrics">
      <MetricCard label="Open activities" value={String(openActivities)} hint="Planned or in progress" icon={<Leaf size={16}/>}/>
      <MetricCard label="Completed activities" value={String(completed)} hint="Of the latest 100" icon={<CheckCircle2 size={16}/>}/>
      <MetricCard label="Open field issues" value={String(unresolved.length)} hint={`${critical} high or critical`} icon={<AlertTriangle size={16}/>}/>
      <MetricCard label="Harvest records" value={String(harvests.length)} hint="Latest 100 shown" icon={<PackageCheck size={16}/>}/>
    </section>

    <div className="drawers">
      <FormDetails title="Plan field activity" hint={cycleHint || "Linked to a crop cycle so its cost is tracked."} open={!activities.length && !!cycles.length}>
        <ActionForm action={createCropActivityAction} success="Activity added"><div className="form-grid two">
          <div className="field span-2"><label>Crop cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select crop cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name} · {c.farm.name}</option>)}</select></div>
          <div className="field"><label>Activity type</label><select name="type" defaultValue="LAND_PREPARATION">{activityTypes.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div>
          <div className="field"><label>Status</label><select name="status" defaultValue="PLANNED"><option value="PLANNED">Planned</option><option value="IN_PROGRESS">In progress</option></select></div>
          <div className="field span-2"><label>Activity</label><input name="title" required placeholder="Apply NPK 15-15-15"/></div>
          <div className="field"><label>Production unit</label><select name="unitId" defaultValue=""><option value="">Use cycle unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name} · {u.farm.name}</option>)}</select></div>
          <div className="field"><label>Planned date</label><input name="plannedAt" type="date"/></div>
          <div className="field"><label>Area (ha)</label><input name="areaHa" type="number" min="0" step="0.001"/></div>
          <div className="field"><label>Notes</label><input name="notes"/></div>
        </div><div className="form-actions"><button className="button" disabled={!cycles.length}>Add activity</button></div></ActionForm>
      </FormDetails>

      <FormDetails title="Record scouting observation" hint="Pests, disease, crop stress or anything unusual in the field.">
        <ActionForm action={createScoutingObservationAction} success="Observation saved"><div className="form-grid two">
          <div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="field"><label>Field / unit</label><select name="unitId" defaultValue=""><option value="">Farm-wide</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div className="field"><label>Cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Observed date</label><input name="observedAt" type="date"/></div>
          <div className="field"><label>Category</label><input name="category" required placeholder="Pest / Disease / Nutrition"/></div>
          <div className="field"><label>Severity</label><select name="severity" defaultValue="MEDIUM">{severities.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div>
          <div className="field span-2"><label>Issue</label><input name="issue" required placeholder="Fall armyworm observed on southern edge"/></div>
          <div className="field"><label>Affected area (ha)</label><input name="affectedAreaHa" type="number" min="0" step="0.001"/></div>
          <div className="field"><label>Recommendation</label><input name="recommendation"/></div>
          <div className="field"><label>Latitude</label><input name="latitude" type="number" step="0.0000001"/></div>
          <div className="field"><label>Longitude</label><input name="longitude" type="number" step="0.0000001"/></div>
        </div><div className="form-actions"><button className="button" disabled={!farms.length}>Save observation</button></div></ActionForm>
      </FormDetails>

      <FormDetails title="Record harvest" hint={cycleHint || "Optionally add the harvest straight into a store as stock."}>
        <ActionForm action={createHarvestRecordAction} success="Harvest recorded"><div className="form-grid two">
          <div className="field"><label>Production cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Unit / field</label><select name="unitId" defaultValue=""><option value="">Use cycle unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div className="field"><label>Quantity</label><input name="quantity" required type="number" min="0.001" step="0.001"/></div>
          <div className="field"><label>Unit</label><input name="unit" required placeholder="kg / tonnes / crates"/></div>
          <div className="field"><label>Grade</label><input name="grade" placeholder="A"/></div>
          <div className="field"><label>Harvest date</label><input name="harvestedAt" type="date"/></div>
          <div className="field"><label>Lot / batch</label><input name="lotNumber"/></div>
          <div className="field"><label>Output product</label><select name="productId" defaultValue=""><option value="">Do not post stock</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="field"><label>Destination warehouse</label><select name="warehouseId" defaultValue=""><option value="">Do not post stock</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="field"><label>Notes</label><input name="notes"/></div>
        </div><div className="form-actions"><button className="button" disabled={!cycles.length}>Record harvest</button></div></ActionForm>
      </FormDetails>
    </div>

    <div className="tabs">
      <Link href="/crop-operations" className={tab === "activities" ? "active" : ""}>Activity plan ({openActivities})</Link>
      <Link href="/crop-operations?tab=scouting" className={tab === "scouting" ? "active" : ""}>Field issues ({unresolved.length})</Link>
      <Link href="/crop-operations?tab=harvests" className={tab === "harvests" ? "active" : ""}>Harvests</Link>
    </div>

    {tab === "activities" ? (activities.length ? <div className="table-wrap"><table><thead><tr><th>Activity</th><th>Cycle</th><th>Planned</th><th>Status</th><th></th></tr></thead><tbody>{activities.slice(0,30).map(a=><tr key={a.id}><td><b>{a.title}</b><div className="sub">{humanize(a.type)}</div></td><td>{a.cycle.name}<div className="sub">{a.unit?.name||a.farm.name}</div></td><td>{safeDate(a.plannedAt)}</td><td><span className={`status ${activityTone[a.status] || ""}`}>{humanize(a.status)}</span></td><td>{a.status!=="COMPLETED"&&a.status!=="CANCELLED"?<ActionForm action={updateCropActivityStatusAction}><input type="hidden" name="id" value={a.id}/><input type="hidden" name="status" value="COMPLETED"/><button className="button secondary small">Complete</button></ActionForm>:null}</td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No crop activities" text="Plan the first field operation for a crop cycle." icon={<Leaf size={20}/>}/></div>)
      : tab === "scouting" ? (observations.length ? <div className="table-wrap"><table><thead><tr><th>Observation</th><th>Farm</th><th>Severity</th><th></th></tr></thead><tbody>{observations.slice(0,30).map(o=><tr key={o.id}><td><b>{o.issue}</b><div className="sub">{o.category} · {safeDate(o.observedAt)}</div></td><td>{o.farm.name}<div className="sub">{o.unit?.name||""}</div></td><td><span className={`status ${o.resolvedAt ? "neutral" : severityTone[o.severity] || "neutral"}`}>{humanize(o.severity)}</span></td><td>{!o.resolvedAt?<ActionForm action={resolveScoutingObservationAction}><input type="hidden" name="id" value={o.id}/><button className="button secondary small">Resolve</button></ActionForm>:<span className="muted small-text">Resolved</span>}</td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No scouting observations" text="Pests, disease and other field issues will appear here." icon={<AlertTriangle size={20}/>}/></div>)
      : (harvests.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Cycle</th><th>Farm / field</th><th className="text-right">Quantity</th><th>Grade</th><th>Lot</th></tr></thead><tbody>{harvests.map(h=><tr key={h.id}><td>{safeDate(h.harvestedAt)}</td><td><b>{h.cycle.name}</b></td><td>{h.farm.name}<div className="sub">{h.productionUnit?.name||""}</div></td><td className="text-right">{formatNumber(h.quantity,3)} {h.unit}</td><td>{h.grade||"—"}</td><td>{h.lotNumber||"—"}</td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No harvests yet" text="Record a harvest to track yield by cycle and field." icon={<PackageCheck size={20}/>}/></div>)}
  </>;
}
