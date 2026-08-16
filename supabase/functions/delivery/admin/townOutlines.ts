/**
 * Curated town delivery outlines + circle fallbacks for Rush Markets auto-include.
 * Keep curated rings aligned with seed polygons in rush_ops_markets_zones migration.
 * Locality centroids mirrored from packages/business-config jamaicaLocations (edge twin).
 */

export type OutlineVertex = { lat: number; lng: number };

const DEFAULT_RADIUS_KM = 4;
const CIRCLE_SEGMENTS = 24;
const JAMAICA_CENTER = { lat: 18.0, lng: -77.0 };

/** Launch-town curated include rings (approximate operational coverage). */
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
  "spanish-town": [
    { lat: 18.02, lng: -76.99 },
    { lat: 18.02, lng: -76.92 },
    { lat: 17.96, lng: -76.92 },
    { lat: 17.96, lng: -76.99 },
  ],
};

/** Locality slug → centroid (subset with known coords from jamaicaLocations). */
const LOCALITY_CENTROIDS: Record<string, OutlineVertex> = {
  lucea: { lat: 18.451, lng: -78.174 },
  "green-island": { lat: 18.256, lng: -78.235 },
  "black-river": { lat: 18.026, lng: -77.853 },
  "santa-cruz": { lat: 18.053, lng: -77.699 },
  "montego-bay": { lat: 18.471, lng: -77.919 },
  "rose-hall": { lat: 18.525, lng: -77.82 },
  falmouth: { lat: 18.492, lng: -77.656 },
  "savanna-la-mar": { lat: 18.214, lng: -78.133 },
  negril: { lat: 18.268, lng: -78.348 },
  bluefields: { lat: 18.172, lng: -78.027 },
  "may-pen": { lat: 17.964, lng: -77.245 },
  mandeville: { lat: 18.047, lng: -77.507 },
  "alligator-pond": { lat: 17.869, lng: -77.565 },
  "saint-anns-bay": { lat: 18.436, lng: -77.201 },
  "ocho-rios": { lat: 18.408, lng: -77.103 },
  "browns-town": { lat: 18.388, lng: -77.365 },
  "runaway-bay": { lat: 18.456, lng: -77.335 },
  "discovery-bay": { lat: 18.458, lng: -77.397 },
  "spanish-town": { lat: 17.996, lng: -76.954 },
  portmore: { lat: 17.957, lng: -76.882 },
  "old-harbour": { lat: 17.941, lng: -77.109 },
  linstead: { lat: 18.152, lng: -77.032 },
  "port-maria": { lat: 18.369, lng: -76.889 },
  "annotto-bay": { lat: 18.276, lng: -76.764 },
  oracabessa: { lat: 18.403, lng: -76.946 },
  kingston: { lat: 17.971, lng: -76.793 },
  "downtown-kingston": { lat: 17.968, lng: -76.793 },
  "new-kingston": { lat: 18.007, lng: -76.783 },
  "harbour-view": { lat: 17.944, lng: -76.722 },
  "port-royal": { lat: 17.937, lng: -76.841 },
  "half-way-tree": { lat: 18.013, lng: -76.799 },
  papine: { lat: 18.021, lng: -76.745 },
  liguanea: { lat: 18.018, lng: -76.744 },
  "bull-bay": { lat: 17.942, lng: -76.667 },
  "port-antonio": { lat: 18.177, lng: -76.451 },
  "morant-bay": { lat: 17.881, lng: -76.409 },
};

/** Parish slug → AABB center (from jamaicaLocations bounds). */
const PARISH_CENTERS: Record<string, OutlineVertex> = {
  hanover: { lat: 18.365, lng: -78.25 },
  "saint-elizabeth": { lat: 18.045, lng: -78.035 },
  "saint-james": { lat: 18.45, lng: -77.9 },
  trelawny: { lat: 18.4, lng: -77.6 },
  westmoreland: { lat: 18.265, lng: -78.15 },
  clarendon: { lat: 18.02, lng: -77.32 },
  manchester: { lat: 18.05, lng: -77.47 },
  "saint-ann": { lat: 18.34, lng: -77.22 },
  "saint-catherine": { lat: 18.03, lng: -77.05 },
  "saint-mary": { lat: 18.32, lng: -76.92 },
  kingston: { lat: 17.97, lng: -76.795 },
  "saint-andrew": { lat: 18.05, lng: -76.8 },
  portland: { lat: 18.18, lng: -76.47 },
  "saint-thomas": { lat: 17.96, lng: -76.35 },
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
};

/**
 * Resolve a starter delivery-area polygon for a town.
 * Prefer curated outline → locality centroid circle → parish center circle → Jamaica default.
 */
export function resolveTownOutline(opts: ResolveOutlineOpts): OutlineVertex[] {
  const slug = opts.townSlug.trim().toLowerCase();
  const curated = CURATED_OUTLINES[slug];
  if (curated && curated.length >= 3) return curated.map((v) => ({ ...v }));

  const locality = LOCALITY_CENTROIDS[slug];
  if (locality) return circleOutline(locality);

  const parishSlug = opts.parishSlug?.trim().toLowerCase() || "";
  const parishCenter = parishSlug ? PARISH_CENTERS[parishSlug] : undefined;
  if (parishCenter) return circleOutline(parishCenter);

  return circleOutline(JAMAICA_CENTER);
}

export function deliveryAreaName(townName: string): string {
  return `${townName.trim()} delivery area`;
}
