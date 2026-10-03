import { Activity, RadioTower, Satellite, ShieldCheck } from "lucide-react";
import { createIotDeviceAction, toggleIotDeviceAction } from "@/app/v04-actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "IoT & Sensors" };

export default async function IotPage() {
  const ctx = await tenantContext("farm.view");
  const [farms, units, devices, readings] = await Promise.all([
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.productionUnit.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.iotDevice.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" } }),
    db.sensorReading.findMany({ where: { tenantId: ctx.tenantId }, include: { device: true }, orderBy: { recordedAt: "desc" }, take: 150 }),
  ]);

  const farmNames = new Map(farms.map(f=>[f.id,f.name]));
  const unitNames = new Map(units.map(u=>[u.id,u.name]));
  const activeDevices = devices.filter(d=>d.active).length;
  const metricCount = new Set(readings.map(r=>r.metric)).size;

  return <><PageHeader eyebrow="Connected farm" title="IoT & sensors" description="Provision field devices and ingest weather, soil, water, meter, GPS and livestock telemetry through a device-authenticated API."/>
    <section className="metrics">
      <MetricCard label="Devices" value={String(devices.length)} hint={String(activeDevices)+" active"} icon={<RadioTower size={18}/>}/>
      <MetricCard label="Readings" value={String(readings.length)} hint="Latest 150 loaded" icon={<Activity size={18}/>}/>
      <MetricCard label="Metrics" value={String(metricCount)} hint="Distinct telemetry channels" icon={<Satellite size={18}/>}/>
      <MetricCard label="Authentication" value="Hashed" hint="Device secrets are never stored in plaintext" icon={<ShieldCheck size={18}/>}/>
    </section>

    <ActionForm className="form-card" action={createIotDeviceAction}>
      <div className="card-head"><div><h3>Provision device</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Choose and securely store a 16+ character secret on the device. FarmHQ stores only its SHA-256 hash.</div></div><RadioTower size={19}/></div>
      <div className="form-grid">
        <div className="field"><label>Name</label><input name="name" required placeholder="North Field Soil Probe"/></div>
        <div className="field"><label>Device code</label><input name="code" required placeholder="SOIL-N01"/></div>
        <div className="field"><label>Kind</label><select name="kind" defaultValue="SOIL_SENSOR">{["WEATHER_STATION","SOIL_SENSOR","WATER_QUALITY","METER","GPS_TRACKER","LIVESTOCK_SENSOR","OTHER"].map(v=><option key={v}>{v}</option>)}</select></div>
        <div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        <div className="field"><label>Unit</label><select name="unitId" defaultValue=""><option value="">Farm-wide</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field"><label>Device secret</label><input name="secret" required minLength={16} autoComplete="new-password" placeholder="16+ chars; store on device"/></div>
      </div>
      <div className="form-actions"><button className="button" disabled={!farms.length}>Provision device</button></div>
    </ActionForm>

    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Devices</h2></div>{devices.length?<div className="table-wrap"><table><thead><tr><th>Device</th><th>Location</th><th>Last seen</th><th>Status</th></tr></thead><tbody>{devices.map(d=><tr key={d.id}><td><b>{d.name}</b><div className="muted" style={{fontSize:12}}>{d.code} · {d.kind.replaceAll("_"," ")}</div><div className="muted" style={{fontSize:11,marginTop:3}}>ID: {d.id}</div></td><td>{farmNames.get(d.farmId)||"—"}<div className="muted" style={{fontSize:12}}>{d.unitId?unitNames.get(d.unitId)||"":""}</div></td><td>{safeDate(d.lastSeenAt)}</td><td><ActionForm action={toggleIotDeviceAction}><input type="hidden" name="id" value={d.id}/><button className={"button small "+(d.active?"secondary":"")}>{d.active?"Active":"Disabled"}</button></ActionForm></td></tr>)}</tbody></table></div>:<EmptyState title="No devices" text="Provision the first sensor or telemetry gateway above."/>}</div>
      <div className="card"><div className="card-head"><div><h2>Ingestion contract</h2><div className="muted" style={{fontSize:13,marginTop:4}}>POST JSON to the telemetry endpoint.</div></div></div><pre style={{whiteSpace:"pre-wrap",fontSize:12,lineHeight:1.7,background:"var(--surface-2)",padding:14,borderRadius:12}}>{"POST /api/iot/ingest\nx-farmhq-device-id: <device id>\nx-farmhq-token: <device secret>\n\n{\n  \"readings\": [\n    {\n      \"metric\": \"soil_moisture\",\n      \"value\": 28.7,\n      \"unit\": \"%\",\n      \"recordedAt\": \"2026-10-03T07:00:00Z\"\n    }\n  ]\n}"}</pre></div>
    </div>

    {readings.length?<div className="card" style={{marginTop:20}}><div className="card-head"><h2>Recent telemetry</h2></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Device</th><th>Metric</th><th>Value</th></tr></thead><tbody>{readings.map(r=><tr key={r.id}><td>{safeDate(r.recordedAt)}</td><td>{r.device.name}</td><td>{r.metric.replaceAll("_"," ")}</td><td><b>{formatNumber(r.value,3)}</b> {r.unit}</td></tr>)}</tbody></table></div></div>:null}
  </>;
}
