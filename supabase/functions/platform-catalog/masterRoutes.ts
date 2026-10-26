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

function changeReason(body: Record<string, unknown> | null, fallback: string): string {
  const reason = String(body?.reason || "").trim();
  if (body && "reason" in body) delete body.reason;
  return reason || fallback;
}

async function saveKeyed(actor: string, key: string, value: unknown, reason: string) {
  await runAsMasterActor(actor, () => kv.set(key, value), reason);
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
    const reason = changeReason(row, action);
    const id = String(row.id || "").trim() || crypto.randomUUID();
    const key = `${TABLES[table].prefix}${id}`;
    const existing = await kv.get(key);
    const prior = existing && typeof existing === "object" ? existing as Record<string, unknown> : {};
    const value = { ...prior, ...row, id };
    try {
      await saveKeyed(auth.email, key, value, reason);
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
    const reason = changeReason({ reason: c.req.query("reason") || "" }, TABLES[table].edit);
    try {
      await runAsMasterActor(auth.email, async () => {
        await kv.del(`${TABLES[table].prefix}${id}`);
      }, reason);
      return c.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete";
      return c.json({ error: message }, 500);
    }
  });
}

function registerVendorRoutes(app: App) {
  const base = "/admin/vendors";

  app.get(base, async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    const status = String(c.req.query("status") || "").trim();
    let items = (await kv.getByPrefix(VENDOR_PREFIX)) as Array<Record<string, unknown>>;
    if (c.req.query("includeInactive") !== "1") items = items.filter((vendor) => vendor.isActive !== false);
    if (status) items = items.filter((vendor) => String(vendor.status || "verified") === status);
    items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return c.json({ items });
  });

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
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${vendor.id}`, vendor, changeReason(body, "vendors.edit"));
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
      await saveKeyed(auth.email, `${VENDOR_PREFIX}${vendor.id}`, vendor, changeReason(body, "vendors.edit"));
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
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next, changeReason(body, "vendors.edit"));
    return c.json({ success: true, data: next });
  });

  app.delete(`${base}/:id`, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = await kv.get(`${VENDOR_PREFIX}${id}`) as Record<string, unknown> | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const next = { ...existing, isActive: false, updatedAt: new Date().toISOString() };
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next, changeReason({ reason: c.req.query("reason") || "" }, "vendors.edit"));
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
      await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, merged, changeReason(body, "vendors.edit"));
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
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next, changeReason(body, "vendors.edit"));
    return c.json({ success: true, data: next });
  });

  app.post(`${base}/:id/reject`, async (c) => {
    const auth = await allow(c);
    if (auth instanceof Response) return auth;
    const id = c.req.param("id");
    const existing = await kv.get(`${VENDOR_PREFIX}${id}`) as Record<string, unknown> | null;
    if (!existing) return c.json({ error: "Vendor not found" }, 404);
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const next = { ...existing, status: "rejected", isActive: false, updatedAt: new Date().toISOString() };
    await saveKeyed(auth.email, `${VENDOR_PREFIX}${id}`, next, changeReason(body, "vendors.edit"));
    return c.json({ success: true, data: next });
  });
}

export function registerTollRateRoutes(app: App) {
  app.post("/admin/toll-rates", async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    if (!dominionCan(auth.role, "tolls.edit")) {
      return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
    }
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = changeReason(body, "tolls.edit");
    try {
      const { publishTollRates, saveTollRateStore, migrateToVersionedStore } = await import("../_fleet-server/toll_rate_schedule.ts");
      const result = await runAsMasterActor(auth.email, async () => {
        if (body.current && Array.isArray(body.versions) && body.__replaceStore === true) {
          const store = migrateToVersionedStore(body);
          await saveTollRateStore(store);
          return { success: true, store };
        }
        const published = await publishTollRates({
          effectiveDate: typeof body.effectiveDate === "string" ? body.effectiveDate : undefined,
          effectiveFrom: typeof body.effectiveFrom === "string" ? body.effectiveFrom : typeof body.effectiveDate === "string" ? body.effectiveDate : undefined,
          operator: typeof body.operator === "string" ? body.operator : undefined,
          currency: typeof body.currency === "string" ? body.currency : undefined,
          plazas: Array.isArray(body.plazas) ? body.plazas as never : [],
          vehicleClasses: Array.isArray(body.vehicleClasses) ? body.vehicleClasses as never : [],
          routeRateGroups: Array.isArray(body.routeRateGroups) ? body.routeRateGroups as never : [],
          createdBy: auth.email || reason,
        });
        return { success: true, published: published.published, store: published.store, current: published.store.current, versions: published.store.versions };
      }, reason);
      return c.json(result);
    } catch (err) {
      const named = err as { name?: string; message?: string; reason?: string };
      if (named?.name === "TollRatePublishError") return c.json({ error: named.message, reason: named.reason }, 400);
      const message = err instanceof Error ? err.message : "Could not save toll rates";
      return c.json({ error: message }, 500);
    }
  });
}
