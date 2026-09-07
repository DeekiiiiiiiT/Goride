/**
 * Earnings donut for Financials — period ledger platformStats (same SSOT as Overview).
 * Trip aggregation is fallback only when ledger has no per-platform earnings.
 */
import { useMemo } from 'react';
import type { Trip } from '../../../types/data';
import { getEffectiveTripEarnings } from '../../../utils/tripEarnings';
import { normalizePlatform } from '../../../utils/normalizePlatform';

const PLATFORM_COLORS: Record<string, string> = {
  Uber: '#3b82f6',
  InDrive: '#10b981',
  Roam: '#f59e0b',
  Private: '#ec4899',
  Cash: '#84cc16',
  Other: '#94a3b8',
};

export type PlatformBreakdownRow = { name: string; value: number; color: string };

function toChartRows(totals: Record<string, number>): PlatformBreakdownRow[] {
  return Object.entries(totals)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: PLATFORM_COLORS[name] || '#94a3b8',
    }));
}

/** Pure builder — period ledger stats first, completed trips as fallback. */
export function buildPlatformBreakdownData(
  allTrips: Trip[],
  periodPlatformStats?: Record<string, { earnings?: number } | null> | null,
): PlatformBreakdownRow[] {
  const fromPeriod: Record<string, number> = {};
  for (const [rawPlat, stats] of Object.entries(periodPlatformStats || {})) {
    if (rawPlat === 'Dispute Recoveries') continue;
    const name = normalizePlatform(rawPlat);
    const earnings = Number(stats?.earnings) || 0;
    if (earnings > 0) fromPeriod[name] = (fromPeriod[name] || 0) + earnings;
  }
  if (Object.keys(fromPeriod).length > 0) {
    return toChartRows(fromPeriod);
  }

  const platformTotals: Record<string, number> = {};
  for (const trip of allTrips || []) {
    if (trip.status !== 'Completed') continue;
    const platform = normalizePlatform(trip.platform);
    platformTotals[platform] =
      (platformTotals[platform] || 0) + getEffectiveTripEarnings(trip);
  }
  return toChartRows(platformTotals);
}

export function useDriverPlatformBreakdown(
  allTrips: Trip[],
  /** Period platformStats from resolveDriverDetailFinancials — primary source. */
  periodPlatformStats?: Record<string, { earnings?: number } | null> | null,
) {
  const platformBreakdownData = useMemo(
    () => buildPlatformBreakdownData(allTrips, periodPlatformStats),
    [periodPlatformStats, allTrips],
  );

  const platformTotalEarnings = useMemo(
    () => platformBreakdownData.reduce((sum, d) => sum + d.value, 0),
    [platformBreakdownData],
  );

  return { platformBreakdownData, platformTotalEarnings };
}
