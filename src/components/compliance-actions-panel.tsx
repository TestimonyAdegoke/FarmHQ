import { CheckSquare, Plus } from "lucide-react";
import { createComplianceActionAction, updateComplianceActionStatusAction } from "@/app/v04-ops-actions";
import { db } from "@/lib/db";
import { safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export async function ComplianceActionsPanel({ tenantId, records }:{
  tenantId:string;
  records:{id:string;title:string}[];
}) {
  const [actions,memberships] = await Promise.all([
    db.complianceAction.findMany({where:{tenantId},orderBy:[{dueAt:"asc"},{createdAt:"desc"}],take:100}),
    db.membership.findMany({where:{tenantId},include:{user:true},orderBy:{user:{name:"asc"}}}),
  ]);
  const recordNames=new Map(records.map(record=>[record.id,record.title]));
  const memberNames=new Map(memberships.map(item=>[item.userId,item.user.name]));
  const open=actions.filter(item=>["OPEN","IN_PROGRESS"].includes(item.status)).length;

  return <div style={{display:"grid",gap:20,marginBottom:20}}>
    <ActionForm className="form-card" action={createComplianceActionAction}>
      <div className="card-head"><div><h3>Remediation action</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Turn an audit, inspection or incident finding into assigned corrective work.</div></div><Plus size={19}/></div>
      <div className="form-grid">
        <div className="field"><label>Compliance record</label><select name="complianceRecordId" required defaultValue=""><option value="" disabled>Select record</option>{records.map(record=><option key={record.id} value={record.id}>{record.title}</option>)}</select></div>
        <div className="field"><label>Action</label><input name="title" required placeholder="Close pesticide store ventilation finding"/></div>
        <div className="field"><label>Assignee</label><select name="assignedToId" defaultValue=""><option value="">Unassigned</option>{memberships.map(item=><option key={item.userId} value={item.userId}>{item.user.name}</option>)}</select></div>
        <div className="field"><label>Due date</label><input name="dueAt" type="date"/></div>
      </div>
      <div className="form-actions"><button className="button" disabled={!records.length}>Create corrective action</button></div>
    </ActionForm>

    {actions.length?<div className="card"><div className="card-head"><div><h2>Corrective actions</h2><div className="muted" style={{fontSize:13,marginTop:4}}>{open} currently open or in progress</div></div><CheckSquare size={19}/></div><div className="table-wrap"><table><thead><tr><th>Action</th><th>Finding</th><th>Assignee</th><th>Due</th><th>Status</th><th>Update</th></tr></thead><tbody>{actions.map(action=><tr key={action.id}><td><b>{action.title}</b>{action.completionNotes?<div className="muted" style={{fontSize:12}}>{action.completionNotes}</div>:null}</td><td>{recordNames.get(action.complianceRecordId)||"Compliance record"}</td><td>{action.assignedToId?memberNames.get(action.assignedToId)||"Member":"Unassigned"}</td><td>{safeDate(action.dueAt)}</td><td><span className={"status "+(["OPEN","IN_PROGRESS"].includes(action.status)?"warn":"")}>{action.status.replaceAll("_"," ")}</span></td><td>{["COMPLETED","WAIVED"].includes(action.status)?<span className="muted">{safeDate(action.completedAt)}</span>:<ActionForm action={updateComplianceActionStatusAction} style={{display:"flex",gap:6,alignItems:"center"}}><input type="hidden" name="id" value={action.id}/><select name="status" defaultValue={action.status}><option>OPEN</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>WAIVED</option></select><input name="completionNotes" placeholder="Note" style={{minWidth:110}}/><button className="button secondary small">Save</button></ActionForm>}</td></tr>)}</tbody></table></div></div>:null}
  </div>;
}
