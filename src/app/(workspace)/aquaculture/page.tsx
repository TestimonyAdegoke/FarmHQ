import { Fish, Skull, Waves, Wheat } from "lucide-react";
import { createAquacultureRecordAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
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
  return <><PageHeader eyebrow="Operations" title="Aquaculture" description="Growth samples, feed, losses and water quality for each pond or tank cycle."/>
    <section className="metrics"><MetricCard label="Fish cycles" value={String(cycles.length)} hint="Ponds and tanks" icon={<Fish size={16}/>}/><MetricCard label="Feed recorded" value={`${formatNumber(feed,2)} kg`} hint="Across samples" icon={<Wheat size={16}/>}/><MetricCard label="Mortality" value={formatNumber(mortality)} hint="Recorded losses" icon={<Skull size={16}/>}/><MetricCard label="Latest dissolved O₂" value={latest?.dissolvedOxygen?`${formatNumber(latest.dissolvedOxygen,2)} mg/L`:"—"} hint={latest?`Reading of ${safeDate(latest.recordDate)}`:"No readings"} icon={<Waves size={16}/>}/></section>
    <FormDetails title="Add pond / tank record" hint={cycles.length ? "Sample weights, feed, losses and water readings." : "Create an aquaculture cycle under Production first."} open={!records.length}>
      <ActionForm action={createAquacultureRecordAction} success="Record saved"><div className="form-grid"><div className="field"><label>Aquaculture cycle</label><select name="cycleId" required defaultValue=""><option value="" disabled>Select cycle</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name} · {c.farm.name}</option>)}</select></div><div className="field"><label>Date</label><input name="recordDate" type="date"/></div><div className="field"><label>Sample size</label><input name="sampleSize" type="number" min="0"/></div><div className="field"><label>Average weight (g)</label><input name="avgWeightG" type="number" min="0" step="0.001"/></div><div className="field"><label>Mortality</label><input name="mortality" type="number" min="0" defaultValue="0"/></div><div className="field"><label>Feed (kg)</label><input name="feedKg" type="number" min="0" step="0.001"/></div><div className="field"><label>pH</label><input name="ph" type="number" min="0" step="0.01"/></div><div className="field"><label>Dissolved oxygen (mg/L)</label><input name="dissolvedOxygen" type="number" min="0" step="0.01"/></div><div className="field"><label>Temperature °C</label><input name="temperatureC" type="number" step="0.01"/></div><div className="field span-2"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button" disabled={!cycles.length}>Save record</button></div></ActionForm>
    </FormDetails>
    {records.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Cycle</th><th className="text-right">Avg weight</th><th className="text-right">Feed</th><th className="text-right">Mortality</th><th className="text-right">pH</th><th className="text-right">Oxygen</th><th className="text-right">Temp</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td>{safeDate(r.recordDate)}</td><td><b>{r.cycle.name}</b><div className="sub">{r.cycle.farm.name}</div></td><td className="text-right">{r.avgWeightG?`${formatNumber(r.avgWeightG,2)} g`:"—"}</td><td className="text-right">{r.feedKg?`${formatNumber(r.feedKg,2)} kg`:"—"}</td><td className="text-right">{r.mortality}</td><td className="text-right">{r.ph?formatNumber(r.ph,2):"—"}</td><td className="text-right">{r.dissolvedOxygen?`${formatNumber(r.dissolvedOxygen,2)} mg/L`:"—"}</td><td className="text-right">{r.temperatureC?`${formatNumber(r.temperatureC,1)}°C`:"—"}</td></tr>)}</tbody></table></div>:<div className="card"><EmptyState title="No aquaculture records" text="Create an aquaculture cycle, then record pond or tank performance." icon={<Fish size={20}/>}/></div>}
  </>;
}
