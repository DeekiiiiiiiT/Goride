/**
 * Toll wizard step types + claim/unclaimed helpers — dependency-light so Deno
 * edge can import from tollPeriodCounts without pulling client gating UI.
 */

export type StepId =
  | 'needs-review'
  | 'personal-use'
  | 'deadhead'
  | 'underpaid-claims'
  | 'dispute-refunds'
  | 'unlinked-refunds';

export interface StepCounts {
  actionable: number;
  informational: number;
}

/** Claim statuses the fleet can act on today vs waiting on Uber/driver. */
export function isClaimActionableNow(claim: { status: string }): boolean {
  switch (claim.status) {
    case 'Sent_to_Driver':
    case 'Submitted_to_Uber':
    case 'Resolved':
      return false;
    case 'Rejected':
    case 'Open':
    default:
      return true;
  }
}

export function isClaimInformationalOnly(claim: { status: string }): boolean {
  return claim.status === 'Sent_to_Driver' || claim.status === 'Submitted_to_Uber';
}

/**
 * Claimless tolls in the underpaid wizard bucket count as actionable on GET /periods
 * only while still unlinked. Trip-linked AMOUNT_VARIANCE leftovers stay on the
 * wizard but must not keep the period Outstanding after Finish.
 */
export function countUnclaimedUnderpaidAsPeriodActionable(
  bucket: 'needs-review' | 'underpaid-claims' | 'deadhead' | 'personal-use' | null,
  opts?: { isReconciled?: boolean; hasTripId?: boolean },
): boolean {
  if (bucket !== 'underpaid-claims') return false;
  if (opts?.isReconciled && opts?.hasTripId) return false;
  return true;
}
