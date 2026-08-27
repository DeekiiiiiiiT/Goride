/**
 * Platform Matching Brain — Edge Function
 *
 * Central matching engine for rider-driver dispatch serving multiple products:
 * - rides (roam-s.co, roamdriver.co)
 * - fleet (roamfleet.co) [future]
 * - dash (roamrush.app) [future]
 * - enterprise (roamenterprise.co) [future]
 *
 * Configured from Super Admin at roamdominion.co.
 * See docs/platform/MATCHING_BRAIN.md for architecture.
 *
 * Phase 2: rides legacy dual-path is retired unless MATCHING_LEGACY_FALLBACK=1
 * (emergency). Prefer brain-only; fail closed on brain errors to avoid drift.
 *
 * Feature flags (default OFF):
 * - MATCHING_BRAIN_ENABLED: Master kill-switch
 * - MATCHING_SERIAL_DISPATCH: Serial 1-to-1 offers
 * - MATCHING_H3_SUPPLY: H3-indexed driver lookup
 * - MATCHING_H3_SURGE: H3 surge cells
 * - MATCHING_LEGACY_FALLBACK: Emergency rides-local reconcile/wave after brain failure
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyCors } from "../_shared/corsAllowlist.ts";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { requirePlatformAdmin, PLATFORM_ADMIN_ROLES } from "../_shared/platformAdmin.ts";
import { jwtPrimaryRole } from "../_shared/authEdge.ts";
import { getFlag } from "../_shared/featureFlags.ts";
import { loadMatchingPolicy, invalidatePolicyCache, type ResolvedPolicy } from "./policy/loadPolicy.ts";
import { startMatching, reconcileMatching as doReconcile } from "./dispatch/reconcileMatching.ts";
import { patchDriverOfferRow, supersedePendingOffersForRide, loadDriverOfferById } from "./dispatch/offerWrites.ts";
import {
  acceptEnterpriseJobOffer,
  declineEnterpriseJobOffer,
  reconcileEnterpriseJob,
  startEnterpriseJobMatching,
} from "../logistics/enterpriseMatching.ts";

/** Match Supabase path prefix: .../functions/v1/matching/<route> → /matching/<route> */
const app = new Hono().basePath("/matching");

applyCors(app);

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "matching", ts: new Date().toISOString(), ...payload }));
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function authClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

async function isMatchingBrainEnabled(): Promise<boolean> {
  return getFlag("MATCHING_BRAIN_ENABLED", false);
}

/** Fields shared by matching_policies and rides.dispatch_settings (dual-write / sync). */
const POLICY_DUAL_WRITE_FIELDS = [
  "max_match_waves",
  "wave_radius_km",
  "max_offers_per_wave",
  "default_driver_offer_timeout_seconds",
  "driver_location_max_age_minutes",
  "max_matching_duration_minutes",
  "quote_driver_radius_km",
  "body_type_filtering_enabled",
  "body_type_tier_mode",
  "require_body_type_for_offers",
  "independent_only_matching",
  "trip_location_interval_seconds",
  "pickup_geofence_radius_m",
  "dropoff_geofence_radius_m",
  "arrival_dwell_seconds",
  "max_speed_mps_for_arrival",
  "auto_en_route_on_accept",
  "auto_arrive_enabled",
  "auto_complete_suggest_enabled",
  "no_show_cancel_minutes",
  "gps_max_accuracy_m_for_arrival",
  "no_show_auto_cancel_enabled",
  "wait_time_grace_minutes",
  "wait_time_rate_per_min_minor",
  "wait_time_charge_enabled",
  "wait_time_max_minutes",
  "pin_verification_enabled",
  "pin_verification_required_for_start",
  "toll_detection_enabled",
  "toll_geofence_radius_m",
  "toll_detect_enroute",
  "route_toll_estimation_enabled",
] as const;

