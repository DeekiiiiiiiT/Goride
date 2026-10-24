import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GEOGRAPHY_MANAGED_MESSAGE, geographyManagedResponse } from "./geoManaged.ts";

Deno.test("geography writes tell Rush the map lives in Dominion", async () => {
  const res = geographyManagedResponse();
  assertEquals(res.status, 410);
  const body = await res.json();
  assertEquals(body.message, GEOGRAPHY_MANAGED_MESSAGE);
});
