/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDashPlatformFeeRate } from "./platformFeeRate.ts";

Deno.test("null merchant override uses global then 5% fallback", () => {
  assertEquals(resolveDashPlatformFeeRate(null, 0.05), 0.05);
  assertEquals(resolveDashPlatformFeeRate(null, null), 0.05);
});

Deno.test("merchant override only applies when it is a real custom rate", () => {
  assertEquals(resolveDashPlatformFeeRate(0.08, 0.05), 0.08);
});
