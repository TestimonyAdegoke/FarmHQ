import { KeyRound, UserRound } from "lucide-react";
import { changePasswordAction, updateProfileAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { tenantContext } from "@/lib/tenant";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const ctx = await tenantContext();
  return <>
    <PageHeader eyebrow="My account" title={ctx.user.name} description={`${ctx.user.email} · ${ctx.role.replaceAll("_", " ").toLowerCase()} at ${ctx.tenant.name}`} />
    <div className="grid-2">
      <ActionForm action={updateProfileAction} className="form-card" reset={false} style={{ margin: 0 }}>
        <div className="card-head"><div><h3>Profile</h3><div className="muted small-text" style={{ marginTop: 4 }}>Add your phone number to sign in with it instead of your email.</div></div><UserRound size={19} /></div>
        <div className="form-grid two">
          <div className="field span-2"><label>Full name</label><input name="name" required defaultValue={ctx.user.name} /></div>
          <div className="field span-2"><label>Phone number</label><input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={ctx.user.phone || ""} placeholder="+234 803 000 0000" /></div>
        </div>
        <div className="form-actions"><button className="button">Save profile</button></div>
      </ActionForm>
      <ActionForm action={changePasswordAction} className="form-card" style={{ margin: 0 }}>
        <div className="card-head"><h3>Change password</h3><KeyRound size={19} /></div>
        <div className="form-grid two">
          <div className="field span-2"><label>Current password</label><input name="current" type="password" required autoComplete="current-password" /></div>
          <div className="field"><label>New password</label><input name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
          <div className="field"><label>Repeat new password</label><input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></div>
        </div>
        <div className="form-actions"><button className="button">Change password</button></div>
      </ActionForm>
    </div>
  </>;
}
