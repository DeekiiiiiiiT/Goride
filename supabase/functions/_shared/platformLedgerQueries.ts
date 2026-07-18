/**
 * Platform ledger list queries (Postgres rides.ledger_lines + ride_requests).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ListDriverTripsOpts } from "./driverRideQueries.ts";

export interface PlatformLedgerLineRow {
  id: string;
  ride_request_id: string;
  line_kind: string;
  description: string;
  reporting_at: string;
  paid_to_you_minor: number;
  earnings_gross_minor: number;
  cash_collected_minor: number;
  bank_transferred_minor: number;
  fare_breakdown: Record<string, number>;
  payment_method: string | null;
  driver_user_id: string | null;
  rider_user_id: string;
  ride?: Record<string, unknown>;
}

export async function listPlatformLedgerLines(
  db: SupabaseClient,
  opts: ListDriverTripsOpts,
): Promise<{ lines: PlatformLedgerLineRow[]; total: number; page: number; limit: number } | { error: string }> {
  const page = Math.max(1, Number(opts.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(opts.limit ?? 25)));
  const offset = (page - 1) * limit;

  // Use head:true to get count without fetching all rows
  let countQ = db.from("ledger_lines").select("id", { count: "exact", head: true });
  if (opts.driverUserId) countQ = countQ.eq("driver_user_id", opts.driverUserId);
  if (opts.riderUserId) countQ = countQ.eq("rider_user_id", opts.riderUserId);
  if (opts.from) countQ = countQ.gte("reporting_at", opts.from);
  if (opts.to) countQ = countQ.lte("reporting_at", opts.to);
  if (opts.lineKind) countQ = countQ.eq("line_kind", opts.lineKind);

  const { count, error: countErr } = await countQ;
  if (countErr) return { error: countErr.message };

  let dataQ = db.from("ledger_lines").select("*");
  if (opts.driverUserId) dataQ = dataQ.eq("driver_user_id", opts.driverUserId);
  if (opts.riderUserId) dataQ = dataQ.eq("rider_user_id", opts.riderUserId);
  if (opts.from) dataQ = dataQ.gte("reporting_at", opts.from);
  if (opts.to) dataQ = dataQ.lte("reporting_at", opts.to);
  if (opts.lineKind) dataQ = dataQ.eq("line_kind", opts.lineKind);

  const { data, error } = await dataQ
    .order("reporting_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { error: error.message };

  return {
    lines: (data ?? []) as PlatformLedgerLineRow[],
    total: count ?? 0,
    page,
    limit,
  };
}

export async function aggregateLedgerLinesForTrips(
  db: SupabaseClient,
  rideIds: string[],
): Promise<Record<string, PlatformLedgerLineRow[]>> {
  if (rideIds.length === 0) return {};
  const { data, error } = await db.from("ledger_lines").select("*").in("ride_request_id", rideIds);
  if (error || !data) return {};
  const out: Record<string, PlatformLedgerLineRow[]> = {};
  for (const row of data as PlatformLedgerLineRow[]) {
    const rid = row.ride_request_id;
    if (!out[rid]) out[rid] = [];
    out[rid].push(row);
  }
  return out;
}
