# Function 1: Fleet Management

**Instructions:**
1. Go to your **Supabase Dashboard**.
2. Click **Edge Functions**.
3. Click **Deploy a new function** (Green Button) -> **Via Editor**.
4. Name it: `fleet-management`
5. In the editor, delete the default code and **paste the code below**.
6. **Save** and **Deploy**.

**Code to Copy:**

```typescript
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";

// --- KV STORE LOGIC (Included Inline) ---
const client = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const set = async (key: string, value: any): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").upsert({ key, value });
  if (error) throw new Error(error.message);
};

const get = async (key: string): Promise<any> => {
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value;
};

const del = async (key: string): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").delete().eq("key", key);
  if (error) throw new Error(error.message);
};

const mset = async (keys: string[], values: any[]): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").upsert(keys.map((k, i) => ({ key: k, value: values[i] })));
  if (error) throw new Error(error.message);
};

const mget = async (keys: string[]): Promise<any[]> => {
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("value").in("key", keys);
  if (error) throw new Error(error.message);
  return data?.map((d) => d.value) ?? [];
};

const mdel = async (keys: string[]): Promise<void> => {
  const supabase = client()
  const { error } = await supabase.from("kv_store_37f42386").delete().in("key", keys);
  if (error) throw new Error(error.message);
};

const getByPrefix = async (prefix: string): Promise<any[]> => {
  const supabase = client()
  const { data, error } = await supabase.from("kv_store_37f42386").select("key, value").like("key", prefix + "%");
  if (error) throw new Error(error.message);
  return data?.map((d) => d.value) ?? [];
};

// --- MAIN FUNCTION LOGIC ---
const app = new Hono();
app.use('*', logger(console.log));
app.use("/*", cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
}));

// Route Helper
const route = (path: string, handler: any) => {
    app.get(path, handler);
    app.get(`/fleet-management${path}`, handler);
};
const postRoute = (path: string, handler: any) => {
    app.post(path, handler);
    app.post(`/fleet-management${path}`, handler);
};
const deleteRoute = (path: string, handler: any) => {
    app.delete(path, handler);
    app.delete(`/fleet-management${path}`, handler);
};

route("/health", (c: any) => c.json({ status: "ok" }));

// --- VEHICLES ---
const getVehicles = async (c: any) => {
  try {
    const vehicles = await getByPrefix("vehicle:");
    return c.json(vehicles || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/vehicles", getVehicles);

const postVehicle = async (c: any) => {
  try {
    const vehicle = await c.req.json();
    if (!vehicle.id) return c.json({ error: "Vehicle ID (License Plate) is required" }, 400);
    await set(`vehicle:${vehicle.id}`, vehicle);
    return c.json({ success: true, data: vehicle });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/vehicles", postVehicle);

const deleteVehicle = async (c: any) => {
  const id = c.req.param("id");
  try { await del(`vehicle:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/vehicles/:id", deleteVehicle);

// --- VEHICLE IMAGE GENERATION (DALL-E 3) ---
const generateVehicleImage = async (c: any) => {
    try {
        const { make, model, year, color, bodyType } = await c.req.json();
        const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
        
        const prompt = `A professional, photorealistic image of a ${color} ${year} ${make} ${model} (${bodyType}) in a modern studio setting with soft lighting. 4k resolution.`;
        
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
        });

        return c.json({ success: true, url: response.data[0].url });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
};
postRoute("/generate-vehicle-image", generateVehicleImage);

