/**
 * Single source of truth for fill → driver-week report belonging and Paid by Driver.
 * Uses resolveFuelFillDriver — same attribution as generateDriverFleetReport.
 */

import { FuelEntry, FuelCard, UNASSIGNED_FUEL_DRIVER_ID, WeeklyFuelReport } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { Trip } from '../types/data';
import { resolveFuelFillDriver } from './resolveFuelFillDriver';
import { isEntryInInclusiveYmdRange, reportWeekYmdBounds } from './fuelWeekPeriod';

const OUT_OF_POCKET_TYPES = new Set(['Reimbursement', 'Manual_Entry', 'Fuel_Manual_Entry']);

export type DriverWeekAttributionContext = {
  vehicles: Vehicle[];
  fuelCards?: FuelCard[];
  trips?: Trip[];
};

export function isOutOfPocketFuelEntry(entry: FuelEntry): boolean {
  return OUT_OF_POCKET_TYPES.has(entry.type);
}

/**
 * True when resolveFuelFillDriver attributes this fill to the report's driver
 * (or Unassigned sentinel). Does not use weaker primary-vehicle-only checks.
 */
export function entryBelongsToDriverWeekReport(
  entry: FuelEntry,
  report: Pick<WeeklyFuelReport, 'driverId' | 'weekStart' | 'weekEnd'>,
  ctx: DriverWeekAttributionContext,
): boolean {
  const { start, end } = reportWeekYmdBounds(report);
  if (!isEntryInInclusiveYmdRange(entry.date, start, end)) return false;

  const resolved = resolveFuelFillDriver({
    entry,
    vehicles: ctx.vehicles,
    fuelCards: ctx.fuelCards || [],
    trips: ctx.trips || [],
  });

  return resolved.driverId === report.driverId;
}

/** @deprecated Prefer entryBelongsToDriverWeekReport with attribution context. */
export function entryBelongsToReportDriver(
  entry: FuelEntry,
  report: Pick<WeeklyFuelReport, 'driverId' | 'vehicleId' | 'vehicleIds' | 'weekStart' | 'weekEnd'>,
  vehicle?: Vehicle | null,
  ctx?: DriverWeekAttributionContext,
): boolean {
  if (ctx) {
    return entryBelongsToDriverWeekReport(entry, report, ctx);
  }
  // Legacy fallback when callers have no trip/card context
  const vehicleIds = report.vehicleIds?.length ? report.vehicleIds : [report.vehicleId];
  if (report.driverId === UNASSIGNED_FUEL_DRIVER_ID) {
    return !entry.driverId && vehicleIds.includes(entry.vehicleId || '');
  }
  if (entry.driverId === report.driverId) return true;
  return (
    vehicleIds.includes(entry.vehicleId || '') &&
    !entry.driverId &&
    !!report.driverId &&
    report.driverId === vehicle?.currentDriverId
  );
}

/**
 * All fills that belong on this driver-week report (same attribution as recon rows).
 */
export function entriesBelongingToDriverWeekReport(
  entries: FuelEntry[],
  report: Pick<WeeklyFuelReport, 'driverId' | 'weekStart' | 'weekEnd'>,
  ctx: DriverWeekAttributionContext,
): FuelEntry[] {
  const { start, end } = reportWeekYmdBounds(report);
  return entries.filter(
    (e) =>
      isEntryInInclusiveYmdRange(e.date, start, end) &&
      entryBelongsToDriverWeekReport(e, report, ctx),
  );
}

export function sumPaidByDriverForReport(
  entries: FuelEntry[],
  report: Pick<WeeklyFuelReport, 'weekStart' | 'weekEnd' | 'driverId' | 'vehicleId' | 'vehicleIds'>,
  vehicles: Vehicle[] = [],
  ctx?: DriverWeekAttributionContext,
): number {
  const attribution: DriverWeekAttributionContext = ctx || { vehicles };
  return entriesBelongingToDriverWeekReport(entries, report, attribution)
    .filter(isOutOfPocketFuelEntry)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}
