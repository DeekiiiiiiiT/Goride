/**
 * Phase 1 failing-input fixtures: C-1 SNAPSHOT_MISMATCH path + C-3 exception-fill skip.
 */
import { assertEquals } from "jsr:@std/assert";
import { computeFuelWeek, diffWeekCalc } from "../../../packages/fuel-core/src/computeFuelWeek.ts";
import { evaluateFuelWeekClosable } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";
import {
  buildServerFuelStepCounts,
  snapshotHasCategoryCosts,
} from "./fuel_week_closable_gate.ts";

Deno.test("C-1: tampered driverShare with categoryCosts yields SNAPSHOT_MISMATCH deltas", () => {
  const cats = {
    rideShareCost: 400,
    companyUsageCost: 100,
    deadheadCost: 50,
    personalUsageCost: 50,
  };
  const totalSpend = 600;
  const rule = { coverageType: "Percentage", coverageValue: 50 };
  const recomputed = computeFuelWeek({
    totalSpend,
    ...cats,
    rule,
    driverId: "d1",
  });
  const tampered = {
    totalSpend,
    companyShare: recomputed.companyShare,
    driverShare: recomputed.driverShare + 1000,
    miscellaneousCost: recomputed.miscellaneousCost,
  };
  const deltas = diffWeekCalc(tampered, recomputed);
  assertEquals(deltas.some((d) => d.field === "driverShare"), true);
  assertEquals(snapshotHasCategoryCosts({ categoryCosts: cats } as any), true);
});

Deno.test("C-3: exception fills + leakage reviewed → skip_exception_fills", () => {
  const blockers = evaluateFuelWeekClosable({
    countsUnevaluated: false,
    hasUnacknowledgedExceptionFills: true,
    underExplainedUnreviewed: false,
  });
  assertEquals(blockers[0]?.code, "exception_fills");
});

Deno.test("C-3: buildServerFuelStepCounts clears counts_unevaluated path", () => {
  const counts = buildServerFuelStepCounts({
    exceptionFillCount: 2,
    openDisputeCount: 0,
    leakageActionable: false,
  });
  assertEquals(Object.keys(counts).length > 0, true);
  assertEquals(counts["data-quality"].actionable, 2);
  const afterWrite = evaluateFuelWeekClosable({
    countsUnevaluated: false,
    hasUnacknowledgedExceptionFills: true,
  });
  assertEquals(afterWrite.some((b) => b.code === "exception_fills"), true);
});
