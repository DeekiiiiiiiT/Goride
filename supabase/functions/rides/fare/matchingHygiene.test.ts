import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_DISPATCH_SETTINGS } from "./dispatchSettings.ts";
import { isMatchingTimedOut, matchingStartedAtMs } from "./matchingHygiene.ts";

Deno.test("matchingStartedAtMs prefers created_at", () => {
  const ms = matchingStartedAtMs({
    created_at: "2024-05-26T19:52:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  assertEquals(ms, Date.parse("2024-05-26T19:52:00.000Z"));
});

Deno.test("isMatchingTimedOut after max duration", () => {
  const settings = { ...DEFAULT_DISPATCH_SETTINGS, max_matching_duration_minutes: 15 };
  const started = Date.now() - 16 * 60 * 1000;
  const ride = { created_at: new Date(started).toISOString() };
  assertEquals(isMatchingTimedOut(ride, settings, Date.now()), true);
});

Deno.test("isMatchingTimedOut within max duration", () => {
  const settings = { ...DEFAULT_DISPATCH_SETTINGS, max_matching_duration_minutes: 15 };
  const started = Date.now() - 5 * 60 * 1000;
  const ride = { created_at: new Date(started).toISOString() };
  assertEquals(isMatchingTimedOut(ride, settings, Date.now()), false);
});
