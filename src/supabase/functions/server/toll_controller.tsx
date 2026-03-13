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
 */

import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
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
 */
function isTollCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return lower === "toll usage" || lower === "tolls";
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

function getTransactionDateTime(tx: any): Date | null {
  try {
    // Jamaica is UTC-5 year-round (no DST). Toll times from CSV/receipt
    // imports are local Jamaica time, but lack a timezone suffix.
    // Without this offset, Deno (UTC) mis-interprets them as UTC,
    // shifting every toll by 5 hours and producing false matches.
    const JAMAICA_OFFSET = "-05:00";
    const hasTZ = (s: string) => /[Zz]|[+-]\d{2}:\d{2}$/.test(s);

    if (tx.date && tx.date.includes("T")) {
      // Full ISO-ish string — append offset only if missing
      return new Date(hasTZ(tx.date) ? tx.date : tx.date + JAMAICA_OFFSET);
    }
    const timeStr = tx.time || "00:00:00";
    const isoStr = `${tx.date}T${timeStr}${JAMAICA_OFFSET}`;
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return new Date(`${tx.date} ${timeStr}`);
    return d;
  } catch {
    return null;
  }
}

function findTollMatchesServer(
  transaction: any,
  trips: any[],
): MatchResult[] {
  const txDate = getTransactionDateTime(transaction);
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

// ─── Route Helpers ─────────────────────────────────────────────────────

function parseQueryParams(c: any) {
  const driverId = c.req.query("driverId") || undefined;
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  return { driverId, limit, offset };
}

function filterByDriver(items: any[], driverId?: string): any[] {
  if (!driverId) return items;
  return items.filter((item: any) => item.driverId === driverId);
}

// ─── GET /summary ──────────────────────────────────────────────────────

app.get(`${BASE}/summary`, async (c) => {
  try {
    const { driverId } = parseQueryParams(c);

    const [allTx, allTrips] = await Promise.all([
      loadAllTransactions(),
      loadAllTrips(),
    ]);

    // Filter to toll-category transactions
    let tollTx = allTx.filter((tx: any) => isTollCategory(tx.category));
    let trips = allTrips;

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

    const [allTx, allTrips] = await Promise.all([
      loadAllTransactions(),
      loadAllTrips(),
    ]);

    let tollTx = allTx.filter((tx: any) => isTollCategory(tx.category));
    let trips = allTrips;

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

    const suggestionsMap: Record<string, MatchResult[]> = {};
    for (const tx of page) {
      const matches = findTollMatchesServer(tx, trips);
      if (matches.length > 0) {
        suggestionsMap[tx.id] = matches;
      }
    }

    return c.json({
      success: true,
      data: page,
      suggestions: suggestionsMap,
      total,
      limit,
      offset,
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

    const [allTx, allTrips] = await Promise.all([
      loadAllTransactions(),
      loadAllTrips(),
    ]);

    const tollTx = filterByDriver(
      allTx.filter((tx: any) => isTollCategory(tx.category)),
      driverId,
    );
    let trips = filterByDriver(allTrips, driverId);

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

    const allTx = await loadAllTransactions();

    let reconciled = allTx.filter(
      (tx: any) =>
        isTollCategory(tx.category) && tx.isReconciled && tx.tripId,
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

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3: Server-Side Reconciliation Actions (with ledger writes)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a toll-related ledger entry.
 * Mirrors the shape used by generateTransactionLedgerEntry() in index.tsx.
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
  const entry = {
    id,
    date: params.date?.split("T")[0] || new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
    driverId: params.driverId || "unknown",
    driverName: params.driverName || "Unknown",
    vehicleId: params.vehicleId || undefined,
    platform: undefined,
    eventType: params.eventType,
    category: params.category,
    description: params.description,
    grossAmount: params.grossAmount,
    netAmount: params.netAmount,
    currency: "JMD",
    paymentMethod: undefined,
    direction: params.direction,
    isReconciled: true,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    metadata: params.metadata || {},
  };
  await kv.set(`ledger:${id}`, entry);
  console.log(
    `[TollLedger] Written ${params.eventType} ledger entry ${id} for tx ${params.sourceId}`,
  );
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

    const tx = await kv.get(`transaction:${transactionId}`);
    if (!tx) return c.json({ error: `Transaction ${transactionId} not found` }, 404);

    if (!isTollCategory(tx.category)) {
      return c.json(
        { error: `Transaction ${transactionId} is not a toll category (found: ${tx.category})` },
        400,
      );
    }

    if (tx.isReconciled && tx.tripId) {
      return c.json(
        { error: `Transaction ${transactionId} is already reconciled to trip ${tx.tripId}` },
        409,
      );
    }

    const trip = await kv.get(`trip:${tripId}`);
    if (!trip) return c.json({ error: `Trip ${tripId} not found` }, 404);

    // Update transaction
    tx.tripId = tripId;
    tx.isReconciled = true;
    tx.driverId = trip.driverId || tx.driverId;
    tx.driverName = trip.driverName || tx.driverName;
    tx.metadata = {
      ...tx.metadata,
      reconciledAt: new Date().toISOString(),
      reconciledBy: "admin",
      matchedTripPlatform: trip.platform,
    };

    await kv.set(`transaction:${transactionId}`, tx);

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

    const tx = await kv.get(`transaction:${transactionId}`);
    if (!tx) return c.json({ error: `Transaction ${transactionId} not found` }, 404);

    if (!tx.tripId) {
      return c.json(
        { error: `Transaction ${transactionId} has no linked trip to unreconcile` },
        400,
      );
    }

    const previousTripId = tx.tripId;
    const previousTrip = await kv.get(`trip:${previousTripId}`);

    // Clear reconciliation
    tx.tripId = null;
    tx.isReconciled = false;
    tx.metadata = {
      ...tx.metadata,
      unreconciledAt: new Date().toISOString(),
      previousTripId,
    };

    await kv.set(`transaction:${transactionId}`, tx);

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

    const tx = await kv.get(`transaction:${transactionId}`);
    if (!tx) return c.json({ error: `Transaction ${transactionId} not found` }, 404);

    if (!isTollCategory(tx.category)) {
      return c.json(
        { error: `Transaction ${transactionId} is not a toll category (found: ${tx.category})` },
        400,
      );
    }

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
    tx.metadata = {
      ...tx.metadata,
      lastEditedAt: new Date().toISOString(),
      lastEditedBy: "admin",
      editHistory: [
        ...(tx.metadata?.editHistory || []),
        {
          editedAt: new Date().toISOString(),
          fields: Object.keys(appliedUpdates),
          previousValues: Object.fromEntries(
            Object.keys(appliedUpdates).map((k) => [k, tx[k]])
          ),
        },
      ],
    };

    await kv.set(`transaction:${transactionId}`, tx);

    console.log(
      `[TollReconciliation] Edited tx ${transactionId}: ${Object.keys(appliedUpdates).join(", ")}`,
    );

    return c.json({ success: true, data: tx });
  } catch (e: any) {
    console.log(`[TollReconciliation] PATCH /edit error: ${e.message}`);
    return c.json({ error: e.message }, 500);
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

      const updatedTxKeys: string[] = [];
      const updatedTxValues: any[] = [];
      const ledgerKeys: string[] = [];
      const ledgerValues: any[] = [];

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

        // Update transaction
        tx.tripId = tripId;
        tx.isReconciled = true;
        tx.driverId = trip.driverId || tx.driverId;
        tx.driverName = trip.driverName || tx.driverName;
        tx.metadata = {
          ...tx.metadata,
          reconciledAt: new Date().toISOString(),
          reconciledBy: "admin_bulk",
          matchedTripPlatform: trip.platform,
        };

        updatedTxKeys.push(`transaction:${transactionId}`);
        updatedTxValues.push(tx);

        // Build ledger entry
        const ledgerId = crypto.randomUUID();
        ledgerKeys.push(`ledger:${ledgerId}`);
        ledgerValues.push({
          id: ledgerId,
          date: tx.date?.split("T")[0] || new Date().toISOString().split("T")[0],
          createdAt: new Date().toISOString(),
          driverId: tx.driverId || trip.driverId || "unknown",
          driverName: tx.driverName || trip.driverName || "Unknown",
          vehicleId: tx.vehicleId || trip.vehicleId,
          eventType: "toll_reconciled",
          category: "Toll Reconciliation",
          description: `Toll matched to trip (bulk): ${(trip.pickupLocation || "").substring(0, 25)} → ${(trip.dropoffLocation || "").substring(0, 25)}`,
          grossAmount: Math.abs(Number(tx.amount) || 0),
          netAmount: 0,
          currency: "JMD",
          direction: "neutral",
          isReconciled: true,
          sourceType: "reconciliation",
          sourceId: transactionId,
          metadata: {
            tripId,
            matchedAt: new Date().toISOString(),
            matchedBy: "admin_bulk",
            tollAmount: Math.abs(Number(tx.amount) || 0),
            tripTollCharges: trip.tollCharges || 0,
          },
        });

        results.matched++;
      }

      // Batch write transactions + ledger entries
      if (updatedTxKeys.length > 0) {
        await kv.mset(updatedTxKeys, updatedTxValues);
      }
      if (ledgerKeys.length > 0) {
        await kv.mset(ledgerKeys, ledgerValues);
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

    const tx = await kv.get(`transaction:${transactionId}`);
    if (!tx) return c.json({ error: `Transaction ${transactionId} not found` }, 404);

    if (!isTollCategory(tx.category)) {
      return c.json(
        { error: `Transaction ${transactionId} is not a toll category` },
        400,
      );
    }

    tx.status = "Approved";
    tx.isReconciled = true;
    tx.metadata = {
      ...tx.metadata,
      approvedAt: new Date().toISOString(),
      approvedBy: "admin",
      notes: notes || tx.metadata?.notes,
      resolution: "approved",
    };

    await kv.set(`transaction:${transactionId}`, tx);

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

    const tx = await kv.get(`transaction:${transactionId}`);
    if (!tx) return c.json({ error: `Transaction ${transactionId} not found` }, 404);

    if (!isTollCategory(tx.category)) {
      return c.json(
        { error: `Transaction ${transactionId} is not a toll category` },
        400,
      );
    }

    tx.status = "Rejected";
    tx.isReconciled = true; // Rejected = resolved (no longer pending)
    tx.metadata = {
      ...tx.metadata,
      rejectedAt: new Date().toISOString(),
      rejectedBy: "admin",
      rejectionReason: reason || "No reason provided",
      resolution: "rejected",
    };

    await kv.set(`transaction:${transactionId}`, tx);

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

    const tx = await kv.get(`transaction:${transactionId}`);
    if (!tx) return c.json({ error: `Transaction ${transactionId} not found` }, 404);

    if (!isTollCategory(tx.category)) {
      return c.json(
        { error: `Transaction ${transactionId} is not a toll category` },
        400,
      );
    }

    const amount = Math.abs(Number(tx.amount) || 0);

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

    tx.isReconciled = true;
    tx.metadata = {
      ...tx.metadata,
      resolvedAt: new Date().toISOString(),
      resolvedBy: "admin",
      resolution,
      resolutionNotes: notes,
    };

    await kv.set(`transaction:${transactionId}`, tx);

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

export default app;