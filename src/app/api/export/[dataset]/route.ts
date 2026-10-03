import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { datasets, toCsv } from "@/lib/exports";
import { isScoped, memberCan } from "@/lib/farm-scope";

export const runtime = "nodejs";

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
}

export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await db.membership.findUnique({ where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } }, include: { tenant: { select: { slug: true } } } });
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dataset } = await params;
  const definition = datasets[dataset];
  if (!definition) return NextResponse.json({ error: "Unknown dataset" }, { status: 404 });
  if (!memberCan(membership, definition.permission) || (definition.organisationWide && isScoped(membership.farmScope))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const range = { from: parseDate(url.searchParams.get("from")), to: parseDate(url.searchParams.get("to"), true) };
  const rows = await definition.load(session.tenantId, range, membership.farmScope);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${membership.tenant.slug}-${dataset}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
