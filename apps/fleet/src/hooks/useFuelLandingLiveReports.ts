/**
 * Open weeks on the list use the server snapshot (period.computedAt).
 * This hook no longer runs the browser week engine.
 */
import { isYmdInFuelWeek } from '../utils/fuelWeekPeriod';
import { FUEL_SPEND_EPS } from '../utils/fuelMoneyEpsilon';
import { fuelOpsSpendAmount } from '../utils/fuelOpsEligibility';
import type {
  FinalizedFuelReport,
  FuelCard,
  FuelDispute,
  FuelEntry,
  FuelScenario,
  MileageAdjustment,
} from '../types/fuel';
import type { Vehicle } from '../types/vehicle';

export type FuelLandingLiveSlice = {
  vehicleId: string;
  totalGasCardCost: number;
  companyShare: number;
  driverShare: number;
  miscellaneousCost: number;
  healthStatus?: string;
  pendingCount?: number;
};

/** Cap concurrent open-week calcs so landing refresh stays responsive. No hard week ceiling (M2). */
export const FUEL_LANDING_LIVE_CONCURRENCY = 3;

export type FuelLandingLiveReportsInput = {
  weekOptions: Array<{ startDate: string; endDate: string }>;
  /** Server-computed / locked weeks — never schedule browser week engines (M1 / NEW-11). */
  serverSkipWeekStarts?: Set<string>;
  vehicles: Vehicle[];
  drivers: Array<{ id: string; fuelScenarioId?: string; name?: string; driverId?: string }>;
  fuelEntries: FuelEntry[];
  adjustments: MileageAdjustment[];
  scenarios: FuelScenario[];
  fuelCards: FuelCard[];
  disputes: FuelDispute[];
  finalizedReports: FinalizedFuelReport[];
};

export function weekNeedsLiveCalc(
  startDate: string,
  endDate: string,
  fuelEntries: FuelEntry[],
  vehicles: Vehicle[],
  finalizedReports: FinalizedFuelReport[],
  serverSkipWeekStarts?: Set<string>,
): boolean {
  if (serverSkipWeekStarts?.has(startDate)) return false;

  const weekEntries = fuelEntries.filter((e) => isYmdInFuelWeek(e.date, startDate, endDate));
  if (weekEntries.length === 0) return false;

  // Any vehicle with spend still missing a finalized snapshot → need live misc/shares.
  for (const vehicle of vehicles) {
    const vEntries = weekEntries.filter((e) => e.vehicleId === vehicle.id);
    const spend = vEntries.reduce((s, e) => s + fuelOpsSpendAmount(e), 0);
    if (spend <= FUEL_SPEND_EPS) continue;
    const snap = finalizedReports.some(
      (f) =>
        String(f.weekStart).split('T')[0] === startDate &&
        (f.vehicleId === vehicle.id ||
          (vehicle.currentDriverId && f.driverId === vehicle.currentDriverId)),
    );
    if (!snap) return true;
  }
  return false;
}

/** Pure scheduler used by the hook and contract tests. */
export function selectLandingLiveWeeks(
  weekOptions: Array<{ startDate: string; endDate: string }>,
  fuelEntries: FuelEntry[],
  vehicles: Vehicle[],
  finalizedReports: FinalizedFuelReport[],
  serverSkipWeekStarts?: Set<string>,
): Array<{ startDate: string; endDate: string }> {
  return weekOptions.filter((w) =>
    weekNeedsLiveCalc(
      w.startDate,
      w.endDate,
      fuelEntries,
      vehicles,
      finalizedReports,
      serverSkipWeekStarts,
    ),
  );
}

const EMPTY_LANDING_REPORTS = new Map<string, FuelLandingLiveSlice[]>();

export function useFuelLandingLiveReports(_input: FuelLandingLiveReportsInput) {
  return EMPTY_LANDING_REPORTS;
}
