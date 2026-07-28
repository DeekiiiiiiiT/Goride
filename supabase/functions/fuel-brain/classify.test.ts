/**
 * Deno unit tests for Fuel Brain classifier v2 (residual Personal + Deadhead floor).
 */
import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { classifyFuelWeek } from "./classify.ts";

Deno.test("residual after RS/CO/floored DH goes to Personal", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 400,
    tripRideshareKm: 200,
    companyOpsKm: 0,
    deadheadHintKm: 40,
    industryFallbackPct: 35,
  });
  assertEquals(r.rideShareKm, 200);
  // Available = 200; floor = 70; hint 40 → Deadhead 70
  assertAlmostEquals(r.deadheadKm, 70, 0.01);
  assertAlmostEquals(r.personalKm, 130, 0.01);
  assertAlmostEquals(r.rideShareKm + r.companyOpsKm + r.deadheadKm + r.personalKm, 400, 0.01);
});

Deno.test("Kenny-like under-claim raises Deadhead to 35% of Available", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 1819,
    tripRideshareKm: 1169,
    companyOpsKm: 0,
    deadheadHintKm: 20,
    industryFallbackPct: 35,
  });
  assertEquals(r.availableKm, 650);
  assertAlmostEquals(r.deadheadKm, 227.5, 0.01);
  assertAlmostEquals(r.personalKm, 422.5, 0.01);
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

Deno.test("hint above floor is kept", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 500,
    tripRideshareKm: 300,
    companyOpsKm: 0,
    deadheadHintKm: 120,
    industryFallbackPct: 35,
  });
  assertEquals(r.deadheadKm, 120);
  assertEquals(r.personalKm, 80);
});
