import Image from "next/image";
import Link from "next/link";
import { GitBranch, QrCode, ScanLine, ShieldAlert } from "lucide-react";
import { createTraceEventAction, createTraceLotAction, updateTraceLotStatusAction } from "@/app/v04-actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatNumber, humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Traceability" };

const eventTypes = ["RECEIVED","TRANSFERRED","PACKED","GRADED","INSPECTED","SOLD","DELIVERED","ADJUSTED","NOTE"];
const lotStatuses = ["ACTIVE","QUARANTINED","RELEASED","CONSUMED","SOLD","CLOSED"];
const lotTone = (status: string) => status==="QUARANTINED"?"warn":["ACTIVE","RELEASED"].includes(status)?"":"neutral";

export default async function TraceabilityPage() {
  const ctx = await tenantContext("inventory.view");
  const [lots, products, farms, cycles, harvests, warehouses] = await Promise.all([
    db.traceLot.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, include: { events: { orderBy: { occurredAt: "desc" }, take: 5 }, children: { select: { id: true, lotCode: true } }, parent: { select: { id: true, lotCode: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.product.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { name: "asc" } }),
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.farms }, orderBy: { name: "asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.harvestRecord.findMany({ where: { tenantId: ctx.tenantId, ...ctx.scope.byFarm }, orderBy: { harvestedAt: "desc" }, take: 200 }),
    db.warehouse.findMany({ where: { tenantId: ctx.tenantId, active: true, ...ctx.scope.byFarm }, orderBy: { name: "asc" } }),
  ]);
  const productNames = new Map(products.map(p=>[p.id,p.name]));
  const farmNames = new Map(farms.map(f=>[f.id,f.name]));
  const cycleNames = new Map(cycles.map(c=>[c.id,c.name]));
  const active = lots.filter(l=>["ACTIVE","RELEASED"].includes(l.status)).length;
  const quarantined = lots.filter(l=>l.status==="QUARANTINED").length;
  const linkedHarvests = lots.filter(l=>l.harvestRecordId).length;

  return <>
    <PageHeader eyebrow="Farm-to-customer chain" title="Traceability" description="Give each lot its own scannable QR code, record every handover and check, and keep track of lots split or repacked from others."/>
    <section className="metrics">
      <MetricCard label="Trace lots" value={String(lots.length)} hint={`${active} active or released`} icon={<QrCode size={16}/>}/>
      <MetricCard label="Harvest-linked" value={String(linkedHarvests)} hint="Lots tied to a recorded harvest" icon={<ScanLine size={16}/>}/>
      <MetricCard label="Quarantined" value={String(quarantined)} hint="Must be released before moving" icon={<ShieldAlert size={16}/>}/>
      <MetricCard label="Split or repacked" value={String(lots.filter(l=>l.parentLotId).length)} hint="Lots made from a parent lot" icon={<GitBranch size={16}/>}/>
    </section>

    <div className="drawers">
      <FormDetails title="Create trace lot" hint="Each lot gets its own private QR link that customers can scan." open={!lots.length}>
        <ActionForm action={createTraceLotAction} success="Lot created">
          <div className="form-grid two">
            <div className="field"><label>Lot code</label><input name="lotCode" required placeholder="MAIZE-26-001"/></div>
            <div className="field"><label>Product</label><select name="productId" defaultValue=""><option value="">Not catalogued</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">Not linked</option>}{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not linked</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field span-2"><label>Source harvest</label><select name="harvestRecordId" defaultValue=""><option value="">No direct harvest link</option>{harvests.map(h=><option key={h.id} value={h.id}>{safeDate(h.harvestedAt)} · {h.lotNumber||h.id.slice(-8)} · {formatNumber(h.quantity,3)} {h.unit}</option>)}</select></div>
            <div className="field span-2"><label>Parent lot</label><select name="parentLotId" defaultValue=""><option value="">Original lot</option>{lots.map(l=><option key={l.id} value={l.id}>{l.lotCode}</option>)}</select></div>
            <div className="field"><label>Quantity</label><input name="quantity" type="number" min="0" step="0.001"/></div>
            <div className="field"><label>Unit</label><input name="unit" placeholder="kg / tonnes / crates"/></div>
            <div className="field"><label>Grade</label><input name="grade"/></div>
            <div className="field"><label>Harvest date</label><input name="harvestedAt" type="date"/></div>
            <div className="field"><label>Expiry / best before</label><input name="expiresAt" type="date"/></div>
            <div className="field"><label>Reference</label><input name="reference"/></div>
            <div className="field span-2"><label>Notes</label><input name="notes"/></div>
          </div>
          <div className="form-actions"><button className="button">Create lot</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Add chain event" hint="Record handling, checks, moves, sales and deliveries. Past events are never changed.">
        <ActionForm action={createTraceEventAction} success="Event added">
          <div className="form-grid two">
            <div className="field span-2"><label>Lot</label><select name="lotId" required defaultValue=""><option value="" disabled>Select lot</option>{lots.map(l=><option key={l.id} value={l.id}>{l.lotCode}</option>)}</select></div>
            <div className="field"><label>Event</label><select name="type" defaultValue="TRANSFERRED">{eventTypes.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></div>
            <div className="field"><label>Date</label><input name="occurredAt" type="date"/></div>
            <div className="field"><label>Warehouse</label><select name="warehouseId" defaultValue=""><option value="">No warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div className="field"><label>Location</label><input name="location"/></div>
            <div className="field"><label>Quantity</label><input name="quantity" type="number" min="0" step="0.001"/></div>
            <div className="field"><label>Unit</label><input name="unit"/></div>
            <div className="field"><label>Reference</label><input name="reference"/></div>
            <div className="field span-2"><label>Notes</label><input name="notes"/></div>
          </div>
          <div className="form-actions"><button className="button" disabled={!lots.length}>Add event</button></div>
        </ActionForm>
      </FormDetails>
    </div>

    {lots.length ? <div className="table-wrap"><table><thead><tr><th>QR</th><th>Lot</th><th className="text-right">Quantity</th><th>Grade / harvest</th><th>Lineage</th><th>Recent events</th><th>Status</th><th>Update</th></tr></thead><tbody>{lots.map(lot=><tr key={lot.id}>
      <td><Link href={"/trace/"+lot.publicToken} target="_blank" aria-label={"Open public trace for "+lot.lotCode}><Image src={"/api/trace/qr/"+lot.publicToken} alt={"QR for "+lot.lotCode} width={56} height={56} unoptimized/></Link></td>
      <td><Link className="link" href={"/trace/"+lot.publicToken} target="_blank">{lot.lotCode}</Link><div className="sub">{lot.productId?productNames.get(lot.productId)||"Catalog product":"Uncatalogued"} · {lot.farmId?farmNames.get(lot.farmId)||"Farm":"No farm"}{lot.cycleId?" · "+(cycleNames.get(lot.cycleId)||"Cycle"):""}</div></td>
      <td className="text-right nowrap">{lot.quantity!=null?formatNumber(lot.quantity,3):"—"} {lot.unit||""}</td>
      <td>{lot.grade||"—"}<div className="sub">{lot.harvestedAt?"Harvested "+safeDate(lot.harvestedAt):"No harvest date"}</div></td>
      <td>{lot.parent?<div>From <b>{lot.parent.lotCode}</b></div>:null}{lot.children.length?<div className="sub">Split into {lot.children.map(c=>c.lotCode).join(", ")}</div>:null}{!lot.parent&&!lot.children.length?<span className="muted">Original</span>:null}</td>
      <td>{lot.events.length?lot.events.map(e=><div className="sub nowrap" key={e.id}>{humanize(e.type)} · {safeDate(e.occurredAt)}</div>):<span className="muted">None yet</span>}</td>
      <td><span className={`status ${lotTone(lot.status)}`}>{humanize(lot.status)}</span></td>
      <td><div className="inline-actions"><ActionForm action={updateTraceLotStatusAction}><input type="hidden" name="id" value={lot.id}/><select name="status" defaultValue={lot.status} aria-label={"Status for "+lot.lotCode}>{lotStatuses.map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select><button className="button secondary small">Update</button></ActionForm></div></td>
    </tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No trace lots yet" text="Create a lot for a harvest or batch so buyers can scan where it came from." icon={<QrCode size={20}/>}/></div>}
  </>;
}
