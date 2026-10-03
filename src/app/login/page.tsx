import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { loginAction } from "@/app/actions";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const params = await searchParams;
  return <main className="auth-shell"><section className="auth-card">
    <Link href="/" aria-label="FarmHQ home"><Brand/></Link>
    <h1>Welcome back</h1>
    <p>Sign in to pick up where the farm left off.</p>
    {params.reset && <div className="success-banner">Password updated. Sign in with your new password.</div>}
    {params.error && <div className="error-banner" role="alert">Email/phone or password is incorrect.</div>}
    <form action={loginAction}>
      <div className="field"><label htmlFor="email">Email or phone number</label><input id="email" required name="email" type="text" autoComplete="username" inputMode="email" placeholder="you@farm.com or 0803 000 0000"/></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" required name="password" type="password" autoComplete="current-password"/></div>
      <button className="button">Sign in</button>
    </form>
    <p className="auth-foot">Forgot your password? Ask your farm administrator for a reset link from Team &amp; Access.<br/>First installation? <Link href="/setup">Create the owner account</Link></p>
  </section></main>;
}
