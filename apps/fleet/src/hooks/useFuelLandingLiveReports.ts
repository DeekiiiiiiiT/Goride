/**
 * Landing-only live fuel reports for unlocked weeks.
 *
 * deriveFuelReconciliationPeriods needs miscellaneousCost / shares for Unexplained
 * and Outstanding vs In Progress. Completed weeks use finalized snapshots; open weeks
 * need the same calc engine as the wizard (buildFuelWeekReportsWithGating).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  buildFuelWeekReportsWithGating,
  type BuildFuelWeekReportsInput,
} from '../utils/buildFuelWeekReportsForFinalize';
import { isYmdInFuelWeek } from '../utils/fuelWeekPeriod';
import { FUEL_SPEND_EPS } from '../utils/fuelMoneyEpsilon';
import { fuelOpsSpendAmount } from '../utils/fuelOpsEligibility';
import {
  fuelAdjustmentsContentSig,
  fuelDisputesContentSig,
  fuelEntriesContentSig,
  fuelScenariosContentSig,
  hashFuelContentSig,
} from '../utils/fuelContentSig';
import { liveReportsToPrimaryClaimedSlices } from '../utils/fuelPeriodDerive';
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

export function useFuelLandingLiveReports(input: FuelLandingLiveReportsInput) {
  const {
    weekOptions,
    serverSkipWeekStarts,
    vehicles,
    drivers,
    fuelEntries,
    adjustments,
    scenarios,
    fuelCards,
    disputes,
    finalizedReports,
  } = input;

  const weeksToLoad = useMemo(
    () =>
      selectLandingLiveWeeks(
        weekOptions,
        fuelEntries,
        vehicles,
        finalizedReports,
        serverSkipWeekStarts,
      ),
    [weekOptions, fuelEntries, vehicles, finalizedReports, serverSkipWeekStarts],
  );

  const [liveReportsByWeek, setLiveReportsByWeek] = useState<
    Map<string, FuelLandingLiveSlice[]>
  >(() => new Map());

  const weekKey = weeksToLoad.map((w) => w.startDate).join('|');
  const entrySig = hashFuelContentSig([
    fuelEntriesContentSig(fuelEntries),
    fuelAdjustmentsContentSig(adjustments),
    fuelScenariosContentSig(scenarios),
    fuelDisputesContentSig(disputes),
    vehicles.map((v) => `${v.id}:${v.fuelScenarioId || ''}`).join(','),
    drivers.map((d) => `${d.id || d.driverId}:${d.fuelScenarioId || ''}`).join(','),
    fuelCards.map((c) => c.id).join(','),
    finalizedReports
      .map((f) => `${f.driverId}:${f.weekStart}:${Number(f.miscellaneousCost) || 0}`)
      .join(','),
    serverSkipWeekStarts ? [...serverSkipWeekStarts].sort().join('|') : '',
  ]);

  useEffect(() => {
    let cancelled = false;
    if (weeksToLoad.length === 0) {
      setLiveReportsByWeek(new Map());
      return;
    }

    (async () => {
      const next = new Map<string, FuelLandingLiveSlice[]>();
      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(FUEL_LANDING_LIVE_CONCURRENCY, weeksToLoad.length) },
        async () => {
          while (cursor < weeksToLoad.length) {
            if (cancelled) return;
            const i = cursor++;
            const week = weeksToLoad[i];
            const buildInput: BuildFuelWeekReportsInput = {
              weekStartYmd: week.startDate,
              weekEndYmd: week.endDate,
              vehicles,
              drivers,
              fuelEntries,
              adjustments,
              scenarios,
              fuelCards,
              disputes,
              finalizedReports,
              seedPersonalAllowance: false,
            };
            try {
              const { reports } = await buildFuelWeekReportsWithGating(buildInput);
              next.set(week.startDate, liveReportsToPrimaryClaimedSlices(reports));
            } catch (e) {
              console.warn('[useFuelLandingLiveReports] week calc failed', week.startDate, e);
            }
          }
        },
      );
      await Promise.all(workers);
      if (!cancelled) setLiveReportsByWeek(new Map(next));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional signature deps
  }, [weekKey, entrySig]);

  return liveReportsByWeek;
}
