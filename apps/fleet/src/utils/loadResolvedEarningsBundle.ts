/**
 * Client loader: earnings policies + legacy prefs → resolve for a driver-week.
 * Used by Drivers list, DriverDetail badges, and driver portal.
 */

import type { ResolvedEarningsBundle } from '../types/earningsPolicy';
import type { EarningsPolicy } from '../types/earningsPolicy';
import { earningsPolicyService } from '../services/earningsPolicyService';
import { tierService } from '../services/tierService';
import {
  resolveActiveEarningsBundleForDriverWeek,
  type LegacyEarningsConfig,
} from './earningsPolicyResolve';
import { mondayYmdForDate } from './earningsPolicyVersion';
import {
  createDefaultTiers,
  createEmptyQuotas,
  createDefaultPersonalAllowance,
} from './earningsPolicyDefaults';

export type EarningsPolicyRuntimeContext = {
  policies: EarningsPolicy[];
  legacy: LegacyEarningsConfig;
};

export async function loadEarningsPolicyRuntimeContext(): Promise<EarningsPolicyRuntimeContext> {
  const [policies, tiers, quotas, personalAllowance] = await Promise.all([
    earningsPolicyService.getEarningsPolicies().catch(() => [] as EarningsPolicy[]),
    tierService.getTiers().catch(() => createDefaultTiers()),
    tierService.getQuotaSettings().catch(() => createEmptyQuotas()),
    tierService.getPersonalAllowanceSettings().catch(() => createDefaultPersonalAllowance()),
  ]);

  return {
    policies,
    legacy: { tiers, quotas, personalAllowance },
  };
}

export function resolveBundleFromContext(
  ctx: EarningsPolicyRuntimeContext,
  driverId: string | null | undefined,
  weekStartYmd?: string,
): ResolvedEarningsBundle {
  const week = weekStartYmd || mondayYmdForDate(new Date());
  return resolveActiveEarningsBundleForDriverWeek({
    policies: ctx.policies,
    driverId,
    weekStartYmd: week,
    legacy: ctx.legacy,
  });
}

/** One-shot: load policies + legacy and resolve for this driver this week. */
export async function loadResolvedEarningsBundleForDriverWeek(
  driverId: string | null | undefined,
  weekStartYmd?: string,
): Promise<ResolvedEarningsBundle> {
  const ctx = await loadEarningsPolicyRuntimeContext();
  return resolveBundleFromContext(ctx, driverId, weekStartYmd);
}
