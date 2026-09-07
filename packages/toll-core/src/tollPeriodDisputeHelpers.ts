/**
 * Dispute-refund + partial shortfall helpers — Deno-safe (no date-fns / client UI).
 * Edge: toll_period_controller, tollPeriodCounts. Client: re-exported from tollWeekPeriod.ts.
 */

import { dateWeekKey } from '../../finance-core/src/periodKey.ts';

export const TOLL_VARIANCE_THRESHOLD = 0.05;

type DisputeRefundLike = {
  status?: string;
  matchedClaimId?: string | null;
  matchedTollId?: string | null;
};

type ClaimLike = {
  id?: string;
  status?: string;
  paidAmount?: number | null;
  amount?: number | null;
  resolutionReason?: string | null;
  unlinkedTripId?: string | null;
  resolutionTransactionId?: string | null;
  transactionId?: string | null;
  disputeRefundId?: string | null;
};

type TollLike = {
  unlinkedSourceTripId?: string | null;
};

export function isDisputeRefundMatched(r: Pick<DisputeRefundLike, 'status'>): boolean {
  return r.status === 'matched' || r.status === 'auto_resolved';
}

export function hasMatchedDisputeRefund(
  claim: Pick<ClaimLike, 'id' | 'transactionId'>,
  disputeRefunds: DisputeRefundLike[],
): boolean {
  if (!claim.transactionId && !claim.id) return false;
  return disputeRefunds.some(
    (r) =>
      isDisputeRefundMatched(r) &&
      (r.matchedClaimId === claim.id || r.matchedTollId === claim.transactionId),
  );
}

export function isTollCoveredByDisputeRefund(
  claim: Pick<ClaimLike, 'id' | 'transactionId' | 'status' | 'amount'>,
  disputeRefunds: DisputeRefundLike[],
): boolean {
  if (!hasMatchedDisputeRefund(claim, disputeRefunds)) return false;
  if (claim.status === 'Open' && Math.abs(Number(claim.amount) || 0) > TOLL_VARIANCE_THRESHOLD) {
    return false;
  }
  return true;
}

export function isActionablePartialShortfall(
  claim: Pick<
    ClaimLike,
    | 'status'
    | 'paidAmount'
    | 'amount'
    | 'resolutionReason'
    | 'unlinkedTripId'
    | 'resolutionTransactionId'
  > | null | undefined,
  toll?: Pick<TollLike, 'unlinkedSourceTripId'> | null,
): boolean {
  if (!claim) return false;
  const paid = Math.abs(Number(claim.paidAmount) || 0);
  const remaining = Math.abs(Number(claim.amount) || 0);
  if (remaining <= TOLL_VARIANCE_THRESHOLD || paid <= TOLL_VARIANCE_THRESHOLD) return false;
  if (claim.status === 'Open') return true;
  if (claim.status !== 'Resolved') return false;

  const hasUnlinkedApply = !!(claim.unlinkedTripId || toll?.unlinkedSourceTripId);
  if (claim.resolutionReason === 'Reimbursed' && hasUnlinkedApply) return true;

  return (
    claim.resolutionReason === 'Charge Driver' &&
    !claim.resolutionTransactionId
  );
}

export function isVisiblePartialShortfallClaim(
  claim: Pick<
    ClaimLike,
    | 'id'
    | 'status'
    | 'paidAmount'
    | 'amount'
    | 'resolutionReason'
    | 'unlinkedTripId'
    | 'resolutionTransactionId'
    | 'transactionId'
    | 'disputeRefundId'
  > | null | undefined,
  toll: Pick<TollLike, 'unlinkedSourceTripId'> | null | undefined,
  disputeRefunds: DisputeRefundLike[],
): boolean {
  if (!claim) return false;
  if (isTollCoveredByDisputeRefund(claim, disputeRefunds)) return false;
  if (claim.status === 'Resolved' && claim.disputeRefundId) return false;
  if (claim.status === 'Open') return true;
  return isActionablePartialShortfall(claim, toll);
}

/** Monday-start week key for a dispute refund (`refund.date` in fleet tz). */
export function disputeRefundPeriodWeekKey(
  refund: Pick<{ date?: string }, 'date'>,
  fleetTz?: string,
): string {
  return dateWeekKey(refund.date, fleetTz || 'America/Jamaica') || '1970-01-01';
}

export type DisputeRefundAnchor = Pick<
  { date?: string; matchedTollId?: string | null; matchedClaimId?: string | null },
  'date' | 'matchedTollId' | 'matchedClaimId'
>;

/**
 * The ONE week a dispute refund belongs to (exclusive priority, C-5).
 *
 * A refund is anchored to exactly one period, never two:
 *   1. its matched toll's week (if the toll's week is resolvable),
 *   2. else its matched claim's week (if resolvable),
 *   3. else its own refund-date week.
 *
 * Callers pass optional id→weekKey maps so the toll/claim anchor can be looked
 * up. When a refund is toll/claim-anchored but that anchor's week is not in the
 * supplied map, the anchor still wins (returns null) rather than silently
 * double-booking the refund into its own date-week — that OR-fallthrough was the
 * source of the double-count (see RECONCILIATION_SYSTEM_AUDIT.md).
 */
export function disputeRefundPeriodKey(
  refund: DisputeRefundAnchor,
  opts: {
    fleetTz?: string;
    tollWeekKeyById?: ReadonlyMap<string, string> | null;
    claimWeekKeyById?: ReadonlyMap<string, string> | null;
  } = {},
): string | null {
  const fleetTz = opts.fleetTz || 'America/Jamaica';
  if (refund.matchedTollId) {
    return opts.tollWeekKeyById?.get(String(refund.matchedTollId)) ?? null;
  }
  if (refund.matchedClaimId) {
    return opts.claimWeekKeyById?.get(String(refund.matchedClaimId)) ?? null;
  }
  return disputeRefundPeriodWeekKey(refund, fleetTz);
}

/**
 * Period visibility for dispute refunds — exclusive priority (C-5).
 *
 * toll-anchor FIRST (only ever in the matched toll's period), else claim-anchor,
 * else the refund-date week. This is an ELSE chain, not an OR: a toll-anchored
 * refund whose matched toll is not in THIS period is NOT re-shown via its own
 * date-week, so each refund lands in exactly one week.
 */
export function isDisputeRefundInWizardPeriod(
  refund: DisputeRefundAnchor,
  periodWeekKey: string,
  fleetTz: string,
  periodTollIds?: ReadonlySet<string>,
  periodClaimIds?: ReadonlySet<string>,
): boolean {
  if (refund.matchedTollId) return !!periodTollIds?.has(String(refund.matchedTollId));
  if (refund.matchedClaimId) return !!periodClaimIds?.has(String(refund.matchedClaimId));
  return disputeRefundPeriodWeekKey(refund, fleetTz) === periodWeekKey;
}
