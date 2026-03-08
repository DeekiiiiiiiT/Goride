import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Deadhead Mileage Attribution — Phase 1: Data Model & Interface Definitions
 */

/**
 * Phase 1, Step 1.1: DeadheadAttribution
 * The master result object for a single vehicle's deadhead analysis over a period.
 */
export interface DeadheadAttribution {
  vehicleId: string;
  periodStart: string;          // ISO date — start of the analysis window
  periodEnd: string;            // ISO date — end of the analysis window

  // Method B: Odometer-derived totals
  totalOdometerKm: number;      // lastOdo - firstOdo across the period
  segmentCount: number;         // number of fill-to-fill segments

  // Method A: Time-ratio estimate
  onlineHours: number;          // total hours driver was online
  onTripHours: number;          // total hours driver was on active trips
  timeRatioDeadheadPct: number; // (onlineHours - onTripHours) / onlineHours * 100
  timeRatioDeadheadKm: number;  // totalOdometerKm * timeRatioDeadheadPct / 100

  // Method C: Trip-gap classification
  gapCount: number;             // number of inter-trip gaps analyzed
  deadheadGapMinutes: number;   // total minutes classified as deadhead gaps
  personalGapMinutes: number;   // total minutes classified as personal gaps
  gapBasedDeadheadKm: number;   // km attributed to deadhead via gap analysis
  gapBasedPersonalKm: number;   // km attributed to personal via gap analysis

  // Combined result
  method: 'A' | 'C' | 'combined' | 'fallback';
  tripKm: number;               // sum of actual trip distances
  deadheadKm: number;           // final attributed deadhead km
  personalKm: number;           // final attributed personal km
  unaccountedKm: number;        // totalOdometerKm - tripKm - deadheadKm - personalKm (should be ~0)
  confidenceLevel: 'high' | 'medium' | 'low';
  confidenceReason: string;     // why this confidence level was assigned
}

/**
 * Phase 1, Step 1.2: OdometerSegment
 * Represents one fill-to-fill segment (Method B building block).
 */
export interface OdometerSegment {
  startEntryId: string;
  endEntryId: string;
  startOdo: number;
  endOdo: number;
  startDate: string;
  endDate: string;
  distanceKm: number;           // endOdo - startOdo
  fuelLiters: number;           // liters purchased at the END of this segment
  segmentEfficiency: number;    // distanceKm / fuelLiters (km/L)
}

/**
 * Phase 1, Step 1.3: TripGapClassification
 * Represents one classified gap between consecutive trips (Method C building block).
 */
export interface TripGapClassification {
  precedingTripId: string;
  followingTripId: string;
  gapStartTime: string;         // dropoffTime of preceding trip
  gapEndTime: string;           // requestTime of following trip
  gapMinutes: number;
  classification: 'deadhead' | 'personal' | 'ambiguous';
  reason: string;               // e.g. "Gap < 30min, likely repositioning"
  estimatedKm: number;          // proportional km estimate for this gap
}

/**
 * Step 1.1: Metadata Schema Definition
 */
export interface FuelEntryMetadata {
  isSoftAnchor?: boolean;
  isHardAnchor?: boolean;
  cumulativeVolumeAtEntry: number;
  tankUtilizationPercentage: number;
  volumeContributed: number;
  excessVolume?: number;
  distanceSinceAnchor: number;
  actualKmPerLiter: number;
  profileKmPerLiter: number;
  efficiencyVariance: number;
  integrityStatus: 'valid' | 'warning' | 'critical';
  anomalyReason?: string;
  auditStatus: 'Clear' | 'Flagged' | 'Observing' | 'Auto-Resolved' | 'Resolved';
  cycleId: string;
  
  // Geofence Evidence
  geofenceMetadata?: {
    isInside: boolean;
    distanceMeters: number;
    timestamp: string;
    radiusAtTrigger: number;
    serverSideDistance?: number; // For anti-spoofing verification
  };

  // Phase 1 (Deadhead): Per-entry deadhead context
  deadheadContext?: {
    segmentDeadheadKm: number;
    segmentPersonalKm: number;
    adjustedEfficiency: number;   // efficiency after deadhead attribution
    isLeakageReduced: boolean;    // true if deadhead explains some of the previous "leakage"
  };
  [key: string]: any;
}

/**
 * Phase 2 (Deadhead), Step 2.1: Per-Segment Odometer Distance Calculator
 * 
 * Takes fuel entries for ONE vehicle and returns fill-to-fill odometer segments.
 * This is Method B — the "ground truth" total-km denominator.
 * 
 * Logic mirrors generateAuditSummary's filter/sort approach:
 *  1. Filter to entries with valid odometer (>0) AND valid liters (>0)
 *  2. Sort by odometer ascending
 *  3. For each consecutive pair, create a segment
 *  4. Skip segments with distanceKm <= 0 (odometer regression)
 */
