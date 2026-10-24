/**
 * Geography API. Reads for any app server. Writes for the platform owner only.
 * Keep response fields in sync with packages/geo-ui/src/geoTypes.ts
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { STABLE_GET_CACHE } from "../_shared/cacheControl.ts";
import {
  canWriteWorldMaps,
  requireAnyProductAdmin,
  type ProductAdminUser,
} from "../_shared/productAdmin.ts";

function geoDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "geo" } },
  );
}

function deliveryDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function denyWrite(admin: ProductAdminUser): Response | null {
  if (canWriteWorldMaps(admin)) return null;
  return new Response(
    JSON.stringify({ error: "forbidden", message: "Permission required: platform.geo.write" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

async function callRush(path: string, body: unknown): Promise<Response> {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return await fetch(`${base}/functions/v1/delivery${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body ?? {}),
  });
}

export function registerGeoRoutes(app: Hono) {
  app.use("/geo/*", async (c, next) => {
    if (c.req.method === "GET" && c.req.path.endsWith("/geo/parishes")) {
      await next();
      return;
    }
    const result = await requireAnyProductAdmin(c);
    if (result instanceof Response) return result;
    c.set("geoUser", result);
    await next();
  });

  app.get("/geo/boundaries", async (c) => {
    const level = c.req.query("level");
    const parent = c.req.query("parent");
    let query = geoDb()
      .from("boundaries")
      .select("pcode, admin_level, parent_pcode, name, slug, status, center_lat, center_lng, current_version_id")
      .order("name", { ascending: true })
      .limit(2000);
    if (level != null && level !== "") query = query.eq("admin_level", Number(level));
    if (parent) query = query.eq("parent_pcode", parent);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    c.header("Cache-Control", STABLE_GET_CACHE);
    return c.json({ boundaries: data ?? [] });
  });

  app.get("/geo/boundaries/:pcode/versions/:id/shape", async (c) => {
    const { data, error } = await geoDb().rpc("version_shape", {
      p_pcode: c.req.param("pcode"),
      p_version_id: c.req.param("id"),
    });
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Version not found" }, 404);
    return c.json({ shape: data });
  });

  app.get("/geo/boundaries/:pcode/versions", async (c) => {
    const { data, error } = await geoDb()
      .from("boundary_versions")
      .select("id, pcode, version, source, source_version, valid_on, notes, status, created_at")
      .eq("pcode", c.req.param("pcode"))
      .order("version", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ versions: data ?? [] });
  });

  app.get("/geo/boundaries/:pcode", async (c) => {
    const pcode = c.req.param("pcode");
    const version = c.req.query("version");
    const { data: place, error } = await geoDb()
      .from("boundaries")
      .select("*")
      .eq("pcode", pcode)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!place) return c.json({ error: "Place not found" }, 404);
    let versionQuery = geoDb().from("boundary_versions").select("id, version, source, source_version, valid_on, notes, status, area_sqkm").eq("pcode", pcode);
    if (version) versionQuery = versionQuery.eq("version", Number(version));
    else if (place.current_version_id) versionQuery = versionQuery.eq("id", place.current_version_id);
    const { data: ver } = await versionQuery.limit(1).maybeSingle();
    const { data: usedParishes } = await deliveryDb().from("service_parishes").select("id").eq("pcode", pcode);
    const { data: usedMarkets } = await deliveryDb().from("service_markets").select("id, is_active").eq("pcode", pcode);
    return c.json({
      place,
      version: ver,
      used_by: {
        rush_parishes: usedParishes?.length ?? 0,
        rush_markets: usedMarkets?.length ?? 0,
        rush_live_markets: (usedMarkets ?? []).filter((m) => m.is_active).length,
      },
    });
  });

  app.get("/geo/shapes", async (c) => {
    const levels = (c.req.query("levels") || "1")
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n));
    const { data, error } = await geoDb().rpc("list_shapes", { p_levels: levels });
    if (error) return c.json({ error: error.message }, 500);
    c.header("Cache-Control", STABLE_GET_CACHE);
    return c.json({ shapes: data ?? [] });
  });

  app.get("/geo/changes", async (c) => {
    const since = c.req.query("since");
    let query = geoDb()
      .from("publish_log")
      .select("id, pcode, version_id, status, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .limit(200);
    if (since) query = query.gt("created_at", since);
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ changes: data ?? [] });
  });

  app.get("/geo/quality", async (c) => {
    const { data, error } = await geoDb().from("quality_issues").select("*").limit(200);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ issues: data ?? [] });
  });

  app.get("/geo/places", async (c) => {
    const { data, error } = await geoDb()
      .from("places")
      .select("id, kind, name, lat, lng, pcode, source, status")
      .order("name")
      .limit(500);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ places: data ?? [] });
  });

  app.get("/geo/fare-tree", async (c) => {
    const { data, error } = await geoDb().rpc("fare_tree");
    if (error) return c.json({ error: error.message }, 500);
    c.header("Cache-Control", STABLE_GET_CACHE);
    return c.json({ counties: data ?? [] });
  });

  app.get("/geo/imports", async (c) => {
    const { data, error } = await geoDb()
      .from("import_runs")
      .select("id, kind, file_name, counts, dry_run, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ runs: data ?? [] });
  });

  app.post("/geo/import", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const saveDrafts = body.save_drafts === true;
    const dryRun = !saveDrafts && body.dry_run !== false;
    const features = Array.isArray(body.features) ? body.features : [];
    const db = geoDb();
    let matched = 0;
    let unknown = 0;
    let broken = 0;
    let draftsSaved = 0;
    const errors: string[] = [];
    const pending: Array<{ pcode: string; geometry: unknown; name: string }> = [];
    for (const feature of features) {
      const pcode = String(feature?.pcode ?? feature?.properties?.pcode ?? feature?.properties?.PCODE ?? "").trim();
      const geometry = feature?.geometry ?? feature?.geojson ?? null;
      if (!pcode) {
        broken += 1;
        errors.push("missing pcode");
        continue;
      }
      const { data: existing } = await db.from("boundaries").select("pcode").eq("pcode", pcode).maybeSingle();
      if (!existing) {
        unknown += 1;
        errors.push(`${pcode}: unknown place`);
        continue;
      }
      matched += 1;
      if (saveDrafts) pending.push({ pcode, geometry, name: String(feature?.name ?? feature?.properties?.name ?? pcode) });
    }
    if (!dryRun && !saveDrafts) {
      return c.json({
        error: "geometry_required",
        message: "Check the file, or save drafts from geometry. Import does not publish.",
      }, 400);
    }
    if (saveDrafts) {
      const missingGeometry = pending.filter((row) => !row.geometry);
      if (missingGeometry.length === pending.length && pending.length > 0) {
        return c.json({
          error: "geometry_required",
          message: "Saving drafts needs a geometry on each place. Nothing was written.",
        }, 400);
      }
      for (const row of pending) {
        if (!row.geometry) {
          broken += 1;
          errors.push(`${row.pcode}: no geometry`);
          continue;
        }
        const { error } = await db.rpc("save_draft_border", {
          p_pcode: row.pcode,
          p_geojson: row.geometry,
          p_notes: `Draft from ${body.file_name ?? "import"}`,
          p_actor: admin.id,
        });
        if (error) {
          broken += 1;
          errors.push(`${row.pcode}: ${error.message}`);
        } else {
          draftsSaved += 1;
        }
      }
    }
    const report = {
      matched,
      unknown,
      broken,
      drafts_saved: draftsSaved,
      dry_run: dryRun,
      errors,
    };
    await db.from("import_runs").insert({
      kind: "boundaries",
      file_name: body.file_name ?? null,
      counts: report,
      errors,
      dry_run: dryRun,
      created_by: admin.id,
    });
    return c.json({ report });
  });

  app.post("/geo/boundaries/:pcode/versions", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const pcode = c.req.param("pcode");
    const body = await c.req.json().catch(() => ({}));
    if (!body.geojson) return c.json({ error: "geojson is required" }, 400);
    const { data, error } = await geoDb().rpc("save_draft_border", {
      p_pcode: pcode,
      p_geojson: body.geojson,
      p_notes: body.notes ?? "Drawn in World Maps",
      p_actor: admin.id,
    });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ version_id: data });
  });

  app.post("/geo/boundaries/:pcode/versions/:id/impact", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const res = await callRush("/internal/geo/impact", {
      pcode: c.req.param("pcode"),
      version_id: c.req.param("id"),
    });
    const text = await res.text();
    return new Response(text || "{}", { status: res.status, headers: { "Content-Type": "application/json" } });
  });

  app.post("/geo/boundaries/:pcode/versions/:id/publish", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const res = await callRush("/internal/geo/apply", {
      pcode: c.req.param("pcode"),
      version_id: c.req.param("id"),
      confirm_name: body.confirm_name ?? null,
      actor_id: admin.id,
    });
    const text = await res.text();
    return new Response(text || "{}", { status: res.status, headers: { "Content-Type": "application/json" } });
  });

  app.put("/geo/places/:id", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (body.name != null) updates.name = String(body.name);
    if (body.lat != null) updates.lat = Number(body.lat);
    if (body.lng != null) updates.lng = Number(body.lng);
    if (body.status === "active" || body.status === "retired") updates.status = body.status;
    const { data, error } = await geoDb()
      .from("places")
      .update(updates)
      .eq("id", c.req.param("id"))
      .select("id, name, lat, lng, status")
      .single();
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ place: data });
  });
}
