/**
 * Pure period status derivation for Consumption Reconciliation landing.
 */

import type { FuelDispute, FuelEntry, FinalizedFuelReport, FuelScenario } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';
import {
  emptyFuelStepCounts,
  fuelActionableTotal,
  type FuelStepCounts,
  type FuelStepId,
} from './fuelPeriodGating';
import {
  fuelPeriodIdFromWeekStart,
  fuelWeekBoundsFromPeriodId,
  generateFuelWeekOptions,
  isYmdInFuelWeek,
  type PeriodWeekOption,
} from './fuelWeekPeriod';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';
import { isFuelExceptionAcknowledged } from './fuelFinalizeGating';
import {
  buildFuelVehicleSnapshots,
  type FuelPeriodVehicleSnapshot,
} from './fuelPeriodDerive';

export type { FuelPeriodVehicleSnapshot } from './fuelPeriodDerive';

export type FuelPeriodStatus = 'outstanding' | 'in_progress' | 'completed';

export interface FuelReconciliationPeriod {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  status: FuelPeriodStatus;
  locked: boolean;
  vehicleCount: number;
  totalSpend: number;
  netLeakage: number;
  companyShare: number;
  driverShare: number;
  actionableTotal: number;
  exceptionCount: number;
  counts: Record<FuelStepId, FuelStepCounts>;
  /** True when leakage_reviewed_at set (or locked with residual treated as accepted). */
  leakageReviewed?: boolean;
}

export interface BuildFuelStepCountsInput {
  vehicles: FuelPeriodVehicleSnapshot[];
  /** When true, misc/gap review no longer blocks. */
  leakageReviewed?: boolean;
}

/**
 * Per-step actionable vs informational for one week.
 * - Amber/Red health is informational only (signal for Leakage / Stop-to-Stop review)
 * - Pending logs are informational on step 1 (they post on Finalize)
 * - Open disputes block adjustments-disputes
 * - Missing policy assignment is informational (default OK)
 * - Misc > 0 blocks leakage until reviewed
 * - Unfinalized vehicles with spend block finalize
 */
export function buildFuelStepCounts(input: BuildFuelStepCountsInput): Record<FuelStepId, FuelStepCounts> {
  const counts = emptyFuelStepCounts();
  const { vehicles, leakageReviewed = false } = input;

  for (const v of vehicles) {
    // Pending = not yet posted; expected until Finalize — show as info, do not gate Continue
    if (v.pendingCount > 0) {
      counts['data-quality'].informational += v.pendingCount;
      counts.finalize.informational += v.pendingCount;
    }
    if (v.healthStatus && v.healthStatus !== 'Emerald') {
      counts['data-quality'].informational += 1;
    }

    if (v.hasOpenDispute) {
      counts['adjustments-disputes'].actionable += 1;
    }

    if (!v.hasScenarioAssigned) {
      counts['policy-check'].informational += 1;
    }

    // H2: negative misc (over-explained) is a data-quality signal; positive blocks leakage
    const miscAbs = Math.abs(Number(v.misc) || 0);
    if (miscAbs > FUEL_SPEND_EPS) {
      if (v.misc < 0) {
        if (leakageReviewed) {
          counts['data-quality'].informational += 1;
        } else {
          counts['data-quality'].actionable += 1;
        }
      } else if (leakageReviewed) {
        counts['leakage-gap'].informational += 1;
      } else {
        counts['leakage-gap'].actionable += 1;
      }
    }

    if (v.totalSpend > FUEL_SPEND_EPS && !v.isFinalized) {
      counts.finalize.actionable += 1;
    } else if (v.isFinalized) {
      counts.finalize.informational += 1;
    }
  }

  return counts;
}

/**
 * Align with Toll Reconciliation landing:
 * - outstanding: early review still open (exceptions / disputes / unexplained)
 * - in_progress: review clear, week not locked yet (ready to finalize)
 * - completed: SQL fuel_reconciliation_period locked only (not KV snapshots)
 *
 * Empty weeks (no spend vehicles) are not open work — callers must filter them
 * out of landing lists (see deriveFuelReconciliationPeriods).
 */
