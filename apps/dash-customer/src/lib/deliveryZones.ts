export type DeliveryZoneResult = {
  inZone: boolean;
  reason?: string;
};

export type DeliveryAddressInput = {
  line1: string;
  line2?: string;
  city?: string;
  lat?: number;
  lng?: number;
};

export type LatLng = { lat: number; lng: number };

export type ZoneKind = 'include' | 'exclude';

export type ActiveCoverageZone = {
  id?: string;
  name?: string;
  kind: ZoneKind;
  polygon: LatLng[];
};

/** Bump when zone payload shape changes so stale caches drop. */
const ZONES_CACHE_KEY = 'roam-dash-delivery-zones-v3';
/** Short TTL so Ops map edits reach customers within minutes. */
const ZONES_CACHE_TTL_MS = 10 * 60 * 1000; // 10m

/** Soft-launch Kingston metro bounding box (fallback when polygon miss / empty) */
const KINGSTON_BOUNDS = {
  minLat: 17.92,
  maxLat: 18.12,
  minLng: -76.92,
  maxLng: -76.68,
};

/**
 * Soft-launch Kingston delivery polygon (clockwise, closed ring optional).
 * Prefer polygon when coords exist; bbox remains the fallback.
 */
export const KINGSTON_DELIVERY_POLYGON: LatLng[] = [
  { lat: 18.12, lng: -76.88 },
  { lat: 18.1, lng: -76.72 },
  { lat: 18.02, lng: -76.68 },
  { lat: 17.94, lng: -76.7 },
  { lat: 17.92, lng: -76.82 },
  { lat: 17.96, lng: -76.92 },
  { lat: 18.06, lng: -76.92 },
  { lat: 18.12, lng: -76.88 },
];

/**
 * Active coverage zones (includes + excludes). Defaults to Kingston include;
 * replaced at runtime once remote delivery zones are loaded.
 */
let activeZones: ActiveCoverageZone[] = [
  { kind: 'include', name: 'Kingston Metro', polygon: KINGSTON_DELIVERY_POLYGON },
];

export function getActiveDeliveryPolygon(): LatLng[] {
  const include = activeZones.find((z) => z.kind === 'include' && z.polygon.length >= 3);
  return include?.polygon ?? KINGSTON_DELIVERY_POLYGON;
}

/** @internal test helper */
export function __setActiveZonesForTests(zones: ActiveCoverageZone[]): void {
  activeZones = zones;
}

/** Convert a GeoJSON-ish coordinate ring ([lng,lat] pairs) into LatLng[] */
function ringToLatLng(ring: unknown): LatLng[] {
  if (!Array.isArray(ring)) return [];
  const out: LatLng[] = [];
  for (const pt of ring) {
    if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
      out.push({ lng: Number(pt[0]), lat: Number(pt[1]) });
    } else if (pt && typeof pt === 'object' && 'lat' in pt && 'lng' in pt) {
      const p = pt as LatLng;
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) out.push({ lat: p.lat, lng: p.lng });
    }
  }
  return out;
}

function parseZoneRing(polygon: unknown): LatLng[] {
  const geo = polygon as { type?: string; coordinates?: unknown[] } | undefined;
  if (geo?.type === 'Polygon' && Array.isArray(geo.coordinates)) {
    return ringToLatLng(geo.coordinates[0]);
  }
  return ringToLatLng(Array.isArray(polygon) ? (polygon as unknown[]) : []);
}

/** Extract include/exclude zones from API payload. */
export function parseAllZonesPayload(payload: unknown): ActiveCoverageZone[] {
  const zones =
    (payload as { zones?: unknown[] })?.zones ??
    (payload as { markets?: unknown[] })?.markets ??
    (Array.isArray(payload) ? (payload as unknown[]) : null);
  if (!Array.isArray(zones)) return [];

  const out: ActiveCoverageZone[] = [];
  for (const zone of zones) {
    if (!zone || typeof zone !== 'object') continue;
    const z = zone as Record<string, unknown>;
    if (z.is_active === false || z.active === false) continue;
    const ring = parseZoneRing(z.polygon ?? z.geometry ?? z.coordinates);
    if (ring.length < 3) continue;
    const kind: ZoneKind = z.kind === 'exclude' ? 'exclude' : 'include';
    out.push({
      id: z.id != null ? String(z.id) : undefined,
      name: z.name != null ? String(z.name) : undefined,
      kind,
      polygon: ring,
    });
  }
  return out;
}

