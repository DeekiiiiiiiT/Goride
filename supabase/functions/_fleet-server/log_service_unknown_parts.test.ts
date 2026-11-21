/**
 * deno test --no-check --allow-env supabase/functions/_fleet-server/log_service_unknown_parts.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { COMPLETION_STEP_NAMES } from "./maintenance_completion.ts";

Deno.test("queueUnknownParts is not a failing completion step (it runs after finish, best effort)", () => {
  assertEquals(COMPLETION_STEP_NAMES.includes("queueUnknownParts"), false);
});
Deno.test("recordVisibleToOrg is filterByOrg's rule: legacy cars with no org pass, other companies don't", async () => {
  const { recordVisibleToOrg } = await import("./org_scope.ts");
  const org = "org-a";
  if (!recordVisibleToOrg({ organizationId: "org-a" }, org)) throw new Error("own car must pass");
  if (!recordVisibleToOrg({}, org)) throw new Error("legacy car with no org must pass (as filterByOrg)");
  if (recordVisibleToOrg({ organizationId: "org-b" }, org)) throw new Error("another company's car must not pass");
});
