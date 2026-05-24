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
import { buildFareQuote, gridCellKey } from "./fare/buildQuote.ts";
import { FareRuleNotFoundError } from "./fare/rules.ts";
import { rankDriversByDriveTime } from "./fare/distanceMatrix.ts";
import { haversineKm } from "./fare/routing.ts";
import { quoteTokenHash, verifyQuoteToken } from "./fare/quoteToken.ts";
import { registerAdminRoutes } from "./admin.ts";
import { assertRiderCanBook } from "./fare/riderAccount.ts";
import { getRidesAdminDb, resolveFareRulesDbForQuote } from "../_shared/ridesAdminDb.ts";
import { loadVehicleTypesFromDb } from "./fare/vehicleTypesDb.ts";
import {
  allowedBodySlugsForWave,
  loadServiceBodyTypeTiers,
} from "./fare/serviceMatching.ts";
import { isActiveBodyTypeSlug, resolveDriverBodyTypeSlug } from "./fare/driverBodyType.ts";
import {
  DEFAULT_DISPATCH_SETTINGS,
  driverLocationMaxAgeMs,
  getWaveRadiusKm,
  loadDispatchSettings,
} from "./fare/dispatchSettings.ts";
import {
  getEligibleDriverUserIds,
  isDriverEligibleForDispatch,
} from "../_shared/driverModeFilter.ts";

/** Match Supabase path prefix: .../functions/v1/rides/<route> → /rides/<route> */
const app = new Hono().basePath("/rides");

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
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const DRIVER_LOCATIONS_SELECT = "user_id, lat, lng, updated_at, body_type_slug";

async function loadAvailableDriverLocations(freshSince: string) {
  const { data: native, error: nativeErr } = await svc().from("driver_locations").select(
    DRIVER_LOCATIONS_SELECT,
  ).gte("updated_at", freshSince).eq("available_for_rides", true);
  if (!nativeErr && native) return native;

  const { data: pubData } = await pubSvc().from("rides_driver_locations").select(
    DRIVER_LOCATIONS_SELECT,
  ).gte("updated_at", freshSince).eq("available_for_rides", true);
  return pubData ?? [];
}

/** Reads ride_requests via rides schema, falling back to public.rides_ride_requests on hosted. */
async function loadRideRequestById(id: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("*").eq(
    "id",
    id,
  ).maybeSingle();
  if (!nativeErr && native) return native;

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("*").eq("id", id).maybeSingle();
  return pub ?? null;
}

async function loadRideRequestByIdempotencyKey(key: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("*").eq(
    "idempotency_key",
    key,
  ).maybeSingle();
  if (!nativeErr && native) return native;

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("*").eq(
    "idempotency_key",
    key,
  ).maybeSingle();
  return pub ?? null;
}

async function loadRideRequestsByIds(
  ids: string[],
  columns = "*",
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select(columns).in(
    "id",
    ids,
  );
  if (!nativeErr && native) return native;

  const { data: pub } = await pubSvc().from("rides_ride_requests").select(columns).in("id", ids);
  return pub ?? [];
}

async function loadMatchingRideIds(): Promise<string[]> {
  const { data: native, error: nativeErr } = await svc().from("ride_requests").select("id").eq(
    "status",
    "matching",
  );
  if (!nativeErr && native) return native.map((row) => row.id as string);

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("id").eq("status", "matching");
  return (pub ?? []).map((row) => row.id as string);
}

/** Reads driver_offers via rides schema, falling back to public.rides_driver_offers on hosted. */
async function loadDriverOffersForRide(
  rideId: string,
  orderDesc = true,
): Promise<Record<string, unknown>[]> {
  let query = svc().from("driver_offers").select("*").eq("ride_request_id", rideId);
  if (orderDesc) query = query.order("created_at", { ascending: false });
  const { data: native, error: nativeErr } = await query;
  if (!nativeErr && native) return native;

  let pubQuery = pubSvc().from("rides_driver_offers").select("*").eq("ride_request_id", rideId);
  if (orderDesc) pubQuery = pubQuery.order("created_at", { ascending: false });
  const { data: pub } = await pubQuery;
  return pub ?? [];
}

