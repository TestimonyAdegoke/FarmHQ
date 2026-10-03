import { Activity, BarChart3, CircleDollarSign, LandPlot } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber } from "@/lib/utils";

export const metadata={title:"Analytics"};

export default async function AnalyticsPage(){
 const ctx=await tenantContext("analytics.view");
 const [farms,cycles,expenses,units]=await Promise.all([
  db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},include:{_count:{select:{cycles:true,units:true}}},orderBy:{name:"asc"}}),
  db.productionCycle.findMany({where:{tenantId:ctx.tenantId},include:{expenses:true},orderBy:{createdAt:"desc"}}),
  db.expense.findMany({where:{tenantId:ctx.tenantId,status:{in:["APPROVED","PAID"]}}}),
  db.productionUnit.findMany({where:{tenantId:ctx.tenantId,active:true}}),
 ]);
 const spend=expenses.reduce((s,e)=>s+Number(e.amount),0);
 const area=units.reduce((s,u)=>s+Number(u.areaHa||0),0);
 const active=cycles.filter(c=>c.status==="ACTIVE").length;
 const avgCostPerHa=area?spend/area:0;
 const maxFarmCycles=Math.max(1,...farms.map(f=>f._count.cycles));
 const cycleCosts=cycles.map(c=>({name:c.name,commodity:c.commodity,cost:c.expenses.reduce((s,e)=>s+Number(e.amount),0),budget:Number(c.budgetAmount||0)})).sort((a,b)=>b.cost-a.cost).slice(0,10);
 const money=(n:number)=>formatMoney(n,ctx.tenant.currency);
 return <>
  <PageHeader eyebrow="Decision intelligence" title="Analytics" description="Key operating and cost measures, worked out from your farm records."/>
  <section className="metrics">
   <MetricCard label="Managed area" value={`${formatNumber(area)} ha`} hint="Total area of production units" icon={<LandPlot size={16}/>}/>
   <MetricCard label="Active cycles" value={String(active)} hint={`${cycles.length} total cycles`} icon={<Activity size={16}/>}/>
   <MetricCard label="Approved spend" value={money(spend)} hint="Across farms and cycles" icon={<CircleDollarSign size={16}/>}/>
   <MetricCard label="Spend per hectare" value={money(avgCostPerHa)} hint="Approved spend ÷ managed area" icon={<BarChart3 size={16}/>}/>
  </section>
  <div className="grid-2">
   <div className="card"><div className="card-head"><div><h2>Farm activity</h2><div className="card-sub">Production cycles by farm</div></div></div>
    {farms.map(f=><div className="progress-row" key={f.id}><div className="progress-label"><span>{f.name}</span><b>{f._count.cycles} cycles</b></div><div className="progress"><span style={{width:`${f._count.cycles/maxFarmCycles*100}%`}}/></div><small className="muted">{f._count.units} production units</small></div>)}
    {!farms.length?<EmptyState title="No farms yet" text="Add farms to begin analytics."/>:null}
   </div>
   <div className="card"><div className="card-head"><div><h2>Cycle cost position</h2><div className="card-sub">Recorded expenses against cycle budgets</div></div></div>
    {cycleCosts.map(c=>{const pct=c.budget?Math.min(100,c.cost/c.budget*100):0;return <div className="progress-row" key={c.name}><div className="progress-label"><span>{c.name}</span><b>{money(c.cost)}</b></div><div className="progress"><span style={{width:`${c.budget?Math.max(3,pct):0}%`}}/></div><small className="muted">{c.commodity} · {c.budget?`${pct.toFixed(0)}% of ${money(c.budget)} budget`:"No budget set"}</small></div>})}
    {!cycleCosts.length?<EmptyState title="No cycle costs yet" text="Create production cycles and allocate expenses to see cycle economics."/>:null}
   </div>
  </div>
 </>;
}