/** Patchable matching_policies columns (shared + matching-only). */
const POLICY_PATCH_ALLOWED_FIELDS = [
  "name",
  ...POLICY_DUAL_WRITE_FIELDS,
  "serial_dispatch_enabled",
  // h3_resolution is migration-only — rejected below if present in body
  "h3_supply_enabled",
  "h3_surge_enabled",
  // wave_h3_k_rings derived at runtime; optional override still allowed for ops
  "wave_h3_k_rings",
] as const;

async function requireUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 as const };
  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 as const };
  return { user };
}

function requireInternalAuth(c: { req: { raw: Request } }): Response | null {
  return requireInternalSecret(c.req.raw, {
    envKeys: ["MATCHING_INTERNAL_SECRET"],
    headerNames: ["X-Matching-Internal-Secret"],
  });
}

type ProductKey = "rides" | "fleet" | "dash" | "enterprise";

function parseProductKey(raw: unknown): ProductKey | null {
  if (raw === "rides" || raw === "fleet" || raw === "dash" || raw === "enterprise") {
    return raw;
  }
  return null;
}

// Admin write roles
const ADMIN_WRITE_ROLES = new Set(["platform_owner", "superadmin", "rides_admin"]);

async function audit(
  db: SupabaseClient,
  eventType: string,
  productKey: string | null,
  policyId: string | null,
  actorUserId: string | null,
  payload: Record<string, unknown>,
) {
  await db.from("matching_audit_events").insert({
    event_type: eventType,
    product_key: productKey,
    policy_id: policyId,
    actor_user_id: actorUserId,
    payload,
  }).then(({ error }) => {
    if (error) {
      logLine({ event: "audit_insert_failed", error: error.message, eventType });
    }
  });
}

// -----------------------------------------------------------------------------
// Health
// -----------------------------------------------------------------------------

app.get("/health", async (c) => {
  return c.json({
    service: "matching",
    status: "ok",
    brain_enabled: await isMatchingBrainEnabled(),
    flags: {
      MATCHING_BRAIN_ENABLED: Deno.env.get("MATCHING_BRAIN_ENABLED") ?? "0",
      RIDES_USE_MATCHING_BRAIN: Deno.env.get("RIDES_USE_MATCHING_BRAIN") ?? "0",
      MATCHING_LEGACY_FALLBACK: Deno.env.get("MATCHING_LEGACY_FALLBACK") ?? "0",
      MATCHING_SERIAL_DISPATCH: Deno.env.get("MATCHING_SERIAL_DISPATCH") ?? "0",
      MATCHING_H3_SUPPLY: Deno.env.get("MATCHING_H3_SUPPLY") ?? "0",
      MATCHING_H3_SURGE: Deno.env.get("MATCHING_H3_SURGE") ?? "0",
    },
  });
});

// -----------------------------------------------------------------------------
// Admin: Dispatch pilot allowlist (staged fleet rollout)
// -----------------------------------------------------------------------------

app.get("/admin/dispatch-pilots", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const db = svc();
  const { data, error } = await db
    .from("driver_profiles")
    .select("user_id, display_name, mode, status, fleet_id, dispatch_pilot")
    .eq("mode", "fleet")
    .order("display_name", { ascending: true, nullsFirst: false });

  if (error) {
    logLine({ event: "admin_dispatch_pilots_list_failed", error: error.message });
    return c.json({ error: "list_failed", message: error.message }, 500);
  }

  return c.json({ drivers: data ?? [] });
});

app.patch("/admin/dispatch-pilots/:userId", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden", message: "Write access requires platform_owner, superadmin, or rides_admin" }, 403);
  }

  const userId = c.req.param("userId");
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.dispatch_pilot !== "boolean") {
    return c.json({ error: "invalid_dispatch_pilot" }, 400);
  }

  const db = svc();
  const { data, error } = await db
    .from("driver_profiles")
    .update({ dispatch_pilot: body.dispatch_pilot, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id, display_name, mode, status, fleet_id, dispatch_pilot")
    .maybeSingle();

  if (error) {
    logLine({ event: "admin_dispatch_pilot_update_failed", error: error.message, user_id: userId });
    return c.json({ error: "update_failed", message: error.message }, 500);
  }
  if (!data) return c.json({ error: "not_found" }, 404);

  await audit(db, "dispatch_pilot_updated", null, null, auth.id, {
    target_user_id: userId,
    dispatch_pilot: body.dispatch_pilot,
  });

  return c.json({ driver: data });
});

