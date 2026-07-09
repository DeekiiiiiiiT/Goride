/**
 * Toll Reconciliation Controller (Phase 2)
 *
 * Server-side endpoints for toll reconciliation data.
 * Replaces the client-side full-data-dump approach with
 * driver-scoped, paginated, server-filtered queries.
 *
 * Routes:
 *   GET  /toll-reconciliation/summary          – 4-card aggregates
 *   GET  /toll-reconciliation/unreconciled      – paginated unmatched tolls + suggestions
 *   GET  /toll-reconciliation/unclaimed-refunds – paginated trips with no matched expense
 *   GET  /toll-reconciliation/reconciled        – paginated matched history
 *   GET  /toll-reconciliation/export            – all toll txns flattened for CSV export
 *   GET  /toll-reconciliation/unified-events     – IDEA 2 canonical multi-source toll financial events
 *   GET  /toll-reconciliation/unified-events/export – CSV of unified events (same filters)
 *   POST /toll-reconciliation/reset-for-reconciliation – pending + clear trip/match (re-queue for Unmatched)
 */

import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { isTollCategory } from "./toll_category_flags.ts";
import { classifyOrphanToll } from "./orphanTollClassifier.ts";
import { emitDriverTollCharge, isUnifiedTollSettlementEnabled } from "./driver_toll_charge.ts";
import { mapResolutionReasonToTollResolution } from "./claim_resolution_sync.ts";
import { classifyTollLedgerEntry } from "./driver_toll_disposition.ts";
import { computeTollWorkflowStage, type TollWorkflowStage } from "./toll_workflow_stage.ts";
import { findTripsInDateRange, findTollsInDateRange, findTollsByMatchedTripId } from "./toll_match_index.ts";
import { appendCanonicalTollReconciledBatch, type TollReconcileAuditEntry } from "./canonical_from_ops.ts";
import { deleteCanonicalLedgerBySource } from "./ledger_canonical.ts";
import { applyEvidenceResolution } from "./evidence_routes.ts";
import {
  coversShortfallFully,
  leftoverAfterApply,
  remainingClaimShortfall,
  scoreUnlinkedShortfallMatch,
  isEligibleUnlinkedShortfallClaim,
  isEligibleUnlinkedShortfallToll,
  UNLINKED_PICKER_MIN_CONFIDENCE,
} from "./unlinked_shortfall_eligibility.ts";
import { computeChargeShortfall } from "./claim_charge_guard.ts";
import {
  getFleetTimezone,
  naiveToUtc,
  hasTzSuffix,
  normalizeWallClockTime,
  resolveFleetInstant,
} from "./timezone_helper.tsx";
import {
  buildDriverAliasMap,
  driverIdsReferToSamePerson,
  type DriverIdentityLike,
} from "./driver_identity.ts";
import {
  parseISO,
  subMinutes,
  addMinutes,
  isWithinInterval,
  differenceInMinutes,
  isValid,
  startOfDay,
  endOfDay,
  subDays,
  addDays,
} from "npm:date-fns";
import {
  TOLL_FINANCIAL_EVENT_SCHEMA_VERSION,
  TOLL_UNIFIED_EVENTS_MAX_LIMIT,
  countBySource,
  dedupeTollFinancialEvents,
  filterTollFinancialEvents,
  mapDisputeRefundToEvent,
  mapMergedTollTxToEvent,
  mapTripUnclaimedToEvent,
  parseKindFilter,
  sortTollFinancialEventsDesc,
  type TollEventSourceSystem,
  type TollFinancialEvent,
  type TollUnifiedEventsMeta,
} from "../../../types/tollFinancialEvent.ts";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BASE = "/make-server-37f42386/toll-reconciliation";

// ─── Shared Helpers ────────────────────────────────────────────────────

/**
 * Single source of truth for toll category detection (server-side copy).
 * Mirrors /utils/tollCategoryHelper.ts exactly.
 * 
 * @deprecated Phase 6: Toll data is now stored in `toll_ledger:*` prefix,
 * not in `transaction:*` with category filtering. This function is only
 * used for backward compatibility during migration and for routing new
 * toll transactions to the toll ledger. Use `getTollLedgerEntry()` to
 * check if an ID is a toll record.
 */

/**
 * Formats a Date into YYYY-MM-DD in the given IANA timezone.
 * Uses Intl so it is DST-aware (even though Jamaica has no DST).
 */
function toFleetDateOnly(d: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const y = get("year");
  const m = get("month");
  const day = get("day");
  return `${y}-${m}-${day}`;
}

/**
 * Attempts to derive the canonical toll date (YYYY-MM-DD) from a legacy transaction record.
 * - If tx.date has a TZ suffix, interpret as UTC instant → format in fleet TZ.
 * - If tx.date is naive, interpret in fleet TZ via naiveToUtc() → format in fleet TZ.
 * - If tx.date is already YYYY-MM-DD, return as-is.
 */
function deriveCanonicalDateFromLegacyTx(tx: any, fleetTz: string): string | null {
  const raw = tx?.date;
  if (!raw || typeof raw !== "string") return null;

  // Date-only already
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // ISO-ish with time
  if (raw.includes("T")) {
    const utc = hasTzSuffix(raw) ? new Date(raw) : naiveToUtc(raw, fleetTz);
    if (!isNaN(utc.getTime())) return toFleetDateOnly(utc, fleetTz);
  }

  // Fallback: try Date parsing
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return toFleetDateOnly(d, fleetTz);

  return null;
}

// ─── Ported Trip-Time Helpers (from /utils/timeUtils.ts) ───────────────

interface TripTimes {
  requestTime: Date;
  pickupTime: Date;
  dropoffTime: Date;
  isValid: boolean;
}

/** Toll must share a fleet calendar day with trip pickup or dropoff for ON_TRIP links. */
function tollSharesFleetDayWithTrip(
  txDate: Date,
  tripTimes: TripTimes,
  timezone: string,
): boolean {
  const tollDay = toFleetDateOnly(txDate, timezone);
  const pickupDay = toFleetDateOnly(tripTimes.pickupTime, timezone);
  const dropDay = toFleetDateOnly(tripTimes.dropoffTime, timezone);
  return tollDay === pickupDay || tollDay === dropDay;
}

interface TripWindows {
  activeStart: Date;
  activeEnd: Date;
  approachStart: Date;
  approachEnd: Date;
  searchStart: Date;
  searchEnd: Date;
}

function calculateTripTimes(trip: any, timezone: string): TripTimes {
  const dropoffStr = trip.dropoffTime || trip.date;
  const dropoffTime = resolveFleetInstant(String(dropoffStr || ""), timezone);

  const requestStr = trip.requestTime || trip.date;
  const requestTime = resolveFleetInstant(String(requestStr || ""), timezone);

  let pickupTime: Date;
  if (trip.startTime) {
    pickupTime = resolveFleetInstant(String(trip.startTime), timezone);
  } else if (trip.duration) {
    pickupTime = subMinutes(dropoffTime, trip.duration);
  } else {
    pickupTime = requestTime;
  }

  const valid =
    isValid(dropoffTime) && isValid(requestTime) && isValid(pickupTime);
  return { requestTime, pickupTime, dropoffTime, isValid: valid };
}

function getTripWindows(times: TripTimes): TripWindows {
  const activeStart = times.pickupTime;
  const activeEnd = times.dropoffTime;
  const approachStart = subMinutes(times.requestTime, 45);
  const approachEnd = times.pickupTime;
  const searchStart = approachStart;
  const searchEnd = addMinutes(times.dropoffTime, 15);
  return {
    activeStart,
    activeEnd,
    approachStart,
    approachEnd,
    searchStart,
    searchEnd,
  };
}

// ─── Data Quality Assessment ───────────────────────────────────────────

type DataQuality = "PRECISE" | "TIMED" | "DATE_ONLY";

/**
 * Assesses the timing data quality of a trip for toll matching purposes.
 *
 * PRECISE  = Has distinct request, pickup, and dropoff times (e.g., Uber CSV)
 * TIMED    = Has start/end times but request = pickup (e.g., manual InDrive/Roam entry)
 * DATE_ONLY = Only has a date, no meaningful time-of-day (e.g., generic CSV import)
 */
function assessDataQuality(trip: any, timezone: string): DataQuality {
  const tripTimes = calculateTripTimes(trip, timezone);
  if (!tripTimes.isValid) return "DATE_ONLY";

  // Check if request and pickup times are meaningfully different (> 1 minute apart)
  const requestPickupGapMs = Math.abs(
    tripTimes.pickupTime.getTime() - tripTimes.requestTime.getTime(),
  );
  if (requestPickupGapMs > 60_000) {
    // Distinct request vs pickup → full enroute window available
    return "PRECISE";
  }

  // Check if dropoff and request have meaningful time-of-day (not both midnight)
  const dropoffH = tripTimes.dropoffTime.getHours();
  const dropoffM = tripTimes.dropoffTime.getMinutes();
  const requestH = tripTimes.requestTime.getHours();
  const requestM = tripTimes.requestTime.getMinutes();
  const bothMidnight =
    dropoffH === 0 && dropoffM === 0 && requestH === 0 && requestM === 0;

  if (!bothMidnight) {
    // Has real times, but request = pickup (no enroute distinction)
    const timeDiffMs = Math.abs(
      tripTimes.dropoffTime.getTime() - tripTimes.requestTime.getTime(),
    );
    if (timeDiffMs > 60_000) {
      return "TIMED";
    }
  }

  return "DATE_ONLY";
}

// ─── Confidence Scoring Engine ─────────────────────────────────────────

interface ScoreResult {
  confidenceScore: number; // 0-100
  confidence: "high" | "medium" | "low"; // Derived label
  windowHit: "ON_TRIP" | "ENROUTE" | "POST_TRIP" | "NONE";
  matchType: MatchType;
  reason: string; // Placeholder — enriched by buildReasonString() in Phase 5
  vehicleMatch: boolean;
  driverMatch: boolean;
  amountMatch: boolean;
  dataQuality: DataQuality;
}

/**
 * Enterprise Confidence Scoring Engine for Toll-to-Trip matching.
 *
 * Calculates a 0-100 confidence score based on:
 *   - Time window hit (primary signal): ON_TRIP=70, ENROUTE=45, POST_TRIP=20
 *   - Identity boosters: +10 each for vehicleId match, driverId match, amount match
 *   - Data quality penalties: -25 for DATE_ONLY, -15 for TIMED+ENROUTE
 *
 * Returns null if the toll falls outside all time windows (no match).
 */
function calculateConfidenceScore(params: {
  txDate: Date;
  windows: TripWindows;
  dataQuality: DataQuality;
  txVehicleId: string | undefined;
  tripVehicleId: string | undefined;
  txDriverId: string | undefined;
  tripDriverId: string | undefined;
  txAmount: number;
  tripTollCharges: number;
  driverAliasMap?: Map<string, string>;
}): ScoreResult | null {
  const {
    txDate,
    windows,
    dataQuality,
    txVehicleId,
    tripVehicleId,
    txDriverId,
    tripDriverId,
    txAmount,
    tripTollCharges,
    driverAliasMap,
  } = params;

  // ── Step 1: Determine time window hit and base score ──
  let windowHit: "ON_TRIP" | "ENROUTE" | "POST_TRIP" | "NONE";
  let base: number;

  if (
    isWithinInterval(txDate, {
      start: windows.activeStart,
      end: windows.activeEnd,
    })
  ) {
    windowHit = "ON_TRIP";
    base = 70;
  } else if (
    isWithinInterval(txDate, {
      start: windows.approachStart,
      end: windows.approachEnd,
    })
  ) {
    windowHit = "ENROUTE";
    base = 45;
  } else if (txDate > windows.activeEnd && txDate <= windows.searchEnd) {
    windowHit = "POST_TRIP";
    base = 20;
  } else {
    // Outside all windows — no match
    return null;
  }

  // ── Step 2: Identity and amount boosters ──
  const vehicleMatch = !!(
    txVehicleId &&
    tripVehicleId &&
    txVehicleId === tripVehicleId
  );
  const driverMatch = driverIdsReferToSamePerson(txDriverId, tripDriverId, driverAliasMap);
  const amountMatch = isAmountMatch(tripTollCharges, txAmount);

  let score = base;
  if (vehicleMatch) score += 10;
  if (driverMatch) score += 10;
  if (amountMatch) score += 10;

  // ── Step 3: Data quality penalties ──
  if (dataQuality === "DATE_ONLY") {
    score -= 25;
  }
  if (dataQuality === "TIMED" && windowHit === "ENROUTE") {
    score -= 15; // Can't reliably distinguish enroute when request = pickup
  }

  // ── Step 4: Clamp and map to label ──
  score = Math.max(0, Math.min(100, score));

  let confidence: "high" | "medium" | "low";
  if (score >= 80) confidence = "high";
  else if (score >= 50) confidence = "medium";
  else confidence = "low";

  // ── Step 5: Determine matchType ──
  let matchType: MatchType;
  if (windowHit === "ON_TRIP") {
    matchType = amountMatch ? "PERFECT_MATCH" : "AMOUNT_VARIANCE";
  } else if (windowHit === "ENROUTE") {
    matchType = "DEADHEAD_MATCH";
  } else if (windowHit === "POST_TRIP") {
    matchType = "PERSONAL_MATCH";
  } else {
    matchType = "POSSIBLE_MATCH";
  }

  return {
    confidenceScore: score,
    confidence,
    windowHit,
    matchType,
    reason: "", // Placeholder — Phase 5 buildReasonString() will enrich
    vehicleMatch,
    driverMatch,
    amountMatch,
    dataQuality,
  };
}

/**
 * Performance-safe pre-filter: narrows trips to +/- 1 calendar day of the toll.
 * Replaces the old hard vehicle/driver gate with a time-based filter that
 * never excludes valid matches while keeping the comparison set small.
 *
 * A 3-day window (yesterday, today, tomorrow) covers:
 *   - The approach window (up to 45 min before trip)
 *   - The post-trip gap (up to 15 min after dropoff)
 *   - Timezone edge cases at midnight boundaries
 */
function sameDayPreFilter(txDate: Date, trips: any[]): any[] {
  const windowStart = subDays(startOfDay(txDate), 1);
  const windowEnd = addDays(endOfDay(txDate), 1);

  return trips.filter((trip: any) => {
    const tripDateStr = trip.dropoffTime || trip.date;
    if (!tripDateStr) return false;
    const tripDate = parseISO(tripDateStr);
    if (!isValid(tripDate)) return false;
    return tripDate >= windowStart && tripDate <= windowEnd;
  });
}

/**
 * Builds a human-readable reason string for toll match results.
 * Uses a "segment · segment · segment (Score: N)" format for clarity.
 */
function buildReasonString(params: {
  windowHit: "ON_TRIP" | "ENROUTE" | "POST_TRIP" | "NONE";
  amountMatch: boolean;
  vehicleMatch: boolean;
  driverMatch: boolean;
  dataQuality: DataQuality;
  confidenceScore: number;
  tripTollCharges: number;
  txAmount: number;
  varianceAmount: number;
}): string {
  const {
    windowHit,
    amountMatch,
    vehicleMatch,
    driverMatch,
    dataQuality,
    confidenceScore,
    tripTollCharges,
    txAmount,
    varianceAmount,
  } = params;

  const scoreSuffix = ` (Score: ${confidenceScore})`;

  if (windowHit === "ON_TRIP") {
    const parts: string[] = ["Passenger in vehicle"];
    if (amountMatch) {
      parts.push("Platform reimbursed");
    } else if (tripTollCharges === 0) {
      parts.push("No reimbursement recorded");
    } else {
      parts.push(`Underpaid (Diff: ${varianceAmount.toFixed(2)})`);
    }
    // Identity boosters
    if (driverMatch && vehicleMatch) parts.push("Driver + Vehicle confirmed");
    else if (driverMatch) parts.push("Driver confirmed");
    else if (vehicleMatch) parts.push("Vehicle confirmed");
    // Data quality caveat
    if (dataQuality === "DATE_ONLY") parts.push("Low timing precision");
    return parts.join(" · ") + scoreSuffix;
  }

  if (windowHit === "ENROUTE") {
    const parts: string[] = [
      "Enroute to pickup",
      "No passenger",
      "Driver responsibility",
    ];
    if (driverMatch) parts.push("Driver confirmed");
    if (dataQuality === "TIMED") parts.push("Enroute window estimated");
    return parts.join(" · ") + scoreSuffix;
  }

  if (windowHit === "POST_TRIP") {
    const parts: string[] = ["After dropoff", "Likely personal"];
    if (driverMatch) parts.push("Driver confirmed");
    return parts.join(" · ") + scoreSuffix;
  }

  return `Outside all trip windows${scoreSuffix}`;
}

// ─── Ported Toll Matching Logic (from /utils/tollReconciliation.ts) ────

const VARIANCE_THRESHOLD = 0.05;

type MatchType =
  | "PERFECT_MATCH"
  | "AMOUNT_VARIANCE"
  | "DEADHEAD_MATCH"
  | "PERSONAL_MATCH"
  | "POSSIBLE_MATCH";

interface MatchResult {
  tripId: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  timeDifferenceMinutes: number;
  matchType: MatchType;
  varianceAmount?: number;
  // ─── New fields (Phase 2) — all optional for backward compatibility ───
  confidenceScore?: number; // 0-100 numeric score
  vehicleMatch?: boolean; // true if toll's vehicleId === trip's vehicleId
  driverMatch?: boolean; // true if toll's driverId === trip's driverId
  dataQuality?: DataQuality; // Trip's timing data quality tier
  windowHit?: "ON_TRIP" | "ENROUTE" | "POST_TRIP" | "NONE"; // Which time window the toll fell in
  isAmbiguous?: boolean; // true if multiple trips compete with similar scores
  // Structured bucket driver (replaces brittle reason.includes('Approach') on the client).
  // Additive/optional — undefined leaves the client on its legacy string-check fallback.
  reasonCode?: "ON_TRIP" | "ENROUTE_APPROACH" | "POST_TRIP_GAP" | "ORPHAN_NO_TRIP" | "ORPHAN_OUT_OF_WINDOW";
  // Include minimal trip info so the frontend doesn't need a separate lookup
  tripDate: string;
  tripAmount: number;
  tripTollCharges: number;
  tripPickup: string;
  tripDropoff: string;
  tripPlatform: string;
  tripDriverId: string;
  tripDriverName: string;
  // ─── Trip timing & detail fields for overlay display ───
  tripRequestTime?: string;  // ISO string — actual request/pickup timestamp
  tripDropoffTime?: string;  // ISO string — actual dropoff timestamp
  tripVehicleId?: string;
  tripDuration?: number;     // minutes
  tripDistance?: number;     // km
  tripServiceType?: string;
}

/** Sort toll match candidates: score → time proximity → Uber toll refund pool. */
function compareTollMatchResults(a: MatchResult, b: MatchResult): number {
  const scoreA = a.confidenceScore ?? 0;
  const scoreB = b.confidenceScore ?? 0;
  if (scoreA !== scoreB) return scoreB - scoreA;
  if (a.timeDifferenceMinutes !== b.timeDifferenceMinutes) {
    return a.timeDifferenceMinutes - b.timeDifferenceMinutes;
  }
  return (b.tripTollCharges ?? 0) - (a.tripTollCharges ?? 0);
}

function isAmountMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < VARIANCE_THRESHOLD;
}

function getTransactionDateTime(tx: any, timezone: string): Date | null {
  try {
    const rawDate = tx.date ? String(tx.date) : "";
    const datePart = rawDate.slice(0, 10);
    let result: Date | null = null;

    // Prefer wall-clock date + separate time field in fleet TZ (toll imports store these)
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && tx.time) {
      const timeNorm = normalizeWallClockTime(String(tx.time));
      result = naiveToUtc(`${datePart}T${timeNorm}`, timezone);
    } else if (rawDate.includes("T")) {
      if (hasTzSuffix(rawDate)) {
        result = new Date(rawDate);
      } else {
        result = naiveToUtc(rawDate, timezone);
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      result = naiveToUtc(`${datePart}T00:00:00`, timezone);
    }
    return result;
  } catch {
    return null;
  }
}

function findTollMatchesServer(
  transaction: any,
  trips: any[],
  timezone: string,
  driverAliasMap?: Map<string, string>,
): MatchResult[] {
  const txDate = getTransactionDateTime(transaction, timezone);
  if (!txDate) return [];

  const matches: MatchResult[] = [];

  // Phase 6: Replace hard vehicle/driver gate with time-based pre-filter
  const candidateTrips = sameDayPreFilter(txDate, trips);

  for (const trip of candidateTrips) {
    const tripTimes = calculateTripTimes(trip, timezone);
    if (!tripTimes.isValid) continue;

    const windows = getTripWindows(tripTimes);
    const dataQuality = assessDataQuality(trip, timezone);

    // Calculate time difference for sorting
    let diff = 0;
    if (txDate < windows.activeStart)
      diff = differenceInMinutes(windows.activeStart, txDate);
    else if (txDate > windows.activeEnd)
      diff = differenceInMinutes(txDate, windows.activeEnd);

    const txAmountAbs = Math.abs(transaction.amount);
    const tripRefundAmount = trip.tollCharges || 0;
    const varianceAmount = tripRefundAmount - txAmountAbs;

    // Run the scoring engine
    const scoreResult = calculateConfidenceScore({
      txDate,
      windows,
      dataQuality,
      txVehicleId: transaction.vehicleId,
      tripVehicleId: trip.vehicleId,
      txDriverId: transaction.driverId,
      tripDriverId: trip.driverId,
      txAmount: txAmountAbs,
      tripTollCharges: tripRefundAmount,
      driverAliasMap,
    });

    // null = toll fell outside all windows, skip
    if (!scoreResult) continue;

    // Reject cross-calendar-day ON_TRIP links (e.g. Jun 30 toll → Jun 29 trip).
    if (
      scoreResult.windowHit === "ON_TRIP" &&
      !tollSharesFleetDayWithTrip(txDate, tripTimes, timezone)
    ) {
      continue;
    }

    // Build reason string
    const reason = buildReasonString({
      windowHit: scoreResult.windowHit,
      amountMatch: scoreResult.amountMatch,
      vehicleMatch: scoreResult.vehicleMatch,
      driverMatch: scoreResult.driverMatch,
      dataQuality: scoreResult.dataQuality,
      confidenceScore: scoreResult.confidenceScore,
      tripTollCharges: tripRefundAmount,
      txAmount: txAmountAbs,
      varianceAmount,
    });

    // Structured reason code derived from the window hit (drives client buckets).
    const reasonCode: MatchResult["reasonCode"] =
      scoreResult.windowHit === "ON_TRIP" ? "ON_TRIP" :
      scoreResult.windowHit === "ENROUTE" ? "ENROUTE_APPROACH" :
      scoreResult.windowHit === "POST_TRIP" ? "POST_TRIP_GAP" : undefined;

    matches.push({
      tripId: trip.id,
      confidence: scoreResult.confidence,
      reason,
      timeDifferenceMinutes: diff,
      matchType: scoreResult.matchType,
      varianceAmount:
        scoreResult.matchType === "AMOUNT_VARIANCE" ? varianceAmount : undefined,
      // New Phase 2 fields — now populated
      confidenceScore: scoreResult.confidenceScore,
      vehicleMatch: scoreResult.vehicleMatch,
      driverMatch: scoreResult.driverMatch,
      dataQuality: scoreResult.dataQuality,
      windowHit: scoreResult.windowHit,
      reasonCode,
      // Existing trip info fields (unchanged)
      tripDate: trip.date,
      tripAmount: trip.amount,
      tripTollCharges: tripRefundAmount,
      tripPickup: (trip.pickupLocation || "Unknown").substring(0, 40),
      tripDropoff: (trip.dropoffLocation || "Unknown").substring(0, 40),
      tripPlatform: trip.platform || "Unknown",
      tripDriverId: trip.driverId || "",
      tripDriverName: trip.driverName || "",
      // ─── Trip timing & detail fields for overlay display ───
      tripRequestTime: trip.requestTime || trip.date,
      tripDropoffTime: trip.dropoffTime || trip.date,
      tripVehicleId: trip.vehicleId,
      tripDuration: trip.duration,
      tripDistance: trip.distance,
      tripServiceType: trip.serviceType,
    });
  }

  matches.sort(compareTollMatchResults);

  // Ambiguity detection: if top 2 matches both have score >= 50
  // and are within 15 points of each other, flag both as ambiguous
  if (matches.length >= 2) {
    const topScore = matches[0].confidenceScore || 0;
    const secondScore = matches[1].confidenceScore || 0;
    if (topScore >= 50 && secondScore >= 50 && (topScore - secondScore) <= 15) {
      matches[0].isAmbiguous = true;
      matches[1].isAmbiguous = true;
    }
  }

  // Cap at top 5 matches to prevent UI overload
  return matches.slice(0, 5);
}

/** Best ON_TRIP match for dispute / underpaid linking (time + refund pool). */
function pickBestValidTollMatch(matches: MatchResult[]): MatchResult | undefined {
  const valid = matches.filter(
    (m) => m.matchType === "AMOUNT_VARIANCE" || m.matchType === "PERFECT_MATCH",
  );
  if (valid.length === 0) return undefined;
  return [...valid].sort(compareTollMatchResults)[0];
}

/**
 * Build a synthetic PERSONAL_MATCH suggestion for a toll that produced ZERO
 * real trip matches ("orphan" toll). Returns null when the toll is not an
 * orphan (a same-day trip sits within proximity → stays ambiguous).
 *
 * NON-BREAKAGE: callers must gate this on settings.personalUseDetectionEnabled.
 * The synthetic result carries tripId:'' so it can never auto-link or auto-charge.
 */
function buildOrphanSuggestion(
  tx: any,
  trips: any[],
  timezone: string,
  orphanProximityMinutes: number,
): MatchResult | null {
  const txDate = getTransactionDateTime(tx, timezone);
  if (!txDate) return null;

  const candidateTrips = sameDayPreFilter(txDate, trips).map((t: any) => ({
    requestTime: t.requestTime,
    dropoffTime: t.dropoffTime,
    date: t.date,
  }));

  const cls = classifyOrphanToll({ txDate, candidateTrips, orphanProximityMinutes });
  if (!cls.isOrphan) return null;

  const reasonByCode: Record<string, string> = {
    ORPHAN_NO_TRIP: "No trip on this day explains this toll (personal use)",
    ORPHAN_OUT_OF_WINDOW: "Nearest trip is too far from this toll (personal use)",
    ORPHAN_NEARBY_UNEXPLAINED: "Nearby trip does not explain this toll — confirm personal",
  };

  return {
    tripId: "", // no trip — prevents any auto-link / auto-charge downstream
    confidence: cls.confidence,
    reason: reasonByCode[cls.reasonCode] || "No trip explains this toll (personal use)",
    timeDifferenceMinutes: cls.nearestTripDiffMinutes ?? 0,
    matchType: "PERSONAL_MATCH",
    reasonCode: cls.reasonCode,
    // Minimal trip info fields (required by the interface) — empty for an orphan.
    tripDate: "",
    tripAmount: 0,
    tripTollCharges: 0,
    tripPickup: "",
    tripDropoff: "",
    tripPlatform: "",
    tripDriverId: "",
    tripDriverName: "",
  };
}

// ─── Data Loaders ──────────────────────────────────────────────────────

/**
 * Paginated loader that fetches ALL rows matching a key prefix.
 * Supabase caps queries at 1,000 rows by default, so we loop in
 * chunks of 1,000 using .range() until we get fewer rows than requested.
 */
async function loadAllByPrefix(prefix: string): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const allValues: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", `${prefix}%`)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      if (row.value) allValues.push(row.value);
    }

    // If we got fewer rows than the page size, we've reached the end
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allValues;
}

async function loadAllTransactions(): Promise<any[]> {
  return loadAllByPrefix("transaction:");
}

async function loadAllTrips(): Promise<any[]> {
  return loadAllByPrefix("trip:");
}

/**
 * @deprecated Phase 6: Use `getAllTollLedgerEntries()` instead.
 * This function loads from `transaction:*` which is no longer used for tolls.
 * Kept for potential rollback scenarios.
 */
async function loadAllTollTransactions(): Promise<any[]> {
  const allTx = await loadAllTransactions();
  return allTx.filter((tx: any) => isTollCategory(tx.category));
}

/**
 * @deprecated Phase 6: Use `loadAllTollLedgerWithTrips()` instead.
 * This function loads from `transaction:*` which is no longer used for tolls.
 * Kept for potential rollback scenarios.
 */
