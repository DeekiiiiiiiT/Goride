/** Shared geo helpers for Rush Markets ops (PIP, bounds, circle→ring). */

export type GeoVertex = { lat: number; lng: number };

export function pointInPolygon(lat: number, lng: number, polygon: GeoVertex[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonBounds(polygon: GeoVertex[]): {
  south: number;
  west: number;
  north: number;
  east: number;
} | null {
  if (!polygon.length) return null;
  let south = polygon[0].lat;
  let north = polygon[0].lat;
  let west = polygon[0].lng;
  let east = polygon[0].lng;
  for (const p of polygon) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  return { south, west, north, east };
}

export function polygonCentroid(polygon: GeoVertex[]): GeoVertex | null {
  if (!polygon.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of polygon) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / polygon.length, lng: lng / polygon.length };
}

/**
 * Sort ring clockwise around centroid so N→S→E→W entry order cannot bow-tie.
 *
 * MANUAL CORNERS ONLY — safe for a handful of typed extremes (CoordinateEntryOverlay).
 * Never apply to imported / official boundaries: angular sort destroys non-star-shaped rings.
 * Rings with more than 16 vertices are returned unchanged (never scramble imported geometry).
 */
function orderRingClockwise<T extends GeoVertex>(points: T[]): T[] {
  if (points.length < 3 || points.length > 16) return points;
  const c = polygonCentroid(points);
  if (!c) return points;
  return [...points].sort((a, b) => {
    // Angle from north, clockwise (atan2 east-component, north-component)
    const aa = Math.atan2(a.lng - c.lng, a.lat - c.lat);
    const bb = Math.atan2(b.lng - c.lng, b.lat - c.lat);
    return aa - bb;
  });
}

/** Manual corner entry only — do not use on imported / official rings. */
export const orderRingClockwiseForManualCorners = orderRingClockwise;

/** Prefer official COD-AB center over vertex-average centroid. */
export function preferCentroid(
  official: { lat: number; lng: number } | null,
  polygon: GeoVertex[],
): GeoVertex | null {
  if (
    official &&
    Number.isFinite(official.lat) &&
    Number.isFinite(official.lng)
  ) {
    return { lat: official.lat, lng: official.lng };
  }
  return polygonCentroid(polygon);
}

/** Axis-aligned box from farthest N/S/E/W readings (good for “outer limits”). */
export function rectangleFromExtremes(points: GeoVertex[]): GeoVertex[] {
  const b = polygonBounds(points);
  if (!b) return [];
  return [
    { lat: b.north, lng: b.west },
    { lat: b.north, lng: b.east },
    { lat: b.south, lng: b.east },
    { lat: b.south, lng: b.west },
  ];
}

/** Approximate circle as N-gon ring (meters). */
export function circleToPolygon(
  center: GeoVertex,
  radiusMeters: number,
  segments = 32,
): GeoVertex[] {
  const verts: GeoVertex[] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = radiusMeters / 111_320;
  const dLng = radiusMeters / (111_320 * Math.cos(latRad));
  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    verts.push({
      lat: center.lat + dLat * Math.sin(theta),
      lng: center.lng + dLng * Math.cos(theta),
    });
  }
  return verts;
}

export function polygonsOverlapOrTouch(a: GeoVertex[], b: GeoVertex[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  for (const p of a) {
    if (pointInPolygon(p.lat, p.lng, b)) return true;
  }
  for (const p of b) {
    if (pointInPolygon(p.lat, p.lng, a)) return true;
  }
  return false;
}

export type CoverageConflict = {
  code: 'cutout_outside_town' | 'tiny_delivery_area' | 'overlapping_cutouts';
  message: string;
  severity: 'error' | 'warning';
};

export function hasBlockingCoverageConflicts(conflicts: CoverageConflict[]): boolean {
  return conflicts.some((c) => c.severity === 'error');
}

function cutoutIntersectsInclude(
  cutout: GeoVertex[],
  include: GeoVertex[],
): boolean {
  if (cutout.length < 3 || include.length < 3) return false;
  if (cutout.some((p) => pointInPolygon(p.lat, p.lng, include))) return true;
  if (include.some((p) => pointInPolygon(p.lat, p.lng, cutout))) return true;
  return polygonsOverlapOrTouch(cutout, include);
}

/**
 * Conflicts against the union of live delivery includes (service areas when present,
 * otherwise the official town border). Cutouts must intersect at least one live include.
 */
export function detectCoverageConflicts(
  includes: { id: string; name: string; polygon: GeoVertex[] }[],
  excludes: { id: string; name: string; polygon: GeoVertex[] }[],
): CoverageConflict[] {
  const conflicts: CoverageConflict[] = [];
  const liveIncludes = includes.filter((inc) => inc.polygon.length >= 3);

  for (const primary of liveIncludes) {
    const b = polygonBounds(primary.polygon);
    if (!b) continue;
    const latSpan = (b.north - b.south) * 111_320;
    const lngSpan =
      (b.east - b.west) * 111_320 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
    if (latSpan < 200 || lngSpan < 200) {
      conflicts.push({
        code: 'tiny_delivery_area',
        message: `Delivery area “${primary.name}” looks unusually small — confirm the outline.`,
        severity: 'warning',
      });
    }
  }

  if (liveIncludes.length > 0) {
    for (const ex of excludes) {
      const hitsAny = liveIncludes.some((inc) => cutoutIntersectsInclude(ex.polygon, inc.polygon));
      if (!hitsAny) {
        conflicts.push({
          code: 'cutout_outside_town',
          message: `Non-delivery zone “${ex.name}” does not intersect any live delivery area.`,
          severity: 'error',
        });
      }
    }
  }

  for (let i = 0; i < excludes.length; i++) {
    for (let j = i + 1; j < excludes.length; j++) {
      if (polygonsOverlapOrTouch(excludes[i].polygon, excludes[j].polygon)) {
        conflicts.push({
          code: 'overlapping_cutouts',
          message: `Non-delivery zones “${excludes[i].name}” and “${excludes[j].name}” overlap.`,
          severity: 'error',
        });
      }
    }
  }
  return conflicts;
}
