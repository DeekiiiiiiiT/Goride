/**
 * Company scoping + org-settings permission gate (G1.10 done-tests).
 * deno test --allow-read --allow-env register_fleet_bank_routes.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { Hono } from "npm:hono@4.3.11";
import { requireAnyPermission, type RbacUser } from "./rbac_middleware.ts";
import { resolveRouteCompany } from "./route_company.ts";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const here = new URL("./", import.meta.url);
const read = (f: string) => Deno.readTextFile(new URL(f, here));

function user(role: RbacUser["resolvedRole"], organizationId: string | null): RbacUser {
  return {
    userId: "user-1",
    email: "u@roam.test",
    rawRole: role,
    resolvedRole: role,
    organizationId,
  };
}

function orgSettingsPutApp(rbacUser: RbacUser | undefined) {
  const app = new Hono<{ Variables: { rbacUser: RbacUser } }>();
  if (rbacUser) {
    app.use("*", async (c, next) => {
      c.set("rbacUser", rbacUser);
      await next();
    });
  }
  app.put(
    "/make-server-37f42386/organization-settings",
    requireAnyPermission("settings.edit", "toll.manage"),
    (c) => c.json({ success: true }),
  );
  return app;
}

Deno.test("routes: PUT/DELETE bank confirms and org settings use resolveRouteCompany", async () => {
  const src = await read("register_fleet_bank_routes.ts");
  assert(!src.includes("Legacy fallback when session has no org id"), "legacy PUT write removed");
  assert(src.includes('resolveRouteCompany(getOrgId(c), body?.organizationId)'), "PUT bank confirm");
  assert(src.includes('resolveRouteCompany(getOrgId(c), c.req.query("organizationId"))'), "DELETE bank confirm");
  assert(src.includes('emptyOrganizationSettings(orgId)'), "GET org settings empty on stamp mismatch");
  assert(
    src.includes('requireAnyPermission("settings.edit", "toll.manage")'),
    "PUT org settings permission",
  );
});

Deno.test("done-test 6: fleet_viewer cannot PUT organization-settings (403)", async () => {
  const res = await orgSettingsPutApp(user("fleet_viewer", ORG_A)).request(
    "/make-server-37f42386/organization-settings",
    { method: "PUT" },
  );
  assertEquals(res.status, 403);
});

Deno.test("done-test 6: driver cannot PUT organization-settings (403)", async () => {
  const res = await orgSettingsPutApp(user("driver", ORG_A)).request(
    "/make-server-37f42386/organization-settings",
    { method: "PUT" },
  );
  assertEquals(res.status, 403);
});

Deno.test("done-test 6: fleet_manager can PUT organization-settings (toll.manage)", async () => {
  const res = await orgSettingsPutApp(user("fleet_manager", ORG_A)).request(
    "/make-server-37f42386/organization-settings",
    { method: "PUT" },
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true });
});

Deno.test("done-test 6: fleet_owner can PUT organization-settings (settings.edit)", async () => {
  const res = await orgSettingsPutApp(user("fleet_owner", ORG_A)).request(
    "/make-server-37f42386/organization-settings",
    { method: "PUT" },
  );
  assertEquals(res.status, 200);
});

Deno.test("resolveRouteCompany guards done-tests 1/3/4/5", () => {
  assertEquals(resolveRouteCompany(null, ORG_A), { ok: false, status: 400, code: "NO_COMPANY" });
  const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  assertEquals(resolveRouteCompany(ORG_A, other), { ok: false, status: 403, code: "COMPANY_MISMATCH" });
  assertEquals(resolveRouteCompany(ORG_A, undefined), { ok: true, orgId: ORG_A });
});
