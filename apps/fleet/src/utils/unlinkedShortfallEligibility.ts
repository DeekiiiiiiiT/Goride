/**
 * Unlinked trip-refund → underpaid shortfall match scoring.
 * Shared by fleet UI gates and toll_controller match-and-net.
 */

import { platformsEqual } from './normalizePlatform.ts';

export const UNLINKED_SHORTFALL_TOLERANCE = 0.05;
/** Minimum score to show a candidate in the Review picker. */
export const UNLINKED_PICKER_MIN_CONFIDENCE = 25;
/** Score at which a candidate is labeled "recommended" / row shortcut. */
export const UNLINKED_RECOMMENDED_MIN_CONFIDENCE = 50;

export interface UnlinkedShortfallCandidateInput {
  tripRefund: number;
  tripDate: string;
  remainingShortfall: number;
  tollAmount: number;
  claimOrTollDate: string;
}

export interface UnlinkedShortfallSuggestionShape {
  claimId: string | null;
  tollId: string;
  tripId: string;
  tripRefund: number;
  tollAmount: number;
  remainingShortfall: number;
  leftoverShortfall: number;
  coversFully: boolean;
  confidence: number;
  date: string;
  claimStatus: string | null;
  matchType: 'claim' | 'toll';
  location?: string | null;
  /** Platform of the underpaid toll's linked / claim trip. */
  tollPlatform?: string | null;
  /** Platform of the unlinked refund trip. */
  tripPlatform?: string | null;
  /** True when tollPlatform and tripPlatform both set and differ. */
  platformMismatch?: boolean;
}

/** True when refund platform ≠ toll platform (explicit flag or both platforms known). */
export function isUnlinkedShortfallPlatformMismatch(
  candidate: Pick<UnlinkedShortfallSuggestionShape, 'tripPlatform' | 'tollPlatform' | 'platformMismatch'>,
  refundPlatform?: string | null,
): boolean {
  if (candidate.platformMismatch === true) return true;
  const sourcePlatform = candidate.tripPlatform ?? refundPlatform;
  if (!sourcePlatform || !candidate.tollPlatform) return false;
  return !platformsEqual(sourcePlatform, candidate.tollPlatform);
}

/** Recommended badge + row shortcut — high confidence AND same platform only. */
export function isRecommendedUnlinkedShortfall(
  candidate: Pick<UnlinkedShortfallSuggestionShape, 'confidence' | 'tripPlatform' | 'tollPlatform' | 'platformMismatch'>,
  refundPlatform?: string | null,
): boolean {
  if (candidate.confidence < UNLINKED_RECOMMENDED_MIN_CONFIDENCE) return false;
  return !isUnlinkedShortfallPlatformMismatch(candidate, refundPlatform);
}

export function remainingClaimShortfall(claim: {
  amount?: number;
  paidAmount?: number;
  expectedAmount?: number;
}): number {
  const expected = Math.abs(Number(claim.expectedAmount) || 0);
  const paid = Math.abs(Number(claim.paidAmount) || 0);
  // Canonical: expected toll cost − credits already applied (platform + unlinked).
  if (expected > UNLINKED_SHORTFALL_TOLERANCE) {
    return Math.max(0, Math.round((expected - paid) * 100) / 100);
  }
  // Legacy rows without expectedAmount: amount is the open shortfall balance.
  const shortfall = Math.abs(Number(claim.amount) || 0);
  // After a partial unlinked apply, amount is rewritten to leftover while paidAmount
  // is cumulative — don't subtract paid again.
  if (paid > UNLINKED_SHORTFALL_TOLERANCE && shortfall + UNLINKED_SHORTFALL_TOLERANCE < paid) {
    return shortfall;
  }
  return Math.max(0, Math.round((shortfall - paid) * 100) / 100);
}

export function leftoverAfterApply(remainingShortfall: number, tripRefund: number): number {
  return Math.max(0, remainingShortfall - Math.abs(tripRefund));
}

