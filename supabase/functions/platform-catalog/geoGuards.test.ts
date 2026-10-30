import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { draftDiscardStatus, outsideJamaica } from "./geoGuards.ts";

Deno.test("U4 discarding a published border is a 400", () => {
  assertEquals(draftDiscardStatus("not_a_draft"), 400);
  assertEquals(draftDiscardStatus("version_not_found"), 400);
  assertEquals(draftDiscardStatus("database unavailable"), 500);
});

Deno.test("U7 a pin at 0,0 is outside Jamaica and a Kingston pin is not", () => {
  assertEquals(outsideJamaica(0, 0), true);
  assertEquals(outsideJamaica(18.0179, -76.8099), false);
});
