/**
 * Roam Rides — passenger booking + Uber-style dispatch (waves / timeouts).
 *
 * Enterprise roadmap:
 * - Surge v2: swap coarse grid cell for **H3** indexing + periodic recomputation.
 * - Fairness: decline-aware cooldowns + starvation avoidance beyond rotate-by-wave.
 * See docs/passenger-rides/RIDES_SPEC.md
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";

const app = new Hono();

const MAX_MATCH_WAVES = 3;
const WAVE_RADIUS_KM = [5, 15, 35];
const MAX_OFFERS_PER_WAVE = 8;
const DRIVER_LOCATION_MAX_AGE_MS = 10 * 60 * 1000;
const BASE_MINOR_DEFAULT = 250;
const PER_KM_MINOR_DEFAULT = 150;
const PER_MIN_MINOR_DEFAULT = 35;
const MIN_FARE_MINOR_DEFAULT = 500;
const AVG_SPEED_KMH = 25;

type RideStatus =
  | "matching"
  | "driver_assigned"
  | "driver_en_route_pickup"
  | "driver_arrived_pickup"
  | "on_trip"
  | "completed"
  | "cancelled";

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "apikey",
      "x-client-info",
      "x-request-id",
    ],
  }),
);

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

function authClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ svc: "rides", ts: new Date().toISOString(), ...payload }));
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    "unknown";
}

/** Sliding-window rate limit (best-effort per isolate). */
const rlBuckets = new Map<string, number[]>();
function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = rlBuckets.get(key) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    rlBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rlBuckets.set(key, fresh);
  return true;
}

function gridCellKey(lat: number, lng: number): string {
  return `grid:${Math.floor(lat * 50)}:${Math.floor(lng * 50)}`;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const lat1 = aLat * Math.PI / 180;
  const lat2 = bLat * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function estimateFareMinor(params: {
  distanceKm: number;
  surgeMultiplier: number;
  baseMinor: number;
  perKmMinor: number;
  perMinMinor: number;
  minFareMinor: number;
}): { fareMinor: bigint; etaMinutes: number } {
  const etaMinutes = Math.max(1, Math.round((params.distanceKm / AVG_SPEED_KMH) * 60));
  const raw =
    params.baseMinor +
    params.perKmMinor * params.distanceKm +
    params.perMinMinor * etaMinutes;
  const adjusted = Math.round(raw * params.surgeMultiplier);
  const fareMinor = BigInt(Math.max(params.minFareMinor, adjusted));
  return { fareMinor, etaMinutes };
}

async function requireUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 as const };
  const { data: { user }, error } = await authClient(authHeader).auth.getUser();
  if (error || !user) return { error: "Unauthorized", status: 401 as const };
  return { user };
}

async function bumpSurgeDemand(cellKey: string, delta: number) {
  const db = svc();
  const { data: row } = await db.from("surge_cells").select("*").eq("cell_key", cellKey).maybeSingle();
  if (!row) {
    if (delta <= 0) return;
    await db.from("surge_cells").insert({
      cell_key: cellKey,
      open_requests: Math.max(0, delta),
      surge_multiplier: 1,
    });
    return;
  }
  const next = Math.max(0, (row.open_requests ?? 0) + delta);
  let mult = Number(row.surge_multiplier ?? 1);
  if (next >= 8) mult = Math.min(2.5, mult + 0.05);
  else if (next <= 2) mult = Math.max(1, mult - 0.02);
  await db.from("surge_cells").update({
    open_requests: next,
    surge_multiplier: mult,
    updated_at: new Date().toISOString(),
  }).eq("cell_key", cellKey);
}

async function readSurgeMultiplier(cellKey: string): Promise<number> {
  const db = svc();
  const { data } = await db.from("surge_cells").select("surge_multiplier").eq("cell_key", cellKey).maybeSingle();
  return data?.surge_multiplier != null ? Number(data.surge_multiplier) : 1;
}

async function audit(
  rideId: string | null,
  actor: string | undefined,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await svc().from("audit_events").insert({
    ride_request_id: rideId,
    actor_user_id: actor ?? null,
    event_type: eventType,
    payload,
  });
}

async function expirePendingOffers(rideId: string) {
  const nowIso = new Date().toISOString();
  await svc().from("driver_offers").update({ status: "expired" }).eq("ride_request_id", rideId).eq(
    "status",
    "pending",
  ).lte("expires_at", nowIso);
}

