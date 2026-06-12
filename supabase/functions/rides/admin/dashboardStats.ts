/**
 * Rides admin dashboard metrics.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import { getDriverAdminDb } from "../../_shared/driverAdminDb.ts";
import { getRidesAdminDb } from "../../_shared/ridesAdminDb.ts";

type RidesDbOrResponse = (
  c: { json: (body: unknown, status?: number) => Response },
) => Promise<Awaited<ReturnType<typeof getRidesAdminDb>> | Response>;

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

const DRIVER_ACTIVE_TRIP_STATUSES = [...RIDER_ON_TRIP_STATUSES];

const ONLINE_STALE_MS = 5 * 60 * 1000;

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function registerDashboardStatsRoutes(
  admin: Hono,
  ridesDbOrResponse: RidesDbOrResponse,
) {
  admin.get("/stats", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { count: activeRides } = await db.from(tables.ride_requests)
      .select("*", { count: "exact", head: true })
      .in("status", [...ACTIVE_RIDE_STATUSES]);

    const { data: onTripRows } = await db.from(tables.ride_requests)
      .select("rider_user_id")
      .in("status", [...RIDER_ON_TRIP_STATUSES]);

    const ridersOnTrip = new Set(
      (onTripRows ?? []).map((r) => r.rider_user_id as string).filter(Boolean),
    ).size;

    const dayStart = startOfUtcDay();
    const { count: todaysCompleted } = await db.from(tables.ride_requests)
      .select("*", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("updated_at", dayStart);

    const { count: cancelledToday } = await db.from(tables.ride_requests)
      .select("*", { count: "exact", head: true })
      .eq("status", "cancelled")
      .gte("updated_at", dayStart);

    const { count: upcomingScheduled } = await db.from(tables.ride_requests)
      .select("*", { count: "exact", head: true })
      .eq("status", "scheduled")
      .gte("scheduled_pickup_at", new Date().toISOString());

    const { data: surgeRows } = await db.from(tables.surge_cells).select("surge_multiplier");
    let avgSurge = 1;
    if (surgeRows && surgeRows.length > 0) {
      const sum = surgeRows.reduce((acc, row) => acc + Number(row.surge_multiplier ?? 1), 0);
      avgSurge = Math.round((sum / surgeRows.length) * 100) / 100;
    }

    let onlineDrivers = 0;
    let driversOnTrip = 0;
    try {
      const driverResolved = await getDriverAdminDb();
      const driverDb = driverResolved.ridesDb ?? driverResolved.db;
      const locTable = driverResolved.tables.driver_locations;
      const rideTable = driverResolved.tables.ride_requests;

      const { data: locations } = await driverDb.from(locTable)
        .select("user_id, available_for_rides, updated_at");

      const { data: activeTrips } = await driverDb.from(rideTable)
        .select("assigned_driver_user_id")
        .in("status", [...DRIVER_ACTIVE_TRIP_STATUSES])
        .not("assigned_driver_user_id", "is", null);

      const onTripDriverIds = new Set(
        (activeTrips ?? [])
          .map((t) => t.assigned_driver_user_id as string)
          .filter(Boolean),
      );
      driversOnTrip = onTripDriverIds.size;

      const now = Date.now();
      for (const l of locations ?? []) {
        const uid = l.user_id as string;
        if (onTripDriverIds.has(uid)) continue;
        if (!l.available_for_rides || !l.updated_at) continue;
        const age = now - new Date(l.updated_at as string).getTime();
        if (age <= ONLINE_STALE_MS) onlineDrivers += 1;
      }
    } catch {
      /* driver pool optional for rides dashboard */
    }

    return c.json({
      active_rides: activeRides ?? 0,
      riders_on_trip: ridersOnTrip,
      todays_completed_rides: todaysCompleted ?? 0,
      cancelled_rides_today: cancelledToday ?? 0,
      upcoming_scheduled_rides: upcomingScheduled ?? 0,
      online_drivers: onlineDrivers,
      drivers_on_trip: driversOnTrip,
      avg_surge_multiplier: avgSurge,
    });
  });
}