function readCachedZones(): ActiveCoverageZone[] | null {
  try {
    const raw = localStorage.getItem(ZONES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      at: number;
      zones?: ActiveCoverageZone[];
      polygons?: LatLng[][];
      polygon?: LatLng[];
    };
    if (Date.now() - parsed.at > ZONES_CACHE_TTL_MS) return null;
    if (parsed.zones?.length) {
      return parsed.zones.filter((z) => z.polygon?.length >= 3);
    }
    // Legacy cache shapes → treat as includes only
    if (parsed.polygons?.length) {
      return parsed.polygons
        .filter((p) => p.length >= 3)
        .map((polygon) => ({ kind: 'include' as const, polygon }));
    }
    if (parsed.polygon && parsed.polygon.length >= 3) {
      return [{ kind: 'include', polygon: parsed.polygon }];
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedZones(zones: ActiveCoverageZone[]): void {
  try {
    localStorage.setItem(
      ZONES_CACHE_KEY,
      JSON.stringify({
        at: Date.now(),
        zones,
        polygons: zones.filter((z) => z.kind === 'include').map((z) => z.polygon),
        polygon: zones.find((z) => z.kind === 'include')?.polygon,
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Load delivery zones from the API, cache the result, and update active polygons.
 * Falls back to cache / Kingston so the zone check always has a usable boundary.
 */
export async function loadDeliveryZones(): Promise<LatLng[]> {
  const cached = readCachedZones();
  if (cached?.length) activeZones = cached;

  try {
    // Lazy import so geometry unit tests do not require VITE_SUPABASE_* at module load.
    const { API_ENDPOINTS, publicAnonKey } = await import('@roam/api-client');
    const res = await fetch(`${API_ENDPOINTS.delivery}/geo/delivery-zones`, {
      headers: { apikey: publicAnonKey },
    });
    if (res.ok) {
      const body = (await res.json()) as unknown;
      const zones = parseAllZonesPayload(body);
      if (zones.length > 0) {
        activeZones = zones;
        writeCachedZones(zones);
        return getActiveDeliveryPolygon();
      }
    }
  } catch {
    // network / missing env — keep cache / fallback
  }

  if (!cached?.length) {
    activeZones = [
      { kind: 'include', name: 'Kingston Metro', polygon: KINGSTON_DELIVERY_POLYGON },
    ];
  }
  return getActiveDeliveryPolygon();
}

const IN_ZONE_KEYWORDS = [
  'kingston',
  'spanish town',
  'magil',
  'constant spring',
  'half way tree',
  'new kingston',
  'liguanea',
  'papine',
  'mona',
  'business park',
  'culinary ave',
] as const;

const OUT_OF_ZONE_KEYWORDS = [
  'montego bay',
  'ocho rios',
  'negril',
  'mandeville',
  'san francisco',
  'valencia st',
  'tech blvd',
  'market st',
] as const;

export const OUT_OF_ZONE_TEST_ADDRESSES = [
  '123 Market St, San Francisco, CA',
  '789 Valencia St, Apt 4B',
  'Montego Bay, Jamaica',
] as const;

function normalizeAddress(address: DeliveryAddressInput): string {
  return [address.line1, address.line2, address.city].filter(Boolean).join(' ').toLowerCase();
}

function inKingstonBounds(lat: number, lng: number): boolean {
  return (
    lat >= KINGSTON_BOUNDS.minLat &&
    lat <= KINGSTON_BOUNDS.maxLat &&
    lng >= KINGSTON_BOUNDS.minLng &&
    lng <= KINGSTON_BOUNDS.maxLng
  );
}

/** Ray-cast point-in-polygon (lat/lng). Ring may or may not repeat the first vertex. */
export function pointInPolygon(lat: number, lng: number, polygon: LatLng[]): boolean {
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

/** include wins only if no exclude covers the point. */
export function evaluateActiveCoverage(lat: number, lng: number): DeliveryZoneResult {
  const zones = activeZones.length > 0
    ? activeZones
    : [{ kind: 'include' as const, polygon: KINGSTON_DELIVERY_POLYGON }];

  let inInclude = false;
  let hitExclude = false;

  for (const zone of zones) {
    if (zone.polygon.length < 3) continue;
    if (!pointInPolygon(lat, lng, zone.polygon)) continue;
    if (zone.kind === 'exclude') hitExclude = true;
    else inInclude = true;
  }

  if (hitExclude) {
    return { inZone: false, reason: 'This address is outside our current delivery area.' };
  }
  if (inInclude) return { inZone: true };

  // No remote zones loaded and empty list → bbox fallback
  if (zones.length === 0 && inKingstonBounds(lat, lng)) return { inZone: true };

  return {
    inZone: false,
    reason: 'This address is outside our current Kingston delivery area.',
  };
}

export function checkDeliveryZone(address: DeliveryAddressInput): DeliveryZoneResult {
  if (
    address.lat != null &&
    address.lng != null &&
    Number.isFinite(address.lat) &&
    Number.isFinite(address.lng)
  ) {
    return evaluateActiveCoverage(address.lat, address.lng);
  }

  const normalized = normalizeAddress(address);

  for (const keyword of OUT_OF_ZONE_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return {
        inZone: false,
        reason: 'This address is outside our current delivery area.',
      };
    }
  }

  for (const keyword of IN_ZONE_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return { inZone: true };
    }
  }

  if (normalized.includes('jamaica') && !normalized.includes('montego')) {
    return { inZone: true };
  }

  return {
    inZone: false,
    reason:
      'We could not confirm this location is in zone. Enable maps geocode or pick a Kingston address.',
  };
}
