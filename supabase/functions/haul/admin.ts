import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { Hono as HonoCtor } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../_shared/productAdmin.ts";
import { getRidesAdminDb } from "../_shared/ridesAdminDb.ts";
import { registerHaulageCatalogAdminRoutes } from "../rides/admin/haulageCatalog.ts";

export function registerHaulAdminRoutes(app: Hono) {
  const admin = new HonoCtor();

  admin.use("*", async (c, next) => {
    const user = await requireProductAdmin(c, "haul");
    if (user instanceof Response) return user;
    await next();
  });

  registerHaulageCatalogAdminRoutes(admin, async (c) => {
    try {
      return await getRidesAdminDb();
    } catch (e) {
      return c.json({
        error: "rides_admin_db_unavailable",
        message: e instanceof Error ? e.message : "DB unavailable",
      }, 503);
    }
  });

  app.route("/admin", admin);
}
