import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { uberTimelineDriverIdMismatch } from "./recon_activity_timeline.ts";

Deno.test("S3 uber_id_mismatch when saved Uber ID differs from body", () => {
  assertEquals(
    uberTimelineDriverIdMismatch("52ff47da-ef48-41b8-93d5-80a09b85ce5b", "other-uuid"),
    true,
  );
  assertEquals(
    uberTimelineDriverIdMismatch("52ff47da-ef48-41b8-93d5-80a09b85ce5b", "52FF47DA-ef48-41b8-93d5-80a09b85ce5b"),
    false,
  );
  assertEquals(uberTimelineDriverIdMismatch("", "any"), false);
  assertEquals(uberTimelineDriverIdMismatch("saved", ""), false);
});