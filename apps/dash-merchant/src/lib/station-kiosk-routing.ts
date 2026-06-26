import { readFlag } from './partner-feature-flags';
import { getActingStation, readShift } from './station-shift-session';
import { resolveStaffOpsRoute, type StaffOpsRoute } from './staff-ops-routing';
import type { MerchantMembership } from '../types/team';

export type StationKioskRoute = StaffOpsRoute | 'kiosk' | null;

export function isStationPinEnabled(merchantId: string): boolean {
  return readFlag(merchantId, 'staffOperationsV1') && readFlag(merchantId, 'staffStationPinV1');
}

export function canUseStationKiosk(membership: MerchantMembership | null | undefined): boolean {
  if (!membership) return false;
  return membership.is_owner || membership.role === 'manager' || membership.role === 'admin';
}

/** Orders-tab routing when station PIN flags are on. */
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

  const activeStation = getActingStation(merchantId);
  if (activeStation) return activeStation;

  if (readShift(merchantId)) return null;

  return 'kiosk';
}