// -----------------------------------------------------------------------------
// Admin: Policies
// -----------------------------------------------------------------------------

app.get("/admin/policies", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const db = svc();
  const { data: policies, error } = await db
    .from("matching_policies")
    .select("*")
    .order("is_default", { ascending: false })
    .order("name");

  if (error) {
    logLine({ event: "admin_policies_list_failed", error: error.message });
    return c.json({ error: "list_failed", message: error.message }, 500);
  }

  return c.json({ policies: policies ?? [] });
});

app.get("/admin/policies/:id", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const id = c.req.param("id");
  const db = svc();
  const { data: policy, error } = await db
    .from("matching_policies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logLine({ event: "admin_policy_get_failed", error: error.message, policy_id: id });
    return c.json({ error: "get_failed", message: error.message }, 500);
  }

  if (!policy) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ policy });
});

app.patch("/admin/policies/:id", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden", message: "Write access requires platform_owner, superadmin, or rides_admin" }, 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const db = svc();

  // Validate wave_radius_km if provided
  if (body.wave_radius_km !== undefined) {
    if (!Array.isArray(body.wave_radius_km)) {
      return c.json({ error: "invalid_wave_radius_km" }, 400);
    }
    const nums = body.wave_radius_km.map((v: unknown) => Number(v));
    if (nums.some((n: number) => !Number.isFinite(n) || n <= 0)) {
      return c.json({ error: "invalid_wave_radius_km" }, 400);
    }
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] <= nums[i - 1]) {
        return c.json({ error: "wave_radius_km_must_ascend" }, 400);
      }
    }
  }

  // Bug #1: resolution changes must be a re-stamp migration, never a live toggle
  if (body.h3_resolution !== undefined) {
    return c.json({
      error: "h3_resolution_locked",
      message: "Changing H3 resolution requires an engineering migration to re-stamp live presence cells.",
    }, 400);
  }

  // Build patch
  const patch: Record<string, unknown> = { updated_by: auth.id };
  for (const field of POLICY_PATCH_ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      patch[field] = body[field];
    }
  }

  const { data: updated, error } = await db
    .from("matching_policies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    logLine({ event: "admin_policy_update_failed", error: error.message, policy_id: id });
    return c.json({ error: "update_failed", message: error.message }, 500);
  }

  if (!updated) {
    return c.json({ error: "not_found" }, 404);
  }

  invalidatePolicyCache();

  // Dual-write to rides.dispatch_settings for backward compatibility
  // Only sync if this is the default policy and dual-write is enabled
  let dualWriteStatus: "skipped" | "success" | "failed" = "skipped";
  const dualWriteEnabled = Deno.env.get("MATCHING_DUAL_WRITE_ENABLED") === "1";
  
  if (dualWriteEnabled && updated.is_default) {
    try {
      const legacyPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: auth.id,
      };

      // Map policy fields to legacy table (only include fields that exist in both)
      for (const field of POLICY_DUAL_WRITE_FIELDS) {
        if (updated[field] !== undefined) {
          legacyPatch[field] = updated[field];
        }
      }

      const { error: legacyError } = await db
        .from("rides_dispatch_settings")
        .update(legacyPatch)
        .eq("id", 1);

      if (legacyError) {
        logLine({ event: "dual_write_failed", error: legacyError.message, policy_id: id });
        dualWriteStatus = "failed";
      } else {
        logLine({ event: "dual_write_success", policy_id: id });
        dualWriteStatus = "success";
      }
    } catch (e) {
      logLine({ event: "dual_write_error", error: String(e), policy_id: id });
      dualWriteStatus = "failed";
    }
  }

  await audit(db, "matching_policy_updated", null, id, auth.id, {
    changed_fields: Object.keys(patch).filter((k) => k !== "updated_by"),
    dual_write_status: dualWriteStatus,
  });

  logLine({ event: "admin_policy_updated", policy_id: id, actor: auth.id, dual_write_status: dualWriteStatus });

  return c.json({ policy: updated, dual_write_status: dualWriteStatus });
});

