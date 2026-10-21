/**
 * One owner for which wizard step a close code belongs on.
 * Browser labels and server step counts both read this map.
 */
import type { RunStepId } from './reconSources.ts';
import { RECON_STEP_ORDER } from './evaluateRun.ts';

export const SERVER_STEP_BY_BLOCKER: Record<string, RunStepId> = {
  SOURCE_MISSING: 'sources',
  SOURCE_PARTIAL: 'sources',
  SOURCE_WAITING_EXTERNAL: 'sources',
  SOURCE_WAIVED: 'sources',
  SOURCE_ATTESTED_NONE: 'sources',
  STEP_STALE: 'sources',
  LINE_UNATTRIBUTED: 'attribution',
  EARNINGS_STATEMENT_MISSING: 'trips_earnings',
  EARNINGS_STATEMENT_UNVERIFIED: 'trips_earnings',
  EARNINGS_ENGINE_DRIFT: 'trips_earnings',
  EARNINGS_GROSS_IDENTITY: 'trips_earnings',
  CASH_SOURCE_MISMATCH: 'trips_earnings',
  CASH_COLLECTED_MISMATCH: 'trips_earnings',
  TOLL_STATEMENT_MISSING: 'tolls',
  TOLL_STATEMENT_UNVERIFIED: 'tolls',
  TOLL_SPEND_MISMATCH: 'tolls',
  TOLL_CHARGED_MISMATCH: 'tolls',
  TOLL_IDENTITY_UNBALANCED: 'tolls',
  TOLL_SPEND_SPLIT: 'tolls',
  TOLL_EVENT_ORPHANED: 'tolls',
  TOLL_EVENT_MISSING: 'tolls',
  TOLL_EVENT_INELIGIBLE: 'tolls',
  TOLL_EVENT_AMOUNT_MISMATCH: 'tolls',
  TOLL_PAYMENT_METHOD_UNKNOWN: 'tolls',
  TOLL_ENGINE_DRIFT: 'tolls',
  TOLL_STALE_ZERO_SEAL: 'tolls',
  FUEL_STATEMENT_MISSING: 'fuel',
  FUEL_STATEMENT_UNVERIFIED: 'fuel',
  FUEL_DRIVER_SHARE_MISMATCH: 'fuel',
  FUEL_FLEET_SHARE_MISMATCH: 'fuel',
  FUEL_ENGINE_DRIFT: 'fuel',
  FUEL_CARD_STATEMENT_DRIFT: 'fuel',
  SETTLEMENT_FLEET_OWES: 'settlement_preview',
  SETTLEMENT_DRIVER_OWES: 'settlement_preview',
  SETTLEMENT_CASH_HELD: 'settlement_preview',
  CASH_HELD_OVER_RETURNED: 'settlement_preview',
  STATEMENT_ACCOUNTS_UNBALANCED: 'close',
  SETTLEMENT_PNL_MISMATCH: 'close',
  BUSINESS_WEEK_PNL_UNAVAILABLE: 'close',
  CUSTODY_NO_OPEN_TARGET: 'close',
  PRIOR_CLOSE_HASH_CHANGED: 'close',
  PERIOD_REBUILD_FAILED: 'close',
  COVERAGE_WIDER_THAN_DATA: 'close',
};

/**
 * Block-severity codes `checkCloseInvariants` can emit, including engine drifts
 * and source codes once enforcement is on. Warn-only codes are omitted.
 * SETTLEMENT_CASH_HELD is intentionally not emitted.
 */
export const CHECK_CLOSE_INVARIANT_BLOCK_CODES = [
  'FUEL_STATEMENT_MISSING',
  'FUEL_STATEMENT_UNVERIFIED',
  'FUEL_DRIVER_SHARE_MISMATCH',
  'FUEL_FLEET_SHARE_MISMATCH',
  'FUEL_ENGINE_DRIFT',
  'TOLL_STATEMENT_MISSING',
  'TOLL_STATEMENT_UNVERIFIED',
  'TOLL_SPEND_MISMATCH',
  'TOLL_CHARGED_MISMATCH',
  'TOLL_IDENTITY_UNBALANCED',
  'TOLL_SPEND_SPLIT',
  'TOLL_PAYMENT_METHOD_UNKNOWN',
  'TOLL_EVENT_INELIGIBLE',
  'TOLL_EVENT_AMOUNT_MISMATCH',
  'TOLL_EVENT_MISSING',
  'TOLL_EVENT_ORPHANED',
  'TOLL_ENGINE_DRIFT',
  'TOLL_STALE_ZERO_SEAL',
  'EARNINGS_STATEMENT_MISSING',
  'EARNINGS_STATEMENT_UNVERIFIED',
  'EARNINGS_ENGINE_DRIFT',
  'EARNINGS_GROSS_IDENTITY',
  'CASH_COLLECTED_MISMATCH',
  'CASH_SOURCE_MISMATCH',
  'STATEMENT_ACCOUNTS_UNBALANCED',
  'SETTLEMENT_PNL_MISMATCH',
  'SETTLEMENT_FLEET_OWES',
  'SETTLEMENT_DRIVER_OWES',
  'CASH_HELD_OVER_RETURNED',
  'SOURCE_MISSING',
  'SOURCE_PARTIAL',
  'SOURCE_WAITING_EXTERNAL',
  'STEP_STALE',
  'LINE_UNATTRIBUTED',
] as const;

export function codesForStep(stepId: RunStepId): readonly string[] {
  return Object.entries(SERVER_STEP_BY_BLOCKER)
    .filter(([, step]) => step === stepId)
    .map(([code]) => code);
}

export function serverStepForBlockerCode(code: string): RunStepId | null {
  const step = SERVER_STEP_BY_BLOCKER[String(code || '').toUpperCase()];
  if (!step || !(RECON_STEP_ORDER as readonly string[]).includes(step)) return null;
  return step;
}

/** Blocking close codes on one step. Warnings do not keep the step open. */
export function countBlockersForStep(
  stepId: RunStepId,
  blockers: Array<{ code?: string | null; severity?: string | null }>,
): number {
  return blockers.filter((b) => {
    if (String(b.severity || 'block') === 'warn') return false;
    return serverStepForBlockerCode(String(b.code || '')) === stepId;
  }).length;
}