async function reconcileMatching(rideId: string, requestId?: string) {
  const db = svc();
  await expirePendingOffers(rideId);
  const { data: ride } = await db.from("ride_requests").select("*").eq("id", rideId).single();
  if (!ride || ride.status !== "matching") return;

  const { data: pendingRows } = await db.from("driver_offers").select("id").eq(
    "ride_request_id",
    rideId,
  ).eq("status", "pending").limit(1);

  if (pendingRows && pendingRows.length > 0) return;

  const wave = Number(ride.matching_wave ?? 0);
  if (wave >= MAX_MATCH_WAVES) {
    await db.from("ride_requests").update({
      status: "cancelled",
      cancelled_by: "system",
      cancel_reason: "no_drivers_available",
      updated_at: new Date().toISOString(),
    }).eq("id", rideId);
    const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
    await bumpSurgeDemand(cellKey, -1);
    await audit(rideId, undefined, "ride_auto_cancelled_no_drivers", { wave });
    logLine({ event: "ride_auto_cancelled", ride_id: rideId, request_id: requestId });
    return;
  }

  await runMatchingWave(rideId, ride, wave + 1, requestId);
}

async function runMatchingWave(
  rideId: string,
  ride: Record<string, unknown>,
  wave: number,
  requestId?: string,
) {
  const db = svc();
  const radiusKm = WAVE_RADIUS_KM[Math.min(wave - 1, WAVE_RADIUS_KM.length - 1)];
  const pickupLat = Number(ride.pickup_lat);
  const pickupLng = Number(ride.pickup_lng);
  const timeoutSec = Number(ride.driver_offer_timeout_seconds ?? 15);

  const freshSince = new Date(Date.now() - DRIVER_LOCATION_MAX_AGE_MS).toISOString();
  const { data: locs } = await db.from("driver_locations").select("user_id, lat, lng, updated_at").gte(
    "updated_at",
    freshSince,
  ).eq("available_for_rides", true);

  const { data: declinedRows } = await db.from("driver_offers").select("driver_user_id, status").eq(
    "ride_request_id",
    rideId,
  ).in("status", ["declined", "expired"]);

  const excluded = new Set((declinedRows ?? []).map((r: { driver_user_id: string }) => r.driver_user_id));

  type Cand = { user_id: string; lat: number; lng: number; d: number };
  const candidates: Cand[] = [];
  for (const row of locs ?? []) {
    const uid = row.user_id as string;
    if (excluded.has(uid)) continue;
    const d = haversineKm(pickupLat, pickupLng, Number(row.lat), Number(row.lng));
    if (d <= radiusKm) candidates.push({ user_id: uid, lat: Number(row.lat), lng: Number(row.lng), d });
  }
  candidates.sort((a, b) => a.d - b.d || a.user_id.localeCompare(b.user_id));

  const rotate = wave % Math.max(candidates.length, 1);
  const rotated = [...candidates.slice(rotate), ...candidates.slice(0, rotate)];
  const picked = rotated.slice(0, MAX_OFFERS_PER_WAVE);

  const expiresAt = new Date(Date.now() + timeoutSec * 1000).toISOString();

  await db.from("ride_requests").update({
    matching_wave: wave,
    updated_at: new Date().toISOString(),
  }).eq("id", rideId);

  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    await db.from("driver_offers").insert({
      ride_request_id: rideId,
      driver_user_id: c.user_id,
      wave,
      rank_score: i + 1,
      distance_km: c.d,
      status: "pending",
      expires_at: expiresAt,
    });
  }

  await audit(rideId, ride.rider_user_id as string | undefined, "matching_wave", {
    wave,
    radius_km: radiusKm,
    offers: picked.length,
  });
  logLine({
    event: "matching_wave",
    ride_id: rideId,
    wave,
    offers: picked.length,
    request_id: requestId,
  });
}

app.get("/health", (c) => c.json({ service: "rides", status: "ok" }));

