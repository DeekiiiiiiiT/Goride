/**
 * Deno unit tests. The 35% floor is gone. Personal is not the remainder.
 */
import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { classifyFuelWeek } from "./classify.ts";

Deno.test("hint is kept and the remainder is unattributed", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 400,
    tripRideshareKm: 200,
    companyOpsKm: 0,
    deadheadHintKm: 40,
    industryFallbackPct: 35,
  });
  assertEquals(r.rideShareKm, 200);
  assertAlmostEquals(r.deadheadKm, 40, 0.01);
  assertEquals(r.personalKm, 0);
  assertAlmostEquals(r.unattributedKm, 160, 0.01);
});

Deno.test("under-claim is not raised to 35% of available", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 1819,
    tripRideshareKm: 1169,
    companyOpsKm: 0,
    deadheadHintKm: 20,
    industryFallbackPct: 35,
  });
  assertEquals(r.availableKm, 650);
  assertAlmostEquals(r.deadheadKm, 20, 0.01);
  assertEquals(r.personalKm, 0);
  assertAlmostEquals(r.unattributedKm, 630, 0.01);
});

Deno.test("deadhead capped to Available", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 100,
    tripRideshareKm: 80,
    companyOpsKm: 10,
    deadheadHintKm: 50,
  });
  assertEquals(r.availableKm, 10);
  assertEquals(r.deadheadKm, 10);
  assertEquals(r.personalKm, 0);
  assertEquals(r.unattributedKm, 0);
});

Deno.test("hint above the old floor is kept and personal stays 0", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 500,
    tripRideshareKm: 300,
    companyOpsKm: 0,
    deadheadHintKm: 120,
    industryFallbackPct: 35,
  });
  assertEquals(r.deadheadKm, 120);
  assertEquals(r.personalKm, 0);
  assertEquals(r.unattributedKm, 80);
});
