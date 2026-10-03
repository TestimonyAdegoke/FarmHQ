import Link from "next/link";
import { Beef, HeartPulse, MapPin, Tags } from "lucide-react";
import { createAnimalAction, createAnimalHealthEventAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Livestock" };

const eventTypes = ["WEIGHT","VACCINATION","TREATMENT","DEWORMING","DIAGNOSIS","BREEDING","PREGNANCY_CHECK","BIRTH","OTHER"];

export default async function LivestockPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await tenantContext("livestock.view");
  const tab = (await searchParams).tab === "events" ? "events" : "animals";
  const [farms, units, animals, healthEvents] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionUnit.findMany({where:{tenantId:ctx.tenantId,active:true,type:{in:["BARN","PEN","GRAZING_AREA","OTHER"]}},orderBy:{name:"asc"}}),
    db.animal.findMany({where:{tenantId:ctx.tenantId},include:{farm:true,unit:true},orderBy:{createdAt:"desc"}}),
    db.animalHealthEvent.findMany({where:{tenantId:ctx.tenantId},include:{animal:{include:{farm:true}}},orderBy:{eventDate:"desc"},take:100}),
  ]);
  const active=animals.filter(a=>a.status==="ACTIVE").length;
  const species=new Set(animals.map(a=>a.species.toLowerCase())).size;
  return <><PageHeader eyebrow="Operations" title="Livestock" description="Your animal register: where each animal is, its breed and status, and its health history."/>
    <section className="metrics"><MetricCard label="Registered animals" value={String(animals.length)} hint="Including sold and deceased" icon={<Tags size={16}/>}/><MetricCard label="Active animals" value={String(active)} hint="On the farm now" icon={<Beef size={16}/>}/><MetricCard label="Species" value={String(species)} hint="Across the organization" icon={<HeartPulse size={16}/>}/><MetricCard label="Livestock farms" value={String(new Set(animals.map(a=>a.farmId)).size)} hint="With registered animals" icon={<MapPin size={16}/>}/></section>
    <div className="drawers">
      <FormDetails title="Register animal" hint="Tag, species and where it is kept." open={!animals.length}>
        <ActionForm action={createAnimalAction} success="Animal registered"><div className="form-grid two"><div className="field"><label>Farm</label><select name="farmId" required defaultValue=""><option value="" disabled>Select farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Unit / pen</label><select name="unitId" defaultValue=""><option value="">No specific unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div><div className="field"><label>Tag / ID</label><input name="tag" required placeholder="COW-0042"/></div><div className="field"><label>Species</label><input name="species" required placeholder="Cattle"/></div><div className="field"><label>Breed</label><input name="breed"/></div><div className="field"><label>Sex</label><select name="sex" defaultValue=""><option value="">Not set</option><option value="Male">Male</option><option value="Female">Female</option></select></div><div className="field"><label>Birth date</label><input name="birthDate" type="date"/></div><div className="field"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button" disabled={!farms.length}>Register animal</button></div></ActionForm>
      </FormDetails>
      <FormDetails title="Record animal event" hint="Weights, vaccinations, treatments, breeding and births.">
        <ActionForm action={createAnimalHealthEventAction} success="Event recorded"><div className="form-grid two"><div className="field"><label>Animal</label><select name="animalId" required defaultValue=""><option value="" disabled>Select animal</option>{animals.filter(a=>a.status==="ACTIVE").map(a=><option key={a.id} value={a.id}>{a.tag} · {a.species}</option>)}</select></div><div className="field"><label>Event type</label><select name="type" defaultValue="WEIGHT">{eventTypes.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div><div className="field span-2"><label>Title</label><input name="title" required/></div><div className="field"><label>Event date</label><input name="eventDate" type="date"/></div><div className="field"><label>Weight (kg)</label><input name="weightKg" type="number" min="0" step="0.001"/></div><div className="field"><label>Medication</label><input name="medication"/></div><div className="field"><label>Dosage</label><input name="dosage"/></div><div className="field"><label>Veterinarian</label><input name="veterinarian"/></div><div className="field"><label>Next due</label><input name="nextDueAt" type="date"/></div><div className="field span-2"><label>Details</label><input name="details"/></div></div><div className="form-actions"><button className="button" disabled={!animals.length}>Record event</button></div></ActionForm>
      </FormDetails>
    </div>
    <div className="tabs"><Link href="/livestock" className={tab === "animals" ? "active" : ""}>Animals ({animals.length})</Link><Link href="/livestock?tab=events" className={tab === "events" ? "active" : ""}>Health & events</Link></div>
    {tab === "events"
      ? (healthEvents.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Animal</th><th>Event</th><th className="text-right">Weight</th><th>Care / vet</th><th>Next due</th></tr></thead><tbody>{healthEvents.map(e=><tr key={e.id}><td>{safeDate(e.eventDate)}</td><td><b>{e.animal.tag}</b><div className="sub">{e.animal.farm.name}</div></td><td>{e.title}<div className="sub">{humanize(e.type)}</div></td><td className="text-right">{e.weightKg?`${e.weightKg} kg`:"—"}</td><td>{e.medication||e.veterinarian||"—"}<div className="sub">{e.dosage||""}</div></td><td>{safeDate(e.nextDueAt)}</td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No animal events yet" text="Record weights, vaccinations and treatments to build each animal's history." icon={<HeartPulse size={20}/>}/></div>)
      : (animals.length ? <div className="table-wrap"><table><thead><tr><th>Tag</th><th>Species / breed</th><th>Farm / unit</th><th>Sex</th><th>Birth date</th><th>Status</th></tr></thead><tbody>{animals.map(a=><tr key={a.id}><td><b>{a.tag}</b></td><td>{a.species}<div className="sub">{a.breed||"Breed not set"}</div></td><td>{a.farm.name}<div className="sub">{a.unit?.name||""}</div></td><td>{a.sex||"—"}</td><td>{safeDate(a.birthDate)}</td><td><span className={`status ${a.status!=="ACTIVE"?"neutral":""}`}>{humanize(a.status)}</span></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No animals registered" text="Register livestock to start building animal history." icon={<Beef size={20}/>}/></div>)}
  </>;
}
