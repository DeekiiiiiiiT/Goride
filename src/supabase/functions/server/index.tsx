import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
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

// Health check endpoint
app.get("/make-server-37f42386/health", (c) => {
  return c.json({ status: "ok" });
});

// Trips endpoints
app.post("/make-server-37f42386/trips", async (c) => {
  try {
    const trips = await c.req.json();
    if (!Array.isArray(trips)) {
      return c.json({ error: "Expected array of trips" }, 400);
    }
    
    // Create keys for each trip
    // Assuming each trip has a unique 'id' field
    const keys = trips.map((t: any) => `trip:${t.id}`);
    
    // Store using mset
    await kv.mset(keys, trips);
    
    return c.json({ success: true, count: trips.length });
  } catch (e: any) {
    console.error("Error saving trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.get("/make-server-37f42386/trips", async (c) => {
  try {
    const trips = await kv.getByPrefix("trip:");
    return c.json(trips);
  } catch (e: any) {
    console.error("Error fetching trips:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.delete("/make-server-37f42386/trips", async (c) => {
  try {
    // 1. Get all trip keys
    const trips = await kv.getByPrefix("trip:");
    const tripKeys = trips.map((t: any) => `trip:${t.id}`);
    
    // 2. Get all batch keys
    const batches = await kv.getByPrefix("batch:");
    const batchKeys = (batches || []).map((b: any) => `batch:${b.id}`);
    
    // 3. Delete everything
    const allKeys = [...tripKeys, ...batchKeys];
    if (allKeys.length > 0) {
        await kv.mdel(allKeys);
    }
    
    return c.json({ 
        success: true, 
        deletedTrips: tripKeys.length,
        deletedBatches: batchKeys.length 
    });
  } catch (e: any) {
    console.error("Error clearing data:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

// Notifications endpoints
app.get("/make-server-37f42386/notifications", async (c) => {
  try {
    const notifications = await kv.getByPrefix("notification:");
    if (Array.isArray(notifications)) {
        // Sort by timestamp desc safely
        notifications.sort((a: any, b: any) => {
            const timeA = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
            return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        });
        return c.json(notifications);
    }
    return c.json([]);
  } catch (e: any) {
    console.error("Error fetching notifications:", e);
    return c.json({ error: e.message || "Internal Server Error" }, 500);
  }
});

app.post("/make-server-37f42386/notifications", async (c) => {
  try {
    const notification = await c.req.json();
    if (!notification.id) {
        notification.id = crypto.randomUUID();
    }
    if (!notification.timestamp) {
        notification.timestamp = new Date().toISOString();
    }
    
    await kv.set(`notification:${notification.id}`, notification);
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.patch("/make-server-37f42386/notifications/:id/read", async (c) => {
  const id = c.req.param("id");
  try {
    const notification = await kv.get(`notification:${id}`);
    if (!notification) {
      return c.json({ error: "Notification not found" }, 404);
    }
    notification.read = true;
    await kv.set(`notification:${id}`, notification);
    return c.json({ success: true, data: notification });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Alert Rules endpoints
app.get("/make-server-37f42386/alert-rules", async (c) => {
  try {
    const rules = await kv.getByPrefix("alert_rule:");
    return c.json(rules);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/alert-rules", async (c) => {
  try {
    const rule = await c.req.json();
    if (!rule.id) {
        rule.id = crypto.randomUUID();
    }
    await kv.set(`alert_rule:${rule.id}`, rule);
    return c.json({ success: true, data: rule });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/alert-rules/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await kv.del(`alert_rule:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Batch Management Endpoints
app.get("/make-server-37f42386/batches", async (c) => {
  try {
    const batches = await kv.getByPrefix("batch:");
    // Sort by uploadDate desc
    if (Array.isArray(batches)) {
        batches.sort((a: any, b: any) => {
            return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
        });
    }
    return c.json(batches || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/make-server-37f42386/batches", async (c) => {
  try {
    const batch = await c.req.json();
    if (!batch.id) {
        batch.id = crypto.randomUUID();
    }
    await kv.set(`batch:${batch.id}`, batch);
    return c.json({ success: true, data: batch });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/make-server-37f42386/batches/:id", async (c) => {
  const batchId = c.req.param("id");
  try {
    // 1. Get all trips to find which ones belong to this batch
    // Note: This is inefficient for large datasets but necessary without secondary indexes
    const allTrips = await kv.getByPrefix("trip:");
    
    // 2. Filter trips belonging to this batch
    const tripsToDelete = (allTrips || []).filter((t: any) => t.batchId === batchId);
    
    // 3. Delete the trips
    if (tripsToDelete.length > 0) {
        const keys = tripsToDelete.map((t: any) => `trip:${t.id}`);
        await kv.mdel(keys);
    }
    
    // 4. Delete the batch record itself
    await kv.del(`batch:${batchId}`);
    
    return c.json({ 
        success: true, 
        deletedTrips: tripsToDelete.length,
        deletedBatch: batchId 
    });
  } catch (e: any) {
    console.error("Delete batch error:", e);
    return c.json({ error: e.message }, 500);
  }
});

Deno.serve(app.fetch);
