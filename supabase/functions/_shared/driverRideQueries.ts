/**
 * Shared ride_requests queries for driver app, driver admin, and platform ledger.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RidePaymentMethod = "cash" | "card";
export type DriverEarningsPeriod = "today" | "week" | "all";

const JAMAICA_TZ = "America/Jamaica";

export interface ListDriverTripsOpts {
  driverUserId?: string;
  page?: number;
  limit?: number;
  status?: string;
  payment_method?: RidePaymentMethod;
  from?: string;
  to?: string;
  q?: string;
}

export interface ListDriverTripsResult {
  trips: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
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
) {
  let q = query;
  if (opts.driverUserId) {
    q = q.eq("assigned_driver_user_id", opts.driverUserId);
  }
  if (opts.status?.trim()) {
    q = q.eq("status", opts.status.trim());
  }
  if (opts.payment_method) {
    q = q.eq("payment_method", opts.payment_method);
  }
  if (opts.from) {
    q = q.gte("created_at", opts.from);
  }
  if (opts.to) {
    q = q.lte("created_at", opts.to);
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
): Promise<ListDriverTripsResult | { error: string }> {
  const page = Math.max(1, Number(opts.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(opts.limit ?? 25)));
  const offset = (page - 1) * limit;

  let countQuery = applyTripFilters(db.from(table).select("*", { count: "exact", head: true }), opts);
  const { count, error: countErr } = await countQuery;
  if (countErr) return { error: countErr.message };

  let dataQuery = applyTripFilters(
    db.from(table).select("*"),
    opts,
  ).order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await dataQuery;
  if (error) return { error: error.message };

  return {
    trips: (data ?? []) as Record<string, unknown>[],
    total: count ?? 0,
    page,
    limit,
  };
}

/** List trips from rides schema, falling back to public.rides_ride_requests. */
export async function listDriverRideRequests(
  ridesDb: SupabaseClient,
  publicDb: SupabaseClient,
  opts: ListDriverTripsOpts,
): Promise<ListDriverTripsResult | { error: string }> {
  const native = await listFromTable(ridesDb, "ride_requests", opts);
  if (!("error" in native)) return native;

  const pub = await listFromTable(publicDb, "rides_ride_requests", opts);
  if (!("error" in pub)) return pub;

  return { error: pub.error };
}

const jamaicaDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAMAICA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date string YYYY-MM-DD in America/Jamaica for an instant. */
export function jamaicaDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return jamaicaDateFmt.format(d);
}

function jamaicaTodayKey(): string {
  return jamaicaDateKey(new Date());
}

/** Monday YYYY-MM-DD of the calendar week containing `dateKey` (week starts Monday). */
function jamaicaWeekMondayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + mondayOffset);
  return utc.toISOString().slice(0, 10);
}

/** Whether completed_at falls in today or this calendar week (Mon–Sun) in Jamaica. */
export function completedInJamaicaPeriod(
  completedAt: string | null | undefined,
  period: Exclude<DriverEarningsPeriod, "all">,
): boolean {
  if (!completedAt) return false;
  const key = jamaicaDateKey(completedAt);
  if (period === "today") return key === jamaicaTodayKey();
  return jamaicaWeekMondayKey(key) === jamaicaWeekMondayKey(jamaicaTodayKey());
}

export interface DriverEarningsAggregate {
  period: DriverEarningsPeriod;
  cash_minor: number;
  digital_minor: number;
  currency: string;
  trip_count: number;
  digital_payments_enabled: boolean;
}

async function aggregateFromTable(
  db: SupabaseClient,
  table: string,
  driverUserId: string,
  period: DriverEarningsPeriod,
): Promise<DriverEarningsAggregate | { error: string }> {
  const { data, error } = await db.from(table)
    .select("fare_final_minor, fare_estimate_minor, payment_method, currency, completed_at, status")
    .eq("assigned_driver_user_id", driverUserId)
    .eq("status", "completed");

  if (error) return { error: error.message };

  let cash_minor = 0;
  let digital_minor = 0;
  let currency = "JMD";
  let trip_count = 0;

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    if (period !== "all") {
      const completedAt = r.completed_at as string | null;
      if (!completedInJamaicaPeriod(completedAt, period)) continue;
    }
    const fare = effectiveFareMinor(r);
    const method = r.payment_method as string | null;
    currency = (r.currency as string) || currency;
    trip_count += 1;
    if (method === "card") {
      digital_minor += fare;
    } else {
      cash_minor += fare;
    }
  }

  return {
    period,
    cash_minor,
    digital_minor,
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
