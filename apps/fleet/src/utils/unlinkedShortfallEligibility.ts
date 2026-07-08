/**
 * Unlinked trip-refund → underpaid shortfall match scoring.
 * Shared by fleet UI gates and toll_controller match-and-net.
 */

export const UNLINKED_SHORTFALL_TOLERANCE = 0.05;

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
}

export function remainingClaimShortfall(claim: {
  amount?: number;
  paidAmount?: number;
}): number {
  const shortfall = Math.abs(Number(claim.amount) || 0);
  const paid = Math.abs(Number(claim.paidAmount) || 0);
  return Math.max(0, shortfall - paid);
}

export function leftoverAfterApply(remainingShortfall: number, tripRefund: number): number {
  return Math.max(0, remainingShortfall - Math.abs(tripRefund));
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
  const dateScore = Math.max(0, 100 - daysDiff * 5);

  return Math.round(amountScore * 0.8 + dateScore * 0.2);
}

export function isPendingOnlyRefundResolution(trip: {
  tollRefundResolution?: { status?: string } | null;
}): boolean {
  return trip.tollRefundResolution?.status === 'pending';
}

/**
 * Charge Driver should not fire while the same driver still has an unresolved
 * unlinked trip refund that could cover a shortfall.
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
