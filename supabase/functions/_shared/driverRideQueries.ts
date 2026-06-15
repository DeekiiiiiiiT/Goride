/**
 * Shared ride_requests queries for driver app, driver admin, and platform ledger.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RidePaymentMethod = "cash" | "card";
export type DriverEarningsPeriod = "today" | "week" | "all";

const JAMAICA_TZ = "America/Jamaica";
/** Roam driver work week: Monday 04:00 → next Monday 04:00 (America/Jamaica, no DST). */
const WORK_WEEK_START_HOUR_JAMAICA = 4;
/** Jamaica is UTC−5 year-round. */
const JAMAICA_UTC_OFFSET_HOURS = 5;

const WEEKDAY_MON_OFFSET: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const LEDGER_TRIP_COLUMNS =
  "fare_final_minor, fare_estimate_minor, payment_method, currency, completed_at, updated_at, status, cash_received_minor";
const LEGACY_TRIP_COLUMNS =
  "fare_final_minor, fare_estimate_minor, currency, updated_at, created_at, status";

export interface ListDriverTripsOpts {
  driverUserId?: string;
  riderUserId?: string;
  page?: number;
  limit?: number;
  status?: string;
  payment_method?: RidePaymentMethod;
  from?: string;
  to?: string;
  q?: string;
  /** Filter ledger listings by completion time when available. */
  dateField?: "created_at" | "completed_at";
  grain?: "trip" | "line";
  /** Filter trips/lines to those with a ledger line of this kind. */
  lineKind?: string;
  /** Internal: restrict to specific ride request ids (from lineKind resolution). */
  rideIds?: string[];
}

export interface ListDriverTripsResult {
  trips: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

function isMissingLedgerColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") &&
    (m.includes("payment_method") ||
      m.includes("completed_at") ||
      m.includes("cash_received_minor"))
  );
}

/** Physical cash received on a cash trip; falls back to fare when settlement was not recorded. */
export function effectiveCashInHandMinor(
  row: Record<string, unknown>,
  fareMinor: number,
  isCashTrip: boolean,
): number {
  if (!isCashTrip) return 0;
  const raw = row.cash_received_minor;
  if (raw != null && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.floor(Number(raw)));
  }
  return fareMinor;
}

function effectiveFareMinor(row: Record<string, unknown>): number {
  const final = row.fare_final_minor;
  const estimate = row.fare_estimate_minor;
  const n = final != null ? Number(final) : Number(estimate);
  return Number.isFinite(n) ? n : 0;
}

function applyTripFilters(
  query: ReturnType<SupabaseClient["from"]>,
  opts: ListDriverTripsOpts,
  legacyMode: boolean,
) {
  let q = query;
  if (opts.driverUserId) {
    q = q.eq("assigned_driver_user_id", opts.driverUserId);
  }
  if (opts.riderUserId) {
    q = q.eq("rider_user_id", opts.riderUserId);
  }
  if (opts.rideIds && opts.rideIds.length > 0) {
    q = q.in("id", opts.rideIds);
  }
  if (opts.status?.trim()) {
    q = q.eq("status", opts.status.trim());
  }
  if (!legacyMode && opts.payment_method) {
    q = q.eq("payment_method", opts.payment_method);
  }
  const dateCol = !legacyMode && opts.dateField === "completed_at" ? "completed_at" : "created_at";
  if (opts.from) {
    q = q.gte(dateCol, opts.from);
  }
  if (opts.to) {
    q = q.lte(dateCol, opts.to);
  }
  if (opts.q?.trim()) {
    q = q.ilike("pickup_address", `%${opts.q.trim()}%`);
  }
  return q;
}

async function listFromTable(
  db: SupabaseClient,
  table: string,
  opts: ListDriverTripsOpts,
  legacyMode = false,
): Promise<ListDriverTripsResult | { error: string }> {
  const page = Math.max(1, Number(opts.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(opts.limit ?? 25)));
  const offset = (page - 1) * limit;

  let countQuery = applyTripFilters(
    db.from(table).select("*", { count: "exact", head: true }),
    opts,
    legacyMode,
  );
  let { count, error: countErr } = await countQuery;

  if (countErr && isMissingLedgerColumnError(countErr.message) && !legacyMode) {
    return listFromTable(db, table, opts, true);
  }
  if (countErr) return { error: countErr.message };

  let dataQuery = applyTripFilters(db.from(table).select("*"), opts, legacyMode)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  let { data, error } = await dataQuery;

  if (error && isMissingLedgerColumnError(error.message) && !legacyMode) {
    return listFromTable(db, table, opts, true);
  }
  if (error) return { error: error.message };

  return {
    trips: (data ?? []) as Record<string, unknown>[],
    total: count ?? 0,
    page,
    limit,
  };
}

