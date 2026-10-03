import { KeyRound, MessageCircle, Plus, Shield, Users } from "lucide-react";
import { createInvitationAction } from "@/app/actions";
import { changeMemberRoleAction, createPasswordResetLinkAction, removeMemberAction, revokeInvitationAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/origin";
import { tenantContext } from "@/lib/tenant";
import { humanize, safeDate, whatsappLink } from "@/lib/utils";

export const metadata = { title: "Team & Access" };

const roles: [string, string][] = [
  ["OWNER", "Owner: everything, including billing and owners"],
  ["ORG_ADMIN", "Administrator: everything except owner changes"],
  ["FARM_MANAGER", "Farm manager: runs operations, staff, stock and sales"],
  ["OPERATIONS_MANAGER", "Operations manager: same as farm manager"],
  ["AGRONOMIST", "Agronomist: crops, scouting and field work"],
  ["LIVESTOCK_MANAGER", "Livestock manager: animals, poultry and fish"],
  ["ACCOUNTANT", "Accountant: expenses, payments, payroll payment"],
  ["PROCUREMENT_OFFICER", "Purchasing officer: suppliers, orders, receiving"],
  ["STOREKEEPER", "Storekeeper: stock in and out"],
  ["SALES_OFFICER", "Sales officer: customers, sales and invoices"],
  ["FIELD_SUPERVISOR", "Supervisor: tasks and daily attendance"],
  ["FIELD_WORKER", "Field worker: own tasks and field app"],
  ["AUDITOR", "Auditor: read-only access to all records"],
  ["VIEWER", "Viewer: read-only overview"],
];

export default async function TeamPage() {
  const ctx = await tenantContext("team.manage");
  const [members, invites, origin] = await Promise.all([
    db.membership.findMany({ where: { tenantId: ctx.tenantId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.invitation.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 50 }),
    appOrigin(),
  ]);
  const isOwner = ctx.role === "OWNER";
  const assignable = roles.filter(([r]) => r !== "OWNER" || isOwner);
  const pending = invites.filter(i => i.status === "PENDING" && i.expiresAt > new Date());

  return <>
    <PageHeader eyebrow="People" title="Team & access" description="Who can sign in to FarmHQ and what each person can see and do. Workers who don't use the app are managed under Workers & Attendance." />
    <section className="metrics">
      <MetricCard label="Members" value={String(members.length)} hint="People with app access" icon={<Users size={16} />} />
      <MetricCard label="Administrators" value={String(members.filter(m => ["OWNER", "ORG_ADMIN"].includes(m.role)).length)} hint="Owners + admins" icon={<Shield size={16} />} />
      <MetricCard label="Pending invites" value={String(pending.length)} hint="Valid for 7 days" icon={<Plus size={16} />} />
      <MetricCard label="Roles in use" value={String(new Set(members.map(m => m.role)).size)} hint="Of 14 available" icon={<KeyRound size={16} />} />
    </section>

    <FormDetails title="Invite someone" hint="Creates a link to share by WhatsApp, SMS or email. They set their own password." open={members.length < 2}>
      <ActionForm action={createInvitationAction} success="Invitation created. Share the link from the list below.">
        <div className="form-grid two">
          <div className="field"><label>Email</label><input name="email" type="email" required /></div>
          <div className="field"><label>Role</label><select name="role" defaultValue="FIELD_SUPERVISOR">{assignable.filter(([r]) => r !== "OWNER").map(([r, l]) => <option key={r} value={r}>{l}</option>)}</select></div>
        </div>
        <div className="form-actions"><button className="button">Create invitation</button></div>
      </ActionForm>
    </FormDetails>

    <div className="card"><div className="card-head"><div><h2>Members</h2><div className="card-sub">People who can sign in, and what they can do</div></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Joined</th><th>Manage</th></tr></thead><tbody>{members.map(m => {
      const self = m.userId === ctx.userId;
      const locked = m.role === "OWNER" && !isOwner;
      return <tr key={m.id}>
        <td><b>{m.user.name}</b>{self ? <span className="status neutral" style={{ marginLeft: 6 }}>You</span> : null}<div className="sub">{m.user.email}{m.user.phone ? ` · ${m.user.phone}` : ""}</div></td>
        <td>{locked || self ? <span className="status neutral">{humanize(m.role)}</span> : <ActionForm action={changeMemberRoleAction} reset={false}><input type="hidden" name="id" value={m.id} /><div className="inline-actions"><select name="role" defaultValue={m.role} aria-label={`Role for ${m.user.name}`}>{assignable.map(([r]) => <option key={r} value={r}>{humanize(r)}</option>)}</select><button className="button secondary small">Save</button></div></ActionForm>}</td>
        <td>{safeDate(m.createdAt)}</td>
        <td>{!locked && !self ? <div className="inline-actions">
          <ActionForm action={createPasswordResetLinkAction}><input type="hidden" name="id" value={m.id} /><button className="button secondary small">Reset password link</button></ActionForm>
          <ActionForm action={removeMemberAction} confirm={`Remove ${m.user.name}'s access to ${ctx.tenant.name}?`}><input type="hidden" name="id" value={m.id} /><button className="button secondary small">Remove</button></ActionForm>
        </div> : null}</td>
      </tr>;
    })}</tbody></table></div></div>

    {invites.length ? <div className="card"><div className="card-head"><h2>Invitations</h2></div><div className="table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th>Status</th><th>Share</th></tr></thead><tbody>{invites.map(i => {
      const live = i.status === "PENDING" && i.expiresAt > new Date();
      const link = `${origin}/invite/${i.token}`;
      return <tr key={i.id}>
        <td>{i.email}</td><td>{humanize(i.role)}</td><td className="nowrap">{safeDate(i.expiresAt)}</td>
        <td><span className={`status ${live ? "info" : i.status === "ACCEPTED" ? "" : "neutral"}`}>{live ? "Pending" : i.status === "PENDING" ? "Expired" : humanize(i.status)}</span></td>
        <td>{live ? <div className="inline-actions"><input readOnly value={link} aria-label="Invitation link" style={{ width: 230, fontSize: 12 }} /><a className="button secondary small" href={whatsappLink(null, `You've been invited to join ${ctx.tenant.name} on FarmHQ. Open this link to set up your account: ${link}`)} target="_blank" rel="noreferrer"><MessageCircle size={14} /> WhatsApp</a><ActionForm action={revokeInvitationAction}><input type="hidden" name="id" value={i.id} /><button className="button secondary small">Revoke</button></ActionForm></div> : "—"}</td>
      </tr>;
    })}</tbody></table></div></div> : <div className="card"><EmptyState title="No invitations" text="Invite managers, supervisors and your accountant to work in FarmHQ with you." /></div>}
  </>;
}
