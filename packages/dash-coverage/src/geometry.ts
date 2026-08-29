/** Multi-part coverage geometry (outer rings + holes). */

export type CoverageVertex = { lat: number; lng: number };
export type CoverageRing = CoverageVertex[];

/** One polygon part: exterior ring + optional interior rings (holes). */
export type CoveragePolygonPart = { outer: CoverageRing; holes: CoverageRing[] };

/** MultiPolygon: one or more parts. */
export type CoverageMultiPolygon = CoveragePolygonPart[];

export const MAX_EDITABLE_VERTICES = 500;

export function dropClosingVertex(ring: CoverageRing): CoverageRing {
  if (ring.length < 2) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a.lat === b.lat && a.lng === b.lng) return ring.slice(0, -1);
  return ring;
}

export function ringVertexCount(multi: CoverageMultiPolygon): number {
  let n = 0;
  for (const part of multi) {
    n += part.outer.length;
    for (const h of part.holes) n += h.length;
  }
  return n;
}

/** Ray-cast PIP for a single ring (bbox reject first). */
export function ringBBox(ring: CoverageRing): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null {
  if (!ring || ring.length < 3) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of ring) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  if (!Number.isFinite(minLat)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

export function pointInBBox(
  lat: number,
  lng: number,
  box: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

/** Ray-cast PIP for a single ring. */
export function pointInRing(lat: number, lng: number, ring: CoverageRing): boolean {
  if (!ring || ring.length < 3) return false;
  const box = ringBBox(ring);
  if (box && !pointInBBox(lat, lng, box)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const xi = ring[i].lng;
    const yj = ring[j].lat;
    const xj = ring[j].lng;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Inside any outer, and not inside that part's holes. */
export function pointInMultiPolygon(
  lat: number,
  lng: number,
  multi: CoverageMultiPolygon | null | undefined,
): boolean {
  if (!multi || multi.length === 0) return false;
  for (const part of multi) {
    if (!pointInRing(lat, lng, part.outer)) continue;
    let inHole = false;
    for (const hole of part.holes) {
      if (pointInRing(lat, lng, hole)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/** Flatten first outer only — legacy dual-write / H3 single-ring compile fallback. */
export function multiPolygonPrimaryRing(multi: CoverageMultiPolygon): CoverageRing {
  return multi[0]?.outer ?? [];
}

/** Convert multi → GeoJSON MultiPolygon coordinates [lng,lat]. */
export function multiPolygonToGeoJsonCoords(
  multi: CoverageMultiPolygon,
): number[][][][] {
  return multi.map((part) => {
    const rings: number[][][] = [];
    const close = (ring: CoverageRing): number[][] => {
      const coords = ring.map((p) => [p.lng, p.lat]);
      if (coords.length > 0) {
        const f = coords[0];
        const l = coords[coords.length - 1];
        if (f[0] !== l[0] || f[1] !== l[1]) coords.push([...f]);
      }
      return coords;
    };
    rings.push(close(part.outer));
    for (const h of part.holes) rings.push(close(h));
    return rings;
  });
}

export function multiPolygonToGeoJsonGeometry(multi: CoverageMultiPolygon): {
  type: 'MultiPolygon';
  coordinates: number[][][][];
} {
  return { type: 'MultiPolygon', coordinates: multiPolygonToGeoJsonCoords(multi) };
}

/** Prefer official centroid over vertex-average (LM-2). */
export function preferCentroid(
  official: CoverageVertex | null | undefined,
  polygon: CoverageRing,
): CoverageVertex | null {
  if (official && Number.isFinite(official.lat) && Number.isFinite(official.lng)) {
    return official;
  }
  if (!polygon.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of polygon) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / polygon.length, lng: lng / polygon.length };
}
