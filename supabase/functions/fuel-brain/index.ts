/**
 * Platform Fuel Brain — Edge Function
 *
 * Purpose classification for fleet fuel km (Ride Share, Personal, Deadhead,
 * Company Ops, Unknown). Dominion configures policies; Fleet consumes when
 * FLEET_USE_FUEL_BRAIN=1.
 *
 * Flags (default OFF):
 * - FUEL_BRAIN_ENABLED: master kill-switch for this Edge
 * - FUEL_PERSONAL_SESSIONS_ENABLED: evidence capture (clients)
 * - FLEET_USE_FUEL_BRAIN: Fleet recon consumes brain km
 *
 * See docs/platform/FUEL_BRAIN.md
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import { classifyFuelWeek } from "./classify.ts";

const app = new Hono().basePath("/fuel-brain");

app.use("*", cors());

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "fuel-brain", ts: new Date().toISOString(), ...payload }));
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function isFuelBrainEnabled(): boolean {
  return Deno.env.get("FUEL_BRAIN_ENABLED") === "1";
}

function requireInternalAuth(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const secret = Deno.env.get("FUEL_BRAIN_INTERNAL_SECRET");
  if (!secret) return false;
  const token = c.req.header("X-Fuel-Brain-Internal-Secret");
  return token === secret;
}

const ADMIN_WRITE_ROLES = new Set(["platform_owner", "superadmin", "rides_admin"]);

function policyToApi(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    deadheadGapMaxMinutes: row.deadhead_gap_max_minutes,
    personalGapMinMinutes: row.personal_gap_min_minutes,
    peakHoursStart: row.peak_hours_start,
    peakHoursEnd: row.peak_hours_end,
    unknownFinalizeThresholdKm: Number(row.unknown_finalize_threshold_km),
    unknownFinalizeThresholdPct: Number(row.unknown_finalize_threshold_pct),
    isDefault: row.is_default,
    updatedAt: row.updated_at,
  };
}

// -----------------------------------------------------------------------------
// Health
// -----------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({
    service: "fuel-brain",
    status: "ok",
    brain_enabled: isFuelBrainEnabled(),
    flags: {
      FUEL_BRAIN_ENABLED: Deno.env.get("FUEL_BRAIN_ENABLED") ?? "0",
      FUEL_PERSONAL_SESSIONS_ENABLED: Deno.env.get("FUEL_PERSONAL_SESSIONS_ENABLED") ?? "0",
      FLEET_USE_FUEL_BRAIN: Deno.env.get("FLEET_USE_FUEL_BRAIN") ?? "0",
    },
  });
});

// -----------------------------------------------------------------------------
// Admin: Policies
// -----------------------------------------------------------------------------

app.get("/admin/policies", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const db = svc();
  const { data, error } = await db.from("fuel_brain_policies").select("*").order("is_default", {
    ascending: false,
  });

  if (error) {
    logLine({ event: "admin_policies_list_failed", error: error.message });
    return c.json({ error: "list_failed", message: error.message }, 500);
  }

  return c.json({ policies: (data ?? []).map((r) => policyToApi(r as Record<string, unknown>)) });
});

app.put("/admin/policies", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const db = svc();

  const id = body.id;
  if (!id) return c.json({ error: "id_required" }, 400);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: auth.id,
  };
  if (body.name !== undefined) patch.name = body.name;
  if (body.deadheadGapMaxMinutes !== undefined) {
    patch.deadhead_gap_max_minutes = Number(body.deadheadGapMaxMinutes);
  }
  if (body.personalGapMinMinutes !== undefined) {
    patch.personal_gap_min_minutes = Number(body.personalGapMinMinutes);
  }
  if (body.peakHoursStart !== undefined) patch.peak_hours_start = Number(body.peakHoursStart);
  if (body.peakHoursEnd !== undefined) patch.peak_hours_end = Number(body.peakHoursEnd);
  if (body.unknownFinalizeThresholdKm !== undefined) {
    patch.unknown_finalize_threshold_km = Number(body.unknownFinalizeThresholdKm);
  }
  if (body.unknownFinalizeThresholdPct !== undefined) {
    patch.unknown_finalize_threshold_pct = Number(body.unknownFinalizeThresholdPct);
  }

  const { data, error } = await db
    .from("fuel_brain_policies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    logLine({ event: "admin_policy_update_failed", error: error.message });
    return c.json({ error: "update_failed", message: error.message }, 500);
  }

  return c.json({ policy: policyToApi(data as Record<string, unknown>) });
});

// -----------------------------------------------------------------------------
// Admin: Product profiles (which orgs may enable fleet consumer)
// -----------------------------------------------------------------------------

app.get("/admin/product-profiles", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const db = svc();
  const { data, error } = await db.from("fuel_product_profiles").select("*").order("created_at", {
    ascending: false,
  });

  if (error) {
    return c.json({ error: "list_failed", message: error.message }, 500);
  }

  return c.json({
    profiles: (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      productKey: r.product_key,
      organizationId: r.organization_id,
      fuelBrainConsumerAllowed: r.fuel_brain_consumer_allowed,
      notes: r.notes,
    })),
  });
});

app.post("/admin/product-profiles", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const db = svc();
  const row = {
    product_key: body.productKey || "fleet",
    organization_id: body.organizationId || null,
    fuel_brain_consumer_allowed: Boolean(body.fuelBrainConsumerAllowed),
    notes: body.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from("fuel_product_profiles").insert(row).select("*").single();
  if (error) return c.json({ error: "insert_failed", message: error.message }, 500);

  return c.json({
    profile: {
      id: data.id,
      productKey: data.product_key,
      organizationId: data.organization_id,
      fuelBrainConsumerAllowed: data.fuel_brain_consumer_allowed,
      notes: data.notes,
    },
  });
});

// -----------------------------------------------------------------------------
// Admin: Unknown review queue
// -----------------------------------------------------------------------------

app.get("/admin/unknown-reviews", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const status = c.req.query("status") || "open";
  const db = svc();
  const { data, error } = await db
    .from("fuel_unknown_reviews")
    .select("*")
    .eq("status", status)
    .order("week_start", { ascending: false })
    .limit(200);

  if (error) return c.json({ error: "list_failed", message: error.message }, 500);

  return c.json({
    reviews: (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      organizationId: r.organization_id,
      driverId: r.driver_id,
      vehicleId: r.vehicle_id,
      weekStart: r.week_start,
      weekEnd: r.week_end,
      unknownKm: Number(r.unknown_km),
      status: r.status,
      resolutionLabel: r.resolution_label,
      resolutionNotes: r.resolution_notes,
      createdAt: r.created_at,
    })),
  });
});

app.post("/admin/unknown-reviews", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const body = await c.req.json().catch(() => ({}));
  if (!body.driverId || !body.vehicleId || !body.weekStart || !body.weekEnd) {
    return c.json({ error: "missing_fields" }, 400);
  }

  const db = svc();
  const row = {
    organization_id: body.organizationId || null,
    driver_id: body.driverId,
    vehicle_id: body.vehicleId,
    week_start: body.weekStart,
    week_end: body.weekEnd,
    unknown_km: Number(body.unknownKm) || 0,
    status: "open",
    classify_snapshot: body.classifySnapshot || null,
  };

  const { data, error } = await db.from("fuel_unknown_reviews").insert(row).select("*").single();
  if (error) return c.json({ error: "insert_failed", message: error.message }, 500);

  return c.json({ review: data });
});

app.post("/admin/unknown-reviews/:id/resolve", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const label = body.resolutionLabel;
  if (!["personal", "deadhead", "company", "dismissed"].includes(label)) {
    return c.json({ error: "invalid_resolution_label" }, 400);
  }

  const db = svc();
  const { data, error } = await db
    .from("fuel_unknown_reviews")
    .update({
      status: label === "dismissed" ? "dismissed" : "resolved",
      resolution_label: label,
      resolution_notes: body.resolutionNotes || null,
      resolved_by: auth.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return c.json({ error: "resolve_failed", message: error.message }, 500);
  return c.json({ review: data });
});

// -----------------------------------------------------------------------------
// Internal: classify-week
// -----------------------------------------------------------------------------

app.post("/v1/internal/classify-week", async (c) => {
  if (!requireInternalAuth(c)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  if (!isFuelBrainEnabled()) {
    return c.json({
      error: "brain_disabled",
      message: "FUEL_BRAIN_ENABLED is off",
      brain_enabled: false,
    }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const result = classifyFuelWeek({
    totalOdometerKm: Number(body.totalOdometerKm) || 0,
    tripRideshareKm: Number(body.tripRideshareKm) || 0,
    companyOpsKm: Number(body.companyOpsKm) || 0,
    sessions: Array.isArray(body.sessions) ? body.sessions : [],
    deadheadHintKm: Number(body.deadheadHintKm) || 0,
  });

  logLine({
    event: "classify_week",
    vehicleId: body.vehicleId,
    driverId: body.driverId,
    weekStart: body.weekStart,
    unknownKm: result.unknownKm,
    personalKm: result.personalKm,
  });

  // Optionally enqueue unknown review when above threshold
  if (result.unknownKm > 0 && body.enqueueUnknownReview) {
    const db = svc();
    const { data: policies } = await db
      .from("fuel_brain_policies")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();
    const thresholdKm = Number(policies?.unknown_finalize_threshold_km ?? 25);
    if (result.unknownKm >= thresholdKm) {
      await db.from("fuel_unknown_reviews").insert({
        organization_id: body.organizationId || null,
        driver_id: body.driverId || "unknown",
        vehicle_id: body.vehicleId || "unknown",
        week_start: body.weekStart,
        week_end: body.weekEnd,
        unknown_km: result.unknownKm,
        status: "open",
        classify_snapshot: result,
      });
    }
  }

  return c.json({ classification: result, brain_enabled: true });
});

// Evidence health summary for Dominion
app.get("/admin/evidence-health", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const weekStart = c.req.query("weekStart");
  const weekEnd = c.req.query("weekEnd");
  if (!weekStart || !weekEnd) {
    return c.json({ error: "weekStart_and_weekEnd_required" }, 400);
  }

  const db = svc();
  const { data: sessions, error } = await db
    .from("fuel_driving_sessions")
    .select("*")
    .gte("start_at", `${weekStart}T00:00:00`)
    .or(`end_at.is.null,end_at.lte.${weekEnd}T23:59:59`);

  if (error) {
    return c.json({ error: "query_failed", message: error.message }, 500);
  }

  let declaredPersonalKm = 0;
  let sessionCount = 0;
  for (const s of sessions ?? []) {
    sessionCount += 1;
    if (s.mode === "personal" || s.mode === "off_duty") {
      const start = Number(s.start_odo);
      const end = Number(s.end_odo);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        declaredPersonalKm += end - start;
      }
    }
  }

  const { count: openUnknown } = await db
    .from("fuel_unknown_reviews")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");

  return c.json({
    weekStart,
    weekEnd,
    sessionCount,
    declaredPersonalKm: Number(declaredPersonalKm.toFixed(2)),
    openUnknownReviews: openUnknown ?? 0,
  });
});

Deno.serve(app.fetch);
