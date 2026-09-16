import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { needsThresholdSeed } from "./needsThresholdSeed.ts";

Deno.test("needsThresholdSeed: only missing accounts", () => {
  assertEquals(needsThresholdSeed(null), true);
  assertEquals(needsThresholdSeed(undefined), true);
  assertEquals(
    needsThresholdSeed({ courierId: "x", thresholdMinor: 1000000 }),
    false,
  );
});
