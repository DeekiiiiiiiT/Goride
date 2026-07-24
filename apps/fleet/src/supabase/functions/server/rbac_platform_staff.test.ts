/**
 * Evidence Bridge Phase 1/6 — platform staff gate matrix.
 * Run: deno test --no-check rbac_platform_staff.test.ts (from this directory)
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hasPlatformStaffAccess,
  PLATFORM_RESOLVED_ROLES,
  PLATFORM_STAFF_RAW_ROLES,
  type RbacUser,
} from "./rbac_middleware.ts";

function user(partial: Partial<RbacUser> & Pick<RbacUser, "resolvedRole" | "rawRole">): RbacUser {
  return {
    userId: "u1",
    email: "t@example.com",
    organizationId: "org-a",
    ...partial,
  };
}

Deno.test("PLATFORM_RESOLVED_ROLES is owner + support + analyst", () => {
  assertEquals([...PLATFORM_RESOLVED_ROLES].sort().join(","), "platform_analyst,platform_owner,platform_support");
});

Deno.test("PLATFORM_STAFF_RAW_ROLES includes legacy superadmin + analyst", () => {
  assertEquals(PLATFORM_STAFF_RAW_ROLES.has("superadmin"), true);
  assertEquals(PLATFORM_STAFF_RAW_ROLES.has("platform_analyst"), true);
  assertEquals(PLATFORM_STAFF_RAW_ROLES.has("fleet_admin"), false);
});

Deno.test("hasPlatformStaffAccess accepts platform_owner / support / analyst", () => {
  assertEquals(hasPlatformStaffAccess(user({ resolvedRole: "platform_owner", rawRole: "platform_owner" })), true);
  assertEquals(hasPlatformStaffAccess(user({ resolvedRole: "platform_support", rawRole: "platform_support" })), true);
  assertEquals(hasPlatformStaffAccess(user({ resolvedRole: "platform_analyst", rawRole: "platform_analyst" })), true);
});

Deno.test("hasPlatformStaffAccess accepts legacy superadmin raw role", () => {
  assertEquals(
    hasPlatformStaffAccess(user({ resolvedRole: "platform_owner", rawRole: "superadmin" })),
    true,
  );
});

Deno.test("hasPlatformStaffAccess rejects fleet_owner / fleet product admins", () => {
  assertEquals(hasPlatformStaffAccess(user({ resolvedRole: "fleet_owner", rawRole: "fleet_owner" })), false);
  assertEquals(hasPlatformStaffAccess(user({ resolvedRole: "fleet_manager", rawRole: "fleet_admin" })), false);
  assertEquals(hasPlatformStaffAccess(user({ resolvedRole: "fleet_viewer", rawRole: "fleet_ops" })), false);
});
