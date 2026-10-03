import { MapPin, Sprout } from "lucide-react";
import { createFarmAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, humanize } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Farms" };

const farmTypes = ["MIXED", "CROP", "LIVESTOCK", "POULTRY", "AQUACULTURE", "GREENHOUSE", "ORCHARD", "OTHER"];

export default async function FarmsPage() {
  const ctx = await tenantContext("farm.view");
  const farms = await db.farm.findMany({ where:{ tenantId:ctx.tenantId }, include:{ _count:{select:{units:true,cycles:true}} }, orderBy:{name:"asc"} });
  return <><PageHeader eyebrow="Operations" title="Farms" description="Every farm and site you run. Fields, animals, stock and costs roll up to a farm."/>
    <FormDetails title="Add farm" hint="A farm or site you operate." open={!farms.length}>
      <ActionForm action={createFarmAction} success="Farm created"><div className="form-grid"><div className="field"><label>Farm name</label><input name="name" required placeholder="Kaduna Farm"/></div><div className="field"><label>Code</label><input name="code" placeholder="KAD-01"/></div><div className="field"><label>Type</label><select name="type" defaultValue="MIXED">{farmTypes.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div><div className="field"><label>Area (ha)</label><input name="areaHa" type="number" min="0" step="0.001"/></div><div className="field"><label>Country</label><input name="country" defaultValue="Nigeria"/></div><div className="field"><label>State / region</label><input name="state"/></div><div className="field span-2"><label>Address / description</label><input name="address"/></div></div><div className="form-actions"><button className="button">Create farm</button></div></ActionForm>
    </FormDetails>
    {farms.length ? <div className="grid-3">{farms.map(f=><div className="card" key={f.id}>
      <div className="card-head"><div><h2>{f.name}</h2><div className="card-sub"><MapPin size={13} aria-hidden/> {[f.state,f.country].filter(Boolean).join(", ") || "Location not set"}</div></div><span className="status">{humanize(f.type)}</span></div>
      <dl className="kv"><dt>Production units</dt><dd>{f._count.units}</dd><dt>Cycles</dt><dd>{f._count.cycles}</dd><dt>Area</dt><dd>{f.areaHa ? `${formatNumber(f.areaHa)} ha` : "—"}</dd></dl>
    </div>)}</div> : <div className="card"><EmptyState title="No farms yet" text="Add your first farm. Fields, livestock, stock and costs will roll up to it." icon={<Sprout size={20}/>}/></div>}
  </>;
}
