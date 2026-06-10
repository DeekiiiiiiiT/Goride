/**
 * Shadow Roam payer UI copy — single source for all payer-facing surfaces.
 * During an active shadow trip the payer sees only generic "Shadow Roam" text.
 */

import { SHADOW_ROAM_LABEL } from '@/lib/tripIntentCopy';
import { isShadowBookerTrip } from '@/lib/delegatedRideNavigation';

type RoamMode = 'open_roam' | 'shadow_roam' | null | undefined;
type ParticipantRole = 'booker' | 'passenger' | 'driver' | 'none' | null | undefined;

export const SHADOW_PAYER_ACTIVE_TITLE = SHADOW_ROAM_LABEL;

/** Static line on in-progress surfaces — no driver, ETA, or location hints. */
export const SHADOW_PAYER_ACTIVE_SUBTITLE =
  "You'll be notified when the trip is complete.";

export function isShadowPayer(
  participantRole: ParticipantRole,
  roamMode: RoamMode,
  bookerVisibility?: 'shadow' | 'open' | null,
): boolean {
  return isShadowBookerTrip(participantRole, roamMode, bookerVisibility);
}

/** Hub banner + list rows while a shadow trip is live (booked ride or booked intent). */
export function isShadowPayerActiveTrip(
  roamMode: RoamMode,
  status?: string | null,
): boolean {
  if (roamMode !== 'shadow_roam') return false;
  if (!status) return true;
  return status === 'booked' || status === 'on_trip' || status === 'matching'
    || status === 'driver_assigned' || status === 'driver_en_route_pickup'
    || status === 'driver_arrived_pickup';
}

export function shadowPayerHubBannerCopy(
  participantRole: ParticipantRole,
  roamMode: RoamMode,
  rideStatus?: string | null,
): { title: string; subtitle: string; detail: null; isShadow: boolean } {
  const isShadow = isShadowPayer(participantRole, roamMode)
    && isShadowPayerActiveTrip(roamMode, rideStatus);
  if (isShadow) {
    return {
      title: SHADOW_PAYER_ACTIVE_TITLE,
      subtitle: SHADOW_PAYER_ACTIVE_SUBTITLE,
      detail: null,
      isShadow: true,
    };
  }
  return {
    title: '',
    subtitle: '',
    detail: null,
    isShadow: false,
  };
}

export function shadowPayerActivityRowCopy(
  roamMode: RoamMode,
  status: string,
  kind: 'ride' | 'trip_intent',
): { title: string; subtitle: string; detail: null; useShadowCopy: boolean } {
  const live = kind === 'ride' || status === 'booked';
  if (roamMode !== 'shadow_roam' || !live) {
    return { title: '', subtitle: '', detail: null, useShadowCopy: false };
  }
  return {
    title: SHADOW_PAYER_ACTIVE_TITLE,
    subtitle: SHADOW_PAYER_ACTIVE_SUBTITLE,
    detail: null,
    useShadowCopy: true,
  };
}
