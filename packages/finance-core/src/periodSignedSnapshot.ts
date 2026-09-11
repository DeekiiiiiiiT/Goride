import { round2 } from './money.ts';
import type { PeriodSettlementResult } from './driverPeriodSettlement.ts';

export type SignedSnapshot = {
  at: string;
  settlement_amount: number;
  payout_net: number;
  settlement_paid: number;
  cash_still_held: number;
  /** H-5: close-time invariant inputs (optional; stamped at freeze). */
  cashSourceMismatch?: number;
  tollUnknownPmCount?: number;
  cashHeldClamped?: boolean;
  unclampedCashHeld?: number;
};

/** Close-time audit of invariant inputs that justified freeze (H-5). */
export type CloseInvariantSnapshot = {
  at: string;
  cashSourceMismatch: number;
  tollUnknownPmCount: number;
  cashHeldClamped: boolean;
  unclampedCashHeld: number;
};

export type ResolveSignedSnapshotInput = {
  priorMeta?: Record<string, unknown> | null;
  prevSettlementPaid: number;
  settled: Pick<PeriodSettlementResult, 'settlement' | 'netPayout' | 'settlementPaid'>;
  cashStillHeld: number;
  at?: string;
  /** Optional invariant inputs folded into the payout stamp (H-5). */
  invariants?: Partial<
    Pick<
      SignedSnapshot,
      'cashSourceMismatch' | 'tollUnknownPmCount' | 'cashHeldClamped' | 'unclampedCashHeld'
    >
  >;
};

/** Stamp payout proof when settlement_paid increases; otherwise preserve prior snapshot. */
export function resolveSignedSnapshot(input: ResolveSignedSnapshotInput): SignedSnapshot | undefined {
  const prevPaid = Number(input.prevSettlementPaid) || 0;
  const paid = Number(input.settled.settlementPaid) || 0;
  if (paid > prevPaid + 0.005) {
    const inv = input.invariants || {};
    return {
      at: input.at ?? new Date().toISOString(),
      settlement_amount: round2(input.settled.settlement),
      payout_net: round2(input.settled.netPayout),
      settlement_paid: round2(paid),
      cash_still_held: round2(input.cashStillHeld),
      ...(inv.cashSourceMismatch != null
        ? { cashSourceMismatch: round2(Number(inv.cashSourceMismatch) || 0) }
        : {}),
      ...(inv.tollUnknownPmCount != null
        ? { tollUnknownPmCount: Number(inv.tollUnknownPmCount) || 0 }
        : {}),
      ...(inv.cashHeldClamped != null ? { cashHeldClamped: Boolean(inv.cashHeldClamped) } : {}),
      ...(inv.unclampedCashHeld != null
        ? { unclampedCashHeld: round2(Number(inv.unclampedCashHeld) || 0) }
        : {}),
    };
  }
  const prior = input.priorMeta?.signedSnapshot;
  if (prior && typeof prior === 'object') {
    return prior as SignedSnapshot;
  }
  return undefined;
}

/**
 * Build close-time invariant snapshot from live financeCore (or period columns).
 * Prefer reading this in checkCloseInvariants after freeze; rebuilds may change live fields.
 */
export function buildCloseInvariantSnapshot(
  financeCore: Record<string, unknown> | null | undefined,
  at?: string,
): CloseInvariantSnapshot {
  const fc = financeCore || {};
  return {
    at: at ?? new Date().toISOString(),
    cashSourceMismatch: round2(Number(fc.cashSourceMismatch) || 0),
    tollUnknownPmCount: Number(fc.tollUnknownPmCount) || 0,
    cashHeldClamped: fc.cashHeldClamped === true,
    unclampedCashHeld: round2(Number(fc.unclampedCashHeld) || 0),
  };
}

/**
 * Merge closeInvariantSnapshot into metadata.financeCore and fold fields onto signedSnapshot.
 * Pure — caller persists. Does not overwrite an existing closeInvariantSnapshot.
 */
export function stampCloseInvariantSnapshotOnMeta(
  meta: Record<string, unknown>,
  at?: string,
): Record<string, unknown> {
  const next = { ...meta };
  const financeCore = { ...((next.financeCore as Record<string, unknown>) || {}) };
  if (financeCore.closeInvariantSnapshot && typeof financeCore.closeInvariantSnapshot === 'object') {
    return next;
  }
  const snap = buildCloseInvariantSnapshot(
    financeCore,
    at ?? (String(financeCore.signedAt || '') || undefined),
  );
  financeCore.closeInvariantSnapshot = snap;
  next.financeCore = financeCore;

  const priorSnap = next.signedSnapshot;
  if (priorSnap && typeof priorSnap === 'object') {
    next.signedSnapshot = {
      ...(priorSnap as SignedSnapshot),
      cashSourceMismatch: snap.cashSourceMismatch,
      tollUnknownPmCount: snap.tollUnknownPmCount,
      cashHeldClamped: snap.cashHeldClamped,
      unclampedCashHeld: snap.unclampedCashHeld,
    };
  }
  return next;
}

/** Prefer frozen closeInvariantSnapshot / signedSnapshot over live financeCore for H-5 fields. */
export function readCloseInvariantInputs(
  meta: Record<string, unknown> | null | undefined,
): {
  cashSourceMismatch: number | null;
  tollUnknownPmCount: number | null;
  cashHeldClamped: boolean | null;
  unclampedCashHeld: number | null;
} {
  const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
  const cis = fc.closeInvariantSnapshot as Record<string, unknown> | undefined;
  const ss = meta?.signedSnapshot as Record<string, unknown> | undefined;
  // Prefer closeInvariantSnapshot; else fold signedSnapshot over live financeCore.
  const src: Record<string, unknown> =
    cis && typeof cis === 'object'
      ? cis
      : {
          ...fc,
          ...(ss && typeof ss === 'object' ? ss : {}),
        };

  const pickNum = (v: unknown): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;

  return {
    cashSourceMismatch: pickNum(src.cashSourceMismatch),
    tollUnknownPmCount: pickNum(src.tollUnknownPmCount),
    cashHeldClamped: src.cashHeldClamped != null ? src.cashHeldClamped === true : null,
    unclampedCashHeld: pickNum(src.unclampedCashHeld),
  };
}

/** Metadata keys preserved across cash-sync rebuilds (A-7 + N-8 service-line). */
export const PRESERVED_PERIOD_META_KEYS = [
  'signedSnapshot',
  'rushTripCount',
  'rideshareTripCount',
] as const;

export function preservePeriodMetaKeys(
  priorMeta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!priorMeta) return out;
  for (const key of PRESERVED_PERIOD_META_KEYS) {
    // Keep zeros — service-line SQL treats missing vs 0 differently if we drop them.
    if (Object.prototype.hasOwnProperty.call(priorMeta, key) && priorMeta[key] !== undefined) {
      out[key] = priorMeta[key];
    }
  }
  return out;
}
