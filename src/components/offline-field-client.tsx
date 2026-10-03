"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CloudOff, LocateFixed, RefreshCw, Save, Wifi } from "lucide-react";

type Farm = { id:string; name:string };
type Unit = { id:string; name:string; farmId:string };
type Cycle = { id:string; name:string; farmId:string };
type Task = { id:string; title:string; farmId:string|null; status:string };
type Activity = { id:string; title:string; farmId:string; status:string };

type QueueMutation = {
  clientMutationId:string;
  deviceFingerprint:string;
  type:"SCOUTING_OBSERVATION"|"TASK_STATUS"|"CROP_ACTIVITY_STATUS";
  payload:Record<string,unknown>;
};

const DB_NAME = "farmhq-offline";
const STORE = "mutations";

function openDb() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:"clientMutationId"});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllQueued() {
  const db = await openDb();
  return new Promise<QueueMutation[]>((resolve,reject) => {
    const tx = db.transaction(STORE,"readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as QueueMutation[]);
    request.onerror = () => reject(request.error);
  });
}

async function saveQueued(mutation:QueueMutation) {
  const db = await openDb();
  return new Promise<void>((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function removeQueued(clientMutationId:string) {
  const db = await openDb();
  return new Promise<void>((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(clientMutationId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function fingerprint() {
  const key = "farmhq-device-fingerprint";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key,value);
  }
  return value;
}

export function OfflineFieldClient({ farms, units, cycles, tasks, activities }:{
  farms:Farm[]; units:Unit[]; cycles:Cycle[]; tasks:Task[]; activities:Activity[];
}) {
  const [farmId,setFarmId] = useState(farms[0]?.id||"");
  const [unitId,setUnitId] = useState("");
  const [queueCount,setQueueCount] = useState(0);
  const [message,setMessage] = useState("Ready for field capture.");
  const [location,setLocation] = useState<{latitude:number;longitude:number}|null>(null);
  const [online,setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);

  const availableUnits = useMemo(()=>units.filter(unit=>unit.farmId===farmId),[units,farmId]);
  const availableCycles = useMemo(()=>cycles.filter(cycle=>cycle.farmId===farmId),[cycles,farmId]);

  const refreshQueue = useCallback(async () => {
    const queued = await getAllQueued();
    setQueueCount(queued.length);
    return queued;
  },[]);

  const syncQueued = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      setMessage("Offline. Changes are safely queued on this device.");
      return;
    }
    setOnline(true);
    const queued = await getAllQueued();
    setQueueCount(queued.length);
    if (!queued.length) {
      setMessage("Everything is synced.");
      return;
    }
    setMessage("Syncing "+queued.length+" queued change"+(queued.length===1?"":"s")+"…");
    try {
      const response = await fetch("/api/sync/batch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mutations:queued})});
      if (!response.ok) {
        setMessage(response.status===401?"Session expired. Queued data is still safe on this device.":"Sync unavailable. Queued data will retry later.");
        return;
      }
      const data = await response.json() as {results:Array<{clientMutationId:string;status:string;error?:string}>};
      for (const result of data.results) {
        if (result.status==="PROCESSED") await removeQueued(result.clientMutationId);
      }
      const remaining = await getAllQueued();
      setQueueCount(remaining.length);
      const failed = data.results.filter(result=>result.status==="FAILED");
      setMessage(failed.length ? String(failed.length)+" item(s) need attention; successful items synced." : "Field data synced successfully.");
    } catch {
      setMessage("Connection dropped during sync. The local queue remains intact.");
    }
  },[]);

  useEffect(()=>{
    void refreshQueue();
    if (navigator.onLine) void syncQueued();
    const handleOnline = () => { setOnline(true); void syncQueued(); };
    const handleOffline = () => { setOnline(false); setMessage("Offline. New work will be queued locally."); };
    window.addEventListener("online",handleOnline);
    window.addEventListener("offline",handleOffline);
    return () => {
      window.removeEventListener("online",handleOnline);
      window.removeEventListener("offline",handleOffline);
    };
  },[refreshQueue,syncQueued]);

  async function queueMutation(type:QueueMutation["type"],payload:Record<string,unknown>) {
    const mutation:QueueMutation = {
      clientMutationId:crypto.randomUUID(),
      deviceFingerprint:fingerprint(),
      type,
      payload,
    };
    await saveQueued(mutation);
    await refreshQueue();
    setMessage("Saved on this device"+(navigator.onLine?". Syncing now…":". It will sync when you reconnect."));
    if (navigator.onLine) await syncQueued();
  }

  async function submitObservation(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!farmId) return;
    await queueMutation("SCOUTING_OBSERVATION",{
      farmId,
      unitId:unitId||undefined,
      cycleId:String(form.get("cycleId")||"")||undefined,
      observedAt:new Date().toISOString(),
      category:String(form.get("category")||""),
      issue:String(form.get("issue")||""),
      severity:String(form.get("severity")||"MEDIUM"),
      affectedAreaHa:form.get("affectedAreaHa")?Number(form.get("affectedAreaHa")):undefined,
      latitude:location?.latitude,
      longitude:location?.longitude,
      recommendation:String(form.get("recommendation")||"")||undefined,
    });
    event.currentTarget.reset();
    setUnitId("");
  }

  function captureGps() {
    if (!navigator.geolocation) {
      setMessage("This device does not expose browser GPS.");
      return;
    }
    setMessage("Acquiring GPS…");
    navigator.geolocation.getCurrentPosition(async position=>{
      const next = {latitude:position.coords.latitude,longitude:position.coords.longitude};
      setLocation(next);
      setMessage("GPS captured. Resolving field boundary…");
      if (!navigator.onLine) {
        setMessage("GPS captured. Field matching will occur when online; coordinates are stored with the observation.");
        return;
      }
      try {
        const response = await fetch("/api/spatial/locate?latitude="+encodeURIComponent(String(next.latitude))+"&longitude="+encodeURIComponent(String(next.longitude)));
        const data = await response.json() as {matches?:Array<{id:string;name:string;farmId:string;farmName:string;source:string}>};
        const match = data.matches?.[0];
        if (match) {
          setFarmId(match.farmId);
          setUnitId(match.id);
          setMessage("Located in "+match.farmName+" · "+match.name+" ("+match.source+").");
        } else {
          setMessage("GPS captured, but no mapped production unit covers this point.");
        }
      } catch {
        setMessage("GPS captured. Spatial lookup is temporarily unavailable.");
      }
    },()=>setMessage("Unable to acquire GPS. You can still select the field manually."),{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  }

  return <div style={{display:"grid",gap:20}}>
    <div className="card"><div className="card-head"><div><h2>Sync status</h2><div className="muted" style={{fontSize:13,marginTop:4}}>{message}</div></div>{online?<Wifi size={20} color="var(--brand)"/>:<CloudOff size={20}/>}</div><div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><span className={"status "+(queueCount?"warn":"")}>{queueCount} queued</span><span className="status neutral">{online?"Online":"Offline"}</span><button className="button secondary small" type="button" onClick={()=>void syncQueued()}><RefreshCw size={15}/> Sync now</button></div></div>

    <form className="form-card" onSubmit={submitObservation}>
      <div className="card-head"><div><h3>Offline scouting</h3><div className="muted" style={{fontSize:13,marginTop:4}}>The form saves to IndexedDB first. Network delivery is secondary.</div></div><Save size={19}/></div>
      <div className="form-grid two">
        <div className="field"><label>Farm</label><select value={farmId} onChange={event=>{setFarmId(event.target.value);setUnitId("");}} required>{farms.map(farm=><option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></div>
        <div className="field"><label>Field / unit</label><select value={unitId} onChange={event=>setUnitId(event.target.value)}><option value="">Farm-wide / unknown</option>{availableUnits.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></div>
        <div className="field"><label>Cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{availableCycles.map(cycle=><option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select></div>
        <div className="field"><label>Severity</label><select name="severity" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></div>
        <div className="field"><label>Category</label><input name="category" required placeholder="Pest / disease / irrigation"/></div>
        <div className="field"><label>Affected area (ha)</label><input name="affectedAreaHa" type="number" min="0" step="0.001"/></div>
        <div className="field span-2"><label>Observation</label><input name="issue" required placeholder="Describe what you observed"/></div>
        <div className="field span-2"><label>Recommendation</label><input name="recommendation"/></div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginTop:14}}><button className="button secondary" type="button" onClick={captureGps}><LocateFixed size={16}/> {location?"Refresh GPS":"Capture GPS"}</button><button className="button"><Save size={16}/> Save observation</button></div>
      {location?<div className="muted" style={{fontSize:12,marginTop:10}}>GPS: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</div>:null}
    </form>

    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Open tasks</h2></div>{tasks.length?<div style={{display:"grid",gap:8}}>{tasks.map(task=><div className="alert" key={task.id}><div style={{flex:1}}><b>{task.title}</b><small>{task.status.replaceAll("_"," ")}</small></div><button className="button secondary small" type="button" onClick={()=>void queueMutation("TASK_STATUS",{taskId:task.id,status:"DONE"})}><CheckCircle2 size={15}/> Complete</button></div>)}</div>:<div className="empty"><strong>No open tasks</strong></div>}</div>
      <div className="card"><div className="card-head"><h2>Field activities</h2></div>{activities.length?<div style={{display:"grid",gap:8}}>{activities.map(activity=><div className="alert" key={activity.id}><div style={{flex:1}}><b>{activity.title}</b><small>{activity.status.replaceAll("_"," ")}</small></div><button className="button secondary small" type="button" onClick={()=>void queueMutation("CROP_ACTIVITY_STATUS",{activityId:activity.id,status:"COMPLETED"})}><CheckCircle2 size={15}/> Complete</button></div>)}</div>:<div className="empty"><strong>No open activities</strong></div>}</div>
    </div>
  </div>;
}
