import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';

const STATUS_ORDER: Record<RideRequestStatus, number> = {
  matching: 0,
  driver_assigned: 1,
  driver_en_route_pickup: 2,
  driver_arrived_pickup: 3,
  on_trip: 4,
  completed: 5,
  cancelled: 5,
};

type RideWithOptionalPin = RideRequestRow & { verification_pin?: string | null };

/** Strip server PIN from driver payloads; derive a stable pending flag. */
export function normalizeDriverRide(ride: RideWithOptionalPin): RideRequestRow {
  const { verification_pin: pin, ...rest } = ride;
  const pinPending = Boolean(
    ride.pin_verification_pending ?? (pin && !ride.pin_verified_at),
  );
  return { ...rest, pin_verification_pending: pinPending };
}

function statusRank(status: RideRequestStatus | undefined): number {
  if (!status) return -1;
  return STATUS_ORDER[status] ?? -1;
}

/** Merge GPS/realtime updates without regressing lifecycle status or PIN flags. */
export function mergeDriverActiveRide(
  prev: RideRequestRow | null,
  incoming: RideWithOptionalPin,
): RideRequestRow {
  const next = normalizeDriverRide(incoming);
  if (!prev || prev.id !== next.id) return next;

  if (next.status === 'cancelled' || next.status === 'completed') {
    return next;
  }

  const keepStatus = statusRank(prev.status) > statusRank(next.status) ? prev.status : next.status;

  return normalizeDriverRide({
    ...prev,
    ...next,
    status: keepStatus,
    arrived_pickup_at: next.arrived_pickup_at ?? prev.arrived_pickup_at,
    wait_time_started_at: next.wait_time_started_at ?? prev.wait_time_started_at,
    en_route_at: next.en_route_at ?? prev.en_route_at,
    trip_started_at: next.trip_started_at ?? prev.trip_started_at,
    pin_verified_at: next.pin_verified_at ?? prev.pin_verified_at,
    complete_suggested_at: next.complete_suggested_at ?? prev.complete_suggested_at,
    pin_verification_pending: next.pin_verification_pending || prev.pin_verification_pending,
  });
}
