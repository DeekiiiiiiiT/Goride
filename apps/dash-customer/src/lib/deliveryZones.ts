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

/** Soft-launch Kingston metro bounding box */
const KINGSTON_BOUNDS = {
  minLat: 17.92,
  maxLat: 18.12,
  minLng: -76.92,
  maxLng: -76.68,
};

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

export function checkDeliveryZone(address: DeliveryAddressInput): DeliveryZoneResult {
  if (
    address.lat != null &&
    address.lng != null &&
    Number.isFinite(address.lat) &&
    Number.isFinite(address.lng)
  ) {
    if (inKingstonBounds(address.lat, address.lng)) {
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
