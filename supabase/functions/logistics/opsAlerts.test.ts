import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldThrottleStaleAlert, STALE_GPS_THROTTLE_MS } from "./opsAlerts.ts";

Deno.test("stale GPS throttle: no prior alert allows emit", () => {
  assertEquals(shouldThrottleStaleAlert(null), false);
});

Deno.test("stale GPS throttle: recent alert blocks", () => {
  const now = Date.now();
  const recent = new Date(now - 60_000).toISOString();
  assertEquals(shouldThrottleStaleAlert(recent, now), true);
});

Deno.test("stale GPS throttle: old alert allows", () => {
  const now = Date.now();
  const old = new Date(now - STALE_GPS_THROTTLE_MS - 1_000).toISOString();
  assertEquals(shouldThrottleStaleAlert(old, now), false);
});
