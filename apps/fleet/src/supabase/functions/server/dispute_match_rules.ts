/**
 * Dispute-refund match evaluation (async — uses toll match engine).
 */
import {
  DISPUTE_SHORTFALL_TOLERANCE,
  isBareTollEligibleForDisputeMatch,
  isFullyReimbursedViaTrip,
  isTollBlockedForDisputeMatch,
  tollShortfallAmount,
} from "./dispute_refund_eligibility.ts";
import { resolveLiveTripContextForToll } from "./dispute_match_toll_enrichment.ts";
import {
  findTollMatchesServer,
  pickBestValidTollMatch,
} from "./toll_controller.tsx";
import {
  amountMatchScore,
  candidateToSuggestion,
  computeDisputeMatchConfidence,
  dateProximityScore,
  type DisputeMatchCandidate,
  passesAutoHardGates,
  pickDisputeMatchCandidate,
  tripTimeProximityScore,
  DEFAULT_DISPUTE_REFUND_AUTO_MIN_CONFIDENCE,
  DISPUTE_AUTO_AMBIGUITY_GAP,
  DISPUTE_AUTO_MAX_TIME_MINUTES,
} from "./dispute_match_scoring.ts";

export {
  amountMatchScore,
  candidateToSuggestion,
  computeDisputeMatchConfidence,
  dateProximityScore,
  DEFAULT_DISPUTE_REFUND_AUTO_MIN_CONFIDENCE,
  DISPUTE_AUTO_AMBIGUITY_GAP,
  DISPUTE_AUTO_MAX_TIME_MINUTES,
  pickDisputeMatchCandidate,
  tripTimeProximityScore,
  type DisputeMatchCandidate,
};

async function resolveTripContextForToll(
  toll: any,
  claim: any | null,
  trips: any[],
  fleetTz: string,
): Promise<{ tripId: string | null; timeDifferenceMinutes: number | null; tripRefund: number | null }> {
  const tollCost = Math.abs(claim?.expectedAmount ?? toll?.amount ?? 0);

  const persistedTripId = claim?.tripId || toll?.tripId || null;
  if (persistedTripId) {
    const matches = findTollMatchesServer(toll, trips, fleetTz);
    const forTrip = matches.find(
      (m) =>
        m.tripId === persistedTripId &&
        (m.matchType === "AMOUNT_VARIANCE" || m.matchType === "PERFECT_MATCH"),
    );
    const live = await resolveLiveTripContextForToll(toll, fleetTz);
    const claimAmount = Math.abs(claim?.amount ?? 0);
    const tripRefund =
      live?.tripRefund ??
      (claimAmount > 0 && tollCost > 0 ? Math.max(0, tollCost - claimAmount) : null);
    return {
      tripId: persistedTripId,
      timeDifferenceMinutes: forTrip?.timeDifferenceMinutes ?? null,
      tripRefund,
    };
  }

  const matches = findTollMatchesServer(toll, trips, fleetTz);
  const best = pickBestValidTollMatch(matches);
  if (!best?.tripId) {
    return { tripId: null, timeDifferenceMinutes: null, tripRefund: null };
  }

  const live = await resolveLiveTripContextForToll(toll, fleetTz);
  return {
    tripId: best.tripId,
    timeDifferenceMinutes: best.timeDifferenceMinutes ?? null,
    tripRefund: live?.tripRefund ?? null,
  };
}

