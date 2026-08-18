import { assertEquals } from "jsr:@std/assert";
import { validateFinalizedReportArithmetic } from "./fuel_finalize_arithmetic.ts";
import { blendedDriverShareRatio } from "./fuel_blended_ratio.ts";

function validReport(overrides: Record<string, unknown> = {}) {
  return {
    totalGasCardCost: 100,
    rideShareCost: 40,
    companyUsageCost: 10,
    deadheadCost: 10,
    personalUsageCost: 20,
    miscellaneousCost: 20,
    driverShare: 40,
    companyShare: 60,
    gasCardSpend: 100,
    ...overrides,
  };
}

Deno.test("validateFinalizedReportArithmetic accepts a balanced report", () => {
  const result = validateFinalizedReportArithmetic(validReport());
  assertEquals(result.ok, true);
});

Deno.test("validateFinalizedReportArithmetic rejects a tampered bucket sum", () => {
  const result = validateFinalizedReportArithmetic(validReport({ miscellaneousCost: 99 }));
  assertEquals(result.ok, false);
});

Deno.test("validateFinalizedReportArithmetic rejects driver+company not matching total", () => {
  const result = validateFinalizedReportArithmetic(validReport({ driverShare: 10, companyShare: 10 }));
  assertEquals(result.ok, false);
});

Deno.test("validateFinalizedReportArithmetic rejects negative shares", () => {
  const result = validateFinalizedReportArithmetic(validReport({ driverShare: -1, companyShare: 101 }));
  assertEquals(result.ok, false);
});

Deno.test("blendedDriverShareRatio matches roam-shared formula", () => {
  assertEquals(blendedDriverShareRatio(250, 1000), 0.25);
  assertEquals(blendedDriverShareRatio(40, 0), 0);
});
