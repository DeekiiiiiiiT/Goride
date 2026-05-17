/**
 * Roam Rides vehicle / product tiers (stored as `vehicle_type` / `vehicle_option` slugs).
 * Keep in sync with supabase/functions/rides/fare/ridesVehicleTypes.ts
 */

export type RidesVehicleTypeSlug = 'uberx' | 'comfort' | 'uberxl';

export type RidesVehicleType = {
  slug: RidesVehicleTypeSlug;
  label: string;
  description: string;
  seats: number;
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
] as const;

/** Legacy DB / API values mapped to a current tier. */
export const RIDES_VEHICLE_LEGACY_ALIASES: Record<string, RidesVehicleTypeSlug> = {
  standard: 'uberx',
};

export const DEFAULT_RIDES_VEHICLE_TYPE: RidesVehicleTypeSlug = 'uberx';

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
