import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { db } from "@/lib/db";
import { formatNumber, humanize, safeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lot trace" };

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
  const quantity = lot.quantity != null ? formatNumber(lot.quantity, 3) : harvest ? formatNumber(harvest.quantity, 3) : null;

  return <main className="public-shell">
    <header className="public-head"><Brand/><span className="status"><BadgeCheck size={13} aria-hidden/> Verified trace record</span></header>

    <section className="public-title">
      <div className="eyebrow">{tenant?.name || "FarmHQ producer"}</div>
      <h1>{product?.name || cycle?.commodity || "Farm produce"}</h1>
      <p>Lot <b>{lot.lotCode}</b> · <span className={`status ${lot.status === "QUARANTINED" ? "warn" : ["CONSUMED", "CLOSED"].includes(lot.status) ? "neutral" : ""}`}>{humanize(lot.status)}</span></p>
    </section>

    <div className="grid-2">
      <section className="card"><div className="card-head"><h2>Origin</h2></div>
        <dl className="kv">
          <dt>Farm</dt><dd>{farm?.name || "Not disclosed"}</dd>
          <dt>Location</dt><dd>{[farm?.state, farm?.country].filter(Boolean).join(", ") || "Not disclosed"}</dd>
          <dt>Production cycle</dt><dd>{cycle?.name || "Not linked"}{cycle?.variety ? ` · ${cycle.variety}` : ""}</dd>
          <dt>Harvested</dt><dd>{safeDate(harvest?.harvestedAt || lot.harvestedAt)}</dd>
        </dl>
      </section>
      <section className="card"><div className="card-head"><h2>Lot details</h2></div>
        <dl className="kv">
          <dt>Quantity</dt><dd>{quantity ? `${quantity} ${lot.unit || harvest?.unit || ""}` : "—"}</dd>
          <dt>Grade</dt><dd>{lot.grade || harvest?.grade || "—"}</dd>
          <dt>Best before</dt><dd>{safeDate(lot.expiresAt)}</dd>
          <dt>Lineage</dt><dd>{lot.parent ? `From ${lot.parent.lotCode}` : "Original lot"}{lot.children.length ? <div className="sub">Repacked into {lot.children.map(c => c.lotCode).join(", ")}</div> : null}</dd>
        </dl>
      </section>
    </div>

    <section className="card"><div className="card-head"><div><h2>Chain of custody</h2><div className="card-sub">Each step was recorded by the producer as it happened and cannot be edited afterwards.</div></div></div>
      {lot.events.length ? <ol className="timeline">{lot.events.map(event => <li key={event.id}>
        <b>{humanize(event.type)}</b>
        <div className="sub">{safeDate(event.occurredAt)}{event.location ? ` · ${event.location}` : ""}{event.reference ? ` · Ref ${event.reference}` : ""}</div>
      </li>)}</ol> : <div className="empty"><strong>No custody events recorded yet</strong></div>}
    </section>

    <footer className="public-foot">Traceability by FarmHQ</footer>
  </main>;
}
