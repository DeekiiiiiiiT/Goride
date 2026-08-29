/**
 * Admin CRUD for parish/global scoped exclusion zones.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { ProductAdminUser } from "../../_shared/productAdmin.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import type { getDb } from "./merchantAdminShared.ts";

function normalizePolygon(body: unknown): Array<{ lat: number; lng: number }> | null {
  if (!Array.isArray(body) || body.length < 3) return null;
  const out: Array<{ lat: number; lng: number }> = [];
  for (const pt of body) {
    if (!pt || typeof pt !== "object") continue;
    const p = pt as Record<string, unknown>;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ lat, lng });
  }
  return out.length >= 3 ? out : null;
}

async function upsertScopedSchedules(
  db: ReturnType<typeof getDb>,
  zoneId: string,
  schedules: unknown,
) {
  if (!Array.isArray(schedules)) return;
  await db.from("scoped_zone_schedules").delete().eq("zone_id", zoneId);
  for (const row of schedules) {
    if (!row || typeof row !== "object") continue;
    const s = row as Record<string, unknown>;
    const dow = Array.isArray(s.dow) ? s.dow : [];
    if (!dow.length) continue;
    await db.from("scoped_zone_schedules").insert({
      zone_id: zoneId,
      dow,
      start_time: String(s.start_time ?? "00:00"),
      end_time: String(s.end_time ?? "23:59"),
      timezone: String(s.timezone ?? "America/Jamaica"),
    });
  }
}

export function attachScopedExclusionRoutes(
  admin: Hono,
  deps: { getDb: typeof getDb },
) {
  admin.get("/scoped-exclusions", async (c) => {
    const db = deps.getDb();
    const scope = c.req.query("scope");
    let q = db.from("scoped_exclusion_zones").select("*").order("updated_at", { ascending: false });
    if (scope) q = q.eq("scope", scope);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ zones: data ?? [] });
  });

  admin.post("/scoped-exclusions", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const scope = String(body.scope ?? "global");
    if (!["global", "parish", "market"].includes(scope)) {
      return c.json({ error: "scope must be global, parish, or market" }, 400);
    }
    const name = String(body.name ?? "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const polygon = normalizePolygon(body.polygon);
    if (!polygon) return c.json({ error: "polygon must have >= 3 vertices" }, 400);

    const db = deps.getDb();
    const { data: geom } = await db.rpc("coverage_parts_to_geom", {
      parts: [{ outer: polygon, holes: [] }],
    });

    const insert: Record<string, unknown> = {
      scope,
      name,
      polygon,
      geom,
      parish_id: body.parish_id ? String(body.parish_id) : null,
      market_id: body.market_id ? String(body.market_id) : null,
      priority: Number.isFinite(Number(body.priority)) ? Math.trunc(Number(body.priority)) : 100,
      category: body.category ? String(body.category) : null,
      reason: body.reason ? String(body.reason) : null,
      is_active: body.is_active !== false,
      effective_from: body.effective_from ?? null,
      effective_to: body.effective_to ?? null,
      zone_policy: body.zone_policy ?? { action: "block" },
      updated_by: adminUser.id ?? null,
    };

    const { data, error } = await db.from("scoped_exclusion_zones").insert(insert).select().single();
    if (error) return c.json({ error: error.message }, 500);
    await upsertScopedSchedules(db, String(data.id), body.schedules);
    return c.json({ zone: data }, 201);
  });

  admin.patch("/scoped-exclusions/:id", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const zoneId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const db = deps.getDb();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: adminUser.id ?? null,
    };
    if (body.name != null) updates.name = String(body.name);
    if (body.priority != null) updates.priority = Math.trunc(Number(body.priority));
    if (body.category != null) updates.category = body.category ? String(body.category) : null;
    if (body.reason != null) updates.reason = body.reason ? String(body.reason) : null;
    if (body.is_active != null) updates.is_active = body.is_active !== false;
    if (body.effective_from != null) updates.effective_from = body.effective_from;
    if (body.effective_to != null) updates.effective_to = body.effective_to;
    if (body.zone_policy != null) updates.zone_policy = body.zone_policy;
    if (body.polygon != null) {
      const polygon = normalizePolygon(body.polygon);
      if (!polygon) return c.json({ error: "invalid polygon" }, 400);
      updates.polygon = polygon;
      const { data: geom } = await db.rpc("coverage_parts_to_geom", {
        parts: [{ outer: polygon, holes: [] }],
      });
      updates.geom = geom;
    }
    const { data, error } = await db.from("scoped_exclusion_zones")
      .update(updates)
      .eq("id", zoneId)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    if (body.schedules != null) await upsertScopedSchedules(db, zoneId, body.schedules);
    return c.json({ zone: data });
  });

  admin.delete("/scoped-exclusions/:id", async (c) => {
    const denied = requireDashWrite(c.get("adminUser") as ProductAdminUser);
    if (denied) return denied;
    const zoneId = c.req.param("id");
    const db = deps.getDb();
    const { error } = await db.from("scoped_exclusion_zones").delete().eq("id", zoneId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ ok: true });
  });
}
