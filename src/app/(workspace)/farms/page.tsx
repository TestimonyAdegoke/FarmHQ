import { MapPin, Plus, Sprout } from "lucide-react";
import { createFarmAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Farms" };

export default async function FarmsPage() {
  const ctx = await tenantContext("farm.view");
  const farms = await db.farm.findMany({ where:{ tenantId:ctx.tenantId }, include:{ _count:{select:{units:true,cycles:true}} }, orderBy:{name:"asc"} });
  return <><PageHeader eyebrow="Operations" title="Farms" description="Manage every physical farm, site and agricultural operation in this organization."/>
    <ActionForm className="form-card" action={createFarmAction}><div className="card-head"><div><h3>Add farm</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Create a top-level operational site.</div></div><Plus size={20}/></div><div className="form-grid"><div className="field"><label>Farm name</label><input name="name" required placeholder="Kaduna Farm"/></div><div className="field"><label>Code</label><input name="code" placeholder="KAD-01"/></div><div className="field"><label>Type</label><select name="type" defaultValue="MIXED"><option>MIXED</option><option>CROP</option><option>LIVESTOCK</option><option>POULTRY</option><option>AQUACULTURE</option><option>GREENHOUSE</option><option>ORCHARD</option><option>OTHER</option></select></div><div className="field"><label>Area (ha)</label><input name="areaHa" type="number" min="0" step="0.001"/></div><div className="field"><label>Country</label><input name="country" defaultValue="Nigeria"/></div><div className="field"><label>State / region</label><input name="state"/></div><div className="field span-2"><label>Address / description</label><input name="address"/></div></div><div className="form-actions"><button className="button">Create farm</button></div></ActionForm>
    {farms.length ? <div className="grid-3">{farms.map(f=><div className="card" key={f.id}><div className="card-head"><span className="icon-box"><Sprout size={19}/></span><span className="status">{f.type}</span></div><h2>{f.name}</h2><p className="muted" style={{fontSize:13}}><MapPin size={13} style={{verticalAlign:"middle"}}/> {[f.state,f.country].filter(Boolean).join(", ") || "Location not set"}</p><div style={{display:"flex",gap:22,borderTop:"1px solid var(--line)",paddingTop:15,marginTop:18}}><div><strong>{f._count.units}</strong><small className="muted" style={{display:"block"}}>units</small></div><div><strong>{f._count.cycles}</strong><small className="muted" style={{display:"block"}}>cycles</small></div><div><strong>{f.areaHa ? formatNumber(f.areaHa) : "—"}</strong><small className="muted" style={{display:"block"}}>hectares</small></div></div></div>)}</div> : <div className="card"><EmptyState title="No farms yet" text="Create your first farm above. Fields, livestock, inventory and costs will roll up to it."/></div>}
  </>;
}
