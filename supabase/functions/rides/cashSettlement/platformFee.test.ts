/**
 * Unit tests for Layer C fee helpers (no Deno.env required for pure functions).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computePlatformFeeMinor } from "../../_shared/platformFee.ts";

Deno.test("computePlatformFeeMinor - 0 bps yields 0", () => {
  assertEquals(computePlatformFeeMinor(10_000, 0), 0);
});

Deno.test("computePlatformFeeMinor - 100 bps = 1%", () => {
  assertEquals(computePlatformFeeMinor(10_000, 100), 100);
});

Deno.test("computePlatformFeeMinor - tips not in this helper (fare-only input)", () => {
  // Caller must pass fare only — tip of 500 must not be added to base.
  assertEquals(computePlatformFeeMinor(10_000, 500), 500);
});
