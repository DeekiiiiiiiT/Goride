import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveAccess } from "./access_resolution.ts";

const manager = {
  id: "seat-1",
  status: "active",
  scopeId: "org-1",
  roleName: "fleet_manager",
  grantedAt: "2026-01-01T00:00:00Z",
};

Deno.test("suspended staff do not keep the login role", () => {
  const decision = resolveAccess({
    jwtRole: "fleet_manager",
    jwtOrgId: "org-1",
    seats: [{ ...manager, status: "suspended" }],
    ownedOrgs: [],
    memberships: [],
  });
  assertEquals(decision.resolvedRole, "unassigned");
  assertEquals(decision.portal, false);
  assertEquals(decision.organizationId, null);
});

Deno.test("active seat beats a different login role", () => {
  const decision = resolveAccess({
    jwtRole: "driver",
    jwtOrgId: "org-1",
    seats: [manager],
    ownedOrgs: [],
    memberships: [],
  });
  assertEquals(decision.rawRole, "driver");
  assertEquals(decision.resolvedRole, "fleet_manager");
  assertEquals(decision.staffRole, "fleet_manager");
  assertEquals(decision.portal, true);
});

Deno.test("owner record grants the dashboard when the login still says manager", () => {
  const decision = resolveAccess({
    jwtRole: "fleet_manager",
    jwtOrgId: "org-1",
    seats: [manager],
    ownedOrgs: [{ id: "org-1", productLine: "fleet" }],
    memberships: [],
  });
  assertEquals(decision.resolvedRole, "fleet_owner");
  assertEquals(decision.organizationId, "org-1");
});

Deno.test("two active seats and no matching fleet stay unassigned", () => {
  const decision = resolveAccess({
    jwtRole: "admin",
    jwtOrgId: null,
    seats: [
      manager,
      { ...manager, id: "seat-2", scopeId: "org-2", grantedAt: "2026-02-01T00:00:00Z" },
    ],
    ownedOrgs: [],
    memberships: [],
  });
  assertEquals(decision.resolvedRole, "unassigned");
  assertEquals(decision.organizationId, null);
});

Deno.test("open membership keeps a driver on that fleet", () => {
  const decision = resolveAccess({
    jwtRole: "driver",
    jwtOrgId: "old-org",
    seats: [],
    ownedOrgs: [],
    memberships: [{ organizationId: "org-9", serviceLine: "rideshare", status: "active" }],
  });
  assertEquals(decision.resolvedRole, "driver");
  assertEquals(decision.organizationId, "org-9");
});

Deno.test("platform role stays platform", () => {
  const decision = resolveAccess({
    jwtRole: "platform_owner",
    jwtOrgId: "org-1",
    seats: [manager],
    ownedOrgs: [],
    memberships: [],
  });
  assertEquals(decision.resolvedRole, "platform_owner");
  assertEquals(decision.staffRole, null);
});
