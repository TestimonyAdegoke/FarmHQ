import type { ReactNode } from "react";
import { createComplianceActionAction, updateComplianceActionStatusAction } from "@/app/v04-ops-actions";
import { db } from "@/lib/db";
import { humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";
import { FormDetails } from "@/components/form-details";

const actionStatuses = ["OPEN", "IN_PROGRESS", "COMPLETED", "WAIVED"] as const;
const actionTone = (status: string) => status === "OPEN" ? "warn" : status === "IN_PROGRESS" ? "info" : status === "WAIVED" ? "neutral" : "";

/** Corrective actions: a create drawer (laid out beside any `children` drawers) followed by the action list. */
export async function ComplianceActionsPanel({ tenantId, records, children }:{
  tenantId:string;
  records:{id:string;title:string}[];
  children?:ReactNode;
}) {
  const [actions,memberships] = await Promise.all([
    db.complianceAction.findMany({where:{tenantId},orderBy:[{dueAt:"asc"},{createdAt:"desc"}],take:100}),
    db.membership.findMany({where:{tenantId},include:{user:true},orderBy:{user:{name:"asc"}}}),
  ]);
  const recordNames=new Map(records.map(record=>[record.id,record.title]));
  const memberNames=new Map(memberships.map(item=>[item.userId,item.user.name]));
  const open=actions.filter(item=>["OPEN","IN_PROGRESS"].includes(item.status)).length;

  return <>
    <div className="drawers">
      {children}
      <FormDetails title="Add corrective action" hint="Turn an audit, inspection or incident finding into assigned work.">
        <ActionForm action={createComplianceActionAction} success="Corrective action created">
          <div className="form-grid two">
            <div className="field span-2"><label>Compliance record</label><select name="complianceRecordId" required defaultValue=""><option value="" disabled>Select record</option>{records.map(record=><option key={record.id} value={record.id}>{record.title}</option>)}</select></div>
            <div className="field span-2"><label>Action</label><input name="title" required placeholder="Close pesticide store ventilation finding"/></div>
            <div className="field"><label>Assignee</label><select name="assignedToId" defaultValue=""><option value="">Unassigned</option>{memberships.map(item=><option key={item.userId} value={item.userId}>{item.user.name}</option>)}</select></div>
            <div className="field"><label>Due date</label><input name="dueAt" type="date"/></div>
          </div>
          {!records.length?<div className="sub">Add a compliance record first.</div>:null}
          <div className="form-actions"><button className="button" disabled={!records.length}>Create corrective action</button></div>
        </ActionForm>
      </FormDetails>
    </div>

    {actions.length?<div className="card"><div className="card-head"><div><h2>Corrective actions</h2><div className="card-sub">{open} open or in progress</div></div></div><div className="table-wrap"><table><thead><tr><th>Action</th><th>Finding</th><th>Assignee</th><th>Due</th><th>Status</th><th>Update</th></tr></thead><tbody>{actions.map(action=><tr key={action.id}><td><b>{action.title}</b>{action.completionNotes?<div className="sub">{action.completionNotes}</div>:null}</td><td>{recordNames.get(action.complianceRecordId)||"Compliance record"}</td><td>{action.assignedToId?memberNames.get(action.assignedToId)||"Member":"Unassigned"}</td><td>{safeDate(action.dueAt)}</td><td><span className={"status "+actionTone(action.status)}>{humanize(action.status)}</span></td><td>{["COMPLETED","WAIVED"].includes(action.status)?<span className="muted">{safeDate(action.completedAt)}</span>:<div className="inline-actions"><ActionForm action={updateComplianceActionStatusAction}><input type="hidden" name="id" value={action.id}/><select name="status" defaultValue={action.status} aria-label="Status">{actionStatuses.map(s=><option key={s} value={s}>{humanize(s)}</option>)}</select><input name="completionNotes" placeholder="Note" aria-label="Completion note"/><button className="button secondary small">Save</button></ActionForm></div>}</td></tr>)}</tbody></table></div></div>:null}
  </>;
}
