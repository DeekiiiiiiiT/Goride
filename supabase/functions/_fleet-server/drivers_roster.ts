/**
 * GET /drivers/roster — one pre-aggregated row per driver for the Drivers list.
 * Reuses canonical fare_earning earnings buckets (same source as /ledger/drivers-summary)
 * and lightweight trip status counts for acceptance / today trips.
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { requireAuth } from "./rbac_middleware.ts";
import { filterByOrg, filterByOrgSafe, getOrgId } from "./org_scope.ts";
import { shouldReadTable, listByOrg } from "./repos/baseRepo.ts";

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

async function loadOrgDrivers(c: Context): Promise<Record<string, unknown>[]> {
  let driversRaw: any[] = [];
  if (shouldReadTable("drivers")) {
    const orgId = getOrgId(c);
    driversRaw = await listByOrg("drivers", orgId, { limit: 2000 });
  } else {
    const { data, error } = await fromKvStore()
      .select("value")
      .like("key", "driver:%")
      .range(0, 1999);
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
): Promise<
  Map<
    string,
    {
      lifetimeEarnings: number;
      monthlyEarnings: number;
      todayEarnings: number;
      lifetimeTripCount: number;
      todayTripCount: number;
    }
  >
> {
  const monthStart = today.substring(0, 7) + "-01";
  const [yr, mo] = today.substring(0, 7).split("-").map(Number);
  const monthEnd = new Date(yr, mo, 0).toISOString().split("T")[0];

  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  const rows = await listAllUnifiedCanonicalEvents({
    products: ["roam_driver", "roam_fleet"],
    entryTypes: ["fare_earning"],
    maxRows: 100_000,
  });
  const entryValues = filterByOrg(rows, c);

  const driverMap = new Map<
    string,
    {
      lifetimeEarnings: number;
      monthlyEarnings: number;
      todayEarnings: number;
      lifetimeTripCount: number;
      todayTripCount: number;
    }
  >();

  for (const e of entryValues) {
    if (!e) continue;
    const driverId = asStr(e.driverId).trim();
    if (!driverId || driverId === "unknown") continue;
    const gross = Number(e.grossAmount) || 0;
    const entryDate = asStr(e.date).substring(0, 10);
    if (!entryDate || entryDate.length !== 10) continue;

    let bucket = driverMap.get(driverId);
    if (!bucket) {
      bucket = {
        lifetimeEarnings: 0,
        monthlyEarnings: 0,
        todayEarnings: 0,
        lifetimeTripCount: 0,
        todayTripCount: 0,
      };
      driverMap.set(driverId, bucket);
    }
    bucket.lifetimeEarnings += gross;
    bucket.lifetimeTripCount += 1;
    if (entryDate >= monthStart && entryDate <= monthEnd) {
      bucket.monthlyEarnings += gross;
    }
    if (entryDate === today) {
      bucket.todayEarnings += gross;
      bucket.todayTripCount += 1;
    }
  }
  return driverMap;
}

/** Org-scoped trip status counts — only keeps driverId/status/date in memory. */
async function loadTripBuckets(
  c: Context,
  aliasMap: Map<string, string>,
  today: string,
): Promise<{ buckets: Map<string, TripBucket>; truncated: boolean }> {
  const orgId = getOrgId(c);
  const PAGE = 1000;
  const MAX_ROWS = 100_000;
  const buckets = new Map<string, TripBucket>();
  let truncated = false;

  let offset = 0;
  for (;;) {
    let query = fromKvStore().select("value").like("key", "trip:%");
    if (orgId) {
      query = query.or(`value->>organizationId.eq.${orgId},value->>organizationId.is.null`);
    }
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = data || [];
    if (page.length === 0) break;

    for (const row of page) {
      // Map immediately to {driverId, status, date} — do not retain full trip blobs.
      const v = (row as any)?.value ?? row;
      const slim = {
        driverId: asStr(v?.driverId).trim(),
        status: asStr(v?.status),
        date: asStr(v?.date).substring(0, 10),
      };
      if (!slim.driverId || slim.driverId === "unknown") continue;
      const canonical = aliasMap.get(slim.driverId);
      if (!canonical) continue; // only roster drivers

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

    const [earningsMap, tripScan] = await Promise.all([
      loadEarningsByDriver(c, today),
      loadTripBuckets(c, aliasMap, today),
    ]);
    const tripBuckets = tripScan.buckets;
    const tripsTruncated = tripScan.truncated;

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
      `[drivers/roster] ${filtered.length} drivers in ${durationMs}ms (earnings=${earningsMap.size}, tripBuckets=${tripBuckets.size})`,
    );

    return c.json({
      success: true,
      data: filtered,
      meta: {
        totalDrivers: filtered.length,
        dateUsed: today,
        durationMs,
        truncated: tripsTruncated,
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
