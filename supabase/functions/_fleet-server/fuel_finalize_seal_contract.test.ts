/**
 * Fuel finalize seal contract — mirrors toll_finish_seal_path.test.ts.
 * After sealFuelWeek, runSealSideEffects must clear FUEL_STATEMENT_MISSING
 * or steps/fuel/complete stays 409 STEP_HAS_ACTIONABLE.
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
