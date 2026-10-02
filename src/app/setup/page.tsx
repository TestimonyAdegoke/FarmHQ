import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { bootstrapAction } from "@/app/actions";
import { db } from "@/lib/db";

export default async function Setup() {
  if ((await db.user.count()) > 0) redirect("/login");
  return <main className="auth-shell"><section className="auth-card"><Brand/><div className="eyebrow" style={{marginTop:25}}>First-time setup</div><h1>Create your FarmHQ.</h1><p>This creates the first tenant and owner account. After this, new users join through tenant invitations.</p><form action={bootstrapAction}><div className="form-grid two" style={{marginTop:22}}><div className="field"><label>Your name</label><input name="name" required minLength={2}/></div><div className="field"><label>Organization</label><input name="organization" required minLength={2}/></div><div className="field span-2"><label>Email</label><input name="email" type="email" required/></div><div className="field span-2"><label>Password</label><input name="password" type="password" minLength={10} required/><small className="muted">At least 10 characters.</small></div></div><button className="button" style={{width:"100%",marginTop:20}}>Create workspace</button></form></section></main>;
}
