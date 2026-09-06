/**
 * Client loader: earnings policies + legacy prefs → resolve for a driver-week.
 * Used by Drivers list, DriverDetail badges, and driver portal.
 */

import type { ResolvedEarningsBundle } from '../types/earningsPolicy';
import type { EarningsPolicy } from '../types/earningsPolicy';
import { earningsPolicyService } from '../services/earningsPolicyService';
import { api } from '../services/api';
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
import { mergePersonalAllowanceDefaults } from './personalAllowance';

export type EarningsPolicyRuntimeContext = {
  policies: EarningsPolicy[];
  legacy: LegacyEarningsConfig;
};

export async function loadEarningsPolicyRuntimeContext(): Promise<EarningsPolicyRuntimeContext> {
  // Single prefs GET (also cached) — never fan out 3× getPreferences via tierService (ROAM-FLEET-10).
  const [policies, prefs] = await Promise.all([
    earningsPolicyService.getEarningsPolicies().catch(() => [] as EarningsPolicy[]),
    api.getPreferences().catch(() => ({}) as Record<string, unknown>),
  ]);

  const tiers =
    Array.isArray(prefs?.tiers) && prefs.tiers.length > 0
      ? prefs.tiers
      : createDefaultTiers();
  const quotas = prefs?.quotas || createEmptyQuotas();
  const personalAllowance = prefs?.personalAllowance
    ? mergePersonalAllowanceDefaults(prefs.personalAllowance)
    : createDefaultPersonalAllowance();

  return {
    policies,
    legacy: { tiers, quotas, personalAllowance },
  };
}

export function resolveBundleFromContext(
  ctx: EarningsPolicyRuntimeContext,
  driverId: string | null | undefined,
  weekStartYmd?: string,
  serviceLine?: 'rideshare' | 'rush_delivery',
): ResolvedEarningsBundle {
  const week = weekStartYmd || mondayYmdForDate(new Date());
  return resolveActiveEarningsBundleForDriverWeek({
    policies: ctx.policies,
    driverId,
    weekStartYmd: week,
    legacy: ctx.legacy,
    serviceLine,
  });
}

/** One-shot: load policies + legacy and resolve for this driver this week. */
export async function loadResolvedEarningsBundleForDriverWeek(
  driverId: string | null | undefined,
  weekStartYmd?: string,
  serviceLine?: 'rideshare' | 'rush_delivery',
): Promise<ResolvedEarningsBundle> {
  const ctx = await loadEarningsPolicyRuntimeContext();
  return resolveBundleFromContext(ctx, driverId, weekStartYmd, serviceLine);
}
