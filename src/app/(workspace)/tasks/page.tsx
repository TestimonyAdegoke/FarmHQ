import Link from "next/link";
import { createTaskAction, updateTaskStatusAction } from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Work & Tasks" };

const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const statuses = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"];
const priorityTone = (p: string) => p === "URGENT" ? "danger" : p === "HIGH" ? "warn" : "neutral";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await tenantContext("production.view");
  const view = (await searchParams).view === "all" ? "all" : (await searchParams).view === "done" ? "done" : "mine";
  const [farms, cycles, members, tasks] = await Promise.all([
    db.farm.findMany({where:{tenantId:ctx.tenantId,active:true,...ctx.scope.farms},orderBy:{name:"asc"}}),
    db.productionCycle.findMany({where:{tenantId:ctx.tenantId,status:{in:["PLANNED","ACTIVE"]},...ctx.scope.byFarm},orderBy:{name:"asc"}}),
    db.membership.findMany({where:{tenantId:ctx.tenantId},include:{user:true},orderBy:{user:{name:"asc"}}}),
    db.task.findMany({where:{tenantId:ctx.tenantId,...ctx.scope.byFarm,...(view==="mine"?{assignedToId:ctx.userId,status:{in:["TODO","IN_PROGRESS","BLOCKED"]}}:view==="done"?{status:{in:["DONE","CANCELLED"]}}:{status:{in:["TODO","IN_PROGRESS","BLOCKED"]}})},take:300,include:{farm:true,cycle:true,assignedTo:true,createdBy:true},orderBy:[{status:"asc"},{dueAt:"asc"},{createdAt:"desc"}]}),
  ]);
  return <><PageHeader eyebrow="Execution" title="Work & tasks" description="Assign, prioritize and close operational work across farms and production cycles."/>
    <FormDetails title="Create task" hint="Farm-wide, or tied to a production cycle." open={!tasks.length && view !== "done"}>
      <ActionForm action={createTaskAction} success="Task created">
        <div className="form-grid">
          <div className="field span-2"><label>Task</label><input name="title" required placeholder="Apply NPK to North Field"/></div>
          <div className="field"><label>Farm</label><select name="farmId" defaultValue="">{ctx.scope.limited ? null : <option value="">All farms</option>}{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
          <div className="field"><label>Production cycle</label><select name="cycleId" defaultValue=""><option value="">None</option>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Priority</label><select name="priority" defaultValue="MEDIUM">{priorities.map(p=><option key={p} value={p}>{humanize(p)}</option>)}</select></div>
          <div className="field"><label>Due date</label><input name="dueAt" type="date"/></div>
          <div className="field span-2"><label>Assign to</label><select name="assignedToId" defaultValue=""><option value="">Unassigned</option>{members.map(m=><option key={m.id} value={m.userId}>{m.user.name} · {humanize(m.role)}</option>)}</select></div>
          <div className="field span-full"><label>Description</label><textarea name="description"/></div>
        </div>
        <div className="form-actions"><button className="button">Create task</button></div>
      </ActionForm>
    </FormDetails>
    <div className="tabs"><Link href="/tasks" className={view==="mine"?"active":""}>My open tasks</Link><Link href="/tasks?view=all" className={view==="all"?"active":""}>All open tasks</Link><Link href="/tasks?view=done" className={view==="done"?"active":""}>Done</Link></div>
    {tasks.length ? <div className="table-wrap"><table><thead><tr><th>Task</th><th>Context</th><th>Assigned to</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}>
      <td><b>{t.title}</b>{t.description?<div className="sub" style={{maxWidth:320}}>{t.description}</div>:null}</td>
      <td>{t.farm?.name||"Organization"}<div className="sub">{t.cycle?.name||""}</div></td>
      <td>{t.assignedTo?.name||<span className="muted">Unassigned</span>}</td>
      <td className="nowrap">{safeDate(t.dueAt)}</td>
      <td><span className={`status ${priorityTone(t.priority)}`}>{humanize(t.priority)}</span></td>
      <td><ActionForm action={updateTaskStatusAction}><input type="hidden" name="id" value={t.id}/><div className="inline-actions"><select name="status" defaultValue={t.status} aria-label={`Status of ${t.title}`}>{statuses.map(s=><option key={s} value={s}>{humanize(s)}</option>)}</select><button className="button secondary small">Update</button></div></ActionForm></td>
    </tr>)}</tbody></table></div> : <div className="card"><EmptyState title={view==="done"?"Nothing finished yet":view==="mine"?"No open tasks for you":"No open tasks"} text={view==="done"?"Completed and cancelled tasks appear here.":"Create a task above and assign it to someone on the team."}/></div>}
  </>;
}
