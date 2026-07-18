/**
 * Toll Brain classify-match v1 (Deno twin).
 * Keep in sync with apps/fleet/src/utils/tollBrainClassify.ts
 */

export interface TollBrainPolicy {
  id: string;
  name: string;
  detectionEnabled: boolean;
  detectEnroute: boolean;
  geofenceRadiusM: number;
  roundTripCooldownMs: number;
  approachMinutes: number;
  postTripMinutes: number;
  sameDayPadDays: number;
  varianceThreshold: number;
  cashAmountDeltaMax: number;
  cashReceiptProximityMinutes: number;
  personalUseDetectionEnabled: boolean;
  orphanProximityMinutes: number;
  ambiguityMinScore: number;
  ambiguityMaxGap: number;
  maxSuggestions: number;
  liveLedgerMaterializeEnabled: boolean;
  tripTimeMode: "trust_utc" | "legacy_reinterpret";
  isDefault: boolean;
}

export const DEFAULT_POLICY: TollBrainPolicy = {
  id: "default",
  name: "default",
  detectionEnabled: true,
  detectEnroute: false,
  geofenceRadiusM: 100,
  roundTripCooldownMs: 5 * 60 * 1000,
  approachMinutes: 45,
  postTripMinutes: 15,
  sameDayPadDays: 1,
  varianceThreshold: 0.05,
  cashAmountDeltaMax: 15,
  cashReceiptProximityMinutes: 90,
  personalUseDetectionEnabled: true,
  orphanProximityMinutes: 180,
  ambiguityMinScore: 50,
  ambiguityMaxGap: 15,
  maxSuggestions: 5,
  liveLedgerMaterializeEnabled: true,
  tripTimeMode: "trust_utc",
  isDefault: true,
};

export function mergePolicy(partial?: Partial<TollBrainPolicy> | null): TollBrainPolicy {
  return { ...DEFAULT_POLICY, ...partial, id: partial?.id || "default" };
}

function isCashReceipt(toll: Record<string, unknown>): boolean {
  const pm = String(toll.paymentMethod || "").toLowerCase();
  if (pm.includes("cash")) return true;
  if (toll.receiptUrl) return true;
  const blob = `${toll.location || ""} ${toll.plaza || ""} ${toll.category || ""}`.toLowerCase();
  return blob.includes("passage receipt") || blob.includes("toll passage");
}

