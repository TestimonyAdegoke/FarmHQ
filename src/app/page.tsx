import Link from "next/link";
import { ArrowRight, BarChart3, Bird, CloudOff, CloudSun, FileSpreadsheet, Fish, HardHat, Landmark, Leaf, Lock, MapPinned, MessageCircle, PackageSearch, QrCode, RadioTower, ReceiptText, ShieldCheck, Smartphone, Sprout, Tractor, Users, Wallet } from "lucide-react";
import { Brand } from "@/components/brand";
import { Flow } from "@/components/landing/flow";
import { FieldDemo } from "@/components/landing/field-demo";
import { HeroPanel } from "@/components/landing/hero-panel";
import { Reveal } from "@/components/landing/reveal";
import { Showcase } from "@/components/landing/showcase";
import { getSession } from "@/lib/auth";
import "./landing.css";

const enterprises = ["Layers", "Broilers", "Catfish", "Tilapia", "Maize", "Cassava", "Yam", "Rice", "Cocoa", "Cashew", "Oil palm", "Plantain", "Tomatoes", "Pepper", "Soybean", "Goats", "Cattle", "Piggery"];

const realities = [
  { icon: CloudOff, problem: "The network comes and goes.", answer: "The Field App saves every entry on the phone and sends it when signal returns. Nothing is lost and nothing is typed twice." },
  { icon: Wallet, problem: "Buyers pay in cash, transfer and mobile money.", answer: "Record each payment the way it came in, and see exactly what is in the cash box, the bank and the mobile-money wallet." },
  { icon: HardHat, problem: "Casual labour, day rates and advances.", answer: "Take attendance by the day or by the crate, pay weekly or monthly, and recover salary advances in the next pay run automatically." },
  { icon: MessageCircle, problem: "Your customers live on WhatsApp.", answer: "Send receipts, invoices and account statements straight to a customer’s WhatsApp, with payment reminders for anyone who owes." },
  { icon: MapPinned, problem: "Sites are far apart, and you can’t be everywhere.", answer: "Run several farms from one account, see them all on one overview, and limit each manager to the farms they run." },
  { icon: Landmark, problem: "Banks and cooperatives want records.", answer: "See profit and loss month by month, and download sales, expense, stock and payroll records to share when you apply for a loan, grant or offtake deal." },
];

const modules = [
  { icon: Sprout, title: "Production", text: "Crop seasons, flocks, herds and ponds run as production cycles, each with its own plan, inputs and harvest.", points: ["Crop operations & scouting", "Poultry daily records", "Animal health & weights", "Pond sampling & water quality"] },
  { icon: Smartphone, title: "Field App", text: "Made for the field, not the office. Supervisors record work on a phone, with or without network.", points: ["Works offline", "GPS-tagged observations", "Attendance on site"] },
  { icon: PackageSearch, title: "Stock & buying", text: "Every bag of feed and crate of eggs tracked by store, with purchase orders that receive straight into stock.", points: ["Reorder alerts", "Transfers & stock counts", "Suppliers & what you owe"] },
  { icon: ReceiptText, title: "Sell & get paid", text: "Farm-gate sales, orders and invoices, with receipts and statements you can share on WhatsApp.", points: ["Cash, transfer, mobile money", "Overdue reminders", "Customer statements"] },
  { icon: HardHat, title: "People & payroll", text: "Permanent staff and casual workers, daily attendance, piece-work and pay runs in one place.", points: ["Approve attendance", "Advances recovered", "Printable payslips"] },
  { icon: Landmark, title: "Money", text: "Cash, bank and mobile-money balances, with every expense tied to the farm and cycle that spent it.", points: ["Approve before paying", "Profit per cycle", "Monthly P&L"] },
  { icon: QrCode, title: "Traceability", text: "Lot codes and QR links from harvest to buyer, so processors and exporters can see where produce came from.", points: ["Public trace page", "Split & repack lots", "Quarantine & release"] },
  { icon: ShieldCheck, title: "Compliance", text: "Audits, certification visits, spray logs and documents, with corrective actions that actually get done.", points: ["Chemical application log", "Re-entry & harvest intervals", "Document expiry"] },
];

