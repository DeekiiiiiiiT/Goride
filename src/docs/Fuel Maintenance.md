# Function 3: Fuel & Maintenance

**Instructions:**
1. Go to your **Supabase Dashboard**.
2. Click **Edge Functions**.
3. Click **Deploy a new function** (Green Button) -> **Via Editor**.
4. Name it: `fuel-maintenance`
5. In the editor, delete the default code and **paste the code below**.
6. **Save** and **Deploy**.

**Code to Copy:**

```typescript
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    app.get(`/fuel-maintenance${path}`, handler);
};
const postRoute = (path: string, handler: any) => {
    app.post(path, handler);
    app.post(`/fuel-maintenance${path}`, handler);
};
const deleteRoute = (path: string, handler: any) => {
    app.delete(path, handler);
    app.delete(`/fuel-maintenance${path}`, handler);
};

route("/health", (c: any) => c.json({ status: "ok" }));

// --- FUEL CARDS ---
const getFuelCards = async (c: any) => {
  try {
    const cards = await getByPrefix("fuel_card:");
    return c.json(cards || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/fuel-cards", getFuelCards);

const postFuelCard = async (c: any) => {
  try {
    const card = await c.req.json();
    if (!card.id) card.id = crypto.randomUUID();
    await set(`fuel_card:${card.id}`, card);
    return c.json({ success: true, data: card });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/fuel-cards", postFuelCard);

const deleteFuelCard = async (c: any) => {
  const id = c.req.param("id");
  try {
    await del(`fuel_card:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/fuel-cards/:id", deleteFuelCard);

// --- FUEL ENTRIES ---
const getFuelEntries = async (c: any) => {
  try {
    const entries = await getByPrefix("fuel_entry:");
    if (entries && Array.isArray(entries)) {
        entries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return c.json(entries || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/fuel-entries", getFuelEntries);

const postFuelEntry = async (c: any) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) entry.id = crypto.randomUUID();
    await set(`fuel_entry:${entry.id}`, entry);
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/fuel-entries", postFuelEntry);

const deleteFuelEntry = async (c: any) => {
  const id = c.req.param("id");
  try {
    await del(`fuel_entry:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/fuel-entries/:id", deleteFuelEntry);

// --- MILEAGE ADJUSTMENTS ---
const getMileageAdjustments = async (c: any) => {
  try {
    const adjustments = await getByPrefix("fuel_adjustment:");
    if (adjustments && Array.isArray(adjustments)) {
        adjustments.sort((a: any, b: any) => (b.week || "").localeCompare(a.week || ""));
    }
    return c.json(adjustments || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/mileage-adjustments", getMileageAdjustments);

const postMileageAdjustment = async (c: any) => {
  try {
    const adj = await c.req.json();
    if (!adj.id) adj.id = crypto.randomUUID();
    await set(`fuel_adjustment:${adj.id}`, adj);
    return c.json({ success: true, data: adj });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/mileage-adjustments", postMileageAdjustment);

const deleteMileageAdjustment = async (c: any) => {
  const id = c.req.param("id");
  try {
    await del(`fuel_adjustment:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/mileage-adjustments/:id", deleteMileageAdjustment);

// --- MAINTENANCE LOGS ---
const getMaintenanceLogs = async (c: any) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const logs = await getByPrefix(`maintenance_log:${vehicleId}:`);
    logs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json(logs);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/maintenance-logs/:vehicleId", getMaintenanceLogs);

const postMaintenanceLog = async (c: any) => {
  try {
    const log = await c.req.json();
    if (!log.id) log.id = crypto.randomUUID();
    if (!log.vehicleId) return c.json({ error: "Vehicle ID is required" }, 400);
    await set(`maintenance_log:${log.vehicleId}:${log.id}`, log);
    return c.json({ success: true, data: log });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/maintenance-logs", postMaintenanceLog);

// --- TOLL TAGS ---
const getTollTags = async (c: any) => {
  try {
    const tags = await getByPrefix("toll_tag:");
    return c.json(tags || []);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/toll-tags", getTollTags);

const postTollTag = async (c: any) => {
  try {
    const tag = await c.req.json();
    if (!tag.id) tag.id = crypto.randomUUID();
    if (!tag.createdAt) tag.createdAt = new Date().toISOString();
    await set(`toll_tag:${tag.id}`, tag);
    return c.json({ success: true, data: tag });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/toll-tags", postTollTag);

const deleteTollTag = async (c: any) => {
  const id = c.req.param("id");
  try {
    await del(`toll_tag:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/toll-tags/:id", deleteTollTag);

// --- ODOMETER HISTORY ---
const getOdometerHistory = async (c: any) => {
  try {
    const vehicleId = c.req.param("vehicleId");
    const history = await getByPrefix(`odometer_reading:${vehicleId}:`);
    history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return c.json(history);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
route("/odometer-history/:vehicleId", getOdometerHistory);

const postOdometerHistory = async (c: any) => {
  try {
    const reading = await c.req.json();
    if (!reading.id) reading.id = crypto.randomUUID();
    if (!reading.vehicleId) return c.json({ error: "Vehicle ID required" }, 400);
    if (!reading.createdAt) reading.createdAt = new Date().toISOString();
    await set(`odometer_reading:${reading.vehicleId}:${reading.id}`, reading);
    return c.json({ success: true, data: reading });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
postRoute("/odometer-history", postOdometerHistory);

const deleteOdometerHistory = async (c: any) => {
  const id = c.req.param("id");
  const vehicleId = c.req.query("vehicleId"); // Often needed for key construction if stored as prefix:vehicleId:id
  // But here set was `odometer_reading:${reading.vehicleId}:${reading.id}`
  // To delete we need vehicleId.
  // The API call usually is DELETE /odometer-history/:id?vehicleId=...
  
  if (!vehicleId) return c.json({ error: "Vehicle ID required" }, 400);

  try {
    await del(`odometer_reading:${vehicleId}:${id}`);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
};
deleteRoute("/odometer-history/:id", deleteOdometerHistory);


// --- FUEL SCENARIOS ---
const getFuelScenarios = async (c: any) => {
  try {
    const items = await getByPrefix("fuel_scenario:");
    return c.json(items || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/scenarios", getFuelScenarios);

const postFuelScenario = async (c: any) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await set(`fuel_scenario:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/scenarios", postFuelScenario);

const deleteFuelScenario = async (c: any) => {
  const id = c.req.param("id");
  try { await del(`fuel_scenario:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/scenarios/:id", deleteFuelScenario);

// --- FUEL DISPUTES (Stubbed) ---
const getFuelDisputes = async (c: any) => {
  try {
    const items = await getByPrefix("fuel_dispute:");
    return c.json(items || []);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
route("/fuel-disputes", getFuelDisputes);

const postFuelDispute = async (c: any) => {
  try {
    const item = await c.req.json();
    if (!item.id) item.id = crypto.randomUUID();
    await set(`fuel_dispute:${item.id}`, item);
    return c.json({ success: true, data: item });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
};
postRoute("/fuel-disputes", postFuelDispute);

const deleteFuelDispute = async (c: any) => {
  const id = c.req.param("id");
  try { await del(`fuel_dispute:${id}`); return c.json({ success: true }); }
  catch (e: any) { return c.json({ error: e.message }, 500); }
};
deleteRoute("/fuel-disputes/:id", deleteFuelDispute);

Deno.serve(app.fetch);
```
