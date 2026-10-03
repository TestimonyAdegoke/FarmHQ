import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessFarm } from "@/lib/farm-scope";
import { locateProductionUnits, postgisStatus } from "@/lib/spatial";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  const membership = await db.membership.findUnique({ where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } }, select: { id: true, farmScope: true } });
  if (!membership) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const url = new URL(request.url);
  const parsed = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
  }).safeParse({
    latitude: url.searchParams.get("latitude"),
    longitude: url.searchParams.get("longitude"),
  });
  if (!parsed.success) return NextResponse.json({ ok:false, error:"Invalid coordinates" }, { status:400 });

  const [matches, spatial] = await Promise.all([
    locateProductionUnits(session.tenantId, parsed.data.latitude, parsed.data.longitude),
    postgisStatus(),
  ]);
  return NextResponse.json({ ok:true, matches: matches.filter(m => canAccessFarm(membership.farmScope, m.farmId)), spatial });
}
