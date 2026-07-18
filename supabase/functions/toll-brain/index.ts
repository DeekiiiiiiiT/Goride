/**
 * Platform Toll Brain — Edge Function
 *
 * Detect (live geofence / quote) + Classify (toll ↔ trip match).
 * Dominion edits policies; rides + fleet consume via flags.
 *
 * See docs/platform/TOLL_BRAIN.md
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";
import { classifyTollMatch, mergePolicy, DEFAULT_POLICY } from "./classify.ts";
import { evaluatePoint, estimateRoute, loadPlazas, invalidatePlazaCache } from "./detect.ts";

const app = new Hono().basePath("/toll-brain");
app.use("*", cors());

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "toll-brain", ts: new Date().toISOString(), ...payload }));
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function isTollBrainEnabled(): boolean {
  return Deno.env.get("TOLL_BRAIN_ENABLED") === "1";
}

function requireInternalAuth(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const secret = Deno.env.get("TOLL_BRAIN_INTERNAL_SECRET");
  if (!secret) return false;
  return c.req.header("X-Toll-Brain-Internal-Secret") === secret;
}

const ADMIN_WRITE_ROLES = new Set(["platform_owner", "superadmin", "rides_admin"]);

function policyToApi(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    detectionEnabled: row.detection_enabled !== false,
    detectEnroute: Boolean(row.detect_enroute),
    geofenceRadiusM: Number(row.geofence_radius_m ?? 100),
    roundTripCooldownMs: Number(row.round_trip_cooldown_ms ?? 300000),
    approachMinutes: Number(row.approach_minutes ?? 45),
    postTripMinutes: Number(row.post_trip_minutes ?? 15),
    sameDayPadDays: Number(row.same_day_pad_days ?? 1),
    varianceThreshold: Number(row.variance_threshold ?? 0.05),
    cashAmountDeltaMax: Number(row.cash_amount_delta_max ?? 15),
    cashReceiptProximityMinutes: Number(row.cash_receipt_proximity_minutes ?? 90),
    personalUseDetectionEnabled: row.personal_use_detection_enabled !== false,
    orphanProximityMinutes: Number(row.orphan_proximity_minutes ?? 180),
    ambiguityMinScore: Number(row.ambiguity_min_score ?? 50),
    ambiguityMaxGap: Number(row.ambiguity_max_gap ?? 15),
    maxSuggestions: Number(row.max_suggestions ?? 5),
    liveLedgerMaterializeEnabled: row.live_ledger_materialize_enabled !== false,
    isDefault: Boolean(row.is_default),
    updatedAt: row.updated_at,
  };
}

async function loadDefaultPolicy(db: SupabaseClient) {
  const { data } = await db
    .from("toll_brain_policies")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  if (data) return policyToApi(data as Record<string, unknown>);
  return { ...DEFAULT_POLICY, id: "default" };
}

app.get("/health", (c) => {
  return c.json({
    service: "toll-brain",
    status: "ok",
    brain_enabled: isTollBrainEnabled(),
    stack: "detect_classify_v1",
    flags: {
      TOLL_BRAIN_ENABLED: Deno.env.get("TOLL_BRAIN_ENABLED") ?? "0",
      RIDES_USE_TOLL_BRAIN: Deno.env.get("RIDES_USE_TOLL_BRAIN") ?? "0",
      FLEET_USE_TOLL_BRAIN: Deno.env.get("FLEET_USE_TOLL_BRAIN") ?? "1",
    },
  });
});

app.get("/admin/policies", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  const db = svc();
  const { data, error } = await db.from("toll_brain_policies").select("*").order("is_default", {
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
  if (!ADMIN_WRITE_ROLES.has(auth.role)) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return c.json({ error: "id_required" }, 400);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: auth.id,
  };
  const map: Record<string, string> = {
    name: "name",
    detectionEnabled: "detection_enabled",
    detectEnroute: "detect_enroute",
    geofenceRadiusM: "geofence_radius_m",
    roundTripCooldownMs: "round_trip_cooldown_ms",
    approachMinutes: "approach_minutes",
    postTripMinutes: "post_trip_minutes",
    sameDayPadDays: "same_day_pad_days",
    varianceThreshold: "variance_threshold",
    cashAmountDeltaMax: "cash_amount_delta_max",
    cashReceiptProximityMinutes: "cash_receipt_proximity_minutes",
    personalUseDetectionEnabled: "personal_use_detection_enabled",
    orphanProximityMinutes: "orphan_proximity_minutes",
    ambiguityMinScore: "ambiguity_min_score",
    ambiguityMaxGap: "ambiguity_max_gap",
    maxSuggestions: "max_suggestions",
    liveLedgerMaterializeEnabled: "live_ledger_materialize_enabled",
  };
  for (const [apiKey, col] of Object.entries(map)) {
    if (body[apiKey] !== undefined) patch[col] = body[apiKey];
  }

  const db = svc();
  const { data, error } = await db
    .from("toll_brain_policies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    logLine({ event: "admin_policy_update_failed", error: error.message });
    return c.json({ error: "update_failed", message: error.message }, 500);
  }
  invalidatePlazaCache();
  return c.json({ policy: policyToApi(data as Record<string, unknown>) });
});

app.post("/v1/internal/classify-match", async (c) => {
  if (!requireInternalAuth(c)) return c.json({ error: "unauthorized" }, 401);
  if (!isTollBrainEnabled()) return c.json({ error: "brain_disabled" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const db = svc();
  const policy = body.policy ? mergePolicy(body.policy) : await loadDefaultPolicy(db);
  const result = classifyTollMatch({
    toll: body.toll || {},
    trips: body.trips || [],
    expectedCostAbs: body.expectedCostAbs,
    policy,
    includeOrphan: body.options?.includeOrphan,
  });
  return c.json({ ...result, brain_enabled: true, policy });
});

app.post("/v1/internal/evaluate-point", async (c) => {
  if (!requireInternalAuth(c)) return c.json({ error: "unauthorized" }, 401);
  if (!isTollBrainEnabled()) return c.json({ error: "brain_disabled" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const db = svc();
  const policy = body.policy ? mergePolicy(body.policy) : await loadDefaultPolicy(db);
  if (!policy.detectionEnabled) {
    return c.json({ tollsCrossed: [], totalTollsMinor: 0, method: "toll_brain_v1", detectionDisabled: true });
  }
  const plazas = await loadPlazas(db);
  const result = evaluatePoint({
    lat: Number(body.lat),
    lng: Number(body.lng),
    plazas,
    geofenceRadiusM: Number(body.geofenceRadiusM ?? policy.geofenceRadiusM),
    alreadyCrossedPlazaIds: body.alreadyCrossedPlazaIds,
    recentByPlaza: body.recentByPlaza,
    cooldownMs: Number(body.cooldownMs ?? policy.roundTripCooldownMs),
  });
  return c.json({ ...result, method: "toll_brain_v1" });
});

app.post("/v1/internal/estimate-route", async (c) => {
  if (!requireInternalAuth(c)) return c.json({ error: "unauthorized" }, 401);
  if (!isTollBrainEnabled()) return c.json({ error: "brain_disabled" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const db = svc();
  const policy = await loadDefaultPolicy(db);
  const plazas = await loadPlazas(db);
  const points = Array.isArray(body.points) ? body.points : [];
  const result = estimateRoute({
    points,
    plazas,
    geofenceRadiusM: Number(body.geofenceRadiusM ?? policy.geofenceRadiusM),
  });
  return c.json({ ...result, method: "toll_brain_v1" });
});

app.post("/v1/internal/record-crossing", async (c) => {
  if (!requireInternalAuth(c)) return c.json({ error: "unauthorized" }, 401);
  if (!isTollBrainEnabled()) return c.json({ error: "brain_disabled" }, 503);
  const body = await c.req.json().catch(() => ({}));
  const rideId = body.rideRequestId || body.rideId;
  const crossings = Array.isArray(body.crossings) ? body.crossings : [];
  if (!rideId || crossings.length === 0) {
    return c.json({ error: "rideRequestId_and_crossings_required" }, 400);
  }

  const db = svc();
  const policy = await loadDefaultPolicy(db);
  let recorded = 0;
  let totalMinor = 0;
  const insertedIds: string[] = [];

  for (const x of crossings) {
    const row = {
      ride_request_id: rideId,
      toll_plaza_id: x.tollPlazaId || x.toll_plaza_id,
      toll_plaza_name: x.tollPlazaName || x.toll_plaza_name,
      toll_amount_minor: Number(x.tollAmountMinor ?? x.toll_amount_minor ?? 0),
      currency: x.currency || "JMD",
      driver_lat: Number(x.driverLat ?? x.driver_lat),
      driver_lng: Number(x.driverLng ?? x.driver_lng),
    };
    const { data, error } = await db.from("ride_toll_crossings").insert(row).select("id").single();
    if (!error && data?.id) {
      recorded++;
      totalMinor += row.toll_amount_minor;
      insertedIds.push(String(data.id));

      // Bump ride actual tolls
      const { data: ride } = await db
        .from("ride_requests")
        .select("actual_tolls_minor")
        .eq("id", rideId)
        .maybeSingle();
      const prev = Number(ride?.actual_tolls_minor || 0);
      await db
        .from("ride_requests")
        .update({ actual_tolls_minor: prev + row.toll_amount_minor })
        .eq("id", rideId);

      // Live ledger materialize
      if (policy.liveLedgerMaterializeEnabled) {
        const now = new Date().toISOString();
        const ledgerId = crypto.randomUUID();
        const amountMajor = row.toll_amount_minor / 100;
        const ledger = {
          id: ledgerId,
          createdAt: now,
          updatedAt: now,
          vehicleId: body.vehicleId || null,
          driverId: body.driverId || null,
          driverName: body.driverName || null,
          plaza: row.toll_plaza_name,
          location: row.toll_plaza_name,
          date: now.split("T")[0],
          type: "usage",
          amount: -Math.abs(amountMajor),
          paymentMethod: "fleet_account",
          status: "pending",
          isReconciled: false,
          tripId: body.fleetTripId || null,
          description: `Toll crossing (Roam geofence): ${row.toll_plaza_name}`,
          referenceNumber: data.id,
          metadata: {
            source: "roam_geofence",
            rideTollCrossingId: data.id,
            rideRequestId: rideId,
            tollPlazaId: row.toll_plaza_id,
            currency: row.currency,
            tollBrain: "toll_brain_v1",
          },
        };
        await db.from("kv_store_37f42386").upsert({
          key: `toll_ledger:${ledgerId}`,
          value: ledger,
        });
        await db.from("kv_store_37f42386").upsert({
          key: `toll_bridge:crossing:${data.id}`,
          value: { ledgerId, bridgedAt: now, source: "toll_brain_live" },
        });
      }
    } else if (error) {
      logLine({ event: "record_crossing_failed", error: error.message });
    }
  }

  return c.json({
    recorded,
    totalTollsMinor: totalMinor,
    crossingIds: insertedIds,
    method: "toll_brain_v1",
  });
});

app.get("/v1/internal/ride-toll-state", async (c) => {
  if (!requireInternalAuth(c)) return c.json({ error: "unauthorized" }, 401);
  if (!isTollBrainEnabled()) return c.json({ error: "brain_disabled" }, 503);
  const rideId = c.req.query("rideRequestId") || c.req.query("rideId");
  if (!rideId) return c.json({ error: "rideRequestId_required" }, 400);
  const db = svc();
  const { data, error } = await db
    .from("ride_toll_crossings")
    .select("*")
    .eq("ride_request_id", rideId);
  if (error) return c.json({ error: error.message }, 500);
  const crossings = data || [];
  const totalMinor = crossings.reduce(
    (s: number, r: { toll_amount_minor?: number }) => s + Number(r.toll_amount_minor || 0),
    0,
  );
  return c.json({
    rideRequestId: rideId,
    crossings,
    totalTollsMinor: totalMinor,
    method: "toll_brain_v1",
  });
});

Deno.serve(app.fetch);