export function calculateOdometerSegments(entries: any[]): OdometerSegment[] {
  // Step 1: Filter to entries with valid odometer AND liters
  const validEntries = entries
    .filter(e => (Number(e.odometer) || 0) > 0 && (Number(e.liters) || 0) > 0)
    .sort((a, b) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

  // Need at least 2 entries to form 1 segment
  if (validEntries.length < 2) return [];

  const segments: OdometerSegment[] = [];

  for (let i = 0; i < validEntries.length - 1; i++) {
    const startEntry = validEntries[i];
    const endEntry = validEntries[i + 1];

    const startOdo = Number(startEntry.odometer);
    const endOdo = Number(endEntry.odometer);
    const distanceKm = endOdo - startOdo;

    // Skip odometer regression (already flagged by auditOdometerSequence)
    if (distanceKm <= 0) continue;

    const fuelLiters = Number(endEntry.liters) || 0;
    const segmentEfficiency = fuelLiters > 0 ? distanceKm / fuelLiters : 0;

    segments.push({
      startEntryId: startEntry.id || '',
      endEntryId: endEntry.id || '',
      startOdo,
      endOdo,
      startDate: startEntry.date || '',
      endDate: endEntry.date || '',
      distanceKm,
      fuelLiters,
      segmentEfficiency
    });
  }

  return segments;
}

/**
 * Phase 2 (Deadhead), Step 2.2: Segment Summarizer
 * 
 * Aggregates an array of OdometerSegments into totals needed by the
 * combined attribution engine (Phase 5).
 * 
 * Returns:
 *  - totalKm: sum of all segment distances (NOT first-to-last; handles regressions cleanly)
 *  - totalFuel: sum of liters across all segments (fill-to-fill, excludes first fill)
 *  - avgSegmentEfficiency: totalKm / totalFuel (weighted average, not mean of per-segment)
 *  - segmentCount: number of valid segments
 */
export function summarizeSegments(segments: OdometerSegment[]): {
  totalKm: number;
  totalFuel: number;
  avgSegmentEfficiency: number;
  segmentCount: number;
} {
  if (segments.length === 0) {
    return { totalKm: 0, totalFuel: 0, avgSegmentEfficiency: 0, segmentCount: 0 };
  }

  const totalKm = segments.reduce((sum, s) => sum + s.distanceKm, 0);
  const totalFuel = segments.reduce((sum, s) => sum + s.fuelLiters, 0);
  const avgSegmentEfficiency = totalFuel > 0 ? totalKm / totalFuel : 0;

  return {
    totalKm,
    totalFuel,
    avgSegmentEfficiency,
    segmentCount: segments.length
  };
}

/**
 * Phase 3 (Deadhead), Step 3.1–3.3: Time-Ratio Deadhead Estimator (Method A)
 *
 * Uses online-hours vs on-trip-hours from trip records to estimate the fraction
 * of total driving that is deadhead repositioning.
 *
 * Per-trip fields used (set during CSV import):
 *   totalHours    — total online time attributed to this trip row
 *   onTripHours   — time spent actively driving a passenger
 *   toTripHours   — time driving to pickup (subset of deadhead)
 *   availableHours — time waiting/cruising for a request
 *   duration      — fallback: trip duration in minutes
 *
 * Fallback chain:
 *   1. Prefer totalHours / onTripHours (full fidelity)
 *   2. If missing, estimate from `duration` field (partial)
 *   3. If no usable data, return insufficient
 *
 * Safety cap: deadhead % is clamped to 0–80% to prevent garbage data from
 * hiding real leakage (industry rideshare range is typically 30–50%).
 */
export function calculateTimeRatioDeadhead(params: {
  trips: any[];
  totalOdometerKm: number;
}): {
  onlineHours: number;
  onTripHours: number;
  timeRatioDeadheadPct: number;
  timeRatioDeadheadKm: number;
  dataQuality: 'full' | 'partial' | 'insufficient';
} {
  const { trips, totalOdometerKm } = params;
  const DEADHEAD_CAP_PCT = 80;

  // Attempt primary path: sum totalHours and onTripHours from trip records
  let sumTotalHours = 0;
  let sumOnTripHours = 0;
  let primaryCount = 0;  // trips with both fields present

  for (const trip of trips) {
    const th = Number(trip.totalHours) || 0;
    const ot = Number(trip.onTripHours) || 0;
    if (th > 0 && ot > 0) {
      sumTotalHours += th;
      sumOnTripHours += ot;
      primaryCount++;
    }
  }

  // If primary path yielded data, use it
  if (primaryCount >= 3 && sumTotalHours > 0 && sumOnTripHours > 0) {
    const rawPct = ((sumTotalHours - sumOnTripHours) / sumTotalHours) * 100;
    const clampedPct = Math.max(0, Math.min(DEADHEAD_CAP_PCT, rawPct));
    return {
      onlineHours: sumTotalHours,
      onTripHours: sumOnTripHours,
      timeRatioDeadheadPct: Number(clampedPct.toFixed(2)),
      timeRatioDeadheadKm: Number((totalOdometerKm * clampedPct / 100).toFixed(2)),
      dataQuality: 'full'
    };
  }

  // Fallback path: use `duration` (minutes) as onTripHours proxy
  let sumDurationHours = 0;
  let fallbackCount = 0;

  for (const trip of trips) {
    const dur = Number(trip.duration) || 0;
    if (dur > 0) {
      sumDurationHours += dur / 60;
      fallbackCount++;
    }
  }

  if (fallbackCount >= 3 && sumDurationHours > 0) {
    // Estimate online hours as onTrip * 1.4 (industry average ~40% deadhead)
    const estimatedOnline = sumDurationHours * 1.4;
    const rawPct = ((estimatedOnline - sumDurationHours) / estimatedOnline) * 100;
    const clampedPct = Math.max(0, Math.min(DEADHEAD_CAP_PCT, rawPct));
    return {
      onlineHours: Number(estimatedOnline.toFixed(2)),
      onTripHours: Number(sumDurationHours.toFixed(2)),
      timeRatioDeadheadPct: Number(clampedPct.toFixed(2)),
      timeRatioDeadheadKm: Number((totalOdometerKm * clampedPct / 100).toFixed(2)),
      dataQuality: 'partial'
    };
  }

  // Insufficient data — caller should use fallback or skip Method A
  return {
    onlineHours: 0,
    onTripHours: 0,
    timeRatioDeadheadPct: 0,
    timeRatioDeadheadKm: 0,
    dataQuality: 'insufficient'
  };
}

/**
 * Phase 4 (Deadhead), Step 4.1–4.4: Trip-Gap Timestamp Classifier (Method C)
 *
 * Examines the time gaps between consecutive trips and classifies each gap
 * as deadhead (repositioning) or personal (off-duty).
 *
 * Gap classification thresholds:
 *   < 5 min  → deadhead (accepted next trip almost immediately)
 *   5-30 min → deadhead (typical repositioning/cruising to pickup)
 *   30-90 min → ambiguous; resolved by time-of-day:
 *       6AM-10PM → deadhead (driver likely still working during peak hours)
 *       10PM-6AM → personal (likely off-duty)
 *   > 90 min → personal (break, meal, or end of shift)
 *
 * Unaccounted km (totalOdometerKm - tripKm) is distributed across gaps
 * proportionally by gap duration.  Ambiguous km is split 60/40 deadhead.
 *
 * Negative/overlapping gaps (multi-platform) are skipped with a console warning.
 */
export function classifyTripGaps(params: {
  trips: any[];
  totalOdometerKm: number;
  tripKm: number;
}): {
  gaps: TripGapClassification[];
  deadheadGapMinutes: number;
  personalGapMinutes: number;
  gapBasedDeadheadKm: number;
  gapBasedPersonalKm: number;
  dataQuality: 'full' | 'partial' | 'insufficient';
} {
  const { trips, totalOdometerKm, tripKm } = params;

  const EMPTY_RESULT = {
    gaps: [] as TripGapClassification[],
    deadheadGapMinutes: 0,
    personalGapMinutes: 0,
    gapBasedDeadheadKm: 0,
    gapBasedPersonalKm: 0,
    dataQuality: 'insufficient' as const
  };

  // Step 1: Filter to trips with BOTH requestTime AND dropoffTime
  const usable = trips.filter(t => {
    const rt = t.requestTime || t.date;
    return rt && t.dropoffTime;
  });

  const totalWithTimestamps = usable.length;
  const totalTrips = trips.length;

  if (usable.length < 2) return EMPTY_RESULT;

  // Step 2: Sort by requestTime ascending
  usable.sort((a, b) => {
    const ta = new Date(a.requestTime || a.date).getTime();
    const tb = new Date(b.requestTime || b.date).getTime();
    return ta - tb;
  });

  // Step 3: Classify each gap
  const gaps: TripGapClassification[] = [];

  for (let i = 0; i < usable.length - 1; i++) {
    const prev = usable[i];
    const next = usable[i + 1];

    const gapStartMs = new Date(prev.dropoffTime).getTime();
    const gapEndMs = new Date(next.requestTime || next.date).getTime();

    if (isNaN(gapStartMs) || isNaN(gapEndMs)) continue;

    const gapMinutes = (gapEndMs - gapStartMs) / (1000 * 60);

    // Skip negative/overlapping gaps (multi-platform concurrency)
    if (gapMinutes < 0) {
      console.log(`[classifyTripGaps] Skipping negative gap (${gapMinutes.toFixed(1)} min) between trip ${prev.id || '?'} and ${next.id || '?'}`);
      continue;
    }

    // Classify by duration + time-of-day for ambiguous band
    let classification: 'deadhead' | 'personal' | 'ambiguous';
    let reason: string;

    if (gapMinutes < 5) {
      classification = 'deadhead';
      reason = 'Gap < 5min, near-immediate next trip';
    } else if (gapMinutes <= 30) {
      classification = 'deadhead';
      reason = 'Gap 5-30min, typical repositioning';
    } else if (gapMinutes <= 90) {
      // Step 4.4: Time-of-day enhancement for ambiguous gaps
      const gapStartHour = new Date(gapStartMs).getHours();
      const isDaytime = gapStartHour >= 6 && gapStartHour < 22; // 6AM-10PM

      if (isDaytime) {
        classification = 'deadhead';
        reason = `Gap ${Math.round(gapMinutes)}min during peak hours (${gapStartHour}:00), likely repositioning`;
      } else {
        classification = 'personal';
        reason = `Gap ${Math.round(gapMinutes)}min during off-peak (${gapStartHour}:00), likely off-duty`;
      }
    } else {
      classification = 'personal';
      reason = `Gap > 90min (${Math.round(gapMinutes)}min), likely break/end of shift`;
    }

    gaps.push({
      precedingTripId: prev.id || '',
      followingTripId: next.id || '',
      gapStartTime: prev.dropoffTime,
      gapEndTime: next.requestTime || next.date,
      gapMinutes: Number(gapMinutes.toFixed(2)),
      classification,
      reason,
      estimatedKm: 0 // filled in Step 4 below
    });
  }

  if (gaps.length === 0) return EMPTY_RESULT;

  // Step 4: Proportional km distribution across gaps
  const unaccountedKm = Math.max(0, totalOdometerKm - tripKm);
  const totalGapMinutes = gaps.reduce((sum, g) => sum + g.gapMinutes, 0);

  if (totalGapMinutes > 0 && unaccountedKm > 0) {
    for (const gap of gaps) {
      gap.estimatedKm = Number(
        (unaccountedKm * (gap.gapMinutes / totalGapMinutes)).toFixed(2)
      );
    }
  }

  // Step 5: Aggregate by classification
  let deadheadGapMinutes = 0;
  let personalGapMinutes = 0;
  let gapBasedDeadheadKm = 0;
  let gapBasedPersonalKm = 0;
  let ambiguousKm = 0;

  for (const gap of gaps) {
    if (gap.classification === 'deadhead') {
      deadheadGapMinutes += gap.gapMinutes;
      gapBasedDeadheadKm += gap.estimatedKm;
    } else if (gap.classification === 'personal') {
      personalGapMinutes += gap.gapMinutes;
      gapBasedPersonalKm += gap.estimatedKm;
    } else {
      // 'ambiguous' — split 60/40 toward deadhead (benefit of the doubt)
      deadheadGapMinutes += gap.gapMinutes * 0.6;
      personalGapMinutes += gap.gapMinutes * 0.4;
      ambiguousKm += gap.estimatedKm;
    }
  }

  // Apply 60/40 split to ambiguous km
  gapBasedDeadheadKm += ambiguousKm * 0.6;
  gapBasedPersonalKm += ambiguousKm * 0.4;

  // Determine data quality
  const coverageRatio = totalTrips > 0 ? totalWithTimestamps / totalTrips : 0;
  const dataQuality: 'full' | 'partial' | 'insufficient' =
    coverageRatio >= 0.8 ? 'full' :
    coverageRatio >= 0.4 ? 'partial' :
    'insufficient';

  return {
    gaps,
    deadheadGapMinutes: Number(deadheadGapMinutes.toFixed(2)),
    personalGapMinutes: Number(personalGapMinutes.toFixed(2)),
    gapBasedDeadheadKm: Number(gapBasedDeadheadKm.toFixed(2)),
    gapBasedPersonalKm: Number(gapBasedPersonalKm.toFixed(2)),
    dataQuality
  };
}

/**
 * Phase 5 (Deadhead): Combined Attribution Engine
 *
 * Orchestrates Methods A (Time Ratio), B (Odometer Segments), and C (Trip-Gap
 * Classifier) into a single DeadheadAttribution result per vehicle.
 *
 * Resolution priority: C > A > fallback
 *   - C full           → use C, cross-validate with A, high confidence if they agree
 *   - C partial        → blend C (60%) + A (40%)
 *   - C insufficient   → use A alone (medium/low depending on A's quality)
 *   - Both insufficient → industry fallback (35% of non-trip km = deadhead)
 *
 * Safety rails:
 *   - personalKm is floored at 0 (GPS trip km can exceed odometer km)
 *   - deadheadKm is floored at 0
 *   - Cross-validation divergence threshold: 20 percentage points
 */
export function calculateDeadheadAttribution(params: {
  vehicleId: string;
  fuelEntries: any[];
  trips: any[];
  periodStart?: string;
  periodEnd?: string;
}): DeadheadAttribution {
  const { vehicleId, fuelEntries, trips, periodStart, periodEnd } = params;
  const INDUSTRY_FALLBACK_PCT = 35;
  const CROSS_VALIDATION_THRESHOLD_PP = 20; // percentage points

  // --- Step A: Odometer segments (Method B) ---
  const segments = calculateOdometerSegments(fuelEntries);
  const segSummary = summarizeSegments(segments);
  const totalOdometerKm = segSummary.totalKm;

  // --- Step B: Trip km ---
  const tripKm = trips.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);

  // --- Phase 9 (Step 9.2): Early-exit guards for degenerate data ---

  // Guard 1: No odometer data at all (< 2 fuel entries with readings)
  if (totalOdometerKm <= 0) {
    const resolvedPeriodStart = periodStart || derivePeriodBound(fuelEntries, trips, 'start');
    const resolvedPeriodEnd = periodEnd || derivePeriodBound(fuelEntries, trips, 'end');
    return {
      vehicleId,
      periodStart: resolvedPeriodStart,
      periodEnd: resolvedPeriodEnd,
      totalOdometerKm: 0,
      segmentCount: 0,
      onlineHours: 0,
      onTripHours: 0,
      timeRatioDeadheadPct: 0,
      timeRatioDeadheadKm: 0,
      gapCount: 0,
      deadheadGapMinutes: 0,
      personalGapMinutes: 0,
      gapBasedDeadheadKm: 0,
      gapBasedPersonalKm: 0,
      method: 'fallback',
      tripKm: Number(tripKm.toFixed(2)),
      deadheadKm: 0,
      personalKm: 0,
      unaccountedKm: 0,
      confidenceLevel: 'low',
      confidenceReason: fuelEntries.length === 0
        ? 'No fuel entries for this vehicle'
        : fuelEntries.length === 1
          ? 'Only 1 fuel entry — need at least 2 to form an odometer segment'
          : 'No fuel entries with valid odometer readings > 0'
    };
  }

  // Guard 2: GPS trip km exceeds odometer km (common with GPS-based trip tracking)
  // Attribution is still calculated but confidence is downgraded with an explanation
  const tripExceedsOdometer = tripKm > totalOdometerKm * 1.05; // 5% tolerance for rounding

  // --- Step C: Method A (Time Ratio) ---
  const methodA = calculateTimeRatioDeadhead({ trips, totalOdometerKm });

  // --- Step D: Method C (Trip-Gap Classifier) ---
  const methodC = classifyTripGaps({ trips, totalOdometerKm, tripKm });

  // --- Step E: Resolve combined result ---
  let deadheadKm = 0;
  let personalKm = 0;
  let method: DeadheadAttribution['method'] = 'fallback';
  let confidenceLevel: DeadheadAttribution['confidenceLevel'] = 'low';
  let confidenceReason = '';

  const nonTripKm = Math.max(0, totalOdometerKm - tripKm);

  if (methodC.dataQuality === 'full') {
    // Priority 1: Method C full — use gap-based numbers as primary
    deadheadKm = methodC.gapBasedDeadheadKm;

    // Cross-validate with Method A if available
    if (methodA.dataQuality !== 'insufficient' && totalOdometerKm > 0) {
      const cPct = (deadheadKm / totalOdometerKm) * 100;
      const aPct = methodA.timeRatioDeadheadPct;
      const divergence = Math.abs(cPct - aPct);

      if (divergence <= CROSS_VALIDATION_THRESHOLD_PP) {
        method = 'combined';
        confidenceLevel = 'high';
        confidenceReason = `Methods A (${aPct.toFixed(1)}%) and C (${cPct.toFixed(1)}%) agree within ${CROSS_VALIDATION_THRESHOLD_PP}pp`;
      } else {
        method = 'C';
        confidenceLevel = 'medium';
        confidenceReason = `Method C used as primary; Method A diverges by ${divergence.toFixed(1)}pp (A=${aPct.toFixed(1)}%, C=${cPct.toFixed(1)}%)`;
      }
    } else {
      method = 'C';
      confidenceLevel = 'high';
      confidenceReason = 'Method C (trip-gap analysis) has full data coverage';
    }

  } else if (methodC.dataQuality === 'partial') {
    // Priority 2: Method C partial — blend with Method A (60/40)
    if (methodA.dataQuality !== 'insufficient') {
      deadheadKm = (methodC.gapBasedDeadheadKm * 0.6) + (methodA.timeRatioDeadheadKm * 0.4);
      method = 'combined';
      confidenceLevel = 'medium';
      confidenceReason = `Blended: Method C partial (60% weight, ${methodC.gapBasedDeadheadKm.toFixed(1)} km) + Method A (40% weight, ${methodA.timeRatioDeadheadKm.toFixed(1)} km)`;
    } else {
      deadheadKm = methodC.gapBasedDeadheadKm;
      method = 'C';
      confidenceLevel = 'medium';
      confidenceReason = 'Method C partial data; Method A unavailable';
    }

  } else if (methodA.dataQuality !== 'insufficient') {
    // Priority 3: Method A alone
    deadheadKm = methodA.timeRatioDeadheadKm;
    method = 'A';
    confidenceLevel = methodA.dataQuality === 'full' ? 'medium' : 'low';
    confidenceReason = `Method A only (${methodA.dataQuality} data); Method C insufficient (no trip timestamps)`;

  } else {
    // Priority 4: Industry fallback
    deadheadKm = nonTripKm * (INDUSTRY_FALLBACK_PCT / 100);
    method = 'fallback';
    confidenceLevel = 'low';
    confidenceReason = 'No time or trip-gap data available; using 35% industry average for non-trip km';
  }

  // --- Step F: Safety rails and final attribution ---

  // Floor deadheadKm at 0
  deadheadKm = Math.max(0, deadheadKm);

  // Cap deadheadKm so it doesn't exceed non-trip km
  if (deadheadKm > nonTripKm) {
    deadheadKm = nonTripKm;
  }

  // personalKm = whatever remains after trip + deadhead
  personalKm = Math.max(0, totalOdometerKm - tripKm - deadheadKm);

  // Unaccounted should be ~0 by construction
  const unaccountedKm = Number(
    (totalOdometerKm - tripKm - deadheadKm - personalKm).toFixed(2)
  );

  // Phase 9 (Step 9.2): Downgrade confidence when trip km exceeds odometer km
  // This means GPS-based trip distances are larger than the odometer span,
  // so the deadhead/personal split is unreliable (nonTripKm is 0 or near-0).
  if (tripExceedsOdometer) {
    if (confidenceLevel === 'high') confidenceLevel = 'medium';
    else if (confidenceLevel === 'medium') confidenceLevel = 'low';
    confidenceReason += ` | NOTE: Trip GPS km (${tripKm.toFixed(0)}) exceeds odometer km (${totalOdometerKm.toFixed(0)}) by >5% — deadhead/personal split is unreliable`;
  }

  // Determine period bounds from data if not specified
  const resolvedPeriodStart = periodStart || derivePeriodBound(fuelEntries, trips, 'start');
  const resolvedPeriodEnd = periodEnd || derivePeriodBound(fuelEntries, trips, 'end');

  return {
    vehicleId,
    periodStart: resolvedPeriodStart,
    periodEnd: resolvedPeriodEnd,

    // Method B
    totalOdometerKm: Number(totalOdometerKm.toFixed(2)),
    segmentCount: segments.length,

    // Method A
    onlineHours: methodA.onlineHours,
    onTripHours: methodA.onTripHours,
    timeRatioDeadheadPct: methodA.timeRatioDeadheadPct,
    timeRatioDeadheadKm: methodA.timeRatioDeadheadKm,

    // Method C
    gapCount: methodC.gaps.length,
    deadheadGapMinutes: methodC.deadheadGapMinutes,
    personalGapMinutes: methodC.personalGapMinutes,
    gapBasedDeadheadKm: methodC.gapBasedDeadheadKm,
    gapBasedPersonalKm: methodC.gapBasedPersonalKm,

    // Combined
    method,
    tripKm: Number(tripKm.toFixed(2)),
    deadheadKm: Number(deadheadKm.toFixed(2)),
    personalKm: Number(personalKm.toFixed(2)),
    unaccountedKm,
    confidenceLevel,
    confidenceReason
  };
}

