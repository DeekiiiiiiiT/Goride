/**
 * Helper: stop-to-stop closable flags from weekly reports (client echo of server gate).
 * Week-closing buckets only — historical ledger-anchor windows must not block Finalize.
 */
import {
  applyStopToStopGapAccepts,
  evaluateStopToStopFromSnapshots,
  fuelTankLiters,
  filterFuelOpsLogEntries,
  isEntryInInclusiveYmdRange,
  selectOdometerBucketsClosingInWeek,
  type StopToStopGapAccept,
} from '@roam/fuel-core';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';

export function stopToStopClosableFlagsFromReports(input: {
  reports: WeeklyFuelReport[];
  fuelEntries: FuelEntry[];
  weekStartYmd: string;
  weekEndYmd: string;
  /** Audited OVER-LOG accepts for this period (clears attribution when complete). */
  gapAccepts?: StopToStopGapAccept[] | null;
}): {
  stopToStopVolumeFailed?: boolean;
  stopToStopDistanceFailed?: boolean;
  stopToStopAttributionFailed?: boolean;
  stopToStopChainFailed?: boolean;
} {
  const weekBuckets = selectOdometerBucketsClosingInWeek(
    input.reports.flatMap((r) => r.odometerBuckets || []),
    input.weekStartYmd,
    input.weekEndYmd,
  );
  if (!weekBuckets.length) return {};

  const weekOpsLiters = filterFuelOpsLogEntries(input.fuelEntries)
    .filter((e) => isEntryInInclusiveYmdRange(e.date, input.weekStartYmd, input.weekEndYmd))
    .reduce((s, e) => s + fuelTankLiters(e), 0);

  // One synthetic snapshot so conservation uses the week-closing set only.
  const s2s = evaluateStopToStopFromSnapshots({
    snapshots: [{ odometerBuckets: weekBuckets, totalGasCardCost: 1 }],
    weekOpsLiters,
  });

  const applied = applyStopToStopGapAccepts(
    {
      stopToStopVolumeFailed: s2s.stopToStopVolumeFailed,
      stopToStopDistanceFailed: s2s.stopToStopDistanceFailed,
      stopToStopAttributionFailed: s2s.stopToStopAttributionFailed,
      stopToStopChainFailed: s2s.stopToStopChainFailed,
      stopToStopTripsTruncated: s2s.stopToStopTripsTruncated,
    },
    weekBuckets,
    input.gapAccepts,
  );

  return {
    stopToStopVolumeFailed: applied.stopToStopVolumeFailed,
    stopToStopDistanceFailed: applied.stopToStopDistanceFailed,
    stopToStopAttributionFailed: applied.stopToStopAttributionFailed,
    stopToStopChainFailed: applied.stopToStopChainFailed,
  };
}
