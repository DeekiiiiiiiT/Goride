/**
 * Read trip analytics from fleet.trip_facts. Search, export, and stats share this filter.
 */
import type { Context } from "npm:hono@4.3.11";
import { getServiceClient } from "./service_client.ts";
import { hasPlatformStaffAccess, platformMfaRequiredResponse, type RbacUser } from "./rbac_middleware.ts";
import { jwtAssuranceLevel } from "../_shared/productAdmin.ts";
import { buildTripAnalyticsFilter } from "./trip_analytics_definitions.ts";
import { projectTripListValue } from "./trip_list_projection.ts";
import { resolveTripSort } from "./trip_sort.ts";
import { isPeriodFrozen } from "./settlement_period_freeze.ts";
import { periodKeyFor } from "../../../packages/finance-core/src/periodKey.ts";

type RpcError = { message?: string; code?: string; details?: string };

export function resolveTripAnalyticsOrg(
  user: RbacUser | undefined,
  bodyOrg: unknown,
  assurance: "aal1" | "aal2" = "aal1",
): string | null {
  const requested = typeof bodyOrg === "string" && bodyOrg.trim() ? bodyOrg.trim() : null;
  const own = user?.organizationId || null;
  if (user && hasPlatformStaffAccess(user) && assurance === "aal2") {
    return requested || own;
  }
  return own;
}

/** Password session must not read another fleet. Own-fleet reads stay open. */
export function tripCrossFleetMfaResponse(c: Context, bodyOrg: unknown): Response | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  if (!user || !hasPlatformStaffAccess(user)) return null;
  const requested = typeof bodyOrg === "string" && bodyOrg.trim() ? bodyOrg.trim() : null;
  if (!requested) return null;
  if (user.organizationId && requested === user.organizationId) return null;
  return platformMfaRequiredResponse(c, user);
}

export function orgFromTripRequest(c: Context, body: Record<string, unknown> | null | undefined): string | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  const assurance = jwtAssuranceLevel(c.req.header("Authorization") ?? "");
  return resolveTripAnalyticsOrg(user, body?.organizationId, assurance);
}

function missingFacts(error: RpcError | null | undefined): boolean {
  const msg = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return msg.includes("does not exist")
    || msg.includes("pgrst202")
    || msg.includes("schema cache")
    || msg.includes("could not find the function");
}

function fleet() {
  return getServiceClient();
}

const SORT_TO_FACT: Record<string, string> = {
  date: "local_date",
  amount: "amount",
  distance: "distance_km",
  duration: "duration_min",
  platform: "platform",
  status: "status_bucket",
  id: "trip_id",
};

// PostgREST puts `.in()` on the query string. A few thousand ids overflow the URL.
const TRIP_ID_LOOKUP_CHUNK = 80;
const TRIP_ID_LOOKUP_CONCURRENCY = 6;

async function loadTripPayloads(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const byId = new Map<string, Record<string, unknown>>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += TRIP_ID_LOOKUP_CHUNK) {
    chunks.push(ids.slice(i, i + TRIP_ID_LOOKUP_CHUNK));
  }
  for (let i = 0; i < chunks.length; i += TRIP_ID_LOOKUP_CONCURRENCY) {
    const group = chunks.slice(i, i + TRIP_ID_LOOKUP_CONCURRENCY);
    const loaded = await Promise.all(group.map((slice) =>
      fleet().from("fleet_trips").select("id, payload_json").in("id", slice)
    ));
    for (const result of loaded) {
      if (result.error) throw new Error(result.error.message);
      for (const row of (result.data || []) as Array<{ id: string; payload_json: Record<string, unknown> }>) {
        byId.set(row.id, row.payload_json || {});
      }
    }
  }
  return byId;
}

/** One trip for the anomaly Review dialog. Same projection the table already uses. */
export async function loadTripForOrg(orgId: string, tripId: string): Promise<Record<string, unknown> | null> {
  const id = tripId.trim();
  if (!id || !orgId) return null;
  const loaded = await fleet().from("fleet_trips").select("id, organization_id, payload_json").eq("id", id).maybeSingle();
  if (loaded.error) throw new Error(loaded.error.message);
  const row = loaded.data as { id?: string; organization_id?: string | null; payload_json?: Record<string, unknown> | null } | null;
  if (!row || String(row.organization_id || "") !== orgId) return null;
  const projected = projectTripListValue((row.payload_json || { id }) as Record<string, unknown>);
  if (!projected.id) projected.id = id;
  return projected;
}

/**
 * Full stored trip for ledger edit and map. Review stays on the short projection.
 * weekOpen is false when that driver's pay week is already locked.
 */
