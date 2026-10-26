/**
 * Dominion saves stations, plazas, and vendors here.
 * The fleet server still serves customer fuel, tolls, and books.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { dominionCan, type DominionAction } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { runAsMasterActor } from "../_fleet-server/master_actor.ts";
import { remapVendorReferences } from "../_fleet-server/platform_vendor_routes.ts";
import * as kv from "../_fleet-server/kv_store.tsx";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";

type App = Hono;

const TABLES = {
  stations: { prefix: "station:", edit: "stations.edit", verify: "stations.verify" },
  toll_plazas: { prefix: "toll_plaza:", edit: "tolls.edit" },
  platform_vendors: { prefix: "platform_vendor:", edit: "vendors.edit" },
} as const;

type TableName = keyof typeof TABLES;

function isTable(value: string): value is TableName {
  return value === "stations" || value === "toll_plazas" || value === "platform_vendors";
}

function actionFor(table: TableName, row: Record<string, unknown>): DominionAction {
  if (table === "stations" && row.status === "verified") return "stations.verify";
  return TABLES[table].edit;
}

async function saveKeyed(actor: string, key: string, value: unknown) {
  await runAsMasterActor(actor, () => kv.set(key, value));
}

async function removeKeyed(actor: string, table: TableName, id: string) {
  await runAsMasterActor(actor, async () => {
    await kv.del(`${TABLES[table].prefix}${id}`);
  });
}

const VENDOR_PREFIX = "platform_vendor:";

function vendorNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function registerMasterRoutes(app: App) {
  registerVendorRoutes(app);
  app.post("/admin/master/:table", async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    const table = c.req.param("table");
    if (!isTable(table)) return c.json({ error: "Unknown master dataset" }, 400);
    const row = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!row || typeof row !== "object") return c.json({ error: "Send the record to save" }, 400);
    const action = actionFor(table, row);
    if (!dominionCan(auth.role, action)) {
      return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
    }
    const id = String(row.id || "").trim() || crypto.randomUUID();
    const key = `${TABLES[table].prefix}${id}`;
    const existing = await kv.get(key);
    const prior = existing && typeof existing === "object" ? existing as Record<string, unknown> : {};
    const value = { ...prior, ...row, id };
    try {
      await saveKeyed(auth.email, `${TABLES[table].prefix}${id}`, value);
      return c.json({ success: true, data: value });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      return c.json({ error: message }, 500);
    }
  });

  app.delete("/admin/master/:table/:id", async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    const table = c.req.param("table");
    if (!isTable(table)) return c.json({ error: "Unknown master dataset" }, 400);
    if (!dominionCan(auth.role, TABLES[table].edit)) {
      return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
    }
    const id = c.req.param("id");
    try {
      await removeKeyed(auth.email, table, id);
      return c.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete";
      return c.json({ error: message }, 500);
    }
  });
}

function registerVendorRoutes(app: App) {
  const base = "/admin/vendors";

  async function allow(c: Parameters<typeof requirePlatformAdmin>[0]) {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    if (!dominionCan(auth.role, "vendors.edit")) {
      return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
    }
    return auth;
  }

  app.post(base, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "Name required" }, 400);
    const all = (await kv.getByPrefix(VENDOR_PREFIX)) as Array<{ name?: string; status?: string; isActive?: boolean; mergedIntoVendorId?: string }>;
    const key = vendorNameKey(name);
    if (all.some((vendor) => (vendor.status || "verified") === "verified" && vendor.isActive !== false && !vendor.mergedIntoVendorId && vendorNameKey(vendor.name || "") === key)) {
      return c.json({ error: "A verified vendor with that name already exists" }, 409);
    }
    const now = new Date().toISOString();
    const vendor = {
      id: String(body.id || crypto.randomUUID()),
      name,
      categoryDefault: body.categoryDefault,
      notes: body.notes ? String(body.notes).trim() : undefined,
      trn: body.trn ? String(body.trn).trim() : undefined,
      gctRegistered: body.gctRegistered !== undefined ? Boolean(body.gctRegistered) : true,
      isActive: body.isActive !== false,
      status: "verified",
      createdAt: now,
      updatedAt: now,
    };
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${vendor.id}`, vendor);
    return c.json({ success: true, data: vendor });
  });

  app.post(`${base}/bulk`, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({})) as { names?: unknown[]; text?: string; categoryDefault?: string; notes?: string };
    const rawNames = Array.isArray(body.names)
      ? body.names.map((name) => String(name || "").trim())
      : String(body.text || "").split(/\r?\n/).map((name) => name.trim());
    const names = rawNames.filter(Boolean);
    if (names.length === 0) return c.json({ error: "At least one vendor name is required" }, 400);
    if (names.length > 200) return c.json({ error: "Maximum 200 vendors per bulk add" }, 400);
    const all = (await kv.getByPrefix(VENDOR_PREFIX)) as Array<{ name?: string; status?: string; isActive?: boolean }>;
    const seen = new Set(all.filter((vendor) => (vendor.status || "verified") === "verified" && vendor.isActive !== false).map((vendor) => vendorNameKey(vendor.name || "")));
    const created = [];
    const skipped: string[] = [];
    const now = new Date().toISOString();
    for (const name of names) {
      const key = vendorNameKey(name);
      if (seen.has(key)) {
        skipped.push(name);
        continue;
      }
      seen.add(key);
      const vendor = {
        id: crypto.randomUUID(),
        name,
        categoryDefault: body.categoryDefault && body.categoryDefault !== "none" ? body.categoryDefault : undefined,
        notes: body.notes ? String(body.notes).trim() : undefined,
        isActive: true,
        status: "verified",
        createdAt: now,
        updatedAt: now,
      };
      await saveKeyed(auth.email, `${VENDOR_PREFIX}${vendor.id}`, vendor);
      created.push(vendor);
    }
    return c.json({ success: true, created, skipped, summary: { created: created.length, skipped: skipped.length } });
  });

  app.put(`${base}/:id`, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = await kv.get(`${VENDOR_PREFIX}${id}`) as Record<string, unknown> | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const next = {
      ...existing,
      name: body.name != null ? String(body.name).trim() : existing.name,
      notes: body.notes !== undefined ? String(body.notes || "").trim() || undefined : existing.notes,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
      status: body.status !== undefined ? body.status : existing.status || "verified",
      trn: body.trn !== undefined ? (String(body.trn || "").trim() || undefined) : existing.trn,
      gctRegistered: body.gctRegistered !== undefined ? Boolean(body.gctRegistered) : existing.gctRegistered,
      categoryDefault: body.categoryDefault !== undefined ? body.categoryDefault : existing.categoryDefault,
      updatedAt: new Date().toISOString(),
    };
    if (!next.name) return c.json({ error: "Name required" }, 400);
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  app.delete(`${base}/:id`, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = await kv.get(`${VENDOR_PREFIX}${id}`) as Record<string, unknown> | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const next = { ...existing, isActive: false, updatedAt: new Date().toISOString() };
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  app.post(`${base}/:id/approve`, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = await kv.get(`${VENDOR_PREFIX}${id}`) as Record<string, unknown> | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const mergeIntoId = body.mergeIntoVendorId ? String(body.mergeIntoVendorId) : "";
    if (mergeIntoId) {
      const target = await kv.get(`${VENDOR_PREFIX}${mergeIntoId}`) as { status?: string } | null;
      if (!target || (target.status || "verified") !== "verified") {
        return c.json({ error: "Merge target must be a verified vendor" }, 400);
      }
      const merged = {
        ...existing,
        status: "rejected",
        isActive: false,
        mergedIntoVendorId: mergeIntoId,
        updatedAt: new Date().toISOString(),
      };
      await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, merged);
      await remapVendorReferences(id, mergeIntoId);
      return c.json({ success: true, data: merged, mergedInto: target });
    }
    const next = {
      ...existing,
      status: "verified",
      isActive: true,
      mergedIntoVendorId: undefined,
      updatedAt: new Date().toISOString(),
      name: body.name != null ? String(body.name).trim() || existing.name : existing.name,
      notes: body.notes !== undefined ? String(body.notes || "").trim() || undefined : existing.notes,
      categoryDefault: body.categoryDefault !== undefined ? body.categoryDefault : existing.categoryDefault,
    };
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });

  app.post(`${base}/:id/reject`, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = await kv.get(`${VENDOR_PREFIX}${id}`) as Record<string, unknown> | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const next = { ...existing, status: "rejected", isActive: false, updatedAt: new Date().toISOString() };
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next);
    return c.json({ success: true, data: next });
  });
}
