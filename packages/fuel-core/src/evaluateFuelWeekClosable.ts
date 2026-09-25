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
    | 'unresolved_coverage_rule'
    | 'stop_to_stop_volume'
    | 'stop_to_stop_distance'
    | 'stop_to_stop_attribution'
    | 'stop_to_stop_chain'
    | 'stop_to_stop_trips_truncated'
    /** N-1: thin odometer chain — timing carve has no basis. */
    | 'odometer_chain_unusable'
    /** N-2: no-odometer fill spend beyond gate and not yet acknowledged. */
    | 'unattributed_unreviewed'
    /** Approved card statement fuel not booked in Transaction Logs (drift). */
    | 'card_statement_drift'
    /** Critical fill flags without a disposition record. */
    | 'undisposed_flags'
    /** Disposition table could not be loaded — infra, not data quality. */
    | 'disposition_load_failed'
    /** Flagged vehicles not marked reviewed on Data quality. */
    | 'data_quality_unreviewed';
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
  /** Stop-to-stop conservation (optional — set when buckets computed at close). */
  stopToStopVolumeFailed?: boolean;
  stopToStopDistanceFailed?: boolean;
  stopToStopAttributionFailed?: boolean;
  stopToStopChainFailed?: boolean;
  stopToStopTripsTruncated?: boolean;
  /** N-1: spend present but efficiencySource !== 'odometer'. */
  odometerChainUnusable?: boolean;
  /** N-2: unattributed fill spend beyond gate and not wizard-accepted. */
  unattributedUnreviewed?: boolean;
  /** Unlinked statement charges or orphan ops gas-card spend exist in the week. */
  cardStatementDriftUnreviewed?: boolean;
  /** Rows behind the card-statement blocker so the close screen can name them. */
  cardStatementDriftDetail?: {
    unlinkedEntryIds: string[];
    orphanOpsEntryIds: string[];
    unlinkedTotal: number;
    orphanOpsTotal: number;
  };
  /** Critical fill flags not dispositioned (desk + wizard shared). */
  undisposedCriticalFlags?: boolean;
  /** Disposition load failed (service client / SQL) — distinct from empty set. */
  dispositionLoadFailed?: boolean;
  /** Data-quality flagged vehicles not marked reviewed. */
  dataQualityVehiclesUnreviewed?: boolean;
};

function fmtMoney(n: number): string {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function cardStatementDriftMessage(
  detail: EvaluateFuelWeekClosableInput['cardStatementDriftDetail'],
): string {
  if (!detail) {
    return 'Unlinked card charges: adopt, link, or dismiss them before close.';
  }
  const parts: string[] = [];
  if (detail.unlinkedEntryIds.length) {
    parts.push(
      `${detail.unlinkedEntryIds.length} unlinked card charge(s) totalling ${fmtMoney(detail.unlinkedTotal)} — adopt, link, or dismiss [${detail.unlinkedEntryIds.join(', ')}]`,
    );
  }
  if (detail.orphanOpsEntryIds.length) {
    parts.push(
      `${detail.orphanOpsEntryIds.length} gas-card log(s) totalling ${fmtMoney(detail.orphanOpsTotal)} with no statement behind them — link or correct [${detail.orphanOpsEntryIds.join(', ')}]`,
    );
  }
  return parts.join('; ');
}

export function evaluateFuelWeekClosable(
  input: EvaluateFuelWeekClosableInput,
): FuelWeekClosableBlocker[] {
  const blockers: FuelWeekClosableBlocker[] = [];
  if (input.dispositionLoadFailed) {
    blockers.push({
      code: 'disposition_load_failed',
      message:
        'Could not load flag dispositions — retry finalize; if it persists, contact engineering.',
    });
  } else if (input.undisposedCriticalFlags) {
    blockers.push({
      code: 'undisposed_flags',
      message: 'Critical fill flags not dispositioned.',
    });
  } else if (input.hasUnacknowledgedExceptionFills) {
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
  if (input.stopToStopVolumeFailed) {
    blockers.push({
      code: 'stop_to_stop_volume',
      message: 'Stop-to-stop volume conservation failed (bucket litres ≠ week ops litres)',
    });
  }
  if (input.stopToStopDistanceFailed) {
    blockers.push({
      code: 'stop_to_stop_distance',
      message: 'Stop-to-stop distance conservation failed',
    });
  }
  if (input.stopToStopAttributionFailed) {
    blockers.push({
      code: 'stop_to_stop_attribution',
      message: 'Stop-to-stop attribution does not close',
    });
  }
  if (input.stopToStopChainFailed) {
    blockers.push({
      code: 'stop_to_stop_chain',
      message: 'Stop-to-stop odometer chain has anomalies',
    });
  }
  if (input.stopToStopTripsTruncated) {
    blockers.push({
      code: 'stop_to_stop_trips_truncated',
      message: 'Stop-to-stop trip fetch truncated — refuse close',
    });
  }
  if (input.odometerChainUnusable) {
    blockers.push({
      code: 'odometer_chain_unusable',
      message: 'Not enough odometered fills to measure tank timing',
    });
  }
  if (input.unattributedUnreviewed) {
    blockers.push({
      code: 'unattributed_unreviewed',
      message: 'Fills without odometer need review',
    });
  }
  if (input.cardStatementDriftUnreviewed) {
    blockers.push({
      code: 'card_statement_drift',
      message: cardStatementDriftMessage(input.cardStatementDriftDetail),
    });
  }
  if (input.dataQualityVehiclesUnreviewed) {
    blockers.push({
      code: 'data_quality_unreviewed',
      message: 'Data-quality flagged vehicles not marked reviewed.',
    });
  }
  return blockers;
}

export function fuelWeekIsClosable(input: EvaluateFuelWeekClosableInput): boolean {
  return evaluateFuelWeekClosable(input).length === 0;
}