/** Merged API rows use "Usage"; raw ledger rows use "usage". */
export function isUsageTollType(type?: string | null): boolean {
  if (!type) return true;
  return String(type).toLowerCase() === 'usage';
}

/**
 * Claims eligible to receive an Unlinked Refund credit.
 * Open underpaid shortfalls only — never Personal Use / Deadhead Charge Driver,
 * or already-reimbursed / dispute-matched resolved claims from earlier steps.
 */
export function isEligibleUnlinkedShortfallClaim(claim: {
  type?: string;
  status?: string;
  resolutionReason?: string | null;
  subject?: string | null;
  unlinkedTripId?: string | null;
  amount?: number;
  paidAmount?: number;
  expectedAmount?: number;
}): boolean {
  if (claim.type !== 'Toll_Refund') return false;
  // Resolved Charge Driver = Personal Use / Deadhead already handled
  if (claim.status === 'Resolved' && claim.resolutionReason === 'Charge Driver') return false;
  // Reimbursed = dispute match or prior reimbursement already done
  if (claim.status === 'Resolved' && claim.resolutionReason === 'Reimbursed') return false;
  // Write-offs / other resolved outcomes are finished earlier in the workflow
  if (claim.status === 'Resolved') return false;

  const matchable = ['Open', 'Sent_to_Driver', 'Submitted_to_Uber', 'Rejected'];
  if (!claim.status || !matchable.includes(claim.status)) return false;

  return remainingClaimShortfall(claim) > UNLINKED_SHORTFALL_TOLERANCE;
}

/**
 * Ledger / merged-tx tolls eligible as underpaid shortfall targets.
 * Amount-proximity alone is NOT enough — that pulled Personal Use / Deadhead rows.
 */
export function isEligibleUnlinkedShortfallToll(toll: {
  type?: string | null;
  matchTypeCode?: string | null;
  workflowStage?: string | null;
  resolution?: string | null;
  claimId?: string | null;
  amount?: number;
}): boolean {
  if (!isUsageTollType(toll.type)) return false;
  if (Math.abs(Number(toll.amount) || 0) <= 0) return false;

  // Finished in Personal Use / Deadhead / Business / Write-off / dispute reimbursement
  const res = toll.resolution;
  if (res === 'personal' || res === 'business' || res === 'write_off' || res === 'refunded') {
    return false;
  }

  const stage = String(toll.workflowStage || '');
  if (
    stage.startsWith('personal_use') ||
    stage.startsWith('deadhead') ||
    stage === 'matched' ||
    stage === 'claim_resolved'
  ) {
    return false;
  }

  // True underpaid path only (underpaid_pending / AMOUNT_VARIANCE / open claim_filed)
  return (
    toll.matchTypeCode === 'AMOUNT_VARIANCE' ||
    stage === 'underpaid_pending' ||
    stage === 'underpaid' ||
    stage === 'claim_filed'
  );
}

export function coversShortfallFully(
  remainingShortfall: number,
  tripRefund: number,
  tolerance = UNLINKED_SHORTFALL_TOLERANCE,
): boolean {
  return leftoverAfterApply(remainingShortfall, tripRefund) <= tolerance;
}

