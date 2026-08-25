/**
 * Dispute-refund + partial shortfall helpers — Deno-safe (no date-fns / client UI).
 * Edge: toll_period_controller, tollPeriodCounts. Client: re-exported from tollWeekPeriod.ts.
 */

import { dateWeekKey } from './fleetMondayWeekKey.ts';

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

/**
 * Period visibility for dispute refunds — mirrors period_reset inventory:
 * toll-first when matched to a period toll, else refund-date week key.
 */
export function isDisputeRefundInWizardPeriod(
  refund: Pick<{ date?: string; matchedTollId?: string | null; matchedClaimId?: string | null }, 'date' | 'matchedTollId' | 'matchedClaimId'>,
  periodWeekKey: string,
  fleetTz: string,
  periodTollIds?: ReadonlySet<string>,
  periodClaimIds?: ReadonlySet<string>,
): boolean {
  if (refund.matchedTollId && periodTollIds?.has(refund.matchedTollId)) return true;
  if (refund.matchedClaimId && periodClaimIds?.has(refund.matchedClaimId)) return true;
  return disputeRefundPeriodWeekKey(refund, fleetTz) === periodWeekKey;
}
