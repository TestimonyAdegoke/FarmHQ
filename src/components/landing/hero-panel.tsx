"use client";

import { useEffect, useState } from "react";
import { Bird, Fish, Sprout, Warehouse, Wallet, ClipboardCheck } from "lucide-react";
import { CountUp } from "@/components/landing/count-up";

type Row = { icon: typeof Bird; title: string; meta: string; pill: string; tone: "done" | "active" | "warn" };
type View = { key: string; label: string; rows: Row[]; footLabel: string; footValue: number; footPrefix?: string; footSuffix?: string };

const views: View[] = [
  { key: "today", label: "Today", footLabel: "Cost booked to Maize · Cycle 24B", footValue: 184500, footPrefix: "₦", rows: [
    { icon: Sprout, title: "Top-dress maize", meta: "Block C · 150 kg urea", pill: "Done", tone: "done" },
    { icon: Bird, title: "Vaccinate layers", meta: "House 2 · 2,400 birds", pill: "In progress", tone: "active" },
    { icon: Fish, title: "Sample catfish weights", meta: "Pond A · 40 fish", pill: "Due 4 pm", tone: "warn" },
  ] },
  { key: "stock", label: "Stock", footLabel: "Stock on hand, all stores", footValue: 3563000, footPrefix: "₦", rows: [
    { icon: Warehouse, title: "Layer mash, 25 kg", meta: "Main store · 66 bags", pill: "OK", tone: "done" },
    { icon: Warehouse, title: "NPK 15-15-15, 50 kg", meta: "Main store · 4 bags", pill: "Reorder", tone: "warn" },
    { icon: Warehouse, title: "Eggs, crate of 30", meta: "Egg room · 160 crates", pill: "Ready to sell", tone: "active" },
  ] },
  { key: "money", label: "Money", footLabel: "Gross margin this season", footValue: 31, footSuffix: "%", rows: [
    { icon: Wallet, title: "Golden Crust Bakery", meta: "INV-00041 · 20 crates", pill: "Paid", tone: "done" },
    { icon: ClipboardCheck, title: "Weekly attendance", meta: "12 workers · 5 days", pill: "To approve", tone: "warn" },
    { icon: Wallet, title: "Agro-Input Supplies", meta: "PO-00017 · fertiliser", pill: "Part paid", tone: "active" },
  ] },
];

/** The hero's "live" farm: a small, self-rotating preview of the three things owners check every morning. */
export function HeroPanel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive(i => (i + 1) % views.length), 5200);
    return () => window.clearInterval(id);
  }, [paused]);

  const view = views[active];
  return <figure className="hp" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <header className="hp-head">
      <div><span className="hp-dot" aria-hidden />Green Acres<small>Live preview</small></div>
      <div className="hp-tabs" role="tablist" aria-label="Preview">
        {views.map((v, i) => <button key={v.key} role="tab" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => setActive(i)}>
          {v.label}{i === active && !paused ? <span className="hp-timer" aria-hidden /> : null}
        </button>)}
      </div>
    </header>
    <ul className="hp-rows" key={view.key}>
      {view.rows.map((row, i) => <li key={row.title} style={{ ["--i" as string]: i }}>
        <span className="hp-icon"><row.icon size={16} /></span>
        <div><strong>{row.title}</strong><small>{row.meta}</small></div>
        <span className={`pill ${row.tone}`}>{row.pill}</span>
      </li>)}
    </ul>
    <footer className="hp-foot">
      <small>{view.footLabel}</small>
      <strong><CountUp key={view.key} value={view.footValue} prefix={view.footPrefix} suffix={view.footSuffix} /></strong>
    </footer>
  </figure>;
}
