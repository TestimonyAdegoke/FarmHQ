import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { loginAction } from "@/app/actions";
import { getSession } from "@/lib/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const params = await searchParams;
  return <main className="auth-shell"><section className="auth-card"><Brand/><h1>Welcome back.</h1><p>Sign in to continue managing your farm business.</p>{params.reset && <div className="success-banner">Password updated. Sign in with your new password.</div>}{params.error && <div className="error-banner">Email/phone or password is incorrect.</div>}<form action={loginAction}><div className="field" style={{marginTop:22}}><label>Email or phone number</label><input required name="email" type="text" autoComplete="username" inputMode="email" placeholder="you@farm.com or 0803 000 0000"/></div><div className="field" style={{marginTop:14}}><label>Password</label><input required name="password" type="password" autoComplete="current-password"/></div><button className="button" style={{width:"100%",marginTop:20}}>Sign in</button></form><p style={{fontSize:13,marginTop:20}}>Forgot your password? Ask your farm administrator for a reset link from Team &amp; Access.</p><p style={{fontSize:13,marginTop:8}}>First installation? <Link href="/setup" style={{color:"var(--brand)",fontWeight:700}}>Create the owner account</Link>.</p></section></main>;
}
