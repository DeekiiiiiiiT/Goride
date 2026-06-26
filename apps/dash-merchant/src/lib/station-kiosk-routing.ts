import { readFlag } from './partner-feature-flags';
import { getActingKioskRoute, readShift } from './station-shift-session';
import { resolveStaffOpsRoute, type StaffOpsRoute } from './staff-ops-routing';
import type { MerchantMembership } from '../types/team';

export type StationKioskRoute = StaffOpsRoute | 'manager' | 'kiosk' | null;

export function isStationPinEnabled(merchantId: string): boolean {
  return readFlag(merchantId, 'staffOperationsV1') && readFlag(merchantId, 'staffStationPinV1');
}

export function canUseStationKiosk(membership: MerchantMembership | null | undefined): boolean {
  if (!membership) return false;
  return membership.is_owner || membership.role === 'manager' || membership.role === 'admin';
}

/** Orders-tab routing when station PIN flags are on (store tablet only — not partner owner app). */
export function resolveStationKioskRoute(
  merchantId: string,
  membership: MerchantMembership | null | undefined,
): StationKioskRoute {
  if (!isStationPinEnabled(merchantId)) {
    return resolveStaffOpsRoute(merchantId, membership);
  }

  if (!canUseStationKiosk(membership)) {
    return resolveStaffOpsRoute(merchantId, membership);
  }

  const activeRoute = getActingKioskRoute(merchantId, 'owner_kiosk');
  if (activeRoute) return activeRoute;

  if (readShift(merchantId, 'owner_kiosk')) return null;

  return 'kiosk';
}
