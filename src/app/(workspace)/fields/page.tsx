import { createUnitAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, humanize } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Fields & Units" };

const unitTypes = ["FIELD","PLOT","GREENHOUSE","ORCHARD","BARN","PEN","POULTRY_HOUSE","POND","TANK","GRAZING_AREA","NURSERY","PROCESSING_AREA","WAREHOUSE_AREA","OTHER"];

export default async function FieldsPage() {
  const ctx = await tenantContext("farm.view");
  const [farms, units] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionUnit.findMany({where:{tenantId:ctx.tenantId},include:{farm:true,_count:{select:{cycles:true}}},orderBy:[{farm:{name:"asc"}},{name:"asc"}]})
  ]);
  return <><PageHeader eyebrow="Operations" title="Fields & production units" description="The places where production happens: fields, greenhouses, barns, pens, ponds and more."/>
    <FormDetails title="Add production unit" hint={farms.length ? "Every unit belongs to a farm." : "Add a farm first."} open={!units.length}>
      <ActionForm action={createUnitAction} success="Unit created"><div className="form-grid"><div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Name</label><input name="name" required placeholder="North Field 04"/></div><div className="field"><label>Unit type</label><select name="type" defaultValue="FIELD">{unitTypes.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div><div className="field"><label>Area (ha)</label><input name="areaHa" type="number" min="0" step="0.001"/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Create unit</button></div></ActionForm>
    </FormDetails>
    {units.length ? <div className="table-wrap"><table><thead><tr><th>Unit</th><th>Farm</th><th>Type</th><th className="text-right">Area</th><th className="text-right">Cycles</th><th>Status</th></tr></thead><tbody>{units.map(u=><tr key={u.id}><td><b>{u.name}</b></td><td>{u.farm.name}</td><td>{humanize(u.type)}</td><td className="text-right">{u.areaHa ? `${formatNumber(u.areaHa)} ha` : "—"}</td><td className="text-right">{u._count.cycles}</td><td><span className={`status ${u.active?"":"neutral"}`}>{u.active?"Active":"Archived"}</span></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No production units" text="Add fields, plots, barns, ponds or other units once your first farm exists."/></div>}
  </>;
}