export async function loadStoredTripForOrg(
  orgId: string,
  tripId: string,
): Promise<{ trip: Record<string, unknown>; weekOpen: boolean } | null> {
  const id = tripId.trim();
  if (!id || !orgId) return null;
  const loaded = await fleet().from("fleet_trips").select("id, organization_id, payload_json").eq("id", id).maybeSingle();
  if (loaded.error) throw new Error(loaded.error.message);
  const row = loaded.data as { id?: string; organization_id?: string | null; payload_json?: Record<string, unknown> | null } | null;
  if (!row || String(row.organization_id || "") !== orgId) return null;
  const trip = { ...(row.payload_json || {}), id: row.id || id } as Record<string, unknown>;
  if (trip.platform === "GoRide") trip.platform = "Roam";
  return { trip, weekOpen: await payWeekIsOpen(trip) };
}

async function payWeekIsOpen(trip: Record<string, unknown>): Promise<boolean> {
  const driverId = String(trip.driverId ?? "").trim();
  const day = String(trip.date ?? trip.requestTime ?? "").slice(0, 10);
  const anchor = day ? periodKeyFor(day) : null;
  if (!driverId || !anchor) return true;
  const { data, error } = await fleet()
    .from("driver_financial_periods")
    .select("status, metadata, closed_at")
    .eq("driver_id", driverId)
    .eq("period_anchor", anchor)
    .maybeSingle();
  if (error) {
    console.warn("[ledger-trip] week lookup failed:", error.message);
    return true;
  }
  if (!data) return true;
  const row = data as { status?: string | null; metadata?: Record<string, unknown> | null; closed_at?: string | null };
  return !isPeriodFrozen({
    status: row.status,
    metadata: row.metadata,
    closedAt: row.closed_at,
    settlementStatus: row.status,
  });
}

export async function searchTripsFromFacts(
  c: Context,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const orgId = orgFromTripRequest(c, body);
  if (!orgId) return null;
  const filters = buildTripAnalyticsFilter(body);
  const { appliedKey, ascending } = resolveTripSort(body.sortKey, body.sortDir);
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 10000);
  const offset = Number(body.offset) || 0;
  const { data, error } = await fleet().rpc("trip_fact_page", {
    p_org: orgId,
    f: filters,
    p_limit: limit,
    p_offset: offset,
    p_sort: SORT_TO_FACT[appliedKey] || "local_date",
    p_asc: ascending,
  });
  if (error) {
    if (missingFacts(error)) return null;
    throw new Error(error.message || "Trip facts search failed");
  }
  const page = (data || {}) as { total?: number; rows?: Array<Record<string, unknown>> };
  const rows = page.rows || [];
  const ids = rows.map((row) => String(row.trip_id || "")).filter(Boolean);
  const flags = new Map(rows.map((row) => [String(row.trip_id), row]));
  let trips: Record<string, unknown>[] = [];
  if (ids.length) {
    const byId = await loadTripPayloads(ids);
    trips = ids.map((id) => {
      const projected = projectTripListValue((byId.get(id) || { id }) as Record<string, unknown>);
      const meta = flags.get(id);
      if (meta?.anomaly_flags) projected.anomalyFlags = meta.anomaly_flags;
      if (meta?.cancel_actor) projected.cancelActor = meta.cancel_actor;
      if (!projected.id) projected.id = id;
      return projected;
    });
  }
  return {
    data: trips,
    page: Math.floor(offset / limit) + 1,
    limit,
    total: page.total || 0,
    sortKey: appliedKey,
    sortDir: ascending ? "asc" : "desc",
    countExact: true,
    source: "trip_facts",
  };
}

export async function tripStatsFromFacts(
  c: Context,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const orgId = orgFromTripRequest(c, body);
  if (!orgId) return null;
  const filters = buildTripAnalyticsFilter({ ...body, compare: false });
  const { data, error } = await fleet().rpc("trip_analytics_kpis", { p_org: orgId, f: filters });
  if (error) {
    if (missingFacts(error)) return null;
    throw new Error(error.message || "Trip facts stats failed");
  }
  const current = (data as { current?: Record<string, number> } | null)?.current || {};
  const completed = Number(current.completed) || 0;
  const gross = Number(current.grossFares) || 0;
  return {
    totalTrips: Number(current.total) || 0,
    completed,
    cancelled: Number(current.cancelled) || 0,
    totalEarnings: gross,
    totalCashCollected: Number(current.cashCollected) || 0,
    avgEarnings: completed > 0 ? gross / completed : 0,
    avgDuration: Number(current.avgDuration) || 0,
    avgAmount: completed > 0 ? gross / completed : 0,
    avgDistance: Number(current.avgDistance) || 0,
    completionRate: Number(current.total) > 0 ? (completed / Number(current.total)) * 100 : 0,
    sumAmount: Number(current.sumAmount) || 0,
    sumNet: Number(current.sumNet) || 0,
    netKnownCount: Number(current.netKnownCount) || 0,
    netUnknownCount: Number(current.netUnknownCount) || 0,
    distanceCount: Number(current.distanceTrips) || 0,
    source: "trip_facts",
  };
}

export function factsUnavailable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return missingFacts({ message: msg });
}
