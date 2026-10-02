import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runTenantAutomationRules } from "@/lib/automation-engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await db.automationRule.findMany({
    where: { active: true },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });

  let created = 0;
  let rules = 0;
  for (const item of tenants) {
    const result = await runTenantAutomationRules(item.tenantId);
    created += result.notificationsCreated;
    rules += result.rules;
  }

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    rules,
    notificationsCreated: created,
    ranAt: new Date().toISOString(),
  });
}
