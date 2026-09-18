/**
 * Client-side fuel-week closable gate — same predicate as server auto-close / HTTP finalize.
 */
import {
  assertCategoryCostsTieSpend,
  classifyFuelMiscResidual,
  coverageRuleIsResolved,
  evaluateFuelWeekClosable,
  isUnattributedBeyondGate,
  type EvaluateFuelWeekClosableInput,
  type FuelWeekClosableBlocker,
} from '@roam/fuel-core';
import type { FuelScenario, WeeklyFuelReport } from '../types/fuel';
import { resolveActiveFuelPolicyForDriverWeek } from './fuelPolicyVersion';
import { categoryCostsFromReport } from './fuelFinalizeWeekSnapAdapter';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';
import { reportWeekYmdBounds } from './fuelWeekPeriod';
import type { FuelFinalizeGateResult } from './fuelFinalizeGating';

export function snapshotsMissingCategoryCosts(reports: WeeklyFuelReport[]): boolean {
  for (const r of reports) {
    const spend = Number(r.totalGasCardCost) || 0;
    if (spend <= FUEL_SPEND_EPS) continue;
    const cats = categoryCostsFromReport(r);
    if (
      !assertCategoryCostsTieSpend(
        spend,
        cats,
        Number(r.miscellaneousCost) || 0,
        0.02,
        Number(r.windowTimingCost) || 0,
        Number(r.unattributedFillCost) || 0,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** N-1: any money-bearing report whose efficiency fell back (thin odometer chain). */
export function reportsHaveOdometerChainUnusable(reports: WeeklyFuelReport[]): boolean {
  for (const r of reports) {
    const spend = Number(r.totalGasCardCost) || 0;
    if (spend <= FUEL_SPEND_EPS) continue;
    const src = String(r.metadata?.rideShareCalc?.efficiencySource || '');
    if (src && src !== 'odometer') return true;
  }
  return false;
}

/** N-2: aggregate unattributed fill spend across reports. */
export function totalUnattributedFillCost(reports: WeeklyFuelReport[]): number {
  return reports.reduce((s, r) => s + (Number(r.unattributedFillCost) || 0), 0);
}

export function reportsHaveUnresolvedCoverageRule(
  reports: WeeklyFuelReport[],
  scenarios: FuelScenario[],
): boolean {
  for (const r of reports) {
    const spend = Number(r.totalGasCardCost) || 0;
    if (spend <= FUEL_SPEND_EPS) continue;
    const { start } = reportWeekYmdBounds(r);
    const policy = resolveActiveFuelPolicyForDriverWeek(scenarios, r.driverId, start);
    const rule = policy?.scenario?.rules.find((x) => x.category === 'Fuel') || null;
    if (!coverageRuleIsResolved(rule)) return true;
  }
  return false;
}

export function buildFuelWeekClosableInput(opts: {
  gateResult: Pick<
    FuelFinalizeGateResult,
    | 'hasExceptionBlockers'
    | 'exceptionBlockers'
    | 'hasUnapprovedFuelTxBlockers'
    | 'hasOverExplainedBlockers'
    | 'hasUnderExplainedBlockers'
  >;
  reports: WeeklyFuelReport[];
  scenarios: FuelScenario[];
  leakageReviewed: boolean;
  /** R-2: operator acknowledged thin odometer chain. */
  odometerChainReviewed?: boolean;
  /** R-1: wizard accepted fills-without-odometer beyond gate. */
  unattributedReviewed?: boolean;
  countsUnevaluated?: boolean;
  degradedInputs?: boolean;
  openDisputesInWeek?: boolean;
  totalSpend?: number;
  unexplained?: number;
  /** Optional stop-to-stop conservation flags (from week bucket compute). */
  stopToStopVolumeFailed?: boolean;
  stopToStopDistanceFailed?: boolean;
  stopToStopAttributionFailed?: boolean;
  stopToStopChainFailed?: boolean;
  stopToStopTripsTruncated?: boolean;
  /** Flagged DQ vehicles still missing Mark reviewed. */
  dataQualityVehiclesUnreviewed?: boolean;
}): EvaluateFuelWeekClosableInput {
  const unexplained =
    opts.unexplained ??
    opts.reports.reduce((s, r) => s + (Number(r.miscellaneousCost) || 0), 0);
  const totalSpend =
    opts.totalSpend ??
    opts.reports.reduce((s, r) => s + (Number(r.totalGasCardCost) || 0), 0);
  const residualKind = classifyFuelMiscResidual(totalSpend, unexplained);
  const unattributed = totalUnattributedFillCost(opts.reports);
  const hasCritical =
    opts.gateResult.hasExceptionBlockers || (opts.gateResult.exceptionBlockers?.length ?? 0) > 0;

  return {
    hasUnacknowledgedExceptionFills: hasCritical,
    undisposedCriticalFlags: hasCritical,
    dataQualityVehiclesUnreviewed: Boolean(opts.dataQualityVehiclesUnreviewed),
    hasOpenDisputes: Boolean(opts.openDisputesInWeek),
    hasUnapprovedFuelTx: opts.gateResult.hasUnapprovedFuelTxBlockers,
    overExplained:
      opts.gateResult.hasOverExplainedBlockers || residualKind === 'over_explained',
    underExplainedUnreviewed:
      (opts.gateResult.hasUnderExplainedBlockers || residualKind === 'under_explained') &&
      !opts.leakageReviewed,
    countsUnevaluated: opts.countsUnevaluated,
    degradedInputs: opts.degradedInputs,
    missingCategoryCosts: snapshotsMissingCategoryCosts(opts.reports),
    unresolvedCoverageRule: reportsHaveUnresolvedCoverageRule(opts.reports, opts.scenarios),
    stopToStopVolumeFailed: opts.stopToStopVolumeFailed,
    stopToStopDistanceFailed: opts.stopToStopDistanceFailed,
    stopToStopAttributionFailed: opts.stopToStopAttributionFailed,
    stopToStopChainFailed: opts.stopToStopChainFailed,
    stopToStopTripsTruncated: opts.stopToStopTripsTruncated,
    odometerChainUnusable:
      reportsHaveOdometerChainUnusable(opts.reports) && !opts.odometerChainReviewed,
    unattributedUnreviewed:
      isUnattributedBeyondGate(totalSpend, unattributed) && !opts.unattributedReviewed,
  };
}

export function evaluateFuelWeekClosableClient(
  opts: Parameters<typeof buildFuelWeekClosableInput>[0],
): FuelWeekClosableBlocker[] {
  return evaluateFuelWeekClosable(buildFuelWeekClosableInput(opts));
}

/** User-visible message for bulk/wizard skips (maps fuel-core blocker codes). */
export function fuelWeekClosableBlockerMessage(blocker: FuelWeekClosableBlocker): string {
  switch (blocker.code) {
    case 'exception_fills':
      return 'Blocked — unacknowledged exception fill(s) remain';
    case 'open_disputes':
      return 'Blocked — open fuel dispute(s) remain';
    case 'unapproved_fuel_tx':
      return 'Blocked — UNAPPROVED_FUEL_TX in statement window';
    case 'over_explained':
      return 'Blocked — over-explained week (modelled costs exceed spend)';
    case 'under_explained_unreviewed':
      return 'Blocked — under-explained fuel not reviewed';
    case 'counts_unevaluated':
      return 'Blocked — step counts never evaluated for this week';
    case 'degraded_inputs':
      return 'Blocked — money-bearing inputs incomplete or timed out';
    case 'missing_category_costs':
      return 'Blocked — snapshots missing categoryCosts';
    case 'unresolved_coverage_rule':
      return 'Blocked — fuel coverage rule unresolved';
    case 'stop_to_stop_volume':
      return 'Blocked — stop-to-stop volume not reconciled';
    case 'stop_to_stop_distance':
      return 'Blocked — stop-to-stop distance not reconciled';
    case 'stop_to_stop_attribution':
      return 'Blocked — stop-to-stop attribution does not close';
    case 'stop_to_stop_chain':
      return 'Blocked — stop-to-stop odometer chain anomaly';
    case 'stop_to_stop_trips_truncated':
      return 'Blocked — stop-to-stop trip fetch truncated';
    case 'odometer_chain_unusable':
      return 'Blocked — not enough odometered fills to measure tank timing';
    case 'unattributed_unreviewed':
      return 'Blocked — fills without odometer need review';
    case 'undisposed_flags':
      return 'Blocked — critical fill flags not dispositioned';
    case 'data_quality_unreviewed':
      return 'Blocked — data-quality flagged vehicles not marked reviewed';
    default:
      return blocker.message;
  }
}
