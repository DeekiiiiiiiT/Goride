/**
 * Admin API for app permission policy (rider + driver surfaces).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin, type ProductKey } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import type { AppPermissionSurface } from "../../_shared/appPermissionCatalog.ts";
import {
  loadAppPermissionPolicy,
  parsePolicyPatches,
  patchAppPermissionPolicy,
  policyDto,
} from "../../_shared/appPermissionPolicy.ts";

const RIDES_WRITE_ROLES = new Set(["platform_owner", "superadmin", "rides_admin"]);
const DRIVER_WRITE_ROLES = new Set(["platform_owner", "superadmin", "driver_admin"]);

function parseSurface(raw: string | undefined): AppPermissionSurface | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "rider" || s === "driver") return s;
  return null;
}

function productForSurface(surface: AppPermissionSurface): ProductKey {
  return surface === "driver" ? "driver" : "rides";
}

function canWrite(surface: AppPermissionSurface, role: string): boolean {
  const set = surface === "driver" ? DRIVER_WRITE_ROLES : RIDES_WRITE_ROLES;
  return set.has(role);
}

export function registerAppPermissionAdminRoutes(
  admin: Hono,
  ridesDbOrResponse: (
    c: { json: (body: unknown, status?: number) => Response },
  ) => Promise<{ db: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient; tables: RidesAdminTables } | Response>,
  adminAudit: (
    db: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient,
    tables: RidesAdminTables,
    actorId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  admin.get("/app-permissions", async (c) => {
    const surface = parseSurface(c.req.query("surface"));
    if (!surface) return c.json({ error: "invalid_surface" }, 400);

    const adminUser = await requireProductAdmin(c, productForSurface(surface));
    if (adminUser instanceof Response) return adminUser;

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const permissions = await loadAppPermissionPolicy(db, tables.app_permission_policy, surface);
    return c.json(policyDto(permissions));
  });

  admin.patch("/app-permissions", async (c) => {
    const surface = parseSurface(c.req.query("surface"));
    if (!surface) return c.json({ error: "invalid_surface" }, 400);

    const adminUser = await requireProductAdmin(c, productForSurface(surface));
    if (adminUser instanceof Response) return adminUser;

    if (!canWrite(surface, adminUser.role)) {
      return c.json({
        error: "forbidden",
        message: `${surface === "driver" ? "driver_admin" : "rides_admin"} role required`,
      }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const parsed = parsePolicyPatches(surface, body.permissions);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    try {
      const permissions = await patchAppPermissionPolicy(
        db,
        tables.app_permission_policy,
        surface,
        parsed.patches,
        adminUser.id,
      );
      await adminAudit(db, tables, adminUser.id, "admin_app_permission_policy_updated", {
        surface,
        keys: parsed.patches.map((p) => p.key),
      });
      return c.json(policyDto(permissions));
    } catch (e) {
      const message = e instanceof Error ? e.message : "update_failed";
      return c.json({ error: "update_failed", message }, 500);
    }
  });
}