function parseTollDate(toll: Record<string, unknown>): Date | null {
  const raw = String(toll.date || "");
  if (!raw) return null;
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minutesDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

export function classifyTollMatch(input: {
  toll: Record<string, unknown>;
  trips: Array<Record<string, unknown>>;
  expectedCostAbs?: number;
  policy?: Partial<TollBrainPolicy>;
  includeOrphan?: boolean;
}): {
  suggestions: Array<Record<string, unknown>>;
  best: Record<string, unknown> | null;
  classification: {
    matchStatus: string;
    matchedTripId: string | null;
    matchTypeCode: string | null;
    matchReasonCode: string | null;
    matchConfidenceScore: number | null;
  };
  meta: { method: "toll_brain_v1"; candidateTripCount: number };
} {
  const policy = mergePolicy(input.policy);
  const txDate = parseTollDate(input.toll);
  if (!txDate) {
    return {
      suggestions: [],
      best: null,
      classification: {
        matchStatus: "unmatched",
        matchedTripId: null,
        matchTypeCode: null,
        matchReasonCode: null,
        matchConfidenceScore: null,
      },
      meta: { method: "toll_brain_v1", candidateTripCount: 0 },
    };
  }

  const tollAbs =
    typeof input.expectedCostAbs === "number" && input.expectedCostAbs > 0
      ? input.expectedCostAbs
      : Math.abs(Number(input.toll.amount) || 0);

  const padMs = Math.max(0, policy.sameDayPadDays) * 86_400_000 + 86_400_000;
  const candidates = (input.trips || []).filter((t) => {
    const ms = new Date(String(t.dropoffTime || t.date || "")).getTime();
    return !Number.isNaN(ms) && Math.abs(ms - txDate.getTime()) <= padMs;
  });

  const suggestions: Array<Record<string, unknown>> = [];

  for (const trip of candidates) {
    const dropoff = new Date(String(trip.dropoffTime || trip.date || ""));
    const request = new Date(String(trip.requestTime || trip.date || ""));
    if (Number.isNaN(dropoff.getTime()) || Number.isNaN(request.getTime())) continue;
    const pickup = trip.startTime
      ? new Date(String(trip.startTime))
      : new Date(request.getTime());

    const approachStart = new Date(request.getTime() - policy.approachMinutes * 60_000);
    const searchEnd = new Date(dropoff.getTime() + policy.postTripMinutes * 60_000);
    const t = txDate.getTime();
    if (t < approachStart.getTime() || t > searchEnd.getTime()) continue;

    const credit = Math.abs(Number(trip.tollCharges) || 0);
    let matchType = "PERSONAL_MATCH";
    let reasonCode = "POST_TRIP_GAP";
    let windowHit = "POST_TRIP";
    let base = 20;

    if (t >= pickup.getTime() && t <= dropoff.getTime()) {
      windowHit = "ON_TRIP";
      base = 70;
      matchType = Math.abs(credit - tollAbs) <= policy.varianceThreshold
        ? "PERFECT_MATCH"
        : "AMOUNT_VARIANCE";
      reasonCode = "ON_TRIP";
    } else if (t >= approachStart.getTime() && t < pickup.getTime()) {
      windowHit = "ENROUTE";
      base = 45;
      matchType = "DEADHEAD_MATCH";
      reasonCode = "ENROUTE_APPROACH";
      if (credit > 0.05) {
        matchType = "AMOUNT_VARIANCE";
        reasonCode = "ON_TRIP";
        windowHit = "ON_TRIP";
      }
    }

    const diff = t < pickup.getTime()
      ? minutesDiff(pickup, txDate)
      : t > dropoff.getTime()
      ? minutesDiff(txDate, dropoff)
      : 0;

    suggestions.push({
      tripId: trip.id,
      matchType,
      reasonCode,
      windowHit,
      confidenceScore: base,
      confidence: base >= 80 ? "high" : base >= 50 ? "medium" : "low",
      timeDifferenceMinutes: diff,
      varianceAmount: credit - tollAbs,
      tripTollCharges: credit,
      tripPlatform: trip.platform,
      reason: `${windowHit} · credit $${credit.toFixed(2)} vs toll $${tollAbs.toFixed(2)}`,
    });
  }

  // Cash soft-match
  if (suggestions.length === 0 && isCashReceipt(input.toll)) {
    for (const trip of candidates) {
      const credit = Math.abs(Number(trip.tollCharges) || 0);
      if (credit <= 0.05) continue;
      if (Math.abs(credit - tollAbs) > policy.cashAmountDeltaMax) continue;
      const dropoff = new Date(String(trip.dropoffTime || trip.date || ""));
      const request = new Date(String(trip.requestTime || trip.date || ""));
      const lo = Math.min(request.getTime(), dropoff.getTime());
      const hi = Math.max(request.getTime(), dropoff.getTime());
      const t = txDate.getTime();
      const gapMin = t >= lo && t <= hi ? 0 : Math.min(Math.abs(t - lo), Math.abs(t - hi)) / 60_000;
      if (gapMin > policy.cashReceiptProximityMinutes) continue;
      suggestions.push({
        tripId: trip.id,
        matchType: "AMOUNT_VARIANCE",
        reasonCode: "ON_TRIP",
        windowHit: "ON_TRIP",
        confidenceScore: 62,
        confidence: "medium",
        timeDifferenceMinutes: gapMin,
        varianceAmount: credit - tollAbs,
        tripTollCharges: credit,
        tripPlatform: trip.platform,
        reason: `Cash receipt near trip with $${credit.toFixed(2)} platform toll credit`,
      });
    }
  }

  suggestions.sort(
    (a, b) => Number(b.confidenceScore || 0) - Number(a.confidenceScore || 0),
  );

  if (
    suggestions.length === 0 &&
    (input.includeOrphan !== false) &&
    policy.personalUseDetectionEnabled
  ) {
    suggestions.push({
      tripId: "",
      matchType: "PERSONAL_MATCH",
      reasonCode: candidates.length === 0 ? "ORPHAN_NO_TRIP" : "ORPHAN_NEARBY_UNEXPLAINED",
      confidenceScore: candidates.length === 0 ? 85 : 40,
      confidence: candidates.length === 0 ? "high" : "low",
      timeDifferenceMinutes: 0,
      reason: candidates.length === 0
        ? "No trip on this day explains this toll (personal use)"
        : "Nearby trip does not explain this toll — confirm personal",
      windowHit: "NONE",
    });
  }

  const capped = suggestions.slice(0, policy.maxSuggestions);
  const best = capped[0] || null;
  let matchStatus = "unmatched";
  if (best && best.tripId === "" && best.matchType === "PERSONAL_MATCH") {
    matchStatus = "orphan_personal";
  } else if (best && best.tripId) matchStatus = "matched";

  return {
    suggestions: capped,
    best,
    classification: {
      matchStatus,
      matchedTripId: best && best.tripId ? String(best.tripId) : null,
      matchTypeCode: best ? String(best.matchType) : null,
      matchReasonCode: best?.reasonCode ? String(best.reasonCode) : null,
      matchConfidenceScore: best ? Number(best.confidenceScore) : null,
    },
    meta: { method: "toll_brain_v1", candidateTripCount: candidates.length },
  };
}
