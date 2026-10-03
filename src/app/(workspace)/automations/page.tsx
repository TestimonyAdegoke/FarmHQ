import { BellRing, CheckCheck, Play, Plus, Workflow } from "lucide-react";
import { createAutomationRuleAction, markNotificationReadAction, runAutomationRulesAction } from "@/app/v03-actions";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { NotificationDeliveryPanel } from "@/components/notification-delivery-panel";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { safeDate } from "@/lib/utils";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const ctx=await tenantContext();
  const [rules,notifications]=await Promise.all([
    db.automationRule.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:"desc"}}),
    db.notification.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:"desc"},take:150}),
  ]);
  const unread=notifications.filter(n=>!n.readAt).length;
  const critical=notifications.filter(n=>!n.readAt&&n.severity==="CRITICAL").length;
  return <><PageHeader eyebrow="Rules & exceptions" title="Automations" description="Turn operational conditions into tenant-scoped alerts without requiring managers to manually check every module." action={<form action={runAutomationRulesAction}><button className="button"><Play size={16}/> Run rules now</button></form>}/>
    <section className="metrics"><MetricCard label="Active rules" value={String(rules.filter(r=>r.active).length)} hint={String(rules.length)+" total"} icon={<Workflow size={18}/>}/><MetricCard label="Unread alerts" value={String(unread)} hint={String(critical)+" critical"} icon={<BellRing size={18}/>}/><MetricCard label="Alerts generated" value={String(notifications.length)} hint="Latest 150 loaded" icon={<BellRing size={18}/>}/><MetricCard label="Trigger types" value={String(new Set(rules.map(r=>r.trigger)).size)} hint="Operational coverage" icon={<CheckCheck size={18}/>}/></section>
    <form className="form-card" action={createAutomationRuleAction}><div className="card-head"><div><h3>Create automation rule</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Rule evaluation currently runs on demand; this same evaluator is ready for a scheduled job or cron trigger.</div></div><Plus size={19}/></div><div className="form-grid"><div className="field span-2"><label>Rule name</label><input name="name" required placeholder="Alert when stock falls below reorder"/></div><div className="field"><label>Trigger</label><select name="trigger" defaultValue="LOW_STOCK"><option>LOW_STOCK</option><option>TASK_OVERDUE</option><option>SCOUTING_HIGH</option><option>EQUIPMENT_SERVICE_DUE</option></select></div><div className="field"><label>Severity</label><select name="severity" defaultValue="WARNING"><option>INFO</option><option>WARNING</option><option>CRITICAL</option></select></div><div className="field"><label>Threshold override</label><input name="threshold" type="number" min="0" step="0.001" placeholder="Optional"/></div></div><div className="form-actions"><button className="button">Create rule</button></div></form>
    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Automation rules</h2></div>{rules.length?<div className="table-wrap"><table><thead><tr><th>Rule</th><th>Trigger</th><th>Severity</th><th>Status</th></tr></thead><tbody>{rules.map(r=><tr key={r.id}><td><b>{r.name}</b><div className="muted" style={{fontSize:12}}>{r.threshold!=null?"threshold "+String(r.threshold):"uses record threshold / condition"}</div></td><td>{r.trigger.replaceAll("_"," ")}</td><td><span className={"status "+(r.severity==="CRITICAL"?"warn":"neutral")}>{r.severity}</span></td><td>{r.active?"ACTIVE":"PAUSED"}</td></tr>)}</tbody></table></div>:<EmptyState title="No automation rules" text="Create a rule above to start surfacing operational exceptions."/>}</div>
      <div className="card"><div className="card-head"><h2>Notifications</h2></div>{notifications.length?<div style={{display:"flex",flexDirection:"column",gap:10}}>{notifications.map(n=><div className="alert" key={n.id} style={{opacity:n.readAt?.8:1}}><BellRing size={18} color={n.severity==="CRITICAL"?"#b33939":"var(--brand)"}/><div style={{flex:1}}><b>{n.title}</b><small>{n.body} · {safeDate(n.createdAt)}</small></div>{!n.readAt?<form action={markNotificationReadAction}><input type="hidden" name="id" value={n.id}/><button className="button secondary small">Read</button></form>:<CheckCheck size={17} color="var(--brand)"/>}</div>)}</div>:<EmptyState title="No notifications" text="Run active rules to evaluate current farm conditions."/>}</div>
    </div>
    <NotificationDeliveryPanel tenantId={ctx.tenantId}/>
  </>;
}
