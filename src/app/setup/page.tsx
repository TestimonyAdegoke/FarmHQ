import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { bootstrapAction } from "@/app/actions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up" };

export default async function Setup() {
  if ((await db.user.count()) > 0) redirect("/login");
  return <main className="auth-shell"><section className="auth-card">
    <Link href="/" aria-label="FarmHQ home"><Brand/></Link>
    <h1>Create your FarmHQ</h1>
    <p>This sets up your organization and its owner account. Everyone else joins by invitation.</p>
    <form action={bootstrapAction}>
      <div className="form-grid two">
        <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" required minLength={2} autoComplete="name"/></div>
        <div className="field"><label htmlFor="organization">Organization</label><input id="organization" name="organization" required minLength={2} autoComplete="organization"/></div>
        <div className="field span-2"><label htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email"/></div>
        <div className="field span-2"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={10} required autoComplete="new-password"/><small className="muted">At least 10 characters.</small></div>
      </div>
      <button className="button">Create workspace</button>
    </form>
  </section></main>;
}
