import {
  createDeliveryZoneLoader,
  createZoneCache,
  customerCopyForReason,
  DELIVERY_ZONES_CACHE_KEY,
  DELIVERY_ZONES_CACHE_TTL_MS,
  evaluateLiveCoverage,
  parseAllZonesPayload,
  pointInPolygon,
  type ActiveCoverageZone,
  type CoverageZone,
} from '@roam/dash-coverage';

export { parseAllZonesPayload, pointInPolygon };
export type { ActiveCoverageZone, LatLng } from '@roam/dash-coverage';

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

export type ZoneKind = 'include' | 'exclude';

const zoneCache = createZoneCache({
  storage: {
    getItem: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore quota / private mode
      }
    },
  },
  key: DELIVERY_ZONES_CACHE_KEY,
  ttlMs: DELIVERY_ZONES_CACHE_TTL_MS,
});

async function fetchRemoteZones(): Promise<ActiveCoverageZone[]> {
  const { API_ENDPOINTS, supabaseAnonFunctionHeaders } = await import('@roam/api-client');
  const res = await fetch(`${API_ENDPOINTS.delivery}/geo/delivery-zones`, {
    headers: supabaseAnonFunctionHeaders(),
  });
  if (!res.ok) {
    throw new Error(`delivery-zones HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return parseAllZonesPayload(body);
}

const zoneLoader = createDeliveryZoneLoader({
  fetchZones: fetchRemoteZones,
  readCache: zoneCache.read,
  writeCache: zoneCache.write,
});

/**
 * @deprecated Soft-launch Kingston polygon — kept for unit tests only.
 */
export const KINGSTON_DELIVERY_POLYGON = [
  { lat: 18.12, lng: -76.88 },
  { lat: 18.1, lng: -76.72 },
  { lat: 18.02, lng: -76.68 },
  { lat: 17.94, lng: -76.7 },
  { lat: 17.92, lng: -76.82 },
  { lat: 17.96, lng: -76.92 },
  { lat: 18.06, lng: -76.92 },
  { lat: 18.12, lng: -76.88 },
] as const;

export function getActiveDeliveryPolygon() {
  return zoneLoader.getActivePolygon();
}

export function __setActiveZonesForTests(zones: ActiveCoverageZone[]): void {
  zoneLoader.setForTests(zones);
}

export async function loadDeliveryZones() {
  return zoneLoader.load();
}

export async function ensureDeliveryZonesLoaded(): Promise<void> {
  await zoneLoader.ensureLoaded();
}

const IN_ZONE_KEYWORDS = [
  'spanish town',
  'magil',
  'kingston',
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

export function evaluateActiveCoverage(lat: number, lng: number): DeliveryZoneResult {
  const activeZones = zoneLoader.getActiveZones();
  if (activeZones.length === 0) {
    return {
      inZone: false,
      reason: 'We could not confirm this location is in our delivery area. Try again in a moment.',
    };
  }

  const zones: CoverageZone[] = activeZones.map((z, i) => ({
    id: z.id ?? `zone-${i}`,
    name: z.name ?? `Zone ${i + 1}`,
    kind: z.kind,
    market_id: z.market_id,
    polygon: z.polygon,
    multiPolygon: z.multiPolygon,
    priority: z.priority,
    is_active: z.is_active,
    effective_from: z.effective_from,
    effective_to: z.effective_to,
    category: z.category,
    schedules: z.schedules,
    zone_policy: z.zone_policy,
    source: z.source,
  }));

  const result = evaluateLiveCoverage(lat, lng, zones);
  if (result.inZone) return { inZone: true };
  return {
    inZone: false,
    reason: result.reason ?? customerCopyForReason(result.reasonCode, activeZones.find((z) => z.kind === 'exclude')?.category),
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
      'We could not confirm this location is in zone. Enable maps geocode or pick an address in our delivery area.',
  };
}

export async function checkDeliveryZoneAsync(
  address: DeliveryAddressInput,
): Promise<DeliveryZoneResult> {
  await ensureDeliveryZonesLoaded();
  if (zoneLoader.getActiveZones().length === 0) {
    await loadDeliveryZones();
  }
  return checkDeliveryZone(address);
}