/**
 * Helper: Derive period start/end from the earliest/latest timestamps
 * found across fuel entries and trips.
 * Phase 9: Uses loop-based min/max instead of Math.min(...spread) to avoid
 * stack overflow for large arrays (>100k records).
 */
function derivePeriodBound(
  fuelEntries: any[],
  trips: any[],
  bound: 'start' | 'end'
): string {
  let result = bound === 'start' ? Infinity : -Infinity;
  let found = false;

  for (const entry of fuelEntries) {
    const d = entry.date || entry.timestamp;
    if (d) {
      const ms = new Date(d).getTime();
      if (!isNaN(ms)) {
        found = true;
        result = bound === 'start' ? Math.min(result, ms) : Math.max(result, ms);
      }
    }
  }

  for (const trip of trips) {
    const d = trip.requestTime || trip.date;
    if (d) {
      const ms = new Date(d).getTime();
      if (!isNaN(ms)) {
        found = true;
        result = bound === 'start' ? Math.min(result, ms) : Math.max(result, ms);
      }
    }
  }

  if (!found) return new Date().toISOString();

  return new Date(result).toISOString();
}

/**
 * Step 1.3: Audit Trail Query Helpers
 * Fetches the most recent anchor (Hard or Soft) for a vehicle.
 */
export async function getLastAnchor(vehicleId: string) {
  const { data, error } = await supabase
    .from("kv_store_37f42386")
    .select("value")
    .like("key", "fuel_entry:%")
    .eq("value->>vehicleId", vehicleId)
    .or("value->metadata->>isSoftAnchor.eq.true,value->metadata->>isAnchor.eq.true,value->metadata->>isFullTank.eq.true")
    .order("value->>date", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[getLastAnchor] Error:", error);
    return null;
  }

  return data?.[0]?.value || null;
}

