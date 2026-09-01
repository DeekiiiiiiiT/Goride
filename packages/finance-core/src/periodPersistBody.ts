import { round2, toMoneyMinor } from './money.ts';
import type { PeriodSettlementResult } from './driverPeriodSettlement.ts';
import { preservePeriodMetaKeys, resolveSignedSnapshot } from './periodSignedSnapshot.ts';

export type DerivedPeriodStatusLike = {
  settlementStatus: string;
  payoutStatus: string;
  periodStatus: 'open' | 'closed' | 'reopened';
  cashStillHeld: number;
  tollsClear: boolean;
  moneyUnlocked: boolean;
};

export type FinanceCoreMetaInput = {
  tips?: number;
  tipsPaidToDriver?: number;
  tipsWithheld?: number;
  quotaTarget?: number;
  quotaPercent?: number;
  quotaMet?: boolean;
  uberCash?: number;
  uberTripCash?: number;
  nonUberTripCash?: number;
  cashSourceMismatch?: number;
  overpaidAmount: number;
  tollCashWashEligible: number;
  tollsClear: boolean;
  moneyUnlocked: boolean;
  cashHeldClamped: boolean;
  unclampedCashHeld: number;
  projectionSources?: Record<string, string>;
};

export type BuildPeriodMetadataInput = {
  priorMeta?: Record<string, unknown> | null;
  prevSettlementPaid: number;
  settled: PeriodSettlementResult;
  derived: DerivedPeriodStatusLike;
  financeCore: FinanceCoreMetaInput;
  excludedCashSpend?: number;
  excludedCashCount?: number;
  forceRelease?: {
    at: string;
    by?: string | null;
    reason?: string | null;
  };
  at?: string;
};

/** Single metadata builder for rebuild and cash sync. */
export function buildPeriodMetadata(input: BuildPeriodMetadataInput): Record<string, unknown> {
  const priorFc = ((input.priorMeta?.financeCore || {}) as Record<string, unknown>) ?? {};
  const signedSnapshot = resolveSignedSnapshot({
    priorMeta: input.priorMeta,
    prevSettlementPaid: input.prevSettlementPaid,
    settled: input.settled,
    cashStillHeld: input.derived.cashStillHeld,
    at: input.at,
  });

  const fc = input.financeCore;
  const preserved = preservePeriodMetaKeys(input.priorMeta);
  return {
    ...preserved,
    ...(signedSnapshot ? { signedSnapshot } : {}),
    excludedCashSpend: round2(
      input.excludedCashSpend ??
        (typeof input.priorMeta?.excludedCashSpend === 'number'
          ? input.priorMeta.excludedCashSpend
          : 0),
    ),
    excludedCashCount:
      input.excludedCashCount ??
      (typeof input.priorMeta?.excludedCashCount === 'number'
        ? input.priorMeta.excludedCashCount
        : 0),
    financeCore: {
      ...priorFc,
      tips: fc.tips,
      tipsPaidToDriver: fc.tipsPaidToDriver,
      tipsWithheld: fc.tipsWithheld,
      quotaTarget: fc.quotaTarget,
      quotaPercent: fc.quotaPercent,
      quotaMet: fc.quotaMet,
      uberCash: fc.uberCash,
      uberTripCash: fc.uberTripCash,
      nonUberTripCash: fc.nonUberTripCash,
      cashSourceMismatch: fc.cashSourceMismatch,
      cashHeldClamped: fc.cashHeldClamped,
      unclampedCashHeld: fc.unclampedCashHeld,
      overpaidAmount: round2(fc.overpaidAmount),
      tollCashWashEligible: round2(fc.tollCashWashEligible),
      tollsClear: fc.tollsClear,
      moneyUnlocked: fc.moneyUnlocked,
      ...(fc.projectionSources ? { projectionSources: fc.projectionSources } : {}),
    },
    ...(input.forceRelease ? { forceRelease: input.forceRelease } : {}),
  };
}

export type CashSettlementPersistFields = {
  cash_returned: number;
  cash_written_off: number;
  settlement_paid: number;
  cash_still_held: number;
  settlement_amount: number;
  payout_net: number;
  settlement_amount_minor: number;
  payout_net_minor: number;
  cash_still_held_minor: number;
  settlement_status: string;
  payout_status: string;
  status: string;
  closed_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type BuildCashSettlementPersistInput = {
  cashReturned: number;
  cashWrittenOff: number;
  settled: PeriodSettlementResult;
  derived: DerivedPeriodStatusLike;
  metadata: Record<string, unknown>;
  existingClosedAt?: string | null;
  now?: string;
};

/** Overlapping persist fields shared by rebuild upsert and cash sync update. */
export function buildCashSettlementPersistFields(
  input: BuildCashSettlementPersistInput,
): CashSettlementPersistFields {
  const now = input.now ?? new Date().toISOString();
  const settlementAmount = round2(input.settled.settlement);
  const payoutNet = round2(input.settled.netPayout);
  const cashStillHeld = round2(input.derived.cashStillHeld);

  return {
    cash_returned: round2(input.cashReturned),
    cash_written_off: round2(input.cashWrittenOff),
    settlement_paid: round2(Math.max(0, input.settled.settlementPaid)),
    cash_still_held: cashStillHeld,
    settlement_amount: settlementAmount,
    payout_net: payoutNet,
    settlement_amount_minor: toMoneyMinor(settlementAmount),
    payout_net_minor: toMoneyMinor(payoutNet),
    cash_still_held_minor: toMoneyMinor(cashStillHeld),
    settlement_status: input.derived.settlementStatus,
    payout_status: input.derived.payoutStatus,
    status: input.derived.periodStatus,
    closed_at:
      input.derived.periodStatus === 'closed' ? input.existingClosedAt || now : null,
    metadata: input.metadata,
    updated_at: now,
  };
}
