import { Clock3, Plus, UserRoundCheck, Users } from "lucide-react";
import { createTimesheetAction, createWorkforceMemberAction, updateTimesheetStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { formatMoney, formatNumber, safeDate } from "@/lib/utils";

export const metadata = { title: "Workforce" };

export default async function WorkforcePage(){
  const ctx=await tenantContext();
  const [farms,cycles,workers,timesheets]=await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId,status:{in:["PLANNED","ACTIVE","PAUSED"]}},orderBy:{name:"asc"}}),
    db.workforceMember.findMany({where:{tenantId:ctx.tenantId,active:true},include:{farm:true},orderBy:{name:"asc"}}),
    db.timesheet.findMany({where:{tenantId:ctx.tenantId},include:{worker:true,farm:true,cycle:true},orderBy:{workDate:"desc"},take:150}),
  ]);
  const approved=timesheets.filter(t=>t.status==="APPROVED");
  const hours=approved.reduce((s,t)=>s+Number(t.hours),0);
  const labor=approved.reduce((s,t)=>s+Number(t.hours)*Number(t.hourlyRate),0);
  const pending=timesheets.filter(t=>t.status==="SUBMITTED").length;
  return <><PageHeader eyebrow="People & labour" title="Workforce" description="Manage farm workers and allocate labour hours and cost directly to farms and production cycles."/>
    <section className="metrics"><MetricCard label="Active workers" value={String(workers.length)} hint="Employees + contractors" icon={<Users size={18}/>}/><MetricCard label="Approved hours" value={formatNumber(hours,2)} hint="Latest 150 entries" icon={<Clock3 size={18}/>}/><MetricCard label="Labour cost" value={formatMoney(labor,ctx.tenant.currency)} hint="Approved timesheets" icon={<UserRoundCheck size={18}/>}/><MetricCard label="Pending approval" value={String(pending)} hint="Submitted timesheets" icon={<Clock3 size={18}/>}/></section>
    <div className="grid-2" style={{marginBottom:20}}>
      <form className="form-card" action={createWorkforceMemberAction} style={{margin:0}}><div className="card-head"><h3>Add worker</h3><Plus size={19}/></div><div className="form-grid two"><div className="field"><label>Name</label><input name="name" required/></div><div className="field"><label>Employee no.</label><input name="employeeNo"/></div><div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Shared / central</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Job title</label><input name="jobTitle"/></div><div className="field"><label>Employment</label><select name="employmentType" defaultValue="PERMANENT"><option>PERMANENT</option><option>TEMPORARY</option><option>CONTRACTOR</option><option>SEASONAL</option></select></div><div className="field"><label>Phone</label><input name="phone"/></div><div className="field span-2"><label>Default hourly rate ({ctx.tenant.currency})</label><input name="defaultHourlyRate" type="number" min="0" step="0.01"/></div></div><div className="form-actions"><button className="button">Add worker</button></div></form>
      <form className="form-card" action={createTimesheetAction} style={{margin:0}}><div className="card-head"><h3>Record labour</h3><Clock3 size={19}/></div><div className="form-grid two"><div className="field"><label>Worker</label><select name="workerId" required defaultValue=""><option value="" disabled>Select worker</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div><div className="field"><label>Date</label><input name="workDate" type="date"/></div><div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">Use worker farm</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">Not allocated</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Hours</label><input name="hours" required type="number" min="0.01" step="0.25"/></div><div className="field"><label>Hourly rate override</label><input name="hourlyRate" type="number" min="0" step="0.01"/></div><div className="field span-2"><label>Activity</label><input name="activity" required placeholder="Harvesting / weeding / animal care"/></div><div className="field"><label>Status</label><select name="status" defaultValue="SUBMITTED"><option>DRAFT</option><option>SUBMITTED</option><option>APPROVED</option></select></div><div className="field"><label>Notes</label><input name="notes"/></div></div><div className="form-actions"><button className="button" disabled={!workers.length}>Save timesheet</button></div></form>
    </div>
    {timesheets.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Worker</th><th>Activity</th><th>Farm / cycle</th><th>Hours</th><th>Cost</th><th>Status</th><th></th></tr></thead><tbody>{timesheets.map(t=>{const cost=Number(t.hours)*Number(t.hourlyRate);return <tr key={t.id}><td>{safeDate(t.workDate)}</td><td><b>{t.worker.name}</b><div className="muted" style={{fontSize:12}}>{t.worker.jobTitle||""}</div></td><td>{t.activity}</td><td>{t.farm?.name||"Shared"}<div className="muted" style={{fontSize:12}}>{t.cycle?.name||""}</div></td><td>{formatNumber(t.hours,2)}</td><td>{formatMoney(cost,ctx.tenant.currency)}</td><td><span className={`status ${t.status==="SUBMITTED"?"neutral":t.status==="REJECTED"?"warn":""}`}>{t.status}</span></td><td>{t.status==="SUBMITTED"?<form action={updateTimesheetStatusAction}><input type="hidden" name="id" value={t.id}/><input type="hidden" name="status" value="APPROVED"/><button className="button secondary small">Approve</button></form>:null}</td></tr>})}</tbody></table></div>:<div className="card"><EmptyState title="No labour records" text="Add workers and record their hours against farms or production cycles."/></div>}
  </>;
}