export function classifyFuelReconPeriodStatus(opts: {
  locked: boolean;
  withSpendCount: number;
  exceptionCount: number;
  openDisputeCount: number;
  leakageActionable: number;
}): FuelPeriodStatus {
  if (opts.locked) return 'completed';
  // No spend yet — not Outstanding work (was inflating Finalize weeks for empty current week).
  if (opts.withSpendCount <= 0) {
    if (opts.exceptionCount > 0 || opts.openDisputeCount > 0) return 'outstanding';
    return 'in_progress';
  }

  const earlyOpen =
    opts.exceptionCount + opts.openDisputeCount + opts.leakageActionable;
  if (earlyOpen > 0) return 'outstanding';
  // Review clear — ready to finalize (or waiting on finalize only)
  return 'in_progress';
}

export interface DeriveFuelPeriodsInput {
  weekOptions: PeriodWeekOption[];
  vehicles: Vehicle[];
  fuelEntries: FuelEntry[];
  disputes: FuelDispute[];
  finalizedReports: FinalizedFuelReport[];
  scenarios: FuelScenario[];
  /** Optional live calc per vehicle+week — when omitted, spend comes from entries only. */
  liveReportsByWeek?: Map<
    string,
    Array<{
      vehicleId: string;
      totalGasCardCost: number;
      companyShare: number;
      driverShare: number;
      miscellaneousCost: number;
      healthStatus?: string;
      pendingCount?: number;
      sourceReportKey?: string;
      metadata?: { scenarioId?: string };
    }>
  >;
  /** Week starts (YMD) where unexplained fuel was accepted — pass from store; keep derive pure. */
  leakageReviewedWeeks?: Set<string>;
}

function entryInWeek(e: FuelEntry, start: string, end: string): boolean {
  return isYmdInFuelWeek(e.date, start, end);
}

/**
 * Build Outstanding / In Progress / Completed period cards for recent weeks.
 */
export function deriveFuelReconciliationPeriods(input: DeriveFuelPeriodsInput): FuelReconciliationPeriod[] {
  const {
    weekOptions,
    vehicles,
    fuelEntries,
    disputes,
    finalizedReports,
    scenarios,
    liveReportsByWeek,
    leakageReviewedWeeks,
  } = input;

  return weekOptions.map((week) => {
    const id = fuelPeriodIdFromWeekStart(week.startDate);
    const { startDate, endDate, label } = fuelWeekBoundsFromPeriodId(id);
    const weekEntries = fuelEntries.filter((e) => entryInWeek(e, startDate, endDate));
    const live = liveReportsByWeek?.get(id);
    const exceptionCount = weekEntries.filter(
      (e) => e.metadata?.signalTier === 'exception' && !isFuelExceptionAcknowledged(e),
    ).length;

    const { snapshots: vehicleSnaps } = buildFuelVehicleSnapshots({
      vehicles,
      weekStartYmd: startDate,
      weekEndYmd: endDate,
      fuelEntries,
      disputes,
      finalizedReports,
      scenarios,
      liveSlices: live || [],
    });

    // Only vehicles with activity matter for period presence
    const active = vehicleSnaps.filter(
      (v) =>
        v.totalSpend > FUEL_SPEND_EPS ||
        v.pendingCount > 0 ||
        v.hasOpenDispute ||
        v.isFinalized ||
        Boolean(v.hasWeekActivity),
    );

    const counts = buildFuelStepCounts({
      vehicles: active.length ? active : vehicleSnaps.filter((v) => v.totalSpend > 0),
      leakageReviewed: Boolean(leakageReviewedWeeks?.has(startDate)),
    });
    // Exception fills hard-block Finalize — surface on data-quality chips
    if (exceptionCount > 0) {
      counts['data-quality'].actionable += exceptionCount;
    }
    const withSpend = active.filter((v) => v.totalSpend > FUEL_SPEND_EPS || v.isFinalized);
    // Period lock is SQL-only (fuel_reconciliation_period). Snapshots = money posted, not Completed.
    const locked = false;

    const openDisputeCount = withSpend.filter((v) => v.hasOpenDispute).length;
    const status = classifyFuelReconPeriodStatus({
      locked,
      withSpendCount: withSpend.length,
      exceptionCount,
      openDisputeCount,
      leakageActionable: counts['leakage-gap'].actionable,
    });

    const totalSpend = withSpend.reduce((s, v) => s + v.totalSpend, 0);
    const netLeakage = withSpend.reduce((s, v) => s + v.misc, 0);
    const companyShare = withSpend.reduce((s, v) => s + v.companyShare, 0);
    const driverShare = withSpend.reduce((s, v) => s + v.driverShare, 0);

    return {
      id,
      startDate,
      endDate,
      label: week.label || label,
      status,
      locked,
      vehicleCount: withSpend.length,
      totalSpend,
      netLeakage,
      companyShare,
      driverShare,
      actionableTotal: locked ? 0 : fuelActionableTotal(counts),
      exceptionCount: locked ? 0 : exceptionCount,
      counts,
      leakageReviewed: Boolean(leakageReviewedWeeks?.has(startDate)),
    };
  }).filter((p) => {
    // Locked/completed weeks stay on Completed.
    if (p.locked || p.status === 'completed') return true;
    // Drop empty unlocked weeks (incl. current week with $0 spend) — they are not recon work
    // and were inflating Outstanding + Finalize weeks.
    return p.vehicleCount > 0 || p.exceptionCount > 0 || p.actionableTotal > 0;
  });
}

