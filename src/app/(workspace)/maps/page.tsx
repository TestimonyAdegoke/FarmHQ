import Link from "next/link";
import { MapPinned, Navigation } from "lucide-react";
import { updateFarmCoordinatesAction } from "@/app/v03-actions";
import { EmptyState } from "@/components/empty-state";
import { FarmMapEditor } from "@/components/farm-map-editor";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Farm Maps" };

export default async function MapsPage({ searchParams }: { searchParams: Promise<{ unitId?: string }> }) {
  const ctx = await tenantContext("farm.view");
  const query = await searchParams;
  const [farms, units] = await Promise.all([
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, orderBy: { name: "asc" } }),
    db.productionUnit.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm }, include: { farm: true }, orderBy: [{ farm: { name: "asc" } }, { name: "asc" }] }),
  ]);
  const selected = units.find((u) => u.id === query.unitId) || units[0];
  const located = farms.filter(f=>f.latitude!=null&&f.longitude!=null).length;
  const mapped = units.filter(u=>u.geometryGeoJson).length;

  return <><PageHeader eyebrow="Operations" title="Farm maps" description="Pin each farm on the map and draw field boundaries, so scouting, weather and satellite views line up."/>
    <section className="metrics">
      <MetricCard label="Farms located" value={`${located}/${farms.length}`} hint="Have a map location" icon={<Navigation size={16}/>}/>
      <MetricCard label="Units mapped" value={`${mapped}/${units.length}`} hint="Have a drawn boundary" icon={<MapPinned size={16}/>}/>
    </section>
    <FormDetails title="Set farm location" hint="Use the approximate farm centre, then draw boundaries at high zoom." open={!!farms.length && !located}>
      <ActionForm action={updateFarmCoordinatesAction} success="Location saved"><div className="form-grid two"><div className="field span-2"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Latitude</label><input name="latitude" required type="number" min="-90" max="90" step="0.0000001"/></div><div className="field"><label>Longitude</label><input name="longitude" required type="number" min="-180" max="180" step="0.0000001"/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Save location</button></div></ActionForm>
    </FormDetails>
    {units.length ? <div className="card"><div className="card-head"><div><h2>Production unit</h2><div className="card-sub">Choose a unit to draw or edit its boundary.</div></div></div><div className="segmented">{units.map(u=><Link key={u.id} href={`/maps?unitId=${u.id}`} className={selected?.id===u.id?"active":""}>{u.farm.name} · {u.name}</Link>)}</div></div> : null}
    {selected ? <FarmMapEditor key={selected.id} unit={{id:selected.id,name:selected.name,geometryGeoJson:selected.geometryGeoJson,farm:{name:selected.farm.name,latitude:selected.farm.latitude?.toString()||null,longitude:selected.farm.longitude?.toString()||null}}} otherBoundaries={units.filter(u=>u.id!==selected.id).map(u=>({id:u.id,name:u.name,geometryGeoJson:u.geometryGeoJson}))}/> : <div className="card"><EmptyState title="No production units to map" text="Create fields or other production units first." icon={<MapPinned size={20}/>}/></div>}
  </>;
}
