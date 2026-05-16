/**
 * Driver Admin Routes
 *
 * Provides admin endpoints for driver management:
 * - /admin/stats - Overall driver statistics
 * - /admin/presence - Driver location/availability monitoring
 * - /admin/offers - Active offer management
 * - /admin/compliance - Driver verification queue
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../_shared/productAdmin.ts";

interface Deps {
  svc: () => SupabaseClient;
}

export function registerDriverAdminRoutes(app: Hono, deps: Deps) {
  const admin = new Hono();

  // Auth middleware - require driver admin access
  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "driver");
    if ("error" in result || result instanceof Response) {
      return result as Response;
    }
    c.set("adminUser", result);
    return next();
  });

  // GET /admin/stats - Overall statistics
  admin.get("/stats", async (c) => {
    const db = deps.svc();

    // Get basic counts from public.drivers table
    const { count: totalDrivers } = await db
      .from("drivers")
      .select("*", { count: "exact", head: true });

    // Get active drivers (onboarding complete)
    const { count: activeDrivers } = await db
      .from("drivers")
      .select("*", { count: "exact", head: true })
      .eq("onboarding_complete", true);

    // Placeholder for pending compliance count
    const pendingCompliance = 0;

    // Placeholder for online now count (requires presence table in rides schema)
    const onlineNow = 0;

    return c.json({
      total_drivers: totalDrivers ?? 0,
      active_drivers: activeDrivers ?? 0,
      pending_compliance: pendingCompliance,
      online_now: onlineNow,
    });
  });

  // GET /admin/presence - Driver presence/location monitoring
  admin.get("/presence", async (c) => {
    const onlineOnly = c.req.query("online_only") === "true";
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const db = deps.svc();

    // This would query from rides.driver_presence if it exists
    // For now, return placeholder data structure
    return c.json({
      drivers: [],
      total: 0,
      message: "Presence tracking requires rides.driver_presence table",
    });
  });

  // GET /admin/offers - Active offers
  admin.get("/offers", async (c) => {
    const status = c.req.query("status");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const db = deps.svc();

    // Query from rides.ride_offers table
    let query = db
      .from("ride_offers")
      .select("*, rides!inner(id, status)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching offers:", error);
      return c.json({ offers: [], total: 0, error: error.message });
    }

    return c.json({
      offers: data ?? [],
      total: data?.length ?? 0,
    });
  });

  // POST /admin/offers/:id/cancel - Cancel an offer
  admin.post("/offers/:id/cancel", async (c) => {
    const offerId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const reason = body.reason as string | undefined;
    const db = deps.svc();
    const adminUser = c.get("adminUser") as { id: string; email: string };

    const { error } = await db
      .from("ride_offers")
      .update({
        status: "cancelled",
        declined_reason: reason || "Cancelled by admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", offerId)
      .eq("status", "pending");

    if (error) {
      return c.json({ ok: false, error: error.message }, 400);
    }

    console.log(
      JSON.stringify({
        action: "offer_cancelled",
        offer_id: offerId,
        admin: adminUser.email,
        reason,
      })
    );

    return c.json({ ok: true });
  });

  // GET /admin/compliance - Compliance queue
  admin.get("/compliance", async (c) => {
    const status = c.req.query("status");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const db = deps.svc();

    // Query drivers needing verification
    let query = db
      .from("drivers")
      .select(`
        id,
        first_name,
        last_name,
        phone,
        onboarding_complete,
        created_at,
        auth_users:user_id (email)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Filter by onboarding status if specified
    if (status === "pending") {
      query = query.eq("onboarding_complete", false);
    } else if (status === "complete") {
      query = query.eq("onboarding_complete", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching compliance queue:", error);
      return c.json({ drivers: [], total: 0, error: error.message });
    }

    const drivers = (data ?? []).map((d) => ({
      driver_id: d.id,
      driver_name: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "Unknown",
      driver_email: (d.auth_users as { email?: string } | null)?.email ?? "",
      license_verified: false,
      insurance_verified: false,
      vehicle_verified: false,
      background_check: "not_started" as const,
      created_at: d.created_at,
    }));

    return c.json({
      drivers,
      total: drivers.length,
    });
  });

  // PATCH /admin/compliance/:driverId - Update compliance status
  admin.patch("/compliance/:driverId", async (c) => {
    const driverId = c.req.param("driverId");
    const body = await c.req.json().catch(() => ({}));
    const adminUser = c.get("adminUser") as { id: string; email: string };

    // For now, just log the update - actual implementation would update
    // a compliance tracking table
    console.log(
      JSON.stringify({
        action: "compliance_updated",
        driver_id: driverId,
        admin: adminUser.email,
        updates: body,
      })
    );

    return c.json({ ok: true });
  });

  // Mount admin routes
  app.route("/admin", admin);
}
