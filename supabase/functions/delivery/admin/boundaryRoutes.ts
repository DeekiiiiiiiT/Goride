/**
 * Admin routes for COD-AB admin_boundaries catalog + parish/market promote.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb, writeKvAudit } from "./merchantAdminShared.ts";

type BoundaryUpsertRow = {
  admin_level: number;
  pcode: string;
  parent_pcode?: string | null;
  name: string;
  slug?: string;
  geojson?: unknown;
  multiPolygon?: unknown;
  parts?: unknown;
  area_sqkm?: number | null;
  center_lat?: number | null;
  center_lng?: number | null;
  source?: string | null;
  source_version?: string | null;
  valid_on?: string | null;
  properties?: Record<string, unknown>;
};

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\bsaint\b/g, "st")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unnamed"
  );
}

function partsToGeoJsonGeometry(parts: unknown): Record<string, unknown> | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const coordinates: number[][][][] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as { outer?: unknown; holes?: unknown };
    if (!Array.isArray(p.outer) || p.outer.length < 3) continue;
    const rings: number[][][] = [];
    const toRing = (ring: unknown): number[][] | null => {
      if (!Array.isArray(ring)) return null;
      const coords: number[][] = [];
      for (const v of ring) {
        if (!v || typeof v !== "object") continue;
        const lat = Number((v as { lat?: unknown }).lat);
        const lng = Number((v as { lng?: unknown }).lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        coords.push([lng, lat]);
      }
      if (coords.length < 3) return null;
      const f = coords[0];
      const l = coords[coords.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) coords.push([...f]);
      return coords;
    };
    const outer = toRing(p.outer);
    if (!outer) continue;
    rings.push(outer);
    if (Array.isArray(p.holes)) {
      for (const h of p.holes) {
        const hr = toRing(h);
        if (hr) rings.push(hr);
      }
    }
    coordinates.push(rings);
  }
  if (coordinates.length === 0) return null;
  return { type: "MultiPolygon", coordinates };
}

function resolveGeoJson(f: BoundaryUpsertRow): Record<string, unknown> | null {
  let geojson = f.geojson as Record<string, unknown> | null | undefined;
  if (!geojson && f.parts) geojson = partsToGeoJsonGeometry(f.parts);
  if (!geojson && f.multiPolygon) geojson = partsToGeoJsonGeometry(f.multiPolygon);
  if (!geojson) return null;
  if (geojson.type === "Feature" && geojson.geometry) {
    return geojson.geometry as Record<string, unknown>;
  }
  if (geojson.type === "MultiPolygon" || geojson.type === "Polygon") return geojson;
  return null;
}

export function registerBoundaryAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/boundaries", async (c) => {
    const db = getDb();
    const level = c.req.query("admin_level");
    const parent = c.req.query("parent_pcode");
    const q = (c.req.query("q") ?? "").trim().toLowerCase();

    let query = db
      .from("admin_boundaries")
      .select(
        "id, admin_level, pcode, parent_pcode, name, slug, area_sqkm, center_lat, center_lng, source, source_version, valid_on, properties, updated_at",
      )
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

  admin.get("/coverage-health", async (c) => {
    const db = getDb();
    const { data, error } = await db.from("coverage_health_summary").select("*");
    if (error) return c.json({ error: error.message }, 500);
    const { count: boundaryCount } = await db
      .from("admin_boundaries")
      .select("id", { count: "exact", head: true });
    return c.json({ parishes: data ?? [], catalog_boundary_count: boundaryCount ?? 0 });
  });

  admin.post("/boundaries/import", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;

    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const linkParishes = body.link_parishes !== false;
    const features = Array.isArray(body.features) ? (body.features as BoundaryUpsertRow[]) : [];
    if (features.length === 0) return c.json({ error: "features array required" }, 400);

    const report = {
      created: 0,
      updated: 0,
      skipped: 0,
      linked_parishes: 0,
      errors: [] as string[],
      warnings: [] as string[],
      dry_run: dryRun,
    };

    const db = getDb();

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const pcode = String(f.pcode ?? "").trim();
      const adminLevel = Number(f.admin_level);
      if (!pcode || !Number.isFinite(adminLevel) || adminLevel < 0 || adminLevel > 3) {
        report.skipped += 1;
        report.errors.push(`Feature ${i + 1}: missing pcode or admin_level`);
        continue;
      }
      const name = String(f.name ?? "").trim() || pcode;
      const slug = String(f.slug ?? slugify(name));
      const geojson = resolveGeoJson(f);
      if (!geojson) {
        report.skipped += 1;
        report.errors.push(`Feature ${pcode}: invalid geojson`);
        continue;
      }

      const { data: existing } = await db
        .from("admin_boundaries")
        .select("id")
        .eq("admin_level", adminLevel)
        .eq("pcode", pcode)
        .maybeSingle();

      if (dryRun) {
        if (existing) report.updated += 1;
        else report.created += 1;
        continue;
      }

      const { error } = await db.rpc("upsert_admin_boundary", {
        p_admin_level: adminLevel,
        p_pcode: pcode,
        p_parent_pcode: f.parent_pcode ?? null,
        p_name: name,
        p_slug: slug,
        p_geojson: geojson,
        p_area_sqkm: f.area_sqkm ?? null,
        p_center_lat: f.center_lat ?? null,
        p_center_lng: f.center_lng ?? null,
        p_source: f.source ?? "cod-ab",
        p_source_version: f.source_version ?? null,
        p_valid_on: f.valid_on ?? null,
        p_properties: f.properties ?? {},
      });

      if (error) {
        report.errors.push(`${pcode}: ${error.message}`);
        report.skipped += 1;
        continue;
      }
      if (existing) report.updated += 1;
      else report.created += 1;

      if (linkParishes && adminLevel === 1) {
        const { data: parish } = await db
          .from("service_parishes")
          .select("id, slug")
          .eq("slug", slug)
          .maybeSingle();
        if (!parish) {
          report.warnings.push(`No parish slug match for ${slug} (${pcode})`);
        } else {
          const { error: promoteErr } = await db.rpc("promote_boundary_to_parish", {
            p_parish_id: parish.id,
            p_pcode: pcode,
          });
          if (promoteErr) report.warnings.push(`${slug}: ${promoteErr.message}`);
          else report.linked_parishes += 1;
        }
      }
    }

    await writeKvAudit(
      adminUser,
      "roam_dash.boundaries_import",
      "",
      "",
      JSON.stringify(report),
    );
    return c.json({ report });
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
    const { data: before } = await db.from("service_parishes").select("*").eq("id", parishId).maybeSingle();
    if (!before) return c.json({ error: "Parish not found" }, 404);

    if (before.foundation_polygon) {
      const { data: last } = await db
        .from("parish_outline_versions")
        .select("version")
        .eq("parish_id", parishId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      await db.from("parish_outline_versions").insert({
        parish_id: parishId,
        version: (last?.version ?? 0) + 1,
        label: "Pre-promote snapshot",
        foundation_polygon: before.foundation_polygon,
        foundation_geom: before.foundation_geom,
        foundation_boundary_pcode: before.foundation_boundary_pcode,
        boundary_source: before.boundary_source,
        created_by: adminUser.userId,
      });
    }

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

    const { data: boundary } = await db
      .from("admin_boundaries")
      .select("*")
      .eq("pcode", pcode)
      .eq("admin_level", 2)
      .maybeSingle();
    if (!boundary) return c.json({ error: "admin2 boundary not found" }, 404);
    if (parish.pcode && boundary.parent_pcode && boundary.parent_pcode !== parish.pcode) {
      return c.json({
        error: `Boundary parent ${boundary.parent_pcode} does not match parish pcode ${parish.pcode}`,
      }, 400);
    }

    const { data: existing } = await db.from("service_markets").select("id").eq("pcode", pcode).maybeSingle();
    if (existing) {
      return c.json({ error: "Town already exists for this pcode", market_id: existing.id }, 409);
    }

    const { data: market, error } = await db
      .from("service_markets")
      .insert({
        name: boundary.name,
        slug: boundary.slug,
        parish_id: parishId,
        is_active: false,
        waitlist_enabled: true,
        pcode,
        parent_pcode: boundary.parent_pcode,
        boundary_source: boundary.source,
        draft_dirty: true,
      })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);

    const { data: zoneResult, error: zoneErr } = await db.rpc("promote_boundary_to_market_zone", {
      p_market_id: market.id,
      p_pcode: pcode,
      p_zone_name: boundary.name,
    });
    if (zoneErr) return c.json({ market, warning: zoneErr.message }, 200);

    await writeKvAudit(
      adminUser,
      "roam_dash.town_from_boundary",
      String(market.id),
      pcode,
      JSON.stringify({ zoneResult }),
    );
    return c.json({ market, zone: zoneResult });
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

  app.route("/admin/markets", admin);
}