/**
 * Fetches all entries since the last anchor date.
 */
export async function getEntriesSinceLastAnchor(vehicleId: string, anchorDate: string | null) {
  let query = supabase
    .from("kv_store_37f42386")
    .select("value")
    .like("key", "fuel_entry:%")
    .eq("value->>vehicleId", vehicleId);

  if (anchorDate) {
    query = query.gt("value->>date", anchorDate);
  }

  const { data, error } = await query.order("value->>date", { ascending: true });

  if (error) {
    console.error("[getEntriesSinceLastAnchor] Error:", error);
    return [];
  }

  return (data || []).map(d => d.value);
}

/**
 * Step 1.2: Vehicle Profile Configuration Helper
 * Ensures we get the standard immutable constants from a vehicle object.
 * NOTE: baselineEfficiencyL100km is in L/100km (lower = better).
 * Callers must convert to km/L via (100 / value) before using in km/L comparisons.
 */
export function getVehicleBaselines(vehicle: any) {
  return {
    tankCapacity: Number(vehicle?.specifications?.tankCapacity) || Number(vehicle?.fuelSettings?.tankCapacity) || 0,
    baselineEfficiencyL100km: Number(vehicle?.specifications?.fuelEconomy) || Number(vehicle?.fuelSettings?.efficiencyCity) || 0,
    rangeMin: Number(vehicle?.specifications?.estimatedRangeMin) || 0
  };
}

