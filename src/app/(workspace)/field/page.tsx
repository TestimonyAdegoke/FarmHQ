import { PageHeader } from "@/components/page-header";
import { OfflineFieldClient } from "@/components/offline-field-client";
import { db } from "@/lib/db";
import { tenantContext } from "@/lib/tenant";

export const metadata = { title: "Field App" };
export const dynamic = "force-dynamic";

export default async function FieldPage() {
  const ctx = await tenantContext();
  const [farms, units, cycles, tasks, activities] = await Promise.all([
    db.farm.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id:true,name:true }, orderBy: { name:"asc" } }),
    db.productionUnit.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id:true,name:true,farmId:true }, orderBy: { name:"asc" } }),
    db.productionCycle.findMany({ where: { tenantId: ctx.tenantId, status: { in:["PLANNED","ACTIVE","PAUSED"] } }, select: { id:true,name:true,farmId:true }, orderBy: { name:"asc" } }),
    db.task.findMany({ where: { tenantId: ctx.tenantId, status: { in:["TODO","IN_PROGRESS","BLOCKED"] } }, select: { id:true,title:true,farmId:true,status:true }, orderBy: [{ priority:"desc" },{ dueAt:"asc" }], take:30 }),
    db.cropActivity.findMany({ where: { tenantId: ctx.tenantId, status: { in:["PLANNED","IN_PROGRESS"] } }, select: { id:true,title:true,farmId:true,status:true }, orderBy: { plannedAt:"asc" }, take:30 }),
  ]);
  return <><PageHeader eyebrow="Offline-first operations" title="Field app" description="Capture scouting, complete work and use GPS in poor-connectivity environments. Changes are stored locally first, then replayed idempotently when the connection returns."/><OfflineFieldClient farms={farms} units={units} cycles={cycles} tasks={tasks} activities={activities}/></>;
}
