import { Fish, Plus, Waves } from "lucide-react";
import { createAquacultureRecordAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Aquaculture" };

export default async function AquaculturePage() {
  const ctx=await tenantContext("livestock.view");
  const [cycles,records]=await Promise.all([
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId,type:"AQUACULTURE",...ctx.scope.byFarm},include:{farm:true,unit:true},orderBy:{name:"asc"}}),
    db.aquacultureRecord.findMany({where:{tenantId:ctx.tenantId,...ctx.scope.via("cycle")},include:{cycle:{include:{farm:true}}},orderBy:{recordDate:"desc"},take:120}),
  ]);
  const mortality=records.reduce((s,r)=>s+r.mortality,0),feed=records.reduce((s,r)=>s+Number(r.feedKg||0),0);
  const latest=records[0];
  return <><PageHeader eyebrow="Pond & tank performance" title="Aquaculture" description="Track growth sampling, feed, mortality and water-quality indicators for fish production cycles."/>
    <section className="metrics"><MetricCard label="Aquaculture cycles" value={String(cycles.length)} hint="Ponds and tanks" icon={<Fish size={18}/>}/><MetricCard label="Feed recorded" value={`${formatNumber(feed,2)} kg`} hint="Across samples" icon={<Fish size={18}/>}/><MetricCard label="Mortality" value={formatNumber(mortality)} hint="Recorded losses" icon={<Fish size={18}/>}/><MetricCard label="Latest dissolved O₂" value={latest?.dissolvedOxygen?`${formatNumber(latest.dissolvedOxygen,2)} mg/L`:"—"} hint={latest?`Latest reading ${safeDate(latest.recordDate)}`:"No readings"} icon={<Waves size={18}/>}/></section>
    <ActionForm className="form-card" action={createAquacultureRecordAction}><div className="card-head"><div><h3>Add pond/tank record</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Use Production to create an AQUACULTURE cycle first.</div></div><Plus size={19}/></div><div className="form-grid"><div className="field"><label>Aquaculture cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name} · {c.farm.name}</option>)}</select></div><div className="field"><label>Date</label><input name="recordDate" type="date"/></div><div className="field"><label>Sample size</label><input name="sampleSize" type="number" min="0"/></div><div className="field"><label>Average weight (g)</label><input name="avgWeightG" type="number" min="0" step="0.001"/></div><div className="field"><label>Mortality</label><input name="mortality" type="number" min="0" defaultValue="0"/></div><div className="field"><label>Feed (kg)</label><input name="feedKg" type="number" min="0" step="0.001"/></div><div className="field"><label>pH</label><input name="ph" type="number" min="0" step="0.01"/></div><div className="field"><label>Dissolved oxygen (mg/L)</label><input name="dissolvedOxygen" type="number" min="0" step="0.01"/></div><div className="field"><label>Temperature °C</label><input name="temperatureC" type="number" step="0.01"/></div><div className="field span-2"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button" disabled={!cycles.length}>Save record</button></div></ActionForm>
    {records.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Cycle</th><th>Avg weight</th><th>Feed</th><th>Mortality</th><th>pH</th><th>DO</th><th>Temp</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td>{safeDate(r.recordDate)}</td><td><b>{r.cycle.name}</b><div className="muted" style={{fontSize:12}}>{r.cycle.farm.name}</div></td><td>{r.avgWeightG?`${formatNumber(r.avgWeightG,2)} g`:"—"}</td><td>{r.feedKg?`${formatNumber(r.feedKg,2)} kg`:"—"}</td><td>{r.mortality}</td><td>{r.ph?formatNumber(r.ph,2):"—"}</td><td>{r.dissolvedOxygen?`${formatNumber(r.dissolvedOxygen,2)} mg/L`:"—"}</td><td>{r.temperatureC?`${formatNumber(r.temperatureC,1)}°C`:"—"}</td></tr>)}</tbody></table></div>:<div className="card"><EmptyState title="No aquaculture records" text="Create an aquaculture production cycle and begin recording pond performance."/></div>}
  </>;
}
