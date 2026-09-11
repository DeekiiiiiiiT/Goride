/**
 * Cash custody carry-forward helpers (Close Integrity Pass 4 — N-1 / N-2).
 * Pure — no I/O. Edge week_close walks DB and calls persist.
 */
import { nextPeriodAnchor, type WeekKey } from './periodKey.ts';
import { round2 } from './money.ts';

export const CUSTODY_TARGET_HORIZON_WEEKS = 52;

/** Monday anchors to probe after `afterWeekKey` (N+7 … N+7*horizon). */
export function custodyTargetWeekCandidates(
  afterWeekKey: string,
  horizon: number = CUSTODY_TARGET_HORIZON_WEEKS,
): WeekKey[] {
  const out: WeekKey[] = [];
  let cursor = String(afterWeekKey).slice(0, 10);
  for (let i = 0; i < horizon; i++) {
    cursor = nextPeriodAnchor(cursor);
    out.push(cursor);
  }
  return out;
}

/** Subtract a reversed carry from successor opening (floor at 0). */
export function openingCustodyAfterReverse(
  priorOpening: number,
  transferredAmount: number,
): number {
  return round2(Math.max(0, (Number(priorOpening) || 0) - (Number(transferredAmount) || 0)));
}

export function readCustodyTransferMarks(fc: Record<string, unknown> | null | undefined): {
  transferredTo: string | null;
  transferredAmount: number;
} {
  const to = String(fc?.custodyTransferredTo || '').trim();
  const amt = round2(Math.max(0, Number(fc?.custodyTransferredAmount) || 0));
  return { transferredTo: to || null, transferredAmount: amt };
}

/** Clear transfer marks on a source week after reopen reverse. */
export function clearCustodyTransferMarks(
  fc: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...fc };
  delete next.custodyTransferredTo;
  delete next.custodyTransferredAmount;
  return next;
}

/** Apply / merge opening custody on a successor week's financeCore. */
export function mergeOpeningCashCustody(
  fc: Record<string, unknown>,
  addAmount: number,
  receivedFrom: string,
): Record<string, unknown> {
  const prior = round2(Math.max(0, Number(fc.openingCashCustody) || 0));
  const added = round2(Math.max(0, Number(addAmount) || 0));
  return {
    ...fc,
    openingCashCustody: round2(prior + added),
    custodyReceivedFrom: String(receivedFrom).slice(0, 10),
  };
}

export const CUSTODY_ERROR_CODES = {
  NO_OPEN_TARGET: 'CUSTODY_NO_OPEN_TARGET',
  SUCCESSOR_FROZEN: 'REOPEN_CUSTODY_SUCCESSOR_FROZEN',
} as const;

/** Residual pocket cash that still needs a carry target (Pass 6 / N-3). */
export function residualCustodyHeld(
  cashStillHeld: number,
  eps: number = 0.005,
): number {
  return round2(Math.max(0, Number(cashStillHeld) || 0)) > eps
    ? round2(Math.max(0, Number(cashStillHeld) || 0))
    : 0;
}

/**
 * True when transfer marks exist and the successor already shows opening custody
 * (idempotent skip). False when marks are stale / orphaned — caller must heal.
 */
export function custodyCarryAlreadyLanded(
  fc: Record<string, unknown> | null | undefined,
  successorOpeningCustody: number,
  eps: number = 0.005,
): boolean {
  const marks = readCustodyTransferMarks(fc);
  if (!marks.transferredTo || marks.transferredAmount <= eps) return false;
  return round2(Math.max(0, Number(successorOpeningCustody) || 0)) > eps;
}

/** H-3: reopen archived seal differs from fresh re-close hash (warn, not block). */
export const PRIOR_CLOSE_HASH_CHANGED = 'PRIOR_CLOSE_HASH_CHANGED' as const;

export function priorCloseHashChanged(
  priorCloseHash: string | null | undefined,
  nextCloseHash: string | null | undefined,
): boolean {
  const prior = String(priorCloseHash || '').trim();
  const next = String(nextCloseHash || '').trim();
  return Boolean(prior && next && prior !== next);
}

/**
 * P-6: pick first open custody target from an in-memory week map (one DB range load).
 * Missing candidate week = open stub (same as sequential maybeSingle).
 * Returns null when every candidate in the horizon is frozen.
 */
export function pickFirstOpenCustodyTargetFromMap(opts: {
  afterWeekKey: string;
  /** period_anchor → frozen */
  frozenByAnchor: Map<string, boolean>;
  horizon?: number;
}): { targetWeek: WeekKey; exists: boolean } | null {
  const candidates = custodyTargetWeekCandidates(opts.afterWeekKey, opts.horizon);
  for (const targetWeek of candidates) {
    if (!opts.frozenByAnchor.has(targetWeek)) {
      return { targetWeek, exists: false };
    }
    if (opts.frozenByAnchor.get(targetWeek)) continue;
    return { targetWeek, exists: true };
  }
  return null;
}