// -----------------------------------------------------------------------------
// Admin: Product Profiles
// -----------------------------------------------------------------------------

app.get("/admin/product-profiles", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const db = svc();
  const { data: profiles, error } = await db
    .from("matching_product_profiles")
    .select("*, policy:matching_policies(*)")
    .order("product_key")
    .order("surface_key");

  if (error) {
    logLine({ event: "admin_profiles_list_failed", error: error.message });
    return c.json({ error: "list_failed", message: error.message }, 500);
  }

  return c.json({ profiles: profiles ?? [] });
});

app.post("/admin/product-profiles", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const productKey = parseProductKey(body.product_key);
  if (!productKey) {
    return c.json({ error: "invalid_product_key" }, 400);
  }

  const surfaceKey = body.surface_key ?? "default";
  if (!["rider", "driver", "default"].includes(surfaceKey)) {
    return c.json({ error: "invalid_surface_key" }, 400);
  }

  const policyId = body.policy_id;
  if (!policyId || typeof policyId !== "string") {
    return c.json({ error: "policy_id_required" }, 400);
  }

  const db = svc();

  // Verify policy exists
  const { data: policy } = await db
    .from("matching_policies")
    .select("id")
    .eq("id", policyId)
    .maybeSingle();

  if (!policy) {
    return c.json({ error: "policy_not_found" }, 404);
  }

  const { data: profile, error } = await db
    .from("matching_product_profiles")
    .insert({
      product_key: productKey,
      surface_key: surfaceKey,
      policy_id: policyId,
      overrides: body.overrides ?? null,
      is_active: body.is_active !== false,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return c.json({ error: "profile_already_exists" }, 409);
    }
    logLine({ event: "admin_profile_create_failed", error: error.message });
    return c.json({ error: "create_failed", message: error.message }, 500);
  }

  invalidatePolicyCache();

  await audit(db, "matching_profile_created", productKey, policyId, auth.id, {
    surface_key: surfaceKey,
  });

  logLine({ event: "admin_profile_created", profile_id: profile.id, product_key: productKey });

  return c.json({ profile }, 201);
});

app.patch("/admin/product-profiles/:id", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const db = svc();

  const patch: Record<string, unknown> = {};
  if (body.policy_id !== undefined) patch.policy_id = body.policy_id;
  if (body.overrides !== undefined) patch.overrides = body.overrides;
  if (body.is_active !== undefined) patch.is_active = body.is_active;

  const { data: updated, error } = await db
    .from("matching_product_profiles")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    logLine({ event: "admin_profile_update_failed", error: error.message, profile_id: id });
    return c.json({ error: "update_failed", message: error.message }, 500);
  }

  if (!updated) {
    return c.json({ error: "not_found" }, 404);
  }

  invalidatePolicyCache();

  await audit(db, "matching_profile_updated", updated.product_key, updated.policy_id, auth.id, {
    profile_id: id,
    changed_fields: Object.keys(patch),
  });

  logLine({ event: "admin_profile_updated", profile_id: id });

  return c.json({ profile: updated });
});

// -----------------------------------------------------------------------------
// Internal: Dispatch Endpoints
// -----------------------------------------------------------------------------

/** Retired dual-path stub — was never implemented; hard-404 so callers fail loudly. */
app.all("/v1/internal/run-wave", (c) => {
  logLine({ event: "deprecated_route", path: "/v1/internal/run-wave", method: c.req.method });
  return c.json({ error: "gone", message: "run-wave retired; use start-matching / reconcile" }, 404);
});

