import { AlertTriangle, CheckCircle2, CircleDollarSign, ClipboardCheck, LandPlot, Sprout } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function Dashboard() {
  const ctx = await tenantContext();
  const [farms, area, activeCycles, openTasks, expenseAgg, revenueAgg, recentTasks, recentCycles, products, txns, criticalObservations, pendingRequests] = await Promise.all([
    db.farm.count({ where: { tenantId: ctx.tenantId, active: true } }),
    db.productionUnit.aggregate({ where: { tenantId: ctx.tenantId, active: true }, _sum: { areaHa: true } }),
    db.productionCycle.count({ where: { tenantId: ctx.tenantId, status: "ACTIVE" } }),
    db.task.count({ where: { tenantId: ctx.tenantId, status: { in: ["TODO","IN_PROGRESS","BLOCKED"] } } }),
    db.expense.aggregate({ where: { tenantId: ctx.tenantId, status: { in: ["APPROVED","PAID"] } }, _sum: { amount: true } }),
    db.revenue.aggregate({ where: { tenantId: ctx.tenantId }, _sum: { amount: true } }),
    db.task.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["TODO","IN_PROGRESS","BLOCKED"] } }, include: { farm: true, assignedTo: true }, orderBy: [{ priority:"desc" },{ dueAt:"asc" }], take: 6 }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId }, include: { farm: true }, orderBy: { createdAt:"desc" }, take: 6 }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id:true,name:true,unit:true,reorderLevel:true }, take: 200 }),
    db.inventoryTransaction.findMany({ where: { tenantId: ctx.tenantId }, select: { productId:true,type:true,quantity:true } }),
    db.scoutingObservation.findMany({ where: { tenantId: ctx.tenantId, resolvedAt: null, severity: { in: ["HIGH","CRITICAL"] } }, include: { farm: true }, orderBy: { observedAt: "desc" }, take: 3 }),
    db.purchaseRequest.count({ where: { tenantId: ctx.tenantId, status: { in: ["DRAFT","SUBMITTED"] } } }),
  ]);
  const stock = new Map<string,number>();
  for (const t of txns) {
    const direction = ["ISSUE","TRANSFER_OUT","ADJUSTMENT_OUT","SALE","WASTE"].includes(t.type) ? -1 : 1;
    stock.set(t.productId, (stock.get(t.productId) || 0) + direction * Number(t.quantity));
  }
  const lowStock = products.filter(p => p.reorderLevel != null && (stock.get(p.id)||0) <= Number(p.reorderLevel)).slice(0,4);

  return <>
    <PageHeader eyebrow="Command centre" title={`Good day, ${ctx.user.name.split(" ")[0]}`} description="A live view of your farm operations and business health." />
    <section className="metrics">
      <MetricCard label="Active farms" value={String(farms)} hint="Across this organization" icon={<Sprout size={18}/>}/>
      <MetricCard label="Managed area" value={`${formatNumber(area._sum.areaHa || 0)} ha`} hint="Production units" icon={<LandPlot size={18}/>}/>
      <MetricCard label="Active cycles" value={String(activeCycles)} hint="Currently in production" icon={<CheckCircle2 size={18}/>}/>
      <MetricCard label="Net operating position" value={formatMoney(Number(revenueAgg._sum.amount || 0)-Number(expenseAgg._sum.amount || 0), ctx.tenant.currency)} hint={`${formatMoney(revenueAgg._sum.amount || 0,ctx.tenant.currency)} revenue · ${pendingRequests} purchase requests`} icon={<CircleDollarSign size={18}/>}/>
    </section>
    <section className="grid-2">
      <div className="card"><div className="card-head"><div><h2>Production</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Latest production cycles</div></div></div>{recentCycles.length ? recentCycles.map(c => <div className="progress-row" key={c.id}><div className="progress-label"><span><b>{c.commodity}</b> · {c.farm.name}</span><span className={`status ${c.status === "PLANNED" ? "neutral" : ""}`}>{c.status}</span></div><div className="progress"><span style={{width:c.status === "COMPLETED" ? "100%" : c.status === "ACTIVE" ? "62%" : "18%"}}/></div><small className="muted">{c.name}{c.expectedEndDate ? ` · target end ${safeDate(c.expectedEndDate)}` : ""}</small></div>) : <div className="empty"><strong>No production cycles yet</strong><span>Create your first cycle from Production.</span></div>}</div>
      <div className="card"><div className="card-head"><div><h2>Attention required</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Operational exceptions</div></div><AlertTriangle size={19} color="#9b6a10"/></div><div className="alert-list">{lowStock.map(p => <div className="alert" key={p.id}><AlertTriangle size={18} color="#9b6a10"/><div><b>{p.name} is at or below reorder level</b><small>{formatNumber(stock.get(p.id)||0)} {p.unit} available</small></div></div>)}{criticalObservations.map(o=><div className="alert" key={o.id}><AlertTriangle size={18} color="#9b6a10"/><div><b>{o.issue}</b><small>{o.farm.name} · {o.severity.toLowerCase()} scouting issue</small></div></div>)}{recentTasks.filter(t=>t.status==="BLOCKED").map(t=><div className="alert" key={t.id}><ClipboardCheck size={18}/><div><b>{t.title} is blocked</b><small>{t.farm?.name || "Organization-wide task"}</small></div></div>)}{!lowStock.length && !criticalObservations.length && !recentTasks.some(t=>t.status==="BLOCKED") && <div className="alert"><CheckCircle2 size={18} color="var(--brand)"/><div><b>No critical exceptions</b><small>FarmHQ will surface low stock, scouting issues and blocked work here.</small></div></div>}</div></div>
      <div className="card" style={{gridColumn:"1/-1"}}><div className="card-head"><div><h2>Work queue</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Priority tasks across your operation</div></div></div>{recentTasks.length ? <div className="table-wrap"><table><thead><tr><th>Task</th><th>Farm</th><th>Assignee</th><th>Due</th><th>Status</th></tr></thead><tbody>{recentTasks.map(t=><tr key={t.id}><td><b>{t.title}</b></td><td>{t.farm?.name || "All farms"}</td><td>{t.assignedTo?.name || "Unassigned"}</td><td>{safeDate(t.dueAt)}</td><td><span className={`status ${t.status === "BLOCKED" ? "warn" : t.status === "TODO" ? "neutral" : ""}`}>{t.status.replaceAll("_"," ")}</span></td></tr>)}</tbody></table></div> : <div className="empty"><strong>No open tasks</strong><span>Work assigned across farms will appear here.</span></div>}</div>
    </section>
  </>;
}
