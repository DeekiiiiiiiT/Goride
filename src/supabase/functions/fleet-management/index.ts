import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

app.use('*', logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check
app.get("/fleet-management/health", (c) => c.json({ status: "ok" }));

// --- TRIPS ---
app.post("/fleet-management/trips/search", async (c) => {
  try {
    const { driverId, startDate, endDate, limit, offset, status } = await c.req.json();
    
    let query = supabase
      .from("kv_store_37f42386")
      .select("value")
      .like("key", "trip:%");

    // Apply Filters
    if (driverId) {
      // Use -> operator (JSONB) to leverage GIN index
      query = query.eq("value->driverId", driverId);
    }
    
    if (status) {
        query = query.eq("value->status", status);
    }

    if (startDate) {
      query = query.gte("value->createdAt", startDate);
    }
    
    if (endDate) {
      query = query.lte("value->createdAt", endDate);
    }

    // Sorting - defaulting to newest first
    // Note: We need to cast to appropriate type if we want strict date sorting, 
    // but ISO strings sort correctly alphabetically.
    query = query.order("value->createdAt", { ascending: false });

    // Pagination
    const limitVal = typeof limit === 'number' ? limit : 20;
    const offsetVal = typeof offset === 'number' ? offset : 0;
    
    // Range is inclusive
    query = query.range(offsetVal, offsetVal + limitVal - 1);

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    // Unwrap the 'value' wrapper
    const trips = data.map((row: any) => row.value);
    
    return c.json({ 
        data: trips, 
        page: Math.floor(offsetVal / limitVal) + 1,
        limit: limitVal,
        total: trips.length // Note: exact count requires a separate query if needed
    });

  } catch (e: any) {
    console.error("Error searching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.post("/fleet-management/trips", async (c) => {
  try {
    const trips = await c.req.json();
    if (!Array.isArray(trips)) {
      return c.json({ error: "Expected array of trips" }, 400);
    }
    const processedTrips = trips.map((trip: any) => {
        if (trip.isManual) {
            if (!trip.driverId) throw new Error(`Manual trip ${trip.id || 'unknown'} must have a driverId`);
            if (typeof trip.amount !== 'number') throw new Error(`Manual trip ${trip.id || 'unknown'} must have a numeric amount`);
            return {
                ...trip,
                batchId: 'manual_entry',
                status: trip.status || 'Completed',
                netPayout: trip.netPayout ?? trip.amount,
                fareBreakdown: trip.fareBreakdown || {
                    baseFare: trip.amount,
                    tips: 0, waitTime: 0, surge: 0, airportFees: 0, timeAtStop: 0, taxes: 0
                }
            };
        }
        return trip;
    });
    const keys = processedTrips.map((t: any) => `trip:${t.id}`);
    await kv.mset(keys, processedTrips);
    return c.json({ success: true, count: processedTrips.length });
  } catch (e: any) {
    console.error("Error saving trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.get("/fleet-management/trips", async (c) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : 50;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const { data, error } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "trip:%")
        .order("value->>date", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    
    const trips = data?.map((d: any) => d.value) || [];
    return c.json(trips);
  } catch (e: any) {
    console.error("Error fetching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/fleet-management/trips", async (c) => {
  try {
    const prefixes = ["trip:", "batch:", "driver_metric:", "vehicle_metric:", "transaction:"];
    const counts: Record<string, number> = {};
    for (const prefix of prefixes) {
        const { count, error } = await supabase
            .from("kv_store_37f42386")
            .delete({ count: 'exact' })
            .like("key", `${prefix}%`);
        if (error) throw error;
        counts[prefix] = count || 0;
    }
    return c.json({ 
        success: true, 
        deletedTrips: counts["trip:"] || 0,
        deletedBatches: counts["batch:"] || 0,
        deletedDriverMetrics: counts["driver_metric:"] || 0,
        deletedVehicleMetrics: counts["vehicle_metric:"] || 0,
        deletedTransactions: counts["transaction:"] || 0
    });
  } catch (e: any) {
    console.error("Error clearing data:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/fleet-management/trips/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`trip:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// --- DRIVERS ---
app.get("/fleet-management/drivers", async (c) => {
  try {
    const drivers = await kv.getByPrefix("driver:");
    const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
    const ghostIndex = drivers ? drivers.findIndex((d: any) => d.id === BANNED_UUID) : -1;
    if (ghostIndex !== -1) {
        await kv.del(`driver:${BANNED_UUID}`);
        drivers.splice(ghostIndex, 1);
    }
    return c.json(drivers || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fleet-management/drivers", async (c) => {
  try {
    const body = await c.req.json();
    const { password, ...driver } = body;
    let authUserId = null;
    if (password && driver.email) {
         const { data, error } = await supabase.auth.admin.createUser({
            email: driver.email,
            password: password,
            user_metadata: { name: driver.name || '', role: 'driver' },
            email_confirm: true
         });
         if (error) {
             return c.json({ error: `Failed to create user account: ${error.message}` }, 400);
         }
         authUserId = data.user.id;
    }
    const finalId = authUserId || driver.id || crypto.randomUUID();
    const newDriver = {
        ...driver,
        id: finalId,
        driverId: driver.driverId || finalId,
    };
    await kv.set(`driver:${finalId}`, newDriver);
    return c.json({ success: true, data: newDriver });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- VEHICLES ---
app.get("/fleet-management/vehicles", async (c) => {
  try {
    const vehicles = await kv.getByPrefix("vehicle:");
    return c.json(vehicles || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/fleet-management/vehicles", async (c) => {
  try {
    const vehicle = await c.req.json();
    if (!vehicle.id) {
        return c.json({ error: "Vehicle ID (License Plate) is required" }, 400);
    }
    await kv.set(`vehicle:${vehicle.id}`, vehicle);
    return c.json({ success: true, data: vehicle });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/fleet-management/vehicles/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`vehicle:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// --- METRICS ---
app.post("/fleet-management/driver-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) return c.json({ error: "Expected array of metrics" }, 400);
    const keys = metrics.map((m: any) => `driver_metric:${m.id}`);
    await kv.mset(keys, metrics);
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/fleet-management/driver-metrics", async (c) => {
    try {
        const metrics = await kv.getByPrefix("driver_metric:");
        const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
        const ghostIndex = metrics ? metrics.findIndex((m: any) => (m.driverId === BANNED_UUID || m.id === BANNED_UUID)) : -1;
        if (ghostIndex !== -1) {
            await kv.del(`driver_metric:${BANNED_UUID}`);
            metrics.splice(ghostIndex, 1);
        }
        return c.json(metrics || []);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

app.post("/fleet-management/vehicle-metrics", async (c) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) return c.json({ error: "Expected array of metrics" }, 400);
    const keys = metrics.map((m: any) => `vehicle_metric:${m.id}`);
    await kv.mset(keys, metrics);
    return c.json({ success: true, count: metrics.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/fleet-management/vehicle-metrics", async (c) => {
    try {
        const metrics = await kv.getByPrefix("vehicle_metric:");
        return c.json(metrics || []);
    } catch(e: any) {
        return c.json({ error: e.message }, 500);
    }
});

// --- FLEET SYNC ---
app.post("/fleet-management/fleet/sync", async (c) => {
  try {
    const { drivers, vehicles, financials, trips, metadata, insights } = await c.req.json();
    const operations = [];
    if (Array.isArray(drivers) && drivers.length > 0) {
        const driverKeys = drivers.map((d: any) => `driver_metric:${d.driverId}`);
        operations.push(kv.mset(driverKeys, drivers));
    }
    if (Array.isArray(vehicles) && vehicles.length > 0) {
        const vehicleKeys = vehicles.map((v: any) => `vehicle_metric:${v.plateNumber || v.vehicleId}`);
        operations.push(kv.mset(vehicleKeys, vehicles));
    }
    if (Array.isArray(trips) && trips.length > 0) {
        const tripKeys = trips.map((t: any) => `trip:${t.id}`);
        operations.push(kv.mset(tripKeys, trips));
    }
    if (financials) {
        operations.push(kv.set("organization_metrics:current", financials));
    }
    if (metadata) {
        operations.push(kv.set("import_metadata:current", metadata));
    }
    if (insights) {
        operations.push(kv.set("import_insights:current", insights));
    }
    await Promise.all(operations);
    return c.json({ 
        success: true, 
        stats: {
            drivers: drivers?.length || 0,
            vehicles: vehicles?.length || 0,
            trips: trips?.length || 0
        }
    });
  } catch (e: any) {
      console.error("Fleet Sync Error:", e);
      return c.json({ error: e.message }, 500);
  }
});

// --- DASHBOARD STATS ---
app.get("/fleet-management/dashboard/stats", async (c) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    
    // 1. Fetch Today's Trips
    // We use the same JSONB query strategy to fetch only relevant rows
    const { data: tripData, error: tripError } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "trip:%")
        .gte("value->requestTime", todayISO); // Assuming requestTime is the primary date field

    if (tripError) throw tripError;

    const trips = tripData?.map((r: any) => r.value) || [];

    // 2. Fetch Active Drivers (approximate by drivers who have logged in or have trips today)
    // For now, we'll just count drivers with status 'active' in the store
    const { data: driverData, error: driverError } = await supabase
        .from("kv_store_37f42386")
        .select("value")
        .like("key", "driver:%")
        .eq("value->status", "active");

    if (driverError) throw driverError;
    const activeDrivers = driverData?.length || 0;

    // 3. Calculate Aggregates
    const stats = trips.reduce((acc: any, trip: any) => {
        acc.totalRevenue += (trip.amount || 0);
        acc.totalTrips += 1;
        if (trip.status === 'Completed') acc.completedTrips += 1;
        if (trip.status === 'Cancelled') acc.cancelledTrips += 1;
        acc.totalDistance += (trip.distance || 0);
        return acc;
    }, {
        totalRevenue: 0,
        totalTrips: 0,
        completedTrips: 0,
        cancelledTrips: 0,
        totalDistance: 0
    });

    return c.json({
        period: "today",
        date: todayISO,
        revenue: stats.totalRevenue,
        trips: stats.totalTrips,
        activeDrivers: activeDrivers,
        efficiency: stats.totalTrips > 0 ? Math.round((stats.completedTrips / stats.totalTrips) * 100) : 100,
        fleetHealth: 98 // Placeholder or calculated from maintenance logs
    });

  } catch (e: any) {
    console.error("Dashboard Stats Error:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

Deno.serve(async (req) => {
  try {
    return await app.fetch(req);
  } catch (err: any) {
    console.error("Critical Server Error:", err);
    return new Response(JSON.stringify({ 
      error: "Internal Server Error", 
      message: err.message 
    }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json", 
        "Access-Control-Allow-Origin": "*" 
      }
    });
  }
});
