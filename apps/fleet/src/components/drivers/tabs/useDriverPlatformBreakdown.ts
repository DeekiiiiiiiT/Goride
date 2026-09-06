/**
 * Earnings donut inputs for Financials — trip earnings hybrid with ledger lifetime override.
 * Extracted from DriverDetail (Round 4 Phase 3) — behavior unchanged.
 */
import { useMemo } from 'react';
import type { Trip } from '../../../types/data';
import { getEffectiveTripEarnings } from '../../../utils/tripEarnings';
import { normalizePlatform } from '../../../utils/normalizePlatform';

export function useDriverPlatformBreakdown(
  allTrips: Trip[],
  lifetimePlatformStats: Record<string, any> | null | undefined,
) {
  // Base: completed-trip earnings per platform. Ledger lifetime override when > 0.
  const platformBreakdownData = useMemo(() => {
    const colors: Record<string, string> = {
      Uber: '#3b82f6',
      InDrive: '#10b981',
      Roam: '#f59e0b',
      Private: '#ec4899',
      Cash: '#84cc16',
      Other: '#94a3b8',
    };

    const completed = (allTrips || []).filter((t) => t.status === 'Completed');
    const platformTotals: Record<string, number> = {};
    completed.forEach((trip) => {
      const platform = normalizePlatform(trip.platform);
      platformTotals[platform] =
        (platformTotals[platform] || 0) + getEffectiveTripEarnings(trip);
    });

    const ltStats = lifetimePlatformStats || {};
    const merged: Record<string, number> = { ...platformTotals };
    for (const [rawPlat, stats] of Object.entries(ltStats)) {
      if (rawPlat === 'Dispute Recoveries') continue;
      const name = normalizePlatform(rawPlat);
      const le = Number((stats as any)?.earnings) || 0;
      if (le > 0) merged[name] = le;
    }

    return Object.entries(merged)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value, color: colors[name] || '#94a3b8' }));
  }, [lifetimePlatformStats, allTrips]);

  const platformTotalEarnings = useMemo(
    () => platformBreakdownData.reduce((sum, d) => sum + d.value, 0),
    [platformBreakdownData],
  );

  return { platformBreakdownData, platformTotalEarnings };
}
