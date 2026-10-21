/**
 * Read trip analytics from fleet.trip_facts. Search, export, and stats share this filter.
 */
import type { Context } from "npm:hono@4.3.11";
import { getServiceClient } from "./service_client.ts";
import { hasPlatformStaffAccess, type RbacUser } from "./rbac_middleware.ts";
import { buildTripAnalyticsFilter } from "./trip_analytics_definitions.ts";
import { projectTripListValue } from "./trip_list_projection.ts";
import { resolveTripSort } from "./trip_sort.ts";

type RpcError = { message?: string; code?: string; details?: string };

export function resolveTripAnalyticsOrg(user: RbacUser | undefined, bodyOrg: unknown): string | null {
  const requested = typeof bodyOrg === "string" && bodyOrg.trim() ? bodyOrg.trim() : null;
  if (user && hasPlatformStaffAccess(user)) return requested || user.organizationId || null;
  return user?.organizationId || null;
}

export function orgFromTripRequest(c: Context, body: Record<string, unknown> | null | undefined): string | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return resolveTripAnalyticsOrg(user, body?.organizationId);
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
    const loaded = await fleet().from("fleet_trips").select("id, payload_json").in("id", ids);
    if (loaded.error) throw new Error(loaded.error.message);
    const byId = new Map((loaded.data || []).map((row: { id: string; payload_json: Record<string, unknown> }) => [
      row.id,
      row.payload_json,
    ]));
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
