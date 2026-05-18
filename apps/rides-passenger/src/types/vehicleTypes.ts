import {
  DEFAULT_RIDES_VEHICLE_TYPE,
  RIDES_VEHICLE_TYPES,
  type RidesVehicleType,
} from '@roam/business-config';

export type RidesVehicleTypeDto = {
  slug: string;
  label: string;
  description: string;
  seats: number;
  capacity_label: string | null;
  tagline: string | null;
  sort_order: number;
  is_active: boolean;
};

export type RidesVehicleTypeInput = {
  slug?: string;
  label: string;
  description: string;
  seats: number;
  capacity_label?: string | null;
  tagline?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export function fallbackVehicleTypes(): RidesVehicleTypeDto[] {
  return RIDES_VEHICLE_TYPES.map((v, i) => ({
    slug: v.slug,
    label: v.label,
    description: v.description,
    seats: v.seats,
    capacity_label: v.capacityLabel ?? null,
    tagline: v.slug === 'courier' ? 'Send a package' : null,
    sort_order: (i + 1) * 10,
    is_active: true,
  }));
}

export function vehicleCapacityDisplay(
  v: Pick<RidesVehicleTypeDto, 'capacity_label' | 'seats'>,
): string {
  if (v.capacity_label?.trim()) return v.capacity_label.trim();
  return `${v.seats} seats`;
}

export function vehicleTypeLabelFromList(slug: string, types: RidesVehicleTypeDto[]): string {
  const hit = types.find((t) => t.slug === slug);
  if (hit) return hit.label;
  if (slug === 'standard') return 'UberX (legacy)';
  const fb = RIDES_VEHICLE_TYPES.find((v) => v.slug === slug);
  return fb?.label ?? slug;
}

export function activeVehicleTypes(types: RidesVehicleTypeDto[]): RidesVehicleTypeDto[] {
  return types.filter((t) => t.is_active).sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug));
}

export const DEFAULT_VEHICLE_OPTION = DEFAULT_RIDES_VEHICLE_TYPE;
