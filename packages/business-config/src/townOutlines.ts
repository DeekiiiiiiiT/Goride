/**
 * Curated town delivery outlines + circle fallbacks for Rush Markets.
 * Keep in sync with supabase/functions/delivery/admin/townOutlines.ts
 */

export type OutlineVertex = { lat: number; lng: number };

const DEFAULT_RADIUS_KM = 4;
const CIRCLE_SEGMENTS = 24;
const JAMAICA_CENTER = { lat: 18.0, lng: -77.0 };

const CURATED_OUTLINES: Record<string, OutlineVertex[]> = {
  kingston: [
    { lat: 18.12, lng: -76.88 },
    { lat: 18.1, lng: -76.72 },
    { lat: 18.02, lng: -76.68 },
    { lat: 17.94, lng: -76.7 },
    { lat: 17.92, lng: -76.82 },
    { lat: 17.96, lng: -76.92 },
    { lat: 18.06, lng: -76.92 },
    { lat: 18.12, lng: -76.88 },
  ],
  'spanish-town': [
    { lat: 18.02, lng: -76.99 },
    { lat: 18.02, lng: -76.92 },
    { lat: 17.96, lng: -76.92 },
    { lat: 17.96, lng: -76.99 },
  ],
};

export function circleOutline(
  center: OutlineVertex,
  radiusKm = DEFAULT_RADIUS_KM,
  segments = CIRCLE_SEGMENTS,
): OutlineVertex[] {
  const verts: OutlineVertex[] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(latRad));
  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    verts.push({
      lat: center.lat + dLat * Math.sin(theta),
      lng: center.lng + dLng * Math.cos(theta),
    });
  }
  return verts;
}

export type ResolveOutlineOpts = {
  townSlug: string;
  parishSlug?: string | null;
  /** Optional centroid when caller already resolved jamaicaLocations */
  center?: OutlineVertex | null;
};

export function resolveTownOutline(opts: ResolveOutlineOpts): OutlineVertex[] {
  const slug = opts.townSlug.trim().toLowerCase();
  const curated = CURATED_OUTLINES[slug];
  if (curated && curated.length >= 3) return curated.map((v) => ({ ...v }));
  if (opts.center && Number.isFinite(opts.center.lat) && Number.isFinite(opts.center.lng)) {
    return circleOutline(opts.center);
  }
  return circleOutline(JAMAICA_CENTER);
}

export function deliveryAreaName(townName: string): string {
  return `${townName.trim()} delivery area`;
}
