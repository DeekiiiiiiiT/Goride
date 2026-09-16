import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pauseThresholdMinorFromDefaultJmd } from "./reseedSeededThresholds.ts";

Deno.test("Default pause JMD → minor; invalid no-ops", () => {
  assertEquals(pauseThresholdMinorFromDefaultJmd(10000), 1000000);
  assertEquals(pauseThresholdMinorFromDefaultJmd(5000), 500000);
  assertEquals(pauseThresholdMinorFromDefaultJmd(0), null);
  assertEquals(pauseThresholdMinorFromDefaultJmd(-1), null);
  assertEquals(pauseThresholdMinorFromDefaultJmd(undefined), null);
  assertEquals(pauseThresholdMinorFromDefaultJmd(Number.NaN), null);
});
