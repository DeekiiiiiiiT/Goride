/**
 * Rides admin dashboard drill-down lists.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import { getDriverAdminDb } from "../../_shared/driverAdminDb.ts";
import { getRidesAdminDb } from "../../_shared/ridesAdminDb.ts";

type RidesDbOrResponse = (
  c: { json: (body: unknown, status?: number) => Response },
) => Promise<Awaited<ReturnType<typeof getRidesAdminDb>> | Response>;

const LIST_LIMIT = 100;

const ACTIVE_RIDE_STATUSES = [
  "matching",
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
] as const;

const RIDER_ON_TRIP_STATUSES = [
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
] as const;

const ONLINE_STALE_MS = 5 * 60 * 1000;

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function registerDashboardListRoutes(
  admin: Hono,
  ridesDbOrResponse: RidesDbOrResponse,
) {
  admin.get("/dashboard/list", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const view = (c.req.query("view") ?? "").trim();
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    if (view === "active_rides") {
      const { data, error } = await db.from(tables.ride_requests)
        .select("*")
        .in("status", [...ACTIVE_RIDE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) return c.json({ error: "list_failed", message: error.message }, 500);
      return c.json({ rides: data ?? [] });
    }

    if (view === "riders_on_trip") {
      const { data, error } = await db.from(tables.ride_requests)
        .select("*")
        .in("status", [...RIDER_ON_TRIP_STATUSES])
        .order("updated_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) return c.json({ error: "list_failed", message: error.message }, 500);
      return c.json({ rides: data ?? [] });
    }

    if (view === "todays_rides") {
      const dayStart = startOfUtcDay();
      const { data, error } = await db.from(tables.ride_requests)
        .select("*")
        .eq("status", "completed")
        .gte("updated_at", dayStart)
        .order("updated_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) return c.json({ error: "list_failed", message: error.message }, 500);
      return c.json({ rides: data ?? [] });
    }

    if (view === "cancelled_rides") {
      const { data, error } = await db.from(tables.ride_requests)
        .select("*")
        .eq("status", "cancelled")
        .order("updated_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) return c.json({ error: "list_failed", message: error.message }, 500);
      return c.json({ rides: data ?? [] });
    }

    if (view === "drivers_online") {
      try {
        const driverResolved = await getDriverAdminDb();
        const driverDb = driverResolved.ridesDb ?? driverResolved.db;
        const locTable = driverResolved.tables.driver_locations;
        const profileTable = driverResolved.tables.driver_profiles;
        const rideTable = driverResolved.tables.ride_requests;

        const { data: activeTrips } = await driverDb.from(rideTable)
          .select("assigned_driver_user_id")
          .in("status", [...RIDER_ON_TRIP_STATUSES])
          .not("assigned_driver_user_id", "is", null);

        const onTripDriverIds = new Set(
          (activeTrips ?? [])
            .map((t) => t.assigned_driver_user_id as string)
            .filter(Boolean),
        );

        const { data: locations } = await driverDb.from(locTable)
          .select("user_id, lat, lng, available_for_rides, updated_at, body_type_slug")
          .order("updated_at", { ascending: false })
          .limit(500);

        const now = Date.now();
        const onlineLocs = (locations ?? []).filter((l) => {
          const uid = l.user_id as string;
          if (onTripDriverIds.has(uid)) return false;
          if (!l.available_for_rides || !l.updated_at) return false;
          return now - new Date(l.updated_at as string).getTime() <= ONLINE_STALE_MS;
        }).slice(0, LIST_LIMIT);

        const userIds = onlineLocs.map((l) => l.user_id as string);
        const profileByUser = new Map<string, { display_name: string | null }>();
        if (userIds.length > 0) {
          const { data: profiles } = await driverDb.from(profileTable)
            .select("user_id, display_name")
            .in("user_id", userIds);
          for (const p of profiles ?? []) {
            profileByUser.set(p.user_id as string, {
              display_name: (p.display_name as string | null) ?? null,
            });
          }
        }

        const drivers = onlineLocs.map((l) => {
          const uid = l.user_id as string;
          const profile = profileByUser.get(uid);
          return {
            user_id: uid,
            display_name: profile?.display_name ?? null,
            lat: l.lat,
            lng: l.lng,
            body_type_slug: (l as { body_type_slug?: string | null }).body_type_slug ?? null,
            updated_at: l.updated_at as string,
            available_for_rides: Boolean(l.available_for_rides),
          };
        });

        return c.json({ drivers });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Driver data unavailable";
        return c.json({ error: "driver_list_failed", message }, 503);
      }
    }

    return c.json({
      error: "invalid_view",
      allowed: ["active_rides", "riders_on_trip", "todays_rides", "cancelled_rides", "drivers_online"],
    }, 400);
  });
}
