import { changePasswordAction, updateProfileAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { tenantContext } from "@/lib/tenant";
import { humanize } from "@/lib/utils";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const ctx = await tenantContext();
  return <>
    <PageHeader eyebrow="My account" title={ctx.user.name} description={`${ctx.user.email} · ${humanize(ctx.role)} at ${ctx.tenant.name}`} />
    <div className="grid-main-side">
      <div className="stack">
        <ActionForm action={updateProfileAction} className="form-card" reset={false} success="Profile saved">
          <div className="card-head"><div><h2>Profile</h2><div className="card-sub">Add your phone number to sign in with it instead of your email.</div></div></div>
          <div className="form-grid two">
            <div className="field span-2"><label>Full name</label><input name="name" required defaultValue={ctx.user.name} /></div>
            <div className="field span-2"><label>Phone number</label><input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={ctx.user.phone || ""} placeholder="+234 803 000 0000" /></div>
          </div>
          <div className="form-actions"><button className="button">Save profile</button></div>
        </ActionForm>
        <ActionForm action={changePasswordAction} className="form-card" success="Password changed">
          <div className="card-head"><div><h2>Change password</h2><div className="card-sub">Use at least 10 characters.</div></div></div>
          <div className="form-grid two">
            <div className="field span-2"><label>Current password</label><input name="current" type="password" required autoComplete="current-password" /></div>
            <div className="field"><label>New password</label><input name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
            <div className="field"><label>Repeat new password</label><input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></div>
          </div>
          <div className="form-actions"><button className="button">Change password</button></div>
        </ActionForm>
      </div>
      <div className="card">
        <div className="card-head"><h2>Account</h2></div>
        <dl className="kv">
          <dt>Email</dt><dd>{ctx.user.email}</dd>
          <dt>Phone</dt><dd>{ctx.user.phone || "—"}</dd>
          <dt>Organization</dt><dd>{ctx.tenant.name}</dd>
          <dt>Role</dt><dd>{humanize(ctx.role)}</dd>
        </dl>
      </div>
    </div>
  </>;
}
