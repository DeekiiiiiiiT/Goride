import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PRIVATE_LIST_CACHE, STABLE_GET_CACHE } from "../_shared/cacheControl.ts";
import { registerGeoRoutes } from "./geoRoutes.ts";
import { assertRateLimit } from "../_shared/rateLimit.ts";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";

const app = new Hono().basePath("/platform-catalog");

app.use("*", cors());

const CATALOG_APPS = new Set(["plug", "fleet", "driver", "rides", "rush", "haul", "enterprise"]);

app.use("*", async (c, next) => {
  if (c.req.method !== "GET" || c.req.path.includes("/admin/")) return next();
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "public";
  const limited = await assertRateLimit(c, `catalog:${ip}`, { max: 120, windowMs: 60_000 });
  if (limited) return limited;
  await next();
  const status = c.res?.status ?? 200;
  if (status >= 400) return;
  const appKey = (c.req.header("x-roam-app") || "").trim().toLowerCase();
  if (!CATALOG_APPS.has(appKey)) return;
  try {
    await admin()
      .schema("fleet")
      .from("catalog_consumers")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("app_key", appKey);
  } catch {
    /* A missed stamp must not fail the catalog read. */
  }
});

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

async function listStations(c: { req: { query: (name: string) => string | undefined } }) {
  try {
    const sb = admin();
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
    const { data, error } = await sb
      .schema("places")
      .from("public_station")
      .select("id,name,brand,address,lat,lng,pcode,prices,price_updated_at,capabilities")
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return cached({ stations: data || [], limit, offset });
  } catch (err) {
    return fail(err, "Could not load stations");
  }
}

app.get("/stations", listStations);
// Plug reads /v1/stations. This alias has to ship with the function or the map comes back empty.
app.get("/v1/stations", listStations);

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

const CATALOG_COLUMNS = "id,make,model,trim_series,catalog_trim,chassis_code,engine_code,production_start_year,production_end_year";

app.get("/vehicle-catalog", async (c) => {
  try {
    const sb = admin();
    const id = (c.req.query("id") || "").trim();
    if (id) {
      const { data, error } = await sb.from("vehicle_catalog").select(CATALOG_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      return cached({ vehicles: data ? [data] : [] });
    }
    const q = (c.req.query("q") || "").replace(/[^a-zA-Z0-9 ]/g, "").trim();
    let query = sb.from("vehicle_catalog").select(CATALOG_COLUMNS).order("make").limit(40);
    if (q) query = query.or(`make.ilike.%${q}%,model.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return cached({ vehicles: data || [] });
  } catch (err) {
    return fail(err, "Could not load catalog");
  }
});

registerGeoRoutes(app);

app.get("/v1/changes", async (c) => {
  try {
    const since = c.req.query("since");
    let query = admin()
      .schema("fleet")
      .from("master_change_log")
      .select("id,dataset,record_id,action,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (since) query = query.gt("created_at", since);
    const { data, error } = await query;
    if (error) throw error;
    return cached({ changes: data || [] });
  } catch (err) {
    return fail(err, "Could not load changes");
  }
});

app.get("/admin/changes", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { data, error } = await admin()
      .schema("fleet")
      .from("master_change_log")
      .select("id,dataset,record_id,action,actor,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    return new Response(JSON.stringify({ changes: data || [] }), {
      headers: { "Content-Type": "application/json", "Cache-Control": PRIVATE_LIST_CACHE },
    });
  } catch (err) {
    return fail(err, "Could not load changes");
  }
});

app.get("/admin/consumers", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { data, error } = await admin()
      .schema("fleet")
      .from("catalog_consumers")
      .select("app_key,name,site,admin_url,datasets,last_sync_at,last_error")
      .order("name");
    if (error) throw error;
    return cached({ consumers: data || [] });
  } catch (err) {
    return fail(err, "Could not load apps");
  }
});

app.get("/admin/quality", async (c) => {
  const auth = await requirePlatformAdmin(c);
  if (auth instanceof Response) return auth;
  try {
    const { data, error } = await admin()
      .schema("fleet")
      .from("dataset_quality")
      .select("dataset,score,failing,checked_at,note");
    if (error) throw error;
    return cached({ scores: data || [] });
  } catch (err) {
    return fail(err, "Could not load quality");
  }
});

app.all("/v1/*", async (c) => {
  const url = new URL(c.req.url);
  const marker = "/platform-catalog/v1/";
  const at = url.pathname.indexOf(marker);
  if (at < 0) return Response.json({ error: "Not found" }, { status: 404 });
  url.pathname = `${url.pathname.slice(0, at)}/platform-catalog/${url.pathname.slice(at + marker.length)}`;
  return app.fetch(new Request(url, c.req.raw));
});

Deno.serve(app.fetch);
