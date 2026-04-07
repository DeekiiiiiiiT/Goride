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
import { appendCanonicalTollReconciledBatch, type TollReconcileAuditEntry } from "./canonical_from_ops.ts";
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
    isReconciled: entry.status === "reconciled" || !!entry.tripId,
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
    const unclaimedRefunds = trips.filter(
      (t: any) => (t.tollCharges && t.tollCharges > 0) && !linkedTripIds.has(t.id),
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
        unreconciledCount: unreconciled.length,
        reconciledCount: reconciled.length,
        unclaimedRefundsCount: unclaimedRefunds.length,
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
  try {
    const { driverId, limit, offset } = parseQueryParams(c);

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

    const total = unreconciled.length;

    // Compute match suggestions for the current page
    const page = unreconciled.slice(offset, offset + limit);

    const timezone = await getFleetTimezone();
    const suggestionsMap: Record<string, MatchResult[]> = {};
    for (const tx of page) {
      const matches = findTollMatchesServer(tx, trips, timezone);
      if (matches.length > 0) {
        suggestionsMap[tx.id] = matches;
      }
    }

    // ── Phase 1: Auto-confirm PERFECT_MATCH suggestions ──────────────
    // Tolls where the amount matches within 5 cents AND the toll occurred
    // during an active trip are automatically reconciled server-side.
    // They never appear in the Unmatched list — they go straight to
    // Matched History tagged as "system-auto" so the admin can distinguish
    // them from manual confirmations.
    let autoReconciled = 0;
    const autoReconciledIds = new Set<string>();

    for (const [txId, matches] of Object.entries(suggestionsMap)) {
      const best = matches[0];
      if (best?.matchType !== "PERFECT_MATCH") continue;

      // Find the tx object in the page array
      const tx = page.find((t: any) => t.id === txId);
      if (!tx) continue;

      // Guard: skip if already reconciled (race condition protection)
      if (tx.isReconciled && tx.tripId) continue;

      // Guard: skip if admin previously un-matched this auto-match
      if (tx.metadata?.autoMatchOverridden) continue;

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

    // Remove auto-reconciled items from page & suggestions before returning
    const finalPage = page.filter(
      (tx: any) => !autoReconciledIds.has(tx.id),
    );
    for (const id of autoReconciledIds) {
      delete suggestionsMap[id];
    }
    const adjustedTotal = total - autoReconciled;

    return c.json({
      success: true,
      data: finalPage,
      suggestions: suggestionsMap,
      total: adjustedTotal,
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

    // Unclaimed: trips with tollCharges > 0 but no linked toll tx
    const unclaimed = trips.filter(
      (t: any) =>
        t.tollCharges && t.tollCharges > 0 && !linkedTripIds.has(t.id),
    );

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

// ─── GET /toll-logs ────────────────────────────────────────────────────
// Canonical toll data endpoint. Returns ALL toll-category transactions
// with linked trip data pre-embedded. Supports filtering by vehicleId,
// tagNumber, driverId, and category. Used by useTollLogs, TollTagDetail,
// and TollTopupHistory.

app.get(`${BASE}/toll-logs`, async (c) => {
  try {
    // ── Parse query filters ──
    const vehicleId = c.req.query("vehicleId") || undefined;
    const tagNumber = c.req.query("tagNumber") || undefined;
    const driverId = c.req.query("driverId") || undefined;
    const category = c.req.query("category") || undefined;
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit"), 10) : undefined;
    const offset = parseInt(c.req.query("offset") || "0", 10);

    // ── Load toll transactions: ledger + legacy transaction:* (merged) ──
    let tollTx = await loadMergedTollTxArray();

    // ── Apply filters ──
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
      filters: { vehicleId: vehicleId || null, tagNumber: tagNumber || null, driverId: driverId || null, category: category || null },
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
    const { transactionId, resolution, notes } = await c.req.json();
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

    // Phase 6: Read from toll_ledger (single source of truth)
    const tollEntry = await getTollLedgerEntry(transactionId);
    if (!tollEntry) return c.json({ error: `Toll ${transactionId} not found` }, 404);

    // Convert to tx shape for response compatibility
    const tx = tollLedgerToTxShape(tollEntry);

    const amount = Math.abs(Number(tollEntry.amount) || 0);

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
    const ledgerResolution: "personal" | "business" | "write_off" | null =
      resolution === "Personal" ? "personal" :
      resolution === "Business" ? "business" :
      resolution === "WriteOff" ? "write_off" : null;
    
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

    // Write ledger entry
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
        claimId,
        claimResolutionReason,
        notes,
        resolvedAt: new Date().toISOString(),
      },
    });

    console.log(
      `[TollReconciliation] Resolved tx ${transactionId} as ${resolution} (claim ${claimId})`,
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
      for (const tx of unmatched) {
        const matches = findTollMatchesServer(tx, allTrips, timezone);
        if (matches.length > 0) {
          suggestionsMap[tx.id] = matches;
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