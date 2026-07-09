/**
 * Pure "orphan toll" classifier for personal-use detection.
 *
 * An "orphan toll" is a toll charge that the trip-matching engine could not
 * attach to ANY trip (it fell outside every trip's time window). Today those
 * tolls silently fall into the "Needs Review" bucket even though "no trip
 * explains this toll" is the STRONGEST signal of personal (off-duty) use.
 *
 * This function turns that signal into a tiered classification:
 *   - No trip for the vehicle/driver on the toll's day        → high   / ORPHAN_NO_TRIP
 *   - A same-day trip exists but the toll is far from it       → medium / ORPHAN_OUT_OF_WINDOW
 *   - A same-day trip exists within the proximity window       → not orphan (stays ambiguous)
 *
 * It is intentionally pure, side-effect free, and dependency-free (no date-fns)
 * so it can be unit-tested AND hand-ported verbatim to the Deno server
 * (mirrors the refundClassifier.ts pattern). The server copy in
 * toll_controller.tsx must stay byte-identical to this logic.
 *
 * Mirrored across apps/{fleet,admin} (matching tollReconciliation.ts scope) +
 * a hand-ported Deno copy in the server's toll_controller.tsx.
 *
 * NON-BREAKAGE: nothing calls this unless the `personalUseDetectionEnabled`
 * feature flag is ON. With the flag OFF this module is dead code.
 */

export type PersonalUseReasonCode =
  | 'ORPHAN_NO_TRIP'
  | 'ORPHAN_OUT_OF_WINDOW'
  | 'ORPHAN_NEARBY_UNEXPLAINED';

/** Minimal trip shape the classifier reads — only the timing anchors. */
export interface OrphanCandidateTrip {
  requestTime?: string | null;
  dropoffTime?: string | null;
  date?: string | null;
}

export interface OrphanClassifierInput {
  /** Parsed timestamp of the toll transaction. */
  txDate: Date;
  /**
   * Candidate trips already narrowed to a same-day-ish set by the caller
   * (e.g. the server's sameDayPreFilter ±1 day). May be empty.
   */
  candidateTrips: OrphanCandidateTrip[];
  /**
   * How close (minutes) a same-day trip must be to the toll for the toll to be
   * considered plausibly trip-related rather than personal. Default caller value: 180.
   */
  orphanProximityMinutes: number;
}

export interface OrphanClassification {
  /** True when the toll should be classified as personal use. */
  isOrphan: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasonCode: PersonalUseReasonCode;
  /** Minutes to the nearest candidate trip anchor, or null when none parseable. */
  nearestTripDiffMinutes: number | null;
}

/**
 * Resolve a trip's timing anchor to epoch millis, preferring the most precise
 * field available (dropoff → request → bare date). Returns null if unparseable.
 * Uses `new Date(...)` (not date-fns) so client and Deno behave identically.
 */
function tripAnchorMs(t: OrphanCandidateTrip): number | null {
  const raw = t.dropoffTime || t.requestTime || t.date;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** UTC calendar-day key (YYYY-MM-DD) for same-day comparison. */
function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Classify a toll that produced ZERO trip matches. Callers must only invoke
 * this after `findTollMatches*` returned no matches.
 */
export function classifyOrphanToll(input: OrphanClassifierInput): OrphanClassification {
  const { txDate, candidateTrips, orphanProximityMinutes } = input;

  const txMs = txDate instanceof Date ? txDate.getTime() : NaN;
  if (Number.isNaN(txMs)) {
    return {
      isOrphan: true,
      confidence: 'low',
      reasonCode: 'ORPHAN_NEARBY_UNEXPLAINED',
      nearestTripDiffMinutes: null,
    };
  }

  const txDay = utcDayKey(txMs);
  let nearestDiffMin: number | null = null;
  let hasSameDayTrip = false;

  for (const t of candidateTrips || []) {
    const ms = tripAnchorMs(t);
    if (ms == null) continue;
    const diffMin = Math.abs(ms - txMs) / 60000;
    if (nearestDiffMin == null || diffMin < nearestDiffMin) {
      nearestDiffMin = diffMin;
    }
    if (utcDayKey(ms) === txDay) {
      hasSameDayTrip = true;
    }
  }

  // Strongest signal: no trip at all on the toll's day (incl. no parseable trips).
  if (!hasSameDayTrip) {
    return {
      isOrphan: true,
      confidence: 'high',
      reasonCode: 'ORPHAN_NO_TRIP',
      nearestTripDiffMinutes: nearestDiffMin,
    };
  }

  // A same-day trip exists, but the toll sits well outside the proximity window.
  if (nearestDiffMin != null && nearestDiffMin > orphanProximityMinutes) {
    return {
      isOrphan: true,
      confidence: 'medium',
      reasonCode: 'ORPHAN_OUT_OF_WINDOW',
      nearestTripDiffMinutes: nearestDiffMin,
    };
  }

  // Same-day trip within proximity but no trip window matched — route to
  // Personal Use for human confirmation (low confidence).
  return {
    isOrphan: true,
    confidence: 'low',
    reasonCode: 'ORPHAN_NEARBY_UNEXPLAINED',
    nearestTripDiffMinutes: nearestDiffMin,
  };
}
