/**
 * Client-side fuel-week closable gate — same predicate as server auto-close / HTTP finalize.
 */
import {
  assertCategoryCostsTieSpend,
  classifyFuelMiscResidual,
  coverageRuleIsResolved,
  evaluateFuelWeekClosable,
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
      !assertCategoryCostsTieSpend(spend, cats, Number(r.miscellaneousCost) || 0)
    ) {
      return true;
    }
  }
  return false;
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
  countsUnevaluated?: boolean;
  degradedInputs?: boolean;
  openDisputesInWeek?: boolean;
  totalSpend?: number;
  unexplained?: number;
}): EvaluateFuelWeekClosableInput {
  const unexplained =
    opts.unexplained ??
    opts.reports.reduce((s, r) => s + (Number(r.miscellaneousCost) || 0), 0);
  const totalSpend =
    opts.totalSpend ??
    opts.reports.reduce((s, r) => s + (Number(r.totalGasCardCost) || 0), 0);
  const residualKind = classifyFuelMiscResidual(totalSpend, unexplained);

  return {
    hasUnacknowledgedExceptionFills:
      opts.gateResult.hasExceptionBlockers || (opts.gateResult.exceptionBlockers?.length ?? 0) > 0,
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
    default:
      return blocker.message;
  }
}
