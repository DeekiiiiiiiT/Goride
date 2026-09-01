import { round2 } from './money.ts';
import type { PeriodSettlementResult } from './driverPeriodSettlement.ts';

export type SignedSnapshot = {
  at: string;
  settlement_amount: number;
  payout_net: number;
  settlement_paid: number;
  cash_still_held: number;
};

export type ResolveSignedSnapshotInput = {
  priorMeta?: Record<string, unknown> | null;
  prevSettlementPaid: number;
  settled: Pick<PeriodSettlementResult, 'settlement' | 'netPayout' | 'settlementPaid'>;
  cashStillHeld: number;
  at?: string;
};

/** Stamp payout proof when settlement_paid increases; otherwise preserve prior snapshot. */
export function resolveSignedSnapshot(input: ResolveSignedSnapshotInput): SignedSnapshot | undefined {
  const prevPaid = Number(input.prevSettlementPaid) || 0;
  const paid = Number(input.settled.settlementPaid) || 0;
  if (paid > prevPaid + 0.005) {
    return {
      at: input.at ?? new Date().toISOString(),
      settlement_amount: round2(input.settled.settlement),
      payout_net: round2(input.settled.netPayout),
      settlement_paid: round2(paid),
      cash_still_held: round2(input.cashStillHeld),
    };
  }
  const prior = input.priorMeta?.signedSnapshot;
  if (prior && typeof prior === 'object') {
    return prior as SignedSnapshot;
  }
  return undefined;
}

/** Metadata keys preserved across full rebuilds (A-7 audit trail). */
export const PRESERVED_PERIOD_META_KEYS = ['signedSnapshot'] as const;

export function preservePeriodMetaKeys(
  priorMeta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!priorMeta) return out;
  for (const key of PRESERVED_PERIOD_META_KEYS) {
    if (priorMeta[key] != null) out[key] = priorMeta[key];
  }
  return out;
}
