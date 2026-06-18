import {
  DEFAULT_RIDES_VEHICLE_TYPE,
  RIDES_VEHICLE_TYPES,
} from '@roam/business-config';

export type TransportSolutionKind = 'vehicle' | 'service';

export type ServiceCategory = 'rideshare' | 'courier' | 'event' | 'haulage';

export const SERVICE_CATEGORIES: ReadonlyArray<{
  id: ServiceCategory;
  label: string;
  description: string;
}> = [
  {
    id: 'rideshare',
    label: 'Rideshare',
    description: 'On-demand passenger rides (Roam S, Comfort, XL, etc.).',
  },
  {
    id: 'courier',
    label: 'Courier',
    description: 'Send packages across town.',
  },
  {
    id: 'event',
    label: 'Event booking',
    description: 'Weddings, parties, and group trips.',
  },
  {
    id: 'haulage',
    label: 'Haulage',
    description: 'Move large items and heavy loads.',
  },
] as const;

const EVENT_SLUGS = new Set(['event-booking', 'event']);
const COURIER_SLUGS = new Set(['courier']);
const HAULAGE_SLUGS = new Set(['haulage']);

export function inferServiceCategory(
  slug: string,
  stored?: string | null,
): ServiceCategory {
  if (
    stored === 'rideshare' ||
    stored === 'courier' ||
    stored === 'event' ||
    stored === 'haulage'
  ) {
    return stored;
  }
  const normalized = slug.trim().toLowerCase();
  if (COURIER_SLUGS.has(normalized)) return 'courier';
  if (EVENT_SLUGS.has(normalized)) return 'event';
  if (HAULAGE_SLUGS.has(normalized)) return 'haulage';
  return 'rideshare';
}

export function resolveServiceCategory(
  row: Pick<RidesVehicleTypeDto, 'slug' | 'service_category'>,
): ServiceCategory {
  return inferServiceCategory(row.slug, row.service_category);
}

/** Matches rides admin API: lowercase id, starts with a letter. */
export const TRANSPORT_SOLUTION_SLUG_RE = /^[a-z][a-z0-9_-]{0,30}$/;

export function normalizeTransportSolutionSlug(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/\s+/g, '-');
  s = s.replace(/[^a-z0-9_-]/g, '');
  s = s.replace(/-+/g, '-').replace(/^-+/, '');
  if (s.length > 31) s = s.slice(0, 31);
  return s;
}

export function validateTransportSolutionSlug(slug: string): string | null {
  if (!slug) return 'ID is required.';
  if (!TRANSPORT_SOLUTION_SLUG_RE.test(slug)) {
    return 'ID must start with a letter and use only lowercase letters, numbers, hyphens, or underscores (e.g. roam-standard).';
  }
  return null;
}

export type RidesVehicleTypeDto = {
  slug: string;
  label: string;
  description: string;
  seats: number;
  capacity_label: string | null;
  tagline: string | null;
  sort_order: number;
  is_active: boolean;
  solution_kind: TransportSolutionKind;
  service_category?: ServiceCategory | null;
  commando_body_type?: string | null;
};

export type RidesVehicleTypeInput = {
  slug?: string;
  label?: string;
  commando_body_type?: string;
  description?: string;
  seats: number;
  capacity_label?: string | null;
  tagline?: string | null;
  sort_order?: number;
  is_active?: boolean;
  solution_kind: TransportSolutionKind;
  service_category?: ServiceCategory | null;
};

export type ServiceBodyTypeLink = {
  body_type_slug: string;
  priority: number;
  label?: string;
};

export function inferSolutionKind(
  slug: string,
  kind?: string | null,
): TransportSolutionKind {
  if (kind === 'service' || kind === 'vehicle') return kind;
  return slug === 'courier' ? 'service' : 'vehicle';
}

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
    solution_kind: inferSolutionKind(v.slug),
    service_category: inferServiceCategory(v.slug),
  }));
}

export function vehicleCapacityDisplay(
  v: Pick<RidesVehicleTypeDto, 'capacity_label' | 'seats'>,
): string {
  if (v.capacity_label?.trim()) return v.capacity_label.trim();
  if (v.seats <= 0) return 'Variable';
  return v.seats === 1 ? 'up to 1 passenger' : `up to ${v.seats} passengers`;
}

export function vehicleTypeLabelFromList(slug: string, types: RidesVehicleTypeDto[]): string {
  const hit = types.find((t) => t.slug === slug);
  if (hit) return hit.label;
  if (slug === 'standard') return 'UberX (legacy)';
  const fb = RIDES_VEHICLE_TYPES.find((v) => v.slug === slug);
  return fb?.label ?? slug;
}

function sortTypes(types: RidesVehicleTypeDto[]): RidesVehicleTypeDto[] {
  return [...types].sort(
    (a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug),
  );
}

export function activeVehicleTypes(types: RidesVehicleTypeDto[]): RidesVehicleTypeDto[] {
  return sortTypes(types.filter((t) => t.is_active));
}

export function splitTransportSolutions(types: RidesVehicleTypeDto[]) {
  const active = activeVehicleTypes(types);
  return {
    vehicles: active.filter((t) => t.solution_kind === 'vehicle'),
    services: active.filter((t) => t.solution_kind === 'service'),
  };
}

export function splitTransportSolutionsAll(types: RidesVehicleTypeDto[]) {
  const sorted = sortTypes(types);
  return {
    vehicles: sorted.filter((t) => t.solution_kind === 'vehicle'),
    services: sorted.filter((t) => t.solution_kind === 'service'),
  };
}

export const DEFAULT_VEHICLE_OPTION = DEFAULT_RIDES_VEHICLE_TYPE;
