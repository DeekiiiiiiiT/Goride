/**
 * Shared period-derivation helpers — landing and wizard must agree (M6/M7).
 */
import type { FuelDispute, FinalizedFuelReport, WeeklyFuelReport } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';
import { reportWeekYmdBounds, toEntryYmd } from './fuelWeekPeriod';
import { isSameFuelStatement } from './fuelWeekPeriod';

/** Dispute open in this Monday–Sunday week — YMD-normalized (never raw string split alone). */
export function isFuelDisputeOpenInWeek(
  d: FuelDispute,
  weekStartYmd: string,
  weekEndYmd: string,
): boolean {
  if (d.status !== 'Open') return false;
  const ws = toEntryYmd(d.weekStart);
  if (ws) return ws === weekStartYmd;
  const we = toEntryYmd(d.weekEnd);
  if (we) return we >= weekStartYmd && we <= weekEndYmd;
  const created = toEntryYmd((d as any).createdAt);
  return created ? created >= weekStartYmd && created <= weekEndYmd : false;
}

/** Finalized snapshot for a vehicle in a week — vehicle match first, then unclaimed driver match. */
export function findFinalizedSnapForVehicle(opts: {
  finalizedReports: FinalizedFuelReport[];
  vehicle: Vehicle;
  weekStartYmd: string;
  claimedKeys: Set<string>;
}): FinalizedFuelReport | undefined {
  const { finalizedReports, vehicle, weekStartYmd, claimedKeys } = opts;
  const byVehicle = finalizedReports.find(
    (f) => toEntryYmd(f.weekStart) === weekStartYmd && f.vehicleId === vehicle.id,
  );
  if (byVehicle) {
    const key = `fin:${byVehicle.driverId || byVehicle.vehicleId}:${weekStartYmd}`;
    if (!claimedKeys.has(key)) {
      claimedKeys.add(key);
      return byVehicle;
    }
  }
  if (!vehicle.currentDriverId) return undefined;
  const byDriver = finalizedReports.find(
    (f) => toEntryYmd(f.weekStart) === weekStartYmd && f.driverId === vehicle.currentDriverId,
  );
  if (!byDriver) return undefined;
  const key = `fin:${byDriver.driverId || byDriver.vehicleId}:${weekStartYmd}`;
  if (claimedKeys.has(key)) return undefined;
  claimedKeys.add(key);
  return byDriver;
}

export function findLiveReportForVehicle(
  reports: WeeklyFuelReport[],
  vehicleId: string,
): WeeklyFuelReport | undefined {
  return reports.find(
    (r) =>
      r.vehicleId === vehicleId ||
      (Array.isArray(r.vehicleIds) && r.vehicleIds.includes(vehicleId)),
  );
}

export function isReportFinalizedForPeriod(
  finalizedReports: FinalizedFuelReport[],
  report: WeeklyFuelReport,
): boolean {
  return finalizedReports.some((f) => isSameFuelStatement(f, report));
}

export function reportWeekBoundsSafe(report: Pick<WeeklyFuelReport, 'weekStart' | 'weekEnd'>): {
  start: string;
  end: string;
} {
  return reportWeekYmdBounds(report);
}
