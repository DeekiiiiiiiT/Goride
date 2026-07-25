/**
 * Server mirror of apps/fleet/src/utils/deadheadMatchGuard.ts.
 * Keep thresholds and demotion outcomes in sync with the Vitest suite there.
 */

export const DEADHEAD_APPROACH_MAX_MINUTES = 45;
export const DEADHEAD_REFUND_THRESHOLD = 0.05;

export interface DeadheadMatchLike {
  matchType: string;
  reasonCode?: string;
  reason?: string;
  timeDifferenceMinutes?: number;
  varianceAmount?: number;
  windowHit?: string;
  tripTollCharges?: number;
  tollAmount?: number;
}

export function demoteSpuriousDeadheadMatch<T extends DeadheadMatchLike>(match: T): T & {
  deadheadDemotedReason?: "huge_gap" | "platform_refund";
} {
  const isDeadhead =
    match.matchType === "DEADHEAD_MATCH" ||
    match.reasonCode === "ENROUTE_APPROACH" ||
    (match.matchType === "PERSONAL_MATCH" && match.reasonCode === "ENROUTE_APPROACH");

  if (!isDeadhead) return match;

  const gap = Math.abs(Number(match.timeDifferenceMinutes) || 0);
  const refund = Math.abs(Number(match.tripTollCharges) || 0);

  if (gap > DEADHEAD_APPROACH_MAX_MINUTES) {
    return {
      ...match,
      matchType: "PERSONAL_MATCH",
      reasonCode: "ORPHAN_OUT_OF_WINDOW",
      windowHit: match.windowHit === "ENROUTE" ? "NONE" : match.windowHit,
      reason: `Too far from trip for deadhead (${gap.toFixed(0)} min) — review or discard`,
      deadheadDemotedReason: "huge_gap",
    };
  }

  if (refund > DEADHEAD_REFUND_THRESHOLD) {
    const tollCost = Math.abs(Number(match.tollAmount) || 0);
    const varianceAmount =
      match.varianceAmount != null
        ? match.varianceAmount
        : tollCost > 0
        ? refund - tollCost
        : match.varianceAmount;
    return {
      ...match,
      matchType: "AMOUNT_VARIANCE",
      reasonCode: "ON_TRIP",
      windowHit: "ON_TRIP",
      varianceAmount,
      reason: `Trip already has $${refund.toFixed(2)} platform toll credit — not unreimbursed deadhead`,
      deadheadDemotedReason: "platform_refund",
    };
  }

  return match;
}
