/**
 * Deno unit tests for Fuel Brain classifier v2 (residual Personal).
 */
import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { classifyFuelWeek } from "./classify.ts";

Deno.test("residual after RS/CO/capped DH goes to Personal", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 400,
    tripRideshareKm: 200,
    companyOpsKm: 0,
    deadheadHintKm: 40,
  });
  assertEquals(r.rideShareKm, 200);
  assertEquals(r.deadheadKm, 40);
  assertEquals(r.personalKm, 160);
  assertAlmostEquals(r.rideShareKm + r.companyOpsKm + r.deadheadKm + r.personalKm, 400, 0.01);
});

Deno.test("deadhead capped to Available", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 100,
    tripRideshareKm: 80,
    companyOpsKm: 10,
    deadheadHintKm: 50,
  });
  // Available = 10; deadhead capped to 10; personal = 0
  assertEquals(r.availableKm, 10);
  assertEquals(r.deadheadKm, 10);
  assertEquals(r.personalKm, 0);
});
