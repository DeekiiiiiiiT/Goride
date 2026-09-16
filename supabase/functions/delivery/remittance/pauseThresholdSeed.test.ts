/**
 * AB-1 / Part 33: platform Default JMD → remittance minor units.
 * resolveCodPauseThresholdMinor hits DB (global layers only); this mirrors the conversion contract.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function pauseThresholdMinorFromJmd(jmd: number): number {
  if (!Number.isFinite(jmd) || jmd <= 0) return 1000000;
  return Math.round(jmd * 100);
}

Deno.test("global Default pause: J$10,000 → 1_000_000 minor", () => {
  assertEquals(pauseThresholdMinorFromJmd(10000), 1000000);
});

Deno.test("global Default pause: J$5,000 → 500_000 minor", () => {
  assertEquals(pauseThresholdMinorFromJmd(5000), 500000);
});

Deno.test("global Default pause: invalid → hardcoded default", () => {
  assertEquals(pauseThresholdMinorFromJmd(0), 1000000);
  assertEquals(pauseThresholdMinorFromJmd(-1), 1000000);
  assertEquals(pauseThresholdMinorFromJmd(Number.NaN), 1000000);
});
