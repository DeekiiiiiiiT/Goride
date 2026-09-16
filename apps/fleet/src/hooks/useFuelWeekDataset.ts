/**
 * P-1: week-scoped fuel recon dataset — filter once at the wizard boundary.
 * Does not fetch; parent/hooks own loading. Keeps landing free of whole-fleet churn.
 */
import { useMemo } from 'react';
import type { FinalizedFuelReport, FuelEntry, MileageAdjustment } from '../types/fuel';
import type { Trip } from '../types/data';
import { isEntryInInclusiveYmdRange } from '../utils/fuelWeekPeriod';

export function useFuelWeekDataset(input: {
  weekStart: string;
  weekEnd: string;
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  trips: Trip[];
  finalizedReports: FinalizedFuelReport[];
}) {
  const { weekStart, weekEnd, fuelEntries, adjustments, trips, finalizedReports } = input;
  return useMemo(
    () => ({
      fuelEntries: fuelEntries.filter((e) =>
        isEntryInInclusiveYmdRange(e.date, weekStart, weekEnd),
      ),
      adjustments: adjustments.filter((a) =>
        isEntryInInclusiveYmdRange(a.date, weekStart, weekEnd),
      ),
      trips: trips.filter((t) => isEntryInInclusiveYmdRange(t.date, weekStart, weekEnd)),
      finalizedReports: finalizedReports.filter(
        (f) => String(f.weekStart || '').split('T')[0] === weekStart,
      ),
    }),
    [weekStart, weekEnd, fuelEntries, adjustments, trips, finalizedReports],
  );
}
