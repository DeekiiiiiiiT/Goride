import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertCatalogStaffReadResponse, assertCatalogWriteResponse } from "./catalog_access.ts";
import type { Context } from "npm:hono@4.3.11";

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

Deno.test("vehicle catalog GET allows platform_analyst (staff read)", () => {
  assertEquals(assertCatalogStaffReadResponse(mockContext("platform_analyst")), null);
});

Deno.test("catalog admin writes block platform_analyst (catalog.write)", () => {
  const denied = assertCatalogWriteResponse(mockContext("platform_analyst"));
  assertEquals(denied?.status, 403);
});

Deno.test("catalog admin writes allow platform_support", () => {
  assertEquals(assertCatalogWriteResponse(mockContext("platform_support")), null);
});
