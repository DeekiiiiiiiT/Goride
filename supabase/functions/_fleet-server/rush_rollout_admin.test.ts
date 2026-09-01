/**
 * Rush rollout admin RBAC + service line sync.
 * Run: deno test --no-check rush_rollout_admin.test.ts (from this directory)
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canMutateFeatureFlag,
  isRushRolloutFlag,
  parseServiceLinesInput,
  primaryBusinessTypeFromServiceLines,
  pickRushModules,
} from "./rush_rollout_admin.ts";
import { rushModuleOverridesForServiceLines } from "./enterprise_modules.ts";
import type { RbacUser } from "./rbac_middleware.ts";

function user(partial: Partial<RbacUser> & Pick<RbacUser, "resolvedRole" | "rawRole">): RbacUser {
  return {
    userId: "u1",
    email: "t@example.com",
    organizationId: "org-a",
    ...partial,
  };
}

Deno.test("isRushRolloutFlag identifies rush rollout keys", () => {
  assertEquals(isRushRolloutFlag("rush_ui"), true);
  assertEquals(isRushRolloutFlag("strict_auth"), false);
});

Deno.test("fleet_owner cannot mutate rush rollout flags", () => {
  const fleetOwner = user({ resolvedRole: "fleet_owner", rawRole: "fleet_owner", organizationId: "org-a" });
  const result = canMutateFeatureFlag(fleetOwner, "rush_courier_link", "org-a");
  assertEquals(result.allowed, false);
});

Deno.test("platform_support cannot mutate rush rollout flags", () => {
  const support = user({ resolvedRole: "platform_support", rawRole: "platform_support" });
  const result = canMutateFeatureFlag(support, "rush_trip_projection", "org-b");
  assertEquals(result.allowed, false);
});

Deno.test("platform_owner can mutate rush rollout flags", () => {
  const owner = user({ resolvedRole: "platform_owner", rawRole: "platform_owner" });
  const result = canMutateFeatureFlag(owner, "rush_trip_projection", "org-b");
  assertEquals(result.allowed, true);
});

Deno.test("fleet_owner cannot mutate non-rush flags for foreign org", () => {
  const fleetOwner = user({ resolvedRole: "fleet_owner", rawRole: "fleet_owner", organizationId: "org-a" });
  const result = canMutateFeatureFlag(fleetOwner, "strict_org_filter", "org-b");
  assertEquals(result.allowed, false);
});

Deno.test("fleet_owner can mutate non-rush flags for own org", () => {
  const fleetOwner = user({ resolvedRole: "fleet_owner", rawRole: "fleet_owner", organizationId: "org-a" });
  const result = canMutateFeatureFlag(fleetOwner, "strict_org_filter", "org-a");
  assertEquals(result.allowed, true);
});

Deno.test("parseServiceLinesInput validates lines", () => {
  assertEquals(parseServiceLinesInput(["rideshare", "rush_delivery"]), ["rideshare", "rush_delivery"]);
  assertEquals(parseServiceLinesInput(["invalid"]), null);
  assertEquals(parseServiceLinesInput([]), null);
});

Deno.test("primaryBusinessTypeFromServiceLines", () => {
  assertEquals(primaryBusinessTypeFromServiceLines(["rideshare"]), "rideshare");
  assertEquals(primaryBusinessTypeFromServiceLines(["rush_delivery"]), "delivery");
  assertEquals(primaryBusinessTypeFromServiceLines(["rideshare", "rush_delivery"]), "rideshare");
});

Deno.test("rushModuleOverridesForServiceLines enables all rush keys when delivery selected", () => {
  const mods = rushModuleOverridesForServiceLines(["rideshare", "rush_delivery"], {});
  assertEquals(mods.rush_couriers, true);
  assertEquals(mods.rush_deliveries, true);
  assertEquals(mods.rush_courier_settlements, true);
  assertEquals(pickRushModules(mods).rush_supply_health, true);
});

Deno.test("rushModuleOverridesForServiceLines disables rush keys without delivery", () => {
  const mods = rushModuleOverridesForServiceLines(["rideshare"], { rush_couriers: true });
  assertEquals(mods.rush_couriers, false);
});
