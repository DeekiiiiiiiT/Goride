import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowsPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import { assertRiderCanBook } from "../fare/riderAccount.ts";
import { buildFareQuote } from "../fare/buildQuote.ts";
import { DEFAULT_DISPATCH_SETTINGS, loadDispatchSettings } from "../fare/dispatchSettings.ts";
import { SCHEDULED_QUOTE_TTL_MS, quoteTokenHash, verifyQuoteToken } from "../fare/quoteToken.ts";
import { canCancelRide } from "../rideAccess.ts";
import { isScheduledRidesEnabled } from "./flags.ts";
import {
  MAX_UPCOMING_SCHEDULED_PER_RIDER,
  clampPickupWindowMinutes,
  formatCancellationPolicy,
  parseScheduledPickupAt,
  pickupWindowBounds,
  validateScheduledPickupWindow,
} from "./validation.ts";

export type ScheduledRidesDeps = {
  svc: () => SupabaseClient;
  pubSvc: () => SupabaseClient;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
  ridesUserSurfaceRole: (user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) => string | null;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  readSurgeMultiplier: (cellKey: string) => Promise<number>;
  resolveFareRulesDbForQuote: () => Promise<{
    db: SupabaseClient;
    fareRulesTable: string;
    vehicleTypesTable: string;
  }>;
  getRidesAdminDb: () => Promise<{ db: SupabaseClient; tables: Record<string, string> }>;
  loadRideRequestById: (id: string) => Promise<Record<string, unknown> | null>;
  loadRideRequestByIdempotencyKey: (key: string) => Promise<Record<string, unknown> | null>;
  patchRideRequest: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  cancelRideRequestRow: (
    id: string,
    cancelledBy: "rider" | "driver" | "system",
    reason: string,
    extra?: Record<string, unknown>,
  ) => Promise<boolean>;
  gridCellKey: (lat: number, lng: number) => string;
  bumpSurgeDemand: (cellKey: string, delta: number) => Promise<void>;
  startMatchingForRide: (rideId: string, ride: Record<string, unknown>, reqId?: string) => Promise<void>;
  clientIp: (c: { req: { header: (n: string) => string | undefined } }) => string;
  rateLimit: (key: string, limit: number, windowMs: number) => boolean;
};

function featureDisabled(c: { json: (body: unknown, status: number) => Response }) {
  return c.json({ error: "feature_disabled" }, 404);
}

async function countUpcomingScheduled(
  db: SupabaseClient,
  riderUserId: string,
): Promise<number> {
  const { count } = await db.from("ride_requests")
    .select("id", { count: "exact", head: true })
    .eq("rider_user_id", riderUserId)
    .eq("status", "scheduled");
  return count ?? 0;
}

async function loadScheduledForRider(
  db: SupabaseClient,
  pub: SupabaseClient,
  riderUserId: string,
): Promise<Record<string, unknown>[]> {
  const { data: native, error } = await db.from("ride_requests")
    .select("*")
    .eq("rider_user_id", riderUserId)
    .eq("status", "scheduled")
    .order("scheduled_pickup_at", { ascending: true })
    .limit(10);
  if (!error && native) return native as Record<string, unknown>[];
  const { data: pubRows } = await pub.from("rides_ride_requests")
    .select("*")
    .eq("rider_user_id", riderUserId)
    .eq("status", "scheduled")
    .order("scheduled_pickup_at", { ascending: true })
    .limit(10);
  return (pubRows ?? []) as Record<string, unknown>[];
}

