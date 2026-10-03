import { notFound } from "next/navigation";
import { CheckCircle2, GitBranch, Leaf, PackageCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { db } from "@/lib/db";
import { formatNumber, safeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PublicTracePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lot = await db.traceLot.findUnique({
    where: { publicToken: token },
    include: { events: { orderBy: { occurredAt: "asc" } }, parent: { select: { lotCode: true, publicToken: true } }, children: { select: { lotCode: true, publicToken: true } } },
  });
  if (!lot) notFound();

  const [tenant, product, farm, cycle, harvest] = await Promise.all([
    db.tenant.findUnique({ where: { id: lot.tenantId }, select: { name: true } }),
    lot.productId ? db.product.findFirst({ where: { id: lot.productId, tenantId: lot.tenantId }, select: { name: true, category: true } }) : null,
    lot.farmId ? db.farm.findFirst({ where: { id: lot.farmId, tenantId: lot.tenantId }, select: { name: true, country: true, state: true } }) : null,
    lot.cycleId ? db.productionCycle.findFirst({ where: { id: lot.cycleId, tenantId: lot.tenantId }, select: { name: true, commodity: true, variety: true } }) : null,
    lot.harvestRecordId ? db.harvestRecord.findFirst({ where: { id: lot.harvestRecordId, tenantId: lot.tenantId }, select: { harvestedAt: true, quantity: true, unit: true, grade: true } }) : null,
  ]);

  return <main className="auth-shell" style={{alignItems:"flex-start",paddingTop:28}}>
    <section style={{width:"min(900px,100%)",display:"grid",gap:16}}>
      <div className="card"><Brand/><div className="eyebrow" style={{marginTop:24}}>Verified lot trace</div><h1 style={{marginBottom:6}}>{lot.lotCode}</h1><p>{tenant?.name||"FarmHQ producer"} · {product?.name||cycle?.commodity||"Farm produce"}</p><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}><span className="status"><CheckCircle2 size={14}/> Trace record found</span><span className={"status "+(lot.status==="QUARANTINED"?"warn":"")}>{lot.status}</span></div></div>
      <div className="grid-2">
        <div className="card"><div className="card-head"><h2>Origin</h2><Leaf size={19}/></div><div style={{display:"grid",gap:10,fontSize:14}}><div><span className="muted">Farm</span><br/><b>{farm?.name||"Not disclosed"}</b></div><div><span className="muted">Location</span><br/><b>{[farm?.state,farm?.country].filter(Boolean).join(", ")||"Not disclosed"}</b></div><div><span className="muted">Production cycle</span><br/><b>{cycle?.name||"Not linked"}</b>{cycle?.variety?<span className="muted"> · {cycle.variety}</span>:null}</div><div><span className="muted">Harvest</span><br/><b>{safeDate(harvest?.harvestedAt||lot.harvestedAt)}</b></div></div></div>
        <div className="card"><div className="card-head"><h2>Lot details</h2><PackageCheck size={19}/></div><div style={{display:"grid",gap:10,fontSize:14}}><div><span className="muted">Quantity</span><br/><b>{lot.quantity!=null?formatNumber(lot.quantity,3):harvest?formatNumber(harvest.quantity,3):"—"} {lot.unit||harvest?.unit||""}</b></div><div><span className="muted">Grade</span><br/><b>{lot.grade||harvest?.grade||"—"}</b></div><div><span className="muted">Best before / expiry</span><br/><b>{safeDate(lot.expiresAt)}</b></div><div><span className="muted">Lineage</span><br/><b>{lot.parent?"Derived from "+lot.parent.lotCode:"Original lot"}</b>{lot.children.length?<div className="muted">Split or repacked into {lot.children.map(c=>c.lotCode).join(", ")}</div>:null}</div></div></div>
      </div>
      <div className="card"><div className="card-head"><div><h2>Chain of custody</h2><div className="muted" style={{fontSize:13,marginTop:4}}>Append-only operational milestones recorded in FarmHQ.</div></div><GitBranch size={19}/></div>{lot.events.length?<div style={{display:"grid",gap:10}}>{lot.events.map((event,index)=><div key={event.id} style={{display:"grid",gridTemplateColumns:"34px 1fr",gap:10,alignItems:"start"}}><div className="status" style={{justifyContent:"center"}}>{index+1}</div><div><b>{event.type.replaceAll("_"," ")}</b><div className="muted" style={{fontSize:13}}>{safeDate(event.occurredAt)}{event.location?" · "+event.location:""}{event.reference?" · Ref "+event.reference:""}</div></div></div>)}</div>:<div className="empty"><strong>No custody events recorded</strong></div>}</div>
    </section>
  </main>;
}
