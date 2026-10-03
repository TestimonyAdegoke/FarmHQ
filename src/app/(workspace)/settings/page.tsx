import { Building2, ShieldCheck } from "lucide-react";
import { updateTenantAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata={title:"Settings"};

export default async function SettingsPage(){
 const ctx=await tenantContext(undefined,{organisationWide:true});
 const audits=await db.auditLog.findMany({where:{tenantId:ctx.tenantId},include:{user:true},orderBy:{createdAt:"desc"},take:30});
 return <><PageHeader eyebrow="Administration" title="Organization settings" description="Core tenant configuration and an auditable history of administrative and operational writes."/>
  <div className="grid-2"><ActionForm className="form-card" action={updateTenantAction} style={{margin:0}}><div className="card-head"><div><h3>Organization</h3><div className="muted" style={{fontSize:13,marginTop:4}}>These settings apply only to this tenant.</div></div><Building2 size={20}/></div><div className="field"><label>Organization name</label><input name="name" required defaultValue={ctx.tenant.name}/></div><div className="form-grid two" style={{marginTop:14}}><div className="field"><label>Currency</label><input name="currency" required maxLength={3} defaultValue={ctx.tenant.currency}/></div><div className="field"><label>Timezone</label><input name="timezone" required defaultValue={ctx.tenant.timezone}/></div></div><div className="form-actions"><button className="button">Save settings</button></div></ActionForm>
   <div className="card"><div className="card-head"><div><h3>Tenant isolation</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Defense-in-depth design</div></div><ShieldCheck size={20} color="var(--brand)"/></div><p className="muted" style={{lineHeight:1.75}}>Every operational model carries a tenant identifier. Server actions validate membership before writes and query through the active tenant. A PostgreSQL RLS hardening script is included for deployments that set tenant context at the database transaction layer.</p><div className="alert"><ShieldCheck size={18} color="var(--brand)"/><div><b>Active role: {ctx.role.replaceAll("_"," ")}</b><small>Access is evaluated per tenant membership.</small></div></div></div></div>
  <div className="card" style={{marginTop:20}}><div className="card-head"><h2>Recent audit activity</h2></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>User</th><th>Action</th><th>Entity</th><th>Record</th></tr></thead><tbody>{audits.map(a=><tr key={a.id}><td>{safeDate(a.createdAt)}</td><td>{a.user?.name||"System"}</td><td><b>{a.action}</b></td><td>{a.entityType}</td><td className="muted">{a.entityId||"—"}</td></tr>)}</tbody></table></div></div>
 </>;
}
