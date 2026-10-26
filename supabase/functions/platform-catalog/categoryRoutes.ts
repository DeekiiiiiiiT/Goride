/**
 * Expense categories save here. The fleet server keeps the read and refuses writes.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import {
  createPlatformCategory,
  mergeCategoryCatalog,
  retirePlatformCategory,
  updatePlatformCategory,
} from "../_fleet-server/platform_vendor_routes.ts";
import { requirePlatformAdmin } from "../_shared/platformAdmin.ts";

export function registerCategoryRoutes(app: Hono) {
  app.get("/admin/platform-categories", async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    return c.json({ items: await mergeCategoryCatalog() });
  });

  app.post("/admin/platform-categories", async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    if (!dominionCan(auth.role, "vendors.edit")) {
      return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const result = await createPlatformCategory(body);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ success: true, data: result.data });
  });

  app.put("/admin/platform-categories/:id", async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    if (!dominionCan(auth.role, "vendors.edit")) {
      return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const result = await updatePlatformCategory(c.req.param("id"), body);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ success: true, data: result.data });
  });

  app.delete("/admin/platform-categories/:id", async (c) => {
    const auth = await requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;
    if (!dominionCan(auth.role, "vendors.edit")) {
      return c.json({ error: "Forbidden", message: "You cannot change that" }, 403);
    }
    const result = await retirePlatformCategory(c.req.param("id"));
    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json({ success: true, data: result.data });
  });
}
