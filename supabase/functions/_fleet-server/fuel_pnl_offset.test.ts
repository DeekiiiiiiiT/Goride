import { assertEquals } from "jsr:@std/assert";
import { blendedDriverShareRatio, blendedDriverShareRatioFromReport } from "./fuel_blended_ratio.ts";

Deno.test("fuel_pnl_offset re-exports blended ratio", () => {
  assertEquals(blendedDriverShareRatio(250, 1000), 0.25);
  assertEquals(
    blendedDriverShareRatioFromReport({ driverShare: 40, gasCardSpend: 200 }),
    0.2,
  );
});

Deno.test("fuel_pnl_offset ratio is 0 when spend is missing", () => {
  assertEquals(blendedDriverShareRatioFromReport({ driverShare: 40 }), 0);
});
