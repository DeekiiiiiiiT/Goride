/**
 * POST /trips/analytics — one route, one section at a time so a broken chart is not a zero.
 */
import type { Hono } from "npm:hono@4.3.11";
import { getServiceClient } from "./service_client.ts";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { FEATURE_FLAGS, isFeatureEnabled } from "./feature_flags.ts";
import * as cache from "./cache.ts";
import { buildTripAnalyticsFilter } from "./trip_analytics_definitions.ts";
import { loadTripForOrg, orgFromTripRequest } from "./trip_facts_read.ts";

const SECTIONS = [
  "kpis",
  "volume",
  "heatmap",
  "cancellations",
  "economics",
  "geo",
  "anomalies",
  "coverage",
  "funnel",
] as const;

type Section = (typeof SECTIONS)[number];

function fleet() {
  return getServiceClient();
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function runSection(section: Section, orgId: string, filters: Record<string, unknown>): Promise<unknown> {
  const client = fleet();
  if (section === "kpis") {
    const { data, error } = await client.rpc("trip_analytics_kpis", { p_org: orgId, f: filters });
    if (error) throw new Error(error.message);
    return data;
  }
  if (section === "volume") {
    const { data, error } = await client.rpc("trip_analytics_volume", { p_org: orgId, f: filters, p_grain: "day" });
    if (error) throw new Error(error.message);
    return data;
  }
  if (section === "heatmap") {
    const measure = typeof filters.measure === "string" ? filters.measure : "completed";
    const { data, error } = await client.rpc("trip_analytics_heatmap", { p_org: orgId, f: filters, p_measure: measure });
    if (error) throw new Error(error.message);
    return data;
  }
  if (section === "cancellations") {
    const { data, error } = await client.rpc("trip_analytics_cancellations", { p_org: orgId, f: filters });
    if (error) throw new Error(error.message);
    return data;
  }
  if (section === "economics") {
    const { data, error } = await client.rpc("trip_analytics_economics", { p_org: orgId, f: filters });
    if (error) throw new Error(error.message);
    return data;
  }
  if (section === "geo") {
    const { data, error } = await client.rpc("trip_analytics_geo", { p_org: orgId, f: filters, p_kind: "all" });
    if (error) throw new Error(error.message);
    return data;
  }
  if (section === "anomalies") {
    const { data, error } = await client.rpc("trip_analytics_anomalies", { p_org: orgId, f: filters });
    if (error) throw new Error(error.message);
    return data;
  }
  if (section === "coverage") {
    const { data, error } = await client.rpc("trip_analytics_coverage", { p_org: orgId, f: filters });
    if (error) throw new Error(error.message);
    return data;
  }
  const on = await isFeatureEnabled(FEATURE_FLAGS.TRIP_ANALYTICS_ROAM_FUNNEL, orgId);
  if (!on) return { hidden: true, empty: true, completed: 0 };
  const { data, error } = await client.rpc("roam_ride_funnel", { p_org: orgId, f: filters });
  if (error) throw new Error(error.message);
  return data;
}

export function registerTripAnalyticsRoutes(app: Hono) {
  app.post("/make-server-37f42386/trips/analytics", requireAuth({ requireOrg: true }), async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const orgId = orgFromTripRequest(c, body);
      if (!orgId) return c.json({ error: "Missing organization" }, 403);
      const filters = buildTripAnalyticsFilter(body.filters && typeof body.filters === "object"
        ? { ...(body.filters as Record<string, unknown>), ...body }
        : body) as Record<string, unknown>;
      if (typeof body.measure === "string") filters.measure = body.measure;
      const requested = Array.isArray(body.sections)
        ? body.sections.filter((name): name is Section => SECTIONS.includes(name as Section))
        : [...SECTIONS];
      const sections = requested.length ? requested : [...SECTIONS];

      const watermark = await fleet().rpc("trip_analytics_watermark", { p_org: orgId });
      const version = await cache.getCacheVersion("trip-analytics");
      const cacheKey = await cache.generateKey(
        `trip-analytics:v1:${version}:org:${orgId}:wm:${watermark.data || "none"}`,
        { filters, sections },
      );
      if (body.refresh !== true) {
        const hit = await cache.getCache(cacheKey);
        if (hit) {
          c.header("X-Cache", "HIT");
          return c.json({ ...hit, cacheHit: true });
        }
      }

      const payload: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        cacheHit: false,
        errors: {} as Record<string, string>,
      };
      await Promise.all(sections.map(async (section) => {
        try {
          payload[section] = await runSection(section, orgId, filters);
        } catch (err) {
          (payload.errors as Record<string, string>)[section] = err instanceof Error ? err.message : "Section failed";
        }
      }));
      const sectionErrors = payload.errors as Record<string, string>;
      if (Object.keys(sectionErrors).length === 0) {
        await cache.setCache(cacheKey, payload, 300);
      }
      c.header("X-Cache", "MISS");
      return c.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Trip analytics failed";
      return c.json({ error: message }, 500);
    }
  });

  app.post("/make-server-37f42386/trips/analytics/review", requireAuth({ requireOrg: true }), requirePermission("transactions.edit"), async (c) => {
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const orgId = orgFromTripRequest(c, body);
      if (!orgId) return c.json({ error: "Missing organization" }, 403);
      const tripId = String(body.tripId || "");
      const rule = String(body.rule || "");
      const action = body.action === "keep" ? "keep" : "dismiss";
      if (!tripId || !rule) return c.json({ error: "Trip and rule are required" }, 400);
      const user = c.get("rbacUser") as RbacUser | undefined;
      const { error } = await fleet().rpc("trip_anomaly_review_save", {
        p_org: orgId,
        p_trip_id: tripId,
        p_rule: rule,
        p_action: action,
        p_reason: body.reason != null ? String(body.reason) : null,
        p_reviewed_by: user?.userId || null,
      });
      if (error) return c.json({ error: error.message }, 500);
      await cache.invalidateCacheVersion("trip-analytics");
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Review failed" }, 500);
    }
  });

  app.post("/make-server-37f42386/trips/analytics/settings", requireAuth({ requireOrg: true }), requirePermission("transactions.edit"), async (c) => {
    try {
      const body = await c.req.json() as Record<string, unknown>;
      const orgId = orgFromTripRequest(c, body);
      if (!orgId) return c.json({ error: "Missing organization" }, 403);
      const { error } = await fleet().rpc("trip_analytics_settings_save", {
        p_org: orgId,
        p_fare_floor: optionalNumber(body.fareFloor),
        p_fare_per_km_max: optionalNumber(body.farePerKmMax),
        p_long_distance_km: optionalNumber(body.longDistanceKm),
        p_long_duration_min: optionalNumber(body.longDurationMin),
        p_speed_high: optionalNumber(body.speedHigh),
        p_speed_low: optionalNumber(body.speedLow),
      });
      if (error) return c.json({ error: error.message }, 500);
      await cache.invalidateCacheVersion("trip-analytics");
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Settings failed" }, 500);
    }
  });

  app.post("/make-server-37f42386/trips/analytics/trip", requireAuth({ requireOrg: true }), async (c) => {
    try {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const orgId = orgFromTripRequest(c, body);
      if (!orgId) return c.json({ error: "Missing organization" }, 403);
      const tripId = String(body.tripId || "").trim();
      if (!tripId) return c.json({ error: "Trip is required" }, 400);
      const trip = await loadTripForOrg(orgId, tripId);
      if (!trip) return c.json({ error: "Trip not found" }, 404);
      return c.json({ trip });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Trip lookup failed" }, 500);
    }
  });
}
