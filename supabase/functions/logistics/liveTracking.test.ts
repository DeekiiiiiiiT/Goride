import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isLiveStale, LIVE_STALE_MINUTES } from "./liveTracking.ts";

Deno.test("isLiveStale: missing timestamp is stale", () => {
  assertEquals(isLiveStale(null), true);
  assertEquals(isLiveStale(undefined), true);
});

Deno.test("isLiveStale: fresh timestamp is not stale", () => {
  const now = Date.now();
  assertEquals(isLiveStale(new Date(now - 60_000).toISOString(), now), false);
});

Deno.test("isLiveStale: older than threshold is stale", () => {
  const now = Date.now();
  const old = new Date(now - (LIVE_STALE_MINUTES + 1) * 60_000).toISOString();
  assertEquals(isLiveStale(old, now), true);
});
