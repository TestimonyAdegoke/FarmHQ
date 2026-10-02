import { redirect } from "next/navigation";
import { acceptInvitationAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { db } from "@/lib/db";

export const metadata = { title: "Join FarmHQ" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const invite = await db.invitation.findUnique({ where: { token }, include: { tenant: true } });
  if (!invite) redirect("/login");
  const expired = invite.status !== "PENDING" || invite.expiresAt <= new Date();
  const existingUser = await db.user.findUnique({ where: { email: invite.email }, select: { id: true } });

  return <main className="auth-shell"><section className="auth-card"><Brand />
    <div style={{marginTop:28}}><div className="eyebrow">Organization invitation</div><h1 style={{margin:"8px 0 10px"}}>Join {invite.tenant.name}</h1><p className="muted" style={{lineHeight:1.65}}>You have been invited as <b>{invite.role.replaceAll("_"," ").toLowerCase()}</b> using {invite.email}.</p></div>
    {expired?<div className="alert" style={{marginTop:24}}><div><b>This invitation is no longer active.</b><small>Ask an organization administrator to create a new invitation.</small></div></div>:<form action={acceptInvitationAction} style={{marginTop:24}}>
      <input type="hidden" name="token" value={token}/>
      {!existingUser?<div className="field"><label>Your name</label><input name="name" required autoComplete="name"/></div>:null}
      <div className="field" style={{marginTop:14}}><label>{existingUser?"Your FarmHQ password":"Create a password"}</label><input name="password" required minLength={10} type="password" autoComplete={existingUser?"current-password":"new-password"}/></div>
      {query.error==="password"?<p className="error-text">That password does not match the existing FarmHQ account for this email.</p>:null}
      {query.error==="expired"?<p className="error-text">This invitation has expired or was already used.</p>:null}
      <button className="button" style={{width:"100%",marginTop:20}}>{existingUser?"Join organization":"Create account & join"}</button>
    </form>}
  </section></main>;
}
