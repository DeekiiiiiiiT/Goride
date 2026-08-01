import { BusinessType } from '@roam/types';

/**
 * Canonical business-type defs for Fleet + Enterprise.
 * All apps/admin-core/edge lists must derive from here (or the Deno mirror).
 */

export const BUSINESS_TYPE_KEYS = [
  'rideshare',
  'delivery',
  'taxi',
  'trucking',
  'shipping',
  'freight_forwarding',
] as const satisfies readonly BusinessType[];

export const BUSINESS_TYPES = [
  {
    key: 'rideshare' as BusinessType,
    label: 'Rideshare',
    description: 'Uber, Lyft-style ride services',
    icon: 'Car',
  },
  {
    key: 'delivery' as BusinessType,
    label: 'Delivery / Courier',
    description: 'Package delivery, document courier, last-mile',
    icon: 'Package',
  },
  {
    key: 'taxi' as BusinessType,
    label: 'Taxi / Cab',
    description: 'Traditional taxi and dispatch services',
    icon: 'Navigation',
  },
  {
    key: 'trucking' as BusinessType,
    label: 'Trucking / Haulage',
    description: 'Long-haul freight, cargo transport',
    icon: 'Truck',
  },
  {
    key: 'shipping' as BusinessType,
    label: 'Shipping / Logistics',
    description: 'Maritime, port logistics, container transport',
    icon: 'Ship',
  },
  {
    key: 'freight_forwarding' as BusinessType,
    label: 'Freight Forwarding',
    description: 'Multi-leg freight ops, own fleet and 3PL carriers',
    icon: 'Boxes',
  },
] as const;

/** Business types shown/toggleable on the Enterprise product line. */
export const ENTERPRISE_BUSINESS_TYPES: BusinessType[] = [
  'freight_forwarding',
  'trucking',
  'shipping',
  'delivery',
];

/** Business types excluded from Enterprise Dominion toggles. */
export const ENTERPRISE_EXCLUDED_BUSINESS_TYPES: BusinessType[] = [
  'rideshare',
  'taxi',
];

export const DEFAULT_BUSINESS_TYPE: BusinessType = 'rideshare';

export const DEFAULT_ENTERPRISE_BUSINESS_TYPE: BusinessType = 'freight_forwarding';

export function isValidBusinessType(value: unknown): value is BusinessType {
  return (
    typeof value === 'string' &&
    (BUSINESS_TYPE_KEYS as readonly string[]).includes(value)
  );
}

export function businessTypesForSegment(
  segment: 'fleet' | 'enterprise',
): typeof BUSINESS_TYPES[number][] {
  if (segment === 'enterprise') {
    return BUSINESS_TYPES.filter((bt) =>
      ENTERPRISE_BUSINESS_TYPES.includes(bt.key),
    );
  }
  return [...BUSINESS_TYPES];
}

// ---------------------------------------------------------------------------
// Sidebar Visibility Rules (Fleet admin shell)
// ---------------------------------------------------------------------------

export const SIDEBAR_VISIBILITY: Record<string, BusinessType[]> = {
  dashboard: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  imports: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  drivers: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  vehicles: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  fleet: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  'fuel-management': [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  trips: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  reports: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  settings: [
    'rideshare',
    'delivery',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  'earnings-policy': ['rideshare'],
  'tier-config': ['rideshare'],
  performance: ['rideshare', 'taxi'],
  'toll-management': [
    'rideshare',
    'taxi',
    'trucking',
    'shipping',
    'freight_forwarding',
  ],
  shipments: ['freight_forwarding', 'trucking', 'shipping'],
  carriers: ['freight_forwarding', 'trucking', 'shipping'],
  clients: ['freight_forwarding', 'trucking', 'shipping', 'delivery'],
  'rate-cards': ['freight_forwarding', 'trucking', 'shipping'],
  claims: ['freight_forwarding', 'trucking', 'shipping'],
};

export function isSidebarItemVisible(
  itemKey: string,
  businessType: BusinessType,
): boolean {
  const allowed = SIDEBAR_VISIBILITY[itemKey];
  if (!allowed) return true;
  return allowed.includes(businessType);
}
