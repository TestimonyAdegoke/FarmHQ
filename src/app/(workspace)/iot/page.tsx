import { Activity, RadioTower, Satellite, ShieldCheck } from "lucide-react";
import { createIotDeviceAction, toggleIotDeviceAction } from "@/app/v04-actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, humanize, safeDate } from "@/lib/utils";
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

  return <><PageHeader eyebrow="Connected farm" title="IoT & sensors" description="Connect field devices and collect weather, soil, water, meter, GPS and livestock readings automatically."/>
    <section className="metrics">
      <MetricCard label="Devices" value={String(devices.length)} hint={String(activeDevices)+" active"} icon={<RadioTower size={16}/>}/>
      <MetricCard label="Readings" value={String(readings.length)} hint="Latest 150 loaded" icon={<Activity size={16}/>}/>
      <MetricCard label="Metrics" value={String(metricCount)} hint="Distinct telemetry channels" icon={<Satellite size={16}/>}/>
      <MetricCard label="Authentication" value="Hashed" hint="Device secrets are never stored in plaintext" icon={<ShieldCheck size={16}/>}/>
    </section>

    <FormDetails title="Add device" hint="Set a 16+ character secret on the device. FarmHQ keeps only a hash of it." open={!devices.length}>
    <ActionForm action={createIotDeviceAction} success="Device added">
      <div className="form-grid">
        <div className="field"><label>Name</label><input name="name" required placeholder="North Field Soil Probe"/></div>
        <div className="field"><label>Device code</label><input name="code" required placeholder="SOIL-N01"/></div>
        <div className="field"><label>Kind</label><select name="kind" defaultValue="SOIL_SENSOR">{["WEATHER_STATION","SOIL_SENSOR","WATER_QUALITY","METER","GPS_TRACKER","LIVESTOCK_SENSOR","OTHER"].map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div>
        <div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        <div className="field"><label>Unit</label><select name="unitId" defaultValue=""><option value="">Farm-wide</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field"><label>Device secret</label><input name="secret" required minLength={16} autoComplete="new-password" placeholder="16+ chars; store on device"/></div>
      </div>
      <div className="form-actions"><button className="button" disabled={!farms.length}>Add device</button></div>
    </ActionForm>
    </FormDetails>

    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Devices</h2></div>{devices.length?<div className="table-wrap"><table><thead><tr><th>Device</th><th>Location</th><th>Last seen</th><th>Status</th></tr></thead><tbody>{devices.map(d=><tr key={d.id}><td><b>{d.name}</b><div className="sub">{d.code} · {humanize(d.kind)}</div><div className="sub">ID: {d.id}</div></td><td>{farmNames.get(d.farmId)||"—"}<div className="sub">{d.unitId?unitNames.get(d.unitId)||"":""}</div></td><td>{safeDate(d.lastSeenAt)}</td><td><div className="inline-actions"><span className={"status "+(d.active?"":"neutral")}>{d.active?"Active":"Disabled"}</span><ActionForm action={toggleIotDeviceAction}><input type="hidden" name="id" value={d.id}/><button className="button secondary small">{d.active?"Disable":"Enable"}</button></ActionForm></div></td></tr>)}</tbody></table></div>:<EmptyState title="No devices" text="Add your first sensor or gateway above." icon={<RadioTower size={20}/>}/>}</div>
      <div className="card"><div className="card-head"><div><h2>Sending readings</h2><div className="card-sub">Devices POST JSON to the telemetry endpoint.</div></div></div><pre className="code">{"POST /api/iot/ingest\nx-farmhq-device-id: <device id>\nx-farmhq-token: <device secret>\n\n{\n  \"readings\": [\n    {\n      \"metric\": \"soil_moisture\",\n      \"value\": 28.7,\n      \"unit\": \"%\",\n      \"recordedAt\": \"2026-10-03T07:00:00Z\"\n    }\n  ]\n}"}</pre></div>
    </div>

    {readings.length?<div className="card"><div className="card-head"><h2>Recent telemetry</h2></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Device</th><th>Metric</th><th className="text-right">Value</th></tr></thead><tbody>{readings.map(r=><tr key={r.id}><td>{safeDate(r.recordedAt)}</td><td>{r.device.name}</td><td>{humanize(r.metric)}</td><td className="text-right"><b>{formatNumber(r.value,3)}</b> {r.unit}</td></tr>)}</tbody></table></div></div>:null}
  </>;
}
