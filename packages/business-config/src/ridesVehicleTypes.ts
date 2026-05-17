/**
 * Roam Rides vehicle / product tiers (stored as `vehicle_type` / `vehicle_option` slugs).
 * Keep in sync with supabase/functions/rides/fare/ridesVehicleTypes.ts
 */

export type RidesVehicleTypeSlug = 'uberx' | 'comfort' | 'uberxl' | 'courier';

export type RidesVehicleType = {
  slug: RidesVehicleTypeSlug;
  label: string;
  description: string;
  seats: number;
  /** Shown in UI instead of "{seats} seats" when set (e.g. Courier). */
  capacityLabel?: string;
};

export const RIDES_VEHICLE_TYPES: readonly RidesVehicleType[] = [
  {
    slug: 'uberx',
    label: 'UberX',
    description: 'Sedan — standard 4-door compact or mid-size car',
    seats: 4,
  },
  {
    slug: 'comfort',
    label: 'Comfort',
    description: 'Sedan — newer, more spacious 4-door mid-size car',
    seats: 4,
  },
  {
    slug: 'uberxl',
    label: 'UberXL',
    description: 'SUV or minivan — larger 6-passenger utility vehicle',
    seats: 6,
  },
  {
    slug: 'courier',
    label: 'Courier',
    description:
      'Variable — car, motorcycle, bicycle, or scooter depending on your market',
    seats: 0,
    capacityLabel: 'Variable',
  },
] as const;

/** Legacy DB / API values mapped to a current tier. */
export const RIDES_VEHICLE_LEGACY_ALIASES: Record<string, RidesVehicleTypeSlug> = {
  standard: 'uberx',
};

export const DEFAULT_RIDES_VEHICLE_TYPE: RidesVehicleTypeSlug = 'uberx';

/** Slugs accepted by admin API validation (canonical + legacy aliases). */
export const RIDES_VEHICLE_TYPE_ALLOWED_SLUGS: readonly string[] = [
  ...RIDES_VEHICLE_TYPES.map((v) => v.slug),
  ...Object.keys(RIDES_VEHICLE_LEGACY_ALIASES),
];

export function normalizeVehicleType(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!slug) return DEFAULT_RIDES_VEHICLE_TYPE;
  return RIDES_VEHICLE_LEGACY_ALIASES[slug] ?? slug;
}

/** Slugs to try when loading fare rules (canonical + legacy rows). */
export function vehicleTypesForFareLookup(vehicleType: string): string[] {
  const raw = vehicleType.trim().toLowerCase();
  const canonical = normalizeVehicleType(raw);
  const keys = new Set<string>([canonical, raw]);
  if (canonical === 'uberx') keys.add('standard');
  if (raw === 'standard') keys.add('uberx');
  return [...keys];
}

export function isKnownVehicleType(slug: string): boolean {
  const n = normalizeVehicleType(slug);
  return RIDES_VEHICLE_TYPES.some((v) => v.slug === n);
}

export function vehicleTypeLabel(slug: string): string {
  const n = normalizeVehicleType(slug);
  const hit = RIDES_VEHICLE_TYPES.find((v) => v.slug === n);
  if (hit) return hit.label;
  return slug;
}

export function vehicleTypeDescription(slug: string): string | undefined {
  const n = normalizeVehicleType(slug);
  return RIDES_VEHICLE_TYPES.find((v) => v.slug === n)?.description;
}

/** Capacity line for vehicle picker cards (e.g. "4 seats" or "Variable"). */
export function vehicleCapacityDisplay(vehicle: RidesVehicleType): string {
  if (vehicle.capacityLabel) return vehicle.capacityLabel;
  return `${vehicle.seats} seats`;
}
