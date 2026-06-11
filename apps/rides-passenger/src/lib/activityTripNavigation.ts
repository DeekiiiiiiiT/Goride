import type { NavigateFunction } from 'react-router-dom';
import type { ActivityTripHistoryItem } from '@roam/types/rides';
import { delegatedRidePath, isShadowBookerTrip } from '@/lib/delegatedRideNavigation';

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
