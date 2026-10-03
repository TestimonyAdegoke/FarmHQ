import Link from "next/link";
import { Plus } from "lucide-react";
import { createTaskAction, updateTaskStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Work & Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await tenantContext("production.view");
  const view = (await searchParams).view === "all" ? "all" : (await searchParams).view === "done" ? "done" : "mine";
  const [farms, cycles, members, tasks] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true},orderBy:{name:"asc"}}),
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId,status:{in:["PLANNED","ACTIVE"]}},orderBy:{name:"asc"}}),
    db.membership.findMany({where:{tenantId:ctx.tenantId},include:{user:true},orderBy:{user:{name:"asc"}}}),
    db.task.findMany({where:{tenantId:ctx.tenantId,...(view==="mine"?{assignedToId:ctx.userId,status:{in:["TODO","IN_PROGRESS","BLOCKED"]}}:view==="done"?{status:{in:["DONE","CANCELLED"]}}:{status:{in:["TODO","IN_PROGRESS","BLOCKED"]}})},take:300,include:{farm:true,cycle:true,assignedTo:true,createdBy:true},orderBy:[{status:"asc"},{dueAt:"asc"},{createdAt:"desc"}]}),
  ]);
  return <><PageHeader eyebrow="Execution" title="Work & tasks" description="Assign, prioritize and close operational work across farms and production cycles."/>
    <ActionForm className="form-card" action={createTaskAction}><div className="card-head"><div><h3>Create work item</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Tasks can be farm-wide or attached to a production cycle.</div></div><Plus size={20}/></div><div className="form-grid"><div className="field span-2"><label>Task</label><input name="title" required placeholder="Apply NPK to North Field"/></div><div className="field"><label>Farm</label><select name="farmId" defaultValue=""><option value="">All farms</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div><div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">None</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Priority</label><select name="priority" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></div><div className="field"><label>Due date</label><input name="dueAt" type="date"/></div><div className="field span-2"><label>Assign to</label><select name="assignedToId" defaultValue=""><option value="">Unassigned</option>{members.map(m=><option key={m.id} value={m.userId}>{m.user.name} · {m.role.replaceAll("_"," ")}</option>)}</select></div><div className="field span-full"><label>Description</label><textarea name="description"/></div></div><div className="form-actions"><button className="button">Create task</button></div></ActionForm>
    <div className="tabs"><Link href="/tasks" className={view==="mine"?"active":""}>My open tasks</Link><Link href="/tasks?view=all" className={view==="all"?"active":""}>All open tasks</Link><Link href="/tasks?view=done" className={view==="done"?"active":""}>Done</Link></div>
    {tasks.length ? <div className="table-wrap"><table><thead><tr><th>Task</th><th>Context</th><th>Assigned to</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}><td><b>{t.title}</b>{t.description?<div className="muted" style={{fontSize:12,marginTop:4,maxWidth:320}}>{t.description}</div>:null}</td><td>{t.farm?.name||"Organization"}<div className="muted" style={{fontSize:12}}>{t.cycle?.name||""}</div></td><td>{t.assignedTo?.name||"Unassigned"}</td><td>{safeDate(t.dueAt)}</td><td><span className={`status ${["HIGH","URGENT"].includes(t.priority)?"warn":"neutral"}`}>{t.priority}</span></td><td><ActionForm action={updateTaskStatusAction}><input type="hidden" name="id" value={t.id}/><select name="status" defaultValue={t.status}><option>TODO</option><option>IN_PROGRESS</option><option>BLOCKED</option><option>DONE</option><option>CANCELLED</option></select><button className="button small" style={{marginTop:6,width:"100%"}}>Update</button></ActionForm></td></tr>)}</tbody></table></div> : <div className="card"><EmptyState title="No work items" text="Create the first operational task above."/></div>}
  </>;
}
