import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MAINTENANCE_MASTER_ROUTE_GUARDS, proposalReplay } from "./maintenance_master_routes.ts";

Deno.test("approve replays each support request through the owner's own route", () => {
  assertEquals(proposalReplay("create_active_rule", "new", { a: 1 }), { method: "POST", path: "/admin/maintenance/rules", body: { a: 1 } });
  assertEquals(proposalReplay("patch_rule", "r1", { b: 2 }), { method: "PATCH", path: "/admin/maintenance/rules/r1", body: { b: 2 } });
  assertEquals(proposalReplay("retire_rule", "r1", {}), { method: "POST", path: "/admin/maintenance/rules/r1/retire" });
  assertEquals(proposalReplay("something_else", "x", {}), null);
});

Deno.test("approve and reject need the owner's govern permission", () => {
  assertEquals(MAINTENANCE_MASTER_ROUTE_GUARDS["POST /admin/maintenance/proposals/:id/approve"], "catalog.govern");
  assertEquals(MAINTENANCE_MASTER_ROUTE_GUARDS["POST /admin/maintenance/proposals/:id/reject"], "catalog.govern");
});
