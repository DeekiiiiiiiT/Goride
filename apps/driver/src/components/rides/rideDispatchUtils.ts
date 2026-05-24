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
