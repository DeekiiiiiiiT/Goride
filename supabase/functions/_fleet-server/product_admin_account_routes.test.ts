import { assertEquals } from "jsr:@std/assert@1";
import { userOnProductLine } from "./product_admin_account_routes.ts";

const owners = new Map<string, "fleet" | "enterprise">([
  ["fleet-org", "fleet"],
  ["enterprise-org", "enterprise"],
]);

Deno.test("fleet admin team is only the fleet org", () => {
  assertEquals(userOnProductLine({
    id: "1",
    user_metadata: { role: "fleet_manager", organizationId: "fleet-org" },
  }, owners, "fleet"), true);
  assertEquals(userOnProductLine({
    id: "2",
    user_metadata: { role: "fleet_manager", organizationId: "enterprise-org" },
  }, owners, "fleet"), false);
});

Deno.test("a fleet customer is not an enterprise customer", () => {
  assertEquals(userOnProductLine({
    id: "3",
    user_metadata: { role: "admin", productLine: "fleet" },
  }, owners, "fleet"), true);
  assertEquals(userOnProductLine({
    id: "3",
    user_metadata: { role: "admin", productLine: "fleet" },
  }, owners, "enterprise"), false);
});
