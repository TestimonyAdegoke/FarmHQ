import { Plus, Shield, Users } from "lucide-react";
import { createInvitationAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { safeDate } from "@/lib/utils";

export const metadata={title:"Team"};
const inviteRoles=["ORG_ADMIN","FARM_MANAGER","OPERATIONS_MANAGER","AGRONOMIST","LIVESTOCK_MANAGER","ACCOUNTANT","PROCUREMENT_OFFICER","STOREKEEPER","SALES_OFFICER","FIELD_SUPERVISOR","FIELD_WORKER","AUDITOR","VIEWER"];

export default async function TeamPage(){
 const ctx=await tenantContext();
 const [members,invites]=await Promise.all([
  db.membership.findMany({where:{tenantId:ctx.tenantId},include:{user:true},orderBy:{createdAt:"asc"}}),
  db.invitation.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:"desc"},take:50}),
 ]);
 return <><PageHeader eyebrow="Access control" title="Team" description="Membership and role assignments are tenant-specific, so one person can belong to multiple organizations with different access."/>
  <section className="metrics"><MetricCard label="Members" value={String(members.length)} hint="Active tenant memberships" icon={<Users size={18}/>}/><MetricCard label="Admins" value={String(members.filter(m=>["OWNER","ORG_ADMIN"].includes(m.role)).length)} hint="Organization-level access" icon={<Shield size={18}/>}/><MetricCard label="Pending invites" value={String(invites.filter(i=>i.status==="PENDING"&&i.expiresAt>new Date()).length)} hint="Invitation records" icon={<Plus size={18}/>}/><MetricCard label="Roles in use" value={String(new Set(members.map(m=>m.role)).size)} hint="Tenant role coverage" icon={<Shield size={18}/>}/></section>
  <form className="form-card" action={createInvitationAction}><div className="card-head"><div><h3>Invite team member</h3><div className="muted" style={{fontSize:13,marginTop:4}}>The invitation record is ready for email delivery integration; token access expires after seven days.</div></div><Plus size={20}/></div><div className="form-grid two"><div className="field"><label>Email</label><input name="email" type="email" required/></div><div className="field"><label>Role</label><select name="role" defaultValue="VIEWER">{inviteRoles.map(r=><option key={r}>{r}</option>)}</select></div></div><div className="form-actions"><button className="button">Create invitation</button></div></form>
  <div className="card" style={{marginBottom:20}}><div className="card-head"><h2>Members</h2></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Farm scope</th><th>Joined</th></tr></thead><tbody>{members.map(m=><tr key={m.id}><td><b>{m.user.name}</b></td><td>{m.user.email}</td><td><span className="status">{m.role.replaceAll("_"," ")}</span></td><td>{m.farmScope.length?`${m.farmScope.length} farms`:"All permitted farms"}</td><td>{safeDate(m.createdAt)}</td></tr>)}</tbody></table></div></div>
  {invites.length?<div className="card"><div className="card-head"><h2>Invitations</h2></div><div className="table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th>Created</th><th>Expires</th><th>Status</th><th>Invite path</th></tr></thead><tbody>{invites.map(i=><tr key={i.id}><td>{i.email}</td><td>{i.role.replaceAll("_"," ")}</td><td>{safeDate(i.createdAt)}</td><td>{safeDate(i.expiresAt)}</td><td><span className={`status ${i.status!=="ACCEPTED"?"neutral":""}`}>{i.status}</span></td><td><code style={{fontSize:11}}>/invite/{i.token}</code></td></tr>)}</tbody></table></div></div>:<div className="card"><EmptyState title="No invitations" text="Create an invitation when you are ready to onboard another user."/></div>}
 </>;
}
