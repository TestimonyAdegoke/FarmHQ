import "server-only";

import { db } from "@/lib/db";

export type SpatialMatch = {
  id: string;
  name: string;
  farmId: string;
  farmName: string;
  areaHa: number | null;
  source: "postgis" | "geojson";
};

function pointInRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > latitude !== yj > latitude
      && longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export async function locateProductionUnits(tenantId: string, latitude: number, longitude: number): Promise<SpatialMatch[]> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{
      id: string;
      name: string;
      farmId: string;
      farmName: string;
      areaHa: number | null;
    }>>(
      `SELECT u."id", u."name", u."farmId", f."name" AS "farmName",
        CASE WHEN u."geom" IS NULL THEN NULL ELSE ST_Area(u."geom"::geography) / 10000.0 END AS "areaHa"
       FROM "ProductionUnit" u
       JOIN "Farm" f ON f."id" = u."farmId"
       WHERE u."tenantId" = $1
         AND u."active" = true
         AND u."geom" IS NOT NULL
         AND ST_Covers(u."geom", ST_SetSRID(ST_MakePoint($2, $3), 4326))
       ORDER BY ST_Area(u."geom"::geography) ASC
       LIMIT 10`,
      tenantId,
      longitude,
      latitude,
    );
    return rows.map((row) => ({ ...row, areaHa: row.areaHa == null ? null : Number(row.areaHa), source: "postgis" as const }));
  } catch {
    const units = await db.productionUnit.findMany({
      where: { tenantId, active: true, geometryGeoJson: { not: undefined } },
      include: { farm: true },
    });
    return units.flatMap((unit) => {
      const geometry = unit.geometryGeoJson as { type?: string; coordinates?: unknown } | null;
      if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return [];
      const ring = geometry.coordinates[0];
      if (!Array.isArray(ring)) return [];
      const normalized = ring.filter((point): point is number[] =>
        Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)
      );
      if (!pointInRing(longitude, latitude, normalized)) return [];
      return [{
        id: unit.id,
        name: unit.name,
        farmId: unit.farmId,
        farmName: unit.farm.name,
        areaHa: unit.areaHa == null ? null : Number(unit.areaHa),
        source: "geojson" as const,
      }];
    });
  }
}

export async function postgisStatus() {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ version: string }>>('SELECT PostGIS_Version() AS "version"');
    return { available: true, version: rows[0]?.version || "available" };
  } catch {
    return { available: false, version: null };
  }
}
