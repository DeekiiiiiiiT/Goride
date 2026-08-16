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
};

export function detectCoverageConflicts(
  includes: { id: string; name: string; polygon: GeoVertex[] }[],
  excludes: { id: string; name: string; polygon: GeoVertex[] }[],
): CoverageConflict[] {
  const conflicts: CoverageConflict[] = [];
  const primary = includes[0];
  if (primary && primary.polygon.length >= 3) {
    const b = polygonBounds(primary.polygon);
    if (b) {
      const latSpan = (b.north - b.south) * 111_320;
      const lngSpan =
        (b.east - b.west) * 111_320 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
      if (latSpan < 200 || lngSpan < 200) {
        conflicts.push({
          code: 'tiny_delivery_area',
          message: 'Delivery area looks unusually small — confirm the town border.',
        });
      }
    }
    for (const ex of excludes) {
      const anyInside = ex.polygon.some((p) => pointInPolygon(p.lat, p.lng, primary.polygon));
      if (!anyInside) {
        conflicts.push({
          code: 'cutout_outside_town',
          message: `Cutout “${ex.name}” does not intersect the delivery area.`,
        });
      }
    }
  }
  for (let i = 0; i < excludes.length; i++) {
    for (let j = i + 1; j < excludes.length; j++) {
      if (polygonsOverlapOrTouch(excludes[i].polygon, excludes[j].polygon)) {
        conflicts.push({
          code: 'overlapping_cutouts',
          message: `Cutouts “${excludes[i].name}” and “${excludes[j].name}” overlap.`,
        });
      }
    }
  }
  return conflicts;
}
