/**
 * Rush Ops admin — service markets, coverage zone polygons, and waitlist review.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashDelete, requireDashWrite } from "./dashPermissions.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";
import {
  evaluateCoverage,
  type CoverageVertex,
  type CoverageZone,
} from "./coverageEval.ts";
import {
  deliveryAreaName,
  resolveTownOutline,
  type OutlineVertex,
} from "./townOutlines.ts";

type Vertex = CoverageVertex;

function hasValidInclude(zones: unknown[]): boolean {
  return zones.some((z) => {
    const row = z as Record<string, unknown>;
    const kind = normalizeKind(row.kind);
    const poly = row.polygon;
    return kind === "include" && Array.isArray(poly) && poly.length >= 3;
  });
}

async function resolveParishSlug(
  db: ReturnType<typeof getDb>,
  parishId: string | null,
): Promise<string | null> {
  if (!parishId) return null;
  const { data } = await db.from("service_parishes").select("slug").eq("id", parishId).maybeSingle();
  return data?.slug != null ? String(data.slug) : null;
}

async function insertAutoDeliveryArea(
  db: ReturnType<typeof getDb>,
  market: { id: string; name: string; slug: string; parish_id?: string | null },
): Promise<Record<string, unknown> | null> {
  const parishSlug = await resolveParishSlug(
    db,
    market.parish_id != null ? String(market.parish_id) : null,
  );
  const polygon: OutlineVertex[] = resolveTownOutline({
    townSlug: String(market.slug),
    parishSlug,
  });
  const { data, error } = await db.from("service_zone_polygons").insert({
    market_id: market.id,
    name: deliveryAreaName(String(market.name)),
    polygon,
    kind: "include",
    priority: 10,
  }).select().single();
  if (error) {
    console.error("auto delivery area insert failed", error.message);
    return null;
  }
  return data as Record<string, unknown>;
}

/** Validate/normalize a polygon payload into an array of {lat,lng} vertices. */
function normalizePolygon(input: unknown): Vertex[] | null {
  if (!Array.isArray(input)) return null;
  const vertices: Vertex[] = [];
  for (const raw of input) {
    const p = raw as Record<string, unknown>;
    const lat = Number(p?.lat);
    const lng = Number(p?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    vertices.push({ lat, lng });
  }
  if (vertices.length < 3) return null;
  return vertices;
}

function normalizeKind(input: unknown): "include" | "exclude" {
  return String(input || "include").toLowerCase() === "exclude" ? "exclude" : "include";
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function asCoverageZones(rows: Record<string, unknown>[]): CoverageZone[] {
  return rows.map((z) => ({
    id: String(z.id),
    name: String(z.name ?? ""),
    market_id: z.market_id != null ? String(z.market_id) : undefined,
    kind: normalizeKind(z.kind),
    polygon: Array.isArray(z.polygon) ? (z.polygon as Vertex[]) : [],
  }));
}

export function registerMarketAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  // List markets with their zones + parish grouping.
  admin.get("/", async (c) => {
    const db = getDb();
    const { data: parishes, error: pErr } = await db
      .from("service_parishes")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (pErr) return c.json({ error: pErr.message }, 500);

    const { data: markets, error } = await db
      .from("service_markets")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);

    const marketIds = (markets ?? []).map((m) => String((m as Record<string, unknown>).id));
    let zonesByMarket = new Map<string, unknown[]>();
    if (marketIds.length > 0) {
      const { data: zones } = await db
        .from("service_zone_polygons")
        .select("*")
        .in("market_id", marketIds)
        .order("priority", { ascending: false });
      zonesByMarket = (zones ?? []).reduce((acc, z) => {
        const key = String((z as Record<string, unknown>).market_id);
        const list = acc.get(key) ?? [];
        list.push(z);
        acc.set(key, list);
        return acc;
      }, new Map<string, unknown[]>());
    }

    const enrichedMarkets = [];
    for (const m of markets ?? []) {
      const market = m as Record<string, unknown>;
      const id = String(market.id);
      let zones = zonesByMarket.get(id) ?? [];
      if (!hasValidInclude(zones)) {
        const inserted = await insertAutoDeliveryArea(db, {
          id,
          name: String(market.name ?? ""),
          slug: String(market.slug ?? ""),
          parish_id: market.parish_id != null ? String(market.parish_id) : null,
        });
        if (inserted) {
          zones = [inserted, ...zones];
          zonesByMarket.set(id, zones);
        }
      }
      enrichedMarkets.push({ ...market, zones });
    }

    const townsByParish = new Map<string, typeof enrichedMarkets>();
    const unassigned: typeof enrichedMarkets = [];
    for (const m of enrichedMarkets) {
      const parishId = (m as Record<string, unknown>).parish_id;
      if (parishId == null || parishId === "") {
        unassigned.push(m);
        continue;
      }
      const key = String(parishId);
      const list = townsByParish.get(key) ?? [];
      list.push(m);
      townsByParish.set(key, list);
    }

    return c.json({
      markets: enrichedMarkets,
      parishes: (parishes ?? []).map((p) => ({
        ...p,
        towns: townsByParish.get(String((p as Record<string, unknown>).id)) ?? [],
      })),
      unassigned,
    });
  });

  // ---- Parishes (before /:id) ----
  admin.get("/parishes", async (c) => {
    const db = getDb();
    const { data, error } = await db
      .from("service_parishes")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ parishes: data ?? [] });
  });

  admin.post("/parishes", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const slug = String(body.slug || slugify(name)).trim();
    if (!slug) return c.json({ error: "slug is required" }, 400);
    const sortOrder = Number.isFinite(Number(body.sort_order))
      ? Math.trunc(Number(body.sort_order))
      : 999;

    const db = getDb();
    const { data, error } = await db.from("service_parishes").insert({
      name,
      slug,
      sort_order: sortOrder,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.parish_created", String(data.id), "", `Parish ${name}`);
    return c.json({ parish: data }, 201);
  });

  admin.patch("/parishes/:parishId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (body.name != null) updates.name = String(body.name).trim();
    if (body.slug != null) updates.slug = slugify(String(body.slug));
    if (body.sort_order != null && Number.isFinite(Number(body.sort_order))) {
      updates.sort_order = Math.trunc(Number(body.sort_order));
    }
    if (Object.keys(updates).length === 0) return c.json({ error: "No fields to update" }, 400);

    const db = getDb();
    const { data, error } = await db.from("service_parishes")
      .update(updates)
      .eq("id", c.req.param("parishId"))
      .select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.parish_updated", c.req.param("parishId"), "", JSON.stringify(updates));
    return c.json({ parish: data });
  });

  admin.delete("/parishes/:parishId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashDelete(adminUser);
    if (denied) return denied;
    const db = getDb();
    // Towns become unassigned via ON DELETE SET NULL
    const { error } = await db.from("service_parishes").delete().eq("id", c.req.param("parishId"));
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.parish_deleted", c.req.param("parishId"), "", "Parish removed");
    return c.json({ ok: true });
  });

  // Must register before /:id so "check-point" is not treated as a market id.
  admin.post("/check-point", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return c.json({ error: "lat and lng are required" }, 400);
    }

    const db = getDb();
    const { data: markets, error } = await db
      .from("service_markets")
      .select("id")
      .eq("is_active", true);
    if (error) return c.json({ error: error.message }, 500);

    const marketIds = (markets ?? []).map((m) => String((m as Record<string, unknown>).id));
    if (marketIds.length === 0) {
      return c.json(evaluateCoverage(lat, lng, []));
    }

    const { data: zoneRows, error: zErr } = await db
      .from("service_zone_polygons")
      .select("id, market_id, name, polygon, priority, kind")
      .in("market_id", marketIds)
      .order("priority", { ascending: false });
    if (zErr) return c.json({ error: zErr.message }, 500);

    return c.json(evaluateCoverage(lat, lng, asCoverageZones((zoneRows ?? []) as Record<string, unknown>[])));
  });

  // ---- Waitlist review (before /:id) ----
  admin.get("/waitlist/entries", async (c) => {
    const marketId = c.req.query("market_id");
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const db = getDb();
    let query = db.from("zone_waitlist").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (marketId) query = query.eq("market_id", marketId);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ entries: data ?? [], total: count ?? 0, page, limit });
  });

  admin.get("/:id", async (c) => {
    const db = getDb();
    const { data: market, error } = await db
      .from("service_markets").select("*").eq("id", c.req.param("id")).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!market) return c.json({ error: "Market not found" }, 404);
    const { data: zones } = await db
      .from("service_zone_polygons")
      .select("*")
      .eq("market_id", c.req.param("id"))
      .order("priority", { ascending: false });
    return c.json({ market: { ...market, zones: zones ?? [] } });
  });

  admin.post("/", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const slug = String(body.slug || slugify(name)).trim();
    if (!slug) return c.json({ error: "slug is required" }, 400);

    const db = getDb();
    const parishId = body.parish_id != null && String(body.parish_id).trim()
      ? String(body.parish_id).trim()
      : null;
    const { data, error } = await db.from("service_markets").insert({
      slug,
      name,
      is_active: body.is_active === true,
      waitlist_enabled: body.waitlist_enabled !== false,
      parish_id: parishId,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);

    const autoZone = await insertAutoDeliveryArea(db, {
      id: String(data.id),
      name: String(data.name),
      slug: String(data.slug),
      parish_id: parishId,
    });
    const zones = autoZone ? [autoZone] : [];

    await writeKvAudit(adminUser, "roam_dash.market_created", String(data.id), "", `Town ${name} (${slug})`);
    return c.json({ market: { ...data, zones } }, 201);
  });

  admin.patch("/:id", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (body.name != null) updates.name = String(body.name);
    if (body.slug != null) updates.slug = slugify(String(body.slug));
    if (body.is_active != null) updates.is_active = Boolean(body.is_active);
    if (body.waitlist_enabled != null) updates.waitlist_enabled = Boolean(body.waitlist_enabled);
    if (body.parish_id !== undefined) {
      updates.parish_id = body.parish_id == null || body.parish_id === ""
        ? null
        : String(body.parish_id);
    }
    if (Object.keys(updates).length === 0) return c.json({ error: "No fields to update" }, 400);

    // Soft-block: cannot activate a market with no include zones.
    if (updates.is_active === true) {
      const dbCheck = getDb();
      const { data: includes } = await dbCheck
        .from("service_zone_polygons")
        .select("id, polygon, kind")
        .eq("market_id", c.req.param("id"));
      const hasInclude = (includes ?? []).some((z) => {
        const row = z as Record<string, unknown>;
        const kind = normalizeKind(row.kind);
        const poly = row.polygon;
        return kind === "include" && Array.isArray(poly) && poly.length >= 3;
      });
      if (!hasInclude) {
        return c.json({ error: "Add a delivery area before activating this market" }, 400);
      }
    }

    const db = getDb();
    const { data, error } = await db.from("service_markets")
      .update(updates).eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.market_updated", c.req.param("id"), "", JSON.stringify(updates));
    return c.json({ market: data });
  });

  admin.delete("/:id", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashDelete(adminUser);
    if (denied) return denied;
    const db = getDb();
    const { error } = await db.from("service_markets").delete().eq("id", c.req.param("id"));
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.market_deleted", c.req.param("id"), "", "Market removed");
    return c.json({ ok: true });
  });

  // ---- Zone polygons ----
  admin.post("/:id/zones", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const marketId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const polygon = normalizePolygon(body.polygon);
    if (!polygon) return c.json({ error: "polygon must be an array of >=3 {lat,lng} vertices" }, 400);
    const kind = normalizeKind(body.kind);

    const db = getDb();
    const { data, error } = await db.from("service_zone_polygons").insert({
      market_id: marketId,
      name,
      polygon,
      kind,
      priority: Number.isFinite(Number(body.priority)) ? Math.trunc(Number(body.priority)) : 0,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(
      adminUser,
      "roam_dash.zone_created",
      String(data.id),
      "",
      `Zone ${name} (${kind}) on market ${marketId}`,
    );
    return c.json({ zone: data }, 201);
  });

  admin.patch("/:id/zones/:zoneId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};
    if (body.name != null) updates.name = String(body.name);
    if (body.kind != null) updates.kind = normalizeKind(body.kind);
    if (body.priority != null && Number.isFinite(Number(body.priority))) {
      updates.priority = Math.trunc(Number(body.priority));
    }
    if (body.polygon != null) {
      const polygon = normalizePolygon(body.polygon);
      if (!polygon) return c.json({ error: "polygon must be an array of >=3 {lat,lng} vertices" }, 400);
      updates.polygon = polygon;
    }
    if (Object.keys(updates).length === 0) return c.json({ error: "No fields to update" }, 400);

    const db = getDb();
    const { data, error } = await db.from("service_zone_polygons")
      .update(updates)
      .eq("id", c.req.param("zoneId"))
      .eq("market_id", c.req.param("id"))
      .select().single();
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(
      adminUser,
      "roam_dash.zone_updated",
      c.req.param("zoneId"),
      "",
      JSON.stringify(updates),
    );
    return c.json({ zone: data });
  });

  admin.delete("/:id/zones/:zoneId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashDelete(adminUser);
    if (denied) return denied;
    const marketId = c.req.param("id");
    const zoneId = c.req.param("zoneId");
    const db = getDb();

    const { data: existing } = await db
      .from("service_zone_polygons")
      .select("id, kind, polygon")
      .eq("market_id", marketId);
    const target = (existing ?? []).find((z) => String((z as Record<string, unknown>).id) === zoneId);
    if (!target) return c.json({ error: "Zone not found" }, 404);

    const targetKind = normalizeKind((target as Record<string, unknown>).kind);
    const others = (existing ?? []).filter((z) => String((z as Record<string, unknown>).id) !== zoneId);
    if (targetKind === "include" && !hasValidInclude(others)) {
      // Keep town deliverable: replace last delivery area with auto outline instead of deleting.
      const { data: market } = await db
        .from("service_markets")
        .select("id, name, slug, parish_id")
        .eq("id", marketId)
        .maybeSingle();
      if (!market) return c.json({ error: "Market not found" }, 404);

      const { error: delErr } = await db.from("service_zone_polygons")
        .delete()
        .eq("id", zoneId)
        .eq("market_id", marketId);
      if (delErr) return c.json({ error: delErr.message }, 500);

      const restored = await insertAutoDeliveryArea(db, {
        id: String(market.id),
        name: String(market.name),
        slug: String(market.slug),
        parish_id: market.parish_id != null ? String(market.parish_id) : null,
      });
      await writeKvAudit(
        adminUser,
        "roam_dash.zone_deleted",
        zoneId,
        "",
        "Last delivery area reset to auto outline",
      );
      return c.json({ ok: true, restored_zone: restored });
    }

    const { error } = await db.from("service_zone_polygons")
      .delete()
      .eq("id", zoneId)
      .eq("market_id", marketId);
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.zone_deleted", zoneId, "", "Zone removed");
    return c.json({ ok: true });
  });

  app.route("/admin/markets", admin);
}

