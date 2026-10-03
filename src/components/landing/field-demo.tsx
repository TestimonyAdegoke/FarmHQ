"use client";

import { useEffect, useRef, useState } from "react";
import { Bird, Bug, Check, CloudOff, Plus, UserCheck, Wifi } from "lucide-react";

const samples = [
  { icon: Bird, text: "House 2 · 3 deaths, 61 crates" },
  { icon: Bug, text: "Fall armyworm · Block C · high" },
  { icon: UserCheck, text: "Attendance · 9 present" },
  { icon: Bird, text: "Feed · 4 bags layer mash" },
];

type Entry = { id: number; sample: number; state: "queued" | "syncing" | "synced" };

/** Interactive offline demo: record while “offline”, then reconnect and watch the queue drain. */
export function FieldDemo() {
  const [online, setOnline] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([{ id: 1, sample: 0, state: "queued" }, { id: 2, sample: 1, state: "queued" }]);
  const next = useRef(3);
  const nextSample = useRef(2);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

  function drain(list: Entry[]) {
    list.filter(e => e.state === "queued").forEach((e, i) => {
      timers.current.push(window.setTimeout(() => setEntries(all => all.map(x => x.id === e.id ? { ...x, state: "syncing" } : x)), 250 + i * 450));
      timers.current.push(window.setTimeout(() => setEntries(all => all.map(x => x.id === e.id ? { ...x, state: "synced" } : x)), 750 + i * 450));
    });
  }

  function toggle() {
    const nowOnline = !online;
    setOnline(nowOnline);
    if (nowOnline) drain(entries);
  }

  function record() {
    const entry: Entry = { id: next.current++, sample: nextSample.current++ % samples.length, state: "queued" };
    const list = [entry, ...entries].slice(0, 5);
    setEntries(list);
    if (online) drain([entry]);
  }

  const waiting = entries.filter(e => e.state !== "synced").length;
  return <div className="fd">
    <div className="fd-controls">
      <button className={`fd-switch ${online ? "on" : ""}`} onClick={toggle} role="switch" aria-checked={online}>
        <span className="fd-knob" aria-hidden />{online ? <><Wifi size={15} /> Signal on</> : <><CloudOff size={15} /> No signal</>}
      </button>
      <button className="fd-add" onClick={record}><Plus size={15} /> Record an entry</button>
    </div>
    <div className="fd-phone">
      <div className="fd-notch" aria-hidden />
      <div className="fd-top">
        <b>Field App</b>
        <span className={`pill ${online ? "done" : "warn"}`}>{online ? "Online" : "Offline"}</span>
      </div>
      <div className="fd-status" aria-live="polite">{waiting ? `${waiting} waiting to sync` : "Everything is synced"}</div>
      <ul className="fd-list">
        {entries.map(e => { const S = samples[e.sample]; return <li key={e.id} className={e.state}>
          <span className="fd-icon"><S.icon size={14} /></span>
          <span>{S.text}</span>
          <span className="fd-state">{e.state === "synced" ? <Check size={14} /> : e.state === "syncing" ? <span className="fd-spin" /> : <span className="fd-dot" />}</span>
        </li>; })}
      </ul>
    </div>
  </div>;
}
