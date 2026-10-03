"use client";

import { useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { recordAttendanceAction } from "@/app/people-actions";

type Worker = { id: string; name: string; jobTitle: string | null; payBasis: string; farmId: string | null; pieceUnit: string | null };

/** Daily muster sheet: tick who came to work, adjust hours (half day = 4) or pieces picked, save once. */
export function AttendanceRegister({ workers, farms, cycles, today }: {
  workers: Worker[]; farms: { id: string; name: string }[]; cycles: { id: string; name: string; farmId: string }[]; today: string;
}) {
  const [farmId, setFarmId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const visible = useMemo(() => workers.filter(w => (!farmId || !w.farmId || w.farmId === farmId) && w.name.toLowerCase().includes(query.toLowerCase())), [workers, farmId, query]);
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <ActionForm action={recordAttendanceAction} className="form-card" reset={false}>
    <div className="card-head"><div><h3>Daily attendance</h3><div className="muted small-text" style={{ marginTop: 4 }}>Tick everyone who worked. Full day = 8 hours; enter 4 for a half day. Pay is calculated from each worker&apos;s rate.</div></div><CheckCheck size={19} /></div>
    <div className="form-grid">
      <div className="field"><label>Date</label><input name="workDate" type="date" defaultValue={today} required /></div>
      <div className="field"><label>Farm</label><select name="farmId" value={farmId} onChange={e => setFarmId(e.target.value)}><option value="">Each worker&apos;s own farm</option>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
      <div className="field"><label>Work done</label><input name="activity" required placeholder="Weeding / harvesting / feeding" list="attendance-activities" /></div>
      <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not allocated</option>{cycles.filter(c => !farmId || c.farmId === farmId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    </div>
    <datalist id="attendance-activities">{["Weeding", "Planting", "Harvesting", "Spraying", "Fertilizer application", "Feeding & watering", "Egg collection", "Pen cleaning", "Irrigation", "Land clearing", "Security", "Loading / offloading"].map(a => <option key={a} value={a} />)}</datalist>
    <div className="inline-actions" style={{ margin: "14px 0 10px" }}>
      <input placeholder="Find worker" value={query} onChange={e => setQuery(e.target.value)} style={{ maxWidth: 220 }} />
      <button type="button" className="button secondary small" onClick={() => setSelected(new Set(visible.map(w => w.id)))}>Tick all ({visible.length})</button>
      <button type="button" className="button secondary small" onClick={() => setSelected(new Set())}>Clear</button>
      <span className="status">{selected.size} present</span>
    </div>
    <div className="attendance-list">
      {visible.map(w => <label key={w.id} className="attendance-row">
        <input type="checkbox" name="present" value={w.id} checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
        <span><b>{w.name}</b><span className="sub" style={{ display: "block" }}>{w.jobTitle || ""} · {w.payBasis.replace("_", " ").toLowerCase()}</span></span>
        <input type="number" name={`hours_${w.id}`} aria-label={`Hours for ${w.name}`} defaultValue={8} min={0.5} max={24} step={0.5} inputMode="decimal" title="Hours" />
        {w.payBasis === "PIECE_RATE" ? <input className="pieces" type="number" name={`pieces_${w.id}`} aria-label={`${w.pieceUnit || "Pieces"} for ${w.name}`} placeholder={w.pieceUnit || "pieces"} min={0} step="any" inputMode="decimal" /> : <span />}
      </label>)}
      {!visible.length ? <p className="muted">No active workers match. Add workers below first.</p> : null}
    </div>
    <div className="form-actions"><button className="button" disabled={!selected.size}>Save attendance for {selected.size} worker{selected.size === 1 ? "" : "s"}</button></div>
  </ActionForm>;
}
