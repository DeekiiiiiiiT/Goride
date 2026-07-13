/**
 * Platform Fuel Brain — Edge Function
 *
 * Automated residual Personal stack:
 * Ride Share → Company Ops → capped Deadhead → Personal residual.
 * Dominion edits deadhead heuristics; Fleet recon consumes category km.
 *
 * Flags:
 * - FUEL_BRAIN_ENABLED: Edge accepts classify traffic
 * - FLEET_USE_FUEL_BRAIN: Fleet uses brain (client default ON unless =0)
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
  return c.req.header("X-Fuel-Brain-Internal-Secret") === secret;
}

const ADMIN_WRITE_ROLES = new Set(["platform_owner", "superadmin", "rides_admin"]);

function policyToApi(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    deadheadGapMaxMinutes: Number(row.deadhead_gap_max_minutes),
    personalGapMinMinutes: Number(row.personal_gap_min_minutes),
    peakHoursStart: Number(row.peak_hours_start),
    peakHoursEnd: Number(row.peak_hours_end),
    industryFallbackPct: Number(row.industry_fallback_pct ?? 35),
    crossValidationPp: Number(row.cross_validation_pp ?? 20),
    preferOdoGaps: row.prefer_odo_gaps !== false,
    ambiguousDeadheadSplitPct: Number(row.ambiguous_deadhead_split_pct ?? 60),
    isDefault: Boolean(row.is_default),
    updatedAt: row.updated_at,
  };
}

app.get("/health", (c) => {
  return c.json({
    service: "fuel-brain",
    status: "ok",
    brain_enabled: isFuelBrainEnabled(),
    stack: "residual_personal_v2",
    flags: {
      FUEL_BRAIN_ENABLED: Deno.env.get("FUEL_BRAIN_ENABLED") ?? "0",
      FLEET_USE_FUEL_BRAIN: Deno.env.get("FLEET_USE_FUEL_BRAIN") ?? "1",
    },
  });
});

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
  if (body.industryFallbackPct !== undefined) {
    patch.industry_fallback_pct = Number(body.industryFallbackPct);
  }
  if (body.crossValidationPp !== undefined) {
    patch.cross_validation_pp = Number(body.crossValidationPp);
  }
  if (body.preferOdoGaps !== undefined) patch.prefer_odo_gaps = Boolean(body.preferOdoGaps);
  if (body.ambiguousDeadheadSplitPct !== undefined) {
    patch.ambiguous_deadhead_split_pct = Number(body.ambiguousDeadheadSplitPct);
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

app.get("/admin/product-profiles", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const db = svc();
  const { data, error } = await db.from("fuel_product_profiles").select("*").order("created_at", {
    ascending: false,
  });
  if (error) return c.json({ error: "list_failed", message: error.message }, 500);

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
  const { data, error } = await db
    .from("fuel_product_profiles")
    .insert({
      product_key: body.productKey || "fleet",
      organization_id: body.organizationId || null,
      fuel_brain_consumer_allowed: Boolean(body.fuelBrainConsumerAllowed),
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

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
    deadheadHintKm: Number(body.deadheadHintKm) || 0,
  });

  logLine({
    event: "classify_week",
    vehicleId: body.vehicleId,
    driverId: body.driverId,
    weekStart: body.weekStart,
    personalKm: result.personalKm,
    deadheadKm: result.deadheadKm,
  });

  return c.json({ classification: result, brain_enabled: true });
});

Deno.serve(app.fetch);