app.post("/v1/internal/start-matching", async (c) => {
  {
    const denied = requireInternalAuth(c);
    if (denied) return denied;
  }

  if (!(await isMatchingBrainEnabled())) {
    return c.json({ error: "matching_brain_disabled" }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const productKey = parseProductKey(body.product_key);
  if (!productKey) {
    return c.json({ error: "invalid_product_key" }, 400);
  }

  // Enterprise logistics jobs — never touch ride_requests
  if (productKey === "enterprise") {
    const jobId = body.job_id || body.ride_request_id;
    if (!jobId || typeof jobId !== "string") {
      return c.json({ error: "job_id_required" }, 400);
    }
    logLine({
      event: "start_matching_enterprise",
      job_id: jobId,
      request_id: body.request_id ?? null,
    });
    try {
      const result = await startEnterpriseJobMatching(jobId, body.actor_user_id ?? null);
      return c.json({
        ok: result.ok,
        job_id: jobId,
        ride_request_id: jobId,
        wave: result.wave,
        offers_created: result.offers_created ?? result.pending_offers,
        status: result.status,
        action_taken: result.action_taken,
        error: result.error,
      });
    } catch (e) {
      logLine({ event: "start_matching_enterprise_error", job_id: jobId, error: String(e) });
      return c.json({ ok: false, error: "start_matching_failed", message: String(e) }, 500);
    }
  }

  const rideRequestId = body.ride_request_id;
  if (!rideRequestId || typeof rideRequestId !== "string") {
    return c.json({ error: "ride_request_id_required" }, 400);
  }

  const rideSnapshot = body.ride_snapshot;
  if (!rideSnapshot || typeof rideSnapshot.pickup_lat !== "number") {
    return c.json({ error: "ride_snapshot_required" }, 400);
  }

  const policy = await loadMatchingPolicy(svc(), productKey, body.surface_key ?? "default");

  logLine({
    event: "start_matching",
    product_key: productKey,
    ride_request_id: rideRequestId,
    policy_id: policy.policy_id,
    request_id: body.request_id ?? null,
  });

  try {
    const result = await startMatching(
      rideRequestId,
      {
        id: rideRequestId,
        pickup_lat: rideSnapshot.pickup_lat,
        pickup_lng: rideSnapshot.pickup_lng,
        vehicle_option: rideSnapshot.vehicle_option ?? "",
        rider_user_id: rideSnapshot.rider_user_id ?? "",
        driver_offer_timeout_seconds: rideSnapshot.driver_offer_timeout_seconds,
      },
      policy,
      body.request_id,
    );

    return c.json({
      ok: result.ok,
      ride_request_id: rideRequestId,
      wave: result.wave,
      offers_created: result.pending_offers,
      status: result.status,
      action_taken: result.action_taken,
    });
  } catch (e) {
    logLine({ event: "start_matching_error", ride_request_id: rideRequestId, error: String(e) });
    return c.json({ ok: false, error: "start_matching_failed", message: String(e) }, 500);
  }
});

app.post("/v1/internal/reconcile", async (c) => {
  {
    const denied = requireInternalAuth(c);
    if (denied) return denied;
  }

  if (!(await isMatchingBrainEnabled())) {
    return c.json({ error: "matching_brain_disabled" }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const productKey = parseProductKey(body.product_key);
  if (!productKey) {
    return c.json({ error: "invalid_product_key" }, 400);
  }

  if (productKey === "enterprise") {
    const jobId = body.job_id || body.ride_request_id;
    if (!jobId || typeof jobId !== "string") {
      return c.json({ error: "job_id_required" }, 400);
    }
    try {
      const result = await reconcileEnterpriseJob(jobId);
      return c.json({
        ok: result.ok,
        job_id: jobId,
        ride_request_id: jobId,
        status: result.status,
        wave: result.wave,
        pending_offers: result.pending_offers,
        action_taken: result.action_taken,
        error: result.error,
      });
    } catch (e) {
      return c.json({ ok: false, error: "reconcile_failed", message: String(e) }, 500);
    }
  }

  const rideRequestId = body.ride_request_id;
  if (!rideRequestId || typeof rideRequestId !== "string") {
    return c.json({ error: "ride_request_id_required" }, 400);
  }

  const policy = await loadMatchingPolicy(svc(), productKey, body.surface_key ?? "default");

  logLine({
    event: "reconcile",
    product_key: productKey,
    ride_request_id: rideRequestId,
    request_id: body.request_id ?? null,
  });

  try {
    const result = await doReconcile(rideRequestId, policy, body.request_id);

    return c.json({
      ok: result.ok,
      ride_request_id: rideRequestId,
      status: result.status,
      wave: result.wave,
      pending_offers: result.pending_offers,
      action_taken: result.action_taken,
    });
  } catch (e) {
    logLine({ event: "reconcile_error", ride_request_id: rideRequestId, error: String(e) });
    return c.json({ ok: false, error: "reconcile_failed", message: String(e) }, 500);
  }
});

app.post("/v1/internal/accept-offer", async (c) => {
  {
    const denied = requireInternalAuth(c);
    if (denied) return denied;
  }

  if (!(await isMatchingBrainEnabled())) {
    return c.json({ error: "matching_brain_disabled" }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const productKey = parseProductKey(body.product_key);
  if (!productKey) {
    return c.json({ error: "invalid_product_key" }, 400);
  }

  const offerId = body.offer_id;
  if (!offerId || typeof offerId !== "string") {
    return c.json({ error: "offer_id_required" }, 400);
  }

  const driverUserId = body.driver_user_id;
  if (!driverUserId || typeof driverUserId !== "string") {
    return c.json({ error: "driver_user_id_required" }, 400);
  }

  logLine({
    event: "accept_offer",
    product_key: productKey,
    offer_id: offerId,
    driver_user_id: driverUserId,
  });

  if (productKey === "enterprise") {
    const result = await acceptEnterpriseJobOffer(offerId, driverUserId);
    if (!result.ok) {
      return c.json({ ok: false, offer_id: offerId, error: result.error }, 409);
    }
    return c.json({
      ok: true,
      offer_id: offerId,
      job_id: result.job_id,
      status: result.status,
    });
  }

  const db = svc();

  // Call the atomic accept RPC
  const { data: result, error: rpcError } = await db.rpc("matching_accept_driver_offer", {
    p_offer_id: offerId,
    p_driver_user_id: driverUserId,
  });

  if (rpcError) {
    logLine({
      event: "accept_offer_rpc_failed",
      offer_id: offerId,
      error: rpcError.message,
    });
    return c.json({
      ok: false,
      error: "accept_rpc_failed",
      message: rpcError.message,
    }, 500);
  }

  const rpcResult = result as { ok: boolean; error?: string; ride?: Record<string, unknown>; ride_request_id?: string };

  if (!rpcResult.ok) {
    logLine({
      event: "accept_offer_rejected",
      offer_id: offerId,
      error: rpcResult.error,
    });
    
    const statusMap: Record<string, number> = {
      offer_not_found: 404,
      offer_not_pending: 409,
      offer_expired: 410,
      ride_not_matching: 409,
      assign_failed: 409,
    };
    
    return c.json({
      ok: false,
      offer_id: offerId,
      error: rpcResult.error,
    }, statusMap[rpcResult.error ?? ""] ?? 400);
  }

  logLine({
    event: "accept_offer_success",
    offer_id: offerId,
    ride_request_id: rpcResult.ride_request_id,
    driver_user_id: driverUserId,
  });

  return c.json({
    ok: true,
    offer_id: offerId,
    ride_request_id: rpcResult.ride_request_id,
    ride: rpcResult.ride,
  });
});

app.post("/v1/internal/decline-offer", async (c) => {
  {
    const denied = requireInternalAuth(c);
    if (denied) return denied;
  }

  if (!(await isMatchingBrainEnabled())) {
    return c.json({ error: "matching_brain_disabled" }, 503);
  }

  const body = await c.req.json().catch(() => ({}));
  const productKey = parseProductKey(body.product_key);
  if (!productKey) {
    return c.json({ error: "invalid_product_key" }, 400);
  }

  const offerId = body.offer_id;
  if (!offerId || typeof offerId !== "string") {
    return c.json({ error: "offer_id_required" }, 400);
  }

  const driverUserId = body.driver_user_id;
  if (!driverUserId || typeof driverUserId !== "string") {
    return c.json({ error: "driver_user_id_required" }, 400);
  }

  if (productKey === "enterprise") {
    const result = await declineEnterpriseJobOffer(offerId, driverUserId);
    if (!result.ok && result.error === "offer_not_found") {
      return c.json({ error: "offer_not_found" }, 404);
    }
    return c.json({
      ok: result.ok,
      offer_id: offerId,
      status: result.status,
      wave: result.wave,
      pending_offers: result.pending_offers,
      action_taken: result.action_taken,
    });
  }

  const offer = await loadDriverOfferById(offerId);
  if (!offer || offer.driver_user_id !== driverUserId) {
    return c.json({ error: "offer_not_found" }, 404);
  }

  logLine({
    event: "decline_offer",
    product_key: productKey,
    offer_id: offerId,
    ride_request_id: offer.ride_request_id,
  });

  try {
    await patchDriverOfferRow(offerId, { status: "declined" });

    const policy = await loadMatchingPolicy(svc(), productKey, body.surface_key ?? "default");
    const result = await doReconcile(offer.ride_request_id, policy, body.request_id);

    return c.json({
      ok: true,
      offer_id: offerId,
      reconcile_triggered: true,
      reconcile_result: {
        status: result.status,
        wave: result.wave,
        pending_offers: result.pending_offers,
      },
    });
  } catch (e) {
    logLine({ event: "decline_offer_error", offer_id: offerId, error: String(e) });
    return c.json({ ok: false, error: "decline_failed", message: String(e) }, 500);
  }
});

// -----------------------------------------------------------------------------
// Cron: Batch reconcile (Phase 2+)
// -----------------------------------------------------------------------------

app.post("/v1/internal/reconcile-all", async (c) => {
  const denied = requireInternalSecret(c.req.raw, {
    envKeys: ["MATCHING_CRON_SECRET"],
    headerNames: ["X-Matching-Cron-Secret"],
  });
  if (denied) return denied;

  if (!(await isMatchingBrainEnabled())) {
    return c.json({ ok: true, message: "matching_brain_disabled", processed: 0 });
  }

  const db = svc();

  // Load all matching rides
  const { data: matchingRides, error: loadError } = await db
    .from("ride_requests")
    .select("id")
    .eq("status", "matching");

  if (loadError) {
    logLine({ event: "reconcile_all_load_failed", error: loadError.message });
    return c.json({ ok: false, error: "load_failed", processed: 0 }, 500);
  }

  const rideIds = (matchingRides ?? []).map((r) => r.id as string);
  let processed = 0;
  let errors = 0;

  for (const rideId of rideIds) {
    try {
      const policy = await loadMatchingPolicy(db, "rides", "default");
      await doReconcile(rideId, policy, `cron-${Date.now()}`);
      processed++;
    } catch (e) {
      errors++;
      logLine({ event: "reconcile_all_ride_error", ride_id: rideId, error: String(e) });
    }
  }

  logLine({ event: "reconcile_all_completed", total: rideIds.length, processed, errors });

  return c.json({
    ok: true,
    total: rideIds.length,
    processed,
    errors,
  });
});

// -----------------------------------------------------------------------------
// Admin: Sync Status (compares matching.policies vs rides.dispatch_settings)
// -----------------------------------------------------------------------------

app.get("/admin/policies/:id/sync-status", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  const id = c.req.param("id");
  const db = svc();

  // Load matching policy
  const { data: policy, error: policyError } = await db
    .from("matching_policies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (policyError || !policy) {
    return c.json({ error: "policy_not_found" }, 404);
  }

  // Load rides.dispatch_settings via public view
  const { data: legacySettings, error: legacyError } = await db
    .from("rides_dispatch_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (legacyError) {
    logLine({ event: "sync_status_legacy_load_failed", error: legacyError.message });
    return c.json({
      policy_id: id,
      in_sync: false,
      legacy_available: false,
      message: "Could not load rides.dispatch_settings",
    });
  }

  if (!legacySettings) {
    return c.json({
      policy_id: id,
      in_sync: true,
      legacy_available: false,
      message: "No rides.dispatch_settings found - using matching.policies only",
    });
  }

  // Compare fields that exist in both schemas
  const differences: Array<{
    field: string;
    matching_value: unknown;
    legacy_value: unknown;
  }> = [];

  for (const field of POLICY_DUAL_WRITE_FIELDS) {
    const matchingVal = policy[field];
    const legacyVal = legacySettings[field];

    // Handle array comparison (wave_radius_km)
    if (Array.isArray(matchingVal) && Array.isArray(legacyVal)) {
      if (JSON.stringify(matchingVal) !== JSON.stringify(legacyVal)) {
        differences.push({
          field,
          matching_value: matchingVal,
          legacy_value: legacyVal,
        });
      }
    } else if (matchingVal !== legacyVal) {
      differences.push({
        field,
        matching_value: matchingVal,
        legacy_value: legacyVal,
      });
    }
  }

  return c.json({
    policy_id: id,
    in_sync: differences.length === 0,
    legacy_available: true,
    differences,
    matching_updated_at: policy.updated_at,
    legacy_updated_at: legacySettings.updated_at,
  });
});

// -----------------------------------------------------------------------------
// Admin: Sync to Legacy (copy matching.policies → rides.dispatch_settings)
// -----------------------------------------------------------------------------

app.post("/admin/sync-to-legacy", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;

  if (!ADMIN_WRITE_ROLES.has(auth.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const policyId = body.policy_id;

  if (!policyId || typeof policyId !== "string") {
    return c.json({ error: "policy_id_required" }, 400);
  }

  const db = svc();

  // Load matching policy
  const { data: policy, error: policyError } = await db
    .from("matching_policies")
    .select("*")
    .eq("id", policyId)
    .maybeSingle();

  if (policyError || !policy) {
    return c.json({ error: "policy_not_found" }, 404);
  }

  // Build update for rides.dispatch_settings
  const legacyUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: auth.id,
  };
  for (const field of POLICY_DUAL_WRITE_FIELDS) {
    legacyUpdate[field] = policy[field];
  }

  const { error: updateError } = await db
    .from("rides_dispatch_settings")
    .update(legacyUpdate)
    .eq("id", 1);

  if (updateError) {
    logLine({ event: "sync_to_legacy_failed", error: updateError.message, policy_id: policyId });
    return c.json({ error: "sync_failed", message: updateError.message }, 500);
  }

  await audit(db, "matching_sync_to_legacy", null, policyId, auth.id, {
    fields_synced: Object.keys(legacyUpdate).filter((k) => k !== "updated_at" && k !== "updated_by"),
  });

  logLine({ event: "sync_to_legacy_completed", policy_id: policyId, actor: auth.id });

  return c.json({
    ok: true,
    policy_id: policyId,
    synced_fields: Object.keys(legacyUpdate).length - 2, // exclude updated_at, updated_by
  });
});

// -----------------------------------------------------------------------------
// Public: Policy query (for debugging/admin UIs)
// -----------------------------------------------------------------------------

app.get("/v1/policy", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  const productKey = parseProductKey(c.req.query("product_key"));
  if (!productKey) {
    return c.json({ error: "invalid_product_key" }, 400);
  }

  const surfaceKey = c.req.query("surface_key") ?? "default";
  const policy = await loadMatchingPolicy(svc(), productKey, surfaceKey);

  return c.json({
    policy,
    brain_enabled: await isMatchingBrainEnabled(),
  });
});

// -----------------------------------------------------------------------------
// Serve
// -----------------------------------------------------------------------------

Deno.serve(app.fetch);