// --- Rider ---
app.post("/v1/quote", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:quote`, 60, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const body = await c.req.json().catch(() => ({}));
  const pickup_lat = Number(body.pickup_lat);
  const pickup_lng = Number(body.pickup_lng);
  const dropoff_lat = Number(body.dropoff_lat);
  const dropoff_lng = Number(body.dropoff_lng);
  if ([pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].some((x) => Number.isNaN(x))) {
    return c.json({ error: "invalid_coordinates" }, 400);
  }
  const distanceKm = haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
  const cellKey = gridCellKey(pickup_lat, pickup_lng);
  const surge = await readSurgeMultiplier(cellKey);
  const baseMinor = Number(Deno.env.get("ROAM_RIDES_BASE_MINOR") ?? BASE_MINOR_DEFAULT);
  const perKmMinor = Number(Deno.env.get("ROAM_RIDES_PER_KM_MINOR") ?? PER_KM_MINOR_DEFAULT);
  const perMinMinor = Number(Deno.env.get("ROAM_RIDES_PER_MIN_MINOR") ?? PER_MIN_MINOR_DEFAULT);
  const minFareMinor = Number(Deno.env.get("ROAM_RIDES_MIN_FARE_MINOR") ?? MIN_FARE_MINOR_DEFAULT);

  const { fareMinor, etaMinutes } = estimateFareMinor({
    distanceKm,
    surgeMultiplier: surge,
    baseMinor,
    perKmMinor,
    perMinMinor,
    minFareMinor,
  });

  const etaPickupSeconds = Math.round((distanceKm / AVG_SPEED_KMH) * 3600);

  logLine({ event: "quote", user_id: auth.user.id, distanceKm, surge });

  return c.json({
    distance_estimate_km: distanceKm,
    eta_trip_minutes_estimate: etaMinutes,
    eta_pickup_seconds_estimate: etaPickupSeconds,
    surge_multiplier: surge,
    fare_estimate_minor: fareMinor.toString(),
    currency: "USD",
    grid_cell_key: cellKey,
  });
});

app.post("/v1/requests", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:requests`, 20, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const r = ridesUserSurfaceRole(auth.user);
  if (r && r !== "passenger") {
    return jsonEdgeForbidden(c, "forbidden_role");
  }

  const body = await c.req.json().catch(() => ({}));
  const pickup_lat = Number(body.pickup_lat);
  const pickup_lng = Number(body.pickup_lng);
  const dropoff_lat = Number(body.dropoff_lat);
  const dropoff_lng = Number(body.dropoff_lng);
  if ([pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].some((x) => Number.isNaN(x))) {
    return c.json({ error: "invalid_coordinates" }, 400);
  }

  const idempotency_key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
  const db = svc();

  if (idempotency_key) {
    const { data: existing } = await db.from("ride_requests").select("*").eq(
      "idempotency_key",
      idempotency_key,
    ).maybeSingle();
    if (existing) {
      return c.json({ ride: existing });
    }
  }

  const distanceKm = haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
  const cellKey = gridCellKey(pickup_lat, pickup_lng);
  const surge = await readSurgeMultiplier(cellKey);
  const baseMinor = Number(Deno.env.get("ROAM_RIDES_BASE_MINOR") ?? BASE_MINOR_DEFAULT);
  const perKmMinor = Number(Deno.env.get("ROAM_RIDES_PER_KM_MINOR") ?? PER_KM_MINOR_DEFAULT);
  const perMinMinor = Number(Deno.env.get("ROAM_RIDES_PER_MIN_MINOR") ?? PER_MIN_MINOR_DEFAULT);
  const minFareMinor = Number(Deno.env.get("ROAM_RIDES_MIN_FARE_MINOR") ?? MIN_FARE_MINOR_DEFAULT);
  const { fareMinor, etaMinutes } = estimateFareMinor({
    distanceKm,
    surgeMultiplier: surge,
    baseMinor,
    perKmMinor,
    perMinMinor,
    minFareMinor,
  });

  await bumpSurgeDemand(cellKey, 1);

  const insertRow = {
    rider_user_id: auth.user.id,
    status: "matching" as RideStatus,
    pickup_lat,
    pickup_lng,
    pickup_address: body.pickup_address ?? null,
    dropoff_lat,
    dropoff_lng,
    dropoff_address: body.dropoff_address ?? null,
    vehicle_option: typeof body.vehicle_option === "string" ? body.vehicle_option : "standard",
    fare_estimate_minor: Number(fareMinor),
    surge_multiplier: surge,
    currency: "USD",
    distance_estimate_km: distanceKm,
    eta_pickup_seconds_estimate: Math.round((distanceKm / AVG_SPEED_KMH) * 3600),
    idempotency_key,
    driver_offer_timeout_seconds: Number(body.driver_offer_timeout_seconds ?? 15),
    matching_wave: 0,
  };

  const { data: ride, error } = await db.from("ride_requests").insert(insertRow).select("*").single();
  if (error || !ride) {
    logLine({ event: "insert_ride_failed", error: error?.message });
    return c.json({ error: "insert_failed" }, 500);
  }

  const reqId = crypto.randomUUID();
  await audit(ride.id, auth.user.id, "ride_created", { request_id: reqId, cell_key: cellKey });

  await runMatchingWave(ride.id, ride, 1, reqId);

  logLine({ event: "ride_created", ride_id: ride.id, request_id: reqId });
  return c.json({ ride });
});