async function loadDriverOfferById(offerId: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await svc().from("driver_offers").select("*").eq(
    "id",
    offerId,
  ).maybeSingle();
  if (!nativeErr && native) return native;

  const { data: pub } = await pubSvc().from("rides_driver_offers").select("*").eq("id", offerId)
    .maybeSingle();
  return pub ?? null;
}

async function loadPendingDriverOffersForDriver(
  driverUserId: string,
  nowIso: string,
): Promise<Record<string, unknown>[]> {
  const { data: native, error: nativeErr } = await svc().from("driver_offers").select("*").eq(
    "driver_user_id",
    driverUserId,
  ).eq("status", "pending").gt("expires_at", nowIso);
  if (!nativeErr && native) return native;

  const { data: pub } = await pubSvc().from("rides_driver_offers").select("*").eq(
    "driver_user_id",
    driverUserId,
  ).eq("status", "pending").gt("expires_at", nowIso);
  return pub ?? [];
}

async function patchRideRequest(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error: rpcError } = await pubSvc().rpc("rides_patch_ride_request", {
    p_id: id,
    p_patch: patch,
  });
  if (!rpcError) return true;

  const { error } = await svc().from("ride_requests").update(patch).eq("id", id);
  if (error) {
    logLine({
      event: "patch_ride_failed",
      ride_id: id,
      error: error.message,
      rpc_error: rpcError.message,
    });
  }
  return !error;
}

async function insertDriverOfferRow(row: Record<string, unknown>): Promise<boolean> {
  const { error: rpcError } = await pubSvc().rpc("rides_insert_driver_offer", { p_row: row });
  if (!rpcError) return true;

  const { error } = await svc().from("driver_offers").insert(row);
  if (error) {
    logLine({
      event: "insert_offer_failed",
      error: error.message,
      rpc_error: rpcError.message,
    });
  }
  return !error;
}

async function patchDriverOfferRow(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error: rpcError } = await pubSvc().rpc("rides_patch_driver_offer", {
    p_id: id,
    p_patch: patch,
  });
  if (!rpcError) return true;

  const { error } = await svc().from("driver_offers").update(patch).eq("id", id);
  return !error;
}

async function expirePendingOffersForRide(rideId: string, nowIso: string): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_expire_pending_offers", {
    p_ride_id: rideId,
    p_now: nowIso,
  });
  if (!rpcError) return;

  await svc().from("driver_offers").update({ status: "expired" }).eq("ride_request_id", rideId).eq(
    "status",
    "pending",
  ).lte("expires_at", nowIso);
}

async function supersedePendingOffersForRide(
  rideId: string,
  exceptOfferId?: string,
): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_supersede_pending_offers", {
    p_ride_id: rideId,
    p_except_offer_id: exceptOfferId ?? null,
  });
  if (!rpcError) return;

  let query = svc().from("driver_offers").update({ status: "superseded" }).eq(
    "ride_request_id",
    rideId,
  ).eq("status", "pending");
  if (exceptOfferId) query = query.neq("id", exceptOfferId);
  await query;
}

async function expireDriverPendingOffers(driverUserId: string, nowIso: string): Promise<void> {
  const { error: rpcError } = await pubSvc().rpc("rides_expire_driver_pending_offers", {
    p_driver_user_id: driverUserId,
    p_now: nowIso,
  });
  if (!rpcError) return;

  await svc().from("driver_offers").update({ status: "expired" }).eq(
    "driver_user_id",
    driverUserId,
  ).eq("status", "pending").lte("expires_at", nowIso);
}

const LEGACY_BODY_TYPE_SLUGS: Record<string, string> = {
  standard: "sedan",
};

function normalizePresenceBodyTypeSlug(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  const normalized = slug.trim().toLowerCase();
  return LEGACY_BODY_TYPE_SLUGS[normalized] ?? normalized;
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
  await expirePendingOffersForRide(rideId, nowIso);
}

