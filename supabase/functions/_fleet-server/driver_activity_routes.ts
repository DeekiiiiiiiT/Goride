/**
 * Driver Activity routes — read API, presence sweeper, ingest, summary, export.
 * Writes only to fleet.driver_activity_events (+ driver_audit). Never money tables.
 */
import type { Context, Hono } from "npm:hono@4.3.11";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requirePermission, hasPermission, type RbacUser } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { appendDriverAuditEvent } from "./drivers_audit.ts";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";
import * as kv from "./kv_store.tsx";
import {
  buildCoverageBySource,
  buildCoverageWindows,
  clampActivityWindow,
  clusterEventsByJob,
  computeEventAcceptanceRate,
  deriveStatusSegments,
  isUnsupportedActivityPlatform,
  mapDeliveryStatusToCanonical,
  mapOfferStatusToCanonical,
  mapRidesAuditToCanonical,
  presenceCoverageKeys,
  presenceToCanonical,
  sourceFullyRecorded,
  sumSegmentSeconds,
  tripCoverageKeys,
  type ActivityEventLike,
} from "./driver_activity_logic.ts";

const PREFIX = "/make-server-37f42386";
const GRACE_SECONDS = 300;
const PAGE_DEFAULT = 200;

function cronAuthorized(c: Context): boolean {
  const secret = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET") ||
    Deno.env.get("CRON_SECRET");
  if (!secret) return false;
  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  return c.req.header("X-Fleet-Cron-Secret") === secret ||
    c.req.header("X-Rides-Cron-Secret") === secret ||
    bearer === secret;
}

function serviceClient(schema?: string): SupabaseClient {
  const opts = schema ? { db: { schema } } : undefined;
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    opts as any,
  );
}

type ProjectionRow = {
  id: number;
  organization_id: string;
  driver_id: string;
  service_line: string;
  source: string;
  source_event_id: string;
  event_type: string;
  occurred_at: string;
  ingested_at: string;
  job_ref: string | null;
  job_seq: number | null;
  payload: Record<string, unknown>;
};

async function resolveDriverAuthIds(driverId: string): Promise<string[]> {
  const ids = new Set<string>([driverId]);
  try {
    const rec = await kv.get(`driver:${driverId}`);
    if (rec && typeof rec === "object") {
      for (const k of ["id", "driverId", "userId", "authUserId"]) {
        const v = String((rec as any)[k] || "").trim();
        if (v) ids.add(v);
      }
    }
  } catch {
    /* ignore */
  }
  return [...ids];
}

function stripCoords(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  for (const k of ["lat", "lng", "latitude", "longitude", "location_lat", "location_lng", "coords"]) {
    if (k in out) delete out[k];
  }
  return out;
}

async function loadCoverage(
  sb: SupabaseClient,
  serviceLines: string[],
): Promise<Array<{ covered_from: string; covered_to: string | null; note?: string | null; service_line: string; source: string }>> {
  const { data, error } = await sb
    .from("fleet_activity_source_coverage")
    .select("service_line, source, covered_from, covered_to, note")
    .in("service_line", serviceLines);
  if (error) {
    console.warn("[activity] coverage load failed", error.message);
    return [];
  }
  return (data || []) as any[];
}

function encodeCursor(occurredAt: string, id: number): string {
  return btoa(JSON.stringify({ occurredAt, id }));
}