const extras = [
  { icon: MapPinned, title: "Farm maps", text: "Draw field and pond boundaries; the area is worked out for you." },
  { icon: CloudSun, title: "Weather", text: "Seven-day forecast and spraying advisories for each farm." },
  { icon: RadioTower, title: "Sensors", text: "Soil moisture, temperature and water readings from your devices." },
  { icon: Tractor, title: "Equipment", text: "Hours, fuel and service reminders for tractors, pumps and generators." },
  { icon: BarChart3, title: "Analytics", text: "Yields, mortality, feed conversion and cost per unit across cycles." },
  { icon: FileSpreadsheet, title: "Exports", text: "Spreadsheet downloads for your accountant, bank or cooperative." },
];

const roles = [
  { title: "Owner", sees: "Everything, across every farm: money, people, settings and who has access." },
  { title: "Farm manager", sees: "Production, stock, sales and approvals for the farms they run." },
  { title: "Field supervisor", sees: "Today’s tasks, attendance and field records on their phone." },
  { title: "Accountant", sees: "Expenses, invoices, cash and bank, payroll and reports." },
];

export default async function Home() {
  const session = await getSession();
  const primary = session ? { href: "/dashboard", label: "Go to dashboard" } : { href: "/setup", label: "Create your FarmHQ" };

  return <main className="landing">
    <Reveal />
    <nav className="landing-nav" aria-label="Main">
      <div className="landing-nav-inner">
        <Link href="/" aria-label="FarmHQ home"><Brand/></Link>
        <div className="landing-nav-anchors">
          <a href="#why">Why FarmHQ</a>
          <a href="#how">How it works</a>
          <a href="#product">Product</a>
          <a href="#field">Field App</a>
        </div>
        <div className="landing-nav-links">
          {session ? <Link className="button small" href="/dashboard">Open workspace <ArrowRight size={15}/></Link> : <>
            <Link className="text-link" href="/login">Sign in</Link>
            <Link className="button small" href="/setup">Get started</Link>
          </>}
        </div>
      </div>
    </nav>

    <section className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="hero-copy">
        <div className="hero-badge"><span aria-hidden />Built for West African farms · works offline</div>
        <h1>Run the whole farm. <em>Know the whole business.</em></h1>
        <p>FarmHQ keeps your pens, ponds, fields, store, workers and money in one place, so you always know what each flock, pond and crop is really making. Even when the network is down.</p>
        <div className="hero-actions">
          <Link className="button" href={primary.href}>{primary.label} <ArrowRight size={17}/></Link>
          <a className="text-link" href="#how">See how it works <ArrowRight size={15}/></a>
        </div>
        <ul className="hero-kinds" aria-label="Built for">
          <li><Bird size={14}/>Poultry</li><li><Fish size={14}/>Fish farming</li><li><Leaf size={14}/>Crops</li><li><Users size={14}/>Livestock</li>
        </ul>
        <p className="hero-note">Keep your books in naira, cedi or CFA franc.</p>
      </div>
      <div className="hero-visual">
        <HeroPanel />
        <div className="hero-float f1" aria-hidden><span className="hf-icon warn"><PackageSearch size={14}/></span><span><b>NPK is running low</b><small>4 bags left · reorder at 10</small></span></div>
        <div className="hero-float f2" aria-hidden><span className="hf-icon"><ReceiptText size={14}/></span><span><b>Mobile money received</b><small>₦96,000 · Golden Crust Bakery</small></span></div>
      </div>
    </section>

    <section className="marquee" aria-label="What FarmHQ farms run">
      <div className="marquee-track">{[...enterprises, ...enterprises].map((e, i) => <span key={i} aria-hidden={i >= enterprises.length}>{e}</span>)}</div>
    </section>

    <section id="why" className="section">
      <header className="section-head" data-reveal>
        <div className="eyebrow">Why FarmHQ</div>
        <h2>Built for how farming <em>really works here.</em></h2>
        <p>Most farm software is designed somewhere else, for someone else. FarmHQ was shaped around the day-to-day realities of running a farm business in Nigeria, Ghana and across West Africa.</p>
      </header>
      <div className="realities">
        {realities.map((r, i) => <article className="reality" key={r.problem} data-reveal style={{ ["--d" as string]: `${(i % 3) * 80}ms` }}>
          <span className="reality-icon"><r.icon size={18}/></span>
          <h3>{r.problem}</h3>
          <p>{r.answer}</p>
        </article>)}
      </div>
    </section>

    <section id="how" className="section">
      <header className="section-head" data-reveal>
        <div className="eyebrow">How it works</div>
        <h2>From field to ledger, <em>without the paperwork.</em></h2>
        <p>Most farms keep a notebook in the field, a ledger in the office and the real numbers in someone’s head. FarmHQ joins them up, so one entry does the work of four.</p>
      </header>
      <div data-reveal><Flow /></div>
    </section>

    <section id="product" className="section">
      <header className="section-head" data-reveal>
        <div className="eyebrow">The product</div>
        <h2>Everything the farm runs on, <em>in one place.</em></h2>
        <p>Eight connected modules share one set of farms, cycles, stores and people. Use what you need today and add the rest as you grow; it all reports into the same numbers.</p>
      </header>
      <div className="modules">
        {modules.map((m, i) => <article className="module" key={m.title} data-reveal style={{ ["--d" as string]: `${(i % 4) * 70}ms` }}>
          <span className="module-icon"><m.icon size={18}/></span>
          <h3>{m.title}</h3>
          <p>{m.text}</p>
          <ul>{m.points.map(p => <li key={p}>{p}</li>)}</ul>
        </article>)}
      </div>
      <div className="extras" data-reveal>
        {extras.map(x => <div key={x.title}><x.icon size={16} aria-hidden/><span><b>{x.title}</b> {x.text}</span></div>)}
      </div>
    </section>

    <section className="section">
      <header className="section-head" data-reveal>
        <div className="eyebrow">See it at work</div>
        <h2>Designed around the jobs <em>people actually do.</em></h2>
        <p>Selling at the farm gate, taking the morning register, counting the feed store, answering a buyer who wants to know where the produce came from.</p>
      </header>
      <div data-reveal><Showcase /></div>
    </section>

    <section id="field" className="band">
      <div className="band-inner">
        <div className="band-copy" data-reveal>
          <div className="eyebrow">Field App</div>
          <h2>Built for places with <em>one bar of signal.</em></h2>
          <p>Supervisors record mortality, feed, egg collection, pests and attendance on their own phones. Entries are kept safely on the device and sent the moment network returns.</p>
          <ul className="band-points">
            <li><b>Works offline.</b> Saved on the phone first, sent when there is network.</li>
            <li><b>Knows where it is.</b> Field reports carry GPS and are matched to the right plot.</li>
            <li><b>Any smartphone.</b> Opens in the browser and installs to the home screen. No app store needed.</li>
          </ul>
          <p className="band-try">Try it: switch the signal off, record a few entries, then switch it back on.</p>
        </div>
        <div data-reveal><FieldDemo /></div>
      </div>
    </section>

    <section id="access" className="section">
      <div className="split">
        <header className="section-head left" data-reveal>
          <div className="eyebrow">Access</div>
          <h2>Everyone sees what they need, <em>nothing they shouldn’t.</em></h2>
          <p>Roles decide what each person can do, and access can be limited to specific farms. The manager at your Ogun poultry site never sees the payroll for the Kaduna farm.</p>
          <div className="lockline"><Lock size={15} aria-hidden/> Each business’s data is kept separate, and every change is recorded in an audit log.</div>
        </header>
        <div className="roles">
          {roles.map((r, i) => <div className="role" key={r.title} data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
            <b>{r.title}</b><p>{r.sees}</p>
          </div>)}
        </div>
      </div>
    </section>

    <section className="cta" data-reveal>
      <div className="cta-art" aria-hidden><i /><i /><i /></div>
      <div className="cta-copy">
        <h2>Start with one pen, <em>one pond or one plot.</em></h2>
        <p>Add your first farm today and bring the rest of the operation in as your team settles in.</p>
      </div>
      <div className="cta-actions">
        <Link className="button accent" href={primary.href}>{primary.label} <ArrowRight size={17}/></Link>
        {!session && <Link className="text-link light" href="/login">Sign in</Link>}
      </div>
    </section>

    <footer className="landing-footer">
      <div className="landing-footer-top">
        <div className="landing-footer-brand"><Brand/><p>The farm operating system for West African agribusiness: production, stock, people and money, joined up.</p></div>
        <nav aria-label="Product">
          <b>Product</b>
          <a href="#why">Why FarmHQ</a>
          <a href="#how">How it works</a>
          <a href="#product">Modules</a>
          <a href="#field">Field App</a>
          <a href="#access">Access &amp; roles</a>
        </nav>
        <nav aria-label="Account">
          <b>Account</b>
          {session ? <Link href="/dashboard">Dashboard</Link> : <><Link href="/login">Sign in</Link><Link href="/setup">Get started</Link></>}
        </nav>
      </div>
      <div className="landing-footer-bottom"><small>© {new Date().getFullYear()} FarmHQ</small><small>Made for farms across West Africa</small></div>
    </footer>
  </main>;
}
