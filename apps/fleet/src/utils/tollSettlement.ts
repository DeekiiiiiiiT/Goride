/**
 * Canonical toll settlement math — trip credits first, dispute credits second.
 * remaining = tollCost − activeCredits (excludes reversed rows and non-credits).
 */

export const SETTLEMENT_TOLERANCE = 0.05;

export type SettlementSourceType =
  | 'trip_refund'
  | 'unlinked_trip'
  | 'dispute_refund'
  | 'driver_charge'
  | 'write_off'
  | 'reversal';

export interface SettlementAllocationLike {
  id?: string;
  sourceType: SettlementSourceType;
  sourceId: string;
  tollId: string;
  claimId?: string | null;
  amount: number;
  reversesId?: string | null;
  idempotencyKey?: string;
}

const CREDIT_TYPES: ReadonlySet<SettlementSourceType> = new Set([
  'trip_refund',
  'unlinked_trip',
  'dispute_refund',
]);

export function isSettlementCredit(type: SettlementSourceType): boolean {
  return CREDIT_TYPES.has(type);
}

/** Active credit total for a toll (credits minus their reversals). */
export function activeSettlementCredits(
  allocations: SettlementAllocationLike[],
  tollId: string,
): number {
  const forToll = allocations.filter((a) => a.tollId === tollId);
  const reversed = new Set(
    forToll.filter((a) => a.sourceType === 'reversal' && a.reversesId).map((a) => String(a.reversesId)),
  );
  let sum = 0;
  for (const a of forToll) {
    if (a.sourceType === 'reversal') continue;
    if (!isSettlementCredit(a.sourceType)) continue;
    if (a.id && reversed.has(String(a.id))) continue;
    // Also treat reverse-by-key rows that only carry reversesId on the reversal
    sum += Math.abs(Number(a.amount) || 0);
  }
  return Math.round(sum * 100) / 100;
}

export function remainingTollShortfall(
  tollCost: number,
  allocations: SettlementAllocationLike[],
  tollId: string,
): number {
  const cost = Math.abs(Number(tollCost) || 0);
  const credits = activeSettlementCredits(allocations, tollId);
  return Math.max(0, Math.round((cost - credits) * 100) / 100);
}

/** Cap an apply amount so it never exceeds remaining shortfall. */
export function clampSettlementApply(
  tollCost: number,
  allocations: SettlementAllocationLike[],
  tollId: string,
  requested: number,
): { applyAmount: number; remainingBefore: number; remainingAfter: number; overAllocation: boolean } {
  const remainingBefore = remainingTollShortfall(tollCost, allocations, tollId);
  const want = Math.abs(Number(requested) || 0);
  if (want <= SETTLEMENT_TOLERANCE) {
    return { applyAmount: 0, remainingBefore, remainingAfter: remainingBefore, overAllocation: false };
  }
  if (want > remainingBefore + SETTLEMENT_TOLERANCE) {
    return {
      applyAmount: remainingBefore,
      remainingBefore,
      remainingAfter: 0,
      overAllocation: true,
    };
  }
  const applyAmount = Math.min(want, remainingBefore);
  const remainingAfter = Math.max(0, Math.round((remainingBefore - applyAmount) * 100) / 100);
  return { applyAmount, remainingBefore, remainingAfter, overAllocation: false };
}

export function settlementIdempotencyKey(
  sourceType: SettlementSourceType,
  sourceId: string,
  tollId: string,
  amount?: number,
): string {
  const amt = typeof amount === 'number' ? `:${amount.toFixed(2)}` : '';
  return `${sourceType}:${sourceId}:${tollId}${amt}`;
}

/** Validate multi-target shares against a single source credit pool. */
export function validateMultiTargetShares(
  sourceAmount: number,
  targets: Array<{ tollId: string; share: number }>,
): { ok: true } | { ok: false; error: string } {
  if (!targets.length) return { ok: false, error: 'targets required' };
  const seen = new Set<string>();
  let total = 0;
  for (const t of targets) {
    if (!t.tollId) return { ok: false, error: 'each target needs tollId' };
    if (seen.has(t.tollId)) return { ok: false, error: `duplicate target ${t.tollId}` };
    seen.add(t.tollId);
    const share = Number(t.share);
    if (!(share > 0)) return { ok: false, error: `invalid share for ${t.tollId}` };
    total += share;
  }
  total = Math.round(total * 100) / 100;
  const pool = Math.abs(sourceAmount) || 0;
  if (total > pool + SETTLEMENT_TOLERANCE) {
    return { ok: false, error: `shares ${total} exceed source credit ${pool}` };
  }
  return { ok: true };
}

/**
 * Project claim fields from settlement balance for UI compatibility.
 * Open + leftover when remainder > 0; Reimbursed when closed by credits.
 */
export function projectClaimFromSettlement(input: {
  tollCost: number;
  remaining: number;
  priorPaid?: number;
  disputeRefundId?: string | null;
}): {
  status: 'Open' | 'Resolved';
  resolutionReason: 'Reimbursed' | null;
  amount: number;
  paidAmount: number;
  expectedAmount: number;
} {
  const cost = Math.abs(Number(input.tollCost) || 0);
  const remaining = Math.max(0, Math.round((Number(input.remaining) || 0) * 100) / 100);
  const paid = Math.max(
    Math.abs(Number(input.priorPaid) || 0),
    Math.round((cost - remaining) * 100) / 100,
  );
  if (remaining <= SETTLEMENT_TOLERANCE) {
    return {
      status: 'Resolved',
      resolutionReason: 'Reimbursed',
      amount: 0,
      paidAmount: paid,
      expectedAmount: cost,
    };
  }
  return {
    status: 'Open',
    resolutionReason: null,
    amount: remaining,
    paidAmount: paid,
    expectedAmount: cost,
  };
}