function decodeCursor(raw: string | undefined): { occurredAt: string; id: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(atob(raw));
    if (parsed?.occurredAt && parsed?.id != null) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

async function insertProjectionRows(
  sb: SupabaseClient,
  rows: Array<Omit<ProjectionRow, "id" | "ingested_at">>,
): Promise<{ inserted: number; conflicted: number }> {
  if (!rows.length) return { inserted: 0, conflicted: 0 };
  const { data, error } = await sb
    .from("fleet_driver_activity_events")
    .upsert(rows, { onConflict: "source,source_event_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[activity] projection upsert failed", error.message);
    throw error;
  }
  const inserted = (data || []).length;
  return { inserted, conflicted: Math.max(0, rows.length - inserted) };
}

async function getWatermark(sb: SupabaseClient, source: string) {
  const { data } = await sb
    .from("fleet_activity_ingest_watermarks")
    .select("last_occurred_at, last_source_id")
    .eq("source", source)
    .maybeSingle();
  return data as { last_occurred_at: string | null; last_source_id: string | null } | null;
}

async function setWatermark(
  sb: SupabaseClient,
  source: string,
  lastOccurredAt: string,
  lastSourceId: string,
) {
  await sb.from("fleet_activity_ingest_watermarks").upsert({
    source,
    last_occurred_at: lastOccurredAt,
    last_source_id: lastSourceId,
    updated_at: new Date().toISOString(),
  });
}

/** Resolve org for a driver auth id from KV. */
async function orgForDriver(driverId: string): Promise<string | null> {
  try {
    const rec = await kv.get(`driver:${driverId}`);
    const org = String((rec as any)?.organizationId || (rec as any)?.organization_id || "").trim();
    return org || null;
  } catch {
    return null;
  }
}

async function ingestRidesLane(sb: SupabaseClient, ridesDb: SupabaseClient): Promise<{
  scanned: number;
  inserted: number;
  conflicted: number;
  unmapped: number;
  unmappedTypes: string[];
  ok: boolean;
  error?: string;
}> {
  try {
    const fleet = serviceClient();
    const wm = await getWatermark(fleet, "rides.audit_events");
    // First run: look back far enough to cover historical append-only sources (coverage from 2025-01-01)
    const overlapStart = wm?.last_occurred_at
      ? new Date(Date.parse(wm.last_occurred_at) - 5 * 60_000).toISOString()
      : "2025-01-01T00:00:00.000Z";

    const { data: audits, error } = await ridesDb
      .from("audit_events")
      .select("id, ride_request_id, actor_user_id, event_type, payload, created_at")
      .gte("created_at", overlapStart)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000);
    if (error) throw error;

    const rows: Array<Omit<ProjectionRow, "id" | "ingested_at">> = [];
    const rideIds = [...new Set((audits || []).map((a: any) => a.ride_request_id).filter(Boolean))];
    const assignedByRide = new Map<string, string>();
    const cancelledByRide = new Map<string, string>();
    if (rideIds.length) {
      const { data: rides } = await ridesDb
        .from("ride_requests")
        .select("id, assigned_driver_user_id, cancelled_by")
        .in("id", rideIds.slice(0, 1000));
      for (const r of rides || []) {
        if (r.assigned_driver_user_id) {
          assignedByRide.set(String(r.id), String(r.assigned_driver_user_id));
        }
        if ((r as any).cancelled_by) {
          cancelledByRide.set(String(r.id), String((r as any).cancelled_by));
        }
      }
    }

    const unmappedTypes = new Set<string>();
    let unmapped = 0;
    for (const a of audits || []) {
      const rawType = String(a.event_type || "");
      const rideId = a.ride_request_id ? String(a.ride_request_id) : "";
      const payload: Record<string, unknown> = {
        ...(a.payload || {}),
        raw_event_type: rawType,
      };
      // Enrich cancel party from ride_requests (audit payload often lacks cancelled_by)
      if (rideId && cancelledByRide.has(rideId) && !payload.cancelled_by) {
        payload.cancelled_by = cancelledByRide.get(rideId);
      }
      if (rawType === "admin_ride_force_complete") payload.action = "force_complete";
      if (rawType === "admin_ride_force_cancel") payload.action = "force_cancel";

      const canonical = mapRidesAuditToCanonical(rawType, payload);
      if (!canonical) {
        // Ignore known non-timeline noise (fare/config); count true gaps
        const lower = rawType.toLowerCase();
        if (
          lower &&
          !lower.startsWith("fare_") &&
          !lower.includes("vehicle") &&
          !lower.includes("config") &&
          lower !== "fare_quoted"
        ) {
          unmapped++;
          unmappedTypes.add(rawType);
        }
        continue;
      }
      const driverId = String(a.actor_user_id || assignedByRide.get(rideId) || "").trim();
      if (!driverId) continue;
      const orgId = (await orgForDriver(driverId)) || "unknown";
      rows.push({
        organization_id: orgId,
        driver_id: driverId,
        service_line: "roam_rides",
        source: "rides.audit_events",
        source_event_id: String(a.id),
        event_type: canonical,
        occurred_at: a.created_at,
        job_ref: rideId || null,
        job_seq: null,
        // M2: retain coords; strip at read when viewer lacks drivers.location.view
        payload,
      });
    }

    // Offers lane (status as events) — same watermark window via created_at
    const { data: offers } = await ridesDb
      .from("driver_offers")
      .select("id, ride_request_id, driver_user_id, status, created_at")
      .gte("created_at", overlapStart)
      .order("created_at", { ascending: true })
      .limit(5000);

    for (const o of offers || []) {
      const canonical = mapOfferStatusToCanonical(o.status);
      if (!canonical) continue;
      const driverId = String(o.driver_user_id || "").trim();
      if (!driverId) continue;
      const orgId = (await orgForDriver(driverId)) || "unknown";
      rows.push({
        organization_id: orgId,
        driver_id: driverId,
        service_line: "roam_rides",
        source: "rides.driver_offers",
        source_event_id: `${o.id}:${o.status}`,
        event_type: canonical,
        occurred_at: o.created_at,
        job_ref: o.ride_request_id ? String(o.ride_request_id) : null,
        job_seq: 0,
        payload: { status: o.status },
      });
    }

    const result = await insertProjectionRows(sb, rows);
    if ((audits || []).length) {
      const last = audits![audits!.length - 1];
      await setWatermark(fleet, "rides.audit_events", last.created_at, String(last.id));
    }
    if (unmapped > 0) {
      console.warn("[activity_ingest] unmapped_event_types", {
        unmapped,
        types: [...unmappedTypes],
      });
    }
    return {
      scanned: (audits || []).length + (offers || []).length,
      ...result,
      unmapped,
      unmappedTypes: [...unmappedTypes],
      ok: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      scanned: 0,
      inserted: 0,
      conflicted: 0,
      unmapped: 0,
      unmappedTypes: [],
      ok: false,
      error: msg,
    };
  }
}

