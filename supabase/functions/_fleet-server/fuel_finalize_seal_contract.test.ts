/**
 * Fuel finalize seal contract — worker clears FUEL_STATEMENT_MISSING after sealFuelWeek
 * (desk/blockers refresh is queued, not inline — WRA-68).
 */
import { assertEquals } from "jsr:@std/assert";
import {
  SERVER_STEP_BY_BLOCKER,
  countBlockersForStep,
} from "../../../packages/finance-core/src/closeBlockerSteps.ts";

Deno.test("Finalize seal contract: FUEL_STATEMENT_MISSING maps to fuel step", () => {
  assertEquals(SERVER_STEP_BY_BLOCKER.FUEL_STATEMENT_MISSING, "fuel");
  const withMissing = [
    { code: "FUEL_STATEMENT_MISSING", severity: "block" as const },
  ];
  assertEquals(countBlockersForStep("fuel", withMissing), 1);
  assertEquals(countBlockersForStep("fuel", []), 0);
});

Deno.test("Finalize seal contract: live fuel step maxes stored blockers (toll-bug shape)", () => {
  // computeLiveStepCounts: fuelActionable = Math.max(periodProbe, storedFuelBlockers).
  // Locked period probe = 0, but leftover FUEL_STATEMENT_MISSING keeps actionable ≥ 1.
  const periodProbe = 0;
  const stored = countBlockersForStep("fuel", [
    { code: "FUEL_STATEMENT_MISSING", severity: "block" },
  ]);
  assertEquals(Math.max(periodProbe, stored), 1);
  assertEquals(Math.max(periodProbe, countBlockersForStep("fuel", [])), 0);
});
