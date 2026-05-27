import type { RideRequestStatus } from '@roam/types/rides';

const TRACKING_STATUSES: RideRequestStatus[] = [
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
  'on_trip',
];

export function isRideLocationTrackingStatus(status: RideRequestStatus | undefined): boolean {
  return Boolean(status && TRACKING_STATUSES.includes(status));
}

/** Monotonic client sequence per ride session (resets when ride id changes). */
export function nextClientSeq(current: number): number {
  if (!Number.isFinite(current) || current < 0) return 1;
  return current + 1;
}
