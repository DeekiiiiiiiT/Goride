/**
 * Deno unit tests for Fuel Brain classifier (Edge mirror).
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { classifyFuelWeek } from "./classify.ts";

Deno.test("no sessions → Unknown not Personal", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 100,
    tripRideshareKm: 40,
    companyOpsKm: 0,
    sessions: [],
    deadheadHintKm: 10,
  });
  assertEquals(r.personalKm, 0);
  assertEquals(r.deadheadKm, 10);
  assertEquals(r.unknownKm, 50);
});

Deno.test("declared personal odo session", () => {
  const r = classifyFuelWeek({
    totalOdometerKm: 200,
    tripRideshareKm: 100,
    companyOpsKm: 0,
    sessions: [
      {
        mode: "personal",
        startAt: "2026-07-01T00:00:00Z",
        endAt: "2026-07-01T02:00:00Z",
        startOdo: 0,
        endOdo: 30,
      },
    ],
    deadheadHintKm: 20,
  });
  assertEquals(r.personalKm, 30);
  assertEquals(r.deadheadKm, 20);
  assertEquals(r.unknownKm, 50);
});
