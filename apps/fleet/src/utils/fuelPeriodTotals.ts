/**
 * Canonical period distance for Transaction Logs + Full Tanks.
 * Primary = sum of overlapping cycle distances (period-attributed km).
 * Secondary = fill-to-fill odo deltas within the scoped window (excludes leg into first fill).
 */
import type { FuelCycle, FuelEntry } from '../types/fuel';
import { sumOdometerDeltasBetweenFills } from './fuelLogKpiMetrics';

export type PeriodDistance = {
  /** Canonical — use on both tabs */
  primaryKm: number;
  /** Fill-to-fill within scoped entries */
  fillToFillKm: number;
  primaryLabel: string;
  secondaryLabel: string;
};

export function resolvePeriodDistance(
  cycles: FuelCycle[],
  scopedEntries: FuelEntry[],
): PeriodDistance {
  const primaryKm = Math.round(
    cycles.reduce((s, c) => s + (Number(c.distance) || 0), 0) * 100,
  ) / 100;
  const fillToFillKm = sumOdometerDeltasBetweenFills(scopedEntries);
  return {
    primaryKm,
    fillToFillKm,
    primaryLabel: 'Period distance (capacity-close cycles)',
    secondaryLabel: 'Fill-to-fill (excludes leg into first fill)',
  };
}
