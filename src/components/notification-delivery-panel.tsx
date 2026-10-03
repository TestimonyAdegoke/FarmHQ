import { Play, RadioTower, Send, ToggleLeft } from "lucide-react";
import { createNotificationEndpointAction, deliverNotificationsAction, toggleNotificationEndpointAction } from "@/app/v04-ops-actions";
import { db } from "@/lib/db";
import { humanize, safeDate } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { FormDetails } from "@/components/form-details";

const severities = ["INFO", "WARNING", "CRITICAL"] as const;
const deliveryTone = (status: string) => status === "FAILED" ? "danger" : status === "SENT" ? "" : "warn";

export async function NotificationDeliveryPanel({ tenantId }:{tenantId:string}) {
  const [endpoints,deliveries] = await Promise.all([
    db.notificationEndpoint.findMany({where:{tenantId},orderBy:{createdAt:"desc"}}),
    db.notificationDelivery.findMany({where:{tenantId},include:{endpoint:true},orderBy:{createdAt:"desc"},take:100}),
  ]);
  const notificationIds=[...new Set(deliveries.map(item=>item.notificationId))];
  const notifications=notificationIds.length?await db.notification.findMany({where:{tenantId,id:{in:notificationIds}},select:{id:true,title:true,severity:true}}):[];
  const notificationMap=new Map(notifications.map(item=>[item.id,item]));
  const sent=deliveries.filter(item=>item.status==="SENT").length;
  const failed=deliveries.filter(item=>item.status==="FAILED").length;

  return <>
    <div className="grid-main-side">
      <div className="stack">
        <div className="card"><div className="card-head"><div><h2>Webhook endpoints</h2><div className="card-sub">HTTPS addresses that receive FarmHQ alerts.</div></div></div>
          {endpoints.length?<div className="table-wrap"><table><thead><tr><th>Name</th><th>Minimum severity</th><th>Target</th><th>Status</th></tr></thead><tbody>{endpoints.map(endpoint=><tr key={endpoint.id}><td><b>{endpoint.name}</b></td><td>{humanize(endpoint.minimumSeverity)}</td><td><span className="sub">{endpoint.url}</span></td><td><ActionForm action={toggleNotificationEndpointAction}><input type="hidden" name="id" value={endpoint.id}/><button className="button secondary small"><ToggleLeft size={15}/> {endpoint.active?"Active":"Disabled"}</button></ActionForm></td></tr>)}</tbody></table></div>:<EmptyState title="No webhook endpoints" text="Add an endpoint to send alerts to another system." icon={<RadioTower size={20}/>}/>}
        </div>
        <FormDetails title="Add webhook endpoint" hint="HTTPS endpoints receive alerts at or above the chosen severity." open={!endpoints.length}>
          <ActionForm action={createNotificationEndpointAction} success="Endpoint added">
            <div className="form-grid two">
              <div className="field"><label>Name</label><input name="name" required placeholder="Operations webhook"/></div>
              <div className="field"><label>Minimum severity</label><select name="minimumSeverity" defaultValue="WARNING">{severities.map(s=><option key={s} value={s}>{humanize(s)}</option>)}</select></div>
              <div className="field span-2"><label>HTTPS URL</label><input name="url" required type="url" placeholder="https://hooks.example.com/..."/></div>
            </div>
            <div className="form-actions"><button className="button"><Send size={16}/> Add endpoint</button></div>
          </ActionForm>
        </FormDetails>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Webhook delivery</h2><div className="card-sub">Delivery attempts are logged separately from in-app alerts.</div></div></div>
        <dl className="kv"><dt>Sent</dt><dd>{sent}</dd><dt>Failed</dt><dd>{failed?<span className="status danger">{failed}</span>:0}</dd><dt>Active endpoints</dt><dd>{endpoints.filter(item=>item.active).length}</dd></dl>
        <div className="form-actions"><ActionForm action={deliverNotificationsAction}><button className="button"><Play size={16}/> Deliver pending alerts</button></ActionForm></div>
        <p className="sub">When NOTIFICATION_WEBHOOK_SECRET is set, outgoing payloads carry an HMAC-SHA256 signature header.</p>
      </div>
    </div>

    {deliveries.length?<div className="card"><div className="card-head"><h2>Recent deliveries</h2></div><div className="table-wrap"><table><thead><tr><th>Notification</th><th>Endpoint</th><th>Status</th><th className="text-right">Attempts</th><th>Last attempt</th><th>Result</th></tr></thead><tbody>{deliveries.map(delivery=>{const notification=notificationMap.get(delivery.notificationId);return <tr key={delivery.id}><td><b>{notification?.title||delivery.notificationId}</b><div className="sub">{humanize(notification?.severity)}</div></td><td>{delivery.endpoint.name}</td><td><span className={"status "+deliveryTone(delivery.status)}>{humanize(delivery.status)}</span></td><td className="text-right">{delivery.attempts}</td><td>{safeDate(delivery.lastAttemptAt)}</td><td>{delivery.responseCode?"HTTP "+String(delivery.responseCode):delivery.error||"—"}</td></tr>})}</tbody></table></div></div>:null}
  </>;
}
