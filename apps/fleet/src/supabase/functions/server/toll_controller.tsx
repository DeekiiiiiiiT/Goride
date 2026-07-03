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
import { emitDriverTollCharge } from "./driver_toll_charge.ts";
import { appendCanonicalTollReconciledBatch, type TollReconcileAuditEntry } from "./canonical_from_ops.ts";
import { deleteCanonicalLedgerBySource } from "./ledger_canonical.ts";
import { applyEvidenceResolution } from "./evidence_routes.ts";
import { getFleetTimezone, naiveToUtc, hasTzSuffix } from "./timezone_helper.tsx";
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

interface TripWindows {
  activeStart: Date;
  activeEnd: Date;
  approachStart: Date;
  approachEnd: Date;
  searchStart: Date;
  searchEnd: Date;
}

function calculateTripTimes(trip: any): TripTimes {
  const dropoffStr = trip.dropoffTime || trip.date;
  const dropoffTime = parseISO(dropoffStr);

  const requestStr = trip.requestTime || trip.date;
  const requestTime = parseISO(requestStr);

  let pickupTime: Date;
  if (trip.startTime) {
    pickupTime = parseISO(trip.startTime);
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
function assessDataQuality(trip: any): DataQuality {
  const tripTimes = calculateTripTimes(trip);
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
  const driverMatch = !!(
    txDriverId &&
    tripDriverId &&
    txDriverId === tripDriverId
  );
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

function isAmountMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < VARIANCE_THRESHOLD;
}

function getTransactionDateTime(tx: any, timezone: string): Date | null {
  try {
    // If the datetime already has a TZ suffix, parse directly
    if (tx.date && tx.date.includes("T")) {
      if (hasTzSuffix(tx.date)) {
        return new Date(tx.date);
      }
      // Naive ISO-ish string — interpret in fleet timezone
      return naiveToUtc(tx.date, timezone);
    }
    // Separate date + time fields — combine and interpret in fleet timezone
    const timeStr = tx.time || "00:00:00";
    const naiveStr = `${tx.date}T${timeStr}`;
    return naiveToUtc(naiveStr, timezone);
  } catch {
    return null;
  }
}

function findTollMatchesServer(
  transaction: any,
  trips: any[],
  timezone: string,
): MatchResult[] {
  const txDate = getTransactionDateTime(transaction, timezone);
  if (!txDate) return [];

  const matches: MatchResult[] = [];

  // Phase 6: Replace hard vehicle/driver gate with time-based pre-filter
  const candidateTrips = sameDayPreFilter(txDate, trips);

  for (const trip of candidateTrips) {
    const tripTimes = calculateTripTimes(trip);
    if (!tripTimes.isValid) continue;

    const windows = getTripWindows(tripTimes);
    const dataQuality = assessDataQuality(trip);

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
    });

    // null = toll fell outside all windows, skip
    if (!scoreResult) continue;

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

  // Sort by confidence score descending, then by time difference ascending
  matches.sort((a, b) => {
    const scoreA = a.confidenceScore || 0;
    const scoreB = b.confidenceScore || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.timeDifferenceMinutes - b.timeDifferenceMinutes;
  });

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

  return {
    tripId: "", // no trip — prevents any auto-link / auto-charge downstream
    confidence: cls.confidence,
    reason: "No trip explains this toll (personal use)",
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
  return { driverId, limit, offset };
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
  return { driverId, limit, offset, autoMatch };
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

function filterByDriver(items: any[], driverId?: string): any[] {
  if (!driverId) return items;
  return items.filter((item: any) => item.driverId === driverId);
}

// ─── GET /summary ──────────────────────────────────────────────────────

app.get(`${BASE}/summary`, async (c) => {
  try {
    const { driverId } = parseQueryParams(c);

    // Phase 5: Read from toll_ledger:* (single source of truth)
    const loaded = await loadAllTollLedgerWithTrips();
    let tollTx = loaded.tollTx;
    let trips = loaded.trips;

    if (driverId) {
      tollTx = filterByDriver(tollTx, driverId);
      trips = filterByDriver(trips, driverId);
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

// ─── GET /unreconciled ─────────────────────────────────────────────────

app.get(`${BASE}/unreconciled`, async (c) => {
  const t0 = Date.now();
  try {
    const { driverId, limit, offset, autoMatch } = parseUnreconciledQueryParams(c);

    // Phase 5: Read from toll_ledger:* (single source of truth)
    const loaded = await loadAllTollLedgerWithTrips();
    let tollTx = loaded.tollTx;
    let trips = loaded.trips;

    if (driverId) {
      tollTx = filterByDriver(tollTx, driverId);
      trips = filterByDriver(trips, driverId);
    }

    // Unreconciled filter (same logic as the hook)
    const unreconciled = tollTx.filter((tx: any) => {
      const isCashClaim =
        tx.paymentMethod === "Cash" || !!tx.receiptUrl;
      if (isCashClaim) {
        return tx.status === "Pending" && !tx.isReconciled;
      }
      return !tx.isReconciled || !tx.tripId;
    });

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

      const matches = findTollMatchesServer(tx, trips, timezone);
      const best = matches[0];
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
      const matches = findTollMatchesServer(tx, trips, timezone);
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
    const { driverId, limit, offset } = parseQueryParams(c);

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
    const candidates = trips.filter((t: any) => isUnresolvedRefund(t, linkedTripIds));

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
    const { driverId, limit, offset } = parseQueryParams(c);

    const allTollTx = await loadMergedTollTxArray();

    let reconciled = allTollTx.filter(
      (tx: any) => tx.isReconciled && tx.tripId,
    );

    if (driverId) {
      reconciled = filterByDriver(reconciled, driverId);
    }

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
        driverId: trip.driverId || tx.driverId,
        driverName: trip.driverName || tx.driverName,
      },
      "reconciled",
      "admin"
    );

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
        metadata: wasAutoMatched ? { autoMatchOverridden: true } : undefined,
      },
      "unreconciled",
      "admin"
    );

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
        notes: notes || undefined,
      },
      "approved",
      "admin"
    );

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
        notes: reason || undefined,
      },
      "rejected",
      "admin"
    );

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
        claimResolutionReason = "Write Off"; // Business expense = fleet cost
        ledgerEventType = "toll_business_expense";
        ledgerDirection = "outflow";
        ledgerNetAmount = -amount;
        ledgerDescription = `Toll classified as business expense: ${tx.description || tx.vendor || "Toll"}`;
        break;
      default:
        return c.json({ error: "Invalid resolution" }, 400);
    }

    // Phase 6: Write ONLY to toll_ledger (single source of truth)
    await updateTollLedgerEntry(
      transactionId,
      {
        status: tx.status === "Approved" ? "resolved" : "rejected",
        resolution: ledgerResolution,
        notes: notes || undefined,
      },
      "resolved",
      "admin"
    );

    // Update local tx object for response (not persisted to transaction:*)
    tx.isReconciled = true;

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
    };
    await kv.set(`claim:${claimId}`, claim);

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
      unresolved: 0, // still pending
    };
    const counts = { chargedToDriver: 0, writtenOff: 0, business: 0, refunded: 0, reconciled: 0, unresolved: 0 };
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
// Default proximity (minutes) that qualifies a toll as "orphan" (personal use).
// A tighter nested window inside the ±1-day sameDayPreFilter.
const DEFAULT_ORPHAN_PROXIMITY_MINUTES = 180;

