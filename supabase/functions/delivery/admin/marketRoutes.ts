/**
 * Rush Ops admin — service markets, coverage zone polygons, publish, readiness.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import {
  DASH_FORCE_APPROVE_ROLES,
  hasAnyDashRole,
  requireDashDelete,
  requireDashWrite,
} from "./dashPermissions.ts";
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
import {
  buildReadinessChecks,
  hasValidInclude,
  normalizeKind,
  polygonSummary,
  zoneSnapshotPayload,
} from "./coveragePlatform.ts";

type Vertex = CoverageVertex;

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
  // Prefer promoted outline template when present
  const { data: tmpl } = await db
    .from("town_outline_templates")
    .select("polygon")
    .eq("slug", String(market.slug))
    .maybeSingle();
  let polygon: OutlineVertex[];
  if (tmpl && Array.isArray(tmpl.polygon) && (tmpl.polygon as OutlineVertex[]).length >= 3) {
    polygon = tmpl.polygon as OutlineVertex[];
  } else {
    const parishSlug = await resolveParishSlug(
      db,
      market.parish_id != null ? String(market.parish_id) : null,
    );
    polygon = resolveTownOutline({
      townSlug: String(market.slug),
      parishSlug,
    });
  }
  const { data, error } = await db.from("service_zone_polygons").insert({
    market_id: market.id,
    name: deliveryAreaName(String(market.name)),
    polygon,
    kind: "include",
    priority: 10,
    source: "auto_outline",
  }).select().single();
  if (error) {
    console.error("auto delivery area insert failed", error.message);
    return null;
  }
  return data as Record<string, unknown>;
}

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

function normalizeSource(input: unknown): "manual" | "radius" | "auto_outline" | "import" {
  const s = String(input || "manual").toLowerCase();
  if (s === "radius" || s === "auto_outline" || s === "import") return s;
  return "manual";
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

async function markDraftDirty(db: ReturnType<typeof getDb>, marketId: string) {
  await db.from("service_markets").update({ draft_dirty: true }).eq("id", marketId);
}

async function loadPublishedZonesForMarket(
  db: ReturnType<typeof getDb>,
  market: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const pubId = market.published_version_id != null ? String(market.published_version_id) : null;
  if (pubId) {
    const { data: ver } = await db
      .from("service_coverage_versions")
      .select("zones_json")
      .eq("id", pubId)
      .maybeSingle();
    if (ver && Array.isArray(ver.zones_json)) {
      return ver.zones_json as Record<string, unknown>[];
    }
  }
  const { data: zones } = await db
    .from("service_zone_polygons")
    .select("*")
    .eq("market_id", String(market.id))
    .order("priority", { ascending: false });
  return (zones ?? []) as Record<string, unknown>[];
}

export function registerMarketAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

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
          await markDraftDirty(db, id);
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
    const { error } = await db.from("service_parishes").delete().eq("id", c.req.param("parishId"));
    if (error) return c.json({ error: error.message }, 500);
    await writeKvAudit(adminUser, "roam_dash.parish_deleted", c.req.param("parishId"), "", "Parish removed");
    return c.json({ ok: true });
  });

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
      .select("id, published_version_id")
      .eq("is_active", true);
    if (error) return c.json({ error: error.message }, 500);

    const allZones: CoverageZone[] = [];
    for (const m of markets ?? []) {
      const market = m as Record<string, unknown>;
      const published = await loadPublishedZonesForMarket(db, market);
      allZones.push(...asCoverageZones(published));
    }

    return c.json(evaluateCoverage(lat, lng, allZones));
  });

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

  // ---- Publish / versions / readiness (before generic /:id) ----
  admin.get("/:id/readiness", async (c) => {
    const db = getDb();
    const marketId = c.req.param("id");
    const { data: market, error } = await db.from("service_markets").select("*").eq("id", marketId).maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!market) return c.json({ error: "Market not found" }, 404);
    const m = market as Record<string, unknown>;
    const published = await loadPublishedZonesForMarket(db, m);

    const merchantsMin = Number(m.readiness_merchants_min ?? 0) || 0;
    const couriersMin = Number(m.readiness_couriers_min ?? 0) || 0;

    let merchantCount = 0;
    let courierCount = 0;
    try {
      const { count: mc } = await db
        .from("merchants")
        .select("id", { count: "exact", head: true })
        .eq("verification_status", "approved");
      merchantCount = mc ?? 0;
    } catch {
      merchantCount = 0;
    }
    try {
      const { count: cc } = await db
        .from("courier_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "active");
      courierCount = cc ?? 0;
    } catch {
      courierCount = 0;
    }

    const result = buildReadinessChecks({
      publishedZones: published,
      draftDirty: Boolean(m.draft_dirty),
      merchantCount,
      courierCount,
      merchantsMin,
      couriersMin,
    });
    return c.json({
      market_id: marketId,
      ready: result.ready,
      checks: result.checks,
      draft_dirty: Boolean(m.draft_dirty),
      published_version_id: m.published_version_id ?? null,
    });
  });

  admin.get("/:id/versions", async (c) => {
    const db = getDb();
    const { data, error } = await db
      .from("service_coverage_versions")
      .select("id, market_id, version, label, notes, created_at, created_by")
      .eq("market_id", c.req.param("id"))
      .order("version", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ versions: data ?? [] });
  });

  admin.post("/:id/publish", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const marketId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();

    const { data: market, error: mErr } = await db.from("service_markets").select("*").eq("id", marketId).maybeSingle();
    if (mErr) return c.json({ error: mErr.message }, 500);
    if (!market) return c.json({ error: "Market not found" }, 404);

    const { data: zones, error: zErr } = await db
      .from("service_zone_polygons")
      .select("*")
      .eq("market_id", marketId)
      .order("priority", { ascending: false });
    if (zErr) return c.json({ error: zErr.message }, 500);
    if (!hasValidInclude(zones ?? [])) {
      return c.json({ error: "Publish requires a valid delivery area" }, 400);
    }

    const { data: last } = await db
      .from("service_coverage_versions")
      .select("version")
      .eq("market_id", marketId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (last?.version != null ? Number(last.version) : 0) + 1;
    const zonesJson = (zones ?? []).map((z) => zoneSnapshotPayload(z as Record<string, unknown>));

    const { data: ver, error: vErr } = await db.from("service_coverage_versions").insert({
      market_id: marketId,
      version: nextVersion,
      label: body.label != null ? String(body.label).slice(0, 120) : `v${nextVersion}`,
      notes: body.notes != null ? String(body.notes).slice(0, 500) : null,
      zones_json: zonesJson,
      created_by: adminUser.id || null,
    }).select().single();
    if (vErr) return c.json({ error: vErr.message }, 500);

    const { data: updated, error: uErr } = await db.from("service_markets").update({
      published_version_id: ver.id,
      draft_dirty: false,
    }).eq("id", marketId).select().single();
    if (uErr) return c.json({ error: uErr.message }, 500);

    await writeKvAudit(
      adminUser,
      "roam_dash.coverage_published",
      marketId,
      "",
      JSON.stringify({
        version: nextVersion,
        version_id: ver.id,
        zone_count: zonesJson.length,
      }),
    );
    return c.json({ market: updated, version: ver });
  });

  admin.post("/:id/versions/:versionId/restore", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const marketId = c.req.param("id");
    const versionId = c.req.param("versionId");
    const body = await c.req.json().catch(() => ({}));
    const republish = body.republish !== false;
    const db = getDb();

    const { data: ver, error } = await db
      .from("service_coverage_versions")
      .select("*")
      .eq("id", versionId)
      .eq("market_id", marketId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!ver) return c.json({ error: "Version not found" }, 404);

    const snapZones = Array.isArray(ver.zones_json) ? ver.zones_json as Record<string, unknown>[] : [];
    await db.from("service_zone_polygons").delete().eq("market_id", marketId);

    for (const z of snapZones) {
      const polygon = normalizePolygon(z.polygon);
      if (!polygon) continue;
      await db.from("service_zone_polygons").insert({
        market_id: marketId,
        name: String(z.name || "Zone"),
        polygon,
        kind: normalizeKind(z.kind),
        priority: Number.isFinite(Number(z.priority)) ? Math.trunc(Number(z.priority)) : 0,
        source: normalizeSource(z.source),
        center_lat: z.center_lat != null ? Number(z.center_lat) : null,
        center_lng: z.center_lng != null ? Number(z.center_lng) : null,
        radius_m: z.radius_m != null ? Number(z.radius_m) : null,
        updated_by: adminUser.id || null,
      });
    }

    await writeKvAudit(
      adminUser,
      "roam_dash.coverage_restored",
      marketId,
      "",
      JSON.stringify({ version_id: versionId, version: ver.version, republish }),
    );

    if (republish) {
      // Re-enter publish path inline
      const { data: zones } = await db
        .from("service_zone_polygons")
        .select("*")
        .eq("market_id", marketId)
        .order("priority", { ascending: false });
      const { data: last } = await db
        .from("service_coverage_versions")
        .select("version")
        .eq("market_id", marketId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (last?.version != null ? Number(last.version) : 0) + 1;
      const zonesJson = (zones ?? []).map((z) => zoneSnapshotPayload(z as Record<string, unknown>));
      const { data: newVer } = await db.from("service_coverage_versions").insert({
        market_id: marketId,
        version: nextVersion,
        label: `Restore of v${ver.version}`,
        notes: `Restored from ${versionId}`,
        zones_json: zonesJson,
        created_by: adminUser.id || null,
      }).select().single();
      if (newVer) {
        await db.from("service_markets").update({
          published_version_id: newVer.id,
          draft_dirty: false,
        }).eq("id", marketId);
      }
    } else {
      await markDraftDirty(db, marketId);
    }

    const { data: market } = await db.from("service_markets").select("*").eq("id", marketId).single();
    const { data: zones } = await db
      .from("service_zone_polygons")
      .select("*")
      .eq("market_id", marketId)
      .order("priority", { ascending: false });
    return c.json({ market: { ...market, zones: zones ?? [] } });
  });

  admin.post("/:id/import-geojson", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const marketId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    // Accept Feature, Polygon coordinates, or {lat,lng}[]
    let polygon: Vertex[] | null = null;
    if (Array.isArray(body.polygon)) {
      polygon = normalizePolygon(body.polygon);
    } else if (body.geojson) {
      const g = body.geojson as Record<string, unknown>;
      let coords: unknown = null;
      if (g.type === "Feature" && g.geometry && typeof g.geometry === "object") {
        const geom = g.geometry as Record<string, unknown>;
        coords = Array.isArray(geom.coordinates) ? (geom.coordinates as unknown[])[0] : null;
      } else if (g.type === "Polygon") {
        coords = Array.isArray(g.coordinates) ? (g.coordinates as unknown[])[0] : null;
      }
      if (Array.isArray(coords)) {
        polygon = normalizePolygon(
          coords.map((c) => {
            const pair = c as number[];
            return { lng: Number(pair[0]), lat: Number(pair[1]) };
          }),
        );
      }
    }
    if (!polygon) return c.json({ error: "Valid GeoJSON Polygon or polygon[{lat,lng}] required" }, 400);

    const db = getDb();
    const { data: market } = await db.from("service_markets").select("*").eq("id", marketId).maybeSingle();
    if (!market) return c.json({ error: "Market not found" }, 404);

    const { data: includes } = await db
      .from("service_zone_polygons")
      .select("id")
      .eq("market_id", marketId)
      .eq("kind", "include");
    for (const row of includes ?? []) {
      await db.from("service_zone_polygons").delete().eq("id", String((row as Record<string, unknown>).id));
    }

    const { data: zone, error } = await db.from("service_zone_polygons").insert({
      market_id: marketId,
      name: deliveryAreaName(String(market.name)),
      polygon,
      kind: "include",
      priority: 10,
      source: "import",
      updated_by: adminUser.id || null,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await markDraftDirty(db, marketId);

    const promote = body.promote_template === true;
    if (promote && market.slug) {
      await db.from("town_outline_templates").upsert({
        slug: String(market.slug),
        name: String(market.name),
        polygon,
        version: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "slug" });
    }

    await writeKvAudit(
      adminUser,
      "roam_dash.coverage_imported",
      marketId,
      "",
      JSON.stringify({ ...polygonSummary(polygon), promote }),
    );
    return c.json({ zone }, 201);
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
      is_active: false,
      waitlist_enabled: body.waitlist_enabled !== false,
      parish_id: parishId,
      draft_dirty: true,
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
    if (body.readiness_merchants_min != null && Number.isFinite(Number(body.readiness_merchants_min))) {
      updates.readiness_merchants_min = Math.max(0, Math.trunc(Number(body.readiness_merchants_min)));
    }
    if (body.readiness_couriers_min != null && Number.isFinite(Number(body.readiness_couriers_min))) {
      updates.readiness_couriers_min = Math.max(0, Math.trunc(Number(body.readiness_couriers_min)));
    }
    if (Object.keys(updates).length === 0) return c.json({ error: "No fields to update" }, 400);

    if (updates.is_active === true) {
      const dbCheck = getDb();
      const marketId = c.req.param("id");
      const { data: market } = await dbCheck.from("service_markets").select("*").eq("id", marketId).maybeSingle();
      if (!market) return c.json({ error: "Market not found" }, 404);
      const published = await loadPublishedZonesForMarket(dbCheck, market as Record<string, unknown>);
      let merchantCount = 0;
      let courierCount = 0;
      try {
        const { count: mc } = await dbCheck
          .from("merchants")
          .select("id", { count: "exact", head: true })
          .eq("verification_status", "approved");
        merchantCount = mc ?? 0;
      } catch { /* ignore */ }
      try {
        const { count: cc } = await dbCheck
          .from("courier_profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("status", "active");
        courierCount = cc ?? 0;
      } catch { /* ignore */ }

      const m = market as Record<string, unknown>;
      const readiness = buildReadinessChecks({
        publishedZones: published,
        draftDirty: Boolean(m.draft_dirty),
        merchantCount,
        courierCount,
        merchantsMin: Number(m.readiness_merchants_min ?? 0) || 0,
        couriersMin: Number(m.readiness_couriers_min ?? 0) || 0,
      });
      const force = body.force === true && hasAnyDashRole(adminUser.roles, DASH_FORCE_APPROVE_ROLES);
      if (!readiness.ready && !force) {
        return c.json({
          error: "Town is not ready to activate",
          failed_checks: readiness.checks.filter((ch) => !ch.ok),
          checks: readiness.checks,
        }, 400);
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
    const source = normalizeSource(body.source);

    const insert: Record<string, unknown> = {
      market_id: marketId,
      name,
      polygon,
      kind,
      source,
      priority: Number.isFinite(Number(body.priority)) ? Math.trunc(Number(body.priority)) : 0,
      updated_by: adminUser.id || null,
    };
    if (body.center_lat != null && body.center_lng != null) {
      insert.center_lat = Number(body.center_lat);
      insert.center_lng = Number(body.center_lng);
    }
    if (body.radius_m != null && Number.isFinite(Number(body.radius_m))) {
      insert.radius_m = Number(body.radius_m);
    }

    const db = getDb();
    const { data, error } = await db.from("service_zone_polygons").insert(insert).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await markDraftDirty(db, marketId);
    await writeKvAudit(
      adminUser,
      "roam_dash.zone_created",
      String(data.id),
      "",
      JSON.stringify({
        name,
        kind,
        source,
        marketId,
        after: polygonSummary(polygon),
        radius_m: insert.radius_m ?? null,
      }),
    );
    return c.json({ zone: data }, 201);
  });

  admin.patch("/:id/zones/:zoneId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const { data: before } = await db
      .from("service_zone_polygons")
      .select("*")
      .eq("id", c.req.param("zoneId"))
      .eq("market_id", c.req.param("id"))
      .maybeSingle();

    const updates: Record<string, unknown> = { updated_by: adminUser.id || null, updated_at: new Date().toISOString() };
    if (body.name != null) updates.name = String(body.name);
    if (body.kind != null) updates.kind = normalizeKind(body.kind);
    if (body.source != null) updates.source = normalizeSource(body.source);
    if (body.priority != null && Number.isFinite(Number(body.priority))) {
      updates.priority = Math.trunc(Number(body.priority));
    }
    if (body.polygon != null) {
      const polygon = normalizePolygon(body.polygon);
      if (!polygon) return c.json({ error: "polygon must be an array of >=3 {lat,lng} vertices" }, 400);
      updates.polygon = polygon;
    }
    if (body.center_lat != null) updates.center_lat = Number(body.center_lat);
    if (body.center_lng != null) updates.center_lng = Number(body.center_lng);
    if (body.radius_m != null) updates.radius_m = Number(body.radius_m);

    const { data, error } = await db.from("service_zone_polygons")
      .update(updates)
      .eq("id", c.req.param("zoneId"))
      .eq("market_id", c.req.param("id"))
      .select().single();
    if (error) return c.json({ error: error.message }, 500);
    await markDraftDirty(db, c.req.param("id"));
    await writeKvAudit(
      adminUser,
      "roam_dash.zone_updated",
      c.req.param("zoneId"),
      "",
      JSON.stringify({
        before: before ? polygonSummary((before as Record<string, unknown>).polygon) : null,
        after: polygonSummary(data.polygon),
        fields: Object.keys(updates),
      }),
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
      .select("*")
      .eq("market_id", marketId);
    const target = (existing ?? []).find((z) => String((z as Record<string, unknown>).id) === zoneId);
    if (!target) return c.json({ error: "Zone not found" }, 404);

    const targetKind = normalizeKind((target as Record<string, unknown>).kind);
    const others = (existing ?? []).filter((z) => String((z as Record<string, unknown>).id) !== zoneId);
    if (targetKind === "include" && !hasValidInclude(others)) {
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
      await markDraftDirty(db, marketId);
      await writeKvAudit(
        adminUser,
        "roam_dash.zone_deleted",
        zoneId,
        "",
        JSON.stringify({ reset: true, before: polygonSummary((target as Record<string, unknown>).polygon) }),
      );
      return c.json({ ok: true, restored_zone: restored });
    }

    const { error } = await db.from("service_zone_polygons")
      .delete()
      .eq("id", zoneId)
      .eq("market_id", marketId);
    if (error) return c.json({ error: error.message }, 500);
    await markDraftDirty(db, marketId);
    await writeKvAudit(
      adminUser,
      "roam_dash.zone_deleted",
      zoneId,
      "",
      JSON.stringify({ before: polygonSummary((target as Record<string, unknown>).polygon) }),
    );
    return c.json({ ok: true });
  });

  app.route("/admin/markets", admin);
}

export function registerPublicGeoRoutes(
  app: Hono,
  deps: { getServiceSupabase: () => ReturnType<typeof getDb> },
) {
  app.get("/geo/delivery-zones", async (c) => {
    const db = deps.getServiceSupabase();
    const { data: markets, error } = await db
      .from("service_markets")
      .select("id, slug, name, waitlist_enabled, published_version_id")
      .eq("is_active", true);
    if (error) return c.json({ error: error.message }, 500);

    const marketById = new Map(
      (markets ?? []).map((m) => [String((m as Record<string, unknown>).id), m as Record<string, unknown>]),
    );

    const zones: Record<string, unknown>[] = [];
    for (const m of markets ?? []) {
      const market = m as Record<string, unknown>;
      const published = await loadPublishedZonesForMarket(db, market);
      for (const z of published) {
        zones.push({ ...z, market_id: market.id });
      }
    }

    // Stable priority sort
    zones.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));

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
