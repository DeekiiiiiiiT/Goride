/**
 * driver_operational_periods — weekly ops read model (trips/rates/distance).
 * Money stays on driver_financial_periods; settlements desk stays on money periods.
 */
import type { Context, Hono } from "npm:hono";
import { requireAuth } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { getServiceClient } from "./service_client.ts";
import { periodKeyFor, periodEndForAnchor, DEFAULT_FLEET_TZ } from "../../../packages/finance-core/src/periodKey.ts";
import * as kv from "./kv_store.tsx";

const PREFIX = "/make-server-37f42386";

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isCompleted(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return !!s && (s.includes("complet") || s === "complete") && !s.includes("cancel");
}

function isCancelled(status: unknown): boolean {
  return String(status ?? "").toLowerCase().includes("cancel");
}

type PlatformBucket = {
  trips: number;
  completed: number;
  cancelled: number;
  distanceKm: number;
  ratingSum: number;
  ratingCount: number;
};

type WeekBucket = {
  tripCount: number;
  completedCount: number;
  cancelledCount: number;
  distanceKm: number;
  durationMinutes: number;
  ratingSum: number;
  ratingCount: number;
  platforms: Record<string, PlatformBucket>;
};

function emptyWeek(): WeekBucket {
  return {
    tripCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    distanceKm: 0,
    durationMinutes: 0,
    ratingSum: 0,
    ratingCount: 0,
    platforms: {},
  };
}

async function expandAliases(driverId: string): Promise<string[]> {
  const ids = [driverId];
  try {
    const dr = await kv.get(`driver:${driverId}`);
    if (dr) {
      const u = asStr((dr as any).uberDriverId).trim();
      const i = asStr((dr as any).inDriveDriverId).trim();
      if (u) ids.push(u);
      if (i) ids.push(i);
    }
  } catch {
    /* non-fatal */
  }
  const out: string[] = [];
  for (const id of ids) {
    out.push(id);
    const lc = id.toLowerCase();
    if (lc !== id) out.push(lc);
  }
  return [...new Set(out.filter(Boolean))];
}

/** Rebuild weekly operational rows for one driver from fleet_trips. */
export async function rebuildDriverOperationalPeriods(
  driverId: string,
  orgId: string | null,
  opts?: { from?: string; to?: string },
): Promise<{ weeks: number }> {
  const aliases = await expandAliases(driverId);
  const sb = getServiceClient();
  let q = sb
    .from("fleet_trips")
    .select("driver_id, status, date, platform, amount, payload_json")
    .in("driver_id", aliases)
    .order("date", { ascending: true })
    .limit(50_000);
  if (orgId) q = q.or(`organization_id.eq.${orgId},organization_id.is.null`);
  if (opts?.from) q = q.gte("date", opts.from);
  if (opts?.to) q = q.lte("date", opts.to);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const byWeek = new Map<string, WeekBucket>();
  for (const row of data || []) {
    const payload =
      row.payload_json && typeof row.payload_json === "object"
        ? (row.payload_json as Record<string, unknown>)
        : {};
    const date = asStr(row.date || payload.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const anchorRaw = periodKeyFor(date, DEFAULT_FLEET_TZ);
    if (!anchorRaw) continue;
    const anchor = String(anchorRaw);
    let bucket = byWeek.get(anchor);
    if (!bucket) {
      bucket = emptyWeek();
      byWeek.set(anchor, bucket);
    }
    const status = row.status ?? payload.status;
    const platform = asStr(row.platform ?? payload.platform) || "Other";
    const dist =
      Number(payload.distance) ||
      Number(payload.distanceKm) ||
      Number(payload.tripDistance) ||
      0;
    const dur =
      Number(payload.durationMinutes) ||
      Number(payload.duration) ||
      Number(payload.tripDuration) ||
      0;
    const rating = Number(payload.rating) || Number(payload.driverRating) || 0;

    bucket.tripCount += 1;
    if (isCompleted(status)) bucket.completedCount += 1;
    if (isCancelled(status)) bucket.cancelledCount += 1;
    bucket.distanceKm += dist;
    bucket.durationMinutes += dur;
    if (rating > 0) {
      bucket.ratingSum += rating;
      bucket.ratingCount += 1;
    }
    let pb = bucket.platforms[platform];
    if (!pb) {
      pb = { trips: 0, completed: 0, cancelled: 0, distanceKm: 0, ratingSum: 0, ratingCount: 0 };
      bucket.platforms[platform] = pb;
    }
    pb.trips += 1;
    if (isCompleted(status)) pb.completed += 1;
    if (isCancelled(status)) pb.cancelled += 1;
    pb.distanceKm += dist;
    if (rating > 0) {
      pb.ratingSum += rating;
      pb.ratingCount += 1;
    }
  }

  const now = new Date().toISOString();
  for (const [anchor, b] of byWeek) {
    const decided = b.completedCount + b.cancelledCount;
    const acceptance = decided > 0 ? round4(b.completedCount / decided) : null;
    const cancellation = decided > 0 ? round4(b.cancelledCount / decided) : null;
    const periodEnd = periodEndForAnchor(anchor);
    const row = {
      driver_id: driverId,
      organization_id: orgId || null,
      period_anchor: anchor,
      period_end: periodEnd,
      timezone: DEFAULT_FLEET_TZ,
      trip_count: b.tripCount,
      completed_count: b.completedCount,
      cancelled_count: b.cancelledCount,
      distance_km: round2(b.distanceKm),
      duration_minutes: round2(b.durationMinutes),
      rating_sum: round2(b.ratingSum),
      rating_count: b.ratingCount,
      acceptance_rate: acceptance,
      cancellation_rate: cancellation,
      platform_breakdown: b.platforms,
      projected_at: now,
      updated_at: now,
      projection_version: 1,
    };
    const { error: upsertErr } = await sb.from("driver_operational_periods").upsert(row, {
      onConflict: "driver_id,period_anchor",
    });
    if (upsertErr) {
      console.warn("[dop] upsert failed", driverId, anchor, upsertErr.message);
    }
  }
  return { weeks: byWeek.size };
}

export async function listDriverOperationalPeriods(
  driverId: string,
  from?: string,
  to?: string,
): Promise<any[]> {
  const sb = getServiceClient();
  let q = sb
    .from("driver_operational_periods")
    .select("*")
    .eq("driver_id", driverId)
    .order("period_anchor", { ascending: false });
  if (from) q = q.gte("period_end", from);
  if (to) q = q.lte("period_anchor", to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    driverId: r.driver_id,
    periodAnchor: r.period_anchor,
    periodEnd: r.period_end,
    tripCount: Number(r.trip_count) || 0,
    completedCount: Number(r.completed_count) || 0,
    cancelledCount: Number(r.cancelled_count) || 0,
    distanceKm: Number(r.distance_km) || 0,
    durationMinutes: Number(r.duration_minutes) || 0,
    ratingSum: Number(r.rating_sum) || 0,
    ratingCount: Number(r.rating_count) || 0,
    acceptanceRate: r.acceptance_rate != null ? Number(r.acceptance_rate) : null,
    cancellationRate: r.cancellation_rate != null ? Number(r.cancellation_rate) : null,
    platformBreakdown: r.platform_breakdown || {},
    projectedAt: r.projected_at,
  }));
}

