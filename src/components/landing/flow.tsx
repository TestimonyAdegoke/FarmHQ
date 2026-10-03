"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, CloudOff, PackageMinus, Receipt, Smartphone, TrendingUp } from "lucide-react";

const steps = [
  { icon: Smartphone, title: "Work is recorded where it happens", text: "A supervisor logs 150 kg of urea on Block C from the Field App, even with no signal. It syncs when the phone reconnects." },
  { icon: PackageMinus, title: "Stock moves by itself", text: "The main store drops by three bags. When NPK falls below its reorder level, the overview flags it before anyone runs out." },
  { icon: Receipt, title: "The cost lands on the right cycle", text: "₦184,500 of fertiliser is booked to Maize · Cycle 24B, not to a general expenses pile." },
  { icon: TrendingUp, title: "Margins stop being a guess", text: "Harvest sales are set against every input, hour and naira the cycle used, so you see profit per crop, flock and pond." },
];

/** Field-to-ledger story: auto-advances while visible, any step can be picked, and the illustration follows. */
export function Flow() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [picked, setPicked] = useState(false);
  const running = visible && !picked;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setStep(s => (s + 1) % steps.length), 4800);
    return () => window.clearTimeout(id);
  }, [running, step]);

  return <div className="flow" ref={ref}>
    <ol className="flow-steps">
      {steps.map((s, i) => <li key={s.title} className={i === step ? "on" : i < step ? "done" : ""}>
        <button onClick={() => { setStep(i); setPicked(true); }} aria-current={i === step ? "step" : undefined}>
          <span className="flow-num"><s.icon size={16} /></span>
          <span><strong>{s.title}</strong><small><span>{s.text}</span></small></span>
          {i === step && running ? <span className="flow-bar" aria-hidden /> : null}
        </button>
      </li>)}
    </ol>

    <div className="flow-stage" aria-hidden>
      <div className={`fs fs-0 ${step === 0 ? "on" : ""}`}>
        <div className="fs-phone">
          <div className="fs-phone-top"><span>Field App</span><span className="pill warn"><CloudOff size={11} /> Offline</span></div>
          <div className="fs-field"><small>Activity</small><b>Top-dress, Block C</b></div>
          <div className="fs-field"><small>Input</small><b>Urea · 150 kg</b></div>
          <div className="fs-save">Saved on this device</div>
        </div>
      </div>
      <div className={`fs fs-1 ${step === 1 ? "on" : ""}`}>
        <div className="fs-card">
          <div className="fs-row"><span>NPK 15-15-15 (50 kg)</span><b className="fs-strike">7</b><b>4 bags</b></div>
          <div className="fs-meter"><span style={{ width: "28%" }} /><i style={{ left: "62%" }} /></div>
          <div className="fs-note"><ArrowDownRight size={14} /> Below reorder level (10). Added to “Needs attention”.</div>
        </div>
      </div>
      <div className={`fs fs-2 ${step === 2 ? "on" : ""}`}>
        <div className="fs-ledger">
          <div className="fs-ledger-head"><span>Maize · Cycle 24B</span><small>Costs</small></div>
          {[["Seed", "₦96,000"], ["Land preparation", "₦140,000"], ["Casual labour", "₦72,500"]].map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
          <div className="fs-new"><span>Fertiliser · urea</span><b>₦184,500</b></div>
        </div>
      </div>
      <div className={`fs fs-3 ${step === 3 ? "on" : ""}`}>
        <div className="fs-margin">
          {[["Maize 24B", 62, "31%"], ["Layers 2026-A", 78, "38%"], ["Catfish pond A", 44, "19%"]].map(([k, w, m]) => <div key={k as string}>
            <span>{k}</span><div className="fs-bar"><span style={{ width: `${w}%` }} /></div><b>{m}</b>
          </div>)}
          <small>Gross margin by production cycle</small>
        </div>
      </div>
    </div>
  </div>;
}
