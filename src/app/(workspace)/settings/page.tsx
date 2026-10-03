import { History } from "lucide-react";
import { updateTenantAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata={title:"Settings"};

export default async function SettingsPage(){
 const ctx=await tenantContext(undefined,{organisationWide:true});
 const audits=await db.auditLog.findMany({where:{tenantId:ctx.tenantId},include:{user:true},orderBy:{createdAt:"desc"},take:30});
 return <><PageHeader eyebrow="Administration" title="Organization settings" description="Your organization's basic details and a history of recent changes made in FarmHQ."/>
  <div className="grid-main-side">
   <ActionForm className="form-card" action={updateTenantAction} reset={false} success="Settings saved"><div className="card-head"><div><h2>Organization</h2><div className="card-sub">These settings apply only to this organization.</div></div></div><div className="field"><label>Organization name</label><input name="name" required defaultValue={ctx.tenant.name}/></div><div className="form-grid two" style={{marginTop:14}}><div className="field"><label>Currency</label><input name="currency" required maxLength={3} defaultValue={ctx.tenant.currency}/></div><div className="field"><label>Timezone</label><input name="timezone" required defaultValue={ctx.tenant.timezone}/></div></div><div className="form-actions"><button className="button">Save settings</button></div></ActionForm>
   <div className="card"><div className="card-head"><div><h2>Access & data</h2><div className="card-sub">Each organization&apos;s records are kept separate.</div></div></div><dl className="kv"><dt>Your role</dt><dd>{humanize(ctx.role)}</dd><dt>Organization</dt><dd>{ctx.tenant.name}</dd></dl><p className="sub" style={{lineHeight:1.6,marginTop:12}}>Every record belongs to one organization. FarmHQ checks your membership before every change, and only shows data from the organization you are working in.</p></div>
  </div>
  <div className="card"><div className="card-head"><div><h2>Recent activity</h2><div className="card-sub">Last 30 changes</div></div></div>{audits.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>User</th><th>Action</th><th>Entity</th><th>Record</th></tr></thead><tbody>{audits.map(a=><tr key={a.id}><td>{safeDate(a.createdAt)}</td><td>{a.user?.name||"System"}</td><td><b>{a.action}</b></td><td>{a.entityType}</td><td className="muted">{a.entityId||"—"}</td></tr>)}</tbody></table></div>:<EmptyState title="No activity yet" text="Changes made by your team will be listed here." icon={<History size={20}/>}/>}</div>
 </>;
}
