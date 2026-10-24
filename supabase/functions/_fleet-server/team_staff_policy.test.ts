import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  authMetaOrgId,
  authMetaRole,
  canChangeStaffRole,
  canGrantRole,
  canRemoveStaffSeat,
  mayDeleteAccountFromFleetRoute,
  mayWriteAnotherUsersRole,
  mayWriteCustomerProfile,
  namesMatch,
} from "./team_staff_policy.ts";

Deno.test("auth meta ignores user_metadata", () => {
  const u = {
    app_metadata: {},
    user_metadata: { organizationId: "org-1", role: "fleet_manager" },
  };
  assertEquals(authMetaOrgId(u), undefined);
  assertEquals(authMetaRole(u), "");
});

Deno.test("role change and remove refuse drivers and owners", () => {
  assertEquals(canChangeStaffRole("driver").ok, false);
  assertEquals(canChangeStaffRole("fleet_manager").ok, true);
  assertEquals(canRemoveStaffSeat("courier").ok, false);
  assertEquals(canRemoveStaffSeat("fleet_owner").ok, false);
  assertEquals(canRemoveStaffSeat("enterprise_dispatcher").ok, true);
});

Deno.test("grantor cannot grant their own level or owner", () => {
  assertEquals(canGrantRole(900, 700, "fleet_manager"), true);
  assertEquals(canGrantRole(700, 700, "fleet_manager"), false);
  assertEquals(canGrantRole(900, 900, "fleet_owner"), false);
  assertEquals(canGrantRole(900, 100, "driver"), false);
});

Deno.test("typed confirmation matches the person's name", () => {
  assertEquals(namesMatch("  Kenny Rattray ", "kenny rattray"), true);
  assertEquals(namesMatch("Ken", "Kenny"), false);
});

Deno.test("fleet owner cannot set a role or delete an account", () => {
  assertEquals(mayWriteAnotherUsersRole(false), false);
  assertEquals(mayWriteCustomerProfile(false), false);
  assertEquals(mayDeleteAccountFromFleetRoute(), false);
  assertEquals(mayWriteAnotherUsersRole(true), true);
  assertEquals(mayWriteCustomerProfile(true), true);
});
