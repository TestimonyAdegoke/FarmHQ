import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "farmhq", database: "up", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, service: "farmhq", database: "down", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
