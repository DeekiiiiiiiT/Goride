import { VARIANCE_THRESHOLD } from './tollReconciliation';
import type { MatchResult } from './tollReconciliation';

/** Matches getTripWindows approach buffer (request − 45 → pickup). */
export const DEADHEAD_APPROACH_MAX_MINUTES = 45;

export type DeadheadDemoteInput = Pick<
  MatchResult,
  'matchType' | 'reasonCode' | 'reason' | 'timeDifferenceMinutes' | 'varianceAmount' | 'windowHit'
> & {
  tripTollCharges?: number | null;
  trip?: { tollCharges?: number | null } | null;
  tollAmount?: number | null;
};

export type DeadheadDemoteResult<T extends DeadheadDemoteInput> = T & {
  /** Why deadhead was demoted — undefined if unchanged. */
  deadheadDemotedReason?: 'huge_gap' | 'platform_refund';
};

/**
 * Deadhead = unreimbursed en-route. Demote when:
 * - gap to pickup/dropoff exceeds the 45-min approach buffer (long request→pickup
 *   windows otherwise inflate ENROUTE), or
 * - the matched trip already has a meaningful platform toll refund (Uber does
 *   not refund empty-car approach tolls).
 */
export function demoteSpuriousDeadheadMatch<T extends DeadheadDemoteInput>(
  match: T,
): DeadheadDemoteResult<T> {
  const isDeadhead =
    match.matchType === 'DEADHEAD_MATCH' ||
    match.reasonCode === 'ENROUTE_APPROACH' ||
    (match.matchType === 'PERSONAL_MATCH' && match.reasonCode === 'ENROUTE_APPROACH');

  if (!isDeadhead) return match;

  const gap = Math.abs(Number(match.timeDifferenceMinutes) || 0);
  const refund = Math.abs(
    Number(match.tripTollCharges ?? match.trip?.tollCharges) || 0,
  );

  if (gap > DEADHEAD_APPROACH_MAX_MINUTES) {
    return {
      ...match,
      matchType: 'PERSONAL_MATCH',
      reasonCode: 'ORPHAN_OUT_OF_WINDOW',
      windowHit: match.windowHit === 'ENROUTE' ? 'NONE' : match.windowHit,
      reason: `Too far from trip for deadhead (${gap.toFixed(0)} min) — review or discard`,
      deadheadDemotedReason: 'huge_gap',
    };
  }

  if (refund > VARIANCE_THRESHOLD) {
    const tollCost = Math.abs(Number(match.tollAmount) || 0);
    const varianceAmount =
      match.varianceAmount != null
        ? match.varianceAmount
        : tollCost > 0
          ? refund - tollCost
          : undefined;
    return {
      ...match,
      matchType: 'AMOUNT_VARIANCE',
      reasonCode: 'ON_TRIP',
      windowHit: 'ON_TRIP',
      varianceAmount,
      reason: `Trip already has $${refund.toFixed(2)} platform toll credit — not unreimbursed deadhead`,
      deadheadDemotedReason: 'platform_refund',
    };
  }

  return match;
}