export function scoreUnlinkedShortfallMatch(input: UnlinkedShortfallCandidateInput): number {
  const R = Math.abs(input.tripRefund) || 0;
  const S = Math.abs(input.remainingShortfall) || 0;
  const T = Math.abs(input.tollAmount) || 0;
  if (R <= 0 || (S <= 0 && T <= 0)) return 0;

  const target = S > UNLINKED_SHORTFALL_TOLERANCE ? S : T;
  const amountDiff = Math.abs(target - R);
  const maxA = Math.max(target, R, 1);
  let amountScore = Math.max(0, 100 - (amountDiff / maxA) * 100);

  if (T > 0) {
    const tollDiff = Math.abs(T - R);
    const tollProx = Math.max(0, 100 - (tollDiff / Math.max(T, R, 1)) * 100);
    amountScore = Math.max(amountScore, tollProx * 0.95);
  }

  const tripMs = new Date(input.tripDate).getTime();
  const claimMs = new Date(input.claimOrTollDate).getTime();
  const daysDiff = Number.isFinite(tripMs) && Number.isFinite(claimMs)
    ? Math.abs(tripMs - claimMs) / (1000 * 60 * 60 * 24)
    : 14;
  // Soft boost within ±2 days (common: refund day vs tag toll next day)
  let dateScore = Math.max(0, 100 - daysDiff * 5);
  if (daysDiff <= 2) dateScore = Math.min(100, dateScore + 15);
  else if (daysDiff <= 7) dateScore = Math.min(100, dateScore + 5);

  return Math.round(amountScore * 0.75 + dateScore * 0.25);
}

export function isPendingOnlyRefundResolution(trip: {
  tollRefundResolution?: { status?: string } | null;
}): boolean {
  return trip.tollRefundResolution?.status === 'pending';
}

/**
 * Whether Unlinked Refunds still needs a manager decision on this trip.
 * Pending-hold alone is informational — but Apply-to-underpaid or Accept
 * (cash wash / phantom / etc.) means the row is still actionable.
 */
export function isUnlinkedRefundActionableNow(
  trip: { tollRefundResolution?: { status?: string } | null; platform?: string | null },
  opts?: {
    suggestionStatus?: string | null;
    hasRecommendedShortfall?: boolean;
  },
): boolean {
  if (opts?.hasRecommendedShortfall) return true;
  if (opts?.suggestionStatus && opts.suggestionStatus !== 'pending') return true;
  return !isPendingOnlyRefundResolution(trip);
}

/** Expense-logged via Apply to Underpaid (has appliedToClaimId or unlinked shortfall source). */
export function isUnlinkedApplyResolution(trip: {
  tollRefundResolution?: {
    status?: string;
    appliedToClaimId?: string | null;
    source?: string | null;
  } | null;
}): boolean {
  const res = trip.tollRefundResolution;
  if (!res || res.status !== 'expense_logged') return false;
  if (res.appliedToClaimId) return true;
  return typeof res.source === 'string' && res.source.startsWith('system:unlinked_shortfall:');
}

/** Trip back in Unlinked queue but claim still shows Reimbursed (partial undo). */
export function isUnlinkedApplySplitState(
  claim: { unlinkedTripId?: string | null; status?: string; resolutionReason?: string | null },
  trip?: { id?: string; tollRefundResolution?: { status?: string } | null } | null,
): boolean {
  if (!claim.unlinkedTripId || !trip || trip.id !== claim.unlinkedTripId) return false;
  const tripPending =
    !trip.tollRefundResolution?.status || trip.tollRefundResolution.status === 'pending';
  if (!tripPending) return false;
  return claim.status === 'Resolved' && claim.resolutionReason === 'Reimbursed';
}

/**
 * Underpaid Charge Driver only — not Deadhead/Personal Use (those steps run
 * before Unlinked Refunds in the wizard). Blocks while the same driver still
 * has an unresolved unlinked trip refund that could cover a shortfall.
 */
export function hasBlockingUnlinkedRefund(input: {
  claimDriverId?: string | null;
  unlinkedTrips: Array<{
    driverId?: string | null;
    tollCharges?: number;
    tollRefundResolution?: { status?: string } | null;
  }>;
}): boolean {
  const driverId = input.claimDriverId;
  if (!driverId) return false;
  return input.unlinkedTrips.some((t) => {
    if (t.driverId !== driverId) return false;
    if (!(Number(t.tollCharges) > 0)) return false;
    const status = t.tollRefundResolution?.status;
    // Unresolved = no resolution or still pending
    return !status || status === 'pending';
  });
}
