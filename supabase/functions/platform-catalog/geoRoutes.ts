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
import { draftDiscardStatus, outsideJamaica } from "./geoGuards.ts";

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
    JSON.stringify({ error: "forbidden", message: "Permission required: maps.publish" }),
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
    if (c.req.query("with") === "metrics") {
      const { data, error } = await geoDb().rpc("list_boundaries_admin", {
        p_level: level != null && level !== "" ? Number(level) : null,
        p_parent: parent || null,
      });
      if (error) return c.json({ error: error.message }, 500);
      c.header("Cache-Control", STABLE_GET_CACHE);
      return c.json({ boundaries: data ?? [] });
    }
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
      .select("id, pcode, version, source, source_version, valid_on, notes, status, created_at, checks")
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
    const placesDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "places" } },
    );
    const [{ count: placeCount }, { count: pinCount }, { data: children }, { data: metrics }, { count: older }] = await Promise.all([
      placesDb.from("place").select("id", { count: "exact", head: true }).like("pcode", `${pcode}%`),
      geoDb().from("places").select("id", { count: "exact", head: true }).like("pcode", `${pcode}%`),
      geoDb().from("boundaries").select("pcode, name, admin_level").eq("parent_pcode", pcode).eq("status", "active").order("name").limit(200),
      geoDb().rpc("boundary_metrics", { p_pcode: pcode }),
      geoDb().from("boundary_versions").select("id", { count: "exact", head: true }).eq("pcode", pcode).neq("status", "published"),
    ]);
    const path: Array<{ pcode: string; name: string; admin_level: number }> = [];
    let cursor: string | null = pcode;
    for (let step = 0; step < 6 && cursor; step++) {
      const { data: node } = await geoDb()
        .from("boundaries")
        .select("pcode, name, admin_level, parent_pcode")
        .eq("pcode", cursor)
        .maybeSingle();
      if (!node) break;
      path.unshift({ pcode: node.pcode, name: node.name, admin_level: node.admin_level });
      cursor = node.parent_pcode;
    }
    const childRows = children ?? [];
    const childrenByLevel: Record<string, number> = {};
    for (const child of childRows) {
      const key = String(child.admin_level);
      childrenByLevel[key] = (childrenByLevel[key] ?? 0) + 1;
    }
    return c.json({
      place,
      version: ver,
      metrics: metrics ?? null,
      path,
      children: childRows,
      children_by_level: childrenByLevel,
      older_versions: older ?? 0,
      used_by: {
        rush_parishes: usedParishes?.length ?? 0,
        rush_markets: usedMarkets?.length ?? 0,
        rush_live_markets: (usedMarkets ?? []).filter((m) => m.is_active).length,
        places: placeCount ?? 0,
        pins: pinCount ?? 0,
      },
    });
  });

  app.get("/geo/summary", async (c) => {
    const { data, error } = await geoDb().rpc("map_summary");
    if (error) return c.json({ error: error.message }, 500);
    c.header("Cache-Control", STABLE_GET_CACHE);
    return c.json(data ?? {});
  });

  app.get("/geo/search", async (c) => {
    const q = (c.req.query("q") || "").trim();
    if (q.length < 2) return c.json({ results: [] });
    const { data, error } = await geoDb().rpc("search_areas", { p_query: q });
    if (error) return c.json({ error: error.message }, 500);
    c.header("Cache-Control", STABLE_GET_CACHE);
    return c.json({ results: data ?? [] });
  });

  app.get("/geo/shapes", async (c) => {
    const levels = (c.req.query("levels") || "1")
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n));
    const toleranceRaw = c.req.query("tolerance");
    const bbox = (c.req.query("bbox") || "")
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n));
    const args: Record<string, unknown> = { p_levels: levels };
    if (toleranceRaw != null && toleranceRaw !== "" && Number.isFinite(Number(toleranceRaw))) {
      args.p_tolerance = Number(toleranceRaw);
    }
    if (bbox.length === 4) args.p_bbox = bbox;
    const { data, error } = await geoDb().rpc("list_shapes", args);
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
    const { data, error } = await geoDb().from("quality_issues_mv").select("*").limit(2000);
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
      .select("id, kind, file_name, counts, errors, dry_run, file_hash, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ runs: data ?? [] });
  });

  app.get("/geo/imports/:id", async (c) => {
    const { data, error } = await geoDb()
      .from("import_runs")
      .select("id, kind, file_name, counts, errors, report, dry_run, file_hash, created_at")
      .eq("id", c.req.param("id"))
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Import not found" }, 404);
    return c.json({ run: data });
  });

  app.post("/geo/import", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const features = Array.isArray(body.features) ? body.features : [];
    const db = geoDb();
    const { data: checked, error: checkError } = await db.rpc("check_import", { p_features: features });
    if (checkError) return c.json({ error: checkError.message }, 500);
    const rows = Array.isArray(checked) ? checked : [];
    let matched = 0;
    let unknown = 0;
    let broken = 0;
    const errors: string[] = [];
    for (const row of rows) {
      if (!row.matched) {
        unknown += 1;
        errors.push(`${row.pcode || "row"}: unknown place`);
        continue;
      }
      matched += 1;
      if (!row.valid) {
        broken += 1;
        errors.push(`${row.pcode}: This file has no area shape.`);
      }
    }
    const counts = { matched, unknown, broken, drafts_saved: 0, dry_run: true };
    const { data: inserted, error } = await db.from("import_runs").insert({
      kind: "boundaries",
      file_name: body.file_name ?? null,
      counts,
      errors,
      report: rows,
      features,
      file_hash: body.file_hash ?? null,
      dry_run: true,
      created_by: admin.id,
    }).select("id").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ report: counts, run_id: inserted?.id, rows });
  });

  app.post("/geo/imports/:id/drafts", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const { data, error } = await geoDb().rpc("save_import_drafts", {
      p_run_id: c.req.param("id"),
      p_actor: admin.id,
    });
    if (error) {
      const status = /broken|not_found/i.test(error.message) ? 400 : 500;
      return c.json({ error: error.message }, status);
    }
    return c.json({ saved: data ?? [] });
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

  app.delete("/geo/boundaries/:pcode/versions/:id", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const { error } = await geoDb().rpc("discard_draft_border", {
      p_pcode: c.req.param("pcode"),
      p_version_id: c.req.param("id"),
    });
    if (error) {
      const status = draftDiscardStatus(error.message);
      return c.json({ error: error.message, message: error.message.includes("not_a_draft") ? "Only a draft can be discarded." : error.message }, status);
    }
    return c.json({ ok: true });
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

  app.post("/geo/places", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required", message: "A reason is required." }, 400);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (outsideJamaica(lat, lng)) {
      return c.json({ error: "outside_jamaica", message: "That point is outside Jamaica." }, 400);
    }
    const kind = ["town_centre", "landmark", "junction"].includes(body.kind) ? body.kind : "landmark";
    const { data, error } = await geoDb()
      .from("places")
      .insert({ name: String(body.name || "Pin"), kind, lat, lng, source: "manual", status: "active" })
      .select("id, kind, name, lat, lng, pcode, source, status")
      .single();
    if (error) return c.json({ error: error.message, message: error.message }, 400);
    await geoDb().from("pin_change").insert({
      pin_id: data.id,
      before: {},
      after: data,
      actor_id: admin.id,
      reason,
    });
    return c.json({ place: data });
  });

  app.put("/geo/places/:id", async (c) => {
    const admin = c.get("geoUser") as ProductAdminUser;
    const denied = denyWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason ?? "").trim();
    if (!reason) return c.json({ error: "reason_required", message: "A reason is required." }, 400);
    const id = c.req.param("id");
    const { data: before, error: loadError } = await geoDb().from("places").select("*").eq("id", id).maybeSingle();
    if (loadError) return c.json({ error: loadError.message }, 500);
    if (!before) return c.json({ error: "Pin not found" }, 404);
    const updates: Record<string, unknown> = {};
    if (body.name != null) updates.name = String(body.name);
    if (body.kind === "town_centre" || body.kind === "landmark" || body.kind === "junction") updates.kind = body.kind;
    if (body.lat != null) updates.lat = Number(body.lat);
    if (body.lng != null) updates.lng = Number(body.lng);
    if (body.status === "active" || body.status === "retired") updates.status = body.status;
    const lat = Number(updates.lat ?? before.lat);
    const lng = Number(updates.lng ?? before.lng);
    if (outsideJamaica(lat, lng)) {
      return c.json({ error: "outside_jamaica", message: "That point is outside Jamaica." }, 400);
    }
    const { data, error } = await geoDb()
      .from("places")
      .update(updates)
      .eq("id", id)
      .select("id, kind, name, lat, lng, pcode, source, status")
      .single();
    if (error) return c.json({ error: error.message, message: error.message }, 400);
    await geoDb().from("pin_change").insert({
      pin_id: id,
      before,
      after: data,
      actor_id: admin.id,
      reason,
    });
    return c.json({ place: data });
  });
}
