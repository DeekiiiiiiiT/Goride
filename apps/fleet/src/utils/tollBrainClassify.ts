/**
 * Toll Brain classify-match v1 — pure waterfall.
 * Keep in sync with supabase/functions/toll-brain/classify.ts
 */

import { addMinutes, differenceInMinutes, isWithinInterval, parseISO, subMinutes } from 'date-fns';
import type {
  TollBrainClassifyMatchInput,
  TollBrainClassifyMatchResult,
  TollBrainPolicy,
  TollBrainSuggestion,
  TollBrainTripInput,
} from '@roam/types/tollBrain';
import { DEFAULT_TOLL_BRAIN_POLICY } from '@roam/types/tollBrain';
import { demoteSpuriousDeadheadMatch } from './deadheadMatchGuard';
import {
  cashReceiptAmountsAlign,
  findCashReceiptTripCreditHits,
  isCashOrPassageReceiptToll,
} from './cashReceiptTripMatch';
import { classifyOrphanToll } from './orphanTollClassifier';

export function mergeTollBrainPolicy(
  partial?: Partial<TollBrainPolicy> | null,
): TollBrainPolicy {
  return {
    id: partial?.id || 'default',
    ...DEFAULT_TOLL_BRAIN_POLICY,
    ...partial,
    name: partial?.name || DEFAULT_TOLL_BRAIN_POLICY.name,
    isDefault: partial?.isDefault ?? DEFAULT_TOLL_BRAIN_POLICY.isDefault,
  };
}

