import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { getSession } from "@/lib/auth";

const today = [
  { task: "Top-dress maize", where: "Block C · 150 kg urea", status: "Done", tone: "done" },
  { task: "Vaccinate layers", where: "House 2 · 2,400 birds", status: "In progress", tone: "active" },
  { task: "Restock layer mash", where: "Main store", status: "Below reorder", tone: "warn" },
];

const pillars = [
  ["Production", "Plan and track crop, livestock, poultry and aquaculture cycles from start to harvest."],
  ["Operations", "Assign work, run stores and keep equipment serviced, with every team on the same page."],
  ["Economics", "Every input and hour lands on the cycle that used it, so margins are never a guess."],
];

export default async function Home() {
  const session = await getSession();
  const primary = session ? { href: "/dashboard", label: "Go to dashboard" } : { href: "/setup", label: "Create your FarmHQ" };

  return <main className="landing">
    <nav className="landing-nav">
      <Brand/>
      <div className="landing-nav-links">
        {session ? <Link className="button small" href="/dashboard">Open workspace <ArrowRight size={15}/></Link> : <>
          <Link className="text-link" href="/login">Sign in</Link>
          <Link className="button small" href="/setup">Get started</Link>
        </>}
      </div>
    </nav>

    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">Farm operating system</div>
        <h1>Run the whole farm. Know the whole business.</h1>
        <p>Fields, livestock, stores, people and money in one place, so every decision starts from the same numbers.</p>
        <div className="hero-actions">
          <Link className="button" href={primary.href}>{primary.label} <ArrowRight size={17}/></Link>
          <a className="text-link" href="#platform">See what&apos;s inside</a>
        </div>
      </div>

      <figure className="hero-panel" aria-label="Example of a day in FarmHQ">
        <header><span>Green Acres</span><small>Today</small></header>
        <ul>
          {today.map(row => <li key={row.task}>
            <div><strong>{row.task}</strong><small>{row.where}</small></div>
            <span className={`pill ${row.tone}`}>{row.status}</span>
          </li>)}
        </ul>
        <footer>
          <small>Cost booked to Maize · Cycle 24B</small>
          <strong>₦184,500</strong>
        </footer>
      </figure>
    </section>

    <section id="platform" className="pillars">
      {pillars.map(([title, text], i) => <div key={title}>
        <span>{String(i + 1).padStart(2, "0")}</span>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>)}
    </section>

    <section className="cta">
      <div>
        <h2>Bring the whole farm into one place.</h2>
        <p>Start with one farm and one field. Add the rest of the operation as your team settles in.</p>
      </div>
      <div className="cta-actions">
        <Link className="button accent" href={primary.href}>{primary.label} <ArrowRight size={17}/></Link>
        {!session && <Link className="text-link light" href="/login">Sign in</Link>}
      </div>
    </section>

    <footer className="landing-footer">
      <div className="landing-footer-top">
        <div><Brand/><p>The operating system for modern farm businesses.</p></div>
        <nav>
          <a href="#platform">Platform</a>
          {session ? <Link href="/dashboard">Dashboard</Link> : <><Link href="/login">Sign in</Link><Link href="/setup">Get started</Link></>}
        </nav>
      </div>
      <small>© {new Date().getFullYear()} FarmHQ</small>
    </footer>
  </main>;
}
