import { redirect } from "next/navigation";
import { acceptInvitationAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { db } from "@/lib/db";
import { humanize } from "@/lib/utils";

export const metadata = { title: "Join FarmHQ" };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const invite = await db.invitation.findUnique({ where: { token }, include: { tenant: true } });
  if (!invite) redirect("/login");
  const expired = invite.status !== "PENDING" || invite.expiresAt <= new Date();
  const existingUser = await db.user.findUnique({ where: { email: invite.email }, select: { id: true } });

  return <main className="auth-shell"><section className="auth-card"><Brand />
    <h1>Join {invite.tenant.name}</h1>
    <p>You have been invited as <b>{humanize(invite.role).toLowerCase()}</b> using {invite.email}.</p>
    {expired ? <div className="error-banner" role="alert"><b>This invitation is no longer active.</b> Ask an organization administrator to send a new one.</div> : <form action={acceptInvitationAction}>
      <input type="hidden" name="token" value={token}/>
      {!existingUser ? <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" required autoComplete="name"/></div> : null}
      <div className="field"><label htmlFor="password">{existingUser ? "Your FarmHQ password" : "Create a password"}</label><input id="password" name="password" required minLength={10} type="password" autoComplete={existingUser ? "current-password" : "new-password"}/></div>
      {query.error === "password" ? <p className="error-text">That password does not match the existing FarmHQ account for this email.</p> : null}
      {query.error === "expired" ? <p className="error-text">This invitation has expired or was already used.</p> : null}
      <button className="button">{existingUser ? "Join organization" : "Create account & join"}</button>
    </form>}
  </section></main>;
}
