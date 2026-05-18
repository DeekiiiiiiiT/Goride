/**
 * Driver Admin Routes
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../_shared/productAdmin.ts";
import { getDriverAdminDb } from "../_shared/driverAdminDb.ts";
import { registerDriverUserAdminRoutes } from "./admin/drivers.ts";

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

  admin.get("/stats", async (c) => {
    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { count: totalDrivers } = await db.from(tables.driver_profiles)
      .select("*", { count: "exact", head: true });

    const { count: activeDrivers } = await db.from(tables.driver_profiles)
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("onboarding_complete", true);

    const { count: pendingCompliance } = await db.from(tables.driver_profiles)
      .select("*", { count: "exact", head: true })
      .or("onboarding_complete.eq.false,background_check_status.neq.approved");

    const { data: locations } = await db.from(tables.driver_locations)
      .select("user_id, available_for_rides, updated_at")
      .eq("available_for_rides", true);

    const now = Date.now();
    const onlineNow = (locations ?? []).filter((l) => {
      if (!l.updated_at) return false;
      return now - new Date(l.updated_at as string).getTime() <= ONLINE_STALE_MS;
    }).length;

    return c.json({
      total_drivers: totalDrivers ?? 0,
      active_drivers: activeDrivers ?? 0,
      pending_compliance: pendingCompliance ?? 0,
      online_now: onlineNow,
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
      .select("assigned_driver_user_id, status")
      .in("status", ACTIVE_TRIP_STATUSES)
      .not("assigned_driver_user_id", "is", null);

    const onTrip = new Map(
      (activeTrips ?? []).map((t) => [t.assigned_driver_user_id as string, t.status as string]),
    );

    const now = Date.now();
    let drivers = (locations ?? []).map((l) => {
      const uid = l.user_id as string;
      const fresh = l.updated_at &&
        now - new Date(l.updated_at as string).getTime() <= ONLINE_STALE_MS;
      const tripStatus = onTrip.get(uid);
      return {
        driver_id: uid,
        lat: l.lat,
        lng: l.lng,
        is_available: Boolean(l.available_for_rides) && fresh,
        last_seen: l.updated_at,
        live_status: tripStatus ? "on_trip" : (fresh && l.available_for_rides ? "online" : "offline"),
        trip_status: tripStatus ?? null,
      };
    });

    if (onlineOnly) {
      drivers = drivers.filter((d) => d.live_status === "online" || d.live_status === "on_trip");
    }

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

  admin.get("/compliance", async (c) => {
    const status = c.req.query("status");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const resolved = await getDriverAdminDb();
    const { db } = resolved;

    let query = db.from("driver_profiles")
      .select(
        "user_id, display_name, phone, onboarding_complete, background_check_status, insurance_expiry, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status === "pending") {
      query = query.eq("onboarding_complete", false);
    } else if (status === "complete") {
      query = query.eq("onboarding_complete", true);
    }

    const { data, error } = await query;
    if (error) return c.json({ drivers: [], total: 0, error: error.message });

    const auth = _deps.svc();
    const drivers = await Promise.all((data ?? []).map(async (d) => {
      const { data: u } = await auth.auth.admin.getUserById(d.user_id as string);
      return {
        driver_id: d.user_id,
        driver_name: (d.display_name as string) || "Unknown",
        driver_email: u?.user?.email ?? "",
        license_verified: false,
        insurance_verified: Boolean(d.insurance_expiry),
        vehicle_verified: false,
        background_check: (d.background_check_status as string) ?? "not_started",
        onboarding_complete: Boolean(d.onboarding_complete),
        created_at: d.created_at,
      };
    }));

    return c.json({ drivers, total: drivers.length });
  });

  admin.patch("/compliance/:driverId", async (c) => {
    const driverId = c.req.param("driverId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resolved = await getDriverAdminDb();
    const { db } = resolved;
    const adminUser = c.get("adminUser") as { id: string; email: string };

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.background_check === "string") {
      patch.background_check_status = body.background_check;
      if (body.background_check === "approved") {
        patch.background_check_date = new Date().toISOString().slice(0, 10);
      }
    }

    if (Object.keys(patch).length > 1) {
      const { error } = await db.from("driver_profiles")
        .update(patch)
        .eq("user_id", driverId);
      if (error) return c.json({ ok: false, error: error.message }, 400);
    }

    console.log(JSON.stringify({
      action: "compliance_updated",
      driver_id: driverId,
      admin: adminUser.email,
      updates: body,
    }));

    return c.json({ ok: true });
  });

  app.route("/admin", admin);
}