async function reconcileMatching(rideId: string, requestId?: string) {
  const db = svc();
  await expirePendingOffers(rideId);
  const ride = await loadRideRequestById(rideId);
  if (!ride || ride.status !== "matching") return;

  const offerRows = await loadDriverOffersForRide(rideId, false);
  if (offerRows.some((row) => row.status === "pending")) return;

  let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    dispatchSettings = await loadDispatchSettings(adminDb, tables);
  } catch {
    /* use defaults */
  }

  const wave = Number(ride.matching_wave ?? 0);
  if (wave >= dispatchSettings.max_match_waves) {
    await patchRideRequest(rideId, {
      status: "cancelled",
      cancelled_by: "system",
      cancel_reason: "no_drivers_available",
      updated_at: new Date().toISOString(),
    });
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
  let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    dispatchSettings = await loadDispatchSettings(adminDb, tables);
  } catch {
    /* use defaults */
  }

  const radiusKm = getWaveRadiusKm(dispatchSettings, wave);
  const pickupLat = Number(ride.pickup_lat);
  const pickupLng = Number(ride.pickup_lng);
  const timeoutSec = Number(
    ride.driver_offer_timeout_seconds ?? dispatchSettings.default_driver_offer_timeout_seconds,
  );

  const freshSince = new Date(Date.now() - driverLocationMaxAgeMs(dispatchSettings)).toISOString();
  const locs = await loadAvailableDriverLocations(freshSince);

  const serviceSlug = typeof ride.vehicle_option === "string"
    ? ride.vehicle_option.trim().toLowerCase()
    : "";
  let allowedBodySlugs = new Set<string>();
  let tiersCount = 0;
  if (serviceSlug && dispatchSettings.body_type_filtering_enabled) {
    try {
      const { db: adminDb, tables } = await getRidesAdminDb();
      const tiers = await loadServiceBodyTypeTiers(adminDb, tables, serviceSlug);
      tiersCount = tiers.length;
      if (tiersCount > 0) {
        allowedBodySlugs = allowedBodySlugsForWave(
          tiers,
          wave,
          dispatchSettings.body_type_tier_mode,
        );
      }
    } catch {
      allowedBodySlugs = new Set();
    }
  }

  const declinedRows = (await loadDriverOffersForRide(rideId, false)).filter((row) =>
    row.status === "declined" || row.status === "expired"
  );

  const excluded = new Set(
    declinedRows.map((r) => r.driver_user_id as string),
  );

  const eligibleIds = await getEligibleDriverUserIds(
    (locs ?? []).map((row) => row.user_id as string),
    dispatchSettings,
  );

  type Cand = { user_id: string; lat: number; lng: number; d: number; body_type_slug: string | null };
  const candidates: Cand[] = [];
  let filteredOutBodyType = 0;
  for (const row of locs ?? []) {
    const uid = row.user_id as string;
    if (excluded.has(uid)) continue;
    if (!eligibleIds.has(uid)) continue;
    const bodySlug = (row as { body_type_slug?: string | null }).body_type_slug ?? null;
    if (tiersCount > 0) {
      if (!bodySlug) {
        if (dispatchSettings.require_body_type_for_offers) {
          filteredOutBodyType++;
          continue;
        }
      } else if (!allowedBodySlugs.has(bodySlug)) {
        filteredOutBodyType++;
        continue;
      }
    }
    const d = haversineKm(pickupLat, pickupLng, Number(row.lat), Number(row.lng));
    if (d <= radiusKm) {
      candidates.push({
        user_id: uid,
        lat: Number(row.lat),
        lng: Number(row.lng),
        d,
        body_type_slug: bodySlug,
      });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.user_id.localeCompare(b.user_id));

  const { ranked, source: matchingRouteSource } = await rankDriversByDriveTime(
    { lat: pickupLat, lng: pickupLng },
    candidates.map((c) => ({
      user_id: c.user_id,
      lat: c.lat,
      lng: c.lng,
      haversineKm: c.d,
    })),
  );

  const rankedCandidates: Cand[] = ranked.map((r) => ({
    user_id: r.user_id,
    lat: r.lat,
    lng: r.lng,
    d: r.haversineKm,
  }));

  const rotate = wave % Math.max(rankedCandidates.length, 1);
  const rotated = [...rankedCandidates.slice(rotate), ...rankedCandidates.slice(0, rotate)];
  const picked = rotated.slice(0, dispatchSettings.max_offers_per_wave);

  const expiresAt = new Date(Date.now() + timeoutSec * 1000).toISOString();

  await patchRideRequest(rideId, {
    matching_wave: wave,
    updated_at: new Date().toISOString(),
  });

  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    await insertDriverOfferRow({
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
    matching_route_source: matchingRouteSource,
    service_slug: serviceSlug,
    allowed_body_types: [...allowedBodySlugs],
    filtered_out_body_type: filteredOutBodyType,
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

app.get("/v1/vehicle-types", async (c) => {
  try {
    const { db, tables } = await getRidesAdminDb();
    const all = await loadVehicleTypesFromDb(db, tables.vehicle_types, { activeOnly: true });
    const services = all.filter((t) => t.solution_kind === "service");
    return c.json({ services, vehicle_types: services });
  } catch {
    const all = await loadVehicleTypesFromDb(svc(), "vehicle_types", { activeOnly: true });
    const services = all.filter((t) => t.solution_kind === "service");
    return c.json({ services, vehicle_types: services });
  }
});

// --- Rider ---
app.post("/v1/quote", async (c) => {
  const ip = clientIp(c);
  if (!rateLimit(`${ip}:quote`, 60, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);

  const bookingCheck = await assertRiderCanBook(svc(), auth.user.id);
  if (!bookingCheck.ok) {
    return c.json({ error: "rider_account_restricted", status: bookingCheck.status }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const pickup_lat = Number(body.pickup_lat);
  const pickup_lng = Number(body.pickup_lng);
  const dropoff_lat = Number(body.dropoff_lat);
  const dropoff_lng = Number(body.dropoff_lng);
  if ([pickup_lat, pickup_lng, dropoff_lat, dropoff_lng].some((x) => Number.isNaN(x))) {
    return c.json({ error: "invalid_coordinates" }, 400);
  }
  const vehicleType = typeof body.vehicle_option === "string" ? body.vehicle_option : "uberx";
  const db = svc();

  const fareRulesAccess = await resolveFareRulesDbForQuote();

  let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  let allowedBodyTypeSlugs: Set<string> | undefined;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    dispatchSettings = await loadDispatchSettings(adminDb, tables);
    if (dispatchSettings.body_type_filtering_enabled) {
      const tiers = await loadServiceBodyTypeTiers(adminDb, tables, vehicleType);
      if (tiers.length) {
        allowedBodyTypeSlugs = allowedBodySlugsForWave(
          tiers,
          1,
          dispatchSettings.body_type_tier_mode,
        );
      }
    }
  } catch {
    allowedBodyTypeSlugs = undefined;
  }

  let quote: Awaited<ReturnType<typeof buildFareQuote>>;
  try {
    quote = await buildFareQuote(db, {
      pickupLat: pickup_lat,
      pickupLng: pickup_lng,
      dropoffLat: dropoff_lat,
      dropoffLng: dropoff_lng,
      vehicleType,
      readSurge: readSurgeMultiplier,
      allowedBodyTypeSlugs,
      dispatchSettings,
      fareRulesDb: fareRulesAccess.db,
      fareRulesTable: fareRulesAccess.fareRulesTable,
      vehicleTypesTable: fareRulesAccess.vehicleTypesTable,
    });
  } catch (e) {
    if (e instanceof FareRuleNotFoundError) {
      return c.json(e.toResponseBody(), 404);
    }
    throw e;
  }

  await audit(null, auth.user.id, "fare_quoted", {
    distance_km: quote.distanceKm,
    surge: quote.surgeMultiplier,
    route_source: quote.routeSource,
    breakdown: quote.breakdown,
  });

  logLine({
    event: "quote",
    user_id: auth.user.id,
    distanceKm: quote.distanceKm,
    surge: quote.surgeMultiplier,
    route_source: quote.routeSource,
  });

  return c.json({
    distance_estimate_km: quote.distanceKm,
    duration_estimate_minutes: quote.durationMinutes,
    eta_trip_minutes_estimate: quote.etaTripMinutes,
    eta_pickup_seconds_estimate: quote.etaPickupSeconds,
    surge_multiplier: quote.surgeMultiplier,
    fare_estimate_minor: quote.fareEstimateMinor.toString(),
    currency: quote.currency,
    grid_cell_key: quote.gridCellKey,
    vehicle_option: quote.vehicleType,
    route_source: quote.routeSource,
    duration_traffic_aware: quote.durationTrafficAware,
    ...(quote.routePolylineEncoded
      ? { route_polyline_encoded: quote.routePolylineEncoded }
      : {}),
    drivers_available: quote.driversAvailable,
    pickup_eta_source: quote.pickupEtaSource,
    ...(quote.driversAvailable && quote.etaPickupSeconds > 0
      ? {
        pickup_eta_minutes_estimate: Math.ceil(quote.etaPickupSeconds / 60),
        eta_pickup_seconds_estimate: quote.etaPickupSeconds,
      }
      : { eta_pickup_seconds_estimate: 0 }),
    ...(quote.etaArrivalAt ? { eta_arrival_at: quote.etaArrivalAt } : {}),
    fare_breakdown: quote.breakdown,
    quote_token: quote.quoteToken,
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

  const bookingCheck = await assertRiderCanBook(svc(), auth.user.id);
  if (!bookingCheck.ok) {
    return c.json({ error: "rider_account_restricted", status: bookingCheck.status }, 403);
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
    const existing = await loadRideRequestByIdempotencyKey(idempotency_key);
    if (existing) {
      return c.json({ ride: existing });
    }
  }

  const vehicle_option = typeof body.vehicle_option === "string" ? body.vehicle_option : "uberx";
  const quote_token = typeof body.quote_token === "string" ? body.quote_token : null;
  if (!quote_token) {
    return c.json({ error: "quote_token_required" }, 400);
  }

  const verified = await verifyQuoteToken(quote_token, {
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng,
    vehicle_type: vehicle_option,
  });

  if (!verified.ok) {
    return c.json({ error: "quote_stale", reason: verified.reason }, 409);
  }

  const locked = verified.payload;
  const cellKey = gridCellKey(pickup_lat, pickup_lng);

  await bumpSurgeDemand(cellKey, 1);

  let bookDispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    bookDispatchSettings = await loadDispatchSettings(adminDb, tables);
  } catch {
    /* use defaults */
  }

  const insertRow = {
    rider_user_id: auth.user.id,
    status: "matching" as RideStatus,
    pickup_lat,
    pickup_lng,
    pickup_address: body.pickup_address ?? null,
    dropoff_lat,
    dropoff_lng,
    dropoff_address: body.dropoff_address ?? null,
    vehicle_option,
    fare_estimate_minor: locked.fare_estimate_minor,
    surge_multiplier: locked.surge_multiplier,
    currency: locked.currency,
    distance_estimate_km: locked.distance_km,
    duration_estimate_minutes: locked.duration_minutes,
    eta_pickup_seconds_estimate: Math.round((locked.distance_km / AVG_SPEED_KMH) * 3600),
    quote_token_hash: quoteTokenHash(quote_token),
    fare_breakdown: locked.fare_breakdown ?? null,
    idempotency_key,
    driver_offer_timeout_seconds: Number(
      body.driver_offer_timeout_seconds ?? bookDispatchSettings.default_driver_offer_timeout_seconds,
    ),
    matching_wave: 0,
  };

  let ride: Record<string, unknown> | null = null;
  const { data: rpcRide, error: rpcError } = await pubSvc().rpc("rides_create_ride_request", {
    p_row: insertRow,
  });
  if (!rpcError && rpcRide) {
    ride = rpcRide as Record<string, unknown>;
  } else {
    const { data, error } = await db.from("ride_requests").insert(insertRow).select("*").single();
    ride = data;
    if (error || !ride) {
      logLine({
        event: "insert_ride_failed",
        error: error?.message,
        rpc_error: rpcError?.message,
      });
      return c.json({ error: "insert_failed" }, 500);
    }
  }

  const reqId = crypto.randomUUID();
  await audit(ride.id, auth.user.id, "ride_created", {
    request_id: reqId,
    cell_key: cellKey,
    fare_locked: locked.fare_estimate_minor,
  });
  await audit(ride.id, auth.user.id, "fare_locked", {
    fare_estimate_minor: locked.fare_estimate_minor,
    surge_multiplier: locked.surge_multiplier,
  });

  await runMatchingWave(ride.id, ride, 1, reqId);

  logLine({ event: "ride_created", ride_id: ride.id, request_id: reqId });
  return c.json({ ride });
});

app.get("/v1/requests/:id", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const id = c.req.param("id");
  const ride = await loadRideRequestById(id);
  if (!ride) return c.json({ error: "not_found" }, 404);
  if (ride.rider_user_id !== auth.user.id && ride.assigned_driver_user_id !== auth.user.id) {
    return jsonEdgeForbidden(c, "forbidden");
  }
  const reqId = crypto.randomUUID();
  await reconcileMatching(id, reqId);
  const fresh = await loadRideRequestById(id);
  const offers = await loadDriverOffersForRide(id);

  return c.json({ ride: fresh, offers });
});

app.post("/v1/requests/:id/cancel", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const db = svc();
  const ride = await loadRideRequestById(id);
  if (!ride) return c.json({ error: "not_found" }, 404);
  if (ride.rider_user_id !== auth.user.id) return jsonEdgeForbidden(c, "forbidden");

  const terminal = ["completed", "cancelled"];
  if (terminal.includes(ride.status as string)) return c.json({ ride });

  await patchRideRequest(id, {
    status: "cancelled",
    cancelled_by: "rider",
    cancel_reason: typeof body.reason === "string" ? body.reason : null,
    updated_at: new Date().toISOString(),
  });

  await supersedePendingOffersForRide(id);

  const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
  await bumpSurgeDemand(cellKey, -1);
  await audit(id, auth.user.id, "ride_cancelled_rider", {});
  logLine({ event: "ride_cancelled_rider", ride_id: id });

  const fresh = await loadRideRequestById(id);
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

  let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
  try {
    const { db: adminDb, tables } = await getRidesAdminDb();
    dispatchSettings = await loadDispatchSettings(adminDb, tables);
  } catch {
    /* use defaults */
  }

  const goingOnline = Boolean(body.available_for_rides ?? true);
  if (goingOnline) {
    const eligibility = await isDriverEligibleForDispatch(auth.user.id, dispatchSettings);
    if (!eligibility.eligible) {
      return c.json({ error: eligibility.reason ?? "not_eligible_for_dispatch" }, 403);
    }
  }

  let bodyTypeSlug: string | null = null;
  const explicit = typeof body.body_type_slug === "string"
    ? normalizePresenceBodyTypeSlug(body.body_type_slug)
    : null;
  bodyTypeSlug = await resolveDriverBodyTypeSlug(auth.user.id, explicit);

  if (bodyTypeSlug) {
    try {
      const { db: adminDb, tables } = await getRidesAdminDb();
      const ok = await isActiveBodyTypeSlug(adminDb, tables.vehicle_types, bodyTypeSlug);
      if (!ok) bodyTypeSlug = null;
    } catch {
      const ok = await isActiveBodyTypeSlug(svc(), "vehicle_types", bodyTypeSlug);
      if (!ok) bodyTypeSlug = null;
    }
  }

  if (goingOnline && !bodyTypeSlug) {
    bodyTypeSlug = "sedan";
  }

  const headingRaw = body.heading_degrees != null ? Number(body.heading_degrees) : null;
  const headingDegrees = headingRaw != null && Number.isFinite(headingRaw) ? headingRaw : null;

  const upsert = {
    user_id: auth.user.id,
    lat,
    lng,
    heading_degrees: headingDegrees,
    available_for_rides: Boolean(body.available_for_rides ?? true),
    body_type_slug: bodyTypeSlug,
    updated_at: new Date().toISOString(),
  };

  const { error: rpcError } = await pubSvc().rpc("rides_upsert_driver_presence", {
    p_user_id: upsert.user_id,
    p_lat: upsert.lat,
    p_lng: upsert.lng,
    p_heading_degrees: upsert.heading_degrees,
    p_available_for_rides: upsert.available_for_rides,
    p_body_type_slug: upsert.body_type_slug,
  });

  if (rpcError) {
    const { error: fallbackError } = await svc().from("driver_locations").upsert(upsert);
    if (fallbackError) {
      logLine({ event: "presence_failed", message: rpcError.message, fallback: fallbackError.message });
      return c.json({ error: "presence_failed", message: rpcError.message }, 500);
    }
  }

  logLine({ event: "driver_presence", user_id: auth.user.id, available: upsert.available_for_rides });
  return c.json({ ok: true });
});

app.get("/v1/drivers/offers", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (ridesUserSurfaceRole(auth.user) !== "driver") return jsonEdgeForbidden(c, "forbidden_role");

  const db = svc();
  const nowIso = new Date().toISOString();
  await expireDriverPendingOffers(auth.user.id, nowIso);

  const offers = await loadPendingDriverOffersForDriver(auth.user.id, nowIso);

  const rideIds = [...new Set(offers.map((o) => o.ride_request_id as string))];
  let ridesById: Record<string, Record<string, unknown>> = {};
  if (rideIds.length > 0) {
    const rides = await loadRideRequestsByIds(
      rideIds,
      "id, pickup_address, dropoff_address, fare_estimate_minor, currency, distance_estimate_km, duration_estimate_minutes, vehicle_option, surge_multiplier",
    );
    ridesById = Object.fromEntries(rides.map((r) => [r.id as string, r]));
  }

  const enriched = offers.map((o) => ({
    ...o,
    ride: ridesById[o.ride_request_id as string] ?? null,
  }));

  return c.json({ offers: enriched });
});

app.post("/v1/drivers/offers/:offerId/accept", async (c) => {
  const auth = await requireUser(c.req.header("Authorization"));
  if ("error" in auth) return c.json({ error: auth.error }, auth.status);
  if (ridesUserSurfaceRole(auth.user) !== "driver") return jsonEdgeForbidden(c, "forbidden_role");

  const offerId = c.req.param("offerId");
  const db = svc();
  const nowIso = new Date().toISOString();

  const offer = await loadDriverOfferById(offerId);
  if (!offer || offer.driver_user_id !== auth.user.id) return c.json({ error: "not_found" }, 404);
  if (offer.status !== "pending") return c.json({ error: "offer_not_pending" }, 409);
  if ((offer.expires_at as string) <= nowIso) {
    await patchDriverOfferRow(offerId, { status: "expired" });
    return c.json({ error: "offer_expired" }, 410);
  }

  const rideId = offer.ride_request_id as string;
  const ride = await loadRideRequestById(rideId);
  if (!ride || ride.status !== "matching") return c.json({ error: "ride_not_matching" }, 409);

  await patchDriverOfferRow(offerId, { status: "accepted" });

  await supersedePendingOffersForRide(rideId, offerId);

  await patchRideRequest(rideId, {
    status: "driver_assigned",
    assigned_driver_user_id: auth.user.id,
    updated_at: nowIso,
  });

  const freshRide = await loadRideRequestById(rideId);

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
  const offer = await loadDriverOfferById(offerId);
  if (!offer || offer.driver_user_id !== auth.user.id) return c.json({ error: "not_found" }, 404);

  await patchDriverOfferRow(offerId, { status: "declined" });

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
  const ride = await loadRideRequestById(id);
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

  await patchRideRequest(id, patch);

  if (next === "completed" || next === "cancelled") {
    const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
    await bumpSurgeDemand(cellKey, -1);
  }

  await audit(id, auth.user.id, "driver_transition", { from: current, to: next });
  logLine({ event: "driver_transition", ride_id: id, from: current, to: next });

  const fresh = await loadRideRequestById(id);
  return c.json({ ride: fresh });
});

app.post("/v1/internal/reconcile-matching", async (c) => {
  const secret = Deno.env.get("RIDES_CRON_SECRET");
  const token = c.req.header("X-Rides-Cron-Secret") ?? "";
  if (!secret || token !== secret) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const rideIds = await loadMatchingRideIds();
  let processed = 0;
  for (const rideId of rideIds) {
    await reconcileMatching(rideId);
    processed += 1;
  }

  logLine({ event: "reconcile_matching_batch", processed });
  return c.json({ ok: true, processed });
});

registerAdminRoutes(app, { logLine });

app.onError((err, c) => {
  logLine({ event: "unhandled_error", message: err.message, path: c.req.path });
  return c.json({ error: "internal_error", message: err.message }, 500);
});

Deno.serve(app.fetch);