const DRIVER_ACTIVE_RIDE_STATUSES = [
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
  "awaiting_cash_settlement",
];

/** Ignore stale in-progress rows left over from crashed/test sessions. */
const ACTIVE_RIDE_MAX_AGE_MS = 4 * 60 * 60 * 1000;

function activeRideFreshSinceIso(): string {
  return new Date(Date.now() - ACTIVE_RIDE_MAX_AGE_MS).toISOString();
}

/** Driver user ids with a recent in-progress trip (exclude from new offers). */
export async function loadDriverUserIdsWithActiveRides(
  ridesDb: SupabaseClient,
  publicDb: SupabaseClient,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const freshSince = activeRideFreshSinceIso();
  for (const [db, table] of [[ridesDb, "ride_requests"], [publicDb, "rides_ride_requests"]] as const) {
    const { data } = await db
      .from(table)
      .select("assigned_driver_user_id")
      .in("status", DRIVER_ACTIVE_RIDE_STATUSES)
      .not("assigned_driver_user_id", "is", null)
      .gte("updated_at", freshSince);
    for (const row of data ?? []) {
      const uid = row.assigned_driver_user_id as string | null;
      if (uid) ids.add(uid);
    }
  }
  return ids;
}

async function getActiveRideFromTable(
  db: SupabaseClient,
  table: string,
  driverUserId: string,
): Promise<Record<string, unknown> | null | { error: string }> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("assigned_driver_user_id", driverUserId)
    .in("status", DRIVER_ACTIVE_RIDE_STATUSES)
    .gte("updated_at", activeRideFreshSinceIso())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  return data as Record<string, unknown> | null;
}

/** Current in-progress trip for a driver (if any). */
export async function getDriverActiveRideRequest(
  ridesDb: SupabaseClient,
  publicDb: SupabaseClient,
  driverUserId: string,
): Promise<Record<string, unknown> | null | { error: string }> {
  const native = await getActiveRideFromTable(ridesDb, "ride_requests", driverUserId);
  if (!("error" in native)) return native;

  const pub = await getActiveRideFromTable(publicDb, "rides_ride_requests", driverUserId);
  if (!("error" in pub)) return pub;

  return { error: pub.error };
}

/** List trips from rides schema, falling back to public.rides_ride_requests. */
export async function listDriverRideRequests(
  ridesDb: SupabaseClient,
  publicDb: SupabaseClient,
  opts: ListDriverTripsOpts,
): Promise<ListDriverTripsResult | { error: string }> {
  let effectiveOpts = opts;
  if (opts.lineKind) {
    const { data, error } = await ridesDb
      .from("ledger_lines")
      .select("ride_request_id")
      .eq("line_kind", opts.lineKind);
    if (error) return { error: error.message };
    const rideIds = [...new Set((data ?? []).map((r) => String(r.ride_request_id)))];
    if (rideIds.length === 0) {
      const page = Math.max(1, Number(opts.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(opts.limit ?? 25)));
      return { trips: [], total: 0, page, limit };
    }
    effectiveOpts = { ...opts, rideIds };
  }

  const native = await listFromTable(ridesDb, "ride_requests", effectiveOpts);
  if (!("error" in native)) return native;

  const pub = await listFromTable(publicDb, "rides_ride_requests", effectiveOpts);
  if (!("error" in pub)) return pub;

  return { error: pub.error };
}

interface JamaicaLocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: string;
}

function jamaicaLocalParts(at: Date): JamaicaLocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    weekday: get("weekday"),
  };
}

/** Jamaica local civil time → UTC epoch ms (fixed UTC−5). */
function jamaicaLocalToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): number {
  return Date.UTC(year, month - 1, day, hour + JAMAICA_UTC_OFFSET_HOURS, minute, second);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number } {
  const t = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
  };
}

