/**
 * Org-scoped saved Drivers list views.
 * KV key: driver_saved_views:{orgId}
 * GET /drivers/saved-views
 * PUT /drivers/saved-views  { views: DriverSavedView[] }
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";

const PREFIX = "/make-server-37f42386";
const MAX_VIEWS = 40;

export type DriverSavedViewRecord = {
  id: string;
  name: string;
  filters: {
    status?: string;
    minOwes?: number;
    atRiskOnly?: boolean;
    overdueFollowUpsOnly?: boolean;
  };
};

function viewsKey(orgId: string): string {
  return `driver_saved_views:${orgId}`;
}

function normalizeViews(raw: unknown): DriverSavedViewRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: DriverSavedViewRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) continue;
    const filtersIn =
      row.filters && typeof row.filters === "object"
        ? (row.filters as Record<string, unknown>)
        : {};
    const filters: DriverSavedViewRecord["filters"] = {};
    if (typeof filtersIn.status === "string" && filtersIn.status.trim()) {
      filters.status = filtersIn.status.trim();
    }
    if (typeof filtersIn.minOwes === "number" && Number.isFinite(filtersIn.minOwes)) {
      filters.minOwes = filtersIn.minOwes;
    }
    if (typeof filtersIn.atRiskOnly === "boolean") {
      filters.atRiskOnly = filtersIn.atRiskOnly;
    }
    if (typeof filtersIn.overdueFollowUpsOnly === "boolean") {
      filters.overdueFollowUpsOnly = filtersIn.overdueFollowUpsOnly;
    }
    out.push({ id, name, filters });
    if (out.length >= MAX_VIEWS) break;
  }
  return out;
}

export function registerDriversSavedViewsRoutes(app: Hono) {
  app.get(
    `${PREFIX}/drivers/saved-views`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.view"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "organization required" }, 400);
      try {
        const bag = (await kv.get(viewsKey(orgId))) as { views?: unknown } | null;
        const views = normalizeViews(bag?.views);
        return c.json({ success: true, orgId, views });
      } catch (e: any) {
        console.error("[drivers/saved-views] GET failed:", e?.message || e);
        return c.json({ error: e?.message || "Failed to load saved views" }, 500);
      }
    },
  );

  app.put(
    `${PREFIX}/drivers/saved-views`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "organization required" }, 400);
      try {
        const body = await c.req.json().catch(() => ({}));
        const views = normalizeViews(body?.views);
        await kv.set(viewsKey(orgId), {
          organizationId: orgId,
          views,
          updatedAt: new Date().toISOString(),
        });
        return c.json({ success: true, orgId, views });
      } catch (e: any) {
        console.error("[drivers/saved-views] PUT failed:", e?.message || e);
        return c.json({ error: e?.message || "Failed to save views" }, 500);
      }
    },
  );
}
