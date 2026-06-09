import type { NavigateFunction } from 'react-router-dom';

type RoamMode = 'open_roam' | 'shadow_roam' | null | undefined;
type ParticipantRole = 'booker' | 'passenger' | 'driver' | 'none' | null | undefined;

/**
 * Shadow Roam status/receipt UI is for the paying booker only.
 * The in-car rider always uses /ride — roam_mode alone must never pick the screen.
 */
export function isShadowBookerTrip(
  participantRole: ParticipantRole,
  roamMode: RoamMode,
  bookerVisibility?: 'shadow' | 'open' | null,
): boolean {
  return participantRole === 'booker'
    && (roamMode === 'shadow_roam' || bookerVisibility === 'shadow');
}

export function delegatedRidePath(
  rideId: string,
  participantRole: ParticipantRole,
  roamMode: RoamMode,
  bookerVisibility?: 'shadow' | 'open' | null,
): string {
  return isShadowBookerTrip(participantRole, roamMode, bookerVisibility)
    ? `/shadow-trip/${rideId}`
    : `/ride/${rideId}`;
}

export function navigateToDelegatedRide(
  navigate: NavigateFunction,
  rideId: string,
  participantRole: ParticipantRole,
  roamMode: RoamMode,
  options?: { replace?: boolean; bookerVisibility?: 'shadow' | 'open' | null },
): void {
  const path = delegatedRidePath(
    rideId,
    participantRole,
    roamMode,
    options?.bookerVisibility,
  );
  navigate(path, options?.replace ? { replace: true } : undefined);
}
