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

export type FuelPeriodStatus = 'outstanding' | 'completed';

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
  counts: Record<FuelStepId, FuelStepCounts>;
}

export interface FuelPeriodVehicleSnapshot {
  vehicleId: string;
  totalSpend: number;
  companyShare: number;
  driverShare: number;
  misc: number;
  healthStatus?: 'Emerald' | 'Amber' | 'Red' | string;
  pendingCount: number;
  hasOpenDispute: boolean;
  hasScenarioAssigned: boolean;
  isFinalized: boolean;
}

export interface BuildFuelStepCountsInput {
  vehicles: FuelPeriodVehicleSnapshot[];
  /** When true, Amber/Red no longer block (pending still does). */
  healthAcknowledged?: boolean;
  /** When true, misc/gap review no longer blocks. */
  leakageReviewed?: boolean;
}

/**
 * Per-step actionable vs informational for one week.
 * - Pending logs + (unacked Amber/Red) block data-quality
 * - Open disputes block adjustments-disputes
 * - Missing policy assignment is informational (default OK)
 * - Misc > 0 blocks leakage until reviewed
 * - Unfinalized vehicles with spend block finalize
 */
export function buildFuelStepCounts(input: BuildFuelStepCountsInput): Record<FuelStepId, FuelStepCounts> {
  const counts = emptyFuelStepCounts();
  const { vehicles, healthAcknowledged = false, leakageReviewed = false } = input;

  for (const v of vehicles) {
    if (v.pendingCount > 0) {
      counts['data-quality'].actionable += v.pendingCount;
    }
    if (v.healthStatus && v.healthStatus !== 'Emerald') {
      if (healthAcknowledged) {
        counts['data-quality'].informational += 1;
      } else {
        counts['data-quality'].actionable += 1;
      }
    }

    if (v.hasOpenDispute) {
      counts['adjustments-disputes'].actionable += 1;
    }

    if (!v.hasScenarioAssigned) {
      counts['policy-check'].informational += 1;
    }

    if (v.misc > 0.009) {
      if (leakageReviewed) {
        counts['leakage-gap'].informational += 1;
      } else {
        counts['leakage-gap'].actionable += 1;
      }
    }

    if (v.totalSpend > 0.009 && !v.isFinalized) {
      counts.finalize.actionable += 1;
    } else if (v.isFinalized) {
      counts.finalize.informational += 1;
    }
  }

  return counts;
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
    }>
  >;
}

function entryInWeek(e: FuelEntry, start: string, end: string): boolean {
  return isYmdInFuelWeek(e.date, start, end);
}

function disputeOpenInWeek(d: FuelDispute, start: string, end: string): boolean {
  if (d.status !== 'Open') return false;
  const ws = String(d.weekStart || '').split('T')[0];
  if (ws) return ws === start;
  // Fallback: createdAt date if present
  const created = String((d as any).createdAt || '').split('T')[0];
  return created ? isYmdInFuelWeek(created, start, end) : false;
}

/**
 * Build Outstanding / Completed period cards for recent weeks.
 */
export function deriveFuelReconciliationPeriods(input: DeriveFuelPeriodsInput): FuelReconciliationPeriod[] {
  const { weekOptions, vehicles, fuelEntries, disputes, finalizedReports, scenarios, liveReportsByWeek } =
    input;

  return weekOptions.map((week) => {
    const id = fuelPeriodIdFromWeekStart(week.startDate);
    const { startDate, endDate, label } = fuelWeekBoundsFromPeriodId(id);
    const weekEntries = fuelEntries.filter((e) => entryInWeek(e, startDate, endDate));
    const live = liveReportsByWeek?.get(id);

    const vehicleSnaps: FuelPeriodVehicleSnapshot[] = vehicles.map((vehicle) => {
      const liveReport = live?.find((r) => r.vehicleId === vehicle.id);
      const vEntries = weekEntries.filter((e) => e.vehicleId === vehicle.id);
      const totalSpend =
        liveReport?.totalGasCardCost ??
        vEntries.reduce((s, e) => s + (e.amount || 0), 0);
      const pendingCount =
        liveReport?.pendingCount ??
        vEntries.filter((e) => e.reconciliationStatus === 'Pending').length;
      const finalized = finalizedReports.some(
        (f) =>
          f.vehicleId === vehicle.id &&
          String(f.weekStart).split('T')[0] === startDate,
      );
      const hasOpenDispute = disputes.some(
        (d) => d.vehicleId === vehicle.id && disputeOpenInWeek(d, startDate, endDate),
      );
      const hasScenarioAssigned = Boolean(vehicle.fuelScenarioId);

      return {
        vehicleId: vehicle.id,
        totalSpend,
        companyShare: liveReport?.companyShare ?? 0,
        driverShare: liveReport?.driverShare ?? 0,
        misc: liveReport?.miscellaneousCost ?? 0,
        healthStatus: liveReport?.healthStatus,
        pendingCount,
        hasOpenDispute,
        hasScenarioAssigned,
        isFinalized: finalized,
      };
    });

    // Only vehicles with activity matter for period presence
    const active = vehicleSnaps.filter(
      (v) => v.totalSpend > 0.009 || v.pendingCount > 0 || v.hasOpenDispute || v.isFinalized,
    );

    const counts = buildFuelStepCounts({ vehicles: active.length ? active : vehicleSnaps.filter((v) => v.totalSpend > 0) });
    const actionableTotal = fuelActionableTotal(counts);
    const withSpend = active.filter((v) => v.totalSpend > 0.009 || v.isFinalized);
    const allFinalized =
      withSpend.length > 0 && withSpend.every((v) => v.isFinalized);
    const locked = allFinalized;
    const status: FuelPeriodStatus =
      locked && actionableTotal === 0 ? 'completed' : 'outstanding';

    // Hide empty future/past weeks with zero activity from landing (keep current week)
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
      actionableTotal,
      counts,
    };
  }).filter((p, idx) => {
    // Always keep the most recent week; drop older empty weeks
    if (idx === 0) return true;
    return p.vehicleCount > 0 || p.actionableTotal > 0 || p.status === 'completed';
  });
}

export function listFuelWeekOptionsForLanding(weekCount = 16, timezone?: string): PeriodWeekOption[] {
  return generateFuelWeekOptions(weekCount, timezone);
}

/** Inventory mapper for Reset Period dialog. */
export function buildFuelPeriodResetInventory(
  periodId: string,
  finalizedReports: FinalizedFuelReport[],
  fuelEntries: FuelEntry[],
): {
  snapshots: FinalizedFuelReport[];
  pendingEntryCount: number;
  postedEntryCount: number;
} {
  const start = fuelPeriodIdFromWeekStart(periodId);
  const snapshots = finalizedReports.filter(
    (f) => String(f.weekStart).split('T')[0] === start,
  );
  const { endDate } = fuelWeekBoundsFromPeriodId(start);
  const weekEntries = fuelEntries.filter((e) => isYmdInFuelWeek(e.date, start, endDate));
  return {
    snapshots,
    pendingEntryCount: weekEntries.filter((e) => e.reconciliationStatus === 'Pending').length,
    postedEntryCount: weekEntries.filter((e) => e.reconciliationStatus !== 'Pending').length,
  };
}