/**
 * Public delivery-zone + waitlist endpoints. Mounted on the delivery app root.
 * Uses a service-role delivery client supplied by the caller.
 */
export function registerPublicGeoRoutes(
  app: Hono,
  deps: { getServiceSupabase: () => ReturnType<typeof getDb> },
) {
  // Public: active coverage polygons for map rendering + in-zone checks.
  app.get("/geo/delivery-zones", async (c) => {
    const db = deps.getServiceSupabase();
    const { data: markets, error } = await db
      .from("service_markets")
      .select("id, slug, name, waitlist_enabled")
      .eq("is_active", true);
    if (error) return c.json({ error: error.message }, 500);

    const marketIds = (markets ?? []).map((m) => String((m as Record<string, unknown>).id));
    let zones: Record<string, unknown>[] = [];
    if (marketIds.length > 0) {
      const { data: zoneRows } = await db
        .from("service_zone_polygons")
        .select("id, market_id, name, polygon, priority, kind")
        .in("market_id", marketIds)
        .order("priority", { ascending: false });
      zones = (zoneRows ?? []) as Record<string, unknown>[];
    }

    const marketById = new Map(
      (markets ?? []).map((m) => [String((m as Record<string, unknown>).id), m as Record<string, unknown>]),
    );

    c.header("Cache-Control", "public, max-age=60");
    return c.json({
      zones: zones.map((z) => {
        const market = marketById.get(String(z.market_id));
        return {
          id: z.id,
          name: z.name,
          priority: z.priority,
          kind: normalizeKind(z.kind),
          polygon: z.polygon,
          market: market
            ? { id: market.id, slug: market.slug, name: market.name }
            : null,
        };
      }),
    });
  });

  // Public: capture a notify-me email for an out-of-zone address.
  app.post("/geo/zone-waitlist", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "A valid email is required" }, 400);
    }
    const attemptedAddress = body.attempted_address != null
      ? String(body.attempted_address).slice(0, 500)
      : null;
    const marketId = body.market_id ? String(body.market_id) : null;

    const db = deps.getServiceSupabase();
    const { data, error } = await db.from("zone_waitlist").insert({
      email,
      market_id: marketId,
      attempted_address: attemptedAddress,
    }).select("id, created_at").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true, id: data.id }, 201);
  });
}
