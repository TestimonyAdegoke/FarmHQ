import Link from "next/link";
import { ArrowRight, CheckCircle2, CloudSun, Map, ShieldCheck, Warehouse } from "lucide-react";
import { Brand } from "@/components/brand";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  return <main className="landing">
    <nav className="landing-nav"><Brand/><div style={{display:"flex",gap:10}}>{session ? <Link className="button" href="/dashboard">Open workspace <ArrowRight size={16}/></Link> : <><Link className="button secondary" href="/login">Sign in</Link><Link className="button" href="/setup">Get started <ArrowRight size={16}/></Link></>}</div></nav>
    <section className="hero">
      <div><div className="eyebrow">Farm operating system</div><h1>Run the whole farm. Know the whole business.</h1><p>FarmHQ brings fields, livestock, work, inventory, equipment and farm economics into one multi-tenant operating platform built for modern agricultural teams.</p>
        <div className="hero-actions"><Link className="button" href={session ? "/dashboard" : "/setup"}>{session ? "Go to dashboard" : "Create your FarmHQ"}<ArrowRight size={17}/></Link><a className="button secondary" href="#platform">Explore platform</a></div>
        <div style={{display:"flex",gap:18,marginTop:28,flexWrap:"wrap",fontSize:13,color:"var(--muted)"}}><span><CheckCircle2 size={15} style={{verticalAlign:"middle",marginRight:5,color:"var(--brand)"}}/>Multi-tenant</span><span><ShieldCheck size={15} style={{verticalAlign:"middle",marginRight:5,color:"var(--brand)"}}/>Role-based access</span><span><CloudSun size={15} style={{verticalAlign:"middle",marginRight:5,color:"var(--brand)"}}/>Farm-ready workflows</span></div>
      </div>
      <div className="hero-card"><div className="mini-top"><div><small style={{color:"#9fbaa9"}}>GREEN ACRES LTD</small><h2 style={{margin:"6px 0 0"}}>Operations overview</h2></div><Map size={24} color="#c7e66b"/></div><div className="mini-grid"><div className="mini-card"><small>Cultivated area</small><strong>1,283 ha</strong><div className="spark">{[40,72,54,85,67,92,74,96].map((h,i)=><span key={i} style={{height:`${h}%`}}/>)}</div></div><div className="mini-card"><small>Active cycles</small><strong>24</strong><p style={{color:"#a8bfaf",fontSize:13,lineHeight:1.5}}>Across crop, livestock and aquaculture operations.</p></div><div className="mini-card"><Warehouse size={20} color="#c7e66b"/><strong>92%</strong><small>Stock availability</small></div><div className="mini-card"><small>Work completion</small><strong>81%</strong><div className="progress" style={{background:"rgba(255,255,255,.1)"}}><span style={{width:"81%",background:"#c7e66b"}}/></div></div></div></div>
    </section>
    <section id="platform" style={{maxWidth:1180,margin:"0 auto",padding:"30px 24px 90px"}}><div className="grid-3">{[["Production","Plan and track crop, livestock, poultry and aquaculture cycles."],["Operations","Coordinate tasks, teams, inventory, warehouses and equipment."],["Economics","Connect every input and expense to the farm activity that consumed it."]].map(([t,d])=><div className="card" key={t}><h3>{t}</h3><p className="muted" style={{lineHeight:1.65}}>{d}</p></div>)}</div></section>
  </main>;
}
