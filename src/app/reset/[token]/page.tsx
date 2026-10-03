import { createHash } from "crypto";
import Link from "next/link";
import { resetPasswordAction } from "@/app/people-actions";
import { ActionForm } from "@/components/action-form";
import { Brand } from "@/components/brand";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") }, include: { user: { select: { name: true } } } });
  const valid = record && !record.usedAt && record.expiresAt > new Date();
  return <main className="auth-shell"><section className="auth-card"><Brand />
    {valid ? <>
      <h1>Set a new password</h1><p>Hello {record.user.name.split(" ")[0]}, choose a new password for FarmHQ.</p>
      <ActionForm action={resetPasswordAction} reset={false}>
        <input type="hidden" name="token" value={token} />
        <div className="field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" /></div>
        <div className="field"><label htmlFor="confirm">Repeat password</label><input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" /></div>
        <button className="button">Save password</button>
      </ActionForm>
    </> : <>
      <h1>Link expired</h1><p>This password reset link has expired or was already used. Ask your farm administrator to send a new one.</p>
      <p className="auth-foot"><Link href="/login">Back to sign in</Link></p>
    </>}
  </section></main>;
}
