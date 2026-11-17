import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { uberTimelineDriverIdMismatch } from "./recon_activity_timeline.ts";

const here = dirname(fromFileUrl(import.meta.url));

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

Deno.test("S70 timeline import route queues week recheck after save", async () => {
  const src = await Deno.readTextFile(join(here, "driver_activity_routes.ts"));
  const start = src.indexOf("import-uber-timeline");
  assert(start >= 0);
  const block = src.slice(start, src.indexOf("return c.json({\n        success: true,", start));
  assert(block.includes("afterReconSourceUpload("), "WRA-70 shared after-upload helper");
});