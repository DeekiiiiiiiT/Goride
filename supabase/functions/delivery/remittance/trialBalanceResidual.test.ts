/**
 * R-1 / N-4: residual construction imported from production collectOnDelivery.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { remittanceMinorsFromSplit } from "./collectOnDelivery.ts";

Deno.test("R-1 residual holds for exact and ±0.01/±0.02 drift cases", () => {
  const cases = [
    { total: 2395.75, platform: 800.25, merchant: 1200.5 },
    { total: 2395.76, platform: 800.25, merchant: 1200.5 },
    { total: 2395.74, platform: 800.25, merchant: 1200.5 },
    { total: 2395.77, platform: 800.25, merchant: 1200.5 },
  ];
  for (const c of cases) {
    const m = remittanceMinorsFromSplit({
      totalJmd: c.total,
      platformDueJmd: c.platform,
      merchantDueJmd: c.merchant,
    });
    assertEquals(
      m.bagTotalMinor,
      m.platformDueMinor + m.merchantDueMinor + m.courierRetainedMinor,
    );
  }
});
