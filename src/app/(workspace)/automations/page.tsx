import { BellRing, CheckCheck, Play, Workflow, Zap } from "lucide-react";
import { createAutomationRuleAction, markNotificationReadAction, runAutomationRulesAction } from "@/app/v03-actions";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";
import { MetricCard } from "@/components/metric-card";
import { NotificationDeliveryPanel } from "@/components/notification-delivery-panel";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";
import { humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Automations" };

const triggers = ["LOW_STOCK", "TASK_OVERDUE", "SCOUTING_HIGH", "EQUIPMENT_SERVICE_DUE"] as const;
const severities = ["INFO", "WARNING", "CRITICAL"] as const;
const severityTone = (severity: string) => severity === "CRITICAL" ? "danger" : severity === "WARNING" ? "warn" : "neutral";

export default async function AutomationsPage() {
  const ctx=await tenantContext("farm.view");
  const [rules,notifications]=await Promise.all([
    db.automationRule.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:"desc"}}),
    db.notification.findMany({where:{tenantId:ctx.tenantId},orderBy:{createdAt:"desc"},take:150}),
  ]);
  const unread=notifications.filter(n=>!n.readAt).length;
  const critical=notifications.filter(n=>!n.readAt&&n.severity==="CRITICAL").length;
  return <><PageHeader eyebrow="Rules & alerts" title="Automations" description="Turn farm conditions into alerts, so managers don't have to check every module by hand." action={<ActionForm action={runAutomationRulesAction}><button className="button"><Play size={16}/> Run rules now</button></ActionForm>}/>
    <section className="metrics"><MetricCard label="Active rules" value={String(rules.filter(r=>r.active).length)} hint={String(rules.length)+" total"} icon={<Workflow size={16}/>}/><MetricCard label="Unread alerts" value={String(unread)} hint={String(critical)+" critical"} icon={<BellRing size={16}/>}/><MetricCard label="Alerts generated" value={String(notifications.length)} hint="Latest 150 loaded" icon={<BellRing size={16}/>}/><MetricCard label="Trigger types" value={String(new Set(rules.map(r=>r.trigger)).size)} hint="Conditions being watched" icon={<Zap size={16}/>}/></section>
    <FormDetails title="Create automation rule" hint="Rules run when you press “Run rules now”." open={!rules.length}>
      <ActionForm action={createAutomationRuleAction} success="Rule created"><div className="form-grid"><div className="field span-2"><label>Rule name</label><input name="name" required placeholder="Alert when stock falls below reorder"/></div><div className="field"><label>Trigger</label><select name="trigger" defaultValue="LOW_STOCK">{triggers.map(t=><option key={t} value={t}>{humanize(t)}</option>)}</select></div><div className="field"><label>Severity</label><select name="severity" defaultValue="WARNING">{severities.map(s=><option key={s} value={s}>{humanize(s)}</option>)}</select></div><div className="field"><label>Threshold override</label><input name="threshold" type="number" min="0" step="0.001" placeholder="Optional"/></div></div><div className="form-actions"><button className="button">Create rule</button></div></ActionForm>
    </FormDetails>
    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Automation rules</h2></div>{rules.length?<div className="table-wrap"><table><thead><tr><th>Rule</th><th>Trigger</th><th>Severity</th><th>Status</th></tr></thead><tbody>{rules.map(r=><tr key={r.id}><td><b>{r.name}</b><div className="sub">{r.threshold!=null?"Threshold "+String(r.threshold):"Uses the record's own threshold"}</div></td><td>{humanize(r.trigger)}</td><td><span className={"status "+severityTone(r.severity)}>{humanize(r.severity)}</span></td><td><span className={"status "+(r.active?"":"neutral")}>{r.active?"Active":"Paused"}</span></td></tr>)}</tbody></table></div>:<EmptyState title="No automation rules" text="Create a rule above to start flagging problems automatically." icon={<Workflow size={20}/>}/>}</div>
      <div className="card"><div className="card-head"><div><h2>Notifications</h2><div className="card-sub">{unread} unread</div></div></div>{notifications.length?<div className="alert-list">{notifications.map(n=><div className={"alert"+(n.readAt?" ok":"")} key={n.id} style={n.readAt?{opacity:.8}:undefined}><BellRing size={16} color={n.severity==="CRITICAL"?"var(--danger)":"var(--brand)"}/><div style={{flex:1}}><b>{n.title}</b><small>{n.body} · {safeDate(n.createdAt)}</small></div>{!n.readAt?<ActionForm action={markNotificationReadAction}><input type="hidden" name="id" value={n.id}/><button className="button secondary small">Mark read</button></ActionForm>:<CheckCheck size={16} color="var(--brand)"/>}</div>)}</div>:<EmptyState title="No notifications" text="Run active rules to check current farm conditions." icon={<BellRing size={20}/>}/>}</div>
    </div>
    <NotificationDeliveryPanel tenantId={ctx.tenantId}/>
  </>;
}
