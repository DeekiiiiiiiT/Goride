import { useMemo } from 'react';
import { FuelEntry, FuelCycle } from '../types/fuel';
import { calculateFuelCycles } from '../utils/fuelCycleEngine';
import { Vehicle } from '../types/vehicle';

export type UseFuelCyclesOptions = {
  weekStart?: string;
  weekEnd?: string;
  /** Kept for callers; client engine is the Full Tanks source of truth. */
  legacyClient?: boolean;
};

/**
 * Builds Full Tanks cycles from loaded entries (full lookback on the page).
 * Week filter keeps only cycles that overlap the selected period after tank math runs.
 */
export function useFuelCycles(
  entries: FuelEntry[],
  vehicles: Vehicle[] = [],
  opts: UseFuelCyclesOptions = {},
): FuelCycle[] {
  return useMemo(() => {
    if (!entries?.length) return [];
    const all = calculateFuelCycles(entries, vehicles);
    if (!opts.weekStart && !opts.weekEnd) return all;
    return all.filter((c) => {
      const start = String(c.startDate || '').split('T')[0];
      const end = String(c.endDate || '').split('T')[0];
      if (opts.weekEnd && start && start > opts.weekEnd) return false;
      if (opts.weekStart && end && end < opts.weekStart) return false;
      return true;
    });
  }, [entries, vehicles, opts.weekStart, opts.weekEnd]);
}
