import { round2, toMoneyMinor } from './money.ts';
import type { PeriodSettlementResult } from './driverPeriodSettlement.ts';
import { preservePeriodMetaKeys, resolveSignedSnapshot } from './periodSignedSnapshot.ts';

export type DerivedPeriodStatusLike = {
  settlementStatus: string;
  payoutStatus: string;
  /** Reconciliation gate state — NOT calendar close (C-3). */
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
  /**
   * Toll rows counted in spend whose paymentMethod is neither cash nor tag.
   * They land in toll_spend but in neither split bucket, so TOLL_SPEND_SPLIT
   * would fire with no diagnosis — these carry the reason (toll audit §6.3).
   */
  tollUnknownPmCount?: number;
  tollUnknownPmAmount?: number;
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
      // Preserve ops Accept statement cash across rebuild (do not wipe).
      ...(priorFc.cashSourceAck ? { cashSourceAck: priorFc.cashSourceAck } : {}),
      // Phase 2: custody carry-forward survives rebuild.
      ...(Number(priorFc.openingCashCustody) > 0
        ? { openingCashCustody: round2(Number(priorFc.openingCashCustody) || 0) }
        : {}),
      ...(priorFc.custodyReceivedFrom
        ? { custodyReceivedFrom: priorFc.custodyReceivedFrom }
        : {}),
      ...(priorFc.custodyTransferredTo
        ? { custodyTransferredTo: priorFc.custodyTransferredTo }
        : {}),
      ...(priorFc.custodyTransferredAmount != null
        ? { custodyTransferredAmount: round2(Number(priorFc.custodyTransferredAmount) || 0) }
        : {}),
      cashHeldClamped: fc.cashHeldClamped,
      unclampedCashHeld: fc.unclampedCashHeld,
      overpaidAmount: round2(fc.overpaidAmount),
      tollCashWashEligible: round2(fc.tollCashWashEligible),
      tollUnknownPmCount: Number(fc.tollUnknownPmCount) || 0,
      tollUnknownPmAmount: round2(Number(fc.tollUnknownPmAmount) || 0),
      tollsClear: fc.tollsClear,
      moneyUnlocked: fc.moneyUnlocked,
      ...(fc.projectionSources ? { projectionSources: fc.projectionSources } : {}),
    },
    ...(input.forceRelease ? { forceRelease: input.forceRelease } : {}),
  };
}

/** Maps projector periodStatus → reconciliation_status column (C-3). */
export function reconciliationStatusFromDerived(
  periodStatus: DerivedPeriodStatusLike['periodStatus'],
): 'open' | 'cleared' | 'reopened' {
  if (periodStatus === 'closed') return 'cleared';
  if (periodStatus === 'reopened') return 'reopened';
  return 'open';
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
  /** Toll/fuel gate — never calendar close (C-3). */
  reconciliation_status: 'open' | 'cleared' | 'reopened';
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type BuildCashSettlementPersistInput = {
  cashReturned: number;
  cashWrittenOff: number;
  settled: PeriodSettlementResult;
  derived: DerivedPeriodStatusLike;
  metadata: Record<string, unknown>;
  now?: string;
};

/**
 * Overlapping persist fields shared by rebuild upsert and cash sync update.
 * Does NOT write calendar `status` / `closed_at` — only closeWeek/reopenWeek own those (C-3).
 * Persists signed settlement_paid (C-2) — no Math.max(0) clamp.
 */
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
    settlement_paid: round2(input.settled.settlementPaid),
    cash_still_held: cashStillHeld,
    settlement_amount: settlementAmount,
    payout_net: payoutNet,
    settlement_amount_minor: toMoneyMinor(settlementAmount),
    payout_net_minor: toMoneyMinor(payoutNet),
    cash_still_held_minor: toMoneyMinor(cashStillHeld),
    settlement_status: input.derived.settlementStatus,
    payout_status: input.derived.payoutStatus,
    reconciliation_status: reconciliationStatusFromDerived(input.derived.periodStatus),
    metadata: input.metadata,
    updated_at: now,
  };
}
