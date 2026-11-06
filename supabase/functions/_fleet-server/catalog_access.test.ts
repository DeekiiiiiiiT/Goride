import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";

Deno.test("catalog.govern is owner and superadmin only", () => {
  assertEquals(dominionCan("platform_owner", "catalog.govern"), true);
  assertEquals(dominionCan("superadmin", "catalog.govern"), true);
  assertEquals(dominionCan("platform_support", "catalog.govern"), false);
  assertEquals(dominionCan("platform_analyst", "catalog.govern"), false);
});

Deno.test("platform_support keeps catalog.write", () => {
  assertEquals(dominionCan("platform_support", "catalog.write"), true);
  assertEquals(dominionCan("platform_analyst", "catalog.write"), false);
});
