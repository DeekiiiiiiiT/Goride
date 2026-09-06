/**
 * GET /drivers/roster — one pre-aggregated row per driver for the Drivers list.
 * Reuses SQL fare / period earnings aggregates (same buckets as /ledger/drivers-summary)
 * and SQL trip status counts — no full trip JSON payloads (N-3).
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrgSafe, getOrgId } from "./org_scope.ts";
import { shouldReadTable, listByOrg } from "./repos/baseRepo.ts";
import { getServiceClient } from "./service_client.ts";
import { aggregateCanonicalFareEarningsByDriver } from "./ledger_driver_events.ts";

const PREFIX = "/make-server-37f42386";

export type DriverRosterRow = {
  id: string;
  name: string;
  status: string;
  phone: string;
  email: string;
  vehicle: string;
  totalTrips: number;
  todaysTrips: number;
  acceptanceRate: number;
  totalEarnings: number;
  monthlyEarnings: number;
  todaysEarnings: number;
  licenseFrontUrl?: string;
  licenseBackUrl?: string;
  proofOfAddressUrl?: string;
  proofOfAddressType?: string;
  uberDriverId?: string;
  inDriveDriverId?: string;
  createdAt?: string;
  licenseExpiry?: string;
  licenseNumber?: string;
  avatarUrl?: string;
  organizationId?: string;
  tier?: string;
  bankInfo?: unknown;
};

type TripBucket = {
  total: number;
  completed: number;
  cancelled: number;
  todaysTrips: number;
};

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v != null ? String(v) : fallback;
}

function vehicleLabel(d: Record<string, unknown>): string {
  const plate = asStr(d.assignedVehiclePlate).trim();
  if (plate) return plate;
  const name = asStr(d.assignedVehicleName).trim();
  if (name) return name;
  const raw = asStr(d.vehicle).trim();
  if (!raw || raw === "Unassigned") return "Unassigned";
  // Prefer human labels over raw vehicle UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return "Unassigned";
  }
  return raw;
}

function normalizeStatus(raw: unknown): string {
  const s = asStr(raw, "Active").trim();
  if (!s) return "Active";
  const lower = s.toLowerCase();
  if (lower === "inactive") return "Inactive";
  if (lower === "needs attention" || lower === "needs_attention") return "Needs Attention";
  if (lower === "active") return "Active";
  return s;
}

const DRIVER_LIST_CAP = 5000;

async function loadOrgDrivers(c: Context): Promise<Record<string, unknown>[]> {
  let driversRaw: any[] = [];
  if (shouldReadTable("drivers")) {
    const orgId = getOrgId(c);
    driversRaw = await listByOrg("drivers", orgId, { limit: DRIVER_LIST_CAP });
  } else {
    const { data, error } = await fromKvStore()
      .select("value")
      .like("key", "driver:%")
      .range(0, DRIVER_LIST_CAP - 1);
    if (error) throw error;
    driversRaw = data?.map((d: any) => d.value) || [];
  }
  return (await filterByOrgSafe(driversRaw, c, { endpoint: "/drivers/roster" })) as Record<
    string,
    unknown
  >[];
}

/** Map platform / alias IDs → canonical Roam driver id. */
function buildAliasMap(drivers: Record<string, unknown>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of drivers) {
    const id = asStr(d.id).trim();
    if (!id) continue;
    map.set(id, id);
    const uber = asStr(d.uberDriverId).trim();
    const indrive = asStr(d.inDriveDriverId).trim();
    if (uber) map.set(uber, id);
    if (indrive) map.set(indrive, id);
  }
  return map;
}

async function loadEarningsByDriver(
  c: Context,
  today: string,
): Promise<{
  map: Map<
    string,
    {
      lifetimeEarnings: number;
      monthlyEarnings: number;
      todayEarnings: number;
      lifetimeTripCount: number;
      todayTripCount: number;
    }
  >;
  truncated: boolean;
  source: string;
}> {
  const agg = await aggregateCanonicalFareEarningsByDriver(c, { today, preferPeriods: true });
  const map = new Map<
    string,
    {
      lifetimeEarnings: number;
      monthlyEarnings: number;
      todayEarnings: number;
      lifetimeTripCount: number;
      todayTripCount: number;
    }
  >();
  for (const [id, b] of agg.byDriver) {
    map.set(id, {
      lifetimeEarnings: b.lifetimeEarnings,
      monthlyEarnings: b.monthlyEarnings,
      todayEarnings: b.todayEarnings,
      lifetimeTripCount: b.lifetimeTripCount,
      todayTripCount: b.todayTripCount,
    });
  }
  return { map, truncated: agg.truncated, source: agg.source };
}