interface RefundAutomationSettings {
  refundAutomationEnabled: boolean;
  refundAutoMinConfidence: number;
  // Personal-use (orphan) toll detection — additive, default OFF.
  personalUseDetectionEnabled: boolean;
  orphanProximityMinutes: number;
  // Sync "charge driver" toll resolutions into the driver financial section
  // (materializes the projection txn) — additive, default OFF.
  driverTollChargeSyncEnabled: boolean;
  // Unified toll-settlement rework: one reconciliation-aware calc across all four
  // driver financial tabs (payout stops deducting tolls) — additive, default OFF.
  unifiedTollSettlementEnabled: boolean;
}

async function getRefundAutomationSettings(): Promise<RefundAutomationSettings> {
  const rec = (await kv.get(REFUND_SETTINGS_KEY)) as Partial<RefundAutomationSettings> | null;
  return {
    refundAutomationEnabled: rec?.refundAutomationEnabled === true, // default OFF
    refundAutoMinConfidence:
      typeof rec?.refundAutoMinConfidence === "number"
        ? rec.refundAutoMinConfidence
        : REFUND_AUTO_APPLY_MIN_CONFIDENCE,
    personalUseDetectionEnabled: rec?.personalUseDetectionEnabled === true, // default OFF
    orphanProximityMinutes:
      typeof rec?.orphanProximityMinutes === "number" && rec.orphanProximityMinutes > 0
        ? rec.orphanProximityMinutes
        : DEFAULT_ORPHAN_PROXIMITY_MINUTES,
    driverTollChargeSyncEnabled: rec?.driverTollChargeSyncEnabled === true, // default OFF
    unifiedTollSettlementEnabled: rec?.unifiedTollSettlementEnabled === true, // default OFF
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

  // Persist the resolution on the trip (additive field only).
  trip.tollRefundResolution = {
    status: resolution,
    resolvedBy: auto ? "system-auto" : "admin",
    resolvedAt: now,
    notes: notes || undefined,
    auto,
    confidence: params.confidence,
    linkedTollLedgerId,
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
    const { driverId, limit, offset } = parseQueryParams(c);
    const loaded = await loadAllTollLedgerWithTrips();
    const trips = filterByDriver(loaded.trips, driverId);

    const resolved = trips.filter(
      (t: any) => t.tollRefundResolution && t.tollRefundResolution.status !== "pending",
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
      for (const tx of unmatched) {
        const matches = findTollMatchesServer(tx, allTrips, timezone);
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