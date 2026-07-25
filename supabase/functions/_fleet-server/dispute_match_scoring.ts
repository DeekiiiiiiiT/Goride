/**
 * Pure dispute-refund scoring and candidate selection (no toll_controller deps).
 */
import {
  amountsAlign,
  DISPUTE_SHORTFALL_TOLERANCE,
} from "./dispute_refund_eligibility.ts";

export const DISPUTE_AUTO_AMBIGUITY_GAP = 15;
export const DISPUTE_AUTO_MAX_TIME_MINUTES = 120;
export const DEFAULT_DISPUTE_REFUND_AUTO_MIN_CONFIDENCE = 95;

export interface DisputeMatchCandidate {
  tollId: string;
  tripId: string | null;
  claimId: string | null;
  tollAmount: number;
  claimAmount: number | null;
  tripRefund: number | null;
  shortfall: number;
  uberRefund: number;
  variance: number;
  date: string;
  confidence: number;
  claimStatus: string | null;
  matchType: "claim" | "toll";
  eligibleForSuggestion: boolean;
  eligibleForAuto: boolean;
  rejectReason: string | null;
  timeDifferenceMinutes: number | null;
}

export function amountMatchScore(a: number, b: number): number {
  const amountDiff = Math.abs(a - b);
  const maxA = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.max(0, 100 - (amountDiff / maxA) * 100);
}

export function dateProximityScore(earlierMs: number, laterMs: number): number {
  const daysDiff = Math.abs(earlierMs - laterMs) / (1000 * 60 * 60 * 24);
  return Math.max(0, 100 - daysDiff * 3);
}

export function tripTimeProximityScore(
  timeDifferenceMinutes: number | null,
  maxMinutes = DISPUTE_AUTO_MAX_TIME_MINUTES,
): number {
  if (timeDifferenceMinutes == null || !Number.isFinite(timeDifferenceMinutes)) return 0;
  return Math.max(0, 100 - (timeDifferenceMinutes / maxMinutes) * 100);
}

export function computeDisputeMatchConfidence(input: {
  refundAmount: number;
  shortfall: number;
  claimAmount: number;
  refundDateMs: number;
  anchorDateMs: number;
  timeDifferenceMinutes: number | null;
}): number {
  const shortfallScore = amountMatchScore(input.refundAmount, input.shortfall);
  const claimScore = amountMatchScore(input.refundAmount, input.claimAmount);
  const dateScore = dateProximityScore(input.anchorDateMs, input.refundDateMs);
  const timeScore = tripTimeProximityScore(input.timeDifferenceMinutes);
  return Math.round(shortfallScore * 0.5 + claimScore * 0.25 + dateScore * 0.15 + timeScore * 0.1);
}

export function passesAutoHardGates(input: {
  refundAmount: number;
  shortfall: number;
  claimAmount: number;
  tripId: string | null;
  timeDifferenceMinutes: number | null;
}): string | null {
  if (input.shortfall <= DISPUTE_SHORTFALL_TOLERANCE) {
    return "Toll already fully paid on trip — no shortfall to fix";
  }
  if (!amountsAlign(input.refundAmount, input.shortfall)) {
    return "Dispute refund does not match the toll shortfall";
  }
  if (!amountsAlign(input.claimAmount, input.shortfall)) {
    return "Claim amount does not match the live shortfall";
  }
  if (!input.tripId) {
    return "No confident trip link for this toll";
  }
  if (
    input.timeDifferenceMinutes == null ||
    input.timeDifferenceMinutes > DISPUTE_AUTO_MAX_TIME_MINUTES
  ) {
    return "Trip time is too far from the toll";
  }
  return null;
}

export function pickDisputeMatchCandidate(
  candidates: DisputeMatchCandidate[],
  opts: { mode: "auto" | "suggest"; minConfidence?: number },
): DisputeMatchCandidate | null {
  const pool = candidates.filter((c) =>
    opts.mode === "auto" ? c.eligibleForAuto : c.eligibleForSuggestion
  );
  if (pool.length === 0) return null;

  const sorted = [...pool].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0];

  if (opts.mode === "auto" && sorted.length >= 2) {
    const gap = best.confidence - sorted[1].confidence;
    if (gap < DISPUTE_AUTO_AMBIGUITY_GAP) return null;
  }

  if (opts.minConfidence != null && best.confidence < opts.minConfidence) return null;
  return best;
}

export function candidateToSuggestion(c: DisputeMatchCandidate): Record<string, unknown> {
  return {
    tollId: c.tollId,
    tripId: c.tripId,
    tollAmount: c.tollAmount,
    claimAmount: c.claimAmount,
    tripRefund: c.tripRefund,
    uberRefund: c.uberRefund,
    variance: c.variance,
    shortfall: c.shortfall,
    date: c.date,
    confidence: c.confidence,
    claimId: c.claimId,
    claimStatus: c.claimStatus,
    matchType: c.matchType,
    eligibleForAuto: c.eligibleForAuto,
    rejectReason: c.rejectReason,
    timeDifferenceMinutes: c.timeDifferenceMinutes,
  };
}