async function ingestPresenceLane(sb: SupabaseClient): Promise<{
  scanned: number;
  inserted: number;
  conflicted: number;
  ok: boolean;
  error?: string;
}> {
  try {
    const fleet = serviceClient();
    const wm = await getWatermark(fleet, "fleet.driver_presence_log");
    const overlapStart = wm?.last_occurred_at
      ? new Date(Date.parse(wm.last_occurred_at) - 5 * 60_000).toISOString()
      : "2025-01-01T00:00:00.000Z";

    const { data, error } = await fleet
      .from("fleet_driver_presence_log")
      .select("id, user_id, service_line, is_online, occurred_at, reason, payload")
      .gte("occurred_at", overlapStart)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000);
    if (error) throw error;

    const rows: Array<Omit<ProjectionRow, "id" | "ingested_at">> = [];
    for (const p of data || []) {
      const driverId = String(p.user_id);
      const orgId = (await orgForDriver(driverId)) || "unknown";
      rows.push({
        organization_id: orgId,
        driver_id: driverId,
        service_line: p.service_line,
        source: "fleet.driver_presence_log",
        source_event_id: String(p.id),
        event_type: presenceToCanonical(!!p.is_online),
        occurred_at: p.occurred_at,
        job_ref: null,
        job_seq: null,
        payload: { reason: p.reason, ...(p.payload || {}) },
      });
    }
    const result = await insertProjectionRows(sb, rows);
    if ((data || []).length) {
      const last = data![data!.length - 1];
      await setWatermark(fleet, "fleet.driver_presence_log", last.occurred_at, String(last.id));
    }
    return { scanned: (data || []).length, ...result, ok: true };
  } catch (e) {
    const msg = e instanceof Error
      ? e.message
      : (typeof e === "object" && e && "message" in e)
      ? String((e as { message: unknown }).message)
      : JSON.stringify(e);
    return { scanned: 0, inserted: 0, conflicted: 0, ok: false, error: msg };
  }
}