/**
 * Org-scoped trip status counts via SQL GROUP BY on fleet.trips (N-3).
 * Fallback: slim column select only (never retain full trip blobs).
 */
async function loadTripBuckets(
  c: Context,
  aliasMap: Map<string, string>,
  today: string,
): Promise<{ buckets: Map<string, TripBucket>; truncated: boolean }> {
  const orgId = getOrgId(c);
  const buckets = new Map<string, TripBucket>();

  const absorb = (rawDriverId: string, patch: Partial<TripBucket> & { total?: number }) => {
    const slimId = asStr(rawDriverId).trim();
    if (!slimId || slimId === "unknown") return;
    const canonical = aliasMap.get(slimId);
    if (!canonical) return;
    let bucket = buckets.get(canonical);
    if (!bucket) {
      bucket = { total: 0, completed: 0, cancelled: 0, todaysTrips: 0 };
      buckets.set(canonical, bucket);
    }
    bucket.total += Number(patch.total) || 0;
    bucket.completed += Number(patch.completed) || 0;
    bucket.cancelled += Number(patch.cancelled) || 0;
    bucket.todaysTrips += Number(patch.todaysTrips) || 0;
  };

  // Prefer SQL aggregate — one row per driver, no trip JSON.
  try {
    const sb = getServiceClient();
    const { data, error } = await sb.rpc("fleet_trip_status_buckets_by_driver", {
      p_org_id: orgId,
      p_today: today,
    });
    if (!error && data) {
      for (const row of data) {
        absorb(String((row as any).driver_id || ""), {
          total: Number((row as any).total) || 0,
          completed: Number((row as any).completed) || 0,
          cancelled: Number((row as any).cancelled) || 0,
          todaysTrips: Number((row as any).todays_trips) || 0,
        });
      }
      return { buckets, truncated: false };
    }
    if (error) {
      console.warn(`[drivers/roster] trip SQL aggregate failed: ${error.message}`);
    }
  } catch (e: any) {
    console.warn(`[drivers/roster] trip SQL aggregate threw: ${e?.message || e}`);
  }

  // Fallback: select only driver_id/status/date columns from fleet_trips (no payload_json).
  const PAGE = 1000;
  const MAX_ROWS = 100_000;
  let truncated = false;
  let offset = 0;
  const sb = getServiceClient();

  for (;;) {
    let query = sb
      .from("fleet_trips")
      .select("driver_id, status, date")
      .order("legacy_kv_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (orgId) {
      query = query.or(`organization_id.eq.${orgId},organization_id.is.null`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    if (page.length === 0) break;

    for (const row of page) {
      // Map immediately — never push full trip objects into memory arrays.
      const slim = {
        driverId: asStr((row as any).driver_id).trim(),
        status: asStr((row as any).status),
        date: asStr((row as any).date).substring(0, 10),
      };
      if (!slim.driverId || slim.driverId === "unknown") continue;
      const canonical = aliasMap.get(slim.driverId);
      if (!canonical) continue;

      let bucket = buckets.get(canonical);
      if (!bucket) {
        bucket = { total: 0, completed: 0, cancelled: 0, todaysTrips: 0 };
        buckets.set(canonical, bucket);
      }
      bucket.total += 1;
      if (slim.status === "Completed") bucket.completed += 1;
      else if (slim.status === "Cancelled") bucket.cancelled += 1;
      if (slim.date === today) bucket.todaysTrips += 1;
    }

    if (page.length < PAGE) break;
    offset += PAGE;
    if (offset >= MAX_ROWS) {
      console.warn(`[drivers/roster] trip scan hit MAX_ROWS=${MAX_ROWS}`);
      truncated = true;
      break;
    }
  }
  return { buckets, truncated };
}

function pickEarnings(
  earningsMap: Map<string, { lifetimeEarnings: number; monthlyEarnings: number; todayEarnings: number; lifetimeTripCount: number; todayTripCount: number }>,
  driver: Record<string, unknown>,
) {
  const id = asStr(driver.id);
  const uber = asStr(driver.uberDriverId);
  const indrive = asStr(driver.inDriveDriverId);
  return (
    earningsMap.get(id) ||
    (uber ? earningsMap.get(uber) : undefined) ||
    (indrive ? earningsMap.get(indrive) : undefined) ||
    null
  );
}

export async function handleDriversRoster(c: Context) {
  const t0 = Date.now();
  try {
    const today = new Date().toISOString().split("T")[0];
    const drivers = await loadOrgDrivers(c);
    const aliasMap = buildAliasMap(drivers);

    const [earningsResult, tripScan] = await Promise.all([
      loadEarningsByDriver(c, today),
      loadTripBuckets(c, aliasMap, today),
    ]);
    const earningsMap = earningsResult.map;
    const tripBuckets = tripScan.buckets;
    const tripsTruncated = tripScan.truncated;
    const earningsTruncated = earningsResult.truncated;
    const truncated = tripsTruncated || earningsTruncated;

    const roster: DriverRosterRow[] = drivers.map((d) => {
      const id = asStr(d.id);
      const trips = tripBuckets.get(id) || {
        total: 0,
        completed: 0,
        cancelled: 0,
        todaysTrips: 0,
      };
      const earnings = pickEarnings(earningsMap, d);
      const decided = trips.completed + trips.cancelled;
      let acceptanceRate = decided > 0
        ? Math.round((trips.completed / decided) * 100)
        : 100;

      // Prefer CSV-style metric if stored on the driver record
      const metricAr = d.acceptanceRate;
      if (typeof metricAr === "number" && Number.isFinite(metricAr)) {
        acceptanceRate = metricAr <= 1 ? Math.round(metricAr * 100) : Math.round(metricAr);
      }

      let status = normalizeStatus(d.status);
      if (status === "Active" && acceptanceRate < 70) status = "Needs Attention";

      const totalTrips = trips.total > 0
        ? trips.total
        : (earnings?.lifetimeTripCount ?? 0);
      const todaysTrips = trips.todaysTrips > 0
        ? trips.todaysTrips
        : (earnings?.todayTripCount ?? 0);

      const row: DriverRosterRow = {
        id,
        name: asStr(d.name) || asStr(d.driverName) || "Unknown Driver",
        status,
        phone: asStr(d.phone) || "—",
        email: asStr(d.email),
        vehicle: vehicleLabel(d),
        totalTrips,
        todaysTrips,
        acceptanceRate,
        totalEarnings: Number((earnings?.lifetimeEarnings ?? 0).toFixed(2)),
        monthlyEarnings: Number((earnings?.monthlyEarnings ?? 0).toFixed(2)),
        todaysEarnings: Number((earnings?.todayEarnings ?? 0).toFixed(2)),
        licenseFrontUrl: asStr(d.licenseFrontUrl) || undefined,
        licenseBackUrl: asStr(d.licenseBackUrl) || undefined,
        proofOfAddressUrl: asStr(d.proofOfAddressUrl) || asStr(d.addressDocUrl) || undefined,
        proofOfAddressType: asStr(d.proofOfAddressType) || undefined,
        uberDriverId: asStr(d.uberDriverId) || undefined,
        inDriveDriverId: asStr(d.inDriveDriverId) || undefined,
        createdAt: asStr(d.createdAt) || asStr(d.created_at) || asStr(d.joinedAt) || undefined,
        licenseExpiry: asStr(d.licenseExpiry) || undefined,
        licenseNumber: asStr(d.licenseNumber) || undefined,
        avatarUrl: asStr(d.avatarUrl) || undefined,
        organizationId: asStr(d.organizationId) || undefined,
        tier: asStr(d.tier) || undefined,
        bankInfo: d.bankInfo,
      };
      return row;
    });

    // Ghost cleanup (same as GET /drivers)
    const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
    const filtered = roster.filter((r) => r.id !== BANNED_UUID);
    if (filtered.length !== roster.length) {
      try {
        await kv.del(`driver:${BANNED_UUID}`);
      } catch {
        /* non-fatal */
      }
    }

    const durationMs = Date.now() - t0;
    console.log(
      `[drivers/roster] ${filtered.length} drivers in ${durationMs}ms (earnings=${earningsMap.size} src=${earningsResult.source}, tripBuckets=${tripBuckets.size}, truncated=${truncated})`,
    );

    return c.json({
      success: true,
      data: filtered,
      meta: {
        totalDrivers: filtered.length,
        dateUsed: today,
        durationMs,
        truncated,
        earningsSource: earningsResult.source,
        /** Soft cap on driver rows loaded; raise or paginate if orgs grow past this. */
        driverListCap: DRIVER_LIST_CAP,
        driverListMayBeTruncated: drivers.length >= DRIVER_LIST_CAP,
        note:
          drivers.length >= DRIVER_LIST_CAP
            ? `Driver list capped at ${DRIVER_LIST_CAP}; pagination not yet available.`
            : undefined,
      },
    });
  } catch (e: any) {
    console.error(`[drivers/roster] failed:`, e?.message || e);
    return c.json({ success: false, error: e?.message || "Roster failed" }, 500);
  }
}

export function registerDriversRosterRoutes(app: Hono) {
  app.get(`${PREFIX}/drivers/roster`, requireAuth({ requireOrg: true }), handleDriversRoster);
}