async function loadAllTollTransactionsWithTrips(): Promise<{ tollTx: any[]; trips: any[] }> {
  const [allTx, trips] = await Promise.all([
    loadAllTransactions(),
    loadAllTrips(),
  ]);
  const tollTx = allTx.filter((tx: any) => isTollCategory(tx.category));
  return { tollTx, trips };
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 5: Toll Ledger-Based Loaders (single source of truth)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert a TollLedgerRecord to the legacy transaction shape for backward compatibility.
 * This allows existing endpoint response shapes and client code to work unchanged.
 */
function tollLedgerToTxShape(entry: TollLedgerRecord): any {
  // Map status back to transaction status format
  let status = "Pending";
  if (entry.status === "approved" || entry.status === "resolved") status = "Approved";
  else if (entry.status === "rejected") status = "Rejected";
  else if (entry.status === "reconciled") status = "Approved";
  else if (entry.status === "pending") status = "Pending";

  // Build the transaction-like object
  return {
    id: entry.id,
    date: entry.date,
    time: entry.time,
    amount: entry.amount,
    type: entry.type === "usage" ? "Usage" : entry.type === "top_up" ? "Top-up" : "Refund",
    category: "Toll Usage",
    description: entry.location || entry.plaza || "",
    vendor: entry.plaza || entry.location || "",
    vehicleId: entry.vehicleId,
    vehiclePlate: entry.vehiclePlate,
    driverId: entry.driverId,
    driverName: entry.driverName,
    paymentMethod: entry.paymentMethod === "cash" ? "Cash" :
                   entry.paymentMethod === "card" ? "Card" :
                   entry.paymentMethod === "fleet_account" ? "Fleet Account" : "Tag Balance",
    status,
    // A toll is "handled" (out of the Unmatched queue) when it's matched to a
    // trip, reconciled/resolved, OR carries a terminal resolution
    // (personal/business/write_off/refunded). Without the `resolution` check a
    // resolved-personal tag toll (status 'rejected', no tripId) wrongly
    // reappeared as "Unmatched".
    isReconciled:
      entry.status === "reconciled" ||
      entry.status === "resolved" ||
      !!entry.resolution ||
      !!entry.tripId,
    tripId: entry.tripId,
    receiptUrl: entry.receiptUrl,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    // RWF-1: persisted workflow position + reverse claim pointer — read path
    // for the guided Toll Reconciliation stepper (bucketForWorkflowStage).
    workflowStage: entry.workflowStage,
    claimId: entry.claimId,
    matchStatus: entry.matchStatus,
    isAmbiguous: entry.metadata?.isAmbiguous === true || entry.matchStatus === "ambiguous",
    // Surface unlinked-apply provenance on the API shape for Matched History.
    unlinkedSourceTripId: entry.unlinkedSourceTripId ?? null,
    unlinkedSourcePlatform: entry.unlinkedSourcePlatform ?? null,
    unlinkedAppliedAt: entry.unlinkedAppliedAt ?? null,
    unlinkedAppliedBy: entry.unlinkedAppliedBy ?? null,
    preUnlinkedTripId: entry.preUnlinkedTripId ?? null,
    metadata: {
      tollTagId: entry.tollTagId,
      tagNumber: entry.tagNumber,
      highway: entry.highway,
      plaza: entry.plaza,
      batchId: entry.batchId,
      batchName: entry.batchName,
      importedAt: entry.importedAt,
      sourceFile: entry.sourceFile,
      matchConfidence: entry.matchConfidence,
      matchedAt: entry.matchedAt,
      matchedBy: entry.matchedBy,
      resolution: entry.resolution,
      auditTrail: entry.auditTrail,
      // Preserve auto-match override flag
      autoMatchOverridden: entry.metadata?.autoMatchOverridden,
      unlinkedSourceTripId: entry.unlinkedSourceTripId,
      unlinkedSourcePlatform: entry.unlinkedSourcePlatform,
      unlinkedAppliedAt: entry.unlinkedAppliedAt,
      unlinkedAppliedBy: entry.unlinkedAppliedBy,
      preUnlinkedTripId: entry.preUnlinkedTripId,
      // Include any other metadata
      ...entry.metadata,
    },
  };
}

/**
 * Read path: `toll_ledger:*` (canonical) plus legacy `transaction:*` rows with a toll
 * category that are not yet in the ledger (same `id` → ledger wins).
 * Fixes empty Toll Logs / Ledger when data never migrated off `transaction:*`.
 */
async function loadMergedTollTxArray(): Promise<any[]> {
  const [ledgerEntries, rawTx] = await Promise.all([
    getAllTollLedgerEntries(),
    kv.getByPrefix("transaction:"),
  ]);
  const byId = new Map<string, any>();
  for (const e of ledgerEntries) {
    const tx = tollLedgerToTxShape(e);
    if (tx?.id != null && String(tx.id) !== "") {
      byId.set(String(tx.id), tx);
    }
  }
  let legacyAdded = 0;
  for (const tx of rawTx || []) {
    if (!tx || typeof tx !== "object") continue;
    if (!isTollCategory(tx.category)) continue;
    const id = tx.id;
    if (id == null || id === "") continue;
    const sid = String(id);
    if (byId.has(sid)) continue;
    byId.set(sid, tx);
    legacyAdded++;
  }
  if (legacyAdded > 0) {
    console.log(
      `[TollMerge] Merged ${legacyAdded} toll transaction(s) from transaction:* not in toll_ledger`,
    );
  }
  return Array.from(byId.values());
}

/**
 * Phase 5+ loader: merged toll rows + all trips (for reconciliation views).
 */
async function loadAllTollLedgerWithTrips(): Promise<{ tollTx: any[]; trips: any[] }> {
  const [tollTx, trips] = await Promise.all([
    loadMergedTollTxArray(),
    loadAllTrips(),
  ]);
  return { tollTx, trips };
}

/** Support adjustments (`dispute-refund:*`), excluding dedup index keys. */
async function loadDisputeRefundRecords(): Promise<any[]> {
  const raw = await loadAllByPrefix("dispute-refund:");
  return (raw || []).filter(
    (item: any) => item && typeof item === "object" && item.id && item.supportCaseId,
  );
}

/**
 * IDEA 2 unified read model: merged toll rows + unlinked trip refund signals + dispute refunds.
 * Toll merge follows `loadMergedTollTxArray` (ledger wins by id).
 */
async function buildUnifiedTollFinancialEventsList(): Promise<{
  events: TollFinancialEvent[];
  droppedDuplicatesCount: number;
}> {
  const [ledgerEntries, mergedToll, trips, disputeRaw] = await Promise.all([
    getAllTollLedgerEntries(),
    loadMergedTollTxArray(),
    loadAllTrips(),
    loadDisputeRefundRecords(),
  ]);
  const ledgerIds = new Set(ledgerEntries.map((e) => String(e.id)));

  const tollEvents: TollFinancialEvent[] = [];
  for (const tx of mergedToll) {
    const ev = mapMergedTollTxToEvent(tx, ledgerIds);
    if (ev) tollEvents.push(ev);
  }

  const linkedTripIds = new Set(
    mergedToll.filter((tx: any) => tx.tripId).map((tx: any) => String(tx.tripId)),
  );
  const tripEvents: TollFinancialEvent[] = [];
  for (const t of trips) {
    const tc = Number(t.tollCharges) || 0;
    if (tc <= 0 || linkedTripIds.has(String(t.id))) continue;
    const ev = mapTripUnclaimedToEvent(t);
    if (ev) tripEvents.push(ev);
  }

  const drEvents: TollFinancialEvent[] = [];
  for (const r of disputeRaw) {
    const ev = mapDisputeRefundToEvent(r);
    if (ev) drEvents.push(ev);
  }

  const combined = [...tollEvents, ...tripEvents, ...drEvents];
  const { events, droppedDuplicatesCount } = dedupeTollFinancialEvents(combined);
  return {
    events: sortTollFinancialEventsDesc(events),
    droppedDuplicatesCount,
  };
}

// ─── Route Helpers ─────────────────────────────────────────────────────

function parseQueryParams(c: any) {
  const driverId = c.req.query("driverId") || undefined;
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const from = c.req.query("from") || undefined;
  const to = c.req.query("to") || undefined;
  return { driverId, limit, offset, from, to };
}

const UNRECONCILED_MAX_PAGE_LIMIT = 100;

function parseUnreconciledQueryParams(c: any) {
  const driverId = c.req.query("driverId") || undefined;
  const rawLimit = parseInt(c.req.query("limit") || "50", 10);
  const limit = isNaN(rawLimit) || rawLimit < 1
    ? 50
    : Math.min(rawLimit, UNRECONCILED_MAX_PAGE_LIMIT);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const autoMatch = c.req.query("autoMatch") === "1";
  const from = c.req.query("from") || undefined;
  const to = c.req.query("to") || undefined;
  return { driverId, limit, offset, autoMatch, from, to };
}

/**
 * Optional [from, to] (yyyy-MM-dd) scoping for the period-gated wizard
 * (Phase F4) — best-effort day-boundary filtering (not full fleet-tz
 * correction, unlike the period aggregation endpoint) since this only needs
 * to narrow an already-loaded list to roughly the right week, not compute
 * authoritative period membership.
 */
function filterByDateRange<T extends { date?: string }>(items: T[], from?: string, to?: string): T[] {
  if (!from && !to) return items;
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  return items.filter((item) => {
    if (!item.date) return false;
    const t = new Date(item.date).getTime();
    if (isNaN(t)) return false;
    return t >= fromMs && t <= toMs;
  });
}

function parseUnifiedQueryParams(c: any) {
  const driverId = c.req.query("driverId") || undefined;
  const from = c.req.query("from") || undefined;
  const to = c.req.query("to") || undefined;
  const kinds = parseKindFilter(c.req.query("kinds") || undefined);
  const batchId = c.req.query("batchId") || undefined;
  const rawLimit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  return {
    driverId,
    from,
    to,
    kinds,
    batchId,
    rawLimit,
    offset: isNaN(offset) ? 0 : offset,
  };
}

function csvEscapeCell(val: string): string {
  if (/[",\r\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

type UnifiedQuery = ReturnType<typeof parseUnifiedQueryParams>;

async function projectUnifiedTollEventsPage(q: UnifiedQuery): Promise<
  | { ok: false; status: 400; error: string }
  | {
      ok: true;
      page: TollFinancialEvent[];
      total: number;
      limit: number;
      droppedDuplicatesCount: number;
      sourcesIncluded: Partial<Record<TollEventSourceSystem, number>>;
      durationMs: number;
    }
> {
  const t0 = Date.now();
  if (!isNaN(q.rawLimit) && q.rawLimit > TOLL_UNIFIED_EVENTS_MAX_LIMIT) {
    return { ok: false, status: 400, error: `limit cannot exceed ${TOLL_UNIFIED_EVENTS_MAX_LIMIT}` };
  }
  const limit = isNaN(q.rawLimit) || q.rawLimit < 1 ? 50 : q.rawLimit;

  const { events: allEvents, droppedDuplicatesCount } = await buildUnifiedTollFinancialEventsList();

  const filtered = filterTollFinancialEvents(allEvents, {
    driverId: q.driverId,
    from: q.from,
    to: q.to,
    kinds: q.kinds,
    batchId: q.batchId,
  });

  const total = filtered.length;
  const page = filtered.slice(q.offset, q.offset + limit);
  const sourcesIncluded = countBySource(filtered);
  const durationMs = Date.now() - t0;

  return {
    ok: true,
    page,
    total,
    limit,
    droppedDuplicatesCount,
    sourcesIncluded,
    durationMs,
  };
}

function filterByDriver(items: any[], driverId?: string, driverAliasMap?: Map<string, string>): any[] {
  if (!driverId) return items;
  if (!driverAliasMap) return items.filter((item: any) => item.driverId === driverId);
  const canonical = driverAliasMap.get(driverId) ?? driverId;
  return items.filter((item: any) => {
    const id = item.driverId;
    if (!id) return false;
    return (driverAliasMap.get(id) ?? id) === canonical;
  });
}

let _driverAliasMapCache: Map<string, string> | null = null;
let _driverAliasMapTimestamp = 0;
const DRIVER_ALIAS_CACHE_TTL_MS = 5 * 60 * 1000;

async function getDriverAliasMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (_driverAliasMapCache && now - _driverAliasMapTimestamp < DRIVER_ALIAS_CACHE_TTL_MS) {
    return _driverAliasMapCache;
  }
  const drivers = (await loadAllByPrefix("driver:")) as DriverIdentityLike[];
  _driverAliasMapCache = buildDriverAliasMap(drivers);
  _driverAliasMapTimestamp = now;
  return _driverAliasMapCache;
}

// ─── GET /summary ──────────────────────────────────────────────────────

app.get(`${BASE}/summary`, async (c) => {
  try {
    const { driverId } = parseQueryParams(c);

    // Phase 5: Read from toll_ledger:* (single source of truth)
    const loaded = await loadAllTollLedgerWithTrips();
    let tollTx = loaded.tollTx;
    let trips = loaded.trips;

    const driverAliasMap = await getDriverAliasMap();
    if (driverId) {
      tollTx = filterByDriver(tollTx, driverId, driverAliasMap);
      trips = filterByDriver(trips, driverId, driverAliasMap);
    }

    // Unreconciled: tag imports without link, OR pending cash claims
    const unreconciled = tollTx.filter((tx: any) => {
      const isCashClaim =
        tx.paymentMethod === "Cash" || !!tx.receiptUrl;
      if (isCashClaim) {
        return tx.status === "Pending" && !tx.isReconciled;
      }
      return !tx.isReconciled || !tx.tripId;
    });

    // Reconciled
    const reconciled = tollTx.filter(
      (tx: any) => tx.isReconciled && tx.tripId,
    );

    // Unclaimed refunds — trips with tollCharges but no linked toll tx
    const linkedTripIds = new Set(
      tollTx
        .filter((tx: any) => tx.tripId)
        .map((tx: any) => tx.tripId),
    );
    // Unresolved refunds only (resolved cash_wash/phantom/expense_logged drop off).
    const unclaimedRefunds = trips.filter((t: any) => isUnresolvedRefund(t, linkedTripIds));
    // Resolved refunds (any non-pending resolution) — surfaced separately.
    const resolvedRefunds = trips.filter(
      (t: any) => t.tollRefundResolution && t.tollRefundResolution.status !== "pending",
    );

    // Amounts
    const unreconciledAmount = unreconciled.reduce(
      (sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0),
      0,
    );
    const recoveredAmount = reconciled.reduce(
      (sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0),
      0,
    );
    const unclaimedRefundsAmount = unclaimedRefunds.reduce(
      (sum: number, t: any) => sum + (Number(t.tollCharges) || 0),
      0,
    );
    const resolvedRefundsAmount = resolvedRefunds.reduce(
      (sum: number, t: any) => sum + (Number(t.tollCharges) || 0),
      0,
    );

    // Driver liability: unreconciled personal-match amounts
    // For the summary, we approximate as the total unreconciled amount
    // (proper per-match classification happens in /unreconciled)
    const driverLiability = unreconciledAmount;

    return c.json({
      success: true,
      summary: {
        claimableAmount: Math.round(unreconciledAmount * 100) / 100,
        recoveredAmount: Math.round(recoveredAmount * 100) / 100,
        driverLiability: Math.round(driverLiability * 100) / 100,
        unclaimedRefundsAmount:
          Math.round(unclaimedRefundsAmount * 100) / 100,
        resolvedRefundsAmount: Math.round(resolvedRefundsAmount * 100) / 100,
        unreconciledCount: unreconciled.length,
        reconciledCount: reconciled.length,
        unclaimedRefundsCount: unclaimedRefunds.length,
        resolvedRefundsCount: resolvedRefunds.length,
        totalTollTransactions: tollTx.length,
      },
    });
  } catch (e: any) {
    console.log(
      `[TollReconciliation] GET /summary error: ${e.message}`,
    );
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /resolved-cash-claims-audit (MOI-0, read-only diagnostic) ─────
// Cash toll claims are excluded from /unreconciled forever once their status
// moves off "Pending" (Approved/Rejected/Resolved) — even if a matching trip
// is imported afterward. This endpoint does NOT change that behavior or touch
// any stored data; it only reports which already-resolved cash claims would
// now match a real trip, using the same pure matching logic as /unreconciled,
// so the size of the gap is visible before the full match-on-ingest work lands.
app.get(`${BASE}/resolved-cash-claims-audit`, async (c) => {
  try {
    const { driverId } = parseQueryParams(c);

    const loaded = await loadAllTollLedgerWithTrips();
    let tollTx = loaded.tollTx;
    let trips = loaded.trips;

    const driverAliasMap = await getDriverAliasMap();
    if (driverId) {
      tollTx = filterByDriver(tollTx, driverId, driverAliasMap);
      trips = filterByDriver(trips, driverId, driverAliasMap);
    }

    // Resolved cash claims: same "isCashClaim" test as the live filter, but
    // looking at the ones that filter now EXCLUDES (status moved off Pending).
    const resolvedCashClaims = tollTx.filter((tx: any) => {
      const isCashClaim = tx.paymentMethod === "Cash" || !!tx.receiptUrl;
      return isCashClaim && tx.status !== "Pending";
    });

    const timezone = await getFleetTimezone();

    const rematchCandidates: any[] = [];
    for (const tx of resolvedCashClaims) {
      if (tx.tripId) continue; // already linked — nothing to find
      const matches = findTollMatchesServer(tx, trips, timezone, driverAliasMap);
      const best = matches[0];
      if (best && (best.matchType === "PERFECT_MATCH" || best.matchType === "AMOUNT_VARIANCE")) {
        rematchCandidates.push({
          tollId: tx.id,
          date: tx.date,
          amount: tx.amount,
          status: tx.status,
          driverId: tx.driverId,
          driverName: tx.driverName,
          vehicleId: tx.vehicleId,
          matchedTripId: best.tripId,
          matchType: best.matchType,
          confidenceScore: best.confidenceScore,
          reason: best.reason,
        });
      }
    }

    return c.json({
      success: true,
      totalResolvedCashClaims: resolvedCashClaims.length,
      rematchCandidateCount: rematchCandidates.length,
      rematchCandidates,
    });
  } catch (e: any) {
    console.log(
      `[TollReconciliation] GET /resolved-cash-claims-audit error: ${e.message}`,
    );
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /rematch-candidates (MOI-5) ────────────────────────────────────
// Deliberately its OWN query, independent of the /unreconciled filter — a
// resolved cash claim (the exact case that motivated this project) is
// permanently excluded from /unreconciled, so a queue built on that filter
// would never surface it. This never moves money — it only lists tolls that
// MOI-4b flagged (metadata.rematchCandidate) because a newly-imported trip
// now looks like a better match than whatever they were originally resolved
// as. A human decides what to do via the existing edit/claim UI.
app.get(`${BASE}/rematch-candidates`, async (c) => {
  try {
    const { driverId } = parseQueryParams(c);
    const all = (await loadAllByPrefix(TOLL_LEDGER_PREFIX)) as TollLedgerRecord[];
    let flagged = all.filter((tx) => !!tx?.metadata?.rematchCandidate);
    if (driverId) flagged = flagged.filter((tx) => tx.driverId === driverId);

    flagged.sort((a, b) => {
      const aAt = String((a.metadata?.rematchCandidate as any)?.detectedAt || "");
      const bAt = String((b.metadata?.rematchCandidate as any)?.detectedAt || "");
      return bAt.localeCompare(aAt);
    });

    return c.json({
      success: true,
      count: flagged.length,
      candidates: flagged.map((tx) => ({
        tollId: tx.id,
        date: tx.date,
        amount: tx.amount,
        status: tx.status,
        resolution: tx.resolution,
        driverId: tx.driverId,
        driverName: tx.driverName,
        vehicleId: tx.vehiclePlate || tx.vehicleId,
        rematchCandidate: tx.metadata?.rematchCandidate,
      })),
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /rematch-candidates error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /rematch-candidates/:id/dismiss (MOI-5) ───────────────────────
// Clears the review flag only — never touches status/resolution/matchedTripId
// or any financial record. Use this once an admin has looked at a flagged
// toll and decided the original resolution is correct (or has already fixed
// it manually via the existing Edit/Claim flows).
app.post(`${BASE}/rematch-candidates/:id/dismiss`, async (c) => {
  try {
    const id = c.req.param("id");
    const existing = await getTollLedgerEntry(id);
    if (!existing) return c.json({ error: "Toll not found" }, 404);

    const nextMetadata = { ...(existing.metadata || {}) };
    delete (nextMetadata as any).rematchCandidate;

    await updateTollLedgerEntry(id, { metadata: nextMetadata }, "updated", "admin", "Rematch review dismissed");
    return c.json({ success: true });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /rematch-candidates/:id/dismiss error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /unreconciled ─────────────────────────────────────────────────

app.get(`${BASE}/unreconciled`, async (c) => {
  const t0 = Date.now();
  try {
    const { driverId, limit, offset, autoMatch, from, to } = parseUnreconciledQueryParams(c);

    // Phase 5: Read from toll_ledger:* (single source of truth)
    const loaded = await loadAllTollLedgerWithTrips();
    let tollTx = loaded.tollTx;
    let trips = loaded.trips;

    const driverAliasMap = await getDriverAliasMap();
    if (driverId) {
      tollTx = filterByDriver(tollTx, driverId, driverAliasMap);
      trips = filterByDriver(trips, driverId, driverAliasMap);
    }

    // Unreconciled filter (same logic as the hook)
    let unreconciled = tollTx.filter((tx: any) => {
      const isCashClaim =
        tx.paymentMethod === "Cash" || !!tx.receiptUrl;
      if (isCashClaim) {
        return tx.status === "Pending" && !tx.isReconciled;
      }
      return !tx.isReconciled || !tx.tripId;
    });

    // Phase F4: optional period scoping for the gated reconciliation wizard.
    unreconciled = filterByDateRange(unreconciled, from, to);

    // Sort by date descending
    unreconciled.sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const timezone = await getFleetTimezone();

    // ── Auto-confirm PERFECT_MATCH (opt-in only) ───────────────────────────
    // Default GET must stay fast: scanning every unreconciled toll against all
    // trips on each page load exceeded edge CPU limits (HTTP 546) and blanked
    // the dashboard even though /toll-logs still returned data.
    // Pass ?autoMatch=1 (Refresh Data button) to run server-side auto-match.
    const AUTO_MATCH_SCAN_CAP = 3000;
    let autoReconciled = 0;
    const autoReconciledIds = new Set<string>();

    if (autoMatch) {
    const scanSet = unreconciled.slice(0, AUTO_MATCH_SCAN_CAP);
    if (unreconciled.length > AUTO_MATCH_SCAN_CAP) {
      console.log(
        `[TollReconciliation] Auto-match scan capped at ${AUTO_MATCH_SCAN_CAP} of ${unreconciled.length} unreconciled tolls`,
      );
    }

    for (const tx of scanSet) {
      const txId = tx.id;

      // Guard: skip if already reconciled (race condition protection)
      if (tx.isReconciled && tx.tripId) continue;

      // Guard: skip if admin previously un-matched this auto-match
      if (tx.metadata?.autoMatchOverridden) continue;

      const matches = findTollMatchesServer(tx, trips, timezone, driverAliasMap);
      const best = matches[0];
      if (best?.isAmbiguous) continue;
      if (best?.matchType !== "PERFECT_MATCH") continue;

      const tripId = best.tripId;
      const trip = trips.find((t: any) => t.id === tripId);
      if (!trip) continue;

      try {
        // Phase 5: Update toll_ledger:* as primary store
        // Phase 6: Write ONLY to toll_ledger (single source of truth)
        await updateTollLedgerEntry(
          txId,
          {
            status: "reconciled",
            tripId,
            driverId: trip.driverId || tx.driverId,
            driverName: trip.driverName || tx.driverName,
            matchConfidence: best.confidenceScore,
            matchedAt: new Date().toISOString(),
            matchedBy: "system-auto",
          },
          "reconciled",
          "system-auto"
        );

        // Update local tx object for response (not persisted to transaction:*)
        tx.tripId = tripId;
        tx.isReconciled = true;
        tx.driverId = trip.driverId || tx.driverId;
        tx.driverName = trip.driverName || tx.driverName;

        // Write ledger entry for audit trail
        await writeTollLedgerEntry({
          eventType: "toll_reconciled",
          category: "Toll Reconciliation",
          description: `Auto-matched toll to trip: ${(trip.pickupLocation || "").substring(0, 30)} \u2192 ${(trip.dropoffLocation || "").substring(0, 30)}`,
          grossAmount: Math.abs(Number(tx.amount) || 0),
          netAmount: 0,
          direction: "neutral",
          sourceType: "reconciliation",
          sourceId: txId,
          driverId: tx.driverId || trip.driverId || "unknown",
          driverName: tx.driverName || trip.driverName || "Unknown",
          vehicleId: tx.vehicleId || trip.vehicleId,
          date: tx.date,
          metadata: {
            tripId,
            matchedAt: new Date().toISOString(),
            matchedBy: "system-auto",
            tollAmount: Math.abs(Number(tx.amount) || 0),
            tripTollCharges: trip.tollCharges || 0,
          },
        });

        autoReconciledIds.add(txId);
        autoReconciled++;
        console.log(
          `[TollReconciliation] Auto-confirmed PERFECT_MATCH: tx ${txId} \u2192 trip ${tripId} (score: ${best.confidenceScore})`,
        );
      } catch (err: any) {
        console.log(
          `[TollReconciliation] Auto-confirm failed for tx ${txId}: ${err.message}`,
        );
      }
    }

    if (autoReconciled > 0) {
      console.log(
        `[TollReconciliation] Auto-confirmed ${autoReconciled} perfect match(es)`,
      );
    }
    } // end autoMatch opt-in

    // Paginate the REMAINING unreconciled tolls (after auto-confirm).
    const remaining = unreconciled.filter((tx: any) => !autoReconciledIds.has(tx.id));
    const total = remaining.length;
    const page = remaining.slice(offset, offset + limit);

    // Personal-use (orphan) detection settings — flag default OFF.
    const puSettings = await getRefundAutomationSettings();

    // Compute match suggestions for the current page (display only).
    const suggestionsMap: Record<string, MatchResult[]> = {};
    for (const tx of page) {
      const matches = findTollMatchesServer(tx, trips, timezone, driverAliasMap);
      if (matches.length > 0) {
        suggestionsMap[tx.id] = matches;
      } else if (puSettings.personalUseDetectionEnabled) {
        // No real trip match → classify as orphan (personal use) when enabled.
        const orphan = buildOrphanSuggestion(
          tx,
          trips,
          timezone,
          puSettings.orphanProximityMinutes,
        );
        if (orphan) suggestionsMap[tx.id] = [orphan];
      }
    }

    // ── Shared-trip-refund correction ────────────────────────────────────
    // A trip's `tollCharges` is ONE refund amount, but multiple distinct
    // tolls (e.g. two toll plazas on the same route) can each independently
    // match to that same trip. Crediting the full trip refund to every one
    // of them double-counts the same money AND can show a refund bigger
    // than any one toll ever cost (e.g. a $645 refund on a $285 toll).
    // Policy: treat the trip's refund as a shared pool, handed out in
    // chronological order, each toll capped at its own cost — same rule as
    // tollReconciliation.ts's `allocateTripRefundAcrossTolls` (client) and
    // dispute_refund_controller.tsx's `/match-candidates` (server).
    const tripGroups = new Map<string, { tx: any; matches: MatchResult[] }[]>();
    for (const tx of page) {
      const top = suggestionsMap[tx.id]?.[0];
      if (!top?.tripId || (top.matchType !== "PERFECT_MATCH" && top.matchType !== "AMOUNT_VARIANCE")) continue;
      const list = tripGroups.get(top.tripId) || [];
      list.push({ tx, matches: suggestionsMap[tx.id] });
      tripGroups.set(top.tripId, list);
    }
    for (const group of tripGroups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => {
        const da = getTransactionDateTime(a.tx, timezone)?.getTime() ?? 0;
        const db = getTransactionDateTime(b.tx, timezone)?.getTime() ?? 0;
        return da - db;
      });
      let remaining = group[0].matches[0].tripTollCharges || 0; // the trip's own refund — same for every member
      for (const { tx, matches } of group) {
        const top = matches[0];
        const txAmountAbs = Math.abs(Number(tx.amount) || 0);
        const allocated = Math.max(0, Math.min(remaining, txAmountAbs));
        remaining -= allocated;
        top.matchType = "AMOUNT_VARIANCE";
        top.varianceAmount = allocated - txAmountAbs;
        top.tripTollCharges = allocated;
        top.reason = allocated >= txAmountAbs
          ? `Trip toll refund covers this charge (shared with ${group.length - 1} other toll${group.length > 2 ? "s" : ""} on the same trip)`
          : `Trip toll refund only partially covers this charge — the rest was already credited to an earlier toll on the same trip (Diff: -${(txAmountAbs - allocated).toFixed(2)})`;
      }
    }

    // MOI-6: shadow-diff verification. Response below is UNCHANGED — this
    // only logs a mismatch between the live-computed suggestion (above) and
    // whatever match-on-ingest already persisted onto the row (MOI-3/MOI-4b),
    // for tolls that carry a matchStatus. This is the evidence gate before
    // the read path is ever switched to trust the stored fields instead of
    // recomputing: only once this log is empty across real traffic for a
    // full week does it become safe to flip the actual response over.
    if (puSettings.matchOnIngestEnabled) {
      for (const tx of page) {
        if (!tx.matchStatus) continue;
        const liveTripId = suggestionsMap[tx.id]?.[0]?.tripId || null;
        const storedTripId = tx.matchedTripId || null;
        if (liveTripId !== storedTripId) {
          console.warn(
            `[MatchOnIngest][ShadowDiff] toll ${tx.id}: live=${liveTripId || "none"} stored=${storedTripId || "none"} (matchStatus=${tx.matchStatus})`,
          );
        }
      }
    }

    const durationMs = Date.now() - t0;
    console.log(
      `[TollReconciliation] GET /unreconciled: total=${total} page=${page.length} autoMatch=${autoMatch} autoReconciled=${autoReconciled} durationMs=${durationMs}`,
    );

    return c.json({
      success: true,
      data: page,
      suggestions: suggestionsMap,
      total,
      limit,
      offset,
      autoReconciled,
    });
  } catch (e: any) {
    console.log(
      `[TollReconciliation] GET /unreconciled error: ${e.message}`,
    );
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /unclaimed-refunds ────────────────────────────────────────────

app.get(`${BASE}/unclaimed-refunds`, async (c) => {
  try {
    const { driverId, limit, offset, from, to } = parseQueryParams(c);

    // Phase 5: Read from toll_ledger:* (single source of truth)
    const loaded = await loadAllTollLedgerWithTrips();
    const tollTx = filterByDriver(loaded.tollTx, driverId);
    let trips = filterByDriver(loaded.trips, driverId);

    // Build linkedTripIds — only toll-category transactions with a tripId
    const linkedTripIds = new Set(
      tollTx
        .filter((tx: any) => tx.tripId)
        .map((tx: any) => tx.tripId),
    );

    // Candidates: trips with a toll refund, no linked toll tx, and not already
    // resolved (cash_wash/phantom/expense_logged drop off; pending stays).
    // Phase F4: optional period scoping for the gated reconciliation wizard.
    const candidates = filterByDateRange(
      trips.filter((t: any) => isUnresolvedRefund(t, linkedTripIds)),
      from,
      to,
    );

    // ── Automation (flagged, default OFF): auto-apply integrity-safe cash washes ──
    const automation = await getRefundAutomationSettings();
    let autoResolved = 0;
    const autoResolvedIds = new Set<string>();
    if (automation.refundAutomationEnabled && candidates.length > 0) {
      const plazas = await loadActivePlazaPoints();
      for (const t of candidates) {
        const nearest = nearestPlazaMetersForTrip(t, plazas);
        const cls = classifyRefundServer({
          tollCharges: Number(t.tollCharges) || 0,
          platform: t.platform,
          paymentMethod: t.paymentMethod,
          nearestPlazaMeters: nearest,
        });
        if (isSafeAutoApplyServer(cls, automation.refundAutoMinConfidence)) {
          try {
            await applyRefundResolution({
              tripId: t.id,
              resolution: cls.status,
              auto: true,
              confidence: cls.confidence,
              notes: "Auto-resolved: " + cls.reason,
            });
            autoResolvedIds.add(t.id);
            autoResolved++;
          } catch (err: any) {
            console.log(`[TollReconciliation] Auto-resolve failed for trip ${t.id}: ${err.message}`);
          }
        }
      }
      if (autoResolved > 0) {
        console.log(`[TollReconciliation] Auto-resolved ${autoResolved} refund(s) as cash wash`);
      }
    }

    // Remaining unresolved after any automation pass.
    const unclaimed = candidates.filter((t: any) => !autoResolvedIds.has(t.id));

    // Sort by date descending
    unclaimed.sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const total = unclaimed.length;
    const page = unclaimed.slice(offset, offset + limit);

    return c.json({
      success: true,
      data: page,
      total,
      limit,
      offset,
      autoResolved,
    });
  } catch (e: any) {
    console.log(
      `[TollReconciliation] GET /unclaimed-refunds error: ${e.message}`,
    );
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /reconciled ───────────────────────────────────────────────────

app.get(`${BASE}/reconciled`, async (c) => {
  try {
    const { driverId, limit, offset, from, to } = parseQueryParams(c);

    const allTollTx = await loadMergedTollTxArray();

    let reconciled = allTollTx.filter(
      (tx: any) => tx.isReconciled && tx.tripId,
    );

    if (driverId) {
      reconciled = filterByDriver(reconciled, driverId);
    }

    // Phase F4: optional period scoping for the gated reconciliation wizard.
    reconciled = filterByDateRange(reconciled, from, to);

    // Sort by date descending
    reconciled.sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const total = reconciled.length;
    const page = reconciled.slice(offset, offset + limit);

    // Look up linked trips for each reconciled toll (for refund amounts)
    const tripIds = [...new Set(page.map((tx: any) => tx.tripId).filter(Boolean))];
    const tripLookup: Record<string, any> = {};
    if (tripIds.length > 0) {
      // Batch fetch trips by their KV keys
      const tripKeys = tripIds.map((id: string) => `trip:${id}`);
      try {
        const tripValues = await kv.mget(tripKeys);
        tripIds.forEach((id: string, idx: number) => {
          if (tripValues[idx]) {
            tripLookup[id] = tripValues[idx];
          }
        });
      } catch {
        // If mget fails, we proceed without trip data
        console.log("[TollReconciliation] mget for linked trips failed, proceeding without trip enrichment");
      }
    }

    // Enrich each reconciled toll with linked trip info
    const enriched = page.map((tx: any) => {
      const linkedTrip = tripLookup[tx.tripId];
      return {
        ...tx,
        linkedTrip: linkedTrip
          ? {
              id: linkedTrip.id,
              date: linkedTrip.date,
              tollCharges: linkedTrip.tollCharges || 0,
              pickupLocation: (linkedTrip.pickupLocation || "").substring(0, 40),
              dropoffLocation: (linkedTrip.dropoffLocation || "").substring(0, 40),
              platform: linkedTrip.platform || "Unknown",
              amount: linkedTrip.amount,
              requestTime: linkedTrip.requestTime || null,
              dropoffTime: linkedTrip.dropoffTime || null,
              driverName: linkedTrip.driverName || null,
            }
          : null,
      };
    });

    return c.json({
      success: true,
      data: enriched,
      total,
      limit,
      offset,
    });
  } catch (e: any) {
    console.log(
      `[TollReconciliation] GET /reconciled error: ${e.message}`,
    );
    return c.json({ error: e.message }, 500);
  }
});

// ─── Tag-ledger scoping helpers (mirror of client src/utils/tollTagLedger.ts) ──
// Keep in lockstep with the client classifier so the "Paid Via: Tag" column and
// the tag detail agree on what counts as tag activity.

/** Normalize a tag number for comparison (trim + strip leading zeros). */
function normTagServer(t: unknown): string {
  return (t ?? "").toString().trim().replace(/^0+/, "");
}

/**
 * True when a toll was paid OFF the tag (cash / card / fleet-account / legacy
 * cash category / receipt-backed) and is therefore NOT part of the tag ledger.
 * Operates on the merged tx shape (paymentMethod display strings + category).
 */
function serverIsOffTagToll(tx: any): boolean {
  const cat = (tx.category || "").toLowerCase();
  if (cat === "tolls" || cat === "toll") return true; // legacy cash category
  if (tx.receiptUrl) return true;
  const pm = (tx.paymentMethod || "").toLowerCase();
  if (pm.includes("cash") || pm.includes("card") || pm.includes("fleet") || pm.includes("account")) {
    return true;
  }
  return false;
}

/** True when a merged tx is linked to the given tag (by tollTagId UUID or tagNumber). */
function rowTagMatchesServer(tx: any, tagNumberNorm: string, tagId?: string): boolean {
  const meta = tx.metadata || {};
  if (tagId && meta.tollTagId && meta.tollTagId === tagId) return true;
  if (tagNumberNorm) {
    const txNum = normTagServer(meta.tagNumber || meta.tollTagId || "");
    if (txNum && txNum === tagNumberNorm) return true;
  }
  return false;
}

// ─── GET /toll-logs ────────────────────────────────────────────────────
// Canonical toll data endpoint. Returns ALL toll-category transactions
// with linked trip data pre-embedded. Supports filtering by vehicleId,
// tagNumber, driverId, and category. Used by useTollLogs, TollTagDetail,
// and TollTopupHistory.
//
// scope=tag (opt-in): returns the prepaid TAG LEDGER for a tag — tag-balance
// usage + top-ups/refunds — across every vehicle the tag was ever on (via the
// backfilled tollTagId/tagNumber), UNION the current vehicle's tag-ledger tolls
// (so un-backfilled data still shows — strictly a superset of the legacy view,
// no regression). Cash/card/fleet-account tolls are excluded.

app.get(`${BASE}/toll-logs`, async (c) => {
  try {
    // ── Parse query filters ──
    const vehicleId = c.req.query("vehicleId") || undefined;
    const tagNumber = c.req.query("tagNumber") || undefined;
    const tagId = c.req.query("tagId") || undefined;
    const scope = c.req.query("scope") || undefined;
    const driverId = c.req.query("driverId") || undefined;
    const category = c.req.query("category") || undefined;
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit"), 10) : undefined;
    const offset = parseInt(c.req.query("offset") || "0", 10);

    // ── Load toll transactions: ledger + legacy transaction:* (merged) ──
    let tollTx = await loadMergedTollTxArray();

    // ── Apply filters ──
    // For scope=tag, count this vehicle's off-tag tolls BEFORE they're filtered
    // out, so the tag detail can show its "paid off-tag" pointer.
    let offTagCount = 0;
    if (scope === "tag") {
      // Per-tag ledger scoping: tag-ledger rows linked to this tag (any vehicle)
      // UNION this vehicle's tag-ledger rows (covers not-yet-backfilled data).
      const tagNumberNorm = normTagServer(tagNumber);
      if (vehicleId) {
        offTagCount = tollTx.filter((tx: any) => tx.vehicleId === vehicleId && serverIsOffTagToll(tx)).length;
      }
      tollTx = tollTx.filter((tx: any) => {
        if (serverIsOffTagToll(tx)) return false;
        if (rowTagMatchesServer(tx, tagNumberNorm, tagId)) return true;
        if (vehicleId && tx.vehicleId === vehicleId) return true;
        return false;
      });
    } else {
      // Legacy behavior (unchanged): vehicle scope + tag filter with no-tag fallback.
      if (vehicleId) {
        tollTx = tollTx.filter((tx: any) => tx.vehicleId === vehicleId);
      }

      if (tagNumber) {
        const normalizedFilter = tagNumber.trim().replace(/^0+/, "");
        tollTx = tollTx.filter((tx: any) => {
          const txTag = (tx.metadata?.tollTagId || tx.metadata?.tagNumber || "")
            .toString()
            .trim()
            .replace(/^0+/, "");
          // Include if tag matches OR if no tag metadata (backwards compat)
          return txTag === normalizedFilter || !txTag;
        });
      }
    }

    if (driverId) {
      tollTx = tollTx.filter((tx: any) => tx.driverId === driverId);
    }

    if (category) {
      tollTx = tollTx.filter((tx: any) => tx.category === category);
    }

    // ── Sort by date descending, secondary by createdAt ──
    tollTx.sort((a: any, b: any) => {
      const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    // ── Record total before pagination ──
    const total = tollTx.length;

    // ── Apply pagination ──
    const page = limit ? tollTx.slice(offset, offset + limit) : tollTx;

    // ── Embed linked trip data ──
    const tripIds = [...new Set(page.map((tx: any) => tx.tripId).filter(Boolean))];
    const tripLookup: Record<string, any> = {};

    if (tripIds.length > 0) {
      const tripKeys = tripIds.map((id: string) => `trip:${id}`);
      try {
        const tripValues = await kv.mget(tripKeys);
        tripIds.forEach((id: string, idx: number) => {
          if (tripValues[idx]) {
            tripLookup[id] = tripValues[idx];
          }
        });
      } catch {
        console.log("[TollLogs] mget for linked trips failed, proceeding without trip enrichment");
      }
    }

    const enriched = page.map((tx: any) => {
      const linkedTrip = tx.tripId ? tripLookup[tx.tripId] || null : null;
      return {
        ...tx,
        linkedTrip: linkedTrip
          ? {
              id: linkedTrip.id,
              date: linkedTrip.date,
              platform: linkedTrip.platform || "Unknown",
              pickupLocation: linkedTrip.pickupLocation || "",
              dropoffLocation: linkedTrip.dropoffLocation || "",
              requestTime: linkedTrip.requestTime || null,
              dropoffTime: linkedTrip.dropoffTime || null,
              amount: linkedTrip.amount,
              tollCharges: linkedTrip.tollCharges || 0,
              driverId: linkedTrip.driverId || null,
              driverName: linkedTrip.driverName || null,
              vehicleId: linkedTrip.vehicleId || null,
              duration: linkedTrip.duration || null,
              distance: linkedTrip.distance || null,
              serviceType: linkedTrip.serviceType || null,
            }
          : null,
      };
    });

    const withTrips = enriched.filter((tx: any) => tx.linkedTrip !== null).length;
    console.log(
      `[TollLogs] GET /toll-logs: Loaded ${total} toll transactions (${withTrips} with linked trips)` +
        (vehicleId ? `, vehicleId=${vehicleId}` : "") +
        (tagNumber ? `, tagNumber=${tagNumber}` : "") +
        (driverId ? `, driverId=${driverId}` : "") +
        (category ? `, category=${category}` : ""),
    );

    return c.json({
      success: true,
      data: enriched,
      total,
      // scope=tag: how many of the vehicle's tolls were paid off-tag (excluded above).
      offTagCount,
      filters: { vehicleId: vehicleId || null, tagNumber: tagNumber || null, tagId: tagId || null, scope: scope || null, driverId: driverId || null, category: category || null },
    });
  } catch (e: any) {
    console.log(`[TollLogs] GET /toll-logs error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// TOLL LEDGER STORAGE LAYER (Phase 2 - Single Source of Truth)
// ═══════════════════════════════════════════════════════════════════════
// All toll data stored under `toll_ledger:{id}` prefix.
// These functions are the canonical CRUD operations for toll records.
// ═══════════════════════════════════════════════════════════════════════

// ── Types (mirrored from src/types/tollLedgerRecord.ts for Deno) ────────

type TollType = 'usage' | 'top_up' | 'refund' | 'adjustment' | 'balance_transfer';
type TollPaymentMethod = 'tag_balance' | 'cash' | 'card' | 'fleet_account';
type TollStatus = 'pending' | 'approved' | 'rejected' | 'reconciled' | 'resolved' | 'disputed';
type TollResolution = 'personal' | 'business' | 'write_off' | 'refunded';
type TollAuditAction = 'created' | 'updated' | 'reconciled' | 'unreconciled' | 'approved' | 'rejected' | 'resolved' | 'imported' | 'edited' | 'deleted';

interface TollAuditEntry {
  action: TollAuditAction;
  timestamp: string;
  userId?: string;
  userName?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}

interface TollLedgerRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  driverId: string | null;
  driverName: string | null;
  tollTagId: string | null;
  tagNumber: string | null;
  plaza: string | null;
  highway: string | null;
  location: string | null;
  date: string;
  time: string | null;
  type: TollType;
  amount: number;
  paymentMethod: TollPaymentMethod;
  status: TollStatus;
  resolution: TollResolution | null;
  isReconciled: boolean;
  tripId: string | null;
  matchConfidence: number | null;
  matchedAt: string | null;
  matchedBy: string | null;
  batchId: string | null;
  batchName: string | null;
  importedAt: string | null;
  sourceFile: string | null;
  receiptUrl: string | null;
  referenceNumber: string | null;
  description: string | null;
  notes: string | null;
  auditTrail: TollAuditEntry[];
  metadata: Record<string, unknown>;
  _legacyTransactionId?: string;
  // MOI-1: additive match-on-ingest fields. Optional/unset on every existing
  // row and every row written while matchOnIngestEnabled is off — nothing
  // reads these until the MOI-6 read-path switch, so populating them early
  // (MOI-3/MOI-4) is inert with respect to today's behavior.
  matchStatus?: "unmatched" | "matched" | "orphan_personal" | "ambiguous";
  matchedTripId?: string | null;
  matchConfidenceScore?: number | null;
  matchReasonCode?: string | null;
  lastMatchedAt?: string | null;
  // RWF-1: matchReasonCode alone can't distinguish a perfect match from an
  // underpaid one — reasonCode "ON_TRIP" is emitted for BOTH PERFECT_MATCH
  // and AMOUNT_VARIANCE (see findTollMatchesServer). This sibling field
  // persists the actual matchType so the workflow-stage classifier can tell
  // them apart. Additive/optional, same null-safe convention as the MOI-1 fields.
  matchTypeCode?: MatchType | null;
  // RWF-1: reverse pointer so a toll can answer "do I have a claim" without
  // scanning claim:* — set by the claim service (Phase B) when a claim is
  // created against this toll's transactionId.
  claimId?: string | null;
  // RWF-1: persisted, single-source-of-truth workflow position. Absence means
  // "not yet computed" (treated as needs_review by computeTollWorkflowStage's
  // callers), same convention as the MOI-1 fields above.
  workflowStage?: TollWorkflowStage;
  workflowStageUpdatedAt?: string | null;
  // Unlinked Apply provenance — nullable on legacy rows.
  unlinkedSourceTripId?: string | null;
  unlinkedSourcePlatform?: string | null;
  unlinkedAppliedAt?: string | null;
  unlinkedAppliedBy?: string | null;
  preUnlinkedTripId?: string | null;
}

interface TollLedgerFilters {
  vehicleId?: string;
  driverId?: string;
  tollTagId?: string;
  plaza?: string;
  highway?: string;
  type?: TollType;
  status?: TollStatus;
  resolution?: TollResolution;
  isReconciled?: boolean;
  dateFrom?: string;
  dateTo?: string;
  batchId?: string;
  search?: string;
}

// ── Toll Ledger KV Helpers ──────────────────────────────────────────────

const TOLL_LEDGER_PREFIX = "toll_ledger:";

/**
 * Save a toll ledger entry to KV store.
 */
async function saveTollLedgerEntry(entry: TollLedgerRecord): Promise<void> {
  // Validate required fields
  if (!entry.id) throw new Error("TollLedgerRecord.id is required");
  if (!entry.date) throw new Error("TollLedgerRecord.date is required");
  if (typeof entry.amount !== "number") throw new Error("TollLedgerRecord.amount must be a number");

  // Ensure timestamps
  const now = new Date().toISOString();
  if (!entry.createdAt) entry.createdAt = now;
  entry.updatedAt = now;

  // Normalize amount sign (usage = negative, top-up/refund = positive)
  if (entry.type === "usage" && entry.amount > 0) {
    entry.amount = -Math.abs(entry.amount);
  } else if ((entry.type === "top_up" || entry.type === "refund") && entry.amount < 0) {
    entry.amount = Math.abs(entry.amount);
  }

  await kv.set(`${TOLL_LEDGER_PREFIX}${entry.id}`, entry);
  console.log(`[TollLedgerStorage] Saved toll_ledger:${entry.id}`);

  try {
    const { fleetDualWriteToll } = await import("./unified_ledger_dual_write.ts");
    const orgId = typeof (entry as { organizationId?: string }).organizationId === "string"
      ? (entry as { organizationId: string }).organizationId
      : null;
    await fleetDualWriteToll({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      currency: entry.currency,
      driverId: entry.driverId,
      organizationId: orgId,
      vehicleId: entry.vehicleId,
      date: entry.date,
    });
  } catch (e) {
    console.error("[TollLedgerStorage] unified dual-write failed:", e);
  }
}

/**
 * Get a single toll ledger entry by ID.
 */
async function getTollLedgerEntry(id: string): Promise<TollLedgerRecord | null> {
  const entry = await kv.get(`${TOLL_LEDGER_PREFIX}${id}`);
  return entry as TollLedgerRecord | null;
}

/**
 * Update a toll ledger entry with partial data.
 * Automatically updates `updatedAt` and can append to audit trail.
 */
async function updateTollLedgerEntry(
  id: string,
  updates: Partial<TollLedgerRecord>,
  auditAction?: TollAuditAction,
  auditUserId?: string,
  auditUserName?: string
): Promise<TollLedgerRecord | null> {
  const existing = await getTollLedgerEntry(id);
  if (!existing) return null;

  const now = new Date().toISOString();

  // Track changes for audit
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(updates) as (keyof TollLedgerRecord)[]) {
    if (key === "auditTrail" || key === "updatedAt") continue;
    if (updates[key] !== existing[key]) {
      changes[key] = { from: existing[key], to: updates[key] };
    }
  }

  const updated: TollLedgerRecord = {
    ...existing,
    ...updates,
    updatedAt: now,
  };

  // Append audit entry if action provided
  if (auditAction && Object.keys(changes).length > 0) {
    updated.auditTrail = [
      ...(existing.auditTrail || []),
      {
        action: auditAction,
        timestamp: now,
        userId: auditUserId,
        userName: auditUserName,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      },
    ];
  }

  await saveTollLedgerEntry(updated);
  return updated;
}

/**
 * RWF-1: recompute a toll's persisted workflowStage and write it if changed.
 * Lives here (not a separate file) so it can call getTollLedgerEntry/
 * updateTollLedgerEntry directly without a circular import — other modules
 * (the Phase B claim service, dispute_refund_controller.tsx) import this
 * function from toll_controller.tsx the same way they already import
 * applyRefundResolution/isUnresolvedRefund below.
 *
 * Idempotent no-op if the computed stage matches what's already stored.
 * Never throws — a failure here must never break the caller's own write
 * (matching the MOI-3 contract above); it just leaves workflowStage stale
 * until the next recompute.
 */
async function recomputeAndPersistWorkflowStage(
  tollId: string,
  opts?: { claim?: { status: string; resolutionReason?: string | null } | null },
): Promise<void> {
  try {
    const entry = await getTollLedgerEntry(tollId);
    if (!entry) return;

    let claim = opts?.claim;
    if (claim === undefined) {
      claim = entry.claimId ? ((await kv.get(`claim:${entry.claimId}`)) as { status: string; resolutionReason?: string | null } | null) : null;
    }

    const stage = computeTollWorkflowStage({
      matchStatus: entry.matchStatus,
      matchTypeCode: entry.matchTypeCode,
      matchReasonCode: entry.matchReasonCode,
      resolution: entry.resolution,
      isReconciled: entry.isReconciled,
      claim,
    });

    if (stage === entry.workflowStage) return;
    await updateTollLedgerEntry(tollId, { workflowStage: stage, workflowStageUpdatedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error(`[TollWorkflowStage] recompute failed for toll ${tollId}:`, err?.message);
  }
}

/**
 * MOI-3: compute a toll's match at ingest time (right after it's created) and
 * persist the result onto the SAME row, instead of the read path recomputing
 * this from scratch on every GET /unreconciled call.
 *
 * NON-BREAKAGE: no-ops entirely unless `matchOnIngestEnabled` is on. Never
 * throws — a failure here must never break toll creation itself, it just
 * leaves the new match fields unset (today's status quo).
 *
 * Reuses the existing, unchanged `findTollMatchesServer` / `buildOrphanSuggestion`
 * logic — only the candidate-trip fetch changes (indexed ±2-day date range via
 * `findTripsInDateRange`, never driver/vehicle-gated — see toll_match_index.ts).
 * `matchedTripId` is only ever set for a real trip match (never for an
 * orphan-personal guess), preserving the existing "orphan never auto-links"
 * contract used throughout this file.
 */
async function computeTollMatchPatch(
  tollRecord: TollLedgerRecord,
  timezone: string,
  settings: RefundAutomationSettings,
): Promise<Partial<TollLedgerRecord>> {
  const now = new Date().toISOString();
  const txDate = getTransactionDateTime(tollRecord, timezone);
  if (!txDate) {
    return {
      matchStatus: "unmatched",
      matchedTripId: null,
      matchConfidenceScore: null,
      matchReasonCode: null,
      matchTypeCode: null,
      lastMatchedAt: now,
    };
  }

  const windowStart = new Date(txDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - 2);
  const windowEnd = new Date(txDate);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);
  const startDateStr = windowStart.toISOString().slice(0, 10);
  const endDateStr = windowEnd.toISOString().slice(0, 10);

  const trips = await findTripsInDateRange(startDateStr, endDateStr, {
    vehicleId: tollRecord.vehicleId || undefined,
  });

  const driverAliasMap = await getDriverAliasMap();
  const matches = findTollMatchesServer(tollRecord, trips, timezone, driverAliasMap);
  const best = matches[0];

  if (best) {
    const matchCandidates = matches.slice(0, 3).map((m) => ({
      tripId: m.tripId ?? null,
      confidenceScore: m.confidenceScore ?? null,
      matchType: m.matchType ?? null,
      timeDifferenceMinutes: m.timeDifferenceMinutes ?? null,
    }));

    if (best.isAmbiguous) {
      return {
        matchStatus: "ambiguous",
        matchedTripId: null,
        matchConfidenceScore: best.confidenceScore ?? null,
        matchReasonCode: best.reasonCode ?? null,
        matchTypeCode: best.matchType ?? null,
        lastMatchedAt: now,
        metadata: {
          ...tollRecord.metadata,
          isAmbiguous: true,
          matchCandidates,
        },
      };
    }

    return {
      matchStatus: "matched",
      matchedTripId: best.tripId || null,
      matchConfidenceScore: best.confidenceScore ?? null,
      matchReasonCode: best.reasonCode ?? null,
      matchTypeCode: best.matchType ?? null,
      lastMatchedAt: now,
      metadata: {
        ...tollRecord.metadata,
        isAmbiguous: false,
        matchCandidates,
      },
    };
  }
  if (settings.personalUseDetectionEnabled) {
    const orphan = buildOrphanSuggestion(tollRecord, trips, timezone, settings.orphanProximityMinutes);
    if (orphan) {
      return {
        matchStatus: "orphan_personal",
        matchedTripId: null,
        matchConfidenceScore: null,
        matchReasonCode: orphan.reasonCode,
        matchTypeCode: orphan.matchType ?? null,
        lastMatchedAt: now,
      };
    }
    return {
      matchStatus: "ambiguous",
      matchedTripId: null,
      matchConfidenceScore: null,
      matchReasonCode: null,
      matchTypeCode: null,
      lastMatchedAt: now,
    };
  }
  return {
    matchStatus: "unmatched",
    matchedTripId: null,
    matchConfidenceScore: null,
    matchReasonCode: null,
    matchTypeCode: null,
    lastMatchedAt: now,
  };
}

export async function computeAndPersistTollMatchOnIngest(
  tollRecord: TollLedgerRecord,
): Promise<void> {
  try {
    const settings = await getRefundAutomationSettings();
    if (!settings.matchOnIngestEnabled) return;

    const timezone = await getFleetTimezone();
    const patch = await computeTollMatchPatch(tollRecord, timezone, settings);

    // updateTollLedgerEntry re-reads the current row fresh before merging, so
    // passing only these 6 fields keeps this a scoped merge rather than a
    // whole-row overwrite — safe even if something else touched the row
    // in between.
    await updateTollLedgerEntry(tollRecord.id, patch, "updated", "system-match-on-ingest");
    await recomputeAndPersistWorkflowStage(tollRecord.id);
  } catch (err: any) {
    console.warn(
      `[MatchOnIngest] Failed to compute match for toll ${tollRecord.id}: ${err?.message}`,
    );
  }
}

/**
 * MOI-4: the late-trip fix. Called right after new/updated trips are saved.
 * Finds tolls in a narrow indexed date window around this trip batch that are
 * still just a suggestion (never formally resolved) and re-matches them now
 * that this trip exists — this is what catches "toll receipt uploaded weeks
 * before the matching trip was imported," triggered by the trip import
 * itself rather than a poll or a clock.
 *
 * `opts.persist` gates whether anything is actually written:
 *  - false (MOI-4a): compute + log only. Lets a real bulk backdated-import
 *    batch be sanity-checked for compute volume/CPU cost before any write
 *    path is live (this endpoint already hit Supabase's edge CPU limit once
 *    from an unbounded scan — see the /unreconciled auto-match comment).
 *  - true (MOI-4b): actually persist. A toll that was never formally
 *    resolved gets its match fields updated in place. A toll that WAS
 *    already formally resolved (approved/rejected/resolved, or has a
 *    `resolution`) is never silently touched — it only gets a
 *    `metadata.rematchCandidate` flag for a human to review (MOI-5).
 *
 * NON-BREAKAGE: no-ops entirely unless `matchOnIngestEnabled` is on. Never
 * throws — a failure here must never break trip creation itself.
 */
export async function reconsiderTollsForNewTrips(
  newTrips: any[],
  opts: { persist: boolean },
): Promise<{ scanned: number; wouldUpdate: number; wouldFlag: number }> {
  let scanned = 0;
  let wouldUpdate = 0;
  let wouldFlag = 0;

  try {
    const settings = await getRefundAutomationSettings();
    if (!settings.matchOnIngestEnabled) return { scanned, wouldUpdate, wouldFlag };
    if (!Array.isArray(newTrips) || newTrips.length === 0) return { scanned, wouldUpdate, wouldFlag };

    const timezone = await getFleetTimezone();

    // Bucket trips by calendar week rather than taking one min→max window for
    // the whole batch — a single bulk/historical import call can legitimately
    // contain trips spanning many months (confirmed: trip.date is client-
    // supplied and unbounded), and one giant window would pull in nearly the
    // entire toll_ledger table, reintroducing the exact unbounded-scan
    // problem (HTTP 546) this project exists to fix. Each week's tolls are
    // still fetched with one indexed query per bucket, so a normal weekly
    // import (the common case) is still just one or two queries total.
    const MAX_WEEK_BUCKETS = 20; // ~5 months of weekly batches per call
    const tripsByWeek = new Map<string, any[]>();
    for (const trip of newTrips) {
      const d = getTransactionDateTime(trip, timezone);
      if (!d) continue;
      // Monday-anchored week key (UTC), consistent regardless of which day
      // within the week a given trip falls on.
      const dow = (d.getUTCDay() + 6) % 7; // 0=Mon .. 6=Sun
      const monday = new Date(d);
      monday.setUTCDate(monday.getUTCDate() - dow);
      const weekKey = monday.toISOString().slice(0, 10);
      const bucket = tripsByWeek.get(weekKey);
      if (bucket) bucket.push(trip);
      else tripsByWeek.set(weekKey, [trip]);
    }

    const weekKeys = [...tripsByWeek.keys()];
    if (weekKeys.length > MAX_WEEK_BUCKETS) {
      console.warn(
        `[MatchOnIngest] Trip batch spans ${weekKeys.length} weeks (cap ${MAX_WEEK_BUCKETS}) — ` +
          `skipping reverse re-match for this call to avoid an unbounded scan. A large historical ` +
          `backfill like this is better handled by the dedicated backfill job.`,
      );
      return { scanned, wouldUpdate, wouldFlag };
    }

    const driverAliasMap = await getDriverAliasMap();
    for (const [weekKey, weekTrips] of tripsByWeek) {
      const monday = new Date(`${weekKey}T00:00:00.000Z`);
      const windowStart = new Date(monday);
      windowStart.setUTCDate(windowStart.getUTCDate() - 2);
      const windowEnd = new Date(monday);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 9); // week (7d) + 2d trailing buffer
      const startDateStr = windowStart.toISOString().slice(0, 10);
      const endDateStr = windowEnd.toISOString().slice(0, 10);

      // Only tolls still just a suggestion — a formally resolved toll is
      // handled in the branch below (flagged, never silently rewritten).
      const candidateTolls = await findTollsInDateRange(startDateStr, endDateStr, {
        matchStatuses: ["unmatched", "orphan_personal", "ambiguous"],
      });

      for (const toll of candidateTolls) {
        scanned++;
        const matches = findTollMatchesServer(toll, weekTrips, timezone, driverAliasMap);
        const best = matches[0];
        if (!best) continue;

        const isFormallyResolved =
          toll.status === "approved" ||
          toll.status === "rejected" ||
          toll.status === "resolved" ||
          !!toll.resolution;

        if (isFormallyResolved) {
          wouldFlag++;
          if (opts.persist) {
            // Re-fetch fresh right before writing — metadata is a shared
            // object other flows also write to, so merging onto the
            // batch-scanned (possibly stale) copy risks clobbering an
            // unrelated concurrent change.
            const fresh = await getTollLedgerEntry(toll.id);
            if (fresh) {
              await updateTollLedgerEntry(
                toll.id,
                {
                  metadata: {
                    ...(fresh.metadata || {}),
                    rematchCandidate: {
                      tripId: best.tripId,
                      confidenceScore: best.confidenceScore ?? null,
                      detectedAt: new Date().toISOString(),
                    },
                  },
                },
                "updated",
                "system-match-on-ingest",
              );
            }
          } else {
            console.log(
              `[MatchOnIngest] Would flag resolved toll ${toll.id} as rematch candidate (trip ${best.tripId}, score ${best.confidenceScore})`,
            );
          }
        } else {
          wouldUpdate++;
          if (opts.persist) {
            await updateTollLedgerEntry(
              toll.id,
              {
                matchStatus: "matched",
                matchedTripId: best.tripId || null,
                matchConfidenceScore: best.confidenceScore ?? null,
                matchReasonCode: best.reasonCode ?? null,
                matchTypeCode: best.matchType ?? null,
                lastMatchedAt: new Date().toISOString(),
              },
              "updated",
              "system-match-on-ingest",
            );
            await recomputeAndPersistWorkflowStage(toll.id);
          } else {
            console.log(
              `[MatchOnIngest] Would update unresolved toll ${toll.id} to matched (trip ${best.tripId}, score ${best.confidenceScore})`,
            );
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[MatchOnIngest] reconsiderTollsForNewTrips failed: ${err?.message}`);
  }

  console.log(
    `[MatchOnIngest] reconsiderTollsForNewTrips: scanned=${scanned} wouldUpdate=${wouldUpdate} wouldFlag=${wouldFlag} persist=${opts.persist}`,
  );
  return { scanned, wouldUpdate, wouldFlag };
}

/**
 * MOI-4 (trip deleted/edited): keep the NEW `matchedTripId` suggestion field
 * consistent when the trip it points to disappears or is re-synced with a
 * different date. Scope note: this only touches the additive suggestion
 * fields introduced by this project (`matchStatus`/`matchedTripId`/etc) — it
 * never touches the pre-existing `tripId` reconciliation field, which has
 * its own established lifecycle via /reconcile and /unreconcile and is
 * completely untouched by this project. So the worst case of NOT running
 * this is a stale suggestion badge, never a financial inconsistency.
 *
 * Pass `currentTrip: undefined` for a delete (nothing can still match).
 * Pass the freshly-saved trip for an edit (re-validates the existing match
 * against the trip's current date/time).
 */
export async function invalidateStaleTollMatchesForTrip(
  tripId: string,
  opts: { persist: boolean; currentTrip?: any },
): Promise<{ scanned: number; invalidated: number; flagged: number }> {
  let scanned = 0;
  let invalidated = 0;
  let flagged = 0;

  try {
    const settings = await getRefundAutomationSettings();
    if (!settings.matchOnIngestEnabled) return { scanned, invalidated, flagged };

    const pointingTolls = await findTollsByMatchedTripId(tripId);
    if (pointingTolls.length === 0) return { scanned, invalidated, flagged };

    const timezone = await getFleetTimezone();
    const driverAliasMap = await getDriverAliasMap();

    for (const toll of pointingTolls) {
      scanned++;

      const stillValid =
        !!opts.currentTrip &&
        findTollMatchesServer(toll, [opts.currentTrip], timezone, driverAliasMap).some((m) => m.tripId === tripId);
      if (stillValid) continue;

      const isFormallyResolved =
        toll.status === "approved" ||
        toll.status === "rejected" ||
        toll.status === "resolved" ||
        !!toll.resolution;

      if (isFormallyResolved) {
        flagged++;
        if (opts.persist) {
          const fresh = await getTollLedgerEntry(toll.id);
          if (fresh) {
            await updateTollLedgerEntry(
              toll.id,
              {
                metadata: {
                  ...(fresh.metadata || {}),
                  rematchCandidate: {
                    tripId: null,
                    reason: "matched_trip_deleted_or_moved",
                    detectedAt: new Date().toISOString(),
                  },
                },
              },
              "updated",
              "system-match-on-ingest",
            );
          }
        } else {
          console.log(
            `[MatchOnIngest] Would flag resolved toll ${toll.id} — its matched trip ${tripId} was deleted/moved`,
          );
        }
      } else {
        invalidated++;
        if (opts.persist) {
          await updateTollLedgerEntry(
            toll.id,
            {
              matchStatus: "unmatched",
              matchedTripId: null,
              matchConfidenceScore: null,
              matchReasonCode: null,
              matchTypeCode: null,
              lastMatchedAt: new Date().toISOString(),
            },
            "updated",
            "system-match-on-ingest",
          );
          await recomputeAndPersistWorkflowStage(toll.id);
        } else {
          console.log(
            `[MatchOnIngest] Would clear unresolved toll ${toll.id} — its matched trip ${tripId} was deleted/moved`,
          );
        }
      }
    }
  } catch (err: any) {
    console.warn(
      `[MatchOnIngest] invalidateStaleTollMatchesForTrip failed for trip ${tripId}: ${err?.message}`,
    );
  }

  return { scanned, invalidated, flagged };
}

/**
 * Delete a toll ledger entry.
 */
async function deleteTollLedgerEntry(id: string): Promise<boolean> {
  const existing = await getTollLedgerEntry(id);
  if (!existing) return false;
  await kv.del(`${TOLL_LEDGER_PREFIX}${id}`);
  try {
    await deleteCanonicalLedgerBySource("transaction", [id]);
  } catch (e: any) {
    console.warn(`[TollLedgerStorage] Ledger cleanup failed (non-fatal) toll_ledger=${id}:`, e?.message);
  }
  console.log(`[TollLedgerStorage] Deleted toll_ledger:${id}`);
  return true;
}

/**
 * Get all toll ledger entries.
 */
async function getAllTollLedgerEntries(): Promise<TollLedgerRecord[]> {
  const entries = await kv.getByPrefix(TOLL_LEDGER_PREFIX);
  return (entries || []).filter(Boolean) as TollLedgerRecord[];
}

/**
 * Query toll ledger entries with filters.
 */
async function queryTollLedgerEntries(filters: TollLedgerFilters): Promise<TollLedgerRecord[]> {
  const all = await getAllTollLedgerEntries();

  return all.filter((entry) => {
    // Vehicle filter
    if (filters.vehicleId && entry.vehicleId !== filters.vehicleId) return false;

    // Driver filter
    if (filters.driverId && entry.driverId !== filters.driverId) return false;

    // Tag filter
    if (filters.tollTagId && entry.tollTagId !== filters.tollTagId) return false;

    // Plaza filter (partial match)
    if (filters.plaza && !entry.plaza?.toLowerCase().includes(filters.plaza.toLowerCase())) return false;

    // Highway filter
    if (filters.highway && entry.highway !== filters.highway) return false;

    // Type filter
    if (filters.type && entry.type !== filters.type) return false;

    // Status filter
    if (filters.status && entry.status !== filters.status) return false;

    // Resolution filter
    if (filters.resolution && entry.resolution !== filters.resolution) return false;

    // Reconciled filter
    if (filters.isReconciled !== undefined && entry.isReconciled !== filters.isReconciled) return false;

    // Date range filter
    if (filters.dateFrom && entry.date < filters.dateFrom) return false;
    if (filters.dateTo && entry.date > filters.dateTo) return false;

    // Batch filter
    if (filters.batchId && entry.batchId !== filters.batchId) return false;

    // Free text search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const searchableFields = [
        entry.plaza,
        entry.highway,
        entry.location,
        entry.driverName,
        entry.vehiclePlate,
        entry.tagNumber,
        entry.description,
        entry.notes,
        entry.referenceNumber,
      ].filter(Boolean).map((s) => s!.toLowerCase());

      if (!searchableFields.some((f) => f.includes(searchLower))) return false;
    }

    return true;
  });
}

/**
 * Convert a FinancialTransaction (toll category) to TollLedgerRecord.
 * Server-side version of transactionToTollLedger().
 */
function transactionToTollLedgerServer(tx: any): TollLedgerRecord {
  const now = new Date().toISOString();
  const dateOnly =
    typeof tx.date === "string" && tx.date.includes("T")
      ? tx.date.slice(0, 10)
      : tx.date;

  // Determine toll type
  const category = (tx.category || "").toLowerCase();
  const isTopUp = category.includes("top") || category.includes("credit") || tx.amount > 0;
  const isRefund = category.includes("refund");
  const type: TollType = isRefund ? "refund" : isTopUp ? "top_up" : "usage";

  // Determine payment method
  const pm = (tx.paymentMethod || "").toLowerCase();
  let paymentMethod: TollPaymentMethod = "tag_balance";
  if (pm.includes("cash")) paymentMethod = "cash";
  else if (pm.includes("card")) paymentMethod = "card";
  else if (pm.includes("fleet") || pm.includes("account")) paymentMethod = "fleet_account";

  // Determine status
  let status: TollStatus = "pending";
  const txStatus = (tx.status || "").toLowerCase();
  if (txStatus === "approved") status = "approved";
  else if (txStatus === "rejected") status = "rejected";
  else if (tx.isReconciled) status = "reconciled";
  else if (txStatus === "completed" || txStatus === "resolved") status = "resolved";

  // Extract resolution
  let resolution: TollResolution | null = null;
  const metaResolution = tx.metadata?.resolution as string | undefined;
  if (metaResolution) {
    const r = metaResolution.toLowerCase();
    if (r === "personal") resolution = "personal";
    else if (r === "business") resolution = "business";
    else if (r.includes("write")) resolution = "write_off";
    else if (r.includes("refund")) resolution = "refunded";
  }

  return {
    id: tx.id,
    createdAt: tx.metadata?.createdAt || now,
    updatedAt: now,

    vehicleId: tx.vehicleId || null,
    vehiclePlate: tx.vehiclePlate || null,

    driverId: tx.driverId || null,
    driverName: tx.driverName || null,

    tollTagId: tx.metadata?.tollTagUuid || tx.metadata?.tollTagId || null,
    tagNumber: tx.metadata?.tagNumber || null,

    plaza: tx.vendor || tx.metadata?.tollPlaza || null,
    highway: tx.metadata?.highway || null,
    location: tx.vendor || tx.description || null,

    // Canonical: store date-only (YYYY-MM-DD) to avoid timezone/day-shift issues
    date: dateOnly,
    time: tx.time || null,
    type,
    amount: tx.amount,
    paymentMethod,

    status,
    resolution,
    isReconciled: tx.isReconciled || false,

    tripId: tx.tripId || null,
    matchConfidence: tx.metadata?.matchConfidence || null,
    matchedAt: tx.metadata?.reconciledAt || null,
    matchedBy: tx.metadata?.reconciledBy || null,

    batchId: tx.batchId || null,
    batchName: tx.batchName || null,
    importedAt: tx.metadata?.importedAt || null,
    sourceFile: tx.metadata?.sourceFile || null,

    receiptUrl: tx.receiptUrl || null,
    referenceNumber: tx.referenceNumber || null,
    description: tx.description || null,
    notes: tx.notes || null,

    auditTrail: [{
      action: "imported",
      timestamp: now,
      metadata: { source: "migration", originalCategory: tx.category },
    }],

    metadata: tx.metadata || {},

    _legacyTransactionId: tx.id,
  };
}

// ── Toll Ledger Test Endpoint ───────────────────────────────────────────

app.get(`${BASE}/toll-ledger/test`, async (c) => {
  try {
    const testId = `test-${Date.now()}`;
    const now = new Date().toISOString();

    // Create test entry
    const testEntry: TollLedgerRecord = {
      id: testId,
      createdAt: now,
      updatedAt: now,
      vehicleId: "test-vehicle",
      vehiclePlate: "TEST-001",
      driverId: "test-driver",
      driverName: "Test Driver",
      tollTagId: null,
      tagNumber: null,
      plaza: "Test Plaza",
      highway: "Test Highway",
      location: "Test Location",
      date: now.split("T")[0],
      time: now.split("T")[1].split(".")[0],
      type: "usage",
      amount: -100,
      paymentMethod: "tag_balance",
      status: "pending",
      resolution: null,
      isReconciled: false,
      tripId: null,
      matchConfidence: null,
      matchedAt: null,
      matchedBy: null,
      batchId: null,
      batchName: null,
      importedAt: null,
      sourceFile: null,
      receiptUrl: null,
      referenceNumber: null,
      description: "Test toll entry",
      notes: null,
      auditTrail: [{ action: "created", timestamp: now }],
      metadata: { test: true },
    };

    // Save
    await saveTollLedgerEntry(testEntry);

    // Read
    const readEntry = await getTollLedgerEntry(testId);
    if (!readEntry) {
      return c.json({ error: "Failed to read test entry after save" }, 500);
    }

    // Update
    const updated = await updateTollLedgerEntry(
      testId,
      { status: "approved", notes: "Updated in test" },
      "updated",
      "test-user",
      "Test User"
    );
    if (!updated) {
      return c.json({ error: "Failed to update test entry" }, 500);
    }

    // Query
    const queryResults = await queryTollLedgerEntries({ vehicleId: "test-vehicle" });

    // Delete
    const deleted = await deleteTollLedgerEntry(testId);
    if (!deleted) {
      return c.json({ error: "Failed to delete test entry" }, 500);
    }

    // Verify deletion
    const afterDelete = await getTollLedgerEntry(testId);

    return c.json({
      success: true,
      message: "Toll ledger storage layer test passed",
      results: {
        created: testEntry.id,
        read: readEntry?.id === testId,
        updated: updated?.status === "approved" && updated?.auditTrail.length === 2,
        queryFound: queryResults.some((e) => e.id === testId),
        deleted: deleted && !afterDelete,
      },
    });
  } catch (e: any) {
    console.error(`[TollLedgerTest] Error: ${e.message}`);
    return c.json({ error: e.message, stack: e.stack }, 500);
  }
});

// ── Toll Ledger Stats Endpoint ──────────────────────────────────────────

app.get(`${BASE}/toll-ledger/stats`, async (c) => {
  try {
    const all = await getAllTollLedgerEntries();

    const stats = {
      total: all.length,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byPaymentMethod: {} as Record<string, number>,
      reconciled: all.filter((e) => e.isReconciled).length,
      unreconciled: all.filter((e) => !e.isReconciled).length,
      totalAmount: all.reduce((sum, e) => sum + e.amount, 0),
    };

    for (const entry of all) {
      stats.byStatus[entry.status] = (stats.byStatus[entry.status] || 0) + 1;
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      stats.byPaymentMethod[entry.paymentMethod] = (stats.byPaymentMethod[entry.paymentMethod] || 0) + 1;
    }

    return c.json({ success: true, stats });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1 (Fix): Toll Ledger Backups + Date Repair Backfill
// ═══════════════════════════════════════════════════════════════════════

/** Exported for alias routes on main app (`index.tsx` → `/ledger/toll-ledger-*`). */
export async function buildTollLedgerFullBackupPayload() {
  const all = await getAllTollLedgerEntries();
  all.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    count: all.length,
    earliest: all[0]?.date || null,
    latest: all[all.length - 1]?.date || null,
    entries: all,
  };
}

export type TollLedgerRepairDatesResults = {
  dryRun: boolean;
  fleetTz: string;
  totalLedger: number;
  checked: number;
  legacyFound: number;
  toUpdate: number;
  updated: number;
  skipped: number;
  errors: number;
  samples: Array<{ id: string; from: string; to: string }>;
};

/**
 * Repairs toll_ledger.date values by comparing against legacy transaction:${id} when present.
 * Body: dryRun (default true), batchSize (default 200, max 500).
 */
export async function executeTollLedgerRepairDates(body: {
  dryRun?: boolean;
  batchSize?: number;
}): Promise<TollLedgerRepairDatesResults> {
  const dryRun = body?.dryRun !== false;
  const batchSize = Math.min(Number(body?.batchSize) || 200, 500);

  const fleetTz = await getFleetTimezone();
  const ledgerEntries = await getAllTollLedgerEntries();

  const results: TollLedgerRepairDatesResults = {
    dryRun,
    fleetTz,
    totalLedger: ledgerEntries.length,
    checked: 0,
    legacyFound: 0,
    toUpdate: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    samples: [],
  };

  for (let i = 0; i < ledgerEntries.length; i += batchSize) {
    const batch = ledgerEntries.slice(i, i + batchSize);
    const legacyKeys = batch.map((e) => `transaction:${e.id}`);
    const legacyTxs = await kv.mget(legacyKeys).catch(() => []);

    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j];
      results.checked++;

      const legacy = legacyTxs?.[j];
      if (!legacy) {
        results.skipped++;
        continue;
      }
      results.legacyFound++;

      if (!isTollCategory(legacy?.category)) {
        results.skipped++;
        continue;
      }

      const canonical = deriveCanonicalDateFromLegacyTx(legacy, fleetTz);
      if (!canonical) {
        results.errors++;
        continue;
      }

      if (entry.date !== canonical) {
        results.toUpdate++;
        if (results.samples.length < 25) {
          results.samples.push({ id: entry.id, from: entry.date, to: canonical });
        }
        if (!dryRun) {
          await updateTollLedgerEntry(entry.id, { date: canonical }, "updated", "system", "Repair Dates");
          results.updated++;
        }
      }
    }
  }

  return results;
}

/**
 * Backup ALL toll_ledger:* records as JSON (download).
 * This is separate from the legacy transaction:* toll backup.
 */
app.get(`${BASE}/toll-ledger/backup-ledger`, async (c) => {
  try {
    const backup = await buildTollLedgerFullBackupPayload();
    const filename = `toll_ledger_backup_${new Date().toISOString().split("T")[0]}.json`;
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    return c.json(backup);
  } catch (e: any) {
    console.log(`[TollLedgerBackup] Error (ledger): ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Repairs toll_ledger.date values by comparing against legacy transaction:${id} when present.
 * This specifically targets the “same time, wrong day” issue caused by inconsistent date formats/timezones.
 *
 * Body:
 *  - dryRun?: boolean (default true)
 *  - batchSize?: number (default 200, max 500)
 */
app.post(`${BASE}/toll-ledger/repair-dates`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const results = await executeTollLedgerRepairDates(body);
    return c.json({ success: true, results });
  } catch (e: any) {
    console.log(`[TollLedgerRepairDates] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /toll-ledger/sync-check ─────────────────────────────────────────
// Compares transaction:* toll records with toll_ledger:* to detect drift.
// Returns mismatches for monitoring and debugging dual-write consistency.

app.get(`${BASE}/toll-ledger/sync-check`, async (c) => {
  try {
    // Load all toll transactions from transaction:* store
    const allTx = await kv.getByPrefix("transaction:");
    const tollTxMap = new Map<string, any>();
    for (const tx of allTx || []) {
      if (tx && isTollCategory(tx.category)) {
        tollTxMap.set(tx.id, tx);
      }
    }

    // Load all toll ledger entries
    const tollLedgerEntries = await getAllTollLedgerEntries();
    const tollLedgerMap = new Map<string, TollLedgerRecord>();
    for (const entry of tollLedgerEntries) {
      tollLedgerMap.set(entry.id, entry);
    }

    // Compare
    const missingInLedger: string[] = [];
    const missingInTx: string[] = [];
    const statusMismatch: { id: string; txStatus: string; ledgerStatus: string }[] = [];
    const amountMismatch: { id: string; txAmount: number; ledgerAmount: number }[] = [];

    // Check for txs missing in toll ledger
    for (const [id, tx] of tollTxMap) {
      const ledgerEntry = tollLedgerMap.get(id);
      if (!ledgerEntry) {
        missingInLedger.push(id);
        continue;
      }

      // Check status alignment
      const txStatusNorm = (tx.status || "pending").toLowerCase();
      const ledgerStatusNorm = ledgerEntry.status;
      const statusMatch =
        (txStatusNorm === "approved" && (ledgerStatusNorm === "approved" || ledgerStatusNorm === "resolved")) ||
        (txStatusNorm === "rejected" && ledgerStatusNorm === "rejected") ||
        (txStatusNorm === "pending" && ledgerStatusNorm === "pending") ||
        (txStatusNorm === "completed" && (ledgerStatusNorm === "resolved" || ledgerStatusNorm === "reconciled")) ||
        (tx.isReconciled && ledgerStatusNorm === "reconciled");

      if (!statusMatch) {
        statusMismatch.push({ id, txStatus: tx.status || "Pending", ledgerStatus: ledgerEntry.status });
      }

      // Check amount
      if (Math.abs(tx.amount - ledgerEntry.amount) > 0.01) {
        amountMismatch.push({ id, txAmount: tx.amount, ledgerAmount: ledgerEntry.amount });
      }
    }

    // Check for ledger entries missing in tx store (orphans)
    for (const [id] of tollLedgerMap) {
      if (!tollTxMap.has(id)) {
        missingInTx.push(id);
      }
    }

    const inSync = missingInLedger.length === 0 && missingInTx.length === 0 &&
      statusMismatch.length === 0 && amountMismatch.length === 0;

    return c.json({
      success: true,
      inSync,
      summary: {
        totalTollTransactions: tollTxMap.size,
        totalTollLedgerEntries: tollLedgerMap.size,
        missingInLedger: missingInLedger.length,
        missingInTx: missingInTx.length,
        statusMismatch: statusMismatch.length,
        amountMismatch: amountMismatch.length,
      },
      details: {
        missingInLedger: missingInLedger.slice(0, 50), // Limit for response size
        missingInTx: missingInTx.slice(0, 50),
        statusMismatch: statusMismatch.slice(0, 50),
        amountMismatch: amountMismatch.slice(0, 50),
      },
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /toll-ledger/sync-check error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 4: Backfill Historical Data
// ═══════════════════════════════════════════════════════════════════════

// ─── GET /toll-ledger/backup ─────────────────────────────────────────────
// Creates a JSON backup of ALL toll transactions before migration.
// REQUIRED: Download and verify this backup before running backfill.

app.get(`${BASE}/toll-ledger/backup`, async (c) => {
  try {
    console.log("[TollLedgerBackup] Starting backup of all toll transactions...");
    
    // Load all transactions
    const allTx = await kv.getByPrefix("transaction:");
    const tollTransactions: any[] = [];
    
    for (const tx of allTx || []) {
      if (tx && isTollCategory(tx.category)) {
        tollTransactions.push(tx);
      }
    }

    // Sort by date for easier verification
    tollTransactions.sort((a, b) => {
      const dateA = a.date || a.createdAt || "";
      const dateB = b.date || b.createdAt || "";
      return dateA.localeCompare(dateB);
    });

    // Compute stats
    const dateRange = {
      earliest: tollTransactions[0]?.date || "N/A",
      latest: tollTransactions[tollTransactions.length - 1]?.date || "N/A",
    };
    const totalAmount = tollTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    
    const backup = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      count: tollTransactions.length,
      dateRange,
      totalAmount: Number(totalAmount.toFixed(2)),
      transactions: tollTransactions,
    };

    console.log(`[TollLedgerBackup] Backup complete: ${tollTransactions.length} toll transactions, date range: ${dateRange.earliest} to ${dateRange.latest}`);

    // Return as JSON with download headers
    const filename = `toll_backup_${new Date().toISOString().split("T")[0]}.json`;
    c.header("Content-Type", "application/json");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    
    return c.json(backup);
  } catch (e: any) {
    console.log(`[TollLedgerBackup] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /toll-ledger/backfill ──────────────────────────────────────────
// Migrates existing toll transactions from transaction:* to toll_ledger:*.
// Supports dry-run mode and batch processing.

app.post(`${BASE}/toll-ledger/backfill`, async (c) => {
  try {
    const body = await c.req.json();
    const dryRun = body.dryRun !== false; // Default to dry-run for safety
    const batchSize = Math.min(body.batchSize || 100, 500); // Cap at 500
    const startDate = body.startDate; // Optional filter
    const skipExisting = body.skipExisting !== false; // Default to skip existing

    console.log(`[TollLedgerBackfill] Starting backfill: dryRun=${dryRun}, batchSize=${batchSize}, startDate=${startDate || "all"}`);

    // Load all toll transactions
    const allTx = await kv.getByPrefix("transaction:");
    const tollTransactions: any[] = [];
    
    for (const tx of allTx || []) {
      if (tx && isTollCategory(tx.category)) {
        // Apply date filter if specified
        if (startDate && tx.date && tx.date < startDate) continue;
        tollTransactions.push(tx);
      }
    }

    console.log(`[TollLedgerBackfill] Found ${tollTransactions.length} toll transactions to process`);

    // Load existing toll ledger entries to check for duplicates
    const existingLedger = await getAllTollLedgerEntries();
    const existingIds = new Set(existingLedger.map(e => e.id));

    const results = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [] as string[],
    };

    // Process in batches
    for (let i = 0; i < tollTransactions.length; i += batchSize) {
      const batch = tollTransactions.slice(i, i + batchSize);
      
      for (const tx of batch) {
        results.processed++;

        try {
          // Check if already exists
          if (skipExisting && existingIds.has(tx.id)) {
            results.skipped++;
            continue;
          }

          // Convert to toll ledger format
          const tollRecord = transactionToTollLedgerServer(tx);
          
          // Add backfill audit entry
          const auditEntry: TollAuditEntry = {
            action: "imported",
            timestamp: new Date().toISOString(),
            userId: "system",
            userName: "Backfill Migration",
            metadata: {
              source: "backfill",
              originalTransactionId: tx.id,
              dryRun,
            },
          };
          tollRecord.auditTrail = [auditEntry];
          
          // Validate required fields
          if (!tollRecord.id) {
            results.errors++;
            results.errorDetails.push(`Missing ID for transaction: ${JSON.stringify(tx).slice(0, 100)}`);
            continue;
          }
          if (!tollRecord.date) {
            // Try to extract date from other fields
            tollRecord.date = tx.createdAt?.split("T")[0] || new Date().toISOString().split("T")[0];
          }
          if (typeof tollRecord.amount !== "number" || isNaN(tollRecord.amount)) {
            tollRecord.amount = 0;
          }

          // Save (unless dry run)
          if (!dryRun) {
            await saveTollLedgerEntry(tollRecord);
            existingIds.add(tollRecord.id); // Track to avoid re-processing in same run
          }
          
          results.created++;
        } catch (err: any) {
          results.errors++;
          results.errorDetails.push(`Error processing ${tx.id}: ${err.message}`);
          if (results.errorDetails.length > 50) {
            results.errorDetails.push("... (truncated, too many errors)");
            break;
          }
        }
      }

      // Log progress every batch
      console.log(`[TollLedgerBackfill] Progress: ${results.processed}/${tollTransactions.length} processed, ${results.created} created, ${results.skipped} skipped, ${results.errors} errors`);
    }

    console.log(`[TollLedgerBackfill] Complete: ${JSON.stringify(results)}`);

    return c.json({
      success: true,
      dryRun,
      results,
      message: dryRun 
        ? "Dry run complete. Review results and re-run with dryRun=false to execute."
        : `Backfill complete: ${results.created} entries created.`,
    });
  } catch (e: any) {
    console.log(`[TollLedgerBackfill] Error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /toll-ledger/backfill/status ────────────────────────────────────
// Compares counts and identifies any missing entries after backfill.

app.get(`${BASE}/toll-ledger/backfill/status`, async (c) => {
  try {
    // Load all toll transactions
    const allTx = await kv.getByPrefix("transaction:");
    const tollTxMap = new Map<string, any>();
    for (const tx of allTx || []) {
      if (tx && isTollCategory(tx.category)) {
        tollTxMap.set(tx.id, tx);
      }
    }

    // Load all toll ledger entries
    const tollLedgerEntries = await getAllTollLedgerEntries();
    const tollLedgerIds = new Set(tollLedgerEntries.map(e => e.id));

    // Find missing entries
    const missingInLedger: string[] = [];
    for (const [id] of tollTxMap) {
      if (!tollLedgerIds.has(id)) {
        missingInLedger.push(id);
      }
    }

    // Compute stats by status/type for both stores
    const txByStatus: Record<string, number> = {};
    const ledgerByStatus: Record<string, number> = {};
    
    for (const tx of tollTxMap.values()) {
      const status = tx.status || "Pending";
      txByStatus[status] = (txByStatus[status] || 0) + 1;
    }
    for (const entry of tollLedgerEntries) {
      ledgerByStatus[entry.status] = (ledgerByStatus[entry.status] || 0) + 1;
    }

    const isComplete = missingInLedger.length === 0;

    return c.json({
      success: true,
      isComplete,
      counts: {
        transactionStore: tollTxMap.size,
        tollLedgerStore: tollLedgerEntries.size,
        missingInLedger: missingInLedger.length,
      },
      byStatus: {
        transactionStore: txByStatus,
        tollLedgerStore: ledgerByStatus,
      },
      missingIds: missingInLedger.slice(0, 100), // Limit for response size
      message: isComplete 
        ? "All toll transactions have been migrated to the toll ledger."
        : `${missingInLedger.length} toll transactions are missing from the toll ledger. Run backfill to complete migration.`,
    });
  } catch (e: any) {
    console.log(`[TollLedgerBackfill] GET /status error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// TAG IDENTITY BACKFILL (Phase 6) — link tag-ledger records to their tag
// ═══════════════════════════════════════════════════════════════════════
// Stamps tollTagId / tagNumber onto existing tag-ledger records from the tag's
// assignment history (date-aware), so scope=tag can show a tag's true lifetime
// activity across vehicle reassignments. Idempotent (only fills records missing
// tollTagId unless force); dry-run by default.

interface TagAssignmentWindow {
  tagId: string;
  tagNumber: string | null;
  vehicleId: string;
  start: number; // ms, inclusive
  end: number;   // ms, exclusive (Infinity = still assigned)
}

/** Build per-tag [assignedAt, unassignedAt) windows from assignment history. */
function buildTagAssignmentWindows(tags: any[]): TagAssignmentWindow[] {
  const windows: TagAssignmentWindow[] = [];
  for (const tag of tags) {
    if (!tag || typeof tag !== "object" || !tag.id) continue;
    const history = Array.isArray(tag.assignmentHistory) ? tag.assignmentHistory : [];
    if (history.length > 0) {
      for (const h of history) {
        if (!h || !h.vehicleId) continue;
        const start = h.assignedAt ? new Date(h.assignedAt).getTime() : 0;
        const end = h.unassignedAt ? new Date(h.unassignedAt).getTime() : Infinity;
        windows.push({
          tagId: tag.id,
          tagNumber: tag.tagNumber ?? null,
          vehicleId: h.vehicleId,
          start: isNaN(start) ? 0 : start,
          end: isNaN(end) ? Infinity : end,
        });
      }
    } else if (tag.assignedVehicleId) {
      // No history recorded — treat the current assignment as open-ended.
      const start = tag.createdAt ? new Date(tag.createdAt).getTime() : 0;
      windows.push({
        tagId: tag.id,
        tagNumber: tag.tagNumber ?? null,
        vehicleId: tag.assignedVehicleId,
        start: isNaN(start) ? 0 : start,
        end: Infinity,
      });
    }
  }
  return windows;
}

/** Canonical "belongs to the tag ledger" test on a RAW TollLedgerRecord. */
function rawIsTagLedger(entry: any): boolean {
  const type = entry?.type;
  if (type === "top_up" || type === "refund" || type === "adjustment" || type === "balance_transfer") {
    return true; // credits / adjustments to the tag balance
  }
  return entry?.paymentMethod === "tag_balance"; // usage drawn from the tag
}

/** Find the tag whose assignment window contains this entry (date-aware). */
function resolveTagForEntry(
  entry: any,
  windows: TagAssignmentWindow[],
): { window: TagAssignmentWindow | null; ambiguous: boolean } {
  if (!entry.vehicleId) return { window: null, ambiguous: false };
  const candidates = windows.filter((w) => w.vehicleId === entry.vehicleId);
  if (candidates.length === 0) return { window: null, ambiguous: false };
  const t = entry.date ? new Date(entry.date).getTime() : NaN;
  if (isNaN(t)) {
    // No usable date — only safe if the vehicle ever had exactly one tag.
    const uniqueTags = new Set(candidates.map((w) => w.tagId));
    return uniqueTags.size === 1 ? { window: candidates[0], ambiguous: false } : { window: null, ambiguous: true };
  }
  const inWindow = candidates.filter((w) => t >= w.start && t < w.end);
  if (inWindow.length === 0) return { window: null, ambiguous: false };
  const uniqueTags = new Set(inWindow.map((w) => w.tagId));
  return uniqueTags.size === 1 ? { window: inWindow[0], ambiguous: false } : { window: inWindow[0], ambiguous: true };
}

/** Compute what a tag backfill would do (shared by dry-run status + apply). */
async function computeTagBackfillPlan(force: boolean) {
  const tags = ((await kv.getByPrefix("toll_tag:")) || []).filter(Boolean);
  const windows = buildTagAssignmentWindows(tags);
  const entries = await getAllTollLedgerEntries();

  const plan = {
    totalLedger: entries.length,
    considered: 0, // tag-ledger records
    alreadyTagged: 0,
    toStamp: [] as Array<{ id: string; tollTagId: string; tagNumber: string | null }>,
    skippedNotTagLedger: 0,
    skippedNoVehicle: 0,
    unmatched: [] as string[], // tag-ledger + has vehicle, but no window matched
    ambiguous: [] as string[],
  };

  for (const e of entries) {
    if (!e || typeof e !== "object" || !e.id) continue;
    if (!rawIsTagLedger(e)) { plan.skippedNotTagLedger++; continue; }
    plan.considered++;
    if (!force && e.tollTagId) { plan.alreadyTagged++; continue; }
    if (!e.vehicleId) { plan.skippedNoVehicle++; continue; }
    const { window, ambiguous } = resolveTagForEntry(e, windows);
    if (ambiguous) { plan.ambiguous.push(e.id); continue; }
    if (!window) { plan.unmatched.push(e.id); continue; }
    plan.toStamp.push({ id: e.id, tollTagId: window.tagId, tagNumber: window.tagNumber });
  }
  return plan;
}

// ─── GET /toll-ledger/tag-backfill/status ─── read-only integrity report ──
app.get(`${BASE}/toll-ledger/tag-backfill/status`, async (c) => {
  try {
    const force = c.req.query("force") === "true";
    const plan = await computeTagBackfillPlan(force);
    return c.json({
      success: true,
      summary: {
        totalLedger: plan.totalLedger,
        tagLedgerRecords: plan.considered,
        alreadyLinked: plan.alreadyTagged,
        willLink: plan.toStamp.length,
        unresolvedNoWindow: plan.unmatched.length,
        unresolvedNoVehicle: plan.skippedNoVehicle,
        ambiguous: plan.ambiguous.length,
      },
      unmatchedSample: plan.unmatched.slice(0, 50),
      ambiguousSample: plan.ambiguous.slice(0, 50),
      message:
        `${plan.toStamp.length} tag-ledger record(s) can be linked; ` +
        `${plan.unmatched.length} unresolved (no assignment window), ` +
        `${plan.skippedNoVehicle} missing vehicleId, ${plan.ambiguous.length} ambiguous.`,
    });
  } catch (e: any) {
    console.log(`[TagBackfill] status error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /toll-ledger/tag-backfill ─── apply (dry-run by default) ────────
app.post(`${BASE}/toll-ledger/tag-backfill`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // default to dry-run for safety
    const force = body.force === true;    // re-stamp even if already linked
    const plan = await computeTagBackfillPlan(force);

    let linked = 0;
    const errors: string[] = [];
    if (!dryRun) {
      for (const item of plan.toStamp) {
        try {
          await updateTollLedgerEntry(
            item.id,
            { tollTagId: item.tollTagId, tagNumber: item.tagNumber ?? null },
            "updated",
            "system",
            "Tag Backfill",
          );
          linked++;
        } catch (err: any) {
          errors.push(`${item.id}: ${err.message}`);
          if (errors.length > 50) break;
        }
      }
    }

    console.log(`[TagBackfill] dryRun=${dryRun} force=${force} willLink=${plan.toStamp.length} linked=${linked} errors=${errors.length}`);
    return c.json({
      success: true,
      dryRun,
      summary: {
        tagLedgerRecords: plan.considered,
        alreadyLinked: plan.alreadyTagged,
        willLink: plan.toStamp.length,
        linked: dryRun ? 0 : linked,
        unresolvedNoWindow: plan.unmatched.length,
        unresolvedNoVehicle: plan.skippedNoVehicle,
        ambiguous: plan.ambiguous.length,
      },
      errors: errors.slice(0, 50),
      message: dryRun
        ? `Dry run: ${plan.toStamp.length} record(s) would be linked. Re-run with dryRun=false to apply.`
        : `Linked ${linked} record(s) to their tag.`,
    });
  } catch (e: any) {
    console.log(`[TagBackfill] error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /match-index/status (MOI-7) ─── read-only backfill preview ───────
// Historical tolls created before match-on-ingest existed have no
// matchStatus. This reports how many, without touching anything.
app.get(`${BASE}/match-index/status`, async (c) => {
  try {
    const all = (await loadAllByPrefix(TOLL_LEDGER_PREFIX)) as TollLedgerRecord[];
    const missing = all.filter((tx) => !tx.matchStatus);
    return c.json({
      success: true,
      totalTolls: all.length,
      missingMatchStatus: missing.length,
      sampleIds: missing.slice(0, 20).map((tx) => tx.id),
      message:
        missing.length > 0
          ? `${missing.length} of ${all.length} tolls have no matchStatus yet. POST /match-index/backfill (dryRun defaults true) to compute it.`
          : "Every toll already has a matchStatus — nothing to backfill.",
    });
  } catch (e: any) {
    console.log(`[MatchIndexBackfill] status error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /match-index/backfill (MOI-7) ─── apply (dry-run by default) ────
// Mirrors the tag-backfill convention exactly: dryRun defaults true,
// batched, capped error samples, and — since additive fields are only
// "harmless" if you can prove it — writes a small manifest of every id it
// touched so a bad run has a concrete undo path.
app.post(`${BASE}/match-index/backfill`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false; // default to dry-run for safety
    const batchSize = Math.max(1, Math.min(500, Number(body?.batchSize) || 100));

    const all = (await loadAllByPrefix(TOLL_LEDGER_PREFIX)) as TollLedgerRecord[];
    const missing = all.filter((tx) => !tx.matchStatus);
    const batch = missing.slice(0, batchSize);

    if (dryRun) {
      return c.json({
        success: true,
        dryRun: true,
        totalTolls: all.length,
        missingMatchStatus: missing.length,
        wouldProcess: batch.length,
        message:
          missing.length > 0
            ? `Dry run: would compute matchStatus for ${batch.length} of ${missing.length} missing tolls (batchSize=${batchSize}). Re-run with dryRun=false to apply.`
            : "Nothing to backfill — every toll already has a matchStatus.",
      });
    }

    const timezone = await getFleetTimezone();
    const settings = await getRefundAutomationSettings();
    const touchedIds: string[] = [];
    const errors: string[] = [];

    for (const tx of batch) {
      try {
        const patch = await computeTollMatchPatch(tx, timezone, settings);
        await updateTollLedgerEntry(tx.id, patch, "updated", "system", "Match-Index Backfill");
        touchedIds.push(tx.id);
      } catch (err: any) {
        errors.push(`${tx.id}: ${err.message}`);
        if (errors.length > 50) break;
      }
    }

    const manifestKey = `toll_backfill_run:${new Date().toISOString()}`;
    await kv.set(manifestKey, { touchedIds, at: new Date().toISOString(), errors });

    const remaining = missing.length - touchedIds.length;
    console.log(
      `[MatchIndexBackfill] processed=${touchedIds.length} remaining=${remaining} errors=${errors.length} manifest=${manifestKey}`,
    );
    return c.json({
      success: true,
      dryRun: false,
      processed: touchedIds.length,
      remaining,
      errors: errors.slice(0, 50),
      manifestKey,
      message:
        remaining > 0
          ? `Processed ${touchedIds.length}. Re-run to continue with the remaining ${remaining}.`
          : `Processed ${touchedIds.length}. Every toll now has a matchStatus.`,
    });
  } catch (e: any) {
    console.log(`[MatchIndexBackfill] backfill error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /workflow-stage/status (RWF-1) ─── read-only backfill preview ────
// Historical tolls (and tolls created before this field existed) have no
// workflowStage. This reports how many, without touching anything.
app.get(`${BASE}/workflow-stage/status`, async (c) => {
  try {
    const all = (await loadAllByPrefix(TOLL_LEDGER_PREFIX)) as TollLedgerRecord[];
    const missing = all.filter((tx) => !tx.workflowStage);
    return c.json({
      success: true,
      totalTolls: all.length,
      missingWorkflowStage: missing.length,
      sampleIds: missing.slice(0, 20).map((tx) => tx.id),
      message:
        missing.length > 0
          ? `${missing.length} of ${all.length} tolls have no workflowStage yet. POST /workflow-stage/backfill (dryRun defaults true) to compute it.`
          : "Every toll already has a workflowStage — nothing to backfill.",
    });
  } catch (e: any) {
    console.log(`[WorkflowStageBackfill] status error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /workflow-stage/backfill (RWF-1) ─── apply (dry-run by default) ──
// Mirrors the match-index/tag-backfill convention exactly: dryRun defaults
// true, batched, capped error samples, manifest of every id touched. Builds
// a one-time transactionId→claim reverse index (claim:* has no durable
// transactionId→claim lookup otherwise) since claimId is only populated on
// TollLedgerRecord going forward by the claim service (Phase B) — this is
// the one place that index gets built from a full claims scan instead.
app.post(`${BASE}/workflow-stage/backfill`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false; // default to dry-run for safety
    const batchSize = Math.max(1, Math.min(500, Number(body?.batchSize) || 100));

    const all = (await loadAllByPrefix(TOLL_LEDGER_PREFIX)) as TollLedgerRecord[];
    const missing = all.filter((tx) => !tx.workflowStage);
    const batch = missing.slice(0, batchSize);

    if (dryRun) {
      return c.json({
        success: true,
        dryRun: true,
        totalTolls: all.length,
        missingWorkflowStage: missing.length,
        wouldProcess: batch.length,
        message:
          missing.length > 0
            ? `Dry run: would compute workflowStage for ${batch.length} of ${missing.length} missing tolls (batchSize=${batchSize}). Re-run with dryRun=false to apply.`
            : "Nothing to backfill — every toll already has a workflowStage.",
      });
    }

    // One-time reverse index: transactionId → claim (only claims not yet
    // superseded by the toll's own claimId field, which post-Phase-B claims
    // populate directly).
    const allClaims = (await loadAllByPrefix("claim:")) as any[];
    const claimByTransactionId = new Map<string, any>();
    for (const cl of allClaims) {
      if (cl && typeof cl === "object" && cl.transactionId) {
        claimByTransactionId.set(cl.transactionId, cl);
      }
    }

    const touchedIds: string[] = [];
    const errors: string[] = [];

    for (const tx of batch) {
      try {
        const claim = claimByTransactionId.get(tx.id) ?? null;
        const stage = computeTollWorkflowStage({
          matchStatus: tx.matchStatus,
          matchTypeCode: tx.matchTypeCode,
          matchReasonCode: tx.matchReasonCode,
          resolution: tx.resolution,
          isReconciled: tx.isReconciled,
          claim,
        });
        const patch: Partial<TollLedgerRecord> = {
          workflowStage: stage,
          workflowStageUpdatedAt: new Date().toISOString(),
        };
        if (!tx.claimId && claim?.id) patch.claimId = claim.id;
        await updateTollLedgerEntry(tx.id, patch, "updated", "system", "Workflow-Stage Backfill");
        touchedIds.push(tx.id);
      } catch (err: any) {
        errors.push(`${tx.id}: ${err.message}`);
        if (errors.length > 50) break;
      }
    }

    const manifestKey = `toll_backfill_run:${new Date().toISOString()}`;
    await kv.set(manifestKey, { touchedIds, at: new Date().toISOString(), errors, kind: "workflow_stage" });

    const remaining = missing.length - touchedIds.length;
    console.log(
      `[WorkflowStageBackfill] processed=${touchedIds.length} remaining=${remaining} errors=${errors.length} manifest=${manifestKey}`,
    );
    return c.json({
      success: true,
      dryRun: false,
      processed: touchedIds.length,
      remaining,
      errors: errors.slice(0, 50),
      manifestKey,
      message:
        remaining > 0
          ? `Processed ${touchedIds.length}. Re-run to continue with the remaining ${remaining}.`
          : `Processed ${touchedIds.length}. Every toll now has a workflowStage.`,
    });
  } catch (e: any) {
    console.log(`[WorkflowStageBackfill] backfill error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3: Server-Side Reconciliation Actions (with ledger writes)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a toll-related audit ledger entry (now writes to canonical ledger_event:*).
 * Used for reconciliation audit trail entries.
 */
async function writeTollLedgerEntry(params: {
  eventType: string;
  category: string;
  description: string;
  grossAmount: number;
  netAmount: number;
  direction: "inflow" | "outflow" | "neutral";
  sourceType: string;
  sourceId: string;
  driverId: string;
  driverName: string;
  vehicleId?: string;
  date: string;
  metadata?: Record<string, any>;
}): Promise<string> {
  const id = crypto.randomUUID();
  const date = params.date?.split("T")[0] || new Date().toISOString().split("T")[0];
  
  // Write to canonical ledger_event:* instead of legacy ledger:%
  const canonicalEvent = {
    idempotencyKey: `toll_audit:${id}|${params.eventType}`,
    date,
    driverId: params.driverId || "unknown",
    eventType: params.eventType,
    direction: params.direction,
    netAmount: params.netAmount,
    grossAmount: params.grossAmount,
    currency: "JMD",
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    vehicleId: params.vehicleId,
    platform: "Roam",
    description: params.description,
    metadata: {
      ...params.metadata,
      category: params.category,
      driverName: params.driverName,
      auditEntryId: id,
    },
  };
  
  // Import appendCanonicalLedgerEvents dynamically to avoid circular deps
  const { appendCanonicalLedgerEvents } = await import("./ledger_canonical.ts");
  
  // Create a minimal context-like object for the append (no org scoping for audit entries)
  const mockContext = { get: () => undefined } as any;
  
  try {
    await appendCanonicalLedgerEvents([canonicalEvent], mockContext);
    console.log(
      `[TollLedger] Written ${params.eventType} canonical event for tx ${params.sourceId}`,
    );
  } catch (err) {
    console.error(`[TollLedger] Failed to write canonical event:`, err);
  }
  
  return id;
}

// ─── POST /reconcile ───────────────────────────────────────────────────

app.post(`${BASE}/reconcile`, async (c) => {
  try {
    const { transactionId, tripId } = await c.req.json();
    if (!transactionId || !tripId) {
      return c.json(
        { error: "Both transactionId and tripId are required" },
        400,
      );
    }

    // Phase 6: Read from toll_ledger (single source of truth)
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry) return c.json({ error: `Toll ${transactionId} not found` }, 404);

    // Convert to tx shape for response compatibility
    const tx = tollLedgerToTxShape(tollEntry);

    if (tollEntry.status === "reconciled" && tollEntry.tripId) {
      return c.json(
        { error: `Toll ${transactionId} is already reconciled to trip ${tollEntry.tripId}` },
        409,
      );
    }

    const trip = await kv.get(`trip:${tripId}`);
    if (!trip) return c.json({ error: `Trip ${tripId} not found` }, 404);

    // Phase 6: Write ONLY to toll_ledger (single source of truth)
    await updateTollLedgerEntry(
      transactionId,
      {
        status: "reconciled",
        tripId,
        isReconciled: true,
        driverId: trip.driverId || tx.driverId,
        driverName: trip.driverName || tx.driverName,
      },
      "reconciled",
      "admin"
    );
    await recomputeAndPersistWorkflowStage(transactionId);

    // Update local tx object for response (not persisted to transaction:*)
    tx.tripId = tripId;
    tx.isReconciled = true;
    tx.driverId = trip.driverId || tx.driverId;
    tx.driverName = trip.driverName || tx.driverName;

    // Write ledger entry
    await writeTollLedgerEntry({
      eventType: "toll_reconciled",
      category: "Toll Reconciliation",
      description: `Toll matched to trip: ${(trip.pickupLocation || "").substring(0, 30)} → ${(trip.dropoffLocation || "").substring(0, 30)}`,
      grossAmount: Math.abs(Number(tx.amount) || 0),
      netAmount: 0, // net-zero: expense offset by refund
      direction: "neutral",
      sourceType: "reconciliation",
      sourceId: transactionId,
      driverId: tx.driverId || trip.driverId || "unknown",
      driverName: tx.driverName || trip.driverName || "Unknown",
      vehicleId: tx.vehicleId || trip.vehicleId,
      date: tx.date,
      metadata: {
        tripId,
        matchedAt: new Date().toISOString(),
        matchedBy: "admin",
        tollAmount: Math.abs(Number(tx.amount) || 0),
        tripTollCharges: trip.tollCharges || 0,
      },
    });

    console.log(
      `[TollReconciliation] Reconciled tx ${transactionId} → trip ${tripId}`,
    );

    return c.json({
      success: true,
      data: {
        transaction: tx,
        trip,
      },
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /reconcile error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /unreconcile ─────────────────────────────────────────────────

app.post(`${BASE}/unreconcile`, async (c) => {
  try {
    const { transactionId } = await c.req.json();
    if (!transactionId) {
      return c.json({ error: "transactionId is required" }, 400);
    }

    // Phase 6: Read from toll_ledger (single source of truth)
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry) return c.json({ error: `Toll ${transactionId} not found` }, 404);

    // Convert to tx shape for response compatibility
    const tx = tollLedgerToTxShape(tollEntry);

    if (!tollEntry.tripId) {
      return c.json(
        { error: `Toll ${transactionId} has no linked trip to unreconcile` },
        400,
      );
    }

    const previousTripId = tollEntry.tripId;
    const previousTrip = await kv.get(`trip:${previousTripId}`);

    // Phase 6: Write ONLY to toll_ledger (single source of truth)
    // Include autoMatchOverridden flag if this was auto-matched
    const wasAutoMatched = tx.metadata?.reconciledBy === 'system-auto' || tx.metadata?.matchedBy === 'system-auto';
    await updateTollLedgerEntry(
      transactionId,
      {
        status: "pending",
        tripId: null,
        isReconciled: false,
        metadata: wasAutoMatched ? { autoMatchOverridden: true } : undefined,
      },
      "unreconciled",
      "admin"
    );
    await recomputeAndPersistWorkflowStage(transactionId);

    // Update local tx object for response (not persisted to transaction:*)
    tx.tripId = null;
    tx.isReconciled = false;

    // Write reversal ledger entry
    await writeTollLedgerEntry({
      eventType: "toll_unreconciled",
      category: "Toll Reconciliation",
      description: `Toll unmatched from trip ${previousTripId}`,
      grossAmount: Math.abs(Number(tx.amount) || 0),
      netAmount: 0,
      direction: "neutral",
      sourceType: "reconciliation_reversal",
      sourceId: transactionId,
      driverId: tx.driverId || "unknown",
      driverName: tx.driverName || "Unknown",
      vehicleId: tx.vehicleId,
      date: tx.date,
      metadata: {
        previousTripId,
        unmatchedAt: new Date().toISOString(),
      },
    });

    console.log(
      `[TollReconciliation] Unreconciled tx ${transactionId} (was linked to trip ${previousTripId})`,
    );

    return c.json({
      success: true,
      data: {
        transaction: tx,
        trip: previousTrip || null,
      },
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /unreconcile error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── PATCH /edit ───────────────────────────────────────────────────────
// Edit toll transaction fields (date, time, amount, vehicle, driver, description)

app.patch(`${BASE}/edit`, async (c) => {
  try {
    const { transactionId, updates } = await c.req.json();
    if (!transactionId) {
      return c.json({ error: "transactionId is required" }, 400);
    }
    if (!updates || typeof updates !== "object") {
      return c.json({ error: "updates object is required" }, 400);
    }

    // Phase 6: Read from toll_ledger (single source of truth)
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry) return c.json({ error: `Toll ${transactionId} not found` }, 404);

    // Convert to tx shape for response compatibility
    const tx = tollLedgerToTxShape(tollEntry);

    // Only allow specific fields to be edited
    const allowedFields = ["date", "time", "amount", "vehiclePlate", "vehicleId", "driverName", "driverId", "description"];
    const appliedUpdates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        appliedUpdates[field] = updates[field];
      }
    }

    if (Object.keys(appliedUpdates).length === 0) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    // Apply updates
    Object.assign(tx, appliedUpdates);

    // If vehiclePlate was updated, also sync vehicleId
    if (appliedUpdates.vehiclePlate && !appliedUpdates.vehicleId) {
      tx.vehicleId = appliedUpdates.vehiclePlate;
    }

    // Track edit history in metadata
    // Phase 6: Write ONLY to toll_ledger (single source of truth)
    await updateTollLedgerEntry(
      transactionId,
      appliedUpdates,
      "updated",
      "admin"
    );

    // Update local tx object for response (not persisted to transaction:*)
    Object.assign(tx, appliedUpdates);

    console.log(
      `[TollReconciliation] Edited tx ${transactionId}: ${Object.keys(appliedUpdates).join(", ")}`,
    );

    return c.json({ success: true, data: tx });
  } catch (e: any) {
    console.log(`[TollReconciliation] PATCH /edit error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /reset-for-reconciliation (core logic shared with index.tsx alias) ─

/** Core reset used by Toll Logs — also exposed on main Hono app to avoid nested-route 404s in production. */
export async function executeTollResetForReconciliation(
  transactionId: string | undefined,
): Promise<{ success: true; data: { transaction: any } }> {
  if (!transactionId || String(transactionId).trim() === "") {
    const err = new Error("transactionId is required") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const id = String(transactionId).trim();

  let tollEntry = await getTollLedgerEntry(id);
  // Rows may appear in /toll-logs via merge from transaction:* but have no toll_ledger:* yet.
  if (!tollEntry) {
    const legacy = await kv.get(`transaction:${id}`);
    if (
      !legacy ||
      typeof legacy !== "object" ||
      !isTollCategory((legacy as { category?: string }).category)
    ) {
      const err = new Error(`Toll ${id} not found`) as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    const hydrated = transactionToTollLedgerServer(legacy);
    await saveTollLedgerEntry(hydrated);
    tollEntry = await getTollLedgerEntry(id);
    if (!tollEntry) {
      const err = new Error(`Toll ${id} could not be written to toll ledger`) as Error & {
        status?: number;
      };
      err.status = 500;
      throw err;
    }
    console.log(
      `[TollReconciliation] Hydrated toll_ledger:${id} from transaction:* for reset-for-reconciliation`,
    );
  }

  const previousTripId = tollEntry.tripId;
  const txBefore = tollLedgerToTxShape(tollEntry);

  const meta = { ...(tollEntry.metadata || {}) } as Record<string, unknown>;
  for (
    const k of
      ["reconciledAt", "reconciledBy", "matchedBy", "matchConfidence", "tripId", "matchedAt"]
  ) {
    delete meta[k];
  }

  await updateTollLedgerEntry(
    id,
    {
      status: "pending",
      tripId: null,
      isReconciled: false,
      resolution: null,
      matchConfidence: null,
      matchedAt: null,
      matchedBy: null,
      metadata: meta,
    },
    "edited",
    "admin",
  );

  const updated = await getTollLedgerEntry(id);
  if (!updated) {
    throw new Error("Toll entry missing after update");
  }
  const tx = tollLedgerToTxShape(updated);

  if (previousTripId) {
    await writeTollLedgerEntry({
      eventType: "toll_unreconciled",
      category: "Toll Reconciliation",
      description:
        `Toll reset for reconciliation (was linked to trip ${previousTripId})`,
      grossAmount: Math.abs(Number(txBefore.amount) || 0),
      netAmount: 0,
      direction: "neutral",
      sourceType: "reconciliation_reversal",
      sourceId: id,
      driverId: txBefore.driverId || "unknown",
      driverName: txBefore.driverName || "Unknown",
      vehicleId: txBefore.vehicleId,
      date: txBefore.date,
      metadata: {
        previousTripId,
        resetAt: new Date().toISOString(),
      },
    });
  }

  console.log(
    `[TollReconciliation] Reset for reconciliation: ${id}` +
      (previousTripId ? ` (unlinked trip ${previousTripId})` : ""),
  );

  return {
    success: true,
    data: { transaction: tx },
  };
}

app.post(`${BASE}/reset-for-reconciliation`, async (c) => {
  try {
    const { transactionId } = await c.req.json();
    const result = await executeTollResetForReconciliation(transactionId);
    return c.json(result);
  } catch (e: any) {
    const status =
      typeof e.status === "number" && e.status >= 400 && e.status < 600
        ? e.status
        : 500;
    console.log(
      `[TollReconciliation] POST /reset-for-reconciliation error: ${e.message}`,
    );
    return c.json({ error: e.message }, status);
  }
});

// ─── POST /reset-period ──────────────────────────────────────────────────
app.post(`${BASE}/reset-period`, async (c) => {
  try {
    const body = await c.req.json();
    const { executePeriodReconciliationReset } = await import("./period_reset.ts");
    const result = await executePeriodReconciliationReset(
      {
        startDate: body.startDate,
        endDate: body.endDate,
        driverIds: Array.isArray(body.driverIds) ? body.driverIds : undefined,
        dryRun: body.dryRun === true,
        confirmationLabel: String(body.confirmationLabel || ""),
      },
      c,
    );
    return c.json({ success: true, ...result });
  } catch (e: any) {
    const status =
      typeof e.status === "number" && e.status >= 400 && e.status < 600
        ? e.status
        : 500;
    console.log(`[TollReconciliation] POST /reset-period error: ${e.message}`);
    return c.json({ error: e.message }, status);
  }
});

// ─── POST /bulk-reconcile ──────────────────────────────────────────────

app.post(`${BASE}/bulk-reconcile`, async (c) => {
  try {
    const { matches } = await c.req.json();

    if (!Array.isArray(matches) || matches.length === 0) {
      return c.json({ error: "matches array is required and must be non-empty" }, 400);
    }

    console.log(
      `[TollReconciliation] Bulk reconcile: ${matches.length} matches requested`,
    );

    const results = { matched: 0, skipped: 0, failed: 0, errors: [] as string[] };

    // Process in batches of 20 for KV write efficiency
    const BATCH_SIZE = 20;
    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      const batch = matches.slice(i, i + BATCH_SIZE);

      const txKeys = batch.map((m: any) => `transaction:${m.transactionId}`);
      const tripKeys = batch.map((m: any) => `trip:${m.tripId}`);

      let txValues: any[];
      let tripValues: any[];

      try {
        [txValues, tripValues] = await Promise.all([
          kv.mget(txKeys),
          kv.mget(tripKeys),
        ]);
      } catch (e: any) {
        results.errors.push(`Batch ${i}-${i + batch.length}: KV read failed: ${e.message}`);
        results.failed += batch.length;
        continue;
      }

      const tollLedgerUpdates: { id: string; updates: Partial<TollLedgerRecord>; trip: any }[] = [];
      const canonicalAuditEntries: TollReconcileAuditEntry[] = [];

      for (let j = 0; j < batch.length; j++) {
        const { transactionId, tripId } = batch[j];
        const tx = txValues[j];
        const trip = tripValues[j];

        if (!tx) {
          results.errors.push(`Transaction ${transactionId} not found`);
          results.failed++;
          continue;
        }
        if (!trip) {
          results.errors.push(`Trip ${tripId} not found`);
          results.failed++;
          continue;
        }
        if (!isTollCategory(tx.category)) {
          results.errors.push(`Transaction ${transactionId} is not a toll category`);
          results.skipped++;
          continue;
        }
        if (tx.isReconciled && tx.tripId) {
          results.skipped++;
          continue;
        }

        // Phase 6: Write ONLY to toll_ledger
        tollLedgerUpdates.push({
          id: transactionId,
          updates: {
            status: "reconciled",
            tripId,
            isReconciled: true,
            driverId: trip.driverId || tx.driverId,
            driverName: trip.driverName || tx.driverName,
          },
          trip,
        });

        // Build canonical audit entry for toll reconciliation
        const auditId = crypto.randomUUID();
        canonicalAuditEntries.push({
          id: auditId,
          date: tx.date?.split("T")[0] || new Date().toISOString().split("T")[0],
          driverId: trip.driverId || tx.driverId || "unknown",
          amount: Math.abs(Number(tx.amount) || 0),
          vehicleId: tx.vehicleId || trip.vehicleId,
          description: `Toll matched to trip (bulk): ${(trip.pickupLocation || "").substring(0, 25)} → ${(trip.dropoffLocation || "").substring(0, 25)}`,
          tollLedgerId: transactionId,
        });

        results.matched++;
      }

      // Batch append canonical ledger entries (audit trail)
      if (canonicalAuditEntries.length > 0) {
        await appendCanonicalTollReconciledBatch(canonicalAuditEntries, c);
      }

      // Phase 6: Update toll_ledger entries (primary store)
      for (const { id, updates } of tollLedgerUpdates) {
        await updateTollLedgerEntry(id, updates, "reconciled", "admin_bulk");
        await recomputeAndPersistWorkflowStage(id);
      }
    }

    console.log(
      `[TollReconciliation] Bulk reconcile complete: ${results.matched} matched, ${results.skipped} skipped, ${results.failed} failed`,
    );

    return c.json({ success: true, ...results });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /bulk-reconcile error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /approve ─────────────────────────────────────────────────────
// For cash toll claims — marks as approved + writes ledger entry

app.post(`${BASE}/approve`, async (c) => {
  try {
    const { transactionId, notes } = await c.req.json();
    if (!transactionId) {
      return c.json({ error: "transactionId is required" }, 400);
    }

    // Phase 6: Read from toll_ledger (single source of truth)
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry) return c.json({ error: `Toll ${transactionId} not found` }, 404);

    // Convert to tx shape for response compatibility
    const tx = tollLedgerToTxShape(tollEntry);

    // Phase 6: Write ONLY to toll_ledger (single source of truth)
    await updateTollLedgerEntry(
      transactionId,
      {
        status: "approved",
        isReconciled: true,
        notes: notes || undefined,
      },
      "approved",
      "admin"
    );
    await recomputeAndPersistWorkflowStage(transactionId);

    // Update local tx object for response
    tx.status = "Approved";
    tx.isReconciled = true;
    const resolvedAt = new Date();
    const deleteAfter = await applyEvidenceResolution(supabase, "transaction", transactionId, resolvedAt);
    if (deleteAfter) {
      tx.metadata = { ...(tx.metadata || {}), evidenceDeleteAfter: deleteAfter };
      const legacyTx = await kv.get(`transaction:${transactionId}`);
      if (legacyTx) {
        legacyTx.metadata = { ...(legacyTx.metadata || {}), evidenceDeleteAfter: deleteAfter };
        await kv.set(`transaction:${transactionId}`, legacyTx);
      }
    }

    // Write ledger entry for the approval
    await writeTollLedgerEntry({
      eventType: "toll_approved",
      category: "Toll Reconciliation",
      description: `Cash toll claim approved: ${tx.description || tx.vendor || "Toll charge"}`,
      grossAmount: Math.abs(Number(tx.amount) || 0),
      netAmount: -Math.abs(Number(tx.amount) || 0), // Expense (outflow)
      direction: "outflow",
      sourceType: "toll_approval",
      sourceId: transactionId,
      driverId: tx.driverId || "unknown",
      driverName: tx.driverName || "Unknown",
      vehicleId: tx.vehicleId,
      date: tx.date,
      metadata: {
        approvedAt: new Date().toISOString(),
        notes,
        originalAmount: tx.amount,
        paymentMethod: tx.paymentMethod,
      },
    });

    console.log(`[TollReconciliation] Approved toll claim ${transactionId}`);

    return c.json({ success: true, data: tx });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /approve error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /reject ──────────────────────────────────────────────────────
// For cash toll claims — marks as rejected + writes ledger entry

app.post(`${BASE}/reject`, async (c) => {
  try {
    const { transactionId, reason } = await c.req.json();
    if (!transactionId) {
      return c.json({ error: "transactionId is required" }, 400);
    }

    // Phase 6: Read from toll_ledger (single source of truth)
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry) return c.json({ error: `Toll ${transactionId} not found` }, 404);

    // Convert to tx shape for response compatibility
    const tx = tollLedgerToTxShape(tollEntry);

    // Phase 6: Write ONLY to toll_ledger (single source of truth)
    await updateTollLedgerEntry(
      transactionId,
      {
        status: "rejected",
        isReconciled: true,
        notes: reason || undefined,
      },
      "rejected",
      "admin"
    );
    await recomputeAndPersistWorkflowStage(transactionId);

    // Update local tx object for response
    tx.status = "Rejected";
    tx.isReconciled = true;
    const resolvedAt = new Date();
    const deleteAfter = await applyEvidenceResolution(supabase, "transaction", transactionId, resolvedAt);
    if (deleteAfter) {
      tx.metadata = { ...(tx.metadata || {}), evidenceDeleteAfter: deleteAfter };
      const legacyTx = await kv.get(`transaction:${transactionId}`);
      if (legacyTx) {
        legacyTx.metadata = { ...(legacyTx.metadata || {}), evidenceDeleteAfter: deleteAfter };
        await kv.set(`transaction:${transactionId}`, legacyTx);
      }
    }

    // Write ledger entry for the rejection
    await writeTollLedgerEntry({
      eventType: "toll_rejected",
      category: "Toll Reconciliation",
      description: `Cash toll claim rejected: ${tx.description || tx.vendor || "Toll charge"} — ${reason || "No reason"}`,
      grossAmount: Math.abs(Number(tx.amount) || 0),
      netAmount: 0, // No financial impact — claim was denied
      direction: "neutral",
      sourceType: "toll_rejection",
      sourceId: transactionId,
      driverId: tx.driverId || "unknown",
      driverName: tx.driverName || "Unknown",
      vehicleId: tx.vehicleId,
      date: tx.date,
      metadata: {
        rejectedAt: new Date().toISOString(),
        reason,
      },
    });

    console.log(`[TollReconciliation] Rejected toll claim ${transactionId}`);

    return c.json({ success: true, data: tx });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /reject error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /resolve ─────────────────────────────────────────────────────
// General resolution: Personal (charge driver), WriteOff, or Business
//
// NOTE: this is a 4th claim-creation path alongside index.tsx's POST /claims
// and dispute_refund_controller.tsx's two call sites — but unlike those, it
// CANNOT route through claim_service.ts's upsertClaim/deleteClaim: that
// module (transitively, via claim_toll_sync.ts) imports getTollLedgerEntry/
// updateTollLedgerEntry FROM this file, so this file importing back from it
// would be a circular dependency. It stays intentionally self-contained,
// using emitDriverTollCharge directly (imported above) for the Personal
// case — no reversible reclassify/undo support the way claim_service.ts
// callers get, which is an accepted limitation of this endpoint, not an
// oversight. It DOES get the new isReconciled/claimId/workflowStage
// bookkeeping (RWF-1) below, since those are local to this file.
app.post(`${BASE}/resolve`, async (c) => {
  try {
    const { transactionId, resolution, notes, source, driverId: driverIdOverride } =
      await c.req.json();
    if (!transactionId || !resolution) {
      return c.json(
        { error: "transactionId and resolution are required" },
        400,
      );
    }

    const validResolutions = ["Personal", "WriteOff", "Business"];
    if (!validResolutions.includes(resolution)) {
      return c.json(
        { error: `Invalid resolution: ${resolution}. Must be one of: ${validResolutions.join(", ")}` },
        400,
      );
    }

    // Provenance of this resolution. Absent → treat as a human confirmation
    // (preserves the endpoint's prior behavior). "system_suggested" is a
    // classify-only path that never charges a driver.
    const isSystemSuggested = source === "system_suggested";
    const resolutionSource = isSystemSuggested ? "system_suggested" : "human_confirmed";

    // Phase 6: Read from toll_ledger (single source of truth)
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry) return c.json({ error: `Toll ${transactionId} not found` }, 404);

    // Convert to tx shape for response compatibility
    const tx = tollLedgerToTxShape(tollEntry);

    // Optional driver override (integrity: charging a driver needs a real driver).
    if (driverIdOverride) {
      tx.driverId = driverIdOverride;
    }

    const amount = Math.abs(Number(tollEntry.amount) || 0);

    // Map resolution → durable ledger enum (shared by both paths below).
    const ledgerResolution: "personal" | "business" | "write_off" | null =
      resolution === "Personal" ? "personal" :
      resolution === "Business" ? "business" :
      resolution === "WriteOff" ? "write_off" : null;

    // ── Classify-only path (system suggestion) ──────────────────────────────
    // Persist the resolution label for review WITHOUT charging the driver or
    // changing the toll's workflow status. A human confirmation (below) is
    // what actually moves money. Reached only when source === "system_suggested".
    if (isSystemSuggested) {
      await updateTollLedgerEntry(
        transactionId,
        { resolution: ledgerResolution, notes: notes || undefined },
        "updated",
        "system-suggested",
      );
      await writeTollLedgerEntry({
        eventType: "toll_personal_suggested",
        category: "Toll Reconciliation",
        description: `Toll suggested as ${resolution.toLowerCase()} (awaiting confirmation): ${tx.description || tx.vendor || "Toll"}`,
        grossAmount: amount,
        netAmount: 0, // classify-only — no financial impact yet
        direction: "neutral",
        sourceType: "toll_resolution",
        sourceId: transactionId,
        driverId: tx.driverId || "unknown",
        driverName: tx.driverName || "Unknown",
        vehicleId: tx.vehicleId,
        date: tx.date,
        metadata: {
          resolution,
          source: resolutionSource,
          suggestedAt: new Date().toISOString(),
          notes,
        },
      });
      console.log(
        `[TollReconciliation] System-suggested tx ${transactionId} as ${resolution} (classify-only, no charge)`,
      );
      return c.json({ success: true, data: { transaction: tx, claim: null, source: resolutionSource } });
    }

    // Determine status and claim creation based on resolution type
    let claimResolutionReason: string;
    let ledgerEventType: string;
    let ledgerDirection: "inflow" | "outflow" | "neutral";
    let ledgerNetAmount: number;
    let ledgerDescription: string;

    switch (resolution) {
      case "Personal":
        tx.status = "Rejected";
        claimResolutionReason = "Charge Driver";
        ledgerEventType = "toll_charged_to_driver";
        ledgerDirection = "outflow";
        ledgerNetAmount = -amount; // Driver bears the cost
        ledgerDescription = `Toll charged to driver (personal use): ${tx.description || tx.vendor || "Toll"}`;
        break;
      case "WriteOff":
        tx.status = "Approved";
        claimResolutionReason = "Write Off";
        ledgerEventType = "toll_written_off";
        ledgerDirection = "outflow";
        ledgerNetAmount = -amount; // Fleet absorbs the cost
        ledgerDescription = `Toll written off (fleet absorbed): ${tx.description || tx.vendor || "Toll"}`;
        break;
      case "Business":
        tx.status = "Approved";
        claimResolutionReason = "Business Expense"; // fleet absorbs the cost, distinct label from Write Off
        ledgerEventType = "toll_business_expense";
        ledgerDirection = "outflow";
        ledgerNetAmount = -amount;
        ledgerDescription = `Toll classified as business expense: ${tx.description || tx.vendor || "Toll"}`;
        break;
      default:
        return c.json({ error: "Invalid resolution" }, 400);
    }

    // Create a claim record for audit trail
    const claimId = crypto.randomUUID();
    const claim = {
      id: claimId,
      transactionId,
      type: "Toll",
      amount,
      status: "Resolved",
      resolutionReason: claimResolutionReason,
      notes: notes || "",
      createdAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      driverId: tx.driverId,
      driverName: tx.driverName,
      date: tollEntry.date,
    };
    await kv.set(`claim:${claimId}`, claim);

    // Phase 6: Write ONLY to toll_ledger (single source of truth)
    await updateTollLedgerEntry(
      transactionId,
      {
        status: tx.status === "Approved" ? "resolved" : "rejected",
        resolution: ledgerResolution,
        isReconciled: true,
        claimId,
        notes: notes || undefined,
      },
      "resolved",
      "admin"
    );
    await recomputeAndPersistWorkflowStage(transactionId, { claim });

    // Update local tx object for response (not persisted to transaction:*)
    tx.isReconciled = true;

    if (resolution === "Personal") {
      // Personal = charge the driver. Route through the single consolidated
      // emitter so the canonical event AND the (flag-gated) driver-visible
      // projection txn are written idempotently, keyed on the claim.
      await emitDriverTollCharge(
        {
          tollId: transactionId,
          claimId,
          driverId: tx.driverId || "unknown",
          driverName: tx.driverName || "Unknown",
          vehicleId: tx.vehicleId,
          tripId: tx.tripId ?? null,
          amount,
          date: tx.date,
          description: ledgerDescription,
          source: resolutionSource,
        },
        c,
      );
    } else {
      // WriteOff / Business = fleet absorbs the cost. No driver charge.
      await writeTollLedgerEntry({
        eventType: ledgerEventType,
        category: "Toll Reconciliation",
        description: ledgerDescription,
        grossAmount: amount,
        netAmount: ledgerNetAmount,
        direction: ledgerDirection,
        sourceType: "toll_resolution",
        sourceId: transactionId,
        driverId: tx.driverId || "unknown",
        driverName: tx.driverName || "Unknown",
        vehicleId: tx.vehicleId,
        date: tx.date,
        metadata: {
          resolution,
          source: resolutionSource,
          claimId,
          claimResolutionReason,
          notes,
          resolvedAt: new Date().toISOString(),
        },
      });
    }

    console.log(
      `[TollReconciliation] Resolved tx ${transactionId} as ${resolution} (claim ${claimId}, source ${resolutionSource})`,
    );

    return c.json({
      success: true,
      data: { transaction: tx, claim },
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /resolve error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /driver-toll-charges ──────────────────────────────────────────
// Driver-scoped toll disposition summary, read from toll_ledger:* (SSOT for
// toll resolution). Powers the driver's Reconciliation sub-tab toll section.
// Buckets by resolution: personal (charged to driver) / business / write_off /
// refunded, plus reconciled-to-trip (platform reimbursed). Server-computed and
// driver-scoped so it scales to hundreds of drivers.
app.get(`${BASE}/driver-toll-charges`, async (c) => {
  try {
    const driverId = c.req.query("driverId");
    if (!driverId) return c.json({ error: "driverId is required" }, 400);
    const from = c.req.query("from") || undefined; // YYYY-MM-DD inclusive
    const to = c.req.query("to") || undefined;

    const all = await getAllTollLedgerEntries();
    const forDriver = filterByDriver(all, driverId).filter((e: any) => {
      if (!from && !to) return true;
      const d = (e.date || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });

    const bucket = {
      chargedToDriver: 0, // resolution === 'personal'
      writtenOff: 0, // resolution === 'write_off'
      business: 0, // resolution === 'business'
      refunded: 0, // resolution === 'refunded'
      reconciled: 0, // matched to a trip (platform reimbursed)
      cashWash: 0, // no resolution yet, but a cash toll — credit vs owed, not truly "unresolved"
      unresolved: 0, // still pending
    };
    const counts = { chargedToDriver: 0, writtenOff: 0, business: 0, refunded: 0, reconciled: 0, cashWash: 0, unresolved: 0 };
    const charges: any[] = [];

    for (const e of forDriver) {
      const amt = Math.abs(Number(e.amount) || 0);
      const res = e.resolution as string | null;
      if (res === "personal") {
        bucket.chargedToDriver += amt; counts.chargedToDriver++;
        charges.push({ id: e.id, date: e.date, amount: amt, plaza: e.plaza || e.location || null, tripId: e.tripId || null });
      } else if (res === "write_off") {
        bucket.writtenOff += amt; counts.writtenOff++;
      } else if (res === "business") {
        bucket.business += amt; counts.business++;
      } else if (res === "refunded") {
        bucket.refunded += amt; counts.refunded++;
      } else if (classifyTollLedgerEntry(e) === "cashWash") {
        // A cash toll with no resolution label yet — the canonical
        // classifier (driver_toll_disposition.ts) already treats this as
        // cashWash everywhere else; this endpoint used to silently fold it
        // into reconciled/unresolved below, diverging from that classifier.
        bucket.cashWash += amt; counts.cashWash++;
      } else if (e.isReconciled || e.tripId) {
        bucket.reconciled += amt; counts.reconciled++;
      } else {
        bucket.unresolved += amt; counts.unresolved++;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return c.json({
      success: true,
      data: {
        totals: {
          chargedToDriver: round(bucket.chargedToDriver),
          writtenOff: round(bucket.writtenOff),
          business: round(bucket.business),
          refunded: round(bucket.refunded),
          reconciled: round(bucket.reconciled),
          cashWash: round(bucket.cashWash),
          unresolved: round(bucket.unresolved),
        },
        counts,
        charges: charges.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 100),
      },
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /driver-toll-charges error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CLAIMS ↔ TOLL_LEDGER REPAIR (one-time, dry-run-first, admin-triggered)
// ═══════════════════════════════════════════════════════════════════════
// Historically, Claimable Loss resolutions (Charge Driver / Write Off /
// Reimbursed) never synced toll_ledger.resolution, and Charge Driver claims
// were dated on the resolution click date (today) instead of the toll's
// actual date — misplacing the charge in the wrong financial period. This
// repair scans already-resolved claims and corrects both, WITHOUT ever
// auto-creating a new charge: a Charge Driver claim whose charge never
// actually fired (the pre-fix reclassify bug) is flagged for manual review,
// not batch-charged. Mirrors the dry-run/force pattern of
// computeTagBackfillPlan / GET .../tag-backfill/status above.

interface ClaimsTollSyncCandidate {
  claimId: string;
  transactionId: string;
  resolutionReason: string;
  expectedResolution: "personal" | "business" | "write_off" | "refunded" | null;
  currentResolution: string | null;
  kind: "label_only" | "date_and_label" | "needs_manual_review";
}

async function computeClaimsTollSyncPlan(): Promise<{
  totalResolvedClaims: number;
  candidates: ClaimsTollSyncCandidate[];
}> {
  const allClaims = ((await kv.getByPrefix("claim:")) || []).filter(
    (x: any) => x && typeof x === "object" && x.id,
  );
  const resolvedClaims = allClaims.filter(
    (cl: any) =>
      cl.status === "Resolved" &&
      ["Charge Driver", "Write Off", "Reimbursed"].includes(cl.resolutionReason) &&
      !!cl.transactionId,
  );

  const candidates: ClaimsTollSyncCandidate[] = [];
  for (const claim of resolvedClaims) {
    const expected = mapResolutionReasonToTollResolution(claim.resolutionReason);
    const tollEntry = await getTollLedgerEntry(claim.transactionId);
    if (!tollEntry) continue; // linked toll no longer exists — nothing to repair
    const current = tollEntry.resolution ?? null;
    if (current === expected) continue; // already correct — not a candidate

    let kind: ClaimsTollSyncCandidate["kind"];
    if (claim.resolutionReason === "Charge Driver") {
      kind = claim.resolutionTransactionId ? "date_and_label" : "needs_manual_review";
    } else {
      kind = "label_only";
    }

    candidates.push({
      claimId: claim.id,
      transactionId: claim.transactionId,
      resolutionReason: claim.resolutionReason,
      expectedResolution: expected,
      currentResolution: current,
      kind,
    });
  }

  return { totalResolvedClaims: resolvedClaims.length, candidates };
}

// ─── GET /claims-toll-sync/status ─── read-only dry-run report ────────────
app.get(`${BASE}/claims-toll-sync/status`, async (c) => {
  try {
    const plan = await computeClaimsTollSyncPlan();
    const labelsToFix = plan.candidates.filter((x) => x.kind === "label_only").length;
    const transactionDatesToFix = plan.candidates.filter((x) => x.kind === "date_and_label").length;
    const needsManualReview = plan.candidates.filter((x) => x.kind === "needs_manual_review");

    return c.json({
      success: true,
      summary: {
        totalResolvedClaims: plan.totalResolvedClaims,
        candidates: plan.candidates.length,
        labelsToFix,
        transactionDatesToFix,
        needsManualReviewCount: needsManualReview.length,
      },
      needsManualReview: needsManualReview.map((x) => ({
        claimId: x.claimId,
        transactionId: x.transactionId,
      })),
      message:
        `${labelsToFix} label-only fix(es), ${transactionDatesToFix} date+label fix(es), ` +
        `${needsManualReview.length} claim(s) need manual re-resolution (charge never fired). ` +
        `Re-run with POST /claims-toll-sync/repair (dryRun:false) to apply the safe fixes.`,
    });
  } catch (e: any) {
    console.log(`[ClaimsTollSync] GET /status error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /claims-toll-sync/repair ─── apply (dry-run by default) ─────────
app.post(`${BASE}/claims-toll-sync/repair`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // default to dry-run for safety
    const plan = await computeClaimsTollSyncPlan();

    let labelsFixed = 0;
    let datesFixed = 0;
    const errors: string[] = [];
    const needsManualReview = plan.candidates.filter((x) => x.kind === "needs_manual_review");

    if (!dryRun) {
      for (const cand of plan.candidates) {
        if (cand.kind === "needs_manual_review") continue; // never auto-charge
        try {
          if (cand.kind === "date_and_label") {
            const tollEntry = await getTollLedgerEntry(cand.transactionId);
            const claim = (await kv.get(`claim:${cand.claimId}`)) as any | null;
            if (tollEntry && claim?.resolutionTransactionId) {
              const txKey = `transaction:${claim.resolutionTransactionId}`;
              const tx = (await kv.get(txKey)) as Record<string, any> | null;
              if (tx && tollEntry.date && tx.date !== tollEntry.date) {
                await kv.set(txKey, {
                  ...tx,
                  date: tollEntry.date,
                  vehicleId: tx.vehicleId || tollEntry.vehicleId || undefined,
                  metadata: {
                    ...(tx.metadata || {}),
                    dateCorrected: true,
                    originalDate: tx.date,
                    dateCorrectedAt: new Date().toISOString(),
                  },
                });
                datesFixed++;
              }
            }
          }

          await updateTollLedgerEntry(
            cand.transactionId,
            { resolution: cand.expectedResolution },
            "resolved",
            "system-repair",
          );
          if (cand.kind === "label_only") labelsFixed++;
        } catch (err: any) {
          errors.push(`${cand.claimId}: ${err.message}`);
          if (errors.length > 50) break;
        }
      }
    }

    console.log(
      `[ClaimsTollSync] dryRun=${dryRun} candidates=${plan.candidates.length} ` +
        `labelsFixed=${labelsFixed} datesFixed=${datesFixed} needsManualReview=${needsManualReview.length} errors=${errors.length}`,
    );

    return c.json({
      success: true,
      dryRun,
      summary: {
        totalResolvedClaims: plan.totalResolvedClaims,
        candidates: plan.candidates.length,
        labelsFixed: dryRun ? 0 : labelsFixed,
        datesFixed: dryRun ? 0 : datesFixed,
        needsManualReviewCount: needsManualReview.length,
      },
      needsManualReview: needsManualReview.map((x) => ({
        claimId: x.claimId,
        transactionId: x.transactionId,
      })),
      errors: errors.slice(0, 50),
      message: dryRun
        ? `Dry run: ${plan.candidates.length - needsManualReview.length} record(s) would be repaired. Re-run with dryRun:false to apply.`
        : `Repaired ${labelsFixed} label(s) and ${datesFixed} date(s).`,
    });
  } catch (e: any) {
    console.log(`[ClaimsTollSync] POST /repair error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// UNLINKED-REFUND RESOLUTION + AUTOMATION (Phase 2)
// ═══════════════════════════════════════════════════════════════════════
// An "unlinked refund" is a trip where the platform reimbursed a toll in the
// fare but no toll expense is linked. These endpoints classify and resolve
// them. All writes are additive (trip.tollRefundResolution) and audited; the
// automation only auto-applies integrity-safe, high-confidence cash washes.

type RefundResolutionStatus = "cash_wash" | "phantom" | "expense_logged" | "pending";

const REFUND_SETTINGS_KEY = "toll_reconciliation:settings";
const DEFAULT_PLAZA_RADIUS_M = 500;
const REFUND_AUTO_APPLY_MIN_CONFIDENCE = 85;
const DISPUTE_REFUND_AUTO_MIN_CONFIDENCE = 95;
// Default proximity (minutes) that qualifies a toll as "orphan" (personal use).
// A tighter nested window inside the ±1-day sameDayPreFilter.
const DEFAULT_ORPHAN_PROXIMITY_MINUTES = 180;

interface RefundAutomationSettings {
  refundAutomationEnabled: boolean;
  refundAutoMinConfidence: number;
  /** Higher bar for dispute-refund auto-link (separate from cash-wash). */
  disputeRefundAutoMinConfidence: number;
  // Personal-use (orphan) toll detection — additive, default OFF.
  personalUseDetectionEnabled: boolean;
  orphanProximityMinutes: number;
  // Sync "charge driver" toll resolutions into the driver financial section
  // (materializes the projection txn) — additive, default OFF.
  driverTollChargeSyncEnabled: boolean;
  // Unified toll-settlement rework: one reconciliation-aware calc across all four
  // driver financial tabs (payout stops deducting tolls) — additive, default OFF.
  unifiedTollSettlementEnabled: boolean;
  // MOI: match-on-ingest — compute+persist toll↔trip matches at write time
  // instead of recomputing on every GET /unreconciled read — additive, default OFF.
  matchOnIngestEnabled: boolean;
  // Cascade a matched/unmatched dispute refund into the reversible claim/
  // driver-charge sync and into the trip's Unlinked Refunds resolution —
  // additive, default OFF.
  disputeRefundTripSyncEnabled: boolean;
  // Real Undo for Apply-to-Underpaid — additive, default OFF.
  unlinkedRefundUndoEnabled: boolean;
}

async function getRefundAutomationSettings(): Promise<RefundAutomationSettings> {
  const rec = (await kv.get(REFUND_SETTINGS_KEY)) as Partial<RefundAutomationSettings> | null;
  return {
    refundAutomationEnabled: rec?.refundAutomationEnabled === true, // default OFF
    refundAutoMinConfidence:
      typeof rec?.refundAutoMinConfidence === "number"
        ? rec.refundAutoMinConfidence
        : REFUND_AUTO_APPLY_MIN_CONFIDENCE,
    disputeRefundAutoMinConfidence:
      typeof rec?.disputeRefundAutoMinConfidence === "number"
        ? rec.disputeRefundAutoMinConfidence
        : DISPUTE_REFUND_AUTO_MIN_CONFIDENCE,
    personalUseDetectionEnabled: rec?.personalUseDetectionEnabled !== false, // default ON
    orphanProximityMinutes:
      typeof rec?.orphanProximityMinutes === "number" && rec.orphanProximityMinutes > 0
        ? rec.orphanProximityMinutes
        : DEFAULT_ORPHAN_PROXIMITY_MINUTES,
    driverTollChargeSyncEnabled: rec?.driverTollChargeSyncEnabled === true, // default OFF
    unifiedTollSettlementEnabled: rec?.unifiedTollSettlementEnabled === true, // default OFF
    matchOnIngestEnabled: rec?.matchOnIngestEnabled === true, // default OFF
    disputeRefundTripSyncEnabled: rec?.disputeRefundTripSyncEnabled === true, // default OFF
    unlinkedRefundUndoEnabled: rec?.unlinkedRefundUndoEnabled === true, // default OFF
  };
}

// ── Geo helper: nearest active toll plaza to a trip's endpoints ──────────
function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface ActivePlaza { lat: number; lng: number; }

async function loadActivePlazaPoints(): Promise<ActivePlaza[]> {
  const raw = await kv.getByPrefix("toll_plaza:");
  const points: ActivePlaza[] = [];
  for (const v of raw || []) {
    if (!v || typeof v !== "object") continue;
    if (v.status && v.status !== "active") continue;
    const loc = v.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      points.push({ lat: loc.lat, lng: loc.lng });
    }
  }
  return points;
}

/** Min meters from a trip's pickup/dropoff coords to any active plaza, or null. */
function nearestPlazaMetersForTrip(trip: any, plazas: ActivePlaza[]): number | null {
  if (plazas.length === 0) return null;
  const coords: Array<[number, number]> = [];
  if (typeof trip.startLat === "number" && typeof trip.startLng === "number") {
    coords.push([trip.startLat, trip.startLng]);
  }
  if (typeof trip.endLat === "number" && typeof trip.endLng === "number") {
    coords.push([trip.endLat, trip.endLng]);
  }
  if (coords.length === 0) return null;
  let min = Infinity;
  for (const [lat, lng] of coords) {
    for (const p of plazas) {
      const d = haversineMeters(lat, lng, p.lat, p.lng);
      if (d < min) min = d;
    }
  }
  return isFinite(min) ? min : null;
}

// ── Ported classifier (mirrors src/utils/refundClassifier.ts) ────────────
function isCashSettledServer(platform?: string, paymentMethod?: string): boolean {
  const pm = (paymentMethod || "").toLowerCase();
  const pf = (platform || "").toLowerCase();
  return pm === "cash" || pf === "cash";
}

interface RefundClassification { status: RefundResolutionStatus; confidence: number; reason: string; }

function classifyRefundServer(params: {
  tollCharges: number;
  platform?: string;
  paymentMethod?: string;
  nearestPlazaMeters: number | null;
  plazaRadiusMeters?: number;
  pendingTagImport?: boolean;
}): RefundClassification {
  const {
    tollCharges,
    platform,
    paymentMethod,
    nearestPlazaMeters,
    plazaRadiusMeters = DEFAULT_PLAZA_RADIUS_M,
    pendingTagImport = false,
  } = params;

  if (!(tollCharges > 0)) {
    return { status: "pending", confidence: 0, reason: "No positive toll refund on this trip." };
  }
  if (pendingTagImport) {
    return { status: "pending", confidence: 60, reason: "A tag statement for this period is expected; will auto-match on import." };
  }
  const cashSettled = isCashSettledServer(platform, paymentMethod);
  const hasGeo = typeof nearestPlazaMeters === "number" && nearestPlazaMeters >= 0;
  const nearPlaza = hasGeo && (nearestPlazaMeters as number) <= plazaRadiusMeters;

  if (cashSettled && nearPlaza) {
    return { status: "cash_wash", confidence: 92, reason: "Cash-settled fare and a toll plaza on-route — driver paid cash. No leakage." };
  }
  if (cashSettled && !hasGeo) {
    return { status: "cash_wash", confidence: 80, reason: "Cash-settled fare reimbursed the toll — driver most likely paid cash." };
  }
  if (!cashSettled && nearPlaza) {
    return { status: "cash_wash", confidence: 70, reason: "A toll plaza sits on this route; likely paid in cash and reimbursed." };
  }
  if (hasGeo && !nearPlaza) {
    return { status: "phantom", confidence: 64, reason: "No toll plaza near this route — likely a platform fare estimate." };
  }
  return { status: "pending", confidence: 40, reason: "Insufficient signal; leaving pending for tag-statement import." };
}

function isSafeAutoApplyServer(c: RefundClassification, minConfidence: number): boolean {
  return c.status === "cash_wash" && c.confidence >= minConfidence;
}

/** A trip is still "unlinked" only if it has no linked toll AND is unresolved/pending. */
function isUnresolvedRefund(trip: any, linkedTripIds: Set<string>): boolean {
  if (!(trip.tollCharges && trip.tollCharges > 0)) return false;
  if (linkedTripIds.has(trip.id)) return false;
  const res = trip.tollRefundResolution;
  if (res && res.status && res.status !== "pending") return false; // resolved → hidden
  return true;
}

// ── Core: apply a resolution to a trip (shared by single + bulk) ─────────
async function applyRefundResolution(params: {
  tripId: string;
  resolution: RefundResolutionStatus;
  notes?: string;
  driverId?: string;
  auto: boolean;
  confidence?: number;
  /** When set, reuse this toll_ledger id instead of creating a new row (the
   *  caller already owns the real ledger entry — e.g. a matched dispute
   *  refund). Only meaningful with resolution:"expense_logged". */
  existingLedgerId?: string;
  /** Provenance tag stored on trip.tollRefundResolution.source. Defaults to
   *  "admin" so existing call sites are unaffected. */
  source?: string;
  /** Persist Apply-to-Underpaid linkage for undo. */
  appliedToClaimId?: string | null;
  appliedToTollId?: string | null;
}): Promise<{ tripId: string; resolution: RefundResolutionStatus; linkedTollLedgerId?: string }> {
  const { tripId, resolution, notes, auto } = params;
  const trip = await kv.get(`trip:${tripId}`);
  if (!trip) throw new Error(`Trip ${tripId} not found`);

  const amount = Math.abs(Number(trip.tollCharges) || 0);
  const driverId = params.driverId || trip.driverId || undefined;
  const now = new Date().toISOString();
  let linkedTollLedgerId: string | undefined;

  // "expense_logged" creates a real cash toll expense and links it to the trip.
  if (resolution === "expense_logged") {
    if (params.existingLedgerId) {
      linkedTollLedgerId = params.existingLedgerId;
    } else {
      if (!driverId) throw new Error("driverId is required to log a cash toll expense");
      const ledgerId = crypto.randomUUID();
      const entry: TollLedgerRecord = {
        id: ledgerId,
        createdAt: now,
        updatedAt: now,
        vehicleId: trip.vehicleId || null,
        vehiclePlate: null,
        driverId: driverId || null,
        driverName: trip.driverName || null,
        tollTagId: null,
        tagNumber: null,
        plaza: null,
        highway: null,
        location: `${trip.pickupLocation || "?"} → ${trip.dropoffLocation || "?"}`.substring(0, 120),
        date: String(trip.date || now).split("T")[0],
        time: null,
        type: "usage",
        amount: -amount, // usage is negative
        paymentMethod: "cash",
        status: "reconciled",
        resolution: null,
        isReconciled: true,
        tripId,
        matchConfidence: null,
        matchedAt: now,
        matchedBy: auto ? "system-auto" : "admin",
        batchId: null,
        batchName: null,
        importedAt: null,
        sourceFile: null,
        receiptUrl: null,
        referenceNumber: null,
        description: "Cash toll (logged from unlinked refund)",
        notes: notes || null,
        auditTrail: [],
        metadata: { source: "refund_resolution" },
      };
      await saveTollLedgerEntry(entry);
      linkedTollLedgerId = ledgerId;
    }
  }

  // Persist the resolution on the trip (additive field only).
  trip.tollRefundResolution = {
    status: resolution,
    resolvedBy: auto ? "system-auto" : "admin",
    resolvedAt: now,
    notes: notes || undefined,
    auto,
    confidence: params.confidence,
    linkedTollLedgerId,
    source: params.source || "admin",
    appliedToClaimId: params.appliedToClaimId ?? undefined,
    appliedToTollId: params.appliedToTollId ?? undefined,
  };
  await kv.set(`trip:${tripId}`, trip);

  // Audit trail (canonical, net-zero — no double counting of financials).
  await writeTollLedgerEntry({
    eventType: `refund_resolved_${resolution}`,
    category: "Toll Reconciliation",
    description: `Unlinked refund resolved as ${resolution}: ${(trip.pickupLocation || "").substring(0, 30)} → ${(trip.dropoffLocation || "").substring(0, 30)}`,
    grossAmount: amount,
    netAmount: 0,
    direction: "neutral",
    sourceType: "refund_resolution",
    sourceId: tripId,
    driverId: driverId || "unknown",
    driverName: trip.driverName || "Unknown",
    vehicleId: trip.vehicleId,
    date: String(trip.date || now),
    metadata: { resolution, auto, notes, linkedTollLedgerId, confidence: params.confidence },
  });

  if (linkedTollLedgerId) {
    await recomputeAndPersistWorkflowStage(linkedTollLedgerId);
  }

  console.log(`[TollReconciliation] Refund resolved: trip ${tripId} → ${resolution} (auto=${auto})`);
  return { tripId, resolution, linkedTollLedgerId };
}

// ─── GET /refund-suggestions ─────────────────────────────────────────────
app.get(`${BASE}/refund-suggestions`, async (c) => {
  try {
    const { driverId } = parseQueryParams(c);
    const loaded = await loadAllTollLedgerWithTrips();
    const tollTx = filterByDriver(loaded.tollTx, driverId);
    let trips = filterByDriver(loaded.trips, driverId);

    const linkedTripIds = new Set(
      tollTx.filter((tx: any) => tx.tripId).map((tx: any) => tx.tripId),
    );
    const unresolved = trips.filter((t: any) => isUnresolvedRefund(t, linkedTripIds));
    const plazas = await loadActivePlazaPoints();

    const suggestions: Record<string, RefundClassification> = {};
    for (const t of unresolved) {
      const nearest = nearestPlazaMetersForTrip(t, plazas);
      suggestions[t.id] = classifyRefundServer({
        tollCharges: Number(t.tollCharges) || 0,
        platform: t.platform,
        paymentMethod: t.paymentMethod,
        nearestPlazaMeters: nearest,
      });
    }

    return c.json({ success: true, suggestions });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /refund-suggestions error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

async function loadTollForUnlinkedMatch(transactionId: string | undefined): Promise<any | null> {
  if (!transactionId) return null;
  return (
    (await kv.get(`toll_ledger:${transactionId}`)) ||
    (await kv.get(`transaction:${transactionId}`)) ||
    null
  );
}

type UnlinkedShortfallContext = {
  claims: any[];
  ledger: any[];
  tollById: Map<string, any>;
  trips: any[];
  tripById: Map<string, any>;
};

/** Shared claim+ledger snapshot — load claims once; reuse ledger already in memory when provided. */
async function loadUnlinkedShortfallContext(ledgerHint?: any[]): Promise<UnlinkedShortfallContext> {
  const ledger =
    ledgerHint && ledgerHint.length > 0
      ? ledgerHint
      : ((await loadAllByPrefix("toll_ledger:")) as any[]);
  const [claims, trips] = await Promise.all([
    loadAllByPrefix("claim:"),
    loadAllTrips(),
  ]);
  const tollById = new Map<string, any>();
  for (const toll of ledger) {
    if (toll?.id) tollById.set(toll.id, toll);
  }
  const tripById = new Map<string, any>();
  for (const t of trips || []) {
    if (t?.id) tripById.set(t.id, t);
  }
  return { claims, ledger, tollById, trips: trips || [], tripById };
}

function resolveTollFromContext(ctx: UnlinkedShortfallContext, transactionId: string | undefined): any | null {
  if (!transactionId) return null;
  return ctx.tollById.get(transactionId) || null;
}

/** Canonical platform brand for comparisons (GoRide → Roam, case-safe). */
function normalizePlatformServer(platform?: string | null): string {
  if (!platform) return "";
  const trimmed = String(platform).trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower === "goride" || lower === "roam") return "roam";
  if (lower === "uber") return "uber";
  if (lower === "indrive" || lower === "in drive") return "indrive";
  return lower;
}

/**
 * Platform of the trip originally linked to the underpaid toll / claim —
 * never the unlinked refund trip itself.
 */
function extractTollPlatform(
  toll: any | null,
  claim: any | null,
  ctx: UnlinkedShortfallContext,
): string | null {
  const originalTripId =
    toll?.preUnlinkedTripId ||
    (toll?.unlinkedSourceTripId && toll?.tripId !== toll.unlinkedSourceTripId ? toll.tripId : null) ||
    (toll?.unlinkedSourceTripId ? null : toll?.tripId) ||
    claim?.tripId ||
    null;
  // Prefer claim's original trip (underpaid trip) when toll.tripId was overwritten by apply
  if (claim?.tripId && claim.tripId !== claim.unlinkedTripId) {
    const claimTrip = ctx.tripById.get(claim.tripId);
    if (claimTrip?.platform) return String(claimTrip.platform);
  }
  if (originalTripId) {
    const linked = ctx.tripById.get(originalTripId);
    if (linked?.platform) return String(linked.platform);
  }
  if (toll?.tripId && toll.tripId !== toll.unlinkedSourceTripId) {
    const linked = ctx.tripById.get(toll.tripId);
    if (linked?.platform) return String(linked.platform);
  }
  return null;
}

/** Ranked underpaid claims / tolls this unlinked trip refund could cover (Review picker). */
function computeUnlinkedShortfallSuggestions(
  trip: any,
  ctx: UnlinkedShortfallContext,
): any[] {
  const driverId = trip.driverId;
  const tripRefund = Math.abs(Number(trip.tollCharges) || 0);
  if (!driverId || tripRefund <= 0) return [];
  const tripPlatform = trip.platform ? String(trip.platform) : null;
  const tripPlatformNorm = normalizePlatformServer(tripPlatform);

  const byTollId = new Map<string, any>();

  const pushCandidate = (row: any) => {
    if (!row?.tollId) return;
    if (row.confidence < UNLINKED_PICKER_MIN_CONFIDENCE) return;
    const existing = byTollId.get(row.tollId);
    if (!existing || (row.matchType === "claim" && existing.matchType !== "claim") || row.confidence > existing.confidence) {
      byTollId.set(row.tollId, row);
    }
  };

  for (const claim of ctx.claims) {
    if (!claim || typeof claim !== "object") continue;
    if (claim.driverId !== driverId) continue;
    if (!isEligibleUnlinkedShortfallClaim(claim)) continue;
    // Already applied to a different unlinked trip
    if (claim.unlinkedTripId && claim.unlinkedTripId !== trip.id) continue;

    const remaining = remainingClaimShortfall(claim);
    const toll = resolveTollFromContext(ctx, claim.transactionId);
    // Skip if underlying toll was closed in Personal Use / Deadhead / dispute steps
    if (toll && !isEligibleUnlinkedShortfallToll(toll) && toll.matchTypeCode !== "AMOUNT_VARIANCE") {
      // Claim can still be eligible on its own (open underpaid claim); only
      // hard-block when the toll itself is clearly personal/deadhead/resolved.
      const stage = toll.workflowStage || "";
      if (
        stage.startsWith("personal_use") ||
        stage.startsWith("deadhead") ||
        toll.resolution === "personal"
      ) continue;
    }
    const tollAmount = Math.abs(Number(claim.expectedAmount ?? toll?.amount ?? claim.amount) || 0);
    const claimDate = toll?.date || claim.date || claim.createdAt || trip.date;
    const confidence = scoreUnlinkedShortfallMatch({
      tripRefund,
      tripDate: trip.date,
      remainingShortfall: remaining,
      tollAmount,
      claimOrTollDate: claimDate,
    });
    const leftover = leftoverAfterApply(remaining, tripRefund);
    const tollPlatform = extractTollPlatform(toll, claim, ctx);
    const tollPlatformNorm = normalizePlatformServer(tollPlatform);
    pushCandidate({
      claimId: claim.id,
      tollId: claim.transactionId,
      tripId: trip.id,
      tripRefund,
      tollAmount,
      remainingShortfall: remaining,
      leftoverShortfall: leftover,
      coversFully: coversShortfallFully(remaining, tripRefund),
      confidence,
      date: claimDate,
      claimStatus: claim.status,
      location: toll?.location || toll?.plaza || claim.subject || null,
      matchType: "claim",
      tripPlatform,
      tollPlatform,
      platformMismatch: !!(
        tripPlatformNorm &&
        tollPlatformNorm &&
        tripPlatformNorm !== tollPlatformNorm
      ),
    });
  }

  // Only ledger underpaid rows without a usable open claim — never amount-proximity-only.
  const claimTollIds = new Set(
    ctx.claims
      .filter((c: any) => c?.driverId === driverId && isEligibleUnlinkedShortfallClaim(c))
      .map((c: any) => c.transactionId)
      .filter(Boolean),
  );

  for (const toll of ctx.ledger) {
    if (!toll || typeof toll !== "object" || toll.driverId !== driverId) continue;
    if (!isEligibleUnlinkedShortfallToll(toll)) continue;
    // Prefer the claim row when one already exists for this toll
    if (toll.id && claimTollIds.has(toll.id)) continue;
    if (toll.claimId) {
      const linkedClaim = ctx.claims.find((c: any) => c?.id === toll.claimId);
      if (linkedClaim && !isEligibleUnlinkedShortfallClaim(linkedClaim)) continue;
      if (linkedClaim && isEligibleUnlinkedShortfallClaim(linkedClaim)) continue; // already pushed via claim loop
    }

    const tollAmount = Math.abs(Number(toll.amount) || 0);
    const confidence = scoreUnlinkedShortfallMatch({
      tripRefund,
      tripDate: trip.date,
      remainingShortfall: tollAmount,
      tollAmount,
      claimOrTollDate: toll.date || trip.date,
    });
    const leftover = leftoverAfterApply(tollAmount, tripRefund);
    const tollPlatform = extractTollPlatform(toll, null, ctx);
    const tollPlatformNorm = normalizePlatformServer(tollPlatform);
    pushCandidate({
      claimId: toll.claimId || null,
      tollId: toll.id,
      tripId: trip.id,
      tripRefund,
      tollAmount,
      remainingShortfall: tollAmount,
      leftoverShortfall: leftover,
      coversFully: coversShortfallFully(tollAmount, tripRefund),
      confidence,
      date: toll.date,
      claimStatus: null,
      location: toll.location || toll.plaza || toll.description || toll.vendor || null,
      matchType: "toll",
      tripPlatform,
      tollPlatform,
      platformMismatch: !!(
        tripPlatformNorm &&
        tollPlatformNorm &&
        tripPlatformNorm !== tollPlatformNorm
      ),
    });
  }

  return Array.from(byTollId.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

async function applyUnlinkedRefundToClaim(
  tripId: string,
  claimId: string | null,
  tollId: string | null,
  c: unknown,
  opts?: { acknowledgedPlatformMismatch?: boolean; rejectOnPlatformMismatch?: boolean },
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  // Dynamic import avoids circular init with claim_service ↔ toll_controller.
  const { upsertClaim: upsertClaimFn } = await import("./claim_service.ts");
  const trip = await kv.get(`trip:${tripId}`);
  if (!trip) return { ok: false, status: 404, error: `Trip ${tripId} not found` };

  const { tollTx, trips } = await loadAllTollLedgerWithTrips();
  const linkedTripIds = new Set(tollTx.filter((tx: any) => tx.tripId).map((tx: any) => tx.tripId));
  if (!isUnresolvedRefund(trip, linkedTripIds)) {
    return { ok: false, status: 409, error: `Trip ${tripId} is not an unresolved unlinked refund` };
  }

  const tripRefund = Math.abs(Number(trip.tollCharges) || 0);
  if (tripRefund <= 0) return { ok: false, status: 400, error: "Trip has no tollCharges to apply" };

  let claim: any = claimId ? await kv.get(`claim:${claimId}`) : null;
  let resolvedTollId = tollId || claim?.transactionId || null;

  if (!claim && resolvedTollId) {
    const toll = await loadTollForUnlinkedMatch(resolvedTollId);
    if (!toll) return { ok: false, status: 404, error: `Toll ${resolvedTollId} not found` };
    if (!isEligibleUnlinkedShortfallToll(toll)) {
      return {
        ok: false,
        status: 409,
        error: "That toll was already handled in an earlier step (Personal Use, Deadhead, or Dispute). Pick an open underpaid shortfall instead.",
      };
    }
    const tollAmount = Math.abs(Number(toll.amount) || 0);
    const matchedTrip = toll.tripId ? trips.find((t: any) => t?.id === toll.tripId) : null;
    const platformRefund = Math.abs(Number(matchedTrip?.tollCharges) || 0);
    const initialShortfall = computeChargeShortfall(tollAmount, platformRefund, 0);
    claim = await upsertClaimFn(
      {
        type: "Toll_Refund",
        status: "Open",
        driverId: trip.driverId || toll.driverId,
        driverName: trip.driverName || toll.driverName,
        vehicleId: trip.vehicleId || toll.vehicleId,
        tripId: toll.tripId || undefined,
        transactionId: resolvedTollId,
        amount: initialShortfall > 0 ? initialShortfall : tollAmount,
        expectedAmount: tollAmount,
        paidAmount: platformRefund,
        subject: `Unlinked refund applied from trip ${tripId}`,
        message: `Platform trip refund $${tripRefund.toFixed(2)} applied toward underpaid toll.`,
        date: toll.date || trip.date,
      },
      c,
      { syncMode: "skip" },
    );
    claimId = claim.id;
  }

  if (!claim) return { ok: false, status: 400, error: "claimId or tollId is required" };
  if (!isEligibleUnlinkedShortfallClaim(claim)) {
    return {
      ok: false,
      status: 409,
      error: "That toll was already handled in an earlier step (Personal Use, Deadhead, or Dispute). Pick an open underpaid shortfall instead.",
    };
  }
  if (claim.unlinkedTripId && claim.unlinkedTripId !== tripId) {
    return { ok: false, status: 409, error: `Claim already linked to unlinked trip ${claim.unlinkedTripId}` };
  }

  resolvedTollId = claim.transactionId || resolvedTollId;
  const tollForPlatform = resolvedTollId
    ? (await loadTollForUnlinkedMatch(resolvedTollId)) || tollTx.find((t: any) => t.id === resolvedTollId)
    : null;

  const tripById = new Map<string, any>();
  for (const t of trips || []) {
    if (t?.id) tripById.set(t.id, t);
  }
  const ctxForPlatform: UnlinkedShortfallContext = {
    claims: [claim],
    ledger: tollTx,
    tollById: new Map(tollTx.filter((t: any) => t?.id).map((t: any) => [t.id, t])),
    trips: trips || [],
    tripById,
  };
  const tripPlatform = trip.platform ? String(trip.platform) : null;
  const tollPlatform = extractTollPlatform(tollForPlatform, claim, ctxForPlatform);
  const tripPlatformNorm = normalizePlatformServer(tripPlatform);
  const tollPlatformNorm = normalizePlatformServer(tollPlatform);
  const platformMismatch = !!(
    tripPlatformNorm &&
    tollPlatformNorm &&
    tripPlatformNorm !== tollPlatformNorm
  );

  if (platformMismatch) {
    console.warn(
      `[UnlinkedShortfall] Platform mismatch: trip ${tripId} (${tripPlatform}) → toll ${resolvedTollId} (${tollPlatform})`,
    );
    if (opts?.rejectOnPlatformMismatch && !opts?.acknowledgedPlatformMismatch) {
      return {
        ok: false,
        status: 409,
        error: `Platform mismatch: ${tripPlatform} refund cannot be applied to ${tollPlatform} toll without acknowledgment`,
      };
    }
  }

  const wasChargeDriver = claim.status === "Resolved" && claim.resolutionReason === "Charge Driver";
  const alreadyReimbursed = claim.status === "Resolved" && claim.resolutionReason === "Reimbursed";
  const remaining = wasChargeDriver
    ? Math.abs(Number(claim.amount) || 0)
    : alreadyReimbursed
      ? Math.abs(Number(claim.expectedAmount ?? claim.amount) || 0)
      : remainingClaimShortfall(claim);
  const applied = Math.min(tripRefund, remaining || tripRefund);
  const leftover = leftoverAfterApply(remaining || tripRefund, tripRefund);
  const fullyCovered = coversShortfallFully(remaining || tripRefund, tripRefund);

  const priorPaid = Math.abs(Number(claim.paidAmount) || 0);
  const nextPaid = priorPaid + applied;
  const priorStatus = claim.status;
  const priorReason = claim.resolutionReason || null;
  const priorAmount = claim.amount;

  if (alreadyReimbursed) {
    // Claim already manually reimbursed — only clear the unlinked trip link.
  } else if (fullyCovered) {
    await upsertClaimFn(
      {
        ...claim,
        status: "Resolved",
        resolutionReason: "Reimbursed",
        paidAmount: nextPaid,
        amount: wasChargeDriver ? claim.amount : Math.max(0, Math.abs(Number(claim.amount) || 0) - applied),
        unlinkedTripId: tripId,
        unlinkedSourcePlatform: tripPlatform,
        preUnlinkedStatus: priorStatus,
        preUnlinkedResolutionReason: priorReason,
        preUnlinkedPaidAmount: priorPaid,
        preUnlinkedAmount: priorAmount,
      },
      c,
      { syncMode: "force" },
    );
  } else {
    // Always force-sync so driver financials stay consistent with the claim ledger.
    // Note: even when driverTollChargeSyncEnabled is OFF, canonical ledger events
    // are still written; the flag only controls the driver-visible transaction:* projection.
    await upsertClaimFn(
      {
        ...claim,
        status: claim.status === "Resolved" ? "Open" : claim.status,
        resolutionReason: claim.status === "Resolved" ? null : claim.resolutionReason,
        paidAmount: nextPaid,
        amount: leftover,
        unlinkedTripId: tripId,
        unlinkedSourcePlatform: tripPlatform,
        preUnlinkedStatus: priorStatus,
        preUnlinkedResolutionReason: priorReason,
        preUnlinkedPaidAmount: priorPaid,
        preUnlinkedAmount: priorAmount,
      },
      c,
      { syncMode: "force" },
    );
  }

  await applyRefundResolution({
    tripId,
    resolution: "expense_logged",
    existingLedgerId: resolvedTollId || undefined,
    auto: false,
    notes: `Applied unlinked trip refund $${tripRefund.toFixed(2)} to underpaid claim ${claim.id} (leftover $${leftover.toFixed(2)})`,
    source: `system:unlinked_shortfall:${claim.id}`,
    driverId: trip.driverId,
    appliedToClaimId: claim.id,
    appliedToTollId: resolvedTollId,
  });

  if (resolvedTollId) {
    try {
      const existingToll = await loadTollForUnlinkedMatch(resolvedTollId);
      // Do NOT overwrite the underpaid toll's original tripId with the unlinked
      // refund trip — that was the Matched History Uber/Roam platform bug.
      // Keep original tripId; store refund provenance on unlinkedSource*.
      await updateTollLedgerEntry(
        resolvedTollId,
        {
          isReconciled: true,
          matchedAt: new Date().toISOString(),
          matchedBy: "unlinked-shortfall",
          unlinkedSourceTripId: tripId,
          unlinkedSourcePlatform: tripPlatform,
          unlinkedAppliedAt: new Date().toISOString(),
          unlinkedAppliedBy: "admin",
          preUnlinkedTripId: existingToll?.tripId || existingToll?.preUnlinkedTripId || null,
        },
        "reconciled",
        "system-unlinked-shortfall",
      );
      await recomputeAndPersistWorkflowStage(resolvedTollId);
    } catch (err: any) {
      console.warn(`[UnlinkedShortfall] toll link warn: ${err?.message}`);
    }
  }

  return {
    ok: true,
    data: {
      tripId,
      claimId: claim.id,
      tollId: resolvedTollId,
      tripRefund,
      applied,
      leftoverShortfall: leftover,
      coversFully: fullyCovered,
      platformMismatch,
      tripPlatform,
      tollPlatform,
    },
  };
}

/**
 * Reverse an Apply-to-Underpaid: restore claim (via force sync), clear toll
 * provenance, and return the trip to the unresolved Unlinked Refunds queue.
 * Also repairs split state when the trip was reset to pending but the claim
 * was left Reimbursed (legacy/basic Undo).
 */
async function findClaimByUnlinkedTripId(tripId: string): Promise<any | null> {
  const claims = (await loadAllByPrefix("claim:")) as any[];
  return claims.find((c) => c?.unlinkedTripId === tripId) ?? null;
}

function isTripPendingUnlinkedRefund(trip: any): boolean {
  const status = trip?.tollRefundResolution?.status;
  return !status || status === "pending";
}

async function restoreClaimFromUnlinkedApply(
  claim: any,
  tripId: string,
  tripRefund: number,
  c: unknown,
): Promise<string> {
  const { upsertClaim: upsertClaimFn } = await import("./claim_service.ts");
  const restoredStatus = claim.preUnlinkedStatus || "Open";
  const restoredReason = claim.preUnlinkedResolutionReason ?? null;
  const restoredPaid =
    typeof claim.preUnlinkedPaidAmount === "number"
      ? claim.preUnlinkedPaidAmount
      : Math.max(0, Math.abs(Number(claim.paidAmount) || 0) - tripRefund);
  const restoredAmount =
    typeof claim.preUnlinkedAmount === "number"
      ? claim.preUnlinkedAmount
      : Math.abs(Number(claim.expectedAmount ?? claim.amount) || 0);

  await upsertClaimFn(
    {
      ...claim,
      status: restoredStatus,
      resolutionReason: restoredReason,
      paidAmount: restoredPaid,
      amount: restoredAmount,
      unlinkedTripId: null,
      unlinkedSourcePlatform: null,
      preUnlinkedStatus: null,
      preUnlinkedResolutionReason: null,
      preUnlinkedPaidAmount: null,
      preUnlinkedAmount: null,
    },
    c,
    { syncMode: "force" },
  );
  return restoredStatus;
}

async function clearTollAfterUnlinkedUndo(tollId: string | null, tripId: string): Promise<void> {
  if (!tollId) return;
  try {
    const toll = await loadTollForUnlinkedMatch(tollId);
    await updateTollLedgerEntry(
      tollId,
      {
        unlinkedSourceTripId: null,
        unlinkedSourcePlatform: null,
        unlinkedAppliedAt: null,
        unlinkedAppliedBy: null,
        ...(toll?.preUnlinkedTripId
          ? { tripId: toll.preUnlinkedTripId, preUnlinkedTripId: null }
          : toll?.tripId === tripId
            ? { tripId: null, preUnlinkedTripId: null }
            : { preUnlinkedTripId: null }),
        matchedBy: toll?.matchedBy === "unlinked-shortfall" ? null : toll?.matchedBy ?? null,
      },
      "updated",
      "undo-unlinked-apply",
    );
    await recomputeAndPersistWorkflowStage(tollId);
  } catch (err: any) {
    console.warn(`[UnlinkedShortfall:Undo] toll clear warn: ${err?.message}`);
  }
}

/** Trip pending + claim still linked — repair without touching trip resolution. */
async function repairUnlinkedApplySplitForTrip(
  tripId: string,
  c: unknown,
): Promise<{ repaired: boolean; claimId?: string; tollId?: string | null; restoredClaimStatus?: string }> {
  const claim = await findClaimByUnlinkedTripId(tripId);
  if (!claim?.unlinkedTripId || claim.unlinkedTripId !== tripId) {
    return { repaired: false };
  }
  const trip = await kv.get(`trip:${tripId}`);
  if (!trip || !isTripPendingUnlinkedRefund(trip)) return { repaired: false };

  const tripRefund = Math.abs(Number(trip.tollCharges) || 0);
  const restoredStatus = await restoreClaimFromUnlinkedApply(claim, tripId, tripRefund, c);
  const tollId = claim.transactionId || null;
  await clearTollAfterUnlinkedUndo(tollId, tripId);

  console.log(
    `[TollReconciliation:RepairSplit] Trip ${tripId} pending — claim ${claim.id} reverted to ${restoredStatus}`,
  );
  return { repaired: true, claimId: claim.id, tollId, restoredClaimStatus: restoredStatus };
}

async function repairAllUnlinkedApplySplits(
  c: unknown,
  driverId?: string,
): Promise<{ repaired: number; items: Array<{ tripId: string; claimId?: string; restoredClaimStatus?: string }> }> {
  const claims = (await loadAllByPrefix("claim:")) as any[];
  const items: Array<{ tripId: string; claimId?: string; restoredClaimStatus?: string }> = [];
  for (const claim of claims) {
    if (!claim?.unlinkedTripId) continue;
    if (driverId && claim.driverId !== driverId) continue;
    const result = await repairUnlinkedApplySplitForTrip(claim.unlinkedTripId, c);
    if (result.repaired) {
      items.push({
        tripId: claim.unlinkedTripId,
        claimId: result.claimId,
        restoredClaimStatus: result.restoredClaimStatus,
      });
    }
  }
  return { repaired: items.length, items };
}

async function undoApplyUnlinkedRefundToClaim(
  tripId: string,
  c: unknown,
  opts?: { skipUndoGate?: boolean },
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  if (!opts?.skipUndoGate) {
    const settings = await getRefundAutomationSettings();
    if (!settings.unlinkedRefundUndoEnabled) {
      return {
        ok: false,
        status: 403,
        error: "Undo Apply to Underpaid is disabled. Enable unlinkedRefundUndoEnabled in Toll Automation Settings.",
      };
    }
  }

  const trip = await kv.get(`trip:${tripId}`);
  if (!trip) return { ok: false, status: 404, error: `Trip ${tripId} not found` };

  const linkedClaim = await findClaimByUnlinkedTripId(tripId);
  const resolution = trip.tollRefundResolution;

  // Split repair: basic Undo left trip pending but claim still Reimbursed.
  if (isTripPendingUnlinkedRefund(trip) && linkedClaim) {
    const repair = await repairUnlinkedApplySplitForTrip(tripId, c);
    if (repair.repaired) {
      return {
        ok: true,
        data: {
          mode: "repair_split",
          tripId,
          claimId: repair.claimId,
          tollId: repair.tollId,
          restoredClaimStatus: repair.restoredClaimStatus,
        },
      };
    }
  }

  if (!resolution || resolution.status !== "expense_logged") {
    return { ok: false, status: 409, error: "Trip was not applied to a claim via Apply to Underpaid" };
  }

  const source = String(resolution.source || "");
  const claimIdFromSource = source.startsWith("system:unlinked_shortfall:")
    ? source.slice("system:unlinked_shortfall:".length)
    : null;
  const claimId = resolution.appliedToClaimId || claimIdFromSource || linkedClaim?.id;
  const tollId = resolution.appliedToTollId || resolution.linkedTollLedgerId || linkedClaim?.transactionId || null;
  const tripRefund = Math.abs(Number(trip.tollCharges) || 0);

  let restoredClaimStatus: string | null = null;

  if (claimId) {
    const claim = (await kv.get(`claim:${claimId}`)) || linkedClaim;
    if (claim && (!claim.unlinkedTripId || claim.unlinkedTripId === tripId)) {
      restoredClaimStatus = await restoreClaimFromUnlinkedApply(claim, tripId, tripRefund, c);
    }
  }

  await clearTollAfterUnlinkedUndo(tollId, tripId);

  const now = new Date().toISOString();
  await kv.set(`trip:${tripId}`, {
    ...trip,
    tollRefundResolution: {
      status: "pending",
      resolvedBy: "admin",
      resolvedAt: now,
      auto: false,
      notes: resolution.notes,
      source: "admin:undo_unlinked_apply",
      appliedToClaimId: null,
      appliedToTollId: null,
      undoneAt: now,
    },
  });

  console.log(
    `[TollReconciliation:UndoApply] Trip ${tripId} restored, claim ${claimId || "n/a"} reverted to ${restoredClaimStatus || "n/a"}`,
  );

  return {
    ok: true,
    data: {
      mode: "full_undo",
      tripId,
      claimId,
      tollId,
      restoredClaimStatus,
    },
  };
}

// ─── GET /unlinked-shortfall-suggestions ─────────────────────────────────
app.get(`${BASE}/unlinked-shortfall-suggestions`, async (c) => {
  try {
    const { driverId, from, to } = parseQueryParams(c);
    const loaded = await loadAllTollLedgerWithTrips();
    const tollTx = filterByDriver(loaded.tollTx, driverId);
    let trips = filterByDriver(loaded.trips, driverId);
    // Period-scoped when wizard passes from/to — avoid scoring every historical unlinked trip.
    trips = filterByDateRange(trips, from, to);
    const linkedTripIds = new Set(tollTx.filter((tx: any) => tx.tripId).map((tx: any) => tx.tripId));
    const unresolved = trips.filter((t: any) => isUnresolvedRefund(t, linkedTripIds));

    const ctx = await loadUnlinkedShortfallContext(tollTx);
    const suggestions: Record<string, any[]> = {};
    for (const t of unresolved) {
      const ranked = computeUnlinkedShortfallSuggestions(t, ctx);
      if (ranked.length > 0) suggestions[t.id] = ranked;
    }
    return c.json({ success: true, suggestions });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /unlinked-shortfall-suggestions error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /unlinked-refunds/apply-to-claim ───────────────────────────────
app.post(`${BASE}/unlinked-refunds/apply-to-claim`, async (c) => {
  try {
    const body = await c.req.json();
    const tripId = body?.tripId;
    const claimId = body?.claimId || null;
    const tollId = body?.tollId || null;
    if (!tripId) return c.json({ error: "tripId is required" }, 400);
    if (!claimId && !tollId) return c.json({ error: "claimId or tollId is required" }, 400);
    const result = await applyUnlinkedRefundToClaim(tripId, claimId, tollId, c, {
      acknowledgedPlatformMismatch: body?.acknowledgedPlatformMismatch === true,
      rejectOnPlatformMismatch: body?.rejectOnPlatformMismatch === true,
    });
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ success: true, data: result.data });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /unlinked-refunds/apply-to-claim error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /unlinked-refunds/undo-apply ───────────────────────────────────
app.post(`${BASE}/unlinked-refunds/undo-apply`, async (c) => {
  try {
    const body = await c.req.json();
    const tripId = body?.tripId;
    if (!tripId) return c.json({ error: "tripId is required" }, 400);
    const result = await undoApplyUnlinkedRefundToClaim(tripId, c);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ success: true, data: result.data });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /unlinked-refunds/undo-apply error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /unlinked-refunds/repair-split ─────────────────────────────────
/** Auto-fix claims left Reimbursed after a partial (trip-only) undo. */
app.post(`${BASE}/unlinked-refunds/repair-split`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const tripId = body?.tripId as string | undefined;
    const driverId = body?.driverId as string | undefined;
    if (tripId) {
      const result = await repairUnlinkedApplySplitForTrip(tripId, c);
      return c.json({
        success: true,
        repaired: result.repaired ? 1 : 0,
        items: result.repaired ? [{ tripId, ...result }] : [],
      });
    }
    const batch = await repairAllUnlinkedApplySplits(c, driverId);
    return c.json({ success: true, repaired: batch.repaired, items: batch.items });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /unlinked-refunds/repair-split error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /resolve-refund ────────────────────────────────────────────────
app.post(`${BASE}/resolve-refund`, async (c) => {
  try {
    const { tripId, resolution, notes, driverId } = await c.req.json();
    const valid: RefundResolutionStatus[] = ["cash_wash", "phantom", "expense_logged", "pending"];
    if (!tripId || !resolution || !valid.includes(resolution)) {
      return c.json({ error: `tripId and a valid resolution (${valid.join(", ")}) are required` }, 400);
    }
    const result = await applyRefundResolution({ tripId, resolution, notes, driverId, auto: false });
    return c.json({ success: true, data: result });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /resolve-refund error: ${e.message}`);
    return c.json({ error: e.message }, e.message?.includes("not found") ? 404 : 500);
  }
});

// ─── POST /resolve-refund/bulk ───────────────────────────────────────────
app.post(`${BASE}/resolve-refund/bulk`, async (c) => {
  try {
    const body = await c.req.json();
    const items: Array<{ tripId: string; resolution: RefundResolutionStatus; notes?: string; driverId?: string }> =
      Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return c.json({ error: "items[] is required" }, 400);

    const valid: RefundResolutionStatus[] = ["cash_wash", "phantom", "expense_logged", "pending"];
    let resolved = 0;
    const errors: Array<{ tripId: string; error: string }> = [];
    for (const it of items) {
      if (!it.tripId || !valid.includes(it.resolution)) {
        errors.push({ tripId: it.tripId, error: "invalid item" });
        continue;
      }
      try {
        await applyRefundResolution({ ...it, auto: false });
        resolved++;
      } catch (err: any) {
        errors.push({ tripId: it.tripId, error: err.message });
      }
    }
    return c.json({ success: true, resolved, failed: errors.length, errors });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /resolve-refund/bulk error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /resolved-refunds ───────────────────────────────────────────────
// Trips whose unlinked refund has been resolved (any non-pending status).
app.get(`${BASE}/resolved-refunds`, async (c) => {
  try {
    const { driverId, limit, offset, from, to } = parseQueryParams(c);
    const loaded = await loadAllTollLedgerWithTrips();
    const trips = filterByDriver(loaded.trips, driverId);

    // Phase F4: optional period scoping for the gated reconciliation wizard.
    const resolved = filterByDateRange(
      trips.filter((t: any) => t.tollRefundResolution && t.tollRefundResolution.status !== "pending"),
      from,
      to,
    );
    resolved.sort((a: any, b: any) => {
      const ra = a.tollRefundResolution?.resolvedAt || a.date;
      const rb = b.tollRefundResolution?.resolvedAt || b.date;
      return new Date(rb).getTime() - new Date(ra).getTime();
    });

    const total = resolved.length;
    const page = resolved.slice(offset, offset + limit);
    return c.json({ success: true, data: page, total, limit, offset });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /resolved-refunds error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET/PUT /automation-settings ────────────────────────────────────────
app.get(`${BASE}/automation-settings`, async (c) => {
  try {
    const settings = await getRefundAutomationSettings();
    return c.json({ success: true, data: settings });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.put(`${BASE}/automation-settings`, async (c) => {
  try {
    const body = await c.req.json();
    const current = await getRefundAutomationSettings();
    const next: RefundAutomationSettings = {
      refundAutomationEnabled:
        typeof body?.refundAutomationEnabled === "boolean"
          ? body.refundAutomationEnabled
          : current.refundAutomationEnabled,
      refundAutoMinConfidence:
        typeof body?.refundAutoMinConfidence === "number"
          ? Math.max(50, Math.min(100, body.refundAutoMinConfidence))
          : current.refundAutoMinConfidence,
      disputeRefundAutoMinConfidence:
        typeof body?.disputeRefundAutoMinConfidence === "number"
          ? Math.max(50, Math.min(100, body.disputeRefundAutoMinConfidence))
          : current.disputeRefundAutoMinConfidence,
      personalUseDetectionEnabled:
        typeof body?.personalUseDetectionEnabled === "boolean"
          ? body.personalUseDetectionEnabled
          : current.personalUseDetectionEnabled,
      orphanProximityMinutes:
        typeof body?.orphanProximityMinutes === "number" && body.orphanProximityMinutes > 0
          ? Math.max(15, Math.min(1440, body.orphanProximityMinutes))
          : current.orphanProximityMinutes,
      driverTollChargeSyncEnabled:
        typeof body?.driverTollChargeSyncEnabled === "boolean"
          ? body.driverTollChargeSyncEnabled
          : current.driverTollChargeSyncEnabled,
      unifiedTollSettlementEnabled:
        typeof body?.unifiedTollSettlementEnabled === "boolean"
          ? body.unifiedTollSettlementEnabled
          : current.unifiedTollSettlementEnabled,
      matchOnIngestEnabled:
        typeof body?.matchOnIngestEnabled === "boolean"
          ? body.matchOnIngestEnabled
          : current.matchOnIngestEnabled,
      disputeRefundTripSyncEnabled:
        typeof body?.disputeRefundTripSyncEnabled === "boolean"
          ? body.disputeRefundTripSyncEnabled
          : current.disputeRefundTripSyncEnabled,
      unlinkedRefundUndoEnabled:
        typeof body?.unlinkedRefundUndoEnabled === "boolean"
          ? body.unlinkedRefundUndoEnabled
          : current.unlinkedRefundUndoEnabled,
    };
    await kv.set(REFUND_SETTINGS_KEY, next);
    return c.json({ success: true, data: next });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// NATIVE RIDES → FLEET TOLL LEDGER BRIDGE (Phase 4)
// ═══════════════════════════════════════════════════════════════════════
// Geofence-detected toll crossings on native "Roam Driver" rides live in the
// Postgres table rides.ride_toll_crossings and are invisible to fleet
// reconciliation. This bridge mirrors each crossing into a toll_ledger:*
// expense (source = roam_geofence) so it flows through the same matcher.
//
// Safety: idempotent (keyed on the crossing id via a toll_bridge:crossing:*
// dedup marker → re-runs never double-insert), additive (creates new ledger
// rows only; never mutates rides data), and dry-run capable.

const TOLL_BRIDGE_DEDUP_PREFIX = "toll_bridge:crossing:";

async function loadRideTollCrossings(limit: number): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .schema("rides")
      .from("ride_toll_crossings")
      .select(
        "id, ride_request_id, toll_plaza_id, toll_plaza_name, toll_amount_minor, currency, crossed_at, driver_lat, driver_lng",
      )
      .order("crossed_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[TollBridge] Failed to load ride_toll_crossings:", error.message);
      return [];
    }
    return data || [];
  } catch (e: any) {
    console.error("[TollBridge] loadRideTollCrossings error:", e.message);
    return [];
  }
}

/** Fetch ride context (driver/completion) for a set of ride_request ids. */
async function loadRideContext(rideIds: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (rideIds.length === 0) return map;
  try {
    const { data, error } = await supabase
      .schema("rides")
      .from("ride_requests")
      .select("id, assigned_driver_user_id, completed_at, status")
      .in("id", rideIds);
    if (error) {
      console.error("[TollBridge] Failed to load ride context:", error.message);
      return map;
    }
    for (const r of data || []) map.set(r.id, r);
  } catch (e: any) {
    console.error("[TollBridge] loadRideContext error:", e.message);
  }
  return map;
}

async function bridgeRideTollCrossings(opts: { dryRun: boolean; limit: number }): Promise<{
  scanned: number;
  bridged: number;
  skipped: number;
  dryRun: boolean;
}> {
  const crossings = await loadRideTollCrossings(opts.limit);
  const rideIds = [...new Set(crossings.map((x) => x.ride_request_id).filter(Boolean))];
  const rideCtx = await loadRideContext(rideIds);

  let bridged = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const x of crossings) {
    const dedupKey = `${TOLL_BRIDGE_DEDUP_PREFIX}${x.id}`;
    const existing = await kv.get(dedupKey);
    if (existing) {
      skipped++;
      continue;
    }
    if (opts.dryRun) {
      bridged++; // would-bridge count
      continue;
    }

    const ride = rideCtx.get(x.ride_request_id);
    const amountMajor = Number(x.toll_amount_minor || 0) / 100;
    const ledgerId = crypto.randomUUID();
    const entry: TollLedgerRecord = {
      id: ledgerId,
      createdAt: now,
      updatedAt: now,
      vehicleId: null,
      vehiclePlate: null,
      // Do NOT fabricate a fleet driver identity — keep the rides-side id in
      // metadata and leave driverId unassigned for admin/matcher to resolve.
      driverId: null,
      driverName: null,
      tollTagId: null,
      tagNumber: null,
      plaza: x.toll_plaza_name || null,
      highway: null,
      location: x.toll_plaza_name || null,
      date: String(x.crossed_at || now).split("T")[0],
      time: null,
      type: "usage",
      amount: -Math.abs(amountMajor),
      paymentMethod: "fleet_account",
      status: "pending",
      resolution: null,
      isReconciled: false,
      tripId: null,
      matchConfidence: null,
      matchedAt: null,
      matchedBy: null,
      batchId: null,
      batchName: null,
      importedAt: now,
      sourceFile: null,
      receiptUrl: null,
      referenceNumber: x.id || null,
      description: `Toll crossing (Roam geofence): ${x.toll_plaza_name || "Toll"}`,
      notes: null,
      auditTrail: [],
      metadata: {
        source: "roam_geofence",
        rideTollCrossingId: x.id,
        rideRequestId: x.ride_request_id,
        tollPlazaId: x.toll_plaza_id,
        currency: x.currency || "JMD",
        driverLat: x.driver_lat,
        driverLng: x.driver_lng,
        crossedAt: x.crossed_at,
        driverUserId: ride?.assigned_driver_user_id || null,
        rideStatus: ride?.status || null,
      },
    };

    try {
      await saveTollLedgerEntry(entry);
      await kv.set(dedupKey, { ledgerId, bridgedAt: now });
      bridged++;
      // MOI-3: same ingest-time match computation as the /transactions path.
      await computeAndPersistTollMatchOnIngest(entry);
    } catch (err: any) {
      console.error(`[TollBridge] Failed to bridge crossing ${x.id}: ${err.message}`);
    }
  }

  console.log(
    `[TollBridge] ${opts.dryRun ? "DRY-RUN " : ""}scanned=${crossings.length} bridged=${bridged} skipped=${skipped}`,
  );
  return { scanned: crossings.length, bridged, skipped, dryRun: opts.dryRun };
}

// ─── POST /bridge-rides ──────────────────────────────────────────────────
app.post(`${BASE}/bridge-rides`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const limit = Math.max(1, Math.min(5000, Number(body?.limit) || 1000));
    const result = await bridgeRideTollCrossings({ dryRun, limit });
    return c.json({ success: true, ...result });
  } catch (e: any) {
    console.log(`[TollReconciliation] POST /bridge-rides error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /export ───────────────────────────────────────────────────────
// Returns ALL toll transactions with flattened reconciliation data for CSV export.
// No pagination — dumps everything in one response.

app.get(`${BASE}/export`, async (c) => {
  try {
    // Phase 5: Read from toll_ledger:* (single source of truth)
    const { tollTx, trips: allTrips } = await loadAllTollLedgerWithTrips();

    if (tollTx.length === 0) {
      return c.json({ success: true, data: [], total: 0 });
    }

    // ── Step 1: Classify reconciliation status ──
    const matched: any[] = [];
    const unmatched: any[] = [];

    for (const tx of tollTx) {
      if (tx.isReconciled && tx.tripId) {
        (tx as any)._reconStatus = "Matched";
        matched.push(tx);
      } else if (tx.isReconciled && !tx.tripId) {
        // Dismissed / Rejected / Resolved without trip link
        (tx as any)._reconStatus = "Dismissed";
      } else if (tx.status === "Approved") {
        (tx as any)._reconStatus = "Approved";
      } else {
        (tx as any)._reconStatus = "Unmatched";
        unmatched.push(tx);
      }
    }

    // ── Step 2: Batch-fetch linked trips for matched transactions ──
    const tripLookup: Record<string, any> = {};
    const matchedTripIds = [...new Set(matched.map((tx: any) => tx.tripId).filter(Boolean))];
    if (matchedTripIds.length > 0) {
      const tripKeys = matchedTripIds.map((id: string) => `trip:${id}`);
      try {
        const tripValues = await kv.mget(tripKeys);
        matchedTripIds.forEach((id: string, idx: number) => {
          if (tripValues[idx]) {
            tripLookup[id] = tripValues[idx];
          }
        });
      } catch {
        console.log("[TollReconciliation] GET /export: mget for linked trips failed, proceeding without trip enrichment");
      }
    }

    // ── Step 3: Compute suggestions for unmatched transactions ──
    const suggestionsMap: Record<string, MatchResult[]> = {};
    if (unmatched.length > 0) {
      const timezone = await getFleetTimezone();
      const puSettings = await getRefundAutomationSettings();
      const driverAliasMap = await getDriverAliasMap();
      for (const tx of unmatched) {
        const matches = findTollMatchesServer(tx, allTrips, timezone, driverAliasMap);
        if (matches.length > 0) {
          suggestionsMap[tx.id] = matches;
        } else if (puSettings.personalUseDetectionEnabled) {
          const orphan = buildOrphanSuggestion(
            tx,
            allTrips,
            timezone,
            puSettings.orphanProximityMinutes,
          );
          if (orphan) suggestionsMap[tx.id] = [orphan];
        }
      }
    }

    // ── Step 4: Flatten each transaction into an export row ──
    const rows = tollTx.map((tx: any) => {
      const reconStatus: string = (tx as any)._reconStatus;
      const absAmount = Math.abs(Number(tx.amount) || 0);

      // Extract time from date if it contains "T", else use tx.time
      let timeStr = tx.time || "";
      if (!timeStr && tx.date && tx.date.includes("T")) {
        const tPart = tx.date.split("T")[1];
        if (tPart) timeStr = tPart.replace(/[Z+-].*$/, "");
      }
      const dateOnly =
        typeof tx.date === "string" && tx.date.includes("T")
          ? tx.date.slice(0, 10)
          : (tx.date || "");

      // Base row — transaction fields
      const row: Record<string, any> = {
        id: tx.id || "",
        // Canonical: date-only string for consistent filtering/grouping in UI
        date: dateOnly,
        time: timeStr,
        vehicleId: tx.vehicleId || "",
        vehiclePlate: tx.vehiclePlate || "",
        driverId: tx.driverId || "",
        driverName: tx.driverName || "",
        plaza: tx.tollPlaza || tx.vendor || tx.description || "",
        type: tx.type || "",
        paymentMethod: tx.paymentMethod || "",
        amount: tx.amount ?? "",
        absAmount,
        status: tx.status || "",
        description: tx.description || "",
        referenceTagId: tx.tollTagId || tx.metadata?.tagId || "",
        batchId: tx.batchId || "",
        // Reconciliation status
        reconciliationStatus: reconStatus,
        resolution: tx.metadata?.resolution || "",
      };

      // Match details (only for "Matched")
      if (reconStatus === "Matched" && tx.tripId) {
        const linkedTrip = tripLookup[tx.tripId];
        row.matchedTripId = tx.tripId;
        row.matchedTripDate = linkedTrip?.date || "";
        row.matchedTripPlatform = linkedTrip?.platform || tx.metadata?.matchedTripPlatform || "";
        row.matchedTripPickup = (linkedTrip?.pickupLocation || "").substring(0, 40);
        row.matchedTripDropoff = (linkedTrip?.dropoffLocation || "").substring(0, 40);
        row.reconciledAt = tx.metadata?.reconciledAt || tx.metadata?.matchedAt || "";
        row.reconciledBy = tx.metadata?.reconciledBy || tx.metadata?.matchedBy || "";
        // Financial
        const tripTollCharges = linkedTrip?.tollCharges || 0;
        const variance = tripTollCharges - absAmount;
        row.tripTollCharges = tripTollCharges;
        row.refundAmount = variance >= 0 ? variance : 0;
        row.lossAmount = variance < 0 ? Math.abs(variance) : 0;
      } else {
        row.matchedTripId = "";
        row.matchedTripDate = "";
        row.matchedTripPlatform = "";
        row.matchedTripPickup = "";
        row.matchedTripDropoff = "";
        row.reconciledAt = "";
        row.reconciledBy = "";
        row.tripTollCharges = "";
        row.refundAmount = "";
        row.lossAmount = "";
      }

      // Suggestion status (only for "Unmatched")
      if (reconStatus === "Unmatched") {
        const suggestions = suggestionsMap[tx.id];
        row.hasSuggestions = suggestions && suggestions.length > 0 ? "Yes" : "No";
        row.isAmbiguous = suggestions?.[0]?.isAmbiguous ? "Yes" : "No";
        row.topSuggestionScore = suggestions?.[0]?.confidenceScore ?? "";
        row.topSuggestionTripId = suggestions?.[0]?.tripId || "";
        row.suggestionCount = suggestions?.length || 0;
      } else {
        row.hasSuggestions = "";
        row.isAmbiguous = "";
        row.topSuggestionScore = "";
        row.topSuggestionTripId = "";
        row.suggestionCount = "";
      }

      return row;
    });

    // Sort by date descending (most recent first)
    rows.sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Clean up temporary _reconStatus property
    for (const tx of tollTx) {
      delete (tx as any)._reconStatus;
    }

    console.log(`[TollReconciliation] GET /export: returning ${rows.length} toll transactions`);

    return c.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /export error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /unified-events (IDEA 2 read model) ────────────────────────────

app.get(`${BASE}/unified-events`, async (c) => {
  try {
    const q = parseUnifiedQueryParams(c);
    const out = await projectUnifiedTollEventsPage(q);
    if (!out.ok) {
      return c.json({ error: out.error }, out.status);
    }

    const meta: TollUnifiedEventsMeta = {
      schemaVersion: TOLL_FINANCIAL_EVENT_SCHEMA_VERSION,
      limit: out.limit,
      offset: q.offset,
      total: out.total,
      sourcesIncluded: out.sourcesIncluded,
      droppedDuplicatesCount: out.droppedDuplicatesCount,
      durationMs: out.durationMs,
    };

    console.log(
      `[TollReconciliation] GET /unified-events rows=${out.total} page=${out.page.length} deduped=${out.droppedDuplicatesCount} ${out.durationMs}ms`,
    );

    return c.json({
      success: true,
      data: out.page,
      meta,
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /unified-events error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /unified-events/export (CSV) ──────────────────────────────────

app.get(`${BASE}/unified-events/export`, async (c) => {
  try {
    const q = parseUnifiedQueryParams(c);
    const out = await projectUnifiedTollEventsPage(q);
    if (!out.ok) {
      return c.json({ error: out.error }, out.status);
    }
    const { page, total, droppedDuplicatesCount } = out;

    const headers = [
      "eventId",
      "kind",
      "kindLabel",
      "sourceSystem",
      "amount",
      "currency",
      "driverId",
      "driverName",
      "occurredAt",
      "workflowState",
      "batchId",
      "tripId",
      "matchedTollId",
      "description",
      "schemaVersion",
    ];
    const lines = [
      headers.join(","),
      ...page.map((e: TollFinancialEvent) =>
        [
          csvEscapeCell(e.eventId),
          csvEscapeCell(e.kind),
          csvEscapeCell(e.kindLabel),
          csvEscapeCell(e.sourceSystem),
          csvEscapeCell(String(e.amount)),
          csvEscapeCell(e.currency),
          csvEscapeCell(e.driverId),
          csvEscapeCell(e.driverName || ""),
          csvEscapeCell(e.occurredAt),
          csvEscapeCell(e.workflowState),
          csvEscapeCell(e.batchId || ""),
          csvEscapeCell(e.tripId || ""),
          csvEscapeCell(e.matchedTollId || ""),
          csvEscapeCell(e.description || ""),
          csvEscapeCell(String(e.schemaVersion)),
        ].join(","),
      ),
    ];
    const csv = lines.join("\r\n");

    console.log(
      `[TollReconciliation] GET /unified-events/export bytes=${csv.length} rows=${total} page=${page.length} deduped=${droppedDuplicatesCount}`,
    );

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="toll_unified_events_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    console.log(`[TollReconciliation] GET /unified-events/export error: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

/**
 * Reconcile a toll to a trip as a side effect of a dispute-refund match
 * (dispute_refund_controller.tsx's `PATCH /:id/match`), so a toll resolved
 * that way ends up in the exact same state as one resolved via "Flag for
 * Claim" in the Underpaid & Claims step (which reconciles first, then
 * claims) — same write shape as `POST /reconcile`, but as a standalone
 * function rather than touching that already-live route. Idempotent: a
 * no-op if the toll already has a different trip linked (never overwrites
 * an existing reconciliation), and safe to call with a trip that no longer
 * exists (just skips).
 */
async function reconcileTollForDisputeMatch(transactionId: string, tripId: string): Promise<void> {
  try {
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry || tollEntry.tripId) return; // already linked (to this trip or another) — don't clobber

    const trip = await kv.get(`trip:${tripId}`) as any;
    if (!trip) return;

    const tx = tollLedgerToTxShape(tollEntry);

    await updateTollLedgerEntry(
      transactionId,
      {
        status: "reconciled",
        tripId,
        isReconciled: true,
        driverId: trip.driverId || tx.driverId,
        driverName: trip.driverName || tx.driverName,
      },
      "reconciled",
      "dispute-refund-match",
    );
    await recomputeAndPersistWorkflowStage(transactionId);

    await writeTollLedgerEntry({
      eventType: "toll_reconciled",
      category: "Toll Reconciliation",
      description: `Toll matched to trip via dispute refund: ${(trip.pickupLocation || "").substring(0, 30)} → ${(trip.dropoffLocation || "").substring(0, 30)}`,
      grossAmount: Math.abs(Number(tx.amount) || 0),
      netAmount: 0,
      direction: "neutral",
      sourceType: "reconciliation",
      sourceId: transactionId,
      driverId: tx.driverId || trip.driverId || "unknown",
      driverName: tx.driverName || trip.driverName || "Unknown",
      vehicleId: tx.vehicleId || trip.vehicleId,
      date: tx.date,
      metadata: {
        tripId,
        matchedAt: new Date().toISOString(),
        matchedBy: "dispute-refund-match",
        tollAmount: Math.abs(Number(tx.amount) || 0),
        tripTollCharges: trip.tollCharges || 0,
      },
    });
  } catch (err: any) {
    console.log(`[TollReconciliation] reconcileTollForDisputeMatch failed for toll ${transactionId} → trip ${tripId}: ${err.message}`);
  }
}

export default app;

// ── Exported helpers for dual-write (Phase 3) ───────────────────────────────
export {
  saveTollLedgerEntry,
  getTollLedgerEntry,
  updateTollLedgerEntry,
  deleteTollLedgerEntry,
  transactionToTollLedgerServer,
  isTollCategory,
};

// ── Exported helpers for dispute-refund → trip/settlement sync ─────────────
export {
  applyRefundResolution,
  isUnresolvedRefund,
  loadAllTollLedgerWithTrips,
  getRefundAutomationSettings,
};
export type { RefundAutomationSettings };

// ── Exported helpers for the persisted toll-workflow state (RWF-1) ─────────
export { recomputeAndPersistWorkflowStage, undoApplyUnlinkedRefundToClaim };

// ── Exported helpers for the period aggregation endpoint (Phase F2) ────────
export { loadAllByPrefix, loadDisputeRefundRecords, filterByDriver };

// ── Exported helpers for dispute-refund match candidates ───────────────────
export { findTollMatchesServer, pickBestValidTollMatch, reconcileTollForDisputeMatch, getDriverAliasMap };
export type { TollWorkflowStage };