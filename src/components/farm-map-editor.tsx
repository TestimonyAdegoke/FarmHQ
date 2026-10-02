"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { Save, Trash2, Undo2 } from "lucide-react";
import { saveUnitGeometryAction } from "@/app/v03-actions";

type Coordinate = [number, number];

type Props = {
  unit: {
    id: string;
    name: string;
    geometryGeoJson: unknown;
    farm: { name: string; latitude: string | number | null; longitude: string | number | null };
  };
  otherBoundaries: { id: string; name: string; geometryGeoJson: unknown }[];
};

function polygonFromCoordinates(points: Coordinate[]) {
  if (points.length < 3) return null;
  const ring = [...points, points[0]];
  return { type: "Polygon" as const, coordinates: [ring] };
}

function polygonAreaHa(points: Coordinate[]) {
  if (points.length < 3) return 0;
  const earthRadius = 6378137;
  const ring = [...points, points[0]];
  let sum = 0;
  const rad = (value: number) => value * Math.PI / 180;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    sum += (rad(lon2) - rad(lon1)) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs(sum * earthRadius * earthRadius / 2) / 10000;
}

function extractPoints(value: unknown): Coordinate[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as { type?: string; coordinates?: unknown };
  if (candidate.type !== "Polygon" || !Array.isArray(candidate.coordinates)) return [];
  const ring = candidate.coordinates[0];
  if (!Array.isArray(ring)) return [];
  const points = ring
    .filter((point): point is number[] => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite))
    .map((point) => [Number(point[0]), Number(point[1])] as Coordinate);
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) points.pop();
  }
  return points;
}

export function FarmMapEditor({ unit, otherBoundaries }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [points, setPoints] = useState<Coordinate[]>(() => extractPoints(unit.geometryGeoJson));
  const [editing, setEditing] = useState(false);
  const polygon = useMemo(() => polygonFromCoordinates(points), [points]);
  const areaHa = useMemo(() => polygonAreaHa(points), [points]);
  const initialPointsRef = useRef(points);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const lat = Number(unit.farm.latitude);
    const lng = Number(unit.farm.longitude);
    const hasFarmCenter = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
    const center: Coordinate = hasFarmCenter ? [lng, lat] : [7.49, 9.08];

    const map = new maplibregl.Map({
      container: container.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://demotiles.maplibre.org/style.json",
      center,
      zoom: hasFarmCenter ? 14 : 5,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      const features = otherBoundaries.flatMap((boundary) => {
        const geometry = boundary.geometryGeoJson as GeoJSON.Geometry | null;
        return geometry && geometry.type === "Polygon"
          ? [{ type: "Feature" as const, properties: { name: boundary.name }, geometry }]
          : [];
      });
      map.addSource("other-units", { type: "geojson", data: { type: "FeatureCollection", features } });
      map.addLayer({ id: "other-fill", type: "fill", source: "other-units", paint: { "fill-color": "#1f6b45", "fill-opacity": 0.12 } });
      map.addLayer({ id: "other-line", type: "line", source: "other-units", paint: { "line-color": "#1f6b45", "line-width": 1.5 } });

      const initialPolygon = polygonFromCoordinates(initialPointsRef.current);
      const initialFeatures: GeoJSON.Feature[] = [];
      if (initialPolygon) initialFeatures.push({ type: "Feature", properties: {}, geometry: initialPolygon });
      for (const point of initialPointsRef.current) {
        initialFeatures.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } });
      }
      map.addSource("edited-unit", { type: "geojson", data: { type: "FeatureCollection", features: initialFeatures } });
      map.addLayer({ id: "edited-fill", type: "fill", source: "edited-unit", paint: { "fill-color": "#c7e66b", "fill-opacity": 0.34 } });
      map.addLayer({ id: "edited-line", type: "line", source: "edited-unit", paint: { "line-color": "#154c31", "line-width": 3 } });
      map.addLayer({ id: "edited-points", type: "circle", source: "edited-unit", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#154c31", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });

      if (initialPointsRef.current.length) {
        const first = initialPointsRef.current[0];
        const bounds = new maplibregl.LngLatBounds(first, first);
        for (const point of initialPointsRef.current) bounds.extend(point);
        map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 0 });
      }
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [unit.farm.latitude, unit.farm.longitude, otherBoundaries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (event: MapMouseEvent) => {
      if (!editing) return;
      setPoints((current) => [...current, [event.lngLat.lng, event.lngLat.lat]]);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [editing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("edited-unit") as GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = [];
    if (polygon) features.push({ type: "Feature", properties: {}, geometry: polygon });
    for (const point of points) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } });
    }
    source.setData({ type: "FeatureCollection", features });
  }, [points, polygon]);

  const geometry = polygon ? JSON.stringify(polygon) : "";

  return <div className="card" style={{padding:0,overflow:"hidden"}}>
    <div style={{padding:"18px 20px",display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",borderBottom:"1px solid var(--line)"}}>
      <div><h2 style={{margin:0}}>{unit.name}</h2><div className="muted" style={{fontSize:13,marginTop:4}}>{unit.farm.name} · click the map to place boundary vertices</div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" className="button secondary small" onClick={() => setEditing((value)=>!value)}>{editing ? "Stop drawing" : "Draw boundary"}</button>
        <button type="button" className="button secondary small" onClick={() => setPoints((current)=>current.slice(0,-1))} disabled={!points.length}><Undo2 size={15}/> Undo</button>
        <button type="button" className="button secondary small" onClick={() => setPoints([])} disabled={!points.length}><Trash2 size={15}/> Clear</button>
      </div>
    </div>
    <div ref={container} style={{height:520,width:"100%"}}/>
    <form action={saveUnitGeometryAction} style={{padding:16,display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}>
      <input type="hidden" name="unitId" value={unit.id}/>
      <input type="hidden" name="geometryGeoJson" value={geometry}/>
      <input type="hidden" name="areaHa" value={areaHa ? areaHa.toFixed(4) : ""}/>
      <div className="muted" style={{fontSize:13}}>{points.length} vertices {polygon ? "· " + areaHa.toFixed(2) + " ha mapped" : "· add at least 3 points"}</div>
      <button className="button" disabled={!polygon}><Save size={16}/> Save field boundary</button>
    </form>
  </div>;
}