export async function fleetOperationalRollup(
  orgId: string | null,
  from: string,
  to: string,
): Promise<any[]> {
  const sb = getServiceClient();
  const { data, error } = await sb.rpc("fleet_operational_rollup_by_driver", {
    p_org_id: orgId,
    p_from: from,
    p_to: to,
  });
  if (error) {
    console.warn("[dop] rollup RPC failed:", error.message);
    return [];
  }
  return (data || []).map((r: any) => ({
    driverId: asStr(r.driver_id),
    tripCount: Number(r.trip_count) || 0,
    completedCount: Number(r.completed_count) || 0,
    cancelledCount: Number(r.cancelled_count) || 0,
    distanceKm: Number(r.distance_km) || 0,
    durationMinutes: Number(r.duration_minutes) || 0,
    ratingSum: Number(r.rating_sum) || 0,
    ratingCount: Number(r.rating_count) || 0,
    acceptanceRate: r.acceptance_rate != null ? Number(r.acceptance_rate) : null,
    cancellationRate: r.cancellation_rate != null ? Number(r.cancellation_rate) : null,
  }));
}

export function registerDriverOperationalPeriodRoutes(app: Hono) {
  app.get(
    `${PREFIX}/drivers/:id/operational-periods`,
    requireAuth({ requireOrg: true }),
    async (c: Context) => {
      const driverId = asStr(c.req.param("id")).trim();
      const from = asStr(c.req.query("from")).slice(0, 10) || undefined;
      const to = asStr(c.req.query("to")).slice(0, 10) || undefined;
      if (!driverId) return c.json({ error: "driverId required" }, 400);
      try {
        const data = await listDriverOperationalPeriods(driverId, from, to);
        return c.json({ success: true, data });
      } catch (e: any) {
        return c.json({ error: e?.message || "operational-periods failed" }, 500);
      }
    },
  );

  app.post(
    `${PREFIX}/drivers/:id/operational-periods/rebuild`,
    requireAuth({ requireOrg: true }),
    async (c: Context) => {
      const driverId = asStr(c.req.param("id")).trim();
      if (!driverId) return c.json({ error: "driverId required" }, 400);
      const orgId = getOrgId(c);
      try {
        const body = await c.req.json().catch(() => ({}));
        const from = asStr((body as any)?.from).slice(0, 10) || undefined;
        const to = asStr((body as any)?.to).slice(0, 10) || undefined;
        const result = await rebuildDriverOperationalPeriods(driverId, orgId, { from, to });
        const data = await listDriverOperationalPeriods(driverId, from, to);
        return c.json({ success: true, ...result, data });
      } catch (e: any) {
        return c.json({ error: e?.message || "rebuild failed" }, 500);
      }
    },
  );

  app.get(
    `${PREFIX}/drivers/operational-rollup`,
    requireAuth({ requireOrg: true }),
    async (c: Context) => {
      const from = asStr(c.req.query("from")).slice(0, 10);
      const to = asStr(c.req.query("to")).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return c.json({ error: "from and to (yyyy-MM-dd) required" }, 400);
      }
      const orgId = getOrgId(c);
      try {
        const data = await fleetOperationalRollup(orgId, from, to);
        return c.json({ success: true, data, from, to });
      } catch (e: any) {
        return c.json({ error: e?.message || "operational-rollup failed" }, 500);
      }
    },
  );
}
