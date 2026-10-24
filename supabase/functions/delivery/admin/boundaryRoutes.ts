/**
 * Rush reads Dominion's place list. Borders are not edited here.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";
import { marketSlugFromBoundary } from "./marketSlug.ts";
import { geographyManagedResponse } from "./geoManaged.ts";

function geoDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "geo" } },
  );
}

export function attachBoundaryAdminRoutes(admin: Hono) {
  // Mounted on the markets admin Hono BEFORE /:id catch-alls (OPEN route clash fix).

  admin.get("/boundaries", async (c) => {
    const level = c.req.query("admin_level");
    const parent = c.req.query("parent_pcode");
    const q = (c.req.query("q") ?? "").trim().toLowerCase();

    let query = geoDb()
      .from("boundaries")
      .select("admin_level, pcode, parent_pcode, name, slug, center_lat, center_lng")
      .eq("status", "active")
      .order("admin_level", { ascending: true })
      .order("name", { ascending: true })
      .limit(2000);

    if (level != null && level !== "") query = query.eq("admin_level", Number(level));
    if (parent) query = query.eq("parent_pcode", parent);

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    let rows = data ?? [];
    if (q) {
      rows = rows.filter(
        (r) =>
          String(r.name).toLowerCase().includes(q) ||
          String(r.pcode).toLowerCase().includes(q) ||
          String(r.slug).toLowerCase().includes(q),
      );
    }
    return c.json({ boundaries: rows, count: rows.length });
  });

  admin.get("/overview-shapes", async (c) => {
    const db = getDb();
    // Communities are ~2.8MB and off by default. Fetch them only when asked.
    if (c.req.query("communities") === "only") {
      const communitiesRes = await db.rpc("overview_community_shapes");
      const communities =
        communitiesRes.error || !Array.isArray(communitiesRes.data) ? [] : communitiesRes.data;
      return c.json({ communities });
    }
    const [townsRes, parishesRes] = await Promise.all([
      db.rpc("overview_town_shapes"),
      db.rpc("overview_parish_shapes"),
    ]);
    if (townsRes.error) return c.json({ error: townsRes.error.message }, 500);
    const towns = Array.isArray(townsRes.data) ? townsRes.data : [];
    const parishes = parishesRes.error || !Array.isArray(parishesRes.data) ? [] : parishesRes.data;
    return c.json({ towns, parishes });
  });

  admin.get("/coverage-health", async (c) => {
    const db = getDb();
    const { data, error } = await db.from("coverage_health_summary").select("*");
    if (error) return c.json({ error: error.message }, 500);
    const { data: boundaryCount } = await db.rpc("geo_catalog_boundary_count");
    const driftRes = await db.rpc("legacy_jsonb_zone_drift");
    return c.json({
      parishes: data ?? [],
      catalog_boundary_count: boundaryCount ?? 0,
      legacy_jsonb_drift: driftRes.error || !Array.isArray(driftRes.data) ? [] : driftRes.data,
    });
  });

  admin.post("/boundaries/import", (c) => {
    return geographyManagedResponse();
  });

  admin.post("/parishes/:parishId/promote-boundary", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const pcode = String(body.pcode ?? "").trim();
    if (!pcode) return c.json({ error: "pcode required" }, 400);

    const db = getDb();
    const parishId = c.req.param("parishId");
    const { data: before } = await db.from("service_parishes").select("id").eq("id", parishId).maybeSingle();
    if (!before) return c.json({ error: "Parish not found" }, 404);

    // Snapshot lives inside promote_boundary_to_parish (OPEN-3) — single code path
    const { error } = await db.rpc("promote_boundary_to_parish", {
      p_parish_id: parishId,
      p_pcode: pcode,
    });
    if (error) return c.json({ error: error.message }, 500);

    const { data: parish } = await db.from("service_parishes").select("*").eq("id", parishId).single();
    await writeKvAudit(adminUser, "roam_dash.parish_boundary_promoted", parishId, pcode, JSON.stringify({ pcode }));
    return c.json({ parish });
  });

  admin.post("/markets/:marketId/promote-boundary", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const pcode = String(body.pcode ?? "").trim();
    if (!pcode) return c.json({ error: "pcode required" }, 400);

    const db = getDb();
    const marketId = c.req.param("marketId");
    const { data: market } = await db.from("service_markets").select("id").eq("id", marketId).maybeSingle();
    if (!market) return c.json({ error: "Market not found" }, 404);

    const { data, error } = await db.rpc("promote_boundary_to_market_zone", {
      p_market_id: marketId,
      p_pcode: pcode,
      p_zone_name: body.name ?? null,
    });
    if (error) return c.json({ error: error.message }, 500);

    await writeKvAudit(
      adminUser,
      "roam_dash.market_boundary_promoted",
      marketId,
      pcode,
      JSON.stringify(data),
    );
    return c.json({ ok: true, result: data });
  });

  admin.post("/markets/:marketId/union-communities", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const pcodes = Array.isArray(body.pcodes) ? body.pcodes.map(String) : [];
    if (pcodes.length === 0) return c.json({ error: "pcodes required" }, 400);

    const { data, error } = await getDb().rpc("union_admin3_to_market_zone", {
      p_market_id: c.req.param("marketId"),
      p_pcodes: pcodes,
      p_zone_name: body.name ?? "Community union",
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ zone_id: data });
  });

  admin.post("/parishes/:parishId/towns-from-boundary", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const pcode = String(body.pcode ?? "").trim();
    if (!pcode) return c.json({ error: "pcode required" }, 400);

    const db = getDb();
    const parishId = c.req.param("parishId");
    const { data: parish } = await db.from("service_parishes").select("*").eq("id", parishId).maybeSingle();
    if (!parish) return c.json({ error: "Parish not found" }, 404);

    const { data: rows, error: boundaryError } = await geoDb().rpc("current_boundary", {
      p_pcode: pcode,
      p_level: 2,
    });
    if (boundaryError) return c.json({ error: boundaryError.message }, 500);
    const boundary = (Array.isArray(rows) ? rows[0] : rows) as {
      parent_pcode?: string | null;
      slug?: string | null;
    } | null;
    if (!boundary) return c.json({ error: "admin2 boundary not found" }, 404);
    if (parish.pcode && boundary.parent_pcode && boundary.parent_pcode !== parish.pcode) {
      return c.json({
        error: `Boundary parent ${boundary.parent_pcode} does not match parish pcode ${parish.pcode}`,
      }, 400);
    }

    const parishSlug = String(parish.slug ?? "").trim();
    const boundarySlug = String(boundary.slug ?? "").trim();
    const slug = marketSlugFromBoundary(boundarySlug, parishSlug);
    if (!slug) {
      return c.json({ error: "Parish and town need a web name before this town can be created" }, 400);
    }

    const { data: created, error } = await db.rpc("create_inactive_town_from_boundary", {
      p_parish_id: parishId,
      p_pcode: pcode,
      p_slug: slug,
    });
    if (error) {
      const msg = [error.message, error.details, error.hint].filter(Boolean).join(" ");
      const townExists = msg.match(/TOWN_EXISTS:([0-9a-f-]{36})/i);
      if (townExists || msg.includes("TOWN_EXISTS")) {
        return c.json(
          { error: "Town already exists for this pcode", market_id: townExists?.[1] ?? null },
          409,
        );
      }
      if (msg.includes("SLUG_EXISTS")) {
        const taken = msg.split("SLUG_EXISTS:")[1]?.trim().split(/\s/)[0] || slug;
        return c.json({ error: `Town web name already exists: ${taken}` }, 409);
      }
      if (msg.includes("PARENT_MISMATCH")) {
        return c.json({ error: msg.replace(/^.*PARENT_MISMATCH:/, "Boundary parent ") }, 400);
      }
      if (msg.includes("PARISH_NOT_FOUND")) return c.json({ error: "Parish not found" }, 404);
      if (msg.includes("BOUNDARY_NOT_FOUND")) return c.json({ error: "admin2 boundary not found" }, 404);
      return c.json({ error: error.message }, 500);
    }

    let raw: unknown = created;
    if (typeof created === "string") {
      try {
        raw = JSON.parse(created);
      } catch {
        raw = null;
      }
    }
    const payload = (raw ?? {}) as { market?: Record<string, unknown>; zone?: unknown };
    const market = payload.market;
    if (!market?.id) return c.json({ error: "Town was not created" }, 500);

    await writeKvAudit(
      adminUser,
      "roam_dash.town_from_boundary",
      String(market.id),
      pcode,
      JSON.stringify({ zone: payload.zone, slug }),
    );
    return c.json({ market, zone: payload.zone });
  });

  admin.get("/parishes/:parishId/outline-versions", async (c) => {
    const { data, error } = await getDb()
      .from("parish_outline_versions")
      .select(
        "id, parish_id, version, label, notes, foundation_boundary_pcode, boundary_source, created_at, created_by",
      )
      .eq("parish_id", c.req.param("parishId"))
      .order("version", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ versions: data ?? [] });
  });

  admin.post("/parishes/:parishId/outline-versions/:versionId/restore", async (c) => {
    return geographyManagedResponse();
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const db = getDb();
    const parishId = c.req.param("parishId");
    const { data: ver, error } = await db
      .from("parish_outline_versions")
      .select("*")
      .eq("id", c.req.param("versionId"))
      .eq("parish_id", parishId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!ver) return c.json({ error: "Version not found" }, 404);

    const { data: parish, error: updErr } = await db
      .from("service_parishes")
      .update({
        foundation_polygon: ver.foundation_polygon,
        foundation_geom: ver.foundation_geom,
        foundation_boundary_pcode: ver.foundation_boundary_pcode,
        boundary_source: ver.boundary_source,
        foundation_updated_at: new Date().toISOString(),
      })
      .eq("id", parishId)
      .select()
      .single();
    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ parish });
  });
}

/** @deprecated Prefer attachBoundaryAdminRoutes on the markets admin Hono (avoids /:id clash). */
export function registerBoundaryAdminRoutes(app: Hono) {
  const admin = new Hono();
  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });
  attachBoundaryAdminRoutes(admin);
  app.route("/admin/markets", admin);
}