app.get("/v1/requests/:id", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const id = c.req.param("id");
  const db = svc();
  const { data: ride } = await db.from("ride_requests").select("*").eq("id", id).single();
  if (!ride) return c.json({ error: "not_found" }, 404);
  if (ride.rider_user_id !== auth.user.id && ride.assigned_driver_user_id !== auth.user.id) {
    return jsonEdgeForbidden(c, "forbidden");
  }
  const reqId = crypto.randomUUID();
  await reconcileMatching(id, reqId);
  const { data: fresh } = await db.from("ride_requests").select("*").eq("id", id).single();
  const { data: offers } = await db.from("driver_offers").select("*").eq("ride_request_id", id).order(
    "created_at",
    { ascending: false },
  );

  return c.json({ ride: fresh, offers: offers ?? [] });
});

app.post("/v1/requests/:id/cancel", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const db = svc();
  const { data: ride } = await db.from("ride_requests").select("*").eq("id", id).single();
  if (!ride) return c.json({ error: "not_found" }, 404);
  if (ride.rider_user_id !== auth.user.id) return jsonEdgeForbidden(c, "forbidden");

  const terminal = ["completed", "cancelled"];
  if (terminal.includes(ride.status)) return c.json({ ride });

  await db.from("ride_requests").update({
    status: "cancelled",
    cancelled_by: "rider",
    cancel_reason: typeof body.reason === "string" ? body.reason : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  await db.from("driver_offers").update({ status: "superseded" }).eq("ride_request_id", id).eq(
    "status",
    "pending",
  );

  const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
  await bumpSurgeDemand(cellKey, -1);
  await audit(id, auth.user.id, "ride_cancelled_rider", {});
  logLine({ event: "ride_cancelled_rider", ride_id: id });

  const { data: fresh } = await db.from("ride_requests").select("*").eq("id", id).single();
  return c.json({ ride: fresh });
});

// --- Driver ---
app.post("/v1/drivers/presence", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const r = ridesUserSurfaceRole(auth.user);
  if (r !== "driver") return jsonEdgeForbidden(c, "forbidden_role");

  const body = await c.req.json().catch(() => ({}));
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return c.json({ error: "invalid_coordinates" }, 400);

  const upsert = {
    user_id: auth.user.id,
    lat,
    lng,
    heading_degrees: body.heading_degrees != null ? Number(body.heading_degrees) : null,
    available_for_rides: Boolean(body.available_for_rides ?? true),
    updated_at: new Date().toISOString(),
  };

  const { error } = await svc().from("driver_locations").upsert(upsert);
  if (error) return c.json({ error: "presence_failed" }, 500);

  logLine({ event: "driver_presence", user_id: auth.user.id, available: upsert.available_for_rides });
  return c.json({ ok: true });
});

app.get("/v1/drivers/offers", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (ridesUserSurfaceRole(auth.user) !== "driver") return jsonEdgeForbidden(c, "forbidden_role");

  const db = svc();
  const nowIso = new Date().toISOString();
  await db.from("driver_offers").update({ status: "expired" }).eq("driver_user_id", auth.user.id).eq(
    "status",
    "pending",
  ).lte("expires_at", nowIso);

  const { data: offers } = await db.from("driver_offers").select("*").eq(
    "driver_user_id",
    auth.user.id,
  ).eq("status", "pending").gt("expires_at", nowIso);

  return c.json({ offers: offers ?? [] });
});