/**
 * Step 3.1 & 3.2: Behavioral & Physical Integrity Logic
 * Centralized logic for flagging anomalies.
 */
export function calculateIntegrity(
  params: {
    volume: number,
    tankCapacity: number,
    prevCumulative: number,
    distanceSinceAnchor: number,
    profileEfficiency: number,
    recentTxCount: number,
    isTopUp?: boolean,
    isAnchor?: boolean,
    rangeMin?: number,
    isCardTransaction?: boolean,
    frequencyThreshold?: number,
    // Phase 23: rolling average and configurable efficiency threshold
    rollingAvgEfficiency?: number,
    efficiencyThreshold?: number,
    // Phase 6 (Deadhead): optional deadhead km to add to distance for efficiency calc
    deadheadKm?: number
  }
) {
  const { volume, tankCapacity, prevCumulative, distanceSinceAnchor, profileEfficiency, recentTxCount, isTopUp, isAnchor, rangeMin, isCardTransaction, frequencyThreshold, rollingAvgEfficiency, efficiencyThreshold, deadheadKm } = params;
  
  const totalVolumeInCycle = prevCumulative + volume;
  // Phase 23: prefer rolling average over manufacturer spec when available
  const baseline = (rollingAvgEfficiency && rollingAvgEfficiency > 0) ? rollingAvgEfficiency : profileEfficiency;

  // Phase 6 (Deadhead): Add deadhead km to distance — deadhead is legitimate work
  // driving that consumes fuel but doesn't show up as trip distance. Including it
  // increases the effective km/L, reducing false "High Fuel Consumption" flags.
  const effectiveDistance = distanceSinceAnchor + (deadheadKm || 0);

  const actualKmPerLiter = effectiveDistance > 0 ? effectiveDistance / totalVolumeInCycle : 0;
  const efficiencyVariance = baseline > 0 ? (baseline - actualKmPerLiter) / baseline : 0;

  // Step 3.1: Tank Overfill Anomaly (102% Threshold)
  const OVERFILL_THRESHOLD = 1.02;
  if (tankCapacity > 0 && volume > (tankCapacity * OVERFILL_THRESHOLD)) {
    return { status: 'critical' as const, reason: 'Tank Overfill Anomaly', auditStatus: 'Flagged' as const };
  }

  // Step 3.2: Behavioral Integrity - High Frequency (card-only, configurable threshold)
  // Only flag card transactions; cash/reimbursement are exempt.
  // frequencyThreshold = total card swipes in 4h window that triggers alert (default 3).
  // recentTxCount excludes the current entry, so we compare >= (threshold - 1).
  const effectiveThreshold = frequencyThreshold ?? 3;
  if (isCardTransaction && recentTxCount >= (effectiveThreshold - 1)) {
    return { status: 'critical' as const, reason: 'High Transaction Frequency', auditStatus: 'Flagged' as const };
  }

  // Step 3.2: Behavioral Integrity - Fragmented Purchase (<15% tank)
  const isFragmented = tankCapacity > 0 && (volume / tankCapacity) < 0.15 && !isTopUp;
  if (isFragmented) {
    return { status: 'warning' as const, reason: 'Fragmented Purchase', auditStatus: 'Flagged' as const };
  }

  // Phase 4/5 logic (Efficiency) for Anchors
  // Phase 19 fix: skip efficiency checks entirely when distanceSinceAnchor is 0.
  // Historical entries without anchor metadata have distance=0, which causes:
  //   - actualKmPerLiter=0 → efficiencyVariance=1.0 → false "High Fuel Consumption"
  //   - 0 < rangeMin*0.5 → false "Range Suspicious"
  if (isAnchor && distanceSinceAnchor > 0) {
    // Phase 23: use configurable threshold (default 30%), skip if no baseline available
    const isHighConsumption = baseline > 0 && efficiencyVariance > (efficiencyThreshold ?? 0.30);
    const isRangeSuspicious = rangeMin && rangeMin > 0 && distanceSinceAnchor > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (totalVolumeInCycle / tankCapacity) > 0.8;

    if (isHighConsumption || isRangeSuspicious) {
      return { status: 'critical' as const, reason: 'High Fuel Consumption', auditStatus: 'Flagged' as const };
    }
  }

  // Warning: Approaching Capacity
  if (tankCapacity > 0 && totalVolumeInCycle > (tankCapacity * 0.85)) {
    return { status: 'warning' as const, reason: 'Approaching Capacity', auditStatus: 'Observing' as const };
  }

  return { status: 'valid' as const, reason: null, auditStatus: 'Clear' as const };
}

