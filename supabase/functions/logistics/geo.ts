/** Pure geo helpers — no PostGIS. */

export type LatLng = { lat: number; lng: number };

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][]; // [ring][point][lng,lat]
};

export type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

export type ZoneGeoJson = GeoJsonPolygon | GeoJsonMultiPolygon;

/** Haversine distance in kilometers. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray-casting point-in-polygon. Ring is [lng, lat][]. */
export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lng: number, lat: number, poly: GeoJsonPolygon): boolean {
  const rings = poly.coordinates;
  if (!rings?.length) return false;
  // Outer ring must contain; holes (even rings) exclude
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false;
  }
  return true;
}

export function pointInGeoJson(lng: number, lat: number, geo: ZoneGeoJson | null | undefined): boolean {
  if (!geo || !geo.type) return false;
  if (geo.type === "Polygon") return pointInPolygon(lng, lat, geo);
  if (geo.type === "MultiPolygon") {
    return geo.coordinates.some((coords) =>
      pointInPolygon(lng, lat, { type: "Polygon", coordinates: coords }),
    );
  }
  return false;
}

export function parseZoneGeoJson(raw: unknown): ZoneGeoJson | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as { type?: string; coordinates?: unknown };
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return { type: "Polygon", coordinates: g.coordinates as number[][][] };
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    return { type: "MultiPolygon", coordinates: g.coordinates as number[][][][] };
  }
  // Feature wrapper
  const f = raw as { type?: string; geometry?: unknown };
  if (f.type === "Feature") return parseZoneGeoJson(f.geometry);
  return null;
}
