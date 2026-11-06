/**
 * Inventory HTTP app for Deno integration tests (no GoTrue in CI).
 */
import { Hono } from "npm:hono@4.3.11";
import { registerInventoryRoutes } from "./inventory_controller.tsx";
import type { RbacUser } from "./rbac_middleware.ts";

export const INVENTORY_API_PREFIX = "/make-server-37f42386/inventory";

export function testInventoryUser(overrides?: Partial<RbacUser>): RbacUser {
  const org = Deno.env.get("INVENTORY_TEST_ORG_ID") || "test-org-inv";
  return {
    userId: "a6e1253b-8a95-4330-9af4-b636cbd3d6aa",
    email: "inv-test@example.com",
    rawRole: "fleet_owner",
    resolvedRole: "fleet_owner",
    organizationId: org,
    ...overrides,
  };
}

export function createInventoryTestApp(user: RbacUser = testInventoryUser()) {
  const app = new Hono<{ Variables: { rbacUser?: RbacUser } }>();
  app.use("*", async (c, next) => {
    c.set("rbacUser", user);
    await next();
  });
  registerInventoryRoutes(app);
  return app;
}
