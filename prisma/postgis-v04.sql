CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "ProductionUnit"
  ADD COLUMN IF NOT EXISTS "geom" geometry(Polygon, 4326);

CREATE OR REPLACE FUNCTION farmhq_sync_production_unit_geom()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."geometryGeoJson" IS NULL THEN
    NEW."geom" := NULL;
  ELSE
    NEW."geom" := ST_SetSRID(
      ST_GeomFromGeoJSON(NEW."geometryGeoJson"::text),
      4326
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farmhq_sync_production_unit_geom ON "ProductionUnit";
CREATE TRIGGER trg_farmhq_sync_production_unit_geom
BEFORE INSERT OR UPDATE OF "geometryGeoJson"
ON "ProductionUnit"
FOR EACH ROW
EXECUTE FUNCTION farmhq_sync_production_unit_geom();

UPDATE "ProductionUnit"
SET "geom" = ST_SetSRID(ST_GeomFromGeoJSON("geometryGeoJson"::text), 4326)
WHERE "geometryGeoJson" IS NOT NULL
  AND "geom" IS NULL;

CREATE INDEX IF NOT EXISTS production_unit_geom_gist
  ON "ProductionUnit"
  USING GIST ("geom");
