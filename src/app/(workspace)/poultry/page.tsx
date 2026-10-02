import { Bird, Plus } from "lucide-react";
import { createPoultryDailyRecordAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Poultry" };

export default async function PoultryPage() {
  const ctx = await tenantContext();
  const [cycles, records] = await Promise.all([
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, type: "POULTRY" }, include: { farm: true, unit: true }, orderBy: { name: "asc" } }),
    db.poultryDailyRecord.findMany({ where: { tenantId: ctx.tenantId }, include: { cycle: { include: { farm: true } } }, orderBy: { recordDate: "desc" }, take: 120 }),
  ]);
  const mortality=records.reduce((s,r)=>s+r.mortality,0), culls=records.reduce((s,r)=>s+r.culls,0), feed=records.reduce((s,r)=>s+Number(r.feedKg||0),0), eggs=records.reduce((s,r)=>s+(r.eggs||0),0);
  return <><PageHeader eyebrow="Flock performance" title="Poultry" description="Daily operational records for broiler and layer cycles without creating one animal record per bird."/>
    <section className="metrics"><MetricCard label="Poultry cycles" value={String(cycles.length)} hint="All statuses" icon={<Bird size={18}/>}/><MetricCard label="Recorded mortality" value={formatNumber(mortality)} hint={`${formatNumber(culls)} culls`} icon={<Bird size={18}/>}/><MetricCard label="Feed recorded" value={`${formatNumber(feed,2)} kg`} hint="Across daily records" icon={<Bird size={18}/>}/><MetricCard label="Eggs recorded" value={formatNumber(eggs)} hint="Layer production" icon={<Bird size={18}/>}/></section>
    <form className="form-card" action={createPoultryDailyRecordAction}><div className="card-head"><div><h3>Add daily flock record</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Use Production to create a POULTRY cycle first.</div></div><Plus size={19}/></div><div className="form-grid"><div className="field"><label>Poultry cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select flock cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name} · {c.farm.name}</option>)}</select></div><div className="field"><label>Date</label><input name="recordDate" type="date"/></div><div className="field"><label>Opening birds</label><input name="openingBirds" type="number" min="0"/></div><div className="field"><label>Mortality</label><input name="mortality" type="number" min="0" defaultValue="0"/></div><div className="field"><label>Culls</label><input name="culls" type="number" min="0" defaultValue="0"/></div><div className="field"><label>Feed (kg)</label><input name="feedKg" type="number" min="0" step="0.001"/></div><div className="field"><label>Water (L)</label><input name="waterLiters" type="number" min="0" step="0.001"/></div><div className="field"><label>Eggs</label><input name="eggs" type="number" min="0"/></div><div className="field"><label>Avg weight (kg)</label><input name="avgWeightKg" type="number" min="0" step="0.001"/></div><div className="field span-2"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button" disabled={!cycles.length}>Save record</button></div></form>
    {records.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Cycle</th><th>Opening</th><th>Mortality</th><th>Feed</th><th>Eggs</th><th>Avg weight</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td>{safeDate(r.recordDate)}</td><td><b>{r.cycle.name}</b><div className="muted" style={{fontSize:12}}>{r.cycle.farm.name}</div></td><td>{r.openingBirds??"—"}</td><td>{r.mortality}{r.culls?` + ${r.culls} culls`:""}</td><td>{r.feedKg?`${formatNumber(r.feedKg,2)} kg`:"—"}</td><td>{r.eggs??"—"}</td><td>{r.avgWeightKg?`${formatNumber(r.avgWeightKg,3)} kg`:"—"}</td></tr>)}</tbody></table></div>:<div className="card"><EmptyState title="No poultry records" text="Create a poultry production cycle and begin recording daily flock performance."/></div>}
  </>;
}
