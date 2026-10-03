"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CloudOff, LocateFixed, RefreshCw, Smartphone, Trash2, Wifi } from "lucide-react";

type FarmOption = { id:string; name:string };
type UnitOption = { id:string; name:string; farmId:string };
type CycleOption = { id:string; name:string; farmId:string };
type TaskOption = { id:string; title:string; status:string; farmName:string };
type ActivityOption = { id:string; title:string; status:string; farmName:string };

type QueueItem = {
  clientMutationId: string;
  deviceFingerprint: string;
  type: "SCOUTING_OBSERVATION" | "TASK_STATUS" | "CROP_ACTIVITY_STATUS";
  payload: Record<string, unknown>;
  queuedAt: string;
  error?: string;
};

const QUEUE_KEY = "farmhq.field.queue.v1";
const DEVICE_KEY = "farmhq.field.device.v1";

function readQueue(): QueueItem[] {
  try {
    const value = localStorage.getItem(QUEUE_KEY);
    return value ? JSON.parse(value) as QueueItem[] : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function getDeviceFingerprint() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

export function FieldAppClient({ farms, units, cycles, tasks, activities }: {
  farms: FarmOption[];
  units: UnitOption[];
  cycles: CycleOption[];
  tasks: TaskOption[];
  activities: ActivityOption[];
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [fingerprint, setFingerprint] = useState("");
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  useEffect(() => {
    setQueue(readQueue());
    setFingerprint(getDeviceFingerprint());
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const replaceQueue = useCallback((next: QueueItem[]) => {
    saveQueue(next);
    setQueue(next);
  }, []);

  const enqueue = useCallback((type: QueueItem["type"], payload: Record<string, unknown>) => {
    const item: QueueItem = {
      clientMutationId: crypto.randomUUID(),
      deviceFingerprint: fingerprint || getDeviceFingerprint(),
      type,
      payload,
      queuedAt: new Date().toISOString(),
    };
    const next = [...readQueue(), item];
    replaceQueue(next);
    setMessage("Saved to the field queue.");
  }, [fingerprint, replaceQueue]);

  const syncNow = useCallback(async () => {
    const pending = readQueue();
    if (!pending.length || !navigator.onLine) return;
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/sync/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-farmhq-platform": navigator.userAgent.slice(0,80),
          "x-farmhq-app-version": "web-pwa-0.4",
        },
        body: JSON.stringify({
          mutations: pending.map(({ queuedAt, error, ...item }) => item),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Sync failed");
      const status = new Map<string,{status:string;error?:string}>(result.results.map((entry:{clientMutationId:string;status:string;error?:string})=>[entry.clientMutationId,entry]));
      const remaining = pending.flatMap(item => {
        const server = status.get(item.clientMutationId);
        if (server?.status === "PROCESSED") return [];
        return [{ ...item, error: server?.error || item.error }];
      });
      replaceQueue(remaining);
      setMessage(remaining.length ? String(remaining.length) + " item(s) still need attention." : "Field queue synced successfully.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [replaceQueue]);

  useEffect(() => {
    if (!online || !queue.length) return;
    const timer = window.setTimeout(() => { void syncNow(); }, 600);
    return () => window.clearTimeout(timer);
  }, [online, queue.length, syncNow]);

  function captureLocation() {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        setMessage("GPS location captured.");
      },
      () => setMessage("Could not capture GPS location."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  function scoutingSubmit(formData: FormData) {
    const farmId = String(formData.get("farmId") || "");
    const unitId = String(formData.get("unitId") || "");
    const cycleId = String(formData.get("cycleId") || "");
    const affectedRaw = String(formData.get("affectedAreaHa") || "");
    enqueue("SCOUTING_OBSERVATION", {
      farmId,
      ...(unitId ? { unitId } : {}),
      ...(cycleId ? { cycleId } : {}),
      observedAt: new Date().toISOString(),
      category: String(formData.get("category") || ""),
      issue: String(formData.get("issue") || ""),
      severity: String(formData.get("severity") || "MEDIUM"),
      ...(affectedRaw ? { affectedAreaHa: Number(affectedRaw) } : {}),
      ...(latitude ? { latitude: Number(latitude) } : {}),
      ...(longitude ? { longitude: Number(longitude) } : {}),
      recommendation: String(formData.get("recommendation") || ""),
    });
  }

  function taskSubmit(formData: FormData) {
    enqueue("TASK_STATUS", {
      taskId: String(formData.get("taskId") || ""),
      status: String(formData.get("status") || "IN_PROGRESS"),
    });
  }

  function activitySubmit(formData: FormData) {
    enqueue("CROP_ACTIVITY_STATUS", {
      activityId: String(formData.get("activityId") || ""),
      status: String(formData.get("status") || "IN_PROGRESS"),
    });
  }

  return <div style={{display:"grid",gap:20}}>
    <section className="metrics">
      <div className="metric-card"><div className="metric-top"><span>Connectivity</span>{online?<Wifi size={18}/>:<CloudOff size={18}/>}</div><strong>{online?"Online":"Offline"}</strong><small>{online?"Automatic sync is available":"New work stays on this device"}</small></div>
      <div className="metric-card"><div className="metric-top"><span>Queued changes</span><RefreshCw size={18}/></div><strong>{queue.length}</strong><small>Idempotent mutations awaiting server acknowledgement</small></div>
      <div className="metric-card"><div className="metric-top"><span>Field device</span><Smartphone size={18}/></div><strong>{fingerprint?fingerprint.slice(0,8):"—"}</strong><small>Stable browser installation fingerprint</small></div>
      <div className="metric-card"><div className="metric-top"><span>GPS</span><LocateFixed size={18}/></div><strong>{latitude&&longitude?"Captured":"Optional"}</strong><small>{latitude&&longitude?latitude+", "+longitude:"Attach position to scouting observations"}</small></div>
    </section>

    <div className="card">
      <div className="card-head"><div><h2>Sync control</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Entries are written to local storage first, then replayed safely when connectivity returns.</div></div><button className="button" type="button" onClick={()=>void syncNow()} disabled={!online||!queue.length||syncing}><RefreshCw size={16}/>{syncing?" Syncing…":" Sync now"}</button></div>
      {message?<div className="alert"><CheckCircle2 size={18}/><div><b>Field app</b><small>{message}</small></div></div>:null}
      {queue.length?<div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>Queued</th><th>Change</th><th>Status</th><th></th></tr></thead><tbody>{queue.map(item=><tr key={item.clientMutationId}><td>{new Date(item.queuedAt).toLocaleString()}</td><td>{item.type.replaceAll("_"," ")}</td><td>{item.error?<span className="status warn">FAILED</span>:<span className="status neutral">PENDING</span>}<div className="muted" style={{fontSize:11}}>{item.error||""}</div></td><td><button type="button" className="button secondary small" onClick={()=>replaceQueue(queue.filter(q=>q.clientMutationId!==item.clientMutationId))}><Trash2 size={14}/> Discard</button></td></tr>)}</tbody></table></div>:null}
    </div>

    <div className="grid-2">
      <form className="form-card" action={scoutingSubmit} style={{margin:0}}>
        <div className="card-head"><div><h3>Offline scouting</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Record field observations even when there is no connection.</div></div><button type="button" className="button secondary small" onClick={captureLocation}><LocateFixed size={15}/> GPS</button></div>
        <div className="form-grid two">
          <div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="field"><label>Field / unit</label><select name="unitId" defaultValue=""><option value="">Farm-wide</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div className="field"><label>Cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Severity</label><select name="severity" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></div>
          <div className="field"><label>Category</label><input name="category" required placeholder="Pest / Disease / Nutrition"/></div>
          <div className="field"><label>Affected area (ha)</label><input name="affectedAreaHa" type="number" min="0" step="0.001"/></div>
          <div className="field span-2"><label>Observation</label><input name="issue" required placeholder="Describe what you found"/></div>
          <div className="field span-2"><label>Recommendation</label><input name="recommendation"/></div>
        </div>
        <div className="form-actions"><button className="button">Queue observation</button></div>
      </form>

      <div style={{display:"grid",gap:20}}>
        <form className="form-card" action={taskSubmit} style={{margin:0}}>
          <div className="card-head"><h3>Update task offline</h3></div>
          <div className="form-grid two"><div className="field"><label>Task</label><select name="taskId" required defaultValue=""><option value="" disabled>Select task</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.title} · {t.farmName}</option>)}</select></div><div className="field"><label>Status</label><select name="status" defaultValue="IN_PROGRESS"><option>TODO</option><option>IN_PROGRESS</option><option>BLOCKED</option><option>COMPLETED</option></select></div></div>
          <div className="form-actions"><button className="button" disabled={!tasks.length}>Queue task update</button></div>
        </form>
        <form className="form-card" action={activitySubmit} style={{margin:0}}>
          <div className="card-head"><h3>Update crop activity offline</h3></div>
          <div className="form-grid two"><div className="field"><label>Activity</label><select name="activityId" required defaultValue=""><option value="" disabled>Select activity</option>{activities.map(a=><option key={a.id} value={a.id}>{a.title} · {a.farmName}</option>)}</select></div><div className="field"><label>Status</label><select name="status" defaultValue="IN_PROGRESS"><option>PLANNED</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>CANCELLED</option></select></div></div>
          <div className="form-actions"><button className="button" disabled={!activities.length}>Queue activity update</button></div>
        </form>
      </div>
    </div>
  </div>;
}