async function ingestDeliveryLane(sb: SupabaseClient, deliveryDb: SupabaseClient): Promise<{
  scanned: number;
  inserted: number;
  conflicted: number;
  ok: boolean;
  error?: string;
}> {
  try {
    const fleet = serviceClient();
    const wm = await getWatermark(fleet, "delivery.order_events");
    const overlapStart = wm?.last_occurred_at
      ? new Date(Date.parse(wm.last_occurred_at) - 5 * 60_000).toISOString()
      : "2025-01-01T00:00:00.000Z";

    const { data: events, error } = await deliveryDb
      .from("order_events")
      .select("id, order_id, status, actor_type, actor_id, created_at, notes")
      .gte("created_at", overlapStart)
      .order("created_at", { ascending: true })
      .limit(5000);
    if (error) throw error;

    const orderIds = [...new Set((events || []).map((e: any) => e.order_id).filter(Boolean))];
    const courierByOrder = new Map<string, string>();
    if (orderIds.length) {
      const { data: orders } = await deliveryDb
        .from("orders")
        .select("id, courier_id")
        .in("id", orderIds.slice(0, 1000));
      for (const o of orders || []) {
        if (o.courier_id) courierByOrder.set(String(o.id), String(o.courier_id));
      }
    }

    const rows: Array<Omit<ProjectionRow, "id" | "ingested_at">> = [];
    for (const e of events || []) {
      const canonical = mapDeliveryStatusToCanonical(e.status);
      if (!canonical) continue;
      const driverId = String(
        (e.actor_type === "courier" && e.actor_id) || courierByOrder.get(String(e.order_id)) || "",
      ).trim();
      if (!driverId) continue;
      const orgId = (await orgForDriver(driverId)) || "unknown";
      rows.push({
        organization_id: orgId,
        driver_id: driverId,
        service_line: "roam_rush",
        source: "delivery.order_events",
        source_event_id: String(e.id),
        event_type: canonical,
        occurred_at: e.created_at,
        job_ref: e.order_id ? String(e.order_id) : null,
        job_seq: null,
        payload: { status: e.status, notes: e.notes },
      });
    }
    const result = await insertProjectionRows(sb, rows);
    if ((events || []).length) {
      const last = events![events!.length - 1];
      await setWatermark(fleet, "delivery.order_events", last.created_at, String(last.id));
    }
    return { scanned: (events || []).length, ...result, ok: true };
  } catch (e) {
    const msg = e instanceof Error
      ? e.message
      : (typeof e === "object" && e && "message" in e)
      ? String((e as { message: unknown }).message)
      : JSON.stringify(e);
    return { scanned: 0, inserted: 0, conflicted: 0, ok: false, error: msg };
  }
}

async function ingestAdminLane(sb: SupabaseClient, driverIdFilter?: string): Promise<{
  scanned: number;
  inserted: number;
  ok: boolean;
}> {
  try {
    const prefix = driverIdFilter ? `driver_audit:${driverIdFilter}:` : "driver_audit:";
    const rows = await kv.getByPrefix(prefix);
    const projection: Array<Omit<ProjectionRow, "id" | "ingested_at">> = [];
    for (const r of rows || []) {
      if (!r || typeof r !== "object") continue;
      const driverId = String((r as any).driverId || "").trim();
      if (!driverId) continue;
      const at = String((r as any).at || "");
      if (!at) continue;
      const orgId = String((r as any).organizationId || (await orgForDriver(driverId)) || "unknown");
      projection.push({
        organization_id: orgId,
        driver_id: driverId,
        service_line: "fleet_ops",
        source: "fleet.driver_audit",
        source_event_id: String((r as any).id || `${driverId}:${at}`),
        event_type: "admin_action",
        occurred_at: at,
        job_ref: null,
        job_seq: null,
        payload: {
          action: (r as any).action,
          reason: (r as any).reason,
          actorId: (r as any).actorId,
        },
      });
    }
    const result = await insertProjectionRows(sb, projection);
    return { scanned: projection.length, inserted: result.inserted, ok: true };
  } catch {
    return { scanned: 0, inserted: 0, ok: false };
  }
}

