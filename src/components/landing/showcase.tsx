"use client";

import { useState } from "react";
import qrcode from "qrcode-generator";
import { Check, ClipboardList, MessageCircle, QrCode, ScanLine, UserCheck, Zap } from "lucide-react";

/** A real, scannable code for the demo lot. It encodes plain text only, so scanning it leads nowhere. */
const demoQr = (() => {
  const qr = qrcode(0, "M");
  qr.addData("FarmHQ demo lot MAIZE-26-014 · Maize grain, Grade A");
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { n, d };
})();

const tabs = [
  { key: "sale", icon: Zap, label: "Quick sale", title: "Sell at the farm gate in under a minute", text: "Pick the customer and the produce, take cash, transfer or mobile money, and the invoice, receipt, stock issue and income are all recorded in one step. Send the receipt on WhatsApp." },
  { key: "attendance", icon: UserCheck, label: "Attendance", title: "Take the register, then pay from it", text: "Tick who came, add hours or piece-work, and a manager approves. Approved days flow straight into the next pay run, with advances recovered automatically." },
  { key: "count", icon: ClipboardList, label: "Stock count", title: "Count the store without stopping it", text: "Open a count, enter what is on the shelf, and FarmHQ shows the variance line by line. Nothing changes in stock until the count is closed and posted." },
  { key: "trace", icon: QrCode, label: "Trace a lot", title: "A QR code on every crate", text: "Each harvest lot gets a private link that buyers can scan to see the farm, cycle, harvest date and every handover, without seeing anything else." },
];

/** “See it at work”: one tab per everyday job, each with a faithful miniature of the real screen. */
export function Showcase() {
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  return <div className="sc">
    <div className="sc-tabs" role="tablist" aria-label="Product tour">
      {tabs.map((t, i) => <button key={t.key} role="tab" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => setActive(i)}>
        <t.icon size={16} aria-hidden />{t.label}
      </button>)}
    </div>
    <div className="sc-body">
      <div className="sc-copy" key={`c-${tab.key}`}>
        <h3>{tab.title}</h3>
        <p>{tab.text}</p>
      </div>
      <div className="sc-screen" key={`s-${tab.key}`} aria-hidden>
        <div className="sc-chrome"><i /><i /><i /><span>{tab.label}</span></div>
        {tab.key === "sale" ? <div className="sc-ui">
          <div className="sc-field"><small>Customer</small><b>Golden Crust Bakery</b></div>
          <div className="sc-lines">
            <div><span>Eggs, crate of 30</span><span>20 × ₦4,800</span><b>₦96,000</b></div>
            <div><span>Live catfish</span><span>12 kg × ₦2,800</span><b>₦33,600</b></div>
          </div>
          <div className="sc-pay">{["Cash", "Transfer", "Mobile money"].map((m, i) => <span key={m} className={i === 1 ? "on" : ""}>{m}</span>)}</div>
          <div className="sc-total"><span>Total</span><b>₦129,600</b></div>
          <div className="sc-actions"><span className="sc-btn">Complete sale</span><span className="sc-btn ghost"><MessageCircle size={13} /> Send receipt</span></div>
        </div> : null}
        {tab.key === "attendance" ? <div className="sc-ui">
          <div className="sc-field"><small>Sunrise Farm · Monday</small><b>9 of 12 present</b></div>
          <div className="sc-list">{[["Bisi Adeyemi", "8 h", true], ["Chinedu Eze", "8 h", true], ["Fatima Musa", "120 crates", true], ["Tunde Bakare", "—", false], ["Ngozi Okeke", "6 h", true]].map(([n, h, p]) => <div key={n as string} className={p ? "" : "off"}>
            <span className="sc-check">{p ? <Check size={12} /> : null}</span><span>{n}</span><b>{h}</b>
          </div>)}</div>
          <div className="sc-actions"><span className="sc-btn">Submit for approval</span></div>
        </div> : null}
        {tab.key === "count" ? <div className="sc-ui">
          <div className="sc-field"><small>Main store · count #12</small><b>Open · 3 of 5 lines</b></div>
          <div className="sc-table">
            <div className="h"><span>Product</span><span>System</span><span>Counted</span><span>Variance</span></div>
            {[["Layer mash", "66", "64", "−2"], ["NPK 15-15-15", "4", "4", "0"], ["Urea", "9", "10", "+1"]].map(r => <div key={r[0]}><span>{r[0]}</span><span>{r[1]}</span><span>{r[2]}</span><b className={r[3].startsWith("−") ? "neg" : r[3] === "0" ? "" : "pos"}>{r[3]}</b></div>)}
          </div>
          <div className="sc-actions"><span className="sc-btn ghost"><ScanLine size={13} /> Add line</span><span className="sc-btn">Close &amp; post</span></div>
        </div> : null}
        {tab.key === "trace" ? <div className="sc-ui sc-trace">
          <svg className="sc-qr" viewBox={`-2 -2 ${demoQr.n + 4} ${demoQr.n + 4}`} shapeRendering="crispEdges"><path d={demoQr.d} /></svg>
          <div>
            <div className="sc-field"><small>Lot MAIZE-26-014</small><b>Maize grain · Grade A</b></div>
            <ol className="sc-steps">{["Harvested · Block C", "Dried & bagged", "Moved to main store", "Sold · Golden Crust"].map(s => <li key={s}>{s}</li>)}</ol>
          </div>
        </div> : null}
      </div>
    </div>
  </div>;
}
