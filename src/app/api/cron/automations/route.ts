import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runTenantAutomationRules } from "@/lib/automation-engine";
import { runNotificationDeliveries } from "@/lib/notification-delivery";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [ruleTenants, endpointTenants] = await Promise.all([
    db.automationRule.findMany({ where: { active: true }, select: { tenantId: true }, distinct: ["tenantId"] }),
    db.notificationEndpoint.findMany({ where: { active: true }, select: { tenantId: true }, distinct: ["tenantId"] }),
  ]);
  const tenantIds = [...new Set([...ruleTenants.map(item=>item.tenantId), ...endpointTenants.map(item=>item.tenantId)])];

  let created = 0;
  let rules = 0;
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  for (const tenantId of tenantIds) {
    const ruleResult = await runTenantAutomationRules(tenantId);
    created += ruleResult.notificationsCreated;
    rules += ruleResult.rules;
    const deliveryResult = await runNotificationDeliveries(tenantId);
    attempted += deliveryResult.attempted;
    sent += deliveryResult.sent;
    failed += deliveryResult.failed;
  }

  return NextResponse.json({
    ok: true,
    tenants: tenantIds.length,
    rules,
    notificationsCreated: created,
    deliveries: { attempted, sent, failed },
    ranAt: new Date().toISOString(),
  });
}
