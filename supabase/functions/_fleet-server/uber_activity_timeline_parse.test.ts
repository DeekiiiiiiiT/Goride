/**
 * Deno unit tests for Uber activity timeline parse (twin of fleet vitest).
 * Run: deno test supabase/functions/_fleet-server/uber_activity_timeline_parse.test.ts
 */
import { assertEquals, assertGreater } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canCommitUberActivityTimeline,
  parseUberActivityDuration,
  parseUberActivityTimelineText,
  zonedWallClockToIso,
} from "./uber_activity_timeline_parse.ts";

Deno.test("duration: Uber app labels", () => {
  assertEquals(parseUberActivityDuration("42m"), 42 * 60);
  assertEquals(parseUberActivityDuration("1h 3m"), 3600 + 180);
  assertEquals(parseUberActivityDuration("< 1s"), 0);
  assertEquals(parseUberActivityDuration("1d 15h 32m"), 86400 + 15 * 3600 + 32 * 60);
});

Deno.test("zonedWallClockToIso: Jamaica UTC-5", () => {
  assertEquals(
    zonedWallClockToIso("2026-10-18", "10:57:00", "America/Jamaica"),
    "2026-10-18T15:57:00.000Z",
  );
});

Deno.test("parse: offer_received synthesized + job_ref", () => {
  const text = `
October 18 2026
Accepted 1 trip
09:37 AM
Trip completed
10:13 AM
19m
On trip
09:53 AM
7m
Arrived at pick-up
09:46 AM
8m
Offer accepted
09:38 AM
2m
Online
09:35 AM
19s
`.trim();
  const result = parseUberActivityTimelineText(text, {
    timeZone: "America/Jamaica",
    driverId: "driver-1",
  });
  assertEquals(canCommitUberActivityTimeline(result), true);
  assertEquals(result.stats.offersAccepted, 1);
  assertEquals(result.stats.tripsCompleted, 1);
  assertGreater(result.events.filter((e) => e.event_type === "offer_received").length, 0);
  const offer = result.events.find((e) => e.event_type === "offer_accepted");
  assertEquals(offer?.job_ref?.startsWith("uber:driver-1:"), true);
});
