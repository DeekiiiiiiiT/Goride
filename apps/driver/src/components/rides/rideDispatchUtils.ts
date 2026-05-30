import type { RideRequestRow } from '@roam/types/rides';

export function statusTitle(r: RideRequestRow | null): string {
  if (!r) return '—';
  switch (r.status) {
    case 'matching':
      return 'Matching…';
    case 'driver_assigned':
      return 'Assigned — start heading to pickup';
    case 'driver_en_route_pickup':
      return 'En route to pickup';
    case 'driver_arrived_pickup':
      return 'Arrived at pickup';
    case 'on_trip':
      return 'On trip';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return r.status;
  }
}

export function slugFromBodyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 31);
}

export function offerSecondsRemaining(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

const KM_TO_MI = 0.621371;

/** Display distance in miles (matches common dispatch offer UIs). */
export function formatOfferDistanceMi(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  return `${(km * KM_TO_MI).toFixed(2)} mi`;
}

/** Rough drive time to pickup from straight-line km (urban ~35 km/h). */
export function estimatePickupMinutes(distanceKm: number | null | undefined): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  return Math.max(1, Math.round((distanceKm / 35) * 60));
}
