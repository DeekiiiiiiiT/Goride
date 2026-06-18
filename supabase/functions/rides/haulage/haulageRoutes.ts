/**
 * Haulage passenger routes: catalog, quote, book.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowsPassengerSurface, jsonEdgeForbidden } from "../../_shared/authEdge.ts";
import { assertRiderCanBook } from "../fare/riderAccount.ts";
import { FareRuleNotFoundError } from "../fare/rules.ts";
import { DEFAULT_DISPATCH_SETTINGS, loadDispatchSettings, type DispatchSettings } from "../fare/dispatchSettings.ts";
import { generatePin } from "../fare/pinVerification.ts";
import { isRiderArrearsBlocked } from "../cashSettlement/arrearsCheck.ts";
import { gridCellKey } from "../fare/buildQuote.ts";
import {
  parseScheduledPickupAt,
  validateScheduledPickupWindow,
  clampPickupWindowMinutes,
  MAX_UPCOMING_SCHEDULED_PER_RIDER,
} from "../scheduledRides/validation.ts";
import { aggregateHaulageManifest } from "./aggregateManifest.ts";
import {
  buildHaulageQuote,
  isHaulageBookingEnabled,
  isHaulageCatalogEnabled,
  isHaulageQuoteEnabled,
} from "./buildHaulageQuote.ts";
import { loadHaulageCatalog, resolveHaulageLines } from "./catalogDb.ts";
import {
  haulageQuoteTokenHash,
  itemsFingerprint,
  verifyHaulageQuoteToken,
} from "./haulageQuoteToken.ts";
import { attachHaulageManifestIfNeeded } from "./manifestJoin.ts";

function isPinFeatureEnabled(settings: DispatchSettings): boolean {
  return settings.pin_verification_enabled || settings.pin_verification_required_for_start;
}

export type HaulageRoutesDeps = {
  svc: () => SupabaseClient;
  pubSvc: () => SupabaseClient;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
  readSurgeMultiplier: (cellKey: string) => Promise<number>;
  getRidesAdminDb: () => Promise<{ db: SupabaseClient; tables: Record<string, string> }>;
  loadRideRequestByIdempotencyKey: (key: string) => Promise<Record<string, unknown> | null>;
  cancelPriorMatchingRidesForRider: (riderId: string, reason: string) => Promise<void>;
  bumpSurgeDemand: (cellKey: string, delta: number) => Promise<void>;
  startMatchingForRide: (rideId: string) => Promise<void>;
  clientIp: (c: { req: { header: (name: string) => string | undefined } }) => string;
  rateLimit: (key: string, max: number, windowMs: number) => boolean;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
};

function parsePlace(raw: unknown): { address: string; lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  const address = typeof o.address === "string" ? o.address.trim() : "";
  if (Number.isNaN(lat) || Number.isNaN(lng) || !address) return null;
  return { address, lat, lng };
}

function parseLines(raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const lines = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const item_id = typeof o.item_id === "string" ? o.item_id.trim() : "";
    const variant_id = typeof o.variant_id === "string" ? o.variant_id.trim() : "";
    if (!item_id || !variant_id) return null;
    const qty = typeof o.qty === "number" ? o.qty : Number(o.qty);
    lines.push({ item_id, variant_id, qty: Number.isFinite(qty) ? qty : 1 });
  }
  return lines;
}

export function registerHaulageRoutes(app: Hono, deps: HaulageRoutesDeps) {
  app.get("/v1/haulage/catalog", async (c) => {
    if (!isHaulageCatalogEnabled()) {
      return c.json({ error: "haulage_disabled" }, 503);
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    try {
      const catalog = await loadHaulageCatalog(deps.pubSvc());
      return c.json(catalog);
    } catch (e) {
      return c.json({
        error: "catalog_load_failed",
        message: e instanceof Error ? e.message : "unknown",
      }, 500);
    }
  });

  app.post("/v1/haulage/quote", async (c) => {
    if (!isHaulageQuoteEnabled()) {
      return c.json({ error: "haulage_disabled" }, 503);
    }
    const ip = deps.clientIp(c);
    if (!deps.rateLimit(`${ip}:haulage-quote`, 30, 60_000)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const pickup = parsePlace(body.pickup);
    const dropoff = parsePlace(body.dropoff);
    const lines = parseLines(body.items);
    if (!pickup || !dropoff || !lines) {
      return c.json({ error: "invalid_location" }, 400);
    }

    const stairs_level = typeof body.stairs_level === "string" ? body.stairs_level : "none";
    const prep_status = typeof body.prep_status === "string" ? body.prep_status : "ready";
    if (!["none", "1_flight", "2_plus"].includes(stairs_level)) {
      return c.json({ error: "invalid_stairs_level" }, 400);
    }
    if (!["ready", "needs_unhooking"].includes(prep_status)) {
      return c.json({ error: "invalid_prep_status" }, 400);
    }

    const scheduledAt = parseScheduledPickupAt(body.scheduled_pickup_at);
    if (body.scheduled_pickup_at && !scheduledAt) {
      return c.json({ error: "invalid_scheduled_pickup_at" }, 400);
    }
    if (scheduledAt) {
      const err = validateScheduledPickupWindow(scheduledAt);
      if (err) return c.json({ error: err }, 400);
    }

    const db = deps.pubSvc();
    const resolved = await resolveHaulageLines(db, lines);
    if (!resolved.ok) return c.json({ error: resolved.error }, 400);

    const manifest = aggregateHaulageManifest(resolved.lines);

    try {
      const quote = await buildHaulageQuote(db, {
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        stairs_level,
        prep_status,
        manifest,
        items: lines,
        scheduled_pickup_at: scheduledAt?.toISOString() ?? null,
        readSurge: deps.readSurgeMultiplier,
        departureTimeUnix: scheduledAt ? Math.floor(scheduledAt.getTime() / 1000) : undefined,
      });
      return c.json(quote);
    } catch (e) {
      if (e instanceof FareRuleNotFoundError) {
        return c.json({ error: "no_fare_rule" }, 404);
      }
      throw e;
    }
  });

  app.post("/v1/haulage/requests", async (c) => {
    if (!isHaulageBookingEnabled()) {
      return c.json({ error: "haulage_disabled" }, 503);
    }
    const ip = deps.clientIp(c);
    if (!deps.rateLimit(`${ip}:haulage-book`, 15, 60_000)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const bookingCheck = await assertRiderCanBook(deps.svc(), auth.user.id);
    if (!bookingCheck.ok) {
      return c.json({ error: "rider_account_restricted", status: bookingCheck.status }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const quote_token = typeof body.quote_token === "string" ? body.quote_token : "";
    const idempotency_key = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
    if (!quote_token) return c.json({ error: "quote_token_required" }, 400);

    if (idempotency_key) {
      const existing = await deps.loadRideRequestByIdempotencyKey(idempotency_key);
      if (existing) {
        const ride = await attachHaulageManifestIfNeeded(deps.pubSvc(), existing);
        return c.json({
          ride_request_id: ride.id,
          haulage_booking_id: (ride.haulage_manifest as { haulage_booking_id?: string } | undefined)?.haulage_booking_id,
          booking_ref: String(ride.id).slice(0, 8).toUpperCase(),
          status: ride.status,
          booking_kind: ride.booking_kind ?? "immediate",
          estimated_total_minor: ride.fare_estimate_minor,
          currency: ride.currency,
          scheduled_pickup_at: ride.scheduled_pickup_at ?? null,
        });
      }
    }

    const pickup = parsePlace(body.pickup);
    const dropoff = parsePlace(body.dropoff);
    const lines = parseLines(body.items);
    if (!pickup || !dropoff || !lines) {
      return c.json({ error: "invalid_location" }, 400);
    }

    const fingerprint = itemsFingerprint(lines);
    const verified = await verifyHaulageQuoteToken(quote_token, {
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
      items_fingerprint: fingerprint,
    });
    if (!verified.ok) {
      return c.json({ error: "quote_stale", reason: verified.reason }, 409);
    }

    const locked = verified.payload;
    const db = deps.svc();
    const pub = deps.pubSvc();

    if (locked.booking_kind === "scheduled") {
      const { count } = await db.from("ride_requests")
        .select("id", { count: "exact", head: true })
        .eq("rider_user_id", auth.user.id)
        .eq("status", "scheduled");
      if ((count ?? 0) >= MAX_UPCOMING_SCHEDULED_PER_RIDER) {
        return c.json({ error: "too_many_scheduled_rides" }, 409);
      }
    } else {
      await deps.cancelPriorMatchingRidesForRider(auth.user.id, "replaced_by_new_booking");
    }

    const cellKey = gridCellKey(pickup.lat, pickup.lng);
    await deps.bumpSurgeDemand(cellKey, 1);

    let dispatchSettings = DEFAULT_DISPATCH_SETTINGS;
    try {
      const { db: adminDb, tables } = await deps.getRidesAdminDb();
      dispatchSettings = await loadDispatchSettings(adminDb, tables);
    } catch { /* defaults */ }

    const paymentMethod = body.payment_method === "card" || body.payment_method === "cash"
      ? body.payment_method
      : null;

    const arrearsCheck = await isRiderArrearsBlocked(
      db,
      auth.user.id,
      paymentMethod ?? "cash",
      locked.currency,
    );
    if (arrearsCheck.blocked) {
      return c.json({
        error: "rider_arrears_blocked",
        arrears_minor: arrearsCheck.arrearsMinor,
        currency: locked.currency,
      }, 403);
    }

    const resolved = await resolveHaulageLines(pub, lines);
    if (!resolved.ok) return c.json({ error: resolved.error }, 400);
    const manifest = aggregateHaulageManifest(resolved.lines);

    const isScheduled = locked.booking_kind === "scheduled";
    const insertRow: Record<string, unknown> = {
      rider_user_id: auth.user.id,
      status: isScheduled ? "scheduled" : "matching",
      booking_kind: locked.booking_kind,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_address: pickup.address,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
      dropoff_address: dropoff.address,
      vehicle_option: "haulage",
      fare_estimate_minor: locked.fare_estimate_minor,
      surge_multiplier: locked.breakdown.surge_multiplier,
      currency: locked.currency,
      distance_estimate_km: locked.distance_km,
      duration_estimate_minutes: locked.duration_minutes,
      eta_pickup_seconds_estimate: 0,
      quote_token_hash: haulageQuoteTokenHash(quote_token),
      fare_breakdown: { ...locked.breakdown, haulage: true, manifest_summary: manifest.manifest_summary },
      idempotency_key,
      driver_offer_timeout_seconds: dispatchSettings.default_driver_offer_timeout_seconds,
      matching_wave: 0,
      verification_pin: isPinFeatureEnabled(dispatchSettings) ? generatePin() : null,
      scheduled_pickup_at: locked.scheduled_pickup_at,
      pickup_window_minutes: clampPickupWindowMinutes(body.pickup_window_minutes),
    };
    if (paymentMethod) insertRow.payment_method = paymentMethod;

    const { data: rideData, error: rideErr } = await db.rpc("rides_create_ride_request", { p_row: insertRow });
    let ride = rideData as Record<string, unknown> | null;
    if (rideErr || !ride) {
      const { data: fallback, error: fbErr } = await db.from("ride_requests").insert(insertRow).select("*").single();
      if (fbErr || !fallback) {
        return c.json({ error: "book_failed", message: rideErr?.message ?? fbErr?.message }, 500);
      }
      ride = fallback as Record<string, unknown>;
    }

    const rideId = String(ride.id);
    const stairs_level = locked.stairs_level;
    const prep_status = locked.prep_status;

    const { data: bookingRow, error: bookingErr } = await db.from("haulage_bookings").insert({
      ride_request_id: rideId,
      stairs_level,
      prep_status,
      total_weight_kg: manifest.total_weight_kg,
      total_volume_cm3: manifest.total_volume_cm3,
      min_body_type_slug: manifest.min_body_type_slug,
      fill_percent: manifest.fill_percent,
      recommended_gear: manifest.recommended_gear,
      manifest_summary: manifest.manifest_summary,
    }).select("id").single();

    if (bookingErr || !bookingRow) {
      return c.json({ error: "haulage_booking_failed", message: bookingErr?.message }, 500);
    }

    const haulageBookingId = (bookingRow as { id: string }).id;
    const lineRows = manifest.lines.map((line) => ({
      haulage_booking_id: haulageBookingId,
      item_id: line.item_id,
      variant_id: line.variant_id,
      qty: line.qty,
      item_title: line.item_title,
      variant_label: line.label,
      weight_kg: line.weight_kg,
      length_cm: line.length_cm,
      width_cm: line.width_cm,
      height_cm: line.height_cm,
      fragile: line.fragile,
      requires_disassembly: line.requires_disassembly,
      upright_only: line.upright_only,
    }));

    const { error: linesErr } = await db.from("haulage_booking_lines").insert(lineRows);
    if (linesErr) {
      return c.json({ error: "haulage_lines_failed", message: linesErr.message }, 500);
    }

    if (!isScheduled) {
      await deps.startMatchingForRide(rideId);
    }

    await deps.audit(rideId, auth.user.id, "haulage_booked", {
      haulage_booking_id: haulageBookingId,
      booking_kind: locked.booking_kind,
      total_weight_kg: manifest.total_weight_kg,
    });

    return c.json({
      ride_request_id: rideId,
      haulage_booking_id: haulageBookingId,
      booking_ref: `HLG-${rideId.slice(0, 8).toUpperCase()}`,
      status: ride.status,
      booking_kind: locked.booking_kind,
      estimated_total_minor: locked.fare_estimate_minor,
      currency: locked.currency,
      scheduled_pickup_at: locked.scheduled_pickup_at,
    });
  });
}
