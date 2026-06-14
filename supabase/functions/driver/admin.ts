/**
 * Driver Admin Routes
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../_shared/productAdmin.ts";
import { getDriverAdminDb } from "../_shared/driverAdminDb.ts";
import { registerDriverUserAdminRoutes } from "./admin/drivers.ts";
import { registerDriverPlayStoreLaunchRoutes } from "./admin/playStoreLaunch.ts";
import { registerComplianceRoutes } from "./admin/complianceRoutes.ts";
import { isInComplianceQueue, computeComplianceBlockers } from "./admin/complianceLogic.ts";
import { enrichDriverIdentities } from "./admin/driverIdentity.ts";

interface Deps {
  svc: () => SupabaseClient;
}

const ACTIVE_TRIP_STATUSES = [
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
];

const ONLINE_STALE_MS = 5 * 60 * 1000;

export function registerDriverAdminRoutes(app: Hono, _deps: Deps) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "driver");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    return next();
  });

  registerDriverUserAdminRoutes(admin);
  registerDriverPlayStoreLaunchRoutes(admin);
  registerComplianceRoutes(admin, _deps);

  admin.get("/stats", async (c) => {
    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { count: totalDrivers } = await db.from(tables.driver_profiles)
      .select("*", { count: "exact", head: true });

    const { data: allProfiles } = await db.from(tables.driver_profiles)
      .select("mode, onboarding_complete, background_check_status, insurance_expiry, status, id");

    const profileIds = (allProfiles ?? []).map((p) => p.id as string);
    let vehicleCounts = new Map<string, number>();
    if (profileIds.length) {
      const { data: vehicleRows } = await db
        .from("driver_vehicles")
        .select("driver_profile_id")
        .in("driver_profile_id", profileIds);
      for (const v of vehicleRows ?? []) {
        const pid = v.driver_profile_id as string;
        vehicleCounts.set(pid, (vehicleCounts.get(pid) ?? 0) + 1);
      }
    }

    let pendingCompliance = 0;
    for (const p of allProfiles ?? []) {
      const hasVehicle = (vehicleCounts.get(p.id as string) ?? 0) > 0;
      const blockers = computeComplianceBlockers(
        {
          status: (p.status as "active" | "pending" | "suspended" | "deactivated") ?? "pending",
          mode: (p.mode as string) ?? "independent",
          onboarding_complete: Boolean(p.onboarding_complete),
          background_check_status: (p.background_check_status as string | null) ?? null,
          insurance_expiry: (p.insurance_expiry as string | null) ?? null,
        },
        hasVehicle,
      );
      const status = (p.status as "active" | "pending" | "suspended" | "deactivated") ?? "pending";
      if (isInComplianceQueue(blockers, status)) pendingCompliance += 1;
    }

    const { count: activeDrivers } = await db.from(tables.driver_profiles)
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("onboarding_complete", true);

    const { data: locations } = await db.from(tables.driver_locations)
      .select("user_id, available_for_rides, updated_at");

    const { data: activeTrips } = await db.from(tables.ride_requests)
      .select("assigned_driver_user_id")
      .in("status", ACTIVE_TRIP_STATUSES)
      .not("assigned_driver_user_id", "is", null);

    const onTripDriverIds = new Set(
      (activeTrips ?? [])
        .map((t) => t.assigned_driver_user_id as string)
        .filter(Boolean),
    );

    const now = Date.now();
    let onlineNow = 0;
    for (const l of locations ?? []) {
      const uid = l.user_id as string;
      if (onTripDriverIds.has(uid)) continue;
      if (!l.available_for_rides || !l.updated_at) continue;
      const age = now - new Date(l.updated_at as string).getTime();
      if (age <= ONLINE_STALE_MS) onlineNow += 1;
    }

    return c.json({
      total_drivers: totalDrivers ?? 0,
      active_drivers: activeDrivers ?? 0,
      pending_compliance: pendingCompliance ?? 0,
      online_now: onlineNow,
      on_trip_now: onTripDriverIds.size,
    });
  });

  admin.get("/presence", async (c) => {
    const onlineOnly = c.req.query("online_only") === "true";
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { data: locations } = await db.from(tables.driver_locations)
      .select("user_id, lat, lng, available_for_rides, updated_at, heading_degrees")
      .order("updated_at", { ascending: false })
      .limit(limit);

    const { data: activeTrips } = await db.from(tables.ride_requests)
      .select("id, assigned_driver_user_id, status, pickup_address, dropoff_address")
      .in("status", ACTIVE_TRIP_STATUSES)
      .not("assigned_driver_user_id", "is", null);

    const onTrip = new Map(
      (activeTrips ?? []).map((t) => [
        t.assigned_driver_user_id as string,
        {
          status: t.status as string,
          ride_id: t.id as string,
          pickup_address: (t.pickup_address as string | null) ?? null,
          dropoff_address: (t.dropoff_address as string | null) ?? null,
        },
      ]),
    );

    const now = Date.now();
    const seen = new Set<string>();
    let drivers = (locations ?? []).map((l) => {
      const uid = l.user_id as string;
      seen.add(uid);
      const fresh = l.updated_at &&
        now - new Date(l.updated_at as string).getTime() <= ONLINE_STALE_MS;
      const trip = onTrip.get(uid);
      const lat = Number(l.lat);
      const lng = Number(l.lng);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) &&
        !(lat === 0 && lng === 0);
      return {
        driver_id: uid,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        is_available: Boolean(l.available_for_rides) && fresh && !trip,
        last_seen: l.updated_at as string | null,
        live_status: trip ? "on_trip" : (fresh && l.available_for_rides ? "online" : "offline"),
        trip_status: trip?.status ?? null,
        ride_id: trip?.ride_id ?? null,
        pickup_address: trip?.pickup_address ?? null,
        dropoff_address: trip?.dropoff_address ?? null,
        display_name: null as string | null,
        email: null as string | null,
        phone: null as string | null,
      };
    });

    for (const [uid, trip] of onTrip) {
      if (seen.has(uid)) continue;
      drivers.push({
        driver_id: uid,
        lat: null,
        lng: null,
        is_available: false,
        last_seen: null,
        live_status: "on_trip",
        trip_status: trip.status,
        ride_id: trip.ride_id,
        pickup_address: trip.pickup_address,
        dropoff_address: trip.dropoff_address,
        display_name: null,
        email: null,
        phone: null,
      });
    }

    const userIds = drivers.map((d) => d.driver_id);
    if (userIds.length > 0) {
      const { data: profiles } = await db.from(tables.driver_profiles)
        .select("user_id, display_name, first_name, last_name, phone")
        .in("user_id", userIds);
      drivers = await enrichDriverIdentities(drivers, profiles ?? []);
    }

    if (onlineOnly) {
      drivers = drivers.filter((d) => d.live_status === "online" || d.live_status === "on_trip");
    }

    drivers.sort((a, b) => {
      const rank = (s: string) => (s === "on_trip" ? 0 : s === "online" ? 1 : 2);
      const dr = rank(a.live_status) - rank(b.live_status);
      if (dr !== 0) return dr;
      const ta = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const tb = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      return tb - ta;
    });

    return c.json({ drivers, total: drivers.length });
  });

  admin.get("/offers", async (c) => {
    const status = c.req.query("status");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    let query = db.from(tables.driver_offers)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return c.json({ offers: [], total: 0, error: error.message });

    return c.json({ offers: data ?? [], total: data?.length ?? 0 });
  });

  admin.post("/offers/:id/cancel", async (c) => {
    const offerId = c.req.param("id");
    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;
    const adminUser = c.get("adminUser") as { id: string; email: string };

    const { error } = await db.from(tables.driver_offers)
      .update({ status: "expired" })
      .eq("id", offerId)
      .eq("status", "pending");

    if (error) return c.json({ ok: false, error: error.message }, 400);

    console.log(JSON.stringify({
      action: "offer_cancelled",
      offer_id: offerId,
      admin: adminUser.email,
    }));

    return c.json({ ok: true });
  });

  app.route("/admin", admin);
}