app.post("/v1/drivers/offers/:offerId/accept", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (ridesUserSurfaceRole(auth.user) !== "driver") return jsonEdgeForbidden(c, "forbidden_role");

  const offerId = c.req.param("offerId");
  const db = svc();
  const nowIso = new Date().toISOString();

  const { data: offer } = await db.from("driver_offers").select("*").eq("id", offerId).single();
  if (!offer || offer.driver_user_id !== auth.user.id) return c.json({ error: "not_found" }, 404);
  if (offer.status !== "pending") return c.json({ error: "offer_not_pending" }, 409);
  if (offer.expires_at <= nowIso) {
    await db.from("driver_offers").update({ status: "expired" }).eq("id", offerId);
    return c.json({ error: "offer_expired" }, 410);
  }

  const rideId = offer.ride_request_id as string;
  const { data: ride } = await db.from("ride_requests").select("*").eq("id", rideId).single();
  if (!ride || ride.status !== "matching") return c.json({ error: "ride_not_matching" }, 409);

  await db.from("driver_offers").update({ status: "accepted" }).eq("id", offerId).eq("status", "pending");

  await db.from("driver_offers").update({ status: "superseded" }).eq("ride_request_id", rideId).neq(
    "id",
    offerId,
  ).eq("status", "pending");

  await db.from("ride_requests").update({
    status: "driver_assigned",
    assigned_driver_user_id: auth.user.id,
    updated_at: nowIso,
  }).eq("id", rideId).eq("status", "matching");

  const { data: freshRide } = await db.from("ride_requests").select("*").eq("id", rideId).single();

  if (!freshRide || freshRide.status !== "driver_assigned") {
    await audit(rideId, auth.user.id, "accept_race_lost", { offer_id: offerId });
    return c.json({ error: "assign_failed" }, 409);
  }

  await audit(rideId, auth.user.id, "offer_accepted", { offer_id: offerId });
  logLine({ event: "offer_accepted", ride_id: rideId, driver_id: auth.user.id });
  return c.json({ ride: freshRide });
});

app.post("/v1/drivers/offers/:offerId/decline", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (ridesUserSurfaceRole(auth.user) !== "driver") return jsonEdgeForbidden(c, "forbidden_role");

  const offerId = c.req.param("offerId");
  const db = svc();
  const { data: offer } = await db.from("driver_offers").select("*").eq("id", offerId).single();
  if (!offer || offer.driver_user_id !== auth.user.id) return c.json({ error: "not_found" }, 404);

  await db.from("driver_offers").update({ status: "declined" }).eq("id", offerId).eq("status", "pending");

  await reconcileMatching(offer.ride_request_id as string);

  logLine({ event: "offer_declined", offer_id: offerId });
  return c.json({ ok: true });
});

const DRIVER_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  matching: [],
  driver_assigned: ["driver_en_route_pickup", "cancelled"],
  driver_en_route_pickup: ["driver_arrived_pickup", "cancelled"],
  driver_arrived_pickup: ["on_trip", "cancelled"],
  on_trip: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

app.patch("/v1/requests/:id/driver-transition", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (ridesUserSurfaceRole(auth.user) !== "driver") return jsonEdgeForbidden(c, "forbidden_role");

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const next = body.status as RideStatus;
  const db = svc();
  const { data: ride } = await db.from("ride_requests").select("*").eq("id", id).single();
  if (!ride) return c.json({ error: "not_found" }, 404);
  if (ride.assigned_driver_user_id !== auth.user.id) return jsonEdgeForbidden(c, "forbidden");

  const current = ride.status as RideStatus;
  const allowed = DRIVER_TRANSITIONS[current];
  if (!allowed?.includes(next)) return c.json({ error: "invalid_transition", current, next }, 400);

  const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() };
  if (next === "completed") {
    patch.fare_final_minor = Number(ride.fare_estimate_minor);
  }
  if (next === "cancelled") {
    patch.cancelled_by = "driver";
    patch.cancel_reason = typeof body.reason === "string" ? body.reason : null;
  }

  await db.from("ride_requests").update(patch).eq("id", id);

  if (next === "completed" || next === "cancelled") {
    const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
    await bumpSurgeDemand(cellKey, -1);
  }

  await audit(id, auth.user.id, "driver_transition", { from: current, to: next });
  logLine({ event: "driver_transition", ride_id: id, from: current, to: next });

  const { data: fresh } = await db.from("ride_requests").select("*").eq("id", id).single();
  return c.json({ ride: fresh });
});

Deno.serve(app.fetch);
