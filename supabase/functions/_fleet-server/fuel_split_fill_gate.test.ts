/**
 * Gate tests for assertSplitFillAllowedAsync — RBAC + fuelSplitPayment opt-in.
 */
import { assertEquals } from "jsr:@std/assert";
import type { Context } from "npm:hono@4.3.11";
import type { RbacUser } from "./rbac_middleware.ts";
import {
  assertSplitFillAllowedAsync,
  resolveSplitFillOrgId,
} from "./fuel_split_fill.ts";

function mockContext(rbacUser: RbacUser | undefined): Context {
  return {
    get: (key: string) => (key === "rbacUser" ? rbacUser : undefined),
  } as unknown as Context;
}

function user(partial: Partial<RbacUser> & Pick<RbacUser, "resolvedRole">): RbacUser {
  return {
    userId: partial.userId ?? "user-1",
    email: partial.email ?? "t@example.com",
    rawRole: partial.rawRole ?? partial.resolvedRole,
    resolvedRole: partial.resolvedRole,
    organizationId: partial.organizationId === undefined ? "org-1" : partial.organizationId,
  };
}

Deno.test("assertSplitFillAllowedAsync: 401 when no rbacUser", async () => {
  const result = await assertSplitFillAllowedAsync(mockContext(undefined), async () => true);
  assertEquals(result.allowed, false);
  if (!result.allowed) assertEquals(result.status, 401);
});

Deno.test("assertSplitFillAllowedAsync: 403 RBAC when fleet_viewer", async () => {
  const result = await assertSplitFillAllowedAsync(
    mockContext(user({ resolvedRole: "fleet_viewer", organizationId: "org-1" })),
    async () => true,
  );
  assertEquals(result.allowed, false);
  if (!result.allowed) {
    assertEquals(result.status, 403);
    assertEquals(result.body.required, "fuel.create_entry");
  }
});

Deno.test("assertSplitFillAllowedAsync: MODULE_DISABLED when no resolvable orgId", async () => {
  const calls: string[] = [];
  const result = await assertSplitFillAllowedAsync(
    mockContext(user({
      resolvedRole: "driver",
      organizationId: null,
      userId: "drv-1",
    })),
    async (orgId) => {
      calls.push(orgId);
      return true;
    },
  );
  assertEquals(result.allowed, false);
  if (!result.allowed) {
    assertEquals(result.status, 403);
    assertEquals(result.body.code, "MODULE_DISABLED");
  }
  assertEquals(calls.length, 0);
});

Deno.test("resolveSplitFillOrgId: fleet_owner falls back to userId", () => {
  const rbac = user({
    resolvedRole: "fleet_owner",
    organizationId: null,
    userId: "owner-uuid",
  });
  // getOrgId also reads organizationId from rbac — null for both → userId fallback
  assertEquals(resolveSplitFillOrgId(mockContext(rbac), rbac), "owner-uuid");
});

Deno.test("resolveSplitFillOrgId: admin rawRole falls back to userId", () => {
  const rbac = user({
    resolvedRole: "fleet_manager",
    rawRole: "admin",
    organizationId: null,
    userId: "admin-uuid",
  });
  assertEquals(resolveSplitFillOrgId(mockContext(rbac), rbac), "admin-uuid");
});

Deno.test("assertSplitFillAllowedAsync: fleet_owner fallback then module off → MODULE_DISABLED", async () => {
  const seen: string[] = [];
  const result = await assertSplitFillAllowedAsync(
    mockContext(user({
      resolvedRole: "fleet_owner",
      organizationId: null,
      userId: "owner-uuid",
    })),
    async (orgId) => {
      seen.push(orgId);
      return false;
    },
  );
  assertEquals(seen, ["owner-uuid"]);
  assertEquals(result.allowed, false);
  if (!result.allowed) {
    assertEquals(result.status, 403);
    assertEquals(result.body.code, "MODULE_DISABLED");
    assertEquals(result.body.module, "fuelSplitPayment");
  }
});

Deno.test("assertSplitFillAllowedAsync: module on → allowed for driver", async () => {
  const result = await assertSplitFillAllowedAsync(
    mockContext(user({ resolvedRole: "driver", organizationId: "org-abc" })),
    async (orgId, key) => orgId === "org-abc" && key === "fuelSplitPayment",
  );
  assertEquals(result.allowed, true);
});

Deno.test("assertSplitFillAllowedAsync: module off with org → MODULE_DISABLED", async () => {
  const result = await assertSplitFillAllowedAsync(
    mockContext(user({ resolvedRole: "fleet_manager", organizationId: "org-abc" })),
    async () => false,
  );
  assertEquals(result.allowed, false);
  if (!result.allowed) {
    assertEquals(result.status, 403);
    assertEquals(result.body.code, "MODULE_DISABLED");
  }
});
