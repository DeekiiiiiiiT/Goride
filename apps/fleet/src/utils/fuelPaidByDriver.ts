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

/** Company / fleet gas-card charges (not driver cash). Explicit paymentSource wins over type. */
export function isGasCardFuelEntry(entry: FuelEntry): boolean {
  if (entry.paymentSource === 'Gas_Card') return true;
  if (
    entry.paymentSource === 'RideShare_Cash' ||
    entry.paymentSource === 'Personal' ||
    entry.paymentSource === 'Petty_Cash'
  ) {
    return false;
  }
  if (entry.type === 'Card_Transaction') return true;
  return false;
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

/** Company gas-card charge total for fills belonging to this driver-week report. */
export function sumGasCardSpendForReport(
  entries: FuelEntry[],
  report: Pick<WeeklyFuelReport, 'weekStart' | 'weekEnd' | 'driverId' | 'vehicleId' | 'vehicleIds'>,
  vehicles: Vehicle[] = [],
  ctx?: DriverWeekAttributionContext,
): number {
  const attribution: DriverWeekAttributionContext = ctx || { vehicles };
  return entriesBelongingToDriverWeekReport(entries, report, attribution)
    .filter(isGasCardFuelEntry)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/** Estimated total fill spend from recon category buckets (card + cash combined). */
export function getReportTotalFuelSpend(report: {
  rideShareCost?: number;
  companyUsageCost?: number;
  deadheadCost?: number;
  personalUsageCost?: number;
  miscellaneousCost?: number;
}): number {
  return (
    (Number(report.rideShareCost) || 0) +
    (Number(report.companyUsageCost) || 0) +
    (Number(report.deadheadCost) || 0) +
    (Number(report.personalUsageCost) || 0) +
    (Number(report.miscellaneousCost) || 0)
  );
}

/**
 * Gas card spend frozen on the snapshot, or inferred for legacy finalized rows:
 * total recon spend − driver out-of-pocket cash.
 */
export function resolveReportGasCardSpend(report: {
  gasCardSpend?: number;
  driverSpend?: number;
  rideShareCost?: number;
  companyUsageCost?: number;
  deadheadCost?: number;
  personalUsageCost?: number;
  miscellaneousCost?: number;
}): number {
  if (typeof report.gasCardSpend === 'number' && Number.isFinite(report.gasCardSpend)) {
    return report.gasCardSpend;
  }
  const total = getReportTotalFuelSpend(report);
  const driverCash = Number(report.driverSpend) || 0;
  return Math.max(0, total - driverCash);
}