export function registerDriverActivityRoutes(app: Hono) {
  // ── Presence sweeper (ACT-03) ────────────────────────────────────────────
  app.post(`${PREFIX}/internal/activity/presence-sweep`, async (c) => {
    if (!cronAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
    const sb = serviceClient();
    const grace = Number(c.req.query("graceSeconds") || GRACE_SECONDS);
    const { data, error } = await sb.rpc("sweep_stale_presence", {
      p_grace_seconds: grace,
    });
    // RPC lives in fleet schema — try fleet view wrapper if public rpc missing
    if (error) {
      const fleet = serviceClient("fleet");
      const alt = await fleet.rpc("sweep_stale_presence", { p_grace_seconds: grace });
      if (alt.error) {
        return c.json({ error: alt.error.message || error.message }, 500);
      }
      return c.json({ success: true, graceSeconds: grace, result: alt.data });
    }
    return c.json({ success: true, graceSeconds: grace, result: data });
  });

  // ── Ingest (ACT-07/08/15) ────────────────────────────────────────────────
  app.post(`${PREFIX}/internal/activity/ingest`, async (c) => {
    if (!cronAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
    const sb = serviceClient();
    const ridesDb = serviceClient("rides");
    const deliveryDb = serviceClient("delivery");
    const body = await c.req.json().catch(() => ({}));
    const lanes = String((body as any).lanes || "rides,presence,delivery,admin").split(",").map((s: string) => s.trim());

    const results: Record<string, unknown> = {};
    if (lanes.includes("presence")) results.presence = await ingestPresenceLane(sb);
    if (lanes.includes("rides")) results.rides = await ingestRidesLane(sb, ridesDb);
    if (lanes.includes("delivery")) results.delivery = await ingestDeliveryLane(sb, deliveryDb);
    if (lanes.includes("admin")) results.admin = await ingestAdminLane(sb);

    console.log("[activity_ingest]", JSON.stringify(results));
    return c.json({ success: true, results });
  });

  // ── Backfill (ACT-19) ────────────────────────────────────────────────────
  app.post(
    `${PREFIX}/internal/activity/backfill`,
    async (c) => {
      if (!cronAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
      const sb = serviceClient();
      const sources = ["rides.audit_events", "delivery.order_events", "fleet.driver_presence_log"];
      for (const source of sources) {
        await sb.from("fleet_activity_ingest_watermarks").delete().eq("source", source);
      }
      const ridesDb = serviceClient("rides");
      const deliveryDb = serviceClient("delivery");
      const results = {
        presence: await ingestPresenceLane(sb),
        rides: await ingestRidesLane(sb, ridesDb),
        delivery: await ingestDeliveryLane(sb, deliveryDb),
        admin: await ingestAdminLane(sb),
      };
      return c.json({ success: true, results });
    },
  );

  // ── Retention purge trigger (ACT-24) ─────────────────────────────────────
  app.post(`${PREFIX}/internal/activity/purge`, async (c) => {
    if (!cronAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
    const days = Number(c.req.query("keepDays") || 400);
    const fleet = serviceClient("fleet");
    const { data, error } = await fleet.rpc("purge_old_activity_data", { p_keep_days: days });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, result: data });
  });

  // ── Drift check (ACT-20) ─────────────────────────────────────────────────
  app.post(`${PREFIX}/internal/activity/drift-check`, async (c) => {
    if (!cronAuthorized(c)) return c.json({ error: "Unauthorized" }, 401);
    const sb = serviceClient();
    const day = String(c.req.query("day") || new Date().toISOString().slice(0, 10));
    const from = `${day}T00:00:00.000Z`;
    const to = `${day}T23:59:59.999Z`;

    const { data: completed } = await sb
      .from("fleet_driver_activity_events")
      .select("driver_id")
      .eq("event_type", "job_completed")
      .gte("occurred_at", from)
      .lte("occurred_at", to);

    const byDriver = new Map<string, number>();
    for (const r of completed || []) {
      const id = String((r as any).driver_id);
      byDriver.set(id, (byDriver.get(id) || 0) + 1);
    }

    // Compare to fleet_trips completed for same day (best-effort)
    const { data: trips } = await sb
      .from("fleet_trips")
      .select("driver_id, status, date")
      .gte("date", day)
      .lte("date", day);

    const tripCounts = new Map<string, number>();
    for (const t of trips || []) {
      const st = String((t as any).status || "").toLowerCase();
      if (st && st !== "completed" && st !== "complete") continue;
      const id = String((t as any).driver_id || "");
      if (!id) continue;
      tripCounts.set(id, (tripCounts.get(id) || 0) + 1);
    }

    const drifts: Array<{ driverId: string; activity: number; trips: number }> = [];
    const allIds = new Set([...byDriver.keys(), ...tripCounts.keys()]);
    for (const id of allIds) {
      const a = byDriver.get(id) || 0;
      const b = tripCounts.get(id) || 0;
      if (a !== b) drifts.push({ driverId: id, activity: a, trips: b });
    }

    console.log("[activity_drift]", JSON.stringify({ day, driftCount: drifts.length }));
    return c.json({ success: true, day, driftCount: drifts.length, drifts: drifts.slice(0, 100) });
  });

  // ── GET activity ─────────────────────────────────────────────────────────
  app.get(
    `${PREFIX}/drivers/:id/activity`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.view"),
    async (c) => {
      const orgId = getOrgId(c);
      const driverId = String(c.req.param("id") || "").trim();
      if (!driverId) return c.json({ error: "driverId required" }, 400);

      const flagOn = await isFeatureEnabled(FEATURE_FLAGS.DRIVER_ACTIVITY, orgId);
      if (!flagOn) {
        return c.json({
          success: false,
          error: "driver_activity_disabled",
          message: "Driver Activity is not enabled for this organization.",
        }, 404);
      }

      const platform = c.req.query("platform") || c.req.query("platforms") || "";
      if (isUnsupportedActivityPlatform(platform.split(",")[0])) {
        return c.json({
          success: true,
          orgId,
          unsupportedPlatform: true,
          platform,
          message:
            "Per-event activity isn't available for this platform. Weekly totals only — see Overview → Time Metrics.",
          coverage: [],
          segments: [],
          data: [],
          nextCursor: null,
          watermark: null,
          lanes: [],
        });
      }

      const fromQ = c.req.query("from") || new Date(Date.now() - 7 * 86400000).toISOString();
      const toQ = c.req.query("to") || new Date().toISOString();
      const window = clampActivityWindow(fromQ, toQ, 31);
      const serviceLines = (c.req.query("serviceLines") || "roam_rides,roam_rush")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const eventTypes = (c.req.query("eventTypes") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const sort = (c.req.query("sort") || "desc").toLowerCase() === "asc" ? "asc" : "desc";
      const limit = Math.min(500, Math.max(1, Number(c.req.query("limit") || PAGE_DEFAULT)));
      const cursor = decodeCursor(c.req.query("cursor") || undefined);

      const sb = serviceClient();
      const authIds = await resolveDriverAuthIds(driverId);
      const lanes: Array<{ serviceLine: string; ok: boolean; error?: string }> = [];

      const coverageRows = await loadCoverage(sb, serviceLines);
      const coverageBySource = buildCoverageBySource(window.from, window.to, coverageRows);
      // Banner summary: presence-aware — do NOT union all sources (C4)
      const presenceKeys = presenceCoverageKeys(coverageBySource);
      const tripKeys = tripCoverageKeys(coverageBySource);
      const presenceWindows = presenceKeys.flatMap((k) => coverageBySource[k] || []);
      const tripWindows = tripKeys.flatMap((k) => coverageBySource[k] || []);
      const presenceRecorded = presenceWindows.length > 0 && presenceWindows.some((w) => w.recorded);
      const tripsRecorded = tripWindows.length > 0 && tripWindows.some((w) => w.recorded);
      // Prefer presence windows for top-level coverage when present; else trips
      const coverage = presenceWindows.length
        ? (presenceKeys[0] ? coverageBySource[presenceKeys[0]] : presenceWindows)
        : tripKeys[0]
        ? coverageBySource[tripKeys[0]]
        : buildCoverageWindows(window.from, window.to, []);

      const whollyUncovered = !presenceRecorded && !tripsRecorded;
      if (whollyUncovered) {
        return c.json({
          success: true,
          orgId,
          window,
          coverage,
          coverageBySource,
          coverageHonesty: {
            presenceRecorded: false,
            tripsRecorded: false,
            message: "Activity was not recorded for this window.",
          },
          segments: [],
          data: [],
          nextCursor: null,
          truncated: false,
          watermark: null,
          lanes: serviceLines.map((s) => ({ serviceLine: s, ok: true })),
        });
      }

      // Full-window events for segment derivation (capped)
      let segQuery = sb
        .from("fleet_driver_activity_events")
        .select(
          "id, organization_id, driver_id, service_line, source, source_event_id, event_type, occurred_at, ingested_at, job_ref, job_seq, payload",
        )
        .in("driver_id", authIds)
        .in("service_line", serviceLines)
        .gte("occurred_at", window.from)
        .lte("occurred_at", window.to)
        .order("occurred_at", { ascending: true })
        .limit(5000);

      if (orgId) segQuery = segQuery.eq("organization_id", orgId);

      const { data: allEvents, error: allErr } = await segQuery;
      if (allErr) {
        lanes.push({ serviceLine: "projection", ok: false, error: allErr.message });
      } else {
        lanes.push({ serviceLine: "projection", ok: true });
      }

      const eventsForSeg = (allEvents || []) as ProjectionRow[];
      const segments = deriveStatusSegments(
        eventsForSeg as ActivityEventLike[],
        window.from,
        window.to,
      );

      // Page query
      let pageQuery = sb
        .from("fleet_driver_activity_events")
        .select(
          "id, organization_id, driver_id, service_line, source, source_event_id, event_type, occurred_at, ingested_at, job_ref, job_seq, payload",
        )
        .in("driver_id", authIds)
        .in("service_line", serviceLines)
        .gte("occurred_at", window.from)
        .lte("occurred_at", window.to)
        .order("occurred_at", { ascending: sort === "asc" })
        .order("id", { ascending: sort === "asc" })
        .limit(limit + 1);

      if (orgId) pageQuery = pageQuery.eq("organization_id", orgId);
      if (eventTypes.length) pageQuery = pageQuery.in("event_type", eventTypes);
      if (cursor) {
        if (sort === "desc") {
          pageQuery = pageQuery.or(
            `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
          );
        } else {
          pageQuery = pageQuery.or(
            `occurred_at.gt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.gt.${cursor.id})`,
          );
        }
      }

      const { data: pageRows, error: pageErr } = await pageQuery;
      if (pageErr) {
        return c.json({ error: pageErr.message }, 500);
      }

      const raw = (pageRows || []) as ProjectionRow[];
      const truncated = raw.length > limit;
      const page = truncated ? raw.slice(0, limit) : raw;
      const last = page[page.length - 1];
      const nextCursor = truncated && last
        ? encodeCursor(last.occurred_at, last.id)
        : null;

      const sanitized = page.map((r) => {
        const payload = r.payload || {};
        const rbacUser = c.get("rbacUser") as RbacUser | undefined;
        const canSeeLocation = rbacUser
          ? hasPermission(rbacUser.resolvedRole, "drivers.location.view")
          : false;
        return {
          ...r,
          payload: canSeeLocation ? payload : stripCoords(payload),
          locationWithheld: !canSeeLocation &&
            ("lat" in payload || "lng" in payload || "location_lat" in payload),
          durationLabel: null as string | null,
        };
      });

      const rbacUser = c.get("rbacUser") as RbacUser | undefined;
      if (
        rbacUser &&
        hasPermission(rbacUser.resolvedRole, "drivers.location.view") &&
        sanitized.some((r) => {
          const p = (r as any).payload || {};
          return "lat" in p || "lng" in p || "location_lat" in p;
        })
      ) {
        await appendDriverAuditEvent(c, {
          driverId,
          action: "activity_location_read",
          reason: `Viewed activity location data ${window.from} → ${window.to}`,
          after: { from: window.from, to: window.to },
        });
      }

      // Attach server segment duration hints for presence rows
      const onlineSegs = segments.filter((s) => s.kind === "online" || s.kind === "offline");
      for (const row of sanitized) {
        if (row.event_type !== "went_online" && row.event_type !== "went_offline") continue;
        const match = onlineSegs.find((s) => s.from === row.occurred_at || s.to === row.occurred_at);
        if (match?.seconds != null) {
          (row as any).segmentSeconds = match.seconds;
          (row as any).closedBy = match.closedBy;
          (row as any).segmentOpen = match.to == null;
        }
      }

      const clustered = clusterEventsByJob(sanitized as ActivityEventLike[]);

      const watermark = page.reduce((max, r) => {
        const t = r.ingested_at || "";
        return t > max ? t : max;
      }, "");

      return c.json({
        success: true,
        orgId,
        window,
        coverage,
        coverageBySource,
        coverageHonesty: {
          presenceRecorded,
          tripsRecorded,
          message: !presenceRecorded && tripsRecorded
            ? "Trips recorded · presence not recorded"
            : presenceRecorded && !tripsRecorded
            ? "Presence recorded · trip events not recorded"
            : undefined,
        },
        segments,
        data: sanitized,
        clusters: clustered,
        nextCursor,
        truncated,
        watermark: watermark || null,
        lanes,
      });
    },
  );

  // ── Summary (ACT-16) ─────────────────────────────────────────────────────
  app.get(
    `${PREFIX}/drivers/:id/activity/summary`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.view"),
    async (c) => {
      const orgId = getOrgId(c);
      const driverId = String(c.req.param("id") || "").trim();
      const flagOn = await isFeatureEnabled(FEATURE_FLAGS.DRIVER_ACTIVITY, orgId);
      if (!flagOn) return c.json({ error: "driver_activity_disabled" }, 404);

      const fromQ = c.req.query("from") || new Date(Date.now() - 7 * 86400000).toISOString();
      const toQ = c.req.query("to") || new Date().toISOString();
      const window = clampActivityWindow(fromQ, toQ, 31);
      const serviceLines = (c.req.query("serviceLines") || "roam_rides,roam_rush")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const sb = serviceClient();
      const authIds = await resolveDriverAuthIds(driverId);

      const { data: events, error } = await sb
        .from("fleet_driver_activity_events")
        .select("event_type, occurred_at, job_ref, job_seq, source_event_id, payload, service_line")
        .in("driver_id", authIds)
        .in("service_line", serviceLines)
        .gte("occurred_at", window.from)
        .lte("occurred_at", window.to)
        .limit(10000);

      if (error) return c.json({ error: error.message }, 500);

      const list = (events || []) as ActivityEventLike[];
      const segments = deriveStatusSegments(list, window.from, window.to);
      const onlineSeconds = sumSegmentSeconds(segments, "online");
      const onJobSeconds = sumSegmentSeconds(segments, "on_job");
      const utilizationPct = onlineSeconds > 0
        ? Math.min(100, (onJobSeconds / onlineSeconds) * 100)
        : null;

      const offersReceived = list.filter((e) => e.event_type === "offer_received").length;
      const offersAccepted = list.filter((e) => e.event_type === "offer_accepted").length;
      const offersDeclined = list.filter((e) => e.event_type === "offer_declined").length;
      const offersExpired = list.filter((e) => e.event_type === "offer_expired").length;
      const acceptanceRate = computeEventAcceptanceRate({
        accepted: offersAccepted,
        declined: offersDeclined,
        expired: offersExpired,
      });

      const cancels = list.filter((e) =>
        e.event_type === "driver_cancelled" || e.event_type === "rider_cancelled" ||
        e.event_type === "system_cancelled"
      ).length;
      const completes = list.filter((e) => e.event_type === "job_completed").length;
      const cancelDen = cancels + completes;
      const cancellationRate = cancelDen > 0 ? (cancels / cancelDen) * 100 : null;

      const openSessionCount = segments.filter((s) => s.kind === "online" && s.to == null).length;
      const sessionsClosedByTimeout = segments.filter((s) => s.closedBy === "timeout").length;

      const coverageRows = await loadCoverage(sb, serviceLines);
      const coverageBySource = buildCoverageBySource(window.from, window.to, coverageRows);
      const presenceKeys = presenceCoverageKeys(coverageBySource);
      const tripKeys = tripCoverageKeys(coverageBySource);
      const presenceOk = presenceKeys.some((k) => sourceFullyRecorded(coverageBySource[k] || []));
      const tripsOk = tripKeys.some((k) =>
        (coverageBySource[k] || []).some((w) => w.recorded),
      );
      const anyRecorded = presenceOk || tripsOk;
      const basis = !anyRecorded
        ? "unavailable"
        : !presenceOk || !tripsOk
        ? "partial"
        : "event";

      return c.json({
        success: true,
        orgId,
        window,
        onlineSeconds,
        onJobSeconds,
        utilizationPct,
        offersReceived,
        offersAccepted,
        offersDeclined,
        offersExpired,
        acceptanceRate,
        cancellationRate,
        basis,
        openSessionCount,
        sessionsClosedByTimeout,
        coverageBySource,
        coverageHonesty: {
          presenceRecorded: presenceOk,
          tripsRecorded: tripsOk,
        },
      });
    },
  );

  // ── CSV export (ACT-22) ──────────────────────────────────────────────────
  app.get(
    `${PREFIX}/drivers/:id/activity/export.csv`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.view"),
    async (c) => {
      const orgId = getOrgId(c);
      const driverId = String(c.req.param("id") || "").trim();
      const flagOn = await isFeatureEnabled(FEATURE_FLAGS.DRIVER_ACTIVITY, orgId);
      if (!flagOn) return c.json({ error: "driver_activity_disabled" }, 404);

      const fromQ = c.req.query("from") || new Date(Date.now() - 7 * 86400000).toISOString();
      const toQ = c.req.query("to") || new Date().toISOString();
      const window = clampActivityWindow(fromQ, toQ, 31);
      const serviceLines = (c.req.query("serviceLines") || "roam_rides,roam_rush")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const sb = serviceClient();
      const authIds = await resolveDriverAuthIds(driverId);
      const { data: events, error } = await sb
        .from("fleet_driver_activity_events")
        .select("event_type, occurred_at, service_line, job_ref, source, source_event_id, payload")
        .in("driver_id", authIds)
        .in("service_line", serviceLines)
        .gte("occurred_at", window.from)
        .lte("occurred_at", window.to)
        .order("occurred_at", { ascending: false })
        .limit(20000);

      if (error) return c.json({ error: error.message }, 500);

      await appendDriverAuditEvent(c, {
        driverId,
        action: "activity_export",
        reason: `Exported activity ${window.from} → ${window.to}`,
        after: { from: window.from, to: window.to, serviceLines, rowCount: (events || []).length },
      });

      const header = "occurred_at,event_type,service_line,job_ref,source,source_event_id\n";
      const lines = (events || []).map((e: any) => {
        const cells = [
          e.occurred_at,
          e.event_type,
          e.service_line,
          e.job_ref || "",
          e.source,
          e.source_event_id,
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
        return cells.join(",");
      });
      const csv = header + lines.join("\n");
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="driver-activity-${driverId}.csv"`,
        },
      });
    },
  );
}