// --- DRIVERS ---
const getDrivers = async (c: any) => {
  try {
    const drivers = await getByPrefix("driver:");
    // Exorcism logic
    const BANNED_UUID = "73dfc14d-3798-4a00-8d86-b2a3eb632f54";
    const ghostIndex = drivers ? drivers.findIndex((d: any) => d.id === BANNED_UUID) : -1;
    if (ghostIndex !== -1) {
        await del(`driver:${BANNED_UUID}`);
        drivers.splice(ghostIndex, 1);
    }
    return c.json(drivers || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/drivers", getDrivers);

const postDriver = async (c: any) => {
  try {
    const body = await c.req.json();
    const { password, ...driver } = body;
    
    // Create Supabase Auth User if password provided
    if (password && driver.email) {
         const supabase = client();
         const { data, error } = await supabase.auth.admin.createUser({
            email: driver.email,
            password: password,
            user_metadata: { name: driver.name || '', role: 'driver' },
            email_confirm: true
         });
         if (error) console.error("Auth Create Error:", error);
         else if (data.user) driver.auth_id = data.user.id;
    }

    if (!driver.id) driver.id = crypto.randomUUID();
    await set(`driver:${driver.id}`, driver);
    return c.json({ success: true, data: driver });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/drivers", postDriver);

// --- EQUIPMENT ---
const getEquipment = async (c: any) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const items = await getByPrefix(`equipment:${vehicleId}:`);
    return c.json(items || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/equipment/:vehicleId", getEquipment);

const postEquipment = async (c: any) => {
  try {
    const item = await c.req.json();
    if (!item.vehicleId) return c.json({ error: "Vehicle ID required" }, 400);
    if (!item.id) item.id = crypto.randomUUID();
    
    await set(`equipment:${item.vehicleId}:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/equipment", postEquipment);

const deleteEquipment = async (c: any) => {
  const vehicleId = c.req.param("vehicleId");
  const itemId = c.req.param("itemId");
  try {
    await del(`equipment:${vehicleId}:${itemId}`);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/equipment/:vehicleId/:itemId", deleteEquipment);

// --- TRIPS ---
const getTrips = async (c: any) => {
  try {
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? parseInt(limitParam) : null;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    let trips = await getByPrefix("trip:");
    if (trips && Array.isArray(trips)) {
        trips.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (limit !== null) {
            trips = trips.slice(offset, offset + limit);
        }
    }
    return c.json(trips || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/trips", getTrips);

const postTrips = async (c: any) => {
  try {
    const trips = await c.req.json();
    if (!Array.isArray(trips)) return c.json({ error: "Expected array of trips" }, 400);
    
    const processedTrips = trips.map((trip: any) => {
        if (trip.isManual) {
            return {
                ...trip,
                batchId: 'manual_entry',
                status: trip.status || 'Completed',
                netPayout: trip.netPayout ?? trip.amount,
                fareBreakdown: trip.fareBreakdown || { baseFare: trip.amount, tips: 0, waitTime: 0, surge: 0, airportFees: 0, timeAtStop: 0, taxes: 0 }
            };
        }
        return trip;
    });
    
    const keys = processedTrips.map((t: any) => `trip:${t.id}`);
    await mset(keys, processedTrips);
    return c.json({ success: true, count: processedTrips.length });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/trips", postTrips);

const deleteTrips = async (c: any) => {
  try {
    const prefixes = ["trip:", "batch:", "driver_metric:", "vehicle_metric:", "transaction:"];
    const supabase = client();
    const counts: Record<string, number> = {};

    for (const prefix of prefixes) {
        const { count, error } = await supabase.from("kv_store_37f42386").delete({ count: 'exact' }).like("key", `${prefix}%`);
        if (!error) counts[prefix] = count || 0;
    }
    return c.json({ success: true, ...counts });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/trips", deleteTrips);

const deleteTripId = async (c: any) => {
  const id = c.req.param("id");
  try { await del(`trip:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/trips/:id", deleteTripId);

// --- BATCHES ---
const getBatches = async (c: any) => {
  try {
    const batches = await getByPrefix("batch:");
    if (Array.isArray(batches)) {
        batches.sort((a: any, b: any) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
    }
    return c.json(batches || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/batches", getBatches);

const postBatch = async (c: any) => {
  try {
    const batch = await c.req.json();
    if (!batch.id) batch.id = crypto.randomUUID();
    await set(`batch:${batch.id}`, batch);
    return c.json({ success: true, data: batch });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/batches", postBatch);

const deleteBatch = async (c: any) => {
  const id = c.req.param("id");
  try { await del(`batch:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/batches/:id", deleteBatch);

// --- METRICS ---
const getDriverMetrics = async (c: any) => {
  try {
    const metrics = await getByPrefix("driver_metric:");
    return c.json(metrics || []);
  } catch(e: any) { return c.json({ error: e.message }, 500); }
};
route("/driver-metrics", getDriverMetrics);

const postDriverMetrics = async (c: any) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) return c.json({ error: "Expected array" }, 400);
    const keys = metrics.map((m: any) => `driver_metric:${m.id}`);
    await mset(keys, metrics);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/driver-metrics", postDriverMetrics);

const getVehicleMetrics = async (c: any) => {
  try {
    const metrics = await getByPrefix("vehicle_metric:");
    return c.json(metrics || []);
  } catch(e: any) { return c.json({ error: e.message }, 500); }
};
route("/vehicle-metrics", getVehicleMetrics);

const postVehicleMetrics = async (c: any) => {
  try {
    const metrics = await c.req.json();
    if (!Array.isArray(metrics)) return c.json({ error: "Expected array" }, 400);
    const keys = metrics.map((m: any) => `vehicle_metric:${m.id}`);
    await mset(keys, metrics);
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/vehicle-metrics", postVehicleMetrics);

// --- SYNC (Legacy Support) ---
const postSync = async (c: any) => {
  try {
    const state = await c.req.json();
    // Logic to save multiple entities
    if (state.drivers) {
        const keys = state.drivers.map((d: any) => `driver_metric:${d.id}`);
        await mset(keys, state.drivers);
    }
    if (state.vehicles) {
        const keys = state.vehicles.map((v: any) => `vehicle_metric:${v.id}`);
        await mset(keys, state.vehicles);
    }
    return c.json({ success: true });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/sync", postSync);

Deno.serve(app.fetch);
```
