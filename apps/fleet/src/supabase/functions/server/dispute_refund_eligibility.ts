/**
 * Dispute-refund eligibility — when a toll belongs in the Dispute Refunds step.
 *
 * Workflow context (do NOT conflate with other steps):
 * - Needs Review / Personal / Deadhead: triage unmatched tolls
 * - Dispute Refunds: link Uber Support Adjustments to an *underpaid* toll shortfall
 * - Underpaid & Claims: flag/track claims when trip fare did not cover the toll
 * - Unlinked Refunds: Uber paid a toll refund on a trip with no toll expense linked
 *
 * A toll fully reimbursed via the trip fare (shortfall ≤ tolerance) has nothing
 * for a dispute refund to fix and must not appear as a bare-toll match candidate.
 */

/** Same tolerance as toll matching / underpaid detection (5¢). */
export const DISPUTE_SHORTFALL_TOLERANCE = 0.05;

export function tollShortfallAmount(tollAmount: number, tripRefundAllocated: number): number {
  return Math.max(0, Math.abs(tollAmount) - Math.abs(tripRefundAllocated));
}

/** True when Uber's trip-level toll refund already covers this toll charge. */
export function isFullyReimbursedViaTrip(
  tollAmount: number,
  tripRefundAllocated: number,
  tolerance = DISPUTE_SHORTFALL_TOLERANCE,
): boolean {
  return tollShortfallAmount(tollAmount, tripRefundAllocated) <= tolerance;
}

/**
 * Bare toll (no open claim) in the dispute match modal.
 * - Known trip refund → require a positive shortfall.
 * - Unknown trip refund → only keep if already flagged underpaid (not generic needs_review).
 */
export function isBareTollEligibleForDisputeMatch(input: {
  tollAmount: number;
  tripRefund: number | null | undefined;
  workflowStage?: string | null;
}): boolean {
  const { tollAmount, tripRefund, workflowStage } = input;
  if (tripRefund != null) {
    return !isFullyReimbursedViaTrip(tollAmount, tripRefund);
  }
  return workflowStage === "underpaid_pending";
}
