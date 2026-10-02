import { Plus } from "lucide-react";
import { createCycleAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Production" };

export default async function ProductionPage() {
  const ctx = await tenantContext();
  const [farms, units, cycles] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionUnit.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId},include:{farm:true,unit:true,_count:{select:{tasks:true,inventoryTxns:true,expenses:true}}},orderBy:{createdAt:"desc"}}),
  ]);
  return <><PageHeader eyebrow="Production engine" title="Production cycles" description="The common operating model for crop seasons, livestock groups, poultry batches and aquaculture cycles."/>
    <form className="form-card" action={createCycleAction}><div className="card-head"><div><h3>Start a production cycle</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Attach work, inventory and costs to this cycle as production progresses.</div></div><Plus size={20}/></div><div className="form-grid"><div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Production unit (optional)</label><select name="unitId" defaultValue=""><option value="">No specific unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div><div className="field"><label>Cycle name</label><input name="name" required placeholder="2027 Wet Season Maize"/></div><div className="field"><label>Type</label><select name="type" defaultValue="CROP"><option>CROP</option><option>LIVESTOCK</option><option>POULTRY</option><option>AQUACULTURE</option><option>OTHER</option></select></div><div className="field"><label>Commodity / species</label><input name="commodity" required placeholder="Maize"/></div><div className="field"><label>Variety / breed</label><input name="variety"/></div><div className="field"><label>Status</label><select name="status" defaultValue="PLANNED"><option>PLANNED</option><option>ACTIVE</option></select></div><div className="field"><label>Budget</label><input name="budgetAmount" type="number" min="0" step="0.01"/></div><div className="field"><label>Start date</label><input name="startDate" type="date"/></div><div className="field"><label>Expected end</label><input name="expectedEndDate" type="date"/></div><div className="field"><label>Target quantity</label><input name="targetQuantity" type="number" min="0" step="0.001"/></div><div className="field"><label>Target unit</label><input name="targetUnit" placeholder="tonnes / kg / birds"/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Create cycle</button></div></form>
    {cycles.length ? <div className="table-wrap"><table><thead><tr><th>Cycle</th><th>Farm / Unit</th><th>Production</th><th>Dates</th><th>Target</th><th>Budget</th><th>Status</th></tr></thead><tbody>{cycles.map(c=><tr key={c.id}><td><b>{c.name}</b><div className="muted" style={{fontSize:12,marginTop:4}}>{c.type}</div></td><td>{c.farm.name}<div className="muted" style={{fontSize:12}}>{c.unit?.name || "Farm-wide"}</div></td><td>{c.commodity}{c.variety?<div className="muted" style={{fontSize:12}}>{c.variety}</div>:null}</td><td>{safeDate(c.startDate)}<div className="muted" style={{fontSize:12}}>to {safeDate(c.expectedEndDate)}</div></td><td>{c.targetQuantity ? `${formatNumber(c.targetQuantity)} ${c.targetUnit||""}` : "—"}</td><td>{c.budgetAmount ? formatMoney(c.budgetAmount,ctx.tenant.currency) : "—"}</td><td><span className={`status ${c.status==="PLANNED"?"neutral":""}`}>{c.status}</span></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No production cycles" text="Create a cycle to connect farm work, consumed inputs and economics to a production outcome."/></div>}
  </>;
}
