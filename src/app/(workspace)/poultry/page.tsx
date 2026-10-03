import { Bird, Egg, Skull, Wheat } from "lucide-react";
import { createPoultryDailyRecordAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Poultry" };

export default async function PoultryPage() {
  const ctx = await tenantContext("livestock.view");
  const [cycles, records] = await Promise.all([
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, type: "POULTRY", ...ctx.scope.byFarm }, include: { farm: true, unit: true }, orderBy: { name: "asc" } }),
    db.poultryDailyRecord.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.via("cycle") }, include: { cycle: { include: { farm: true } } }, orderBy: { recordDate: "desc" }, take: 120 }),
  ]);
  const mortality=records.reduce((s,r)=>s+r.mortality,0), culls=records.reduce((s,r)=>s+r.culls,0), feed=records.reduce((s,r)=>s+Number(r.feedKg||0),0), eggs=records.reduce((s,r)=>s+(r.eggs||0),0);
  return <><PageHeader eyebrow="Operations" title="Poultry" description="Daily flock records for broiler and layer batches: deaths, feed, water, eggs and weight."/>
    <section className="metrics"><MetricCard label="Flock cycles" value={String(cycles.length)} hint="All statuses" icon={<Bird size={16}/>}/><MetricCard label="Deaths recorded" value={formatNumber(mortality)} hint={`${formatNumber(culls)} culls`} icon={<Skull size={16}/>}/><MetricCard label="Feed recorded" value={`${formatNumber(feed,2)} kg`} hint="Across daily records" icon={<Wheat size={16}/>}/><MetricCard label="Eggs recorded" value={formatNumber(eggs)} hint="Layer production" icon={<Egg size={16}/>}/></section>
    <FormDetails title="Add daily flock record" hint={cycles.length ? "One entry per flock per day." : "Create a poultry cycle under Production first."} open={!records.length}>
      <ActionForm action={createPoultryDailyRecordAction} success="Record saved"><div className="form-grid"><div className="field"><label>Poultry cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select flock cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name} · {c.farm.name}</option>)}</select></div><div className="field"><label>Date</label><input name="recordDate" type="date"/></div><div className="field"><label>Opening birds</label><input name="openingBirds" type="number" min="0"/></div><div className="field"><label>Mortality</label><input name="mortality" type="number" min="0" defaultValue="0"/></div><div className="field"><label>Culls</label><input name="culls" type="number" min="0" defaultValue="0"/></div><div className="field"><label>Feed (kg)</label><input name="feedKg" type="number" min="0" step="0.001"/></div><div className="field"><label>Water (L)</label><input name="waterLiters" type="number" min="0" step="0.001"/></div><div className="field"><label>Eggs</label><input name="eggs" type="number" min="0"/></div><div className="field"><label>Avg weight (kg)</label><input name="avgWeightKg" type="number" min="0" step="0.001"/></div><div className="field span-2"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button" disabled={!cycles.length}>Save record</button></div></ActionForm>
    </FormDetails>
    {records.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Cycle</th><th className="text-right">Opening</th><th className="text-right">Mortality</th><th className="text-right">Feed</th><th className="text-right">Eggs</th><th className="text-right">Avg weight</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td>{safeDate(r.recordDate)}</td><td><b>{r.cycle.name}</b><div className="sub">{r.cycle.farm.name}</div></td><td className="text-right">{r.openingBirds??"—"}</td><td className="text-right">{r.mortality}{r.culls?` + ${r.culls} culls`:""}</td><td className="text-right">{r.feedKg?`${formatNumber(r.feedKg,2)} kg`:"—"}</td><td className="text-right">{r.eggs??"—"}</td><td className="text-right">{r.avgWeightKg?`${formatNumber(r.avgWeightKg,3)} kg`:"—"}</td></tr>)}</tbody></table></div>:<div className="card"><EmptyState title="No poultry records" text="Create a poultry cycle, then record flock performance each day." icon={<Bird size={20}/>}/></div>}
  </>;
}
