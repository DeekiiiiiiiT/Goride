import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { STABLE_GET_CACHE } from "../_shared/cacheControl.ts";
import { registerGeoRoutes } from "./geoRoutes.ts";

const app = new Hono().basePath("/platform-catalog");

app.use("*", cors());

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key);
}

function fail(err: unknown, fallback: string) {
  const message = err instanceof Error
    ? err.message
    : err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : fallback;
  return Response.json({ error: message }, { status: 500 });
}

function cached(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": STABLE_GET_CACHE,
    },
  });
}

app.get("/health", () => cached({ service: "platform-catalog", status: "ok" }));

app.get("/stations", async () => {
  try {
    const sb = admin();
    const { data, error } = await sb.schema("places").from("public_station").select("id,name,brand,address,lat,lng,pcode,prices,price_updated_at,capabilities");
    if (error) throw error;
    return cached({ stations: data || [] });
  } catch (err) {
    return fail(err, "Could not load stations");
  }
});

app.get("/stations/:id", async (c) => {
  try {
    const sb = admin();
    const { data, error } = await sb.schema("places").from("public_station").select("id,name,brand,address,lat,lng,pcode,prices,price_updated_at,capabilities").eq("id", c.req.param("id")).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Station not found" }, { status: 404 });
    return cached({ station: data });
  } catch (err) {
    return fail(err, "Could not load station");
  }
});

app.get("/places", async (c) => {
  try {
    const sb = admin();
    let query = sb.schema("places").from("public_place").select("id,name,brand,kind,lat,lng,pcode,details");
    const kind = c.req.query("kind");
    const pcode = c.req.query("pcode");
    if (kind) query = query.eq("kind", kind);
    if (pcode) query = query.eq("pcode", pcode);
    const { data, error } = await query;
    if (error) throw error;
    return cached({ places: data || [] });
  } catch (err) {
    return fail(err, "Could not load places");
  }
});

app.get("/places/:id", async (c) => {
  try {
    const sb = admin();
    const { data, error } = await sb.schema("places").from("public_place").select("id,name,brand,kind,lat,lng,pcode,details").eq("id", c.req.param("id")).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Place not found" }, { status: 404 });
    return cached({ place: data });
  } catch (err) {
    return fail(err, "Could not load place");
  }
});

app.get("/geo/parishes", async (c) => {
  try {
    const sb = admin();
    let query = sb.schema("geo").from("boundaries").select("pcode,name,admin_level,parent_pcode").eq("status", "active").order("name");
    const level = c.req.query("level");
    if (level) query = query.eq("admin_level", Number(level));
    const parent = c.req.query("parent");
    if (parent) query = query.eq("parent_pcode", parent);
    const { data, error } = await query;
    if (error) throw error;
    return cached({ areas: data || [] });
  } catch (err) {
    return fail(err, "Could not load parishes");
  }
});

app.get("/tolls", async () => {
  try {
    const sb = admin();
    const { data, error } = await sb.from("fleet_toll_plazas").select("id,name,highway,payload_json");
    if (error) throw error;
    const plazas = (data || []).map((row) => {
      const payload = (row.payload_json || {}) as Record<string, unknown>;
      return { id: row.id, name: row.name, highway: row.highway, prices: payload.prices || payload.rates || null };
    });
    return cached({ plazas });
  } catch (err) {
    return fail(err, "Could not load tolls");
  }
});

app.get("/schedules", async (c) => {
  try {
    const variant = c.req.query("variant");
    if (!variant) return Response.json({ error: "Choose a vehicle first" }, { status: 400 });
    const sb = admin();
    const { data, error } = await sb.rpc("schedule_for_variant", {
      p_catalog_id: variant,
      p_vehicle_year: c.req.query("year") ? Number(c.req.query("year")) : null,
    });
    if (error) throw error;
    const rows = (data || []) as { template_scope?: string }[];
    const general = rows.length === 0 || rows.every((row) => row.template_scope === "global");
    return cached({ tasks: rows, generalSchedule: general });
  } catch (err) {
    return fail(err, "Could not load schedule");
  }
});

app.get("/parts", async (c) => {
  try {
    const variant = c.req.query("variant");
    if (!variant) return Response.json({ error: "Choose a vehicle first" }, { status: 400 });
    const sb = admin();
    const { data, error } = await sb.rpc("parts_for_vehicle", {
      p_catalog_id: variant,
      p_component_id: null,
      p_vehicle_year: c.req.query("year") ? Number(c.req.query("year")) : null,
    });
    if (error) throw error;
    const parts = data || [];
    return cached({ parts, comingSoon: parts.length === 0 });
  } catch (err) {
    return fail(err, "Could not load parts");
  }
});

app.get("/vehicle-catalog", async (c) => {
  try {
    const q = (c.req.query("q") || "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
    const sb = admin();
    let query = sb.from("vehicle_catalog").select("id,make,model,year,trim_series").order("make").limit(40);
    if (q) query = query.or(`make.ilike.%${q}%,model.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return cached({ vehicles: data || [] });
  } catch (err) {
    return fail(err, "Could not load catalog");
  }
});

registerGeoRoutes(app);

Deno.serve(app.fetch);
