import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const expectedTables = [
  "User",
  "Tenant",
  "Membership",
  "Farm",
  "ProductionUnit",
  "ProductionCycle",
  "InventoryTransaction",
  "CropActivity",
  "StockCountSession",
  "TraceLot",
  "IotDevice",
  "MoneyAccount",
  "Invoice",
  "PayRun",
] as const;

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;

    const tableNames = expectedTables.map((name) => "'" + name.replaceAll("'", "''") + "'").join(",");
    const schemaRows = await db.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS "count"
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN (${tableNames})`
    );
    const schemaUp = Number(schemaRows[0]?.count || 0) === expectedTables.length;

    let postgisUp = false;
    try {
      const spatial = await db.$queryRawUnsafe<Array<{ version: string }>>('SELECT PostGIS_Version() AS "version"');
      postgisUp = Boolean(spatial[0]?.version);
    } catch {
      postgisUp = false;
    }

    const ok = schemaUp && postgisUp;
    return NextResponse.json(
      {
        ok,
        service: "farmhq",
        database: "up",
        schema: schemaUp ? "up" : "degraded",
        spatial: postgisUp ? "up" : "down",
        timestamp: new Date().toISOString(),
      },
      { status: ok ? 200 : 503 }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "farmhq",
        database: "down",
        schema: "unknown",
        spatial: "unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
