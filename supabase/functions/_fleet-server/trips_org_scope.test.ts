/**
 * Run: deno test --no-check trips_org_scope.test.ts
 */
/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertTripOrgScopeMatches } from "./trips_org_scope.ts";

Deno.test("V22 rejects cross-org organizationId on public trips import", () => {
  const result = assertTripOrgScopeMatches(
    [{ organizationId: "org-other" }],
    "org-mine",
  );
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.status, 403);
    assertEquals(result.error, "organizationId must match authenticated fleet");
  }
});

Deno.test("V22 allows matching or missing organizationId", () => {
  assertEquals(assertTripOrgScopeMatches([{ organizationId: "org-mine" }], "org-mine").ok, true);
  assertEquals(assertTripOrgScopeMatches([{}], "org-mine").ok, true);
});
