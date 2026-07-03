/**
 * Deno server copy of the pure "orphan toll" (personal-use) classifier.
 *
 * MUST stay byte-identical in behavior to the client util
 * apps/fleet/src/utils/orphanTollClassifier.ts (and its apps/admin mirror).
 * A sibling Deno test (orphanTollClassifier.test.ts) exercises the same fixtures
 * as the client Vitest suite to catch drift.
 *
 * Pure + dependency-free by design so it is importable by both toll_controller.tsx
 * and the Deno test without side effects. Only reached when the
 * personalUseDetectionEnabled feature flag is ON.
 */

export type PersonalUseReasonCode = "ORPHAN_NO_TRIP" | "ORPHAN_OUT_OF_WINDOW";

export interface OrphanCandidateTrip {
  requestTime?: string | null;
  dropoffTime?: string | null;
  date?: string | null;
}

export interface OrphanClassifierInput {
  txDate: Date;
  candidateTrips: OrphanCandidateTrip[];
  orphanProximityMinutes: number;
}

export interface OrphanClassification {
  isOrphan: boolean;
  confidence: "high" | "medium" | "low";
  reasonCode: PersonalUseReasonCode;
  nearestTripDiffMinutes: number | null;
}

/** Resolve a trip's timing anchor to epoch millis (dropoff → request → date). */
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
 * Classify a toll that produced ZERO trip matches. Only invoke after
 * findTollMatchesServer returned no matches.
 */
export function classifyOrphanToll(input: OrphanClassifierInput): OrphanClassification {
  const { txDate, candidateTrips, orphanProximityMinutes } = input;

  const txMs = txDate instanceof Date ? txDate.getTime() : NaN;
  if (Number.isNaN(txMs)) {
    return {
      isOrphan: false,
      confidence: "low",
      reasonCode: "ORPHAN_OUT_OF_WINDOW",
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

  if (!hasSameDayTrip) {
    return {
      isOrphan: true,
      confidence: "high",
      reasonCode: "ORPHAN_NO_TRIP",
      nearestTripDiffMinutes: nearestDiffMin,
    };
  }

  if (nearestDiffMin != null && nearestDiffMin > orphanProximityMinutes) {
    return {
      isOrphan: true,
      confidence: "medium",
      reasonCode: "ORPHAN_OUT_OF_WINDOW",
      nearestTripDiffMinutes: nearestDiffMin,
    };
  }

  return {
    isOrphan: false,
    confidence: "low",
    reasonCode: "ORPHAN_OUT_OF_WINDOW",
    nearestTripDiffMinutes: nearestDiffMin,
  };
}
