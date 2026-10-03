import { CircleDollarSign, Gauge, Tractor, Wrench } from "lucide-react";
import { createEquipmentAction, createEquipmentLogAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Equipment" };

const statusTone: Record<string,string> = { AVAILABLE:"", IN_USE:"info", MAINTENANCE:"warn", OUT_OF_SERVICE:"danger", SOLD:"neutral" };
const logTone: Record<string,string> = { USAGE:"neutral", FUEL:"neutral", MAINTENANCE:"info", BREAKDOWN:"danger", INSPECTION:"neutral" };

export default async function EquipmentPage() {
  const ctx=await tenantContext("equipment.view");
  const [farms,cycles,equipment,logs]=await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true,...ctx.scope.farms},orderBy:{name:"asc"}}),
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId,...ctx.scope.byFarm,status:{in:["PLANNED","ACTIVE","PAUSED"]}},orderBy:{name:"asc"}}),
    db.equipment.findMany({where:{tenantId:ctx.tenantId,...ctx.scope.byFarm},include:{farm:true},orderBy:{name:"asc"}}),
    db.equipmentLog.findMany({where:{tenantId:ctx.tenantId,...ctx.scope.byFarm},include:{equipment:true,farm:true,cycle:true},orderBy:{logDate:"desc"},take:120}),
  ]);
  const serviceDue=equipment.filter(e=>e.nextServiceAt!=null&&e.meterReading!=null&&Number(e.meterReading)>=Number(e.nextServiceAt)).length;
  const value=equipment.reduce((s,e)=>s+Number(e.purchaseValue||0),0);
  const runningCost=logs.reduce((s,l)=>s+Number(l.cost||0),0);
  const money=(n: number | string | { toString(): string })=>formatMoney(n,ctx.tenant.currency);

  return <>
    <PageHeader eyebrow="Asset operations" title="Equipment" description="Tractors, vehicles, pumps, generators and implements: what they are doing, what they cost, and when they need a service."/>
    <section className="metrics">
      <MetricCard label="Assets" value={String(equipment.length)} hint="Registered equipment" icon={<Tractor size={16}/>}/>
      <MetricCard label="Available" value={String(equipment.filter(e=>e.status==="AVAILABLE").length)} hint="Ready for work" icon={<Gauge size={16}/>}/>
      <MetricCard label="Service due" value={String(serviceDue)} hint="Meter reading past service point" icon={<Wrench size={16}/>}/>
      <MetricCard label="Operating cost" value={money(runningCost)} hint={`Purchase value ${money(value)}`} icon={<CircleDollarSign size={16}/>}/>
    </section>

    <div className="drawers">
      <FormDetails title="Log usage, fuel or maintenance" hint="Costs linked to a production cycle count towards its profitability.">
        <ActionForm action={createEquipmentLogAction} success="Log saved">
          <div className="form-grid two">
            <div className="field"><label>Equipment</label><select name="equipmentId" required defaultValue=""><option value="" disabled>Select asset</option>{equipment.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
            <div className="field"><label>Log type</label><select name="type" defaultValue="USAGE"><option value="USAGE">Usage</option><option value="FUEL">Fuel</option><option value="MAINTENANCE">Maintenance</option><option value="BREAKDOWN">Breakdown</option><option value="INSPECTION">Inspection</option></select></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Use asset farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not allocated</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Date</label><input name="logDate" type="date"/></div>
            <div className="field"><label>Usage hours</label><input name="hours" type="number" min="0" step="0.01"/></div>
            <div className="field"><label>Fuel (L)</label><input name="fuelLiters" type="number" min="0" step="0.001"/></div>
            <div className="field"><label>Cost</label><input name="cost" type="number" min="0" step="0.01"/></div>
            <div className="field"><label>Meter reading</label><input name="meterReading" type="number" min="0" step="0.01"/></div>
            <div className="field"><label>Notes</label><input name="notes"/></div>
          </div>
          <div className="form-actions"><button className="button" disabled={!equipment.length}>Save log</button></div>
        </ActionForm>
      </FormDetails>
      <FormDetails title="Register equipment" hint="Add a machine with its meter and service point to get service reminders." open={!equipment.length}>
        <ActionForm action={createEquipmentAction} success="Equipment registered">
          <div className="form-grid two">
            <div className="field"><label>Name</label><input name="name" required placeholder="John Deere 5075E"/></div>
            <div className="field"><label>Code</label><input name="code" placeholder="TR-04"/></div>
            <div className="field"><label>Category</label><input name="category" required placeholder="Tractor"/></div>
            <div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">Shared / central</option>}{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div className="field"><label>Status</label><select name="status" defaultValue="AVAILABLE"><option value="AVAILABLE">Available</option><option value="IN_USE">In use</option><option value="MAINTENANCE">Maintenance</option><option value="OUT_OF_SERVICE">Out of service</option></select></div>
            <div className="field"><label>Purchase date</label><input name="purchaseDate" type="date"/></div>
            <div className="field"><label>Purchase value</label><input name="purchaseValue" type="number" min="0" step="0.01"/></div>
            <div className="field"><label>Meter unit</label><input name="meterUnit" placeholder="hours / km"/></div>
            <div className="field"><label>Current meter</label><input name="meterReading" type="number" min="0" step="0.01"/></div>
            <div className="field"><label>Next service at</label><input name="nextServiceAt" type="number" min="0" step="0.01"/></div>
          </div>
          <div className="form-actions"><button className="button">Register equipment</button></div>
        </ActionForm>
      </FormDetails>
    </div>

    {equipment.length ? <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Category</th><th>Location</th><th className="text-right">Meter</th><th className="text-right">Next service</th><th>Purchased</th><th>Status</th></tr></thead><tbody>{equipment.map(e=>{
      const due=e.nextServiceAt!=null&&e.meterReading!=null&&Number(e.meterReading)>=Number(e.nextServiceAt);
      return <tr key={e.id}>
        <td><b>{e.name}</b><div className="sub">{e.code||"No code"}</div></td>
        <td>{e.category}</td>
        <td>{e.farm?.name||"Shared"}</td>
        <td className="text-right nowrap">{e.meterReading?`${formatNumber(e.meterReading)} ${e.meterUnit||""}`:"—"}</td>
        <td className="text-right nowrap">{e.nextServiceAt?`${formatNumber(e.nextServiceAt)} ${e.meterUnit||""}`:"—"}{due?<div><span className="status warn">Service due</span></div>:null}</td>
        <td>{safeDate(e.purchaseDate)}</td>
        <td><span className={`status ${statusTone[e.status]??"neutral"}`}>{humanize(e.status)}</span></td>
      </tr>;
    })}</tbody></table></div> : <div className="card"><EmptyState title="No equipment yet" text="Register your tractors, pumps and vehicles to track use, fuel and servicing." icon={<Tractor size={20}/>}/></div>}

    {logs.length ? <div className="card"><div className="card-head"><h2>Recent equipment logs</h2></div>
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Asset</th><th>Type</th><th>Farm / cycle</th><th className="text-right">Hours / fuel</th><th className="text-right">Cost</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}>
        <td>{safeDate(l.logDate)}</td>
        <td><b>{l.equipment.name}</b></td>
        <td><span className={`status ${logTone[l.type]??"neutral"}`}>{humanize(l.type)}</span></td>
        <td>{l.farm?.name||"Shared"}<div className="sub">{l.cycle?.name||""}</div></td>
        <td className="text-right nowrap">{l.hours?`${formatNumber(l.hours,2)} h`:""}{l.hours&&l.fuelLiters?" · ":""}{l.fuelLiters?`${formatNumber(l.fuelLiters,2)} L`:""}{!l.hours&&!l.fuelLiters?"—":""}</td>
        <td className="text-right">{l.cost?money(l.cost):"—"}</td>
      </tr>)}</tbody></table></div>
    </div> : null}
  </>;
}