export async function evaluateDisputeClaimCandidate(input: {
  refund: { amount: number; date: string };
  claim: any;
  toll: any | null;
  trips: any[];
  fleetTz: string;
  linkedTollIds: Set<string>;
}): Promise<DisputeMatchCandidate | null> {
  const { refund, claim, toll, trips, fleetTz, linkedTollIds } = input;
  if (!claim?.id || !claim.transactionId) return null;

  const refundAmount = Math.abs(refund.amount || 0);
  const refundDateMs = new Date(refund.date).getTime();
  const claimAmount = Math.abs(claim.amount || 0);
  const tollId = String(claim.transactionId);

  if (!toll) {
    return {
      tollId,
      tripId: null,
      claimId: claim.id,
      tollAmount: 0,
      claimAmount,
      tripRefund: null,
      shortfall: 0,
      uberRefund: refundAmount,
      variance: claimAmount - refundAmount,
      date: claim.date || refund.date,
      confidence: 0,
      claimStatus: claim.status,
      matchType: "claim",
      eligibleForSuggestion: false,
      eligibleForAuto: false,
      rejectReason: "Toll record not found",
      timeDifferenceMinutes: null,
    };
  }

  if (linkedTollIds.has(tollId)) return null;

  const tollCost = Math.abs(claim.expectedAmount ?? toll.amount ?? 0);
  const tripCtx = await resolveTripContextForToll(toll, claim, trips, fleetTz);
  const liveCtx = await resolveLiveTripContextForToll(toll, fleetTz, {
    suggestedTripId: tripCtx.tripId,
  });
  const liveTripRefund = liveCtx?.tripRefund ?? null;
  const tripRefund =
    liveTripRefund ??
    tripCtx.tripRefund ??
    (claimAmount > 0 && tollCost > 0 ? Math.max(0, tollCost - claimAmount) : null);
  const shortfall = tollShortfallAmount(tollCost, tripRefund ?? 0);
  const liveShortfall =
    liveTripRefund != null ? tollShortfallAmount(tollCost, liveTripRefund) : null;

  const anchorDateMs = new Date(toll.date || claim.createdAt || refund.date).getTime();
  const confidence = computeDisputeMatchConfidence({
    refundAmount,
    shortfall,
    claimAmount,
    refundDateMs,
    anchorDateMs,
    timeDifferenceMinutes: tripCtx.timeDifferenceMinutes,
  });

  let rejectReason: string | null = null;
  let eligibleForSuggestion = true;

  if (isTollBlockedForDisputeMatch(toll)) {
    rejectReason = "Toll was already handled (personal/deadhead/reimbursed)";
    eligibleForSuggestion = false;
  } else if (shortfall <= DISPUTE_SHORTFALL_TOLERANCE) {
    rejectReason = "Toll already fully paid on trip — no shortfall";
    eligibleForSuggestion = false;
  }

  let autoReject = passesAutoHardGates({
    refundAmount,
    shortfall: liveShortfall ?? shortfall,
    claimAmount,
    tripId: tripCtx.tripId,
    timeDifferenceMinutes: tripCtx.timeDifferenceMinutes,
  });
  if (autoReject == null && liveTripRefund == null) {
    autoReject = "Live trip refund required for auto-match";
  } else if (
    autoReject == null &&
    liveTripRefund != null &&
    isFullyReimbursedViaTrip(tollCost, liveTripRefund)
  ) {
    autoReject = "Toll already fully paid on trip — no shortfall to fix";
  }

  return {
    tollId,
    tripId: tripCtx.tripId,
    claimId: claim.id,
    tollAmount: tollCost,
    claimAmount,
    tripRefund,
    shortfall,
    uberRefund: refundAmount,
    variance: shortfall - refundAmount,
    date: toll.date || claim.createdAt || refund.date,
    confidence,
    claimStatus: claim.status,
    matchType: "claim",
    eligibleForSuggestion,
    eligibleForAuto: eligibleForSuggestion && autoReject == null,
    rejectReason: rejectReason || autoReject,
    timeDifferenceMinutes: tripCtx.timeDifferenceMinutes,
  };
}

export async function evaluateDisputeBareTollCandidate(input: {
  refund: { amount: number; date: string };
  toll: any;
  fleetTz: string;
  linkedTollIds: Set<string>;
  trips: any[];
}): Promise<DisputeMatchCandidate | null> {
  const { refund, toll, fleetTz, linkedTollIds, trips } = input;
  if (!toll?.id || linkedTollIds.has(String(toll.id))) return null;
  if (isTollBlockedForDisputeMatch(toll)) return null;

  const refundAmount = Math.abs(refund.amount || 0);
  const refundDateMs = new Date(refund.date).getTime();
  const tollAmount = Math.abs(toll.amount || 0);

  const tripCtx = await resolveTripContextForToll(toll, null, trips, fleetTz);
  const tripRefund = tripCtx.tripRefund;
  const shortfall = tollShortfallAmount(tollAmount, tripRefund ?? 0);

  if (!isBareTollEligibleForDisputeMatch({
    tollAmount,
    tripRefund,
    workflowStage: toll.workflowStage,
  })) {
    return null;
  }

  const anchorDateMs = new Date(toll.date).getTime();
  const amountScore = amountMatchScore(refundAmount, shortfall > 0 ? shortfall : tollAmount);
  const dateScore = dateProximityScore(anchorDateMs, refundDateMs);
  const timeScore = tripTimeProximityScore(tripCtx.timeDifferenceMinutes);
  const confidence = Math.round(amountScore * 0.55 + dateScore * 0.25 + timeScore * 0.2);

  return {
    tollId: toll.id,
    tripId: tripCtx.tripId,
    claimId: null,
    tollAmount,
    claimAmount: shortfall > 0 ? shortfall : tollAmount,
    tripRefund,
    shortfall,
    uberRefund: refundAmount,
    variance: shortfall - refundAmount,
    date: toll.date,
    confidence,
    claimStatus: null,
    matchType: "toll",
    eligibleForSuggestion: true,
    eligibleForAuto: false,
    rejectReason: "Manual only — no open claim",
    timeDifferenceMinutes: tripCtx.timeDifferenceMinutes,
  };
}
