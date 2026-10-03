import Link from "next/link";
import { MapPinned, Navigation, Sprout } from "lucide-react";
import { updateFarmCoordinatesAction } from "@/app/v03-actions";
import { FarmMapEditor } from "@/components/farm-map-editor";
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

  return <><PageHeader eyebrow="GIS & field boundaries" title="Farm maps" description="Anchor farms with GPS coordinates, draw production-unit polygons and build the spatial layer for scouting, weather and satellite intelligence."/>
    <div className="grid-2" style={{marginBottom:20}}>
      <ActionForm className="form-card" action={updateFarmCoordinatesAction} style={{margin:0}}><div className="card-head"><div><h3>Set farm map location</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Use the approximate farm centre. Field boundaries can then be drawn at high zoom.</div></div><Navigation size={19}/></div><div className="form-grid two"><div className="field span-2"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Latitude</label><input name="latitude" required type="number" min="-90" max="90" step="0.0000001"/></div><div className="field"><label>Longitude</label><input name="longitude" required type="number" min="-180" max="180" step="0.0000001"/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Save location</button></div></ActionForm>
      <div className="card"><div className="card-head"><div><h3>Spatial coverage</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Current tenant geometry readiness</div></div><MapPinned size={19}/></div><div className="grid-2"><div><strong style={{fontSize:28}}>{farms.filter(f=>f.latitude!=null&&f.longitude!=null).length}/{farms.length}</strong><small className="muted" style={{display:"block",marginTop:4}}>farms geolocated</small></div><div><strong style={{fontSize:28}}>{units.filter(u=>u.geometryGeoJson).length}/{units.length}</strong><small className="muted" style={{display:"block",marginTop:4}}>units mapped</small></div></div></div>
    </div>
    <div className="card" style={{marginBottom:20}}><div className="card-head"><div><h3>Choose production unit</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Boundary edits are saved to each production unit GeoJSON field.</div></div><Sprout size={19}/></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{units.map(u=><Link key={u.id} href={`/maps?unitId=${u.id}`} className={`button small ${selected?.id===u.id?"":"secondary"}`}>{u.farm.name} · {u.name}</Link>)}</div></div>
    {selected ? <FarmMapEditor unit={{id:selected.id,name:selected.name,geometryGeoJson:selected.geometryGeoJson,farm:{name:selected.farm.name,latitude:selected.farm.latitude?.toString()||null,longitude:selected.farm.longitude?.toString()||null}}} otherBoundaries={units.filter(u=>u.id!==selected.id).map(u=>({id:u.id,name:u.name,geometryGeoJson:u.geometryGeoJson}))}/> : <div className="card"><div className="empty"><strong>No production units to map</strong><span>Create fields or other production units first.</span></div></div>}
  </>;
}
