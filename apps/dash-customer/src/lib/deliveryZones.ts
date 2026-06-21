export type DeliveryZoneResult = {
  inZone: boolean;
  reason?: string;
};

export type DeliveryAddressInput = {
  line1: string;
  line2?: string;
  city?: string;
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

export function checkDeliveryZone(address: DeliveryAddressInput): DeliveryZoneResult {
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
    reason: 'We do not deliver to this location yet.',
  };
}
