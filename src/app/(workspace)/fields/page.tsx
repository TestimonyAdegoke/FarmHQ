import { Plus } from "lucide-react";
import { createUnitAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Fields & Units" };

export default async function FieldsPage() {
  const ctx = await tenantContext();
  const [farms, units] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionUnit.findMany({where:{tenantId:ctx.tenantId},include:{farm:true,_count:{select:{cycles:true}}},orderBy:[{farm:{name:"asc"}},{name:"asc"}]})
  ]);
  return <><PageHeader eyebrow="Spatial operations" title="Fields & production units" description="Model the physical units where production actually happens—fields, greenhouses, barns, ponds and more."/>
    <form className="form-card" action={createUnitAction}><div className="card-head"><div><h3>Add production unit</h3><div className="muted" style={{fontSize:13,marginTop:4}}>A unit always belongs to a farm.</div></div><Plus size={20}/></div><div className="form-grid"><div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Name</label><input name="name" required placeholder="North Field 04"/></div><div className="field"><label>Unit type</label><select name="type" defaultValue="FIELD">{["FIELD","PLOT","GREENHOUSE","ORCHARD","BARN","PEN","POULTRY_HOUSE","POND","TANK","GRAZING_AREA","NURSERY","PROCESSING_AREA","WAREHOUSE_AREA","OTHER"].map(v=><option key={v}>{v}</option>)}</select></div><div className="field"><label>Area (ha)</label><input name="areaHa" type="number" min="0" step="0.001"/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Create unit</button></div></form>
    {units.length ? <div className="table-wrap"><table><thead><tr><th>Unit</th><th>Farm</th><th>Type</th><th>Area</th><th>Cycles</th><th>Status</th></tr></thead><tbody>{units.map(u=><tr key={u.id}><td><b>{u.name}</b></td><td>{u.farm.name}</td><td>{u.type.replaceAll("_"," ")}</td><td>{u.areaHa ? `${formatNumber(u.areaHa)} ha` : "—"}</td><td>{u._count.cycles}</td><td><span className={`status ${u.active?"":"neutral"}`}>{u.active?"ACTIVE":"ARCHIVED"}</span></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No production units" text="Add fields, plots, barns, ponds or other units once your first farm exists."/></div>}
  </>;
}