export function registerScheduledRidesRoutes(app: Hono, deps: ScheduledRidesDeps) {
  app.post("/v1/scheduled-rides/quote", async (c) => {
    if (!isScheduledRidesEnabled()) return featureDisabled(c);
    const ip = deps.clientIp(c);
    if (!deps.rateLimit(`${ip}:scheduled_quote`, 60, 60_000)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) && deps.ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const bookingCheck = await assertRiderCanBook(deps.svc(), auth.user.id);
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
    const pickupAt = parseScheduledPickupAt(body.scheduled_pickup_at);
    if (!pickupAt) return c.json({ error: "invalid_scheduled_pickup_at" }, 400);
    const windowErr = validateScheduledPickupWindow(pickupAt);
    if (windowErr) return c.json({ error: windowErr }, 400);

    const vehicle_option = typeof body.vehicle_option === "string" ? body.vehicle_option : "uberx";
    const db = deps.svc();
    const fareRulesAccess = await deps.resolveFareRulesDbForQuote();
    let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
    try {
      const { db: adminDb, tables } = await deps.getRidesAdminDb();
      dispatchSettings = await loadDispatchSettings(adminDb, tables);
    } catch { /* defaults */ }

    let quote: Awaited<ReturnType<typeof buildFareQuote>>;
    try {
      quote = await buildFareQuote(db, {
        pickupLat: pickup_lat,
        pickupLng: pickup_lng,
        dropoffLat: dropoff_lat,
        dropoffLng: dropoff_lng,
        vehicleType: vehicle_option,
        readSurge: deps.readSurgeMultiplier,
        dispatchSettings,
        fareRulesDb: fareRulesAccess.db,
        fareRulesTable: fareRulesAccess.fareRulesTable,
        vehicleTypesTable: fareRulesAccess.vehicleTypesTable,
        quoteTtlMs: SCHEDULED_QUOTE_TTL_MS,
        departureTimeUnix: Math.floor(pickupAt.getTime() / 1000),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("no_fare_rule")) return c.json({ error: "no_fare_rule" }, 404);
      throw e;
    }

    await deps.audit(null, auth.user.id, "scheduled_ride_quoted", {
      scheduled_pickup_at: pickupAt.toISOString(),
      fare_estimate_minor: Number(quote.fareEstimateMinor),
    });

    return c.json({
      distance_estimate_km: quote.distanceKm,
      duration_estimate_minutes: quote.durationMinutes,
      surge_multiplier: quote.surgeMultiplier,
      fare_estimate_minor: quote.fareEstimateMinor.toString(),
      currency: quote.currency,
      vehicle_option: quote.vehicleType,
      route_source: quote.routeSource,
      duration_traffic_aware: quote.durationTrafficAware,
      ...(quote.routePolylineEncoded
        ? { route_polyline_encoded: quote.routePolylineEncoded }
        : {}),
      fare_breakdown: quote.breakdown,
      quote_token: quote.quoteToken,
      scheduled_pickup_at: pickupAt.toISOString(),
    });
  });

  app.post("/v1/scheduled-rides", async (c) => {
    if (!isScheduledRidesEnabled()) return featureDisabled(c);
    const ip = deps.clientIp(c);
    if (!deps.rateLimit(`${ip}:scheduled_create`, 20, 60_000)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) && deps.ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const bookingCheck = await assertRiderCanBook(deps.svc(), auth.user.id);
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
    const pickupAt = parseScheduledPickupAt(body.scheduled_pickup_at);
    if (!pickupAt) return c.json({ error: "invalid_scheduled_pickup_at" }, 400);
    const windowErr = validateScheduledPickupWindow(pickupAt);
    if (windowErr) return c.json({ error: windowErr }, 400);

    const upcoming = await countUpcomingScheduled(deps.svc(), auth.user.id);
    if (upcoming >= MAX_UPCOMING_SCHEDULED_PER_RIDER) {
      return c.json({ error: "too_many_scheduled_rides" }, 409);
    }

    const idempotency_key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
    if (idempotency_key) {
      const existing = await deps.loadRideRequestByIdempotencyKey(idempotency_key);
      if (existing) return c.json({ ride: existing });
    }

    const quote_token = typeof body.quote_token === "string" ? body.quote_token : null;
    if (!quote_token) return c.json({ error: "quote_token_required" }, 400);
    const vehicle_option = typeof body.vehicle_option === "string" ? body.vehicle_option : "uberx";
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
    const pickupWindow = clampPickupWindowMinutes(body.pickup_window_minutes);

    let bookDispatchSettings = DEFAULT_DISPATCH_SETTINGS;
    try {
      const { db: adminDb, tables } = await deps.getRidesAdminDb();
      bookDispatchSettings = await loadDispatchSettings(adminDb, tables);
    } catch { /* defaults */ }

    const insertRow: Record<string, unknown> = {
      rider_user_id: auth.user.id,
      status: "scheduled",
      booking_kind: "scheduled",
      scheduled_pickup_at: pickupAt.toISOString(),
      pickup_window_minutes: pickupWindow,
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
      quote_token_hash: quoteTokenHash(quote_token),
      fare_breakdown: locked.fare_breakdown ?? null,
      idempotency_key,
      driver_offer_timeout_seconds: bookDispatchSettings.default_driver_offer_timeout_seconds,
      matching_wave: 0,
      route_polyline_encoded: typeof body.route_polyline_encoded === "string"
        ? body.route_polyline_encoded
        : null,
    };
    const paymentMethod = body.payment_method;
    if (paymentMethod === "cash" || paymentMethod === "card") {
      insertRow.payment_method = paymentMethod;
    }

    const { data: rpcRide, error: rpcError } = await deps.pubSvc().rpc("rides_create_ride_request", {
      p_row: insertRow,
    });
    let ride: Record<string, unknown> | null = rpcRide as Record<string, unknown> | null;
    if (!ride && rpcError) {
      const { data, error } = await deps.svc().from("ride_requests").insert(insertRow).select("*").single();
      if (error || !data) return c.json({ error: "insert_failed" }, 500);
      ride = data as Record<string, unknown>;
    }
    if (!ride) return c.json({ error: "insert_failed" }, 500);

    await deps.audit(String(ride.id), auth.user.id, "scheduled_ride_created", {
      scheduled_pickup_at: pickupAt.toISOString(),
      fare_locked: locked.fare_estimate_minor,
    });

    const bounds = pickupWindowBounds(pickupAt, pickupWindow);
    return c.json({
      ride,
      pickup_window_start: bounds.start.toISOString(),
      pickup_window_end: bounds.end.toISOString(),
      cancellation_policy: formatCancellationPolicy(),
    });
  });

  app.get("/v1/scheduled-rides", async (c) => {
    if (!isScheduledRidesEnabled()) return featureDisabled(c);
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) && deps.ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const rides = await loadScheduledForRider(deps.svc(), deps.pubSvc(), auth.user.id);
    return c.json({ rides });
  });

  app.get("/v1/scheduled-rides/:id", async (c) => {
    if (!isScheduledRidesEnabled()) return featureDisabled(c);
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const id = c.req.param("id");
    const ride = await deps.loadRideRequestById(id);
    if (!ride || String(ride.rider_user_id) !== auth.user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    if (String(ride.status) !== "scheduled") {
      return c.json({ error: "not_scheduled" }, 409);
    }
    const pickupAt = parseScheduledPickupAt(ride.scheduled_pickup_at);
    const windowMin = clampPickupWindowMinutes(ride.pickup_window_minutes);
    const bounds = pickupAt ? pickupWindowBounds(pickupAt, windowMin) : null;
    return c.json({
      ride,
      pickup_window_start: bounds?.start.toISOString() ?? null,
      pickup_window_end: bounds?.end.toISOString() ?? null,
      cancellation_policy: formatCancellationPolicy(),
    });
  });

  app.post("/v1/scheduled-rides/:id/cancel", async (c) => {
    if (!isScheduledRidesEnabled()) return featureDisabled(c);
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    const id = c.req.param("id");
    const ride = await deps.loadRideRequestById(id);
    if (!ride || String(ride.rider_user_id) !== auth.user.id) {
      return c.json({ error: "not_found" }, 404);
    }
    if (String(ride.status) !== "scheduled") {
      return c.json({ error: "not_scheduled" }, 409);
    }
    if (!canCancelRide(ride, auth.user.id)) {
      return c.json({ error: "not_cancellable" }, 403);
    }
    const ok = await deps.cancelRideRequestRow(id, "rider", "rider_cancelled_scheduled", {
      scheduled_cancel_reason: "rider",
    });
    if (!ok) return c.json({ error: "cancel_failed" }, 500);
    await deps.audit(id, auth.user.id, "scheduled_ride_cancelled", { reason: "rider" });
    const fresh = await deps.loadRideRequestById(id);
    return c.json({ ride: fresh });
  });

  app.post("/v1/internal/dispatch-scheduled-rides", async (c) => {
    if (!isScheduledRidesEnabled()) return featureDisabled(c);
    const secret = Deno.env.get("RIDES_CRON_SECRET");
    const token = c.req.header("X-Rides-Cron-Secret") ?? "";
    if (!secret || token !== secret) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const { data: dispatchResult, error: dispatchErr } = await deps.pubSvc().rpc(
      "rides_dispatch_due_scheduled_rides",
    );
    if (dispatchErr) {
      return c.json({ error: "dispatch_rpc_failed", message: dispatchErr.message }, 500);
    }

    const result = (dispatchResult ?? {}) as Record<string, unknown>;
    const activatedIds = Array.isArray(result.activated_ids)
      ? result.activated_ids as string[]
      : [];
    const skippedBusyIds = Array.isArray(result.skipped_busy_ids)
      ? result.skipped_busy_ids as string[]
      : [];

    for (const rideId of skippedBusyIds) {
      await deps.audit(rideId, undefined, "scheduled_ride_dispatch_failed", {
        reason: "system_rider_busy",
      });
    }

    let matchingStarted = 0;
    for (const rideId of activatedIds) {
      const ride = await deps.loadRideRequestById(rideId);
      if (!ride || String(ride.status) !== "matching") continue;
      const cellKey = deps.gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
      await deps.bumpSurgeDemand(cellKey, 1);
      const reqId = crypto.randomUUID();
      await deps.audit(rideId, undefined, "scheduled_ride_activated", { request_id: reqId });
      await deps.startMatchingForRide(rideId, ride, reqId);
      matchingStarted += 1;
    }

    return c.json({
      ok: true,
      dispatch: result,
      matching_started: matchingStarted,
    });
  });
}
