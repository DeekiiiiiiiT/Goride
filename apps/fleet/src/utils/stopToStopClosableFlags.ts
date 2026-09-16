/**
 * Helper: stop-to-stop closable flags from weekly reports (client echo of server gate).
 */
import {
  evaluateStopToStopFromSnapshots,
  fuelOpsLiters,
  filterFuelOpsLogEntries,
  isEntryInInclusiveYmdRange,
} from '@roam/fuel-core';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';

export function stopToStopClosableFlagsFromReports(input: {
  reports: WeeklyFuelReport[];
  fuelEntries: FuelEntry[];
  weekStartYmd: string;
  weekEndYmd: string;
}): {
  stopToStopVolumeFailed?: boolean;
  stopToStopDistanceFailed?: boolean;
  stopToStopAttributionFailed?: boolean;
  stopToStopChainFailed?: boolean;
} {
  const hasBuckets = input.reports.some(
    (r) => Array.isArray(r.odometerBuckets) && r.odometerBuckets.length > 0,
  );
  if (!hasBuckets) return {};

  const weekOpsLiters = filterFuelOpsLogEntries(input.fuelEntries)
    .filter((e) => isEntryInInclusiveYmdRange(e.date, input.weekStartYmd, input.weekEndYmd))
    .reduce((s, e) => s + fuelOpsLiters(e), 0);

  const s2s = evaluateStopToStopFromSnapshots({
    snapshots: input.reports.map((r) => ({
      odometerBuckets: r.odometerBuckets,
      totalGasCardCost: r.totalGasCardCost,
    })),
    weekOpsLiters,
  });

  return {
    stopToStopVolumeFailed: s2s.stopToStopVolumeFailed,
    stopToStopDistanceFailed: s2s.stopToStopDistanceFailed,
    stopToStopAttributionFailed: s2s.stopToStopAttributionFailed,
    stopToStopChainFailed: s2s.stopToStopChainFailed,
  };
}
