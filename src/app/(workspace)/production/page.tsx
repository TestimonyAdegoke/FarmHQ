import { createCycleAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Production" };

const cycleTypes = ["CROP", "LIVESTOCK", "POULTRY", "AQUACULTURE", "OTHER"];
const statusTone: Record<string, string> = { PLANNED: "neutral", PAUSED: "warn", CANCELLED: "neutral" };

export default async function ProductionPage() {
  const ctx = await tenantContext("production.view");
  const [farms, units, cycles] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true,...ctx.scope.farms},orderBy:{name:"asc"}}),
    db.productionUnit.findMany({where:{tenantId:ctx.tenantId,active:true,...ctx.scope.byFarm},orderBy:{name:"asc"}}),
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId,...ctx.scope.byFarm},include:{farm:true,unit:true,_count:{select:{tasks:true,inventoryTxns:true,expenses:true}}},orderBy:{createdAt:"desc"}}),
  ]);
  return <><PageHeader eyebrow="Operations" title="Production cycles" description="Crop seasons, livestock groups, poultry batches and fish cycles. Work, inputs and costs attach to a cycle."/>
    <FormDetails title="Start a production cycle" hint={farms.length ? "Link tasks, stock used and costs to it as the season runs." : "Add a farm first."} open={!cycles.length}>
      <ActionForm action={createCycleAction} success="Cycle created"><div className="form-grid"><div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Production unit (optional)</label><select name="unitId" defaultValue=""><option value="">No specific unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div><div className="field"><label>Cycle name</label><input name="name" required placeholder="2027 Wet Season Maize"/></div><div className="field"><label>Type</label><select name="type" defaultValue="CROP">{cycleTypes.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div><div className="field"><label>Commodity / species</label><input name="commodity" required placeholder="Maize"/></div><div className="field"><label>Variety / breed</label><input name="variety"/></div><div className="field"><label>Status</label><select name="status" defaultValue="PLANNED"><option value="PLANNED">Planned</option><option value="ACTIVE">Active</option></select></div><div className="field"><label>Budget</label><input name="budgetAmount" type="number" min="0" step="0.01"/></div><div className="field"><label>Start date</label><input name="startDate" type="date"/></div><div className="field"><label>Expected end</label><input name="expectedEndDate" type="date"/></div><div className="field"><label>Target quantity</label><input name="targetQuantity" type="number" min="0" step="0.001"/></div><div className="field"><label>Target unit</label><input name="targetUnit" placeholder="tonnes / kg / birds"/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Create cycle</button></div></ActionForm>
    </FormDetails>
    {cycles.length ? <div className="table-wrap"><table><thead><tr><th>Cycle</th><th>Farm / unit</th><th>Production</th><th>Dates</th><th className="text-right">Target</th><th className="text-right">Budget</th><th>Status</th></tr></thead><tbody>{cycles.map(c=><tr key={c.id}><td><b>{c.name}</b><div className="sub">{humanize(c.type)}</div></td><td>{c.farm.name}<div className="sub">{c.unit?.name || "Farm-wide"}</div></td><td>{c.commodity}{c.variety?<div className="sub">{c.variety}</div>:null}</td><td>{safeDate(c.startDate)}<div className="sub">to {safeDate(c.expectedEndDate)}</div></td><td className="text-right">{c.targetQuantity ? `${formatNumber(c.targetQuantity)} ${c.targetUnit||""}` : "—"}</td><td className="text-right">{c.budgetAmount ? formatMoney(c.budgetAmount,ctx.tenant.currency) : "—"}</td><td><span className={`status ${statusTone[c.status] || ""}`}>{humanize(c.status)}</span></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No production cycles" text="Start a cycle to tie farm work, inputs used and costs to a harvest or batch."/></div>}
  </>;
}