function parseTollDate(toll: TollBrainClassifyMatchInput['toll']): Date | null {
  const raw = toll.date;
  if (!raw) return null;
  if (raw.includes('T')) {
    const d = parseISO(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && toll.time) {
    const d = new Date(`${raw}T${normalizeTime(toll.time)}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = parseISO(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeTime(t: string): string {
  const s = t.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return '12:00:00';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const sec = m[3] || '00';
  const ap = (m[4] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}:${sec}`;
}

function tripTimes(trip: TollBrainTripInput) {
  const dropoff = parseISO(String(trip.dropoffTime || trip.date || ''));
  const request = parseISO(String(trip.requestTime || trip.date || ''));
  let pickup = request;
  if (trip.startTime) pickup = parseISO(String(trip.startTime));
  else if (trip.duration) pickup = subMinutes(dropoff, Number(trip.duration) || 0);
  const valid =
    !Number.isNaN(dropoff.getTime()) &&
    !Number.isNaN(request.getTime()) &&
    !Number.isNaN(pickup.getTime());
  return { request, pickup, dropoff, valid };
}

function sameDayCandidates(
  txDate: Date,
  trips: TollBrainTripInput[],
  padDays: number,
): TollBrainTripInput[] {
  const txMs = txDate.getTime();
  const pad = Math.max(0, padDays) * 86_400_000;
  return trips.filter((t) => {
    const ms = new Date(t.dropoffTime || t.date).getTime();
    return !Number.isNaN(ms) && Math.abs(ms - txMs) <= pad + 86_400_000;
  });
}

function driverMatch(
  a?: string | null,
  b?: string | null,
  aliases?: Record<string, string>,
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (!aliases) return false;
  return (aliases[a] ?? a) === (aliases[b] ?? b);
}

function scoreBand(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/**
 * Classify a toll against candidate trips (any platform).
 */
export function classifyTollMatch(
  input: TollBrainClassifyMatchInput,
): TollBrainClassifyMatchResult {
  const policy = mergeTollBrainPolicy(input.policy);
  const txDate = parseTollDate(input.toll);
  const empty: TollBrainClassifyMatchResult = {
    suggestions: [],
    best: null,
    classification: {
      matchStatus: 'unmatched',
      matchedTripId: null,
      matchTypeCode: null,
      matchReasonCode: null,
      matchConfidenceScore: null,
    },
    meta: {
      method: 'toll_brain_v1',
      candidateTripCount: 0,
      policiesApplied: policy,
    },
  };
  if (!txDate) return empty;

  const tagAbs = Math.abs(Number(input.toll.amount) || 0);
  const txAmountAbs =
    typeof input.expectedCostAbs === 'number' && input.expectedCostAbs > 0
      ? input.expectedCostAbs
      : tagAbs;

  const candidates = sameDayCandidates(txDate, input.trips || [], policy.sameDayPadDays);
  const suggestions: TollBrainSuggestion[] = [];

  for (const trip of candidates) {
    const times = tripTimes(trip);
    if (!times.valid) continue;

    const approachStart = subMinutes(times.request, policy.approachMinutes);
    const activeStart = times.pickup;
    const activeEnd = times.dropoff;
    const searchEnd = addMinutes(times.dropoff, policy.postTripMinutes);
    const searchStart = approachStart;

    if (!isWithinInterval(txDate, { start: searchStart, end: searchEnd })) continue;

    let windowHit: 'ON_TRIP' | 'ENROUTE' | 'POST_TRIP' = 'POST_TRIP';
    let base = 20;
    let matchType: TollBrainSuggestion['matchType'] = 'PERSONAL_MATCH';
    let reasonCode: TollBrainSuggestion['reasonCode'] = 'POST_TRIP_GAP';

    if (isWithinInterval(txDate, { start: activeStart, end: activeEnd })) {
      windowHit = 'ON_TRIP';
      base = 70;
      const amountMatch = Math.abs((Number(trip.tollCharges) || 0) - txAmountAbs) <= policy.varianceThreshold;
      matchType = amountMatch ? 'PERFECT_MATCH' : 'AMOUNT_VARIANCE';
      reasonCode = 'ON_TRIP';
    } else if (isWithinInterval(txDate, { start: approachStart, end: activeStart })) {
      windowHit = 'ENROUTE';
      base = 45;
      matchType = 'DEADHEAD_MATCH';
      reasonCode = 'ENROUTE_APPROACH';
    }

    let diff = 0;
    if (txDate < activeStart) diff = differenceInMinutes(activeStart, txDate);
    else if (txDate > activeEnd) diff = differenceInMinutes(txDate, activeEnd);

    const tripRefund = Math.abs(Number(trip.tollCharges) || 0);
    const vehicleMatch =
      !!input.toll.vehicleId &&
      !!trip.vehicleId &&
      String(input.toll.vehicleId).toLowerCase() === String(trip.vehicleId).toLowerCase();
    const dMatch = driverMatch(input.toll.driverId, trip.driverId, input.driverAliases);
    const amountMatch = Math.abs(tripRefund - txAmountAbs) <= policy.varianceThreshold;

    let score = base;
    if (vehicleMatch) score += 10;
    if (dMatch) score += 10;
    if (amountMatch) score += 10;
    score = Math.max(0, Math.min(100, score));

    let demoted = demoteSpuriousDeadheadMatch({
      matchType,
      reasonCode,
      reason: '',
      timeDifferenceMinutes: diff,
      varianceAmount: tripRefund - txAmountAbs,
      windowHit,
      tripTollCharges: tripRefund,
      tollAmount: txAmountAbs,
    });

    // Policy-aware deadhead gap uses approachMinutes as max
    if (
      (demoted.matchType === 'DEADHEAD_MATCH' || demoted.reasonCode === 'ENROUTE_APPROACH') &&
      Math.abs(diff) > policy.approachMinutes
    ) {
      demoted = {
        ...demoted,
        matchType: 'PERSONAL_MATCH',
        reasonCode: 'ORPHAN_OUT_OF_WINDOW',
        reason: `Too far from trip for deadhead (${diff} min) — review or discard`,
      };
    }

    suggestions.push({
      tripId: trip.id,
      matchType: demoted.matchType as TollBrainSuggestion['matchType'],
      reasonCode: demoted.reasonCode as TollBrainSuggestion['reasonCode'],
      confidenceScore: score,
      confidence: scoreBand(score),
      windowHit: (demoted.windowHit || windowHit) as TollBrainSuggestion['windowHit'],
      timeDifferenceMinutes: diff,
      varianceAmount:
        demoted.matchType === 'AMOUNT_VARIANCE' ? tripRefund - txAmountAbs : undefined,
      vehicleMatch,
      driverMatch: dMatch,
      reason:
        demoted.reason ||
        `${windowHit} match · trip credit $${tripRefund.toFixed(2)} vs toll $${txAmountAbs.toFixed(2)}`,
      tripTollCharges: tripRefund,
      tripPlatform: trip.platform || undefined,
      tripPickup: (trip.pickupLocation || '').substring(0, 40),
      tripDropoff: (trip.dropoffLocation || '').substring(0, 40),
      tripDate: trip.date,
      tripDriverId: trip.driverId || undefined,
      tripDriverName: trip.driverName || undefined,
    });
  }

  // Cash PERSONAL upgrade inside post-trip buffer
  if (isCashOrPassageReceiptToll(input.toll)) {
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const credit = Math.abs(Number(s.tripTollCharges) || 0);
      if (s.matchType !== 'PERSONAL_MATCH' || credit <= 0.05) continue;
      if (!cashReceiptAmountsAlign(txAmountAbs, credit, policy.cashAmountDeltaMax)) continue;
      suggestions[i] = {
        ...s,
        matchType: 'AMOUNT_VARIANCE',
        reasonCode: 'ON_TRIP',
        windowHit: 'ON_TRIP',
        varianceAmount: credit - txAmountAbs,
        confidenceScore: Math.max(s.confidenceScore || 0, 62),
        confidence: 'medium',
        reason: `Cash receipt near trip with $${credit.toFixed(2)} platform toll credit — upgraded for review`,
      };
    }
  }

  suggestions.sort((a, b) => {
    const sa = a.confidenceScore || 0;
    const sb = b.confidenceScore || 0;
    if (sb !== sa) return sb - sa;
    return a.timeDifferenceMinutes - b.timeDifferenceMinutes;
  });

  // Cash soft-match when no window hits
  if (suggestions.length === 0 && isCashOrPassageReceiptToll(input.toll)) {
    const hits = findCashReceiptTripCreditHits({
      tollAmountAbs: txAmountAbs,
      tollDate: txDate,
      proximityMinutes: policy.cashReceiptProximityMinutes,
      maxAmountDelta: policy.cashAmountDeltaMax,
      trips: candidates.map((t) => {
        const times = tripTimes(t);
        return {
          id: t.id,
          tollCharges: t.tollCharges,
          requestTime: t.requestTime,
          dropoffTime: t.dropoffTime,
          date: t.date,
          tripStart: times.valid ? times.request : null,
          tripEnd: times.valid ? times.dropoff : null,
        };
      }),
    });
    for (const hit of hits) {
      const trip = candidates.find((t) => t.id === hit.tripId);
      suggestions.push({
        tripId: hit.tripId,
        matchType: 'AMOUNT_VARIANCE',
        reasonCode: 'ON_TRIP',
        windowHit: 'ON_TRIP',
        confidenceScore: hit.confidenceScore,
        confidence: scoreBand(hit.confidenceScore),
        timeDifferenceMinutes: hit.timeDifferenceMinutes,
        varianceAmount: hit.amountDelta,
        reason: hit.reason,
        tripTollCharges: hit.tripTollCharges,
        tripPlatform: trip?.platform || undefined,
        tripPickup: (trip?.pickupLocation || '').substring(0, 40),
        tripDropoff: (trip?.dropoffLocation || '').substring(0, 40),
        tripDate: trip?.date,
        tripDriverId: trip?.driverId || undefined,
        tripDriverName: trip?.driverName || undefined,
      });
    }
    suggestions.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  }

  // Ambiguity
  if (suggestions.length >= 2) {
    const top = suggestions[0].confidenceScore || 0;
    const second = suggestions[1].confidenceScore || 0;
    if (
      top >= policy.ambiguityMinScore &&
      second >= policy.ambiguityMinScore &&
      top - second <= policy.ambiguityMaxGap
    ) {
      suggestions[0].isAmbiguous = true;
      suggestions[1].isAmbiguous = true;
    }
  }

  let capped = suggestions.slice(0, policy.maxSuggestions);

  // Orphan when empty
  const includeOrphan =
    input.options?.includeOrphan !== false && policy.personalUseDetectionEnabled;
  if (capped.length === 0 && includeOrphan) {
    const orphan = classifyOrphanToll({
      txDate,
      candidateTrips: candidates,
      orphanProximityMinutes: policy.orphanProximityMinutes,
    });
    if (orphan.isOrphan) {
      const reasonByCode: Record<string, string> = {
        ORPHAN_NO_TRIP: 'No trip on this day explains this toll (personal use)',
        ORPHAN_OUT_OF_WINDOW: 'Nearest trip is too far from this toll (personal use)',
        ORPHAN_NEARBY_UNEXPLAINED: 'Nearby trip does not explain this toll — confirm personal',
      };
      capped = [
        {
          tripId: '',
          matchType: 'PERSONAL_MATCH',
          reasonCode: orphan.reasonCode,
          confidenceScore: orphan.confidence === 'high' ? 85 : orphan.confidence === 'medium' ? 60 : 40,
          confidence: orphan.confidence,
          timeDifferenceMinutes: orphan.nearestTripDiffMinutes ?? 0,
          reason: reasonByCode[orphan.reasonCode] || 'Personal use',
          windowHit: 'NONE',
        },
      ];
    }
  }

  // Persisted restore
  if (
    capped.length === 0 &&
    input.options?.restorePersistedTrip &&
    input.toll.matchedTripId
  ) {
    const trip = input.trips.find((t) => t.id === input.toll.matchedTripId);
    if (trip) {
      const credit = Math.abs(Number(trip.tollCharges) || 0);
      const amountMatch = Math.abs(credit - txAmountAbs) <= policy.varianceThreshold;
      capped = [
        {
          tripId: trip.id,
          matchType: amountMatch ? 'PERFECT_MATCH' : 'AMOUNT_VARIANCE',
          reasonCode: 'ON_TRIP',
          confidenceScore: 70,
          confidence: 'medium',
          timeDifferenceMinutes: 0,
          varianceAmount: credit - txAmountAbs,
          reason: 'Restored prior trip link',
          tripTollCharges: credit,
          tripPlatform: trip.platform || undefined,
        },
      ];
    }
  }

  const best = capped[0] || null;
  let matchStatus: TollBrainClassifyMatchResult['classification']['matchStatus'] = 'unmatched';
  if (best?.isAmbiguous) matchStatus = 'ambiguous';
  else if (best && best.tripId === '' && best.matchType === 'PERSONAL_MATCH') {
    matchStatus = 'orphan_personal';
  } else if (best && best.tripId) matchStatus = 'matched';

  return {
    suggestions: capped,
    best,
    classification: {
      matchStatus,
      matchedTripId: best && best.tripId ? best.tripId : null,
      matchTypeCode: best?.matchType ?? null,
      matchReasonCode: best?.reasonCode ?? null,
      matchConfidenceScore: best?.confidenceScore ?? null,
    },
    meta: {
      method: 'toll_brain_v1',
      candidateTripCount: candidates.length,
      policiesApplied: policy,
    },
  };
}