export function listFuelWeekOptionsForLanding(weekCount = 16, timezone?: string): PeriodWeekOption[] {
  return generateFuelWeekOptions(weekCount, timezone);
}

/** True when a fuel log was settlement-posted (Finalize) for this week. */
function isSettlementPostedFuelEntry(e: FuelEntry): boolean {
  if (e.metadata?.finalizedByReport) return true;
  const status = e.reconciliationStatus;
  // Anything not Pending was pushed through settlement / audit post paths
  return Boolean(status && status !== 'Pending');
}

/** Inventory mapper for Reopen week dialog. */
export function buildFuelPeriodResetInventory(
  periodId: string,
  finalizedReports: FinalizedFuelReport[],
  fuelEntries: FuelEntry[],
): {
  snapshots: FinalizedFuelReport[];
  pendingEntryCount: number;
  postedEntryCount: number;
  weekEntryCount: number;
  hasActivity: boolean;
  /** Vehicles that need DELETE/reset even if local snapshot list is empty. */
  vehicleIds: string[];
  canReset: boolean;
} {
  const start = fuelPeriodIdFromWeekStart(periodId);
  const snapshots = finalizedReports.filter(
    (f) => String(f.weekStart).split('T')[0] === start,
  );
  const { endDate } = fuelWeekBoundsFromPeriodId(start);
  const weekEntries = fuelEntries.filter((e) => isYmdInFuelWeek(e.date, start, endDate));
  const posted = weekEntries.filter(isSettlementPostedFuelEntry);
  const vehicleIds = [
    ...new Set([
      ...snapshots.map((s) => s.vehicleId).filter(Boolean),
      ...weekEntries.map((e) => e.vehicleId).filter(Boolean),
    ]),
  ] as string[];
  return {
    snapshots,
    pendingEntryCount: weekEntries.filter((e) => e.reconciliationStatus === 'Pending').length,
    postedEntryCount: posted.length,
    weekEntryCount: weekEntries.length,
    hasActivity: weekEntries.length > 0 || snapshots.length > 0,
    vehicleIds,
    // Posted settlements OR any week activity — soft reset always allowed from UI
    canReset: snapshots.length > 0 || posted.length > 0,
  };
}
