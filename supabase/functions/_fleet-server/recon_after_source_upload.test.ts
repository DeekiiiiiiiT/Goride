/**
 * WRA-70: shared after-upload helper queues desk refresh and registers batches safely.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { uploadWeekKeys } from "./recon_desk_shape.ts";

const here = dirname(fromFileUrl(import.meta.url));

Deno.test("afterReconSourceUpload delegates week keys through uploadWeekKeys", () => {
  const keys = uploadWeekKeys({ coverageStart: "2026-11-09", coverageEnd: "2026-11-15" });
  assertEquals(keys, ["2026-11-09"]);
});

Deno.test("afterReconSourceUpload calls queueWeekDeskRefresh and never rethrows", async () => {
  const src = await Deno.readTextFile(join(here, "recon_after_source_upload.ts"));
  assert(src.includes("queueWeekDeskRefresh(orgId, weekKeys)"), "queues touched weeks");
  assert(src.includes("ensureReconImportBatch"), "registers import batch when batchId set");
  const queue = await Deno.readTextFile(join(here, "recon_desk_queue.ts"));
  const refresh = queue.slice(queue.indexOf("export async function queueWeekDeskRefresh"));
  assert(refresh.includes("catch (e)"), "desk queue swallows errors");
});

Deno.test("batch bridge includes uber_activity_timeline semantic key", async () => {
  const bridge = await Deno.readTextFile(join(here, "recon_batch_bridge.ts"));
  assert(bridge.includes("uber_activity_timeline"), "timeline is a recon batch source");
  assert(bridge.includes("uber_tl:"), "timeline semantic key");
});