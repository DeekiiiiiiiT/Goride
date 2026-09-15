/**
 * Shared fuel-week closability predicate — wizard, HTTP finalize, auto-close, bulk.
 * Every blocker must have a test input that makes this return a non-empty list.
 */

export type FuelWeekClosableBlocker = {
  code:
    | 'exception_fills'
    | 'open_disputes'
    | 'unapproved_fuel_tx'
    | 'over_explained'
    | 'under_explained_unreviewed'
    | 'counts_unevaluated'
    | 'degraded_inputs'
    | 'missing_category_costs'
    | 'unresolved_coverage_rule';
  message: string;
};

export type EvaluateFuelWeekClosableInput = {
  hasUnacknowledgedExceptionFills?: boolean;
  hasOpenDisputes?: boolean;
  hasUnapprovedFuelTx?: boolean;
  /** misc < 0 beyond ratio — modelling artefact, never auto-close. */
  overExplained?: boolean;
  /** misc > 0 beyond ratio and not yet leakage-reviewed. */
  underExplainedUnreviewed?: boolean;
  /** Step counts jsonb empty / never written — inert gate (C-3b). */
  countsUnevaluated?: boolean;
  degradedInputs?: boolean;
  missingCategoryCosts?: boolean;
  unresolvedCoverageRule?: boolean;
};

export function evaluateFuelWeekClosable(
  input: EvaluateFuelWeekClosableInput,
): FuelWeekClosableBlocker[] {
  const blockers: FuelWeekClosableBlocker[] = [];
  if (input.hasUnacknowledgedExceptionFills) {
    blockers.push({
      code: 'exception_fills',
      message: 'Unacknowledged exception-tier fills remain',
    });
  }
  if (input.hasOpenDisputes) {
    blockers.push({
      code: 'open_disputes',
      message: 'Open fuel disputes remain',
    });
  }
  if (input.hasUnapprovedFuelTx) {
    blockers.push({
      code: 'unapproved_fuel_tx',
      message: 'Unapproved fuel transactions in window',
    });
  }
  if (input.overExplained) {
    blockers.push({
      code: 'over_explained',
      message: 'Over-explained residual (modelled costs exceed spend)',
    });
  }
  if (input.underExplainedUnreviewed) {
    blockers.push({
      code: 'under_explained_unreviewed',
      message: 'Under-explained residual not reviewed',
    });
  }
  if (input.countsUnevaluated) {
    blockers.push({
      code: 'counts_unevaluated',
      message: 'Step counts never evaluated — refusing inert auto-close gate',
    });
  }
  if (input.degradedInputs) {
    blockers.push({
      code: 'degraded_inputs',
      message: 'Money-bearing inputs timed out or missing',
    });
  }
  if (input.missingCategoryCosts) {
    blockers.push({
      code: 'missing_category_costs',
      message: 'Snapshots missing categoryCosts — refuse flat-ratio publish',
    });
  }
  if (input.unresolvedCoverageRule) {
    blockers.push({
      code: 'unresolved_coverage_rule',
      message: 'Coverage rule unresolved or unknown',
    });
  }
  return blockers;
}

export function fuelWeekIsClosable(input: EvaluateFuelWeekClosableInput): boolean {
  return evaluateFuelWeekClosable(input).length === 0;
}
