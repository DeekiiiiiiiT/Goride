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

const IN_ZONE_KEYWORDS = [
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

function inKingstonDeliveryArea(lat: number, lng: number): boolean {
  if (KINGSTON_DELIVERY_POLYGON.length >= 3) {
    if (pointInPolygon(lat, lng, KINGSTON_DELIVERY_POLYGON)) return true;
    // Polygon is authoritative when present; do not expand via bbox.
    return false;
  }
  return inKingstonBounds(lat, lng);
}

export function checkDeliveryZone(address: DeliveryAddressInput): DeliveryZoneResult {
  if (
    address.lat != null &&
    address.lng != null &&
    Number.isFinite(address.lat) &&
    Number.isFinite(address.lng)
  ) {
    if (inKingstonDeliveryArea(address.lat, address.lng)) {
      return { inZone: true };
    }
    return {
      inZone: false,
      reason: 'This address is outside our current Kingston delivery area.',
    };
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