/**
 * Step 4.1: Financial Integrity Logic
 * Checks for price anomalies compared to organizational/regional benchmarks.
 */
export function calculateFinancialVariance(params: {
  pricePerLiter: number,
  avgPricePerLiter: number,
  threshold?: number
}) {
  const { pricePerLiter, avgPricePerLiter, threshold = 0.15 } = params;
  if (avgPricePerLiter <= 0) return 0;
  
  const variance = (pricePerLiter - avgPricePerLiter) / avgPricePerLiter;
  return Number(variance.toFixed(4));
}

/**
 * Step 4.2: Audit Summary Aggregator
 * Processes a collection of entries to generate a high-level integrity report.
 *
 * Phase 6 (Deadhead): When optional deadheadData is provided, attaches a
 * deadheadBreakdown to the returned stats showing how much of the "leakage"
 * is actually legitimate deadhead driving.
 */
export function generateAuditSummary(entries: any[], vehicleId?: string, deadheadData?: DeadheadAttribution) {
  const filtered = vehicleId ? entries.filter(e => e.vehicleId === vehicleId) : entries;
  
  const stats = {
    totalLiters: 0,
    totalCost: 0,
    totalDistance: 0,
    flaggedTransactions: 0,
    criticalAnomalies: 0,
    healedTransactions: 0,
    avgEfficiency: 0,
    costPerKm: 0,
    lastOdometer: 0,
    firstOdometer: 0,
    vehicleId: vehicleId || 'fleet-wide'
  };

  if (filtered.length === 0) return stats;

  // Step 1.2: Build validOdoEntries — entries with BOTH valid odometer (>0) AND valid liters (>0),
  // sorted by odometer ascending. Used for distance span and efficiency fuel sum.
  const validOdoEntries = filtered
    .filter(e => (Number(e.odometer) || 0) > 0 && (Number(e.liters) || 0) > 0)
    .sort((a, b) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

  // Step 1.3: Distance from odometer-sorted entries (not date-sorted)
  if (validOdoEntries.length >= 2) {
    stats.firstOdometer = Number(validOdoEntries[0].odometer);
    stats.lastOdometer = Number(validOdoEntries[validOdoEntries.length - 1].odometer);
    stats.totalDistance = stats.lastOdometer - stats.firstOdometer;
  }

  // Step 1.4: Efficiency fuel — exclude first fill-up (standard fill-to-fill method)
  const efficiencyFuel = validOdoEntries.length >= 2
    ? validOdoEntries.slice(1).reduce((sum: number, e: any) => sum + (Number(e.liters) || 0), 0)
    : 0;

  filtered.forEach(e => {
    stats.totalLiters += Number(e.liters) || 0;
    stats.totalCost += Number(e.amount) || 0;
    
    if (e.isFlagged) stats.criticalAnomalies++;
    if (e.auditStatus === 'Flagged') stats.flaggedTransactions++;
    if (e.metadata?.isHealed) stats.healedTransactions++;
  });

  // Step 1.5: Efficiency uses corrected fuel sum (>= 3 entries for reliability)
  if (validOdoEntries.length >= 3 && efficiencyFuel > 0 && stats.totalDistance > 0) {
    stats.avgEfficiency = Number((stats.totalDistance / efficiencyFuel).toFixed(2));
  }
  
  if (stats.totalDistance > 0) {
    stats.costPerKm = Number((stats.totalCost / stats.totalDistance).toFixed(2));
  }

  // Phase 6 (Deadhead): Attach deadhead breakdown when data is available
  if (deadheadData && deadheadData.totalOdometerKm > 0) {
    const efficiency = stats.avgEfficiency > 0 ? stats.avgEfficiency : 10; // fallback 10 km/L
    const deadheadFuelEstimate = Number((deadheadData.deadheadKm / efficiency).toFixed(2));
    const personalFuelEstimate = Number((deadheadData.personalKm / efficiency).toFixed(2));

    // Original leakage = totalFuel - (tripKm / efficiency)
    const expectedTripFuel = efficiency > 0 ? deadheadData.tripKm / efficiency : 0;
    const originalLeakage = Math.max(0, stats.totalLiters - expectedTripFuel);
    const adjustedLeakage = Math.max(0, originalLeakage - deadheadFuelEstimate);

    (stats as any).deadheadBreakdown = {
      deadheadKm: deadheadData.deadheadKm,
      personalKm: deadheadData.personalKm,
      deadheadFuelEstimate,
      personalFuelEstimate,
      originalLeakage: Number(originalLeakage.toFixed(2)),
      adjustedLeakage: Number(adjustedLeakage.toFixed(2)),
      leakageReductionPct: originalLeakage > 0
        ? Number(((1 - adjustedLeakage / originalLeakage) * 100).toFixed(1))
        : 0,
      method: deadheadData.method,
      confidenceLevel: deadheadData.confidenceLevel,
      confidenceReason: deadheadData.confidenceReason
    };
  }

  return stats;
}

/**
 * Step 5.1: Odometer Gap & Regression Audit
 * Checks for missing logs or data entry errors in the odometer sequence.
 */
export function auditOdometerSequence(params: {
  currentOdo: number,
  prevOdo: number,
  maxExpectedDistance: number // e.g., 2x vehicle range
}) {
  const { currentOdo, prevOdo, maxExpectedDistance } = params;
  
  if (prevOdo <= 0) return { status: 'valid' as const, reason: null };

  // Regression check
  if (currentOdo < prevOdo) {
    return { status: 'critical' as const, reason: 'Odometer Regression', auditStatus: 'Flagged' as const };
  }

  // Gap check
  const distance = currentOdo - prevOdo;
  if (maxExpectedDistance > 0 && distance > maxExpectedDistance) {
    return { status: 'warning' as const, reason: 'Odometer Gap Detected', auditStatus: 'Flagged' as const };
  }

  // Stagnation check (Same odo for different dates)
  if (currentOdo === prevOdo && distance === 0) {
    return { status: 'warning' as const, reason: 'Odometer Stagnation', auditStatus: 'Flagged' as const };
  }

  return { status: 'valid' as const, reason: null };
}

/**
 * Phase 6: Weighted Audit Confidence Score
 * Calculates a confidence score (0-100) based on GPS, Signatures, and Physical data.
 */
export function calculateConfidenceScore(entry: any, station?: any) {
  let score = 0;
  const breakdown: Record<string, number> = {};

  // 1. Evidence Bridge: GPS Handshake (30 pts)
  if (entry.matchedStationId) {
    if (station?.status === 'verified') {
      breakdown.gps = 30;
      score += 30;
    } else {
      breakdown.gps = 15;
      score += 15;
    }
    
    // Proximity Bonus
    const matchDist = entry.metadata?.matchDistance || 999;
    if (matchDist < 50) {
      breakdown.gps_bonus = 5;
      score += 5;
    }
  } else {
    breakdown.gps = 0;
  }

  // 2. Cryptographic Handshake (25 pts)
  if (entry.signature) {
    breakdown.crypto = 25;
    score += 25;
  } else {
    breakdown.crypto = 0;
  }

  // 3. Physical Integrity (25 pts)
  let physicalScore = 0;
  if (entry.metadata?.integrityStatus === 'valid') {
    physicalScore += 15; // Base consistency
  } else if (entry.metadata?.integrityStatus === 'warning') {
    physicalScore += 5;
  }

  // Efficiency Bonus (for anchors)
  if (entry.metadata?.isAnchor && Math.abs(entry.metadata?.efficiencyVariance || 0) < 15) {
    physicalScore += 10;
  } else if (!entry.metadata?.isAnchor && entry.odometer > 0) {
    physicalScore += 5; // Has odometer
  }
  
  breakdown.physical = Math.min(25, physicalScore);
  score += breakdown.physical;

  // 4. Behavioral Integrity (20 pts)
  let behavioralScore = 0;
  if (!entry.metadata?.isHighFrequency) behavioralScore += 10;
  if (!entry.metadata?.isFragmented) behavioralScore += 10;
  
  breakdown.behavioral = behavioralScore;
  score += behavioralScore;

  // Final normalization
  const finalScore = Math.min(100, score);
  
  return {
    score: finalScore,
    breakdown,
    isHighlyTrusted: finalScore >= 90,
    requiresReview: finalScore < 70
  };
}

/**
 * Phase 7: Predictive Consumption Engine
 * Calculates expected anchor date and identifies predictive leakage.
 */
export function calculatePredictiveMetrics(params: {
    vehicleId: string,
    currentCumulative: number,
    tankCapacity: number,
    profileEfficiency: number,
    dailyAvgDistance?: number
}) {
    const { currentCumulative, tankCapacity, profileEfficiency, dailyAvgDistance = 150 } = params;
    
    if (tankCapacity <= 0 || profileEfficiency <= 0) return null;

    const remainingCapacity = Math.max(0, tankCapacity - currentCumulative);
    const predictedRemainingKm = remainingCapacity * profileEfficiency;
    
    // Calculate expected anchor date (when tank hits 100%)
    const daysUntilAnchor = dailyAvgDistance > 0 ? predictedRemainingKm / dailyAvgDistance : 0;
    const expectedAnchorDate = new Date();
    expectedAnchorDate.setDate(expectedAnchorDate.getDate() + daysUntilAnchor);

    return {
        remainingCapacity,
        predictedRemainingKm,
        daysUntilAnchor: Math.round(daysUntilAnchor),
        expectedAnchorDate: expectedAnchorDate.toISOString().split('T')[0],
        utilizationPercentage: (currentCumulative / tankCapacity) * 100
    };
}

/**
 * Phase 7: Behavioral Leakage Alert Logic
 * Detects hidden leakage by identifying efficiency gaps during "Floating" states.
 */
export function detectPredictiveLeakage(params: {
    actualEfficiency: number,
    profileEfficiency: number,
    utilization: number,
    isAnchor: boolean,
    // Phase 23: rolling average for more accurate leakage detection
    rollingAvgEfficiency?: number,
    // Phase 6 (Deadhead): optional deadhead adjustment to reduce false leakage flags
    deadheadAdjustment?: {
      deadheadKm: number,
      totalOdometerKm: number,
      tripKm: number
    }
}) {
    const { actualEfficiency, profileEfficiency, utilization, isAnchor, rollingAvgEfficiency, deadheadAdjustment } = params;
    
    // Phase 23: prefer rolling average over manufacturer spec when available
    const baseline = (rollingAvgEfficiency && rollingAvgEfficiency > 0) ? rollingAvgEfficiency : profileEfficiency;
    
    if (baseline <= 0 || actualEfficiency <= 0) return null;

    // Phase 6 (Deadhead): If deadhead adjustment is provided, recalculate efficiency
    // treating deadhead km as legitimate work driving. This INCREASES the effective
    // efficiency (more "work km" per liter), reducing the apparent variance.
    let effectiveEfficiency = actualEfficiency;
    if (deadheadAdjustment && deadheadAdjustment.totalOdometerKm > 0) {
      const workKm = deadheadAdjustment.tripKm + deadheadAdjustment.deadheadKm;
      const workFuelRatio = workKm / deadheadAdjustment.totalOdometerKm;
      if (workFuelRatio > 0 && workFuelRatio <= 1) {
        // Adjusted efficiency = raw efficiency / workFuelRatio
        // Since workFuelRatio < 1, this increases efficiency (removes personal-km fuel penalty)
        effectiveEfficiency = actualEfficiency / workFuelRatio;
      }
    }

    const variance = (baseline - effectiveEfficiency) / baseline;
    
    // Leakage Alert Thresholds:
    // 1. If at an Anchor, we have high confidence in the variance.
    // 2. If Floating, we only flag if the variance is extreme (>35%) OR utilization is high.
    
    let leakageRisk: 'low' | 'medium' | 'high' = 'low';
    let alertReason = null;

    if (isAnchor) {
        if (variance > 0.25) {
            leakageRisk = 'high';
            alertReason = 'Confirmed Operational Leakage (Efficiency Gap)';
        } else if (variance > 0.15) {
            leakageRisk = 'medium';
            alertReason = 'Elevated Consumption Variance';
        }
    } else {
        if (variance > 0.40) {
            leakageRisk = 'high';
            alertReason = 'Predictive Leakage Alert: Extreme Mid-Cycle Drift';
        } else if (variance > 0.20 && utilization > 70) {
            leakageRisk = 'medium';
            alertReason = 'Predictive Warning: Utilization/Efficiency Mismatch';
        }
    }

    return {
        variancePercentage: Math.round(variance * 100),
        leakageRisk,
        alertReason,
        isAlertTriggered: leakageRisk !== 'low'
    };
}

/**
 * Phase 17: Rolling Efficiency Result Type
 * Returned by both the real-time and batch rolling average functions.
 */
export interface RollingEfficiencyResult {
    avgKmPerLiter: number;
    window: '30d' | '60d' | 'all';
    entryCount: number;
    totalDistance: number;
    totalFuel: number;
}

/**
 * Phase 17 (Step 17.1–17.4): Real-Time Rolling Average Efficiency
 * 
 * Computes a vehicle's actual average km/L from its own historical fuel entries.
 * Used during real-time entry scoring (fuel_entry_post.tsx, fuel_controller.tsx).
 * 
 * Logic:
 *  1. Query fuel entries for the vehicle within a 30-day window (ending at asOfDate).
 *  2. Only include entries with valid odometer (>0) AND liters (>0).
 *  3. Exclude entries that are currently flagged (to avoid anomalies polluting the baseline).
 *  4. Need at least 3 valid entries for a reliable average.
 *  5. If fewer than 3 in 30 days, expand to 60 days.
 *  6. If still fewer than 3, return null (caller should skip the efficiency check).
 *  7. Average = totalDistance / totalFuel across the window.
 */
export async function calculateRollingEfficiency(
    vehicleId: string,
    asOfDate?: string
): Promise<RollingEfficiencyResult | null> {
    const refDate = asOfDate ? new Date(asOfDate) : new Date();

    // Try 30-day window first
    const result30 = await _queryWindowedEntries(vehicleId, refDate, 30);
    if (result30 && result30.entryCount >= 3) {
        return { ...result30, window: '30d' };
    }

    // Fallback: 60-day window
    const result60 = await _queryWindowedEntries(vehicleId, refDate, 60);
    if (result60 && result60.entryCount >= 3) {
        return { ...result60, window: '60d' };
    }

    // Insufficient data — caller should skip efficiency check
    console.log(`[RollingEfficiency] Vehicle ${vehicleId}: insufficient data (${result60?.entryCount ?? 0} entries in 60d). Skipping efficiency check.`);
    return null;
}

/**
 * Internal helper: queries fuel entries within a day-window and computes the average.
 */
async function _queryWindowedEntries(
    vehicleId: string,
    refDate: Date,
    windowDays: number
): Promise<{ avgKmPerLiter: number; entryCount: number; totalDistance: number; totalFuel: number } | null> {
    const windowStart = new Date(refDate);
    windowStart.setDate(windowStart.getDate() - windowDays);
    const startStr = windowStart.toISOString().split('T')[0];
    const endStr = refDate.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "fuel_entry:%")
        .eq("value->>vehicleId", vehicleId)
        .gte("value->>date", startStr)
        .lte("value->>date", endStr)
        .order("value->>odometer", { ascending: true });

    if (error) {
        console.error(`[RollingEfficiency] Query error for ${vehicleId} (${windowDays}d):`, error);
        return null;
    }

    // Filter: must have valid odometer AND liters
    // Note: we intentionally include flagged entries so the baseline stays stable
    // (excluding them causes a death spiral where each recalculate raises the average)
    const valid = (data || [])
        .map(d => d.value)
        .filter((e: any) => {
            const odo = Number(e.odometer) || 0;
            const liters = Number(e.liters) || 0;
            return odo > 0 && liters > 0;
        });

    if (valid.length < 3) return { avgKmPerLiter: 0, entryCount: valid.length, totalDistance: 0, totalFuel: 0 };

    // Sort by odometer ascending (should already be, but ensure it)
    valid.sort((a: any, b: any) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

    const firstOdo = Number(valid[0].odometer);
    const lastOdo = Number(valid[valid.length - 1].odometer);
    const totalDistance = lastOdo - firstOdo;
    // Exclude the first entry's liters — that fuel was consumed BEFORE the
    // distance window (firstOdo → lastOdo). This is the standard fill-up method.
    const totalFuel = valid.slice(1).reduce((sum: number, e: any) => sum + (Number(e.liters) || 0), 0);

    if (totalDistance <= 0 || totalFuel <= 0) {
        return { avgKmPerLiter: 0, entryCount: valid.length, totalDistance: 0, totalFuel: 0 };
    }

    const avgKmPerLiter = Number((totalDistance / totalFuel).toFixed(2));
    return { avgKmPerLiter, entryCount: valid.length, totalDistance, totalFuel };
}

/**
 * Phase 17 (Step 17.5): Batch Rolling Average Efficiency
 * 
 * Computes a vehicle's average km/L from a pre-loaded array of entries.
 * Used by the recalculate endpoint to avoid N+1 DB queries.
 * 
 * Same filtering logic (odometer >0, liters >0), minimum 3 entries.
 * Operates on ALL provided entries (no time window — the recalculate processes
 * the full history, so the overall average is the most stable baseline).
 *
 * IMPORTANT: Does NOT exclude flagged entries. The baseline must be stable
 * across repeated recalculations — excluding flags creates a death spiral
 * where the average rises each time, flagging progressively more entries.
 */
export function calculateRollingEfficiencyBatch(
    entries: any[]
): RollingEfficiencyResult | null {
    // Filter: must have valid odometer AND liters
    // Note: we intentionally include flagged entries so the baseline stays stable
    // (excluding them causes a death spiral where each recalculate raises the average)
    const valid = entries.filter((e: any) => {
        const odo = Number(e.odometer) || 0;
        const liters = Number(e.liters) || 0;
        return odo > 0 && liters > 0;
    });

    if (valid.length < 3) {
        console.log(`[RollingEfficiencyBatch] Insufficient data: ${valid.length} valid entries (need 3). Skipping.`);
        return null;
    }

    // Sort by odometer ascending (should already be, but ensure it)
    valid.sort((a: any, b: any) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

    const firstOdo = Number(valid[0].odometer);
    const lastOdo = Number(valid[valid.length - 1].odometer);
    const totalDistance = lastOdo - firstOdo;
    // Exclude the first entry's liters — that fuel was consumed BEFORE the
    // distance window (firstOdo → lastOdo). This is the standard fill-up method.
    const totalFuel = valid.slice(1).reduce((sum: number, e: any) => sum + (Number(e.liters) || 0), 0);

    if (totalDistance <= 0 || totalFuel <= 0) {
        return { avgKmPerLiter: 0, entryCount: valid.length, totalDistance: 0, totalFuel: 0 };
    }

    const avgKmPerLiter = Number((totalDistance / totalFuel).toFixed(2));
    return { avgKmPerLiter, entryCount: valid.length, totalDistance, totalFuel };
}