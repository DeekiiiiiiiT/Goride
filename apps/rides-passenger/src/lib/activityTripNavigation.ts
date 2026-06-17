import type { NavigateFunction } from 'react-router-dom';
import type {
  ActivityTripCategory,
  ActivityTripHistoryItem,
  ActivityTripParticipantRole,
  RideRequestRow,
} from '@roam/types/rides';
import { delegatedRidePath, isShadowBookerTrip } from '@/lib/delegatedRideNavigation';

export function activityTripFromRide(
  ride: RideRequestRow,
  options?: {
    participantRole?: ActivityTripParticipantRole;
    tripCategory?: ActivityTripCategory;
    counterpartyName?: string | null;
  },
): ActivityTripHistoryItem | null {
  if (ride.status !== 'completed' && ride.status !== 'cancelled') return null;
  return {
    kind: 'ride',
    ride_id: ride.id,
    status: ride.status,
    roam_mode: ride.roam_mode === 'shadow_roam' ? 'shadow_roam' : 'open_roam',
    participant_role: options?.participantRole ?? 'passenger',
    trip_category: options?.tripCategory ?? 'self',
    counterparty_name: options?.counterpartyName ?? ride.guest_passenger_name ?? null,
    pickup_address: ride.pickup_address ?? null,
    dropoff_address: ride.dropoff_address ?? null,
    fare_estimate_minor: ride.fare_final_minor != null
      ? String(ride.fare_final_minor)
      : ride.fare_estimate_minor != null
        ? String(ride.fare_estimate_minor)
        : null,
    currency: ride.currency ?? 'JMD',
    created_at: ride.created_at,
    ended_at: ride.completed_at ?? ride.updated_at ?? ride.created_at,
  };
}

export function activityTripPath(trip: ActivityTripHistoryItem): string {
  const { ride_id, status, roam_mode, participant_role } = trip;
  if (
    isShadowBookerTrip(participant_role, roam_mode)
    && (status === 'completed' || status === 'cancelled')
  ) {
    return `/shadow-trip/${ride_id}/receipt`;
  }
  return delegatedRidePath(ride_id, participant_role, roam_mode);
}

export function navigateToActivityTrip(
  navigate: NavigateFunction,
  trip: ActivityTripHistoryItem,
  options?: { replace?: boolean },
): void {
  navigate(activityTripPath(trip), options?.replace ? { replace: true } : undefined);
}
