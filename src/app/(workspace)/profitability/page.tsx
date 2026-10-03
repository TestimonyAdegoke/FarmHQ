import { CircleDollarSign, Gauge, TrendingUp, WalletCards } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { labourCost } from "@/lib/ledger";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, humanize } from "@/lib/utils";

export const metadata = { title: "Profitability" };

export default async function ProfitabilityPage() {
  const ctx=await tenantContext("finance.view");
  const cycles=await db.productionCycle.findMany({
    where:{tenantId:ctx.tenantId,...ctx.scope.byFarm},
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
  const money = (n: number) => formatMoney(n, ctx.tenant.currency);
  return <>
    <PageHeader eyebrow="Unit economics" title="Production profitability" description="Costs, output and revenue side by side for every production cycle." />
    <section className="metrics">
      <MetricCard label="Revenue" value={money(totalRevenue)} hint="Linked to production cycles" icon={<TrendingUp size={16} />} />
      <MetricCard label="Production cost" value={money(totalCost)} hint="Expenses, inputs, labour, equipment" icon={<WalletCards size={16} />} />
      <MetricCard label="Gross margin" value={money(totalMargin)} hint={`${marginPct.toFixed(1)}% of revenue`} icon={<CircleDollarSign size={16} />} />
      <MetricCard label="Costed cycles" value={String(rows.filter(r=>r.cost||r.revenue).length)} hint={`${cycles.length} total cycles`} icon={<Gauge size={16} />} />
    </section>
    {rows.length ? <div className="table-wrap"><table><thead><tr><th>Cycle</th><th>Farm</th><th className="text-right">Direct expenses</th><th className="text-right">Inputs</th><th className="text-right">Labour</th><th className="text-right">Equipment</th><th className="text-right">Total cost</th><th className="text-right">Revenue</th><th className="text-right">Margin</th><th className="text-right">Budget / output</th></tr></thead><tbody>{rows.map(r => {
      const budgetPct = r.budget ? r.cost / r.budget * 100 : 0;
      const costPerOutput = r.output ? r.cost / r.output : 0;
      return <tr key={r.c.id}>
        <td><b>{r.c.name}</b><div className="sub">{r.c.commodity} · {humanize(r.c.type)}</div></td>
        <td>{r.c.farm.name}<div className="sub">{r.c.unit?.name || "Farm-wide"}</div></td>
        <td className="text-right">{money(r.direct)}</td>
        <td className="text-right">{money(r.inputs)}</td>
        <td className="text-right">{money(r.labour)}</td>
        <td className="text-right">{money(r.equipment)}</td>
        <td className="text-right"><b>{money(r.cost)}</b></td>
        <td className="text-right">{money(r.revenue)}</td>
        <td className="text-right"><span className={`status ${r.margin < 0 ? "danger" : ""}`}>{money(r.margin)}</span></td>
        <td className="text-right">{r.budget ? <>{budgetPct.toFixed(0)}% of {money(r.budget)}</> : <span className="muted">No budget</span>}<div className="sub">{r.outputUnit && r.output ? `${formatNumber(r.output, 3)} ${r.outputUnit} · ${money(costPerOutput)}/${r.outputUnit}` : "No comparable output yet"}</div></td>
      </tr>;
    })}</tbody></table></div> : <div className="card"><EmptyState title="No production cycles" text="Profitability is calculated once production cycles exist." /></div>}
  </>;
}
