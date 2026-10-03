import { Play, RadioTower, Send, ToggleLeft } from "lucide-react";
import { createNotificationEndpointAction, deliverNotificationsAction, toggleNotificationEndpointAction } from "@/app/v04-ops-actions";
import { db } from "@/lib/db";
import { safeDate } from "@/lib/utils";

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

  return <div style={{display:"grid",gap:20,marginTop:20}}>
    <div className="grid-2">
      <form className="form-card" action={createNotificationEndpointAction} style={{margin:0}}>
        <div className="card-head"><div><h3>Add webhook endpoint</h3><div className="muted" style={{fontSize:13,marginTop:4}}>HTTPS endpoints receive eligible FarmHQ notification payloads.</div></div><RadioTower size={19}/></div>
        <div className="form-grid two">
          <div className="field"><label>Name</label><input name="name" required placeholder="Operations webhook"/></div>
          <div className="field"><label>Minimum severity</label><select name="minimumSeverity" defaultValue="WARNING"><option>INFO</option><option>WARNING</option><option>CRITICAL</option></select></div>
          <div className="field span-2"><label>HTTPS URL</label><input name="url" required type="url" placeholder="https://hooks.example.com/..."/></div>
        </div>
        <div className="form-actions"><button className="button"><Send size={16}/> Add endpoint</button></div>
      </form>

      <div className="card">
        <div className="card-head"><div><h3>Delivery worker</h3><div className="muted" style={{fontSize:13,marginTop:4}}>Webhook attempts are audited separately from in-app notification state.</div></div><Send size={19}/></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}><span className="status">{sent} sent</span><span className={"status "+(failed?"warn":"neutral")}>{failed} failed</span><span className="status neutral">{endpoints.filter(item=>item.active).length} active endpoints</span></div>
        <form action={deliverNotificationsAction}><button className="button"><Play size={16}/> Deliver pending notifications</button></form>
        <div className="muted" style={{fontSize:12,marginTop:12}}>When NOTIFICATION_WEBHOOK_SECRET is configured, outgoing payloads include an HMAC-SHA256 signature header.</div>
      </div>
    </div>

    {endpoints.length?<div className="card"><div className="card-head"><h2>Delivery endpoints</h2></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Minimum severity</th><th>Target</th><th>Status</th></tr></thead><tbody>{endpoints.map(endpoint=><tr key={endpoint.id}><td><b>{endpoint.name}</b></td><td>{endpoint.minimumSeverity}</td><td><span className="muted" style={{fontSize:12}}>{endpoint.url}</span></td><td><form action={toggleNotificationEndpointAction}><input type="hidden" name="id" value={endpoint.id}/><button className="button secondary small"><ToggleLeft size={15}/> {endpoint.active?"Active":"Disabled"}</button></form></td></tr>)}</tbody></table></div></div>:null}

    {deliveries.length?<div className="card"><div className="card-head"><h2>Recent deliveries</h2></div><div className="table-wrap"><table><thead><tr><th>Notification</th><th>Endpoint</th><th>Status</th><th>Attempts</th><th>Last attempt</th><th>Result</th></tr></thead><tbody>{deliveries.map(delivery=>{const notification=notificationMap.get(delivery.notificationId);return <tr key={delivery.id}><td><b>{notification?.title||delivery.notificationId}</b><div className="muted" style={{fontSize:12}}>{notification?.severity||""}</div></td><td>{delivery.endpoint.name}</td><td><span className={"status "+(delivery.status==="FAILED"?"warn":"")}>{delivery.status}</span></td><td>{delivery.attempts}</td><td>{safeDate(delivery.lastAttemptAt)}</td><td>{delivery.responseCode?"HTTP "+String(delivery.responseCode):delivery.error||"—"}</td></tr>})}</tbody></table></div></div>:null}
  </div>;
}
