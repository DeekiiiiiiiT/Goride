import { readFlag } from './partner-feature-flags';
import type { MerchantMembership } from '../types/team';

export type StaffOpsRoute = 'counter' | 'kitchen' | null;

export function resolveStaffOpsRoute(
  merchantId: string,
  membership: MerchantMembership | null | undefined,
): StaffOpsRoute {
  if (!membership || membership.is_owner) return null;
  if (!readFlag(merchantId, 'staffOperationsV1')) return null;
  const station = membership.job_station;
  if (station === 'counter' || station === 'kitchen') return station;
  return null;
}
