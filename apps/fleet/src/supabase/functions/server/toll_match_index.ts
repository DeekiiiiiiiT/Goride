/**
 * MOI-2: Indexed lookup helpers for match-on-ingest.
 *
 * These replace loading the entire toll_ledger org/trip KV prefix into memory
 * with real PostgREST `value->>field` filters, backed by the partial
 * expression indexes added in the MOI-1 migration
 * (supabase/migrations/20260804120000_toll_match_on_ingest_indexes.sql).
 * The filtering pattern itself already exists elsewhere in this codebase
 * (index.tsx's date-range trip/transaction search) — this module just gives
 * it dedicated, reusable, paginated helpers for the toll-matching engine.
 *
 * CRITICAL — do not driver/vehicle-gate the TRIP side of a lookup:
 * The existing matcher (`sameDayPreFilter` + `calculateConfidenceScore` in
 * toll_controller.tsx) was deliberately built driver/vehicle-agnostic —
 * those fields only ever ADD confidence score, they never exclude a
 * candidate — specifically to handle shared vehicles / shift swaps (see the
 * client's `getInferredDriver` in TollBucketPanel.tsx, which infers a
 * driver purely from "nearest trip in time for that vehicle plate" because a
 * toll's own driverId/vehicleId aren't reliable enough to filter on). Adding
 * a hard driverId/vehicleId AND-filter to `findTripsInDateRange` would
 * silently reintroduce that already-fixed regression, so `vehicleId` there
 * is accepted only as an optional narrowing hint, and `driverId` is not
 * accepted at all. The TOLL side (`findTollsInDateRange`) has no such
 * constraint — narrowing which tolls we look at is safe.
 *
 * NON-BREAKAGE: nothing in this file is called by any existing code path.
 * It is pure new, additive, unused infrastructure until the ingest-time
 * hooks (MOI-3/MOI-4) are wired to it, both gated behind `matchOnIngestEnabled`.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KV_TABLE = "kv_store_37f42386";
const PAGE_SIZE = 1000;

/**
 * Pages through a PostgREST query in chunks of 1000 (Supabase's implicit row
 * cap), mirroring the existing `loadAllByPrefix` loop in toll_controller.tsx.
 * `buildQuery` must construct a FRESH query per page (not reuse a builder
 * across iterations) — this is the same safe pattern already proven there.
 */
async function paginateAll(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/**
 * Trips whose `date` field falls within [startDate, endDate] (inclusive,
 * lexicographically-comparable ISO date strings — same convention as the
 * existing `value->>date` range filters in index.tsx).
 *
 * `vehicleId` is an optional narrowing hint ONLY — never pass `driverId`
 * here (see module doc comment).
 */
export async function findTripsInDateRange(
  startDate: string,
  endDate: string,
  opts?: { vehicleId?: string },
): Promise<any[]> {
  const rows = await paginateAll((from, to) => {
    let q = supabase
      .from(KV_TABLE)
      .select("value")
      .like("key", "trip:%")
      .gte("value->>date", startDate)
      .lte("value->>date", endDate);
    if (opts?.vehicleId) q = q.eq("value->>vehicleId", opts.vehicleId);
    return q.range(from, to);
  });
  return rows.map((r: any) => r.value).filter(Boolean);
}

/**
 * toll_ledger rows whose `date` field falls within [startDate, endDate].
 * Safe to narrow by driverId/vehicleId/matchStatus here — this restricts
 * which TOLLS are being looked at, not which trips are allowed to match them.
 */
export async function findTollsInDateRange(
  startDate: string,
  endDate: string,
  opts?: { driverId?: string; vehicleId?: string; matchStatuses?: string[] },
): Promise<any[]> {
  const rows = await paginateAll((from, to) => {
    let q = supabase
      .from(KV_TABLE)
      .select("value")
      .like("key", "toll_ledger:%")
      .gte("value->>date", startDate)
      .lte("value->>date", endDate);
    if (opts?.driverId) q = q.eq("value->>driverId", opts.driverId);
    if (opts?.vehicleId) q = q.eq("value->>vehicleId", opts.vehicleId);
    if (opts?.matchStatuses && opts.matchStatuses.length > 0) {
      q = q.in("value->>matchStatus", opts.matchStatuses);
    }
    return q.range(from, to);
  });
  return rows.map((r: any) => r.value).filter(Boolean);
}

/**
 * Every toll_ledger row currently pointing at a given trip id — used by the
 * MOI-4 trip-delete/trip-edit invalidation hook to find tolls that need to be
 * flagged or cleared when their matched trip disappears or moves.
 */
export async function findTollsByMatchedTripId(tripId: string): Promise<any[]> {
  const rows = await paginateAll((from, to) =>
    supabase
      .from(KV_TABLE)
      .select("value")
      .like("key", "toll_ledger:%")
      .eq("value->>matchedTripId", tripId)
      .range(from, to),
  );
  return rows.map((r: any) => r.value).filter(Boolean);
}
