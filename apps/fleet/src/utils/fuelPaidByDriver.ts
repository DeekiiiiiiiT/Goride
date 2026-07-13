/**
 * Single source of truth for "Paid by Driver" (out-of-pocket cash / reimbursement)
 * attribution on a driver-week fuel report.
 */

import { FuelEntry, UNASSIGNED_FUEL_DRIVER_ID, WeeklyFuelReport } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { isEntryInInclusiveYmdRange, reportWeekYmdBounds } from './fuelWeekPeriod';

const OUT_OF_POCKET_TYPES = new Set(['Reimbursement', 'Manual_Entry', 'Fuel_Manual_Entry']);

export function isOutOfPocketFuelEntry(entry: FuelEntry): boolean {
  return OUT_OF_POCKET_TYPES.has(entry.type);
}

/** Driver-week attribution matching ReconciliationTable row logic. */
export function entryBelongsToReportDriver(
  entry: FuelEntry,
  report: Pick<WeeklyFuelReport, 'driverId' | 'vehicleId' | 'vehicleIds'>,
  vehicle?: Vehicle | null,
): boolean {
  const vehicleIds = report.vehicleIds?.length ? report.vehicleIds : [report.vehicleId];

  if (report.driverId === UNASSIGNED_FUEL_DRIVER_ID) {
    return !entry.driverId && vehicleIds.includes(entry.vehicleId || '');
  }

  if (entry.driverId === report.driverId) return true;

  // Untagged fill on a report vehicle while this driver is current assignee
  return (
    vehicleIds.includes(entry.vehicleId || '') &&
    !entry.driverId &&
    !!report.driverId &&
    report.driverId === vehicle?.currentDriverId
  );
}

export function sumPaidByDriverForReport(
  entries: FuelEntry[],
  report: Pick<WeeklyFuelReport, 'weekStart' | 'weekEnd' | 'driverId' | 'vehicleId' | 'vehicleIds'>,
  vehicles: Vehicle[] = [],
): number {
  const { start, end } = reportWeekYmdBounds(report);
  const vehicle = vehicles.find((v) => v.id === report.vehicleId);

  return entries
    .filter(
      (e) =>
        isOutOfPocketFuelEntry(e) &&
        isEntryInInclusiveYmdRange(e.date, start, end) &&
        entryBelongsToReportDriver(e, report, vehicle),
    )
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}