/** Current work week [start, end) in UTC ms: Monday 04:00 Jamaica → next Monday 04:00. */
export function jamaicaWorkWeekBounds(at: Date = new Date()): { startMs: number; endMs: number } {
  const p = jamaicaLocalParts(at);
  const daysFromMonday = WEEKDAY_MON_OFFSET[p.weekday] ?? 0;
  let anchor = addCalendarDays(p.year, p.month, p.day, -daysFromMonday);
  // Before Monday 04:00 → still in the previous work week
  if (daysFromMonday === 0 && p.hour < WORK_WEEK_START_HOUR_JAMAICA) {
    anchor = addCalendarDays(anchor.year, anchor.month, anchor.day, -7);
  }
  const startMs = jamaicaLocalToUtcMs(
    anchor.year,
    anchor.month,
    anchor.day,
    WORK_WEEK_START_HOUR_JAMAICA,
  );
  const endAnchor = addCalendarDays(anchor.year, anchor.month, anchor.day, 7);
  const endMs = jamaicaLocalToUtcMs(
    endAnchor.year,
    endAnchor.month,
    endAnchor.day,
    WORK_WEEK_START_HOUR_JAMAICA,
  );
  return { startMs, endMs };
}

/** Calendar today [start, end) in UTC ms: midnight → midnight Jamaica. */
function jamaicaTodayBounds(at: Date = new Date()): { startMs: number; endMs: number } {
  const p = jamaicaLocalParts(at);
  const startMs = jamaicaLocalToUtcMs(p.year, p.month, p.day, 0, 0, 0);
  const next = addCalendarDays(p.year, p.month, p.day, 1);
  const endMs = jamaicaLocalToUtcMs(next.year, next.month, next.day, 0, 0, 0);
  return { startMs, endMs };
}

function instantInRange(iso: string, startMs: number, endMs: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= startMs && t < endMs;
}

/** Whether completion falls in calendar today or the Mon 04:00 work week (Jamaica). */
export function completedInJamaicaPeriod(
  completedAt: string | null | undefined,
  period: Exclude<DriverEarningsPeriod, "all">,
  at: Date = new Date(),
): boolean {
  if (!completedAt) return false;
  if (period === "today") {
    const { startMs, endMs } = jamaicaTodayBounds(at);
    return instantInRange(completedAt, startMs, endMs);
  }
  const { startMs, endMs } = jamaicaWorkWeekBounds(at);
  return instantInRange(completedAt, startMs, endMs);
}

export interface DriverEarningsAggregate {
  period: DriverEarningsPeriod;
  cash_minor: number;
  digital_minor: number;
  total_minor: number;
  cash_in_hand_minor: number;
  currency: string;
  trip_count: number;
  digital_payments_enabled: boolean;
}

function rowCompletedAt(r: Record<string, unknown>): string | null {
  return (r.completed_at as string | null) ?? (r.updated_at as string | null);
}

async function aggregateFromTable(
  db: SupabaseClient,
  table: string,
  driverUserId: string,
  period: DriverEarningsPeriod,
  legacyMode = false,
): Promise<DriverEarningsAggregate | { error: string }> {
  const columns = legacyMode ? LEGACY_TRIP_COLUMNS : LEDGER_TRIP_COLUMNS;
  const { data, error } = await db.from(table)
    .select(columns)
    .eq("assigned_driver_user_id", driverUserId)
    .eq("status", "completed");

  if (error && isMissingLedgerColumnError(error.message) && !legacyMode) {
    return aggregateFromTable(db, table, driverUserId, period, true);
  }
  if (error) return { error: error.message };

  let cash_minor = 0;
  let digital_minor = 0;
  let cash_in_hand_minor = 0;
  let currency = "JMD";
  let trip_count = 0;

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    if (period !== "all") {
      const completedAt = rowCompletedAt(r);
      if (!completedInJamaicaPeriod(completedAt, period)) continue;
    }
    const fare = effectiveFareMinor(r);
    const method = r.payment_method as string | null;
    const isCashTrip = method !== "card";
    currency = (r.currency as string) || currency;
    trip_count += 1;
    if (method === "card") {
      digital_minor += fare;
    } else {
      cash_minor += fare;
      cash_in_hand_minor += effectiveCashInHandMinor(r, fare, isCashTrip);
    }
  }

  return {
    period,
    cash_minor,
    digital_minor,
    total_minor: cash_minor + digital_minor,
    cash_in_hand_minor,
    currency,
    trip_count,
    digital_payments_enabled: false,
  };
}

export async function aggregateDriverEarnings(
  ridesDb: SupabaseClient,
  publicDb: SupabaseClient,
  driverUserId: string,
  period: DriverEarningsPeriod,
): Promise<DriverEarningsAggregate | { error: string }> {
  const native = await aggregateFromTable(ridesDb, "ride_requests", driverUserId, period);
  if (!("error" in native)) return native;

  const pub = await aggregateFromTable(publicDb, "rides_ride_requests", driverUserId, period);
  if (!("error" in pub)) return pub;

  return { error: pub.error };
}
