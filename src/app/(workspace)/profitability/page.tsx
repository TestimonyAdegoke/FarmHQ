import { CircleDollarSign, Gauge, TrendingUp, WalletCards } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { labourCost } from "@/lib/ledger";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber } from "@/lib/utils";

export const metadata = { title: "Profitability" };

export default async function ProfitabilityPage() {
  const ctx=await tenantContext("finance.view");
  const cycles=await db.productionCycle.findMany({
    where:{tenantId:ctx.tenantId},
    include:{farm:true,unit:true,expenses:true,revenues:true,harvestRecords:true,timesheets:true,equipmentLogs:true,inventoryTxns:{include:{product:true}}},
    orderBy:{createdAt:"desc"},
  });
  const rows=cycles.map(c=>{
    const direct=c.expenses.filter(e=>["APPROVED","PAID"].includes(e.status)).reduce((s,e)=>s+Number(e.amount),0);
    const inputs=c.inventoryTxns.filter(t=>["ISSUE","ADJUSTMENT_OUT","WASTE"].includes(t.type)).reduce((s,t)=>s+Number(t.quantity)*Number(t.unitCost||t.product.standardCost||0),0);
    const labour=c.timesheets.filter(t=>t.status==="APPROVED").reduce((s,t)=>s+labourCost(t),0);
    const equipment=c.equipmentLogs.reduce((s,l)=>s+Number(l.cost||0),0);
    const cost=direct+inputs+labour+equipment;
    const revenue=c.revenues.reduce((s,r)=>s+Number(r.amount),0);
    const margin=revenue-cost;
    const budget=Number(c.budgetAmount||0);
    const units=[...new Set(c.harvestRecords.map(h=>h.unit))];
    const output=units.length===1?c.harvestRecords.reduce((s,h)=>s+Number(h.quantity),0):0;
    return {c,direct,inputs,labour,equipment,cost,revenue,margin,budget,output,outputUnit:units.length===1?units[0]:null};
  });
  const totalCost=rows.reduce((s,r)=>s+r.cost,0), totalRevenue=rows.reduce((s,r)=>s+r.revenue,0), totalMargin=totalRevenue-totalCost;
  const marginPct=totalRevenue?totalMargin/totalRevenue*100:0;
  return <><PageHeader eyebrow="Unit economics" title="Production profitability" description="See direct expenses, consumed inventory, output and revenue together for every production cycle."/>
    <section className="metrics"><MetricCard label="Revenue" value={formatMoney(totalRevenue,ctx.tenant.currency)} hint="Cycle-linked revenue" icon={<TrendingUp size={18}/>}/><MetricCard label="Production cost" value={formatMoney(totalCost,ctx.tenant.currency)} hint="Expenses + consumed stock" icon={<WalletCards size={18}/>}/><MetricCard label="Gross margin" value={formatMoney(totalMargin,ctx.tenant.currency)} hint={`${marginPct.toFixed(1)}% of revenue`} icon={<CircleDollarSign size={18}/>}/><MetricCard label="Costed cycles" value={String(rows.filter(r=>r.cost||r.revenue).length)} hint={`${cycles.length} total cycles`} icon={<Gauge size={18}/>}/></section>
    {rows.length?<div className="table-wrap"><table><thead><tr><th>Cycle</th><th>Farm</th><th>Direct expenses</th><th>Inputs</th><th>Labour</th><th>Equipment</th><th>Total cost</th><th>Revenue</th><th>Margin</th><th>Budget / output</th></tr></thead><tbody>{rows.map(r=>{const budgetPct=r.budget?r.cost/r.budget*100:0;const costPerOutput=r.output?r.cost/r.output:0;return <tr key={r.c.id}><td><b>{r.c.name}</b><div className="muted" style={{fontSize:12}}>{r.c.commodity} · {r.c.type}</div></td><td>{r.c.farm.name}<div className="muted" style={{fontSize:12}}>{r.c.unit?.name||"Farm-wide"}</div></td><td>{formatMoney(r.direct,ctx.tenant.currency)}</td><td>{formatMoney(r.inputs,ctx.tenant.currency)}</td><td>{formatMoney(r.labour,ctx.tenant.currency)}</td><td>{formatMoney(r.equipment,ctx.tenant.currency)}</td><td><b>{formatMoney(r.cost,ctx.tenant.currency)}</b></td><td>{formatMoney(r.revenue,ctx.tenant.currency)}</td><td><span className={`status ${r.margin<0?"warn":""}`}>{formatMoney(r.margin,ctx.tenant.currency)}</span></td><td>{r.budget?<>{budgetPct.toFixed(0)}% of {formatMoney(r.budget,ctx.tenant.currency)}</>:"No budget"}<div className="muted" style={{fontSize:12}}>{r.outputUnit&&r.output?`${formatNumber(r.output,3)} ${r.outputUnit} · ${formatMoney(costPerOutput,ctx.tenant.currency)}/${r.outputUnit}`:"No comparable output yet"}</div></td></tr>})}</tbody></table></div>:<div className="card"><EmptyState title="No production cycles" text="Profitability is calculated once production cycles exist."/></div>}
  </>;
}
