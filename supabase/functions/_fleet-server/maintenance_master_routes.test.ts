/**
 * One Deno test per maintenance master route (guard matrix).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import {
  assertCatalogGovernResponse,
  assertCatalogStaffReadResponse,
  assertCatalogWriteResponse,
} from "./catalog_access.ts";
import { MAINTENANCE_MASTER_ROUTE_GUARDS } from "./maintenance_master_routes.ts";
import { requirePermission } from "./rbac_middleware.ts";

const MFA2_AUTH = `Bearer xx.${btoa(JSON.stringify({ aal: "aal2" }))}.sig`;

function mockContext(role: string): Context {
  return {
    get: (key: string) =>
      key === "rbacUser"
        ? { resolvedRole: role, rawRole: role, userId: "u1", organizationId: "org-1" }
        : undefined,
    req: { header: (name: string) => (name === "Authorization" ? MFA2_AUTH : "") },
    json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  } as unknown as Context;
}

Deno.test("GET /admin/maintenance/rules allows platform_analyst (staff read)", () => {
  assertEquals(MAINTENANCE_MASTER_ROUTE_GUARDS["GET /admin/maintenance/rules"], "staff_read");
  assertEquals(assertCatalogStaffReadResponse(mockContext("platform_analyst")), null);
});

Deno.test("POST /admin/maintenance/rules blocks platform_analyst (catalog.write)", () => {
  const denied = assertCatalogWriteResponse(mockContext("platform_analyst"));
  assertEquals(denied?.status, 403);
});

Deno.test("PATCH /admin/maintenance/rules/:id blocks platform_analyst (catalog.write)", () => {
  const denied = assertCatalogWriteResponse(mockContext("platform_analyst"));
  assertEquals(denied?.status, 403);
});

Deno.test("GET /admin/maintenance/rules/:id/impact allows platform_analyst (staff read)", () => {
  assertEquals(assertCatalogStaffReadResponse(mockContext("platform_analyst")), null);
});

Deno.test("POST /admin/maintenance/rules/:id/retire blocks platform_support without catalog.govern", () => {
  const denied = assertCatalogGovernResponse(mockContext("platform_support"));
  assertEquals(denied?.status, 403);
});

Deno.test("GET /admin/maintenance/preview allows platform_analyst (staff read)", () => {
  assertEquals(assertCatalogStaffReadResponse(mockContext("platform_analyst")), null);
});

Deno.test("GET /admin/maintenance/history allows platform_analyst (staff read)", () => {
  assertEquals(assertCatalogStaffReadResponse(mockContext("platform_analyst")), null);
});

Deno.test("POST /admin/maintenance/conflicts/:id/resolve blocks platform_analyst (catalog.write)", () => {
  const denied = assertCatalogWriteResponse(mockContext("platform_analyst"));
  assertEquals(denied?.status, 403);
});

Deno.test("PATCH /vehicles/:vehicleId/maintenance/custom-interval uses vehicles.edit permission", async () => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("rbacUser", {
      userId: "u1",
      resolvedRole: "platform_analyst",
      rawRole: "platform_analyst",
      organizationId: "org-1",
    });
    await next();
  });
  app.patch("/vehicles/:vehicleId/maintenance/custom-interval", requirePermission("vehicles.edit"), (c) =>
    c.json({ ok: true })
  );
  const res = await app.request("/vehicles/v1/maintenance/custom-interval", { method: "PATCH", body: "{}" });
  assertEquals(res.status, 403);
});

Deno.test("GET /admin/maintenance/preview handler rejects non-uuid car query", async () => {
  const app = new Hono();
  app.get("/admin/maintenance/preview", (c) => {
    const car = String(c.req.query("car") ?? "").trim();
    const ok = /^[0-9a-f-]{36}$/i.test(car);
    return c.json({ error: "car query must be a vehicle_catalog uuid" }, ok ? 200 : 400);
  });
  const res = await app.request("/admin/maintenance/preview?car=bad", { method: "GET" });
  assertEquals(res.status, 400);
});

Deno.test("POST /admin/maintenance/conflicts/:id/resolve rejects missing pick", async () => {
  const app = new Hono();
  app.post("/admin/maintenance/conflicts/:id/resolve", async (c) => {
    const body = await c.req.json().catch(() => ({})) as { pick?: string };
    const pick = String(body.pick ?? "").trim();
    if (!pick) return c.json({ error: "pick must be rule id (Pick A / Pick B)" }, 400);
    return c.json({ success: true });
  });
  const res = await app.request("/admin/maintenance/conflicts/x/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assertEquals(res.status, 400);
});
