/**
 * P3-R4: recording an uploaded file for a week asks the calculator to work the week out again.
 * A v2 toll file writes nothing the calculator watches, so without this Step 1 keeps showing
 * the file as missing until the nightly check.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const here = dirname(fromFileUrl(import.meta.url));
const source = await Deno.readTextFile(join(here, "recon_import_routes.ts"));

Deno.test("register queues a desk refresh for the file's weeks before answering", () => {
  const start = source.indexOf('"/make-server-37f42386/recon/imports/:id/register"');
  assert(start >= 0, "register route not found");
  const block = source.slice(start);
  const refresh = block.indexOf("await queueDeskRefresh(orgId, weekKeys)");
  const answer = block.indexOf("return c.json({ success: true, importId, batchId })");
  assert(refresh >= 0, "register must call queueDeskRefresh");
  assert(answer > refresh, "the refresh is queued before the success answer");
});

Deno.test("the refresh uses the calculator's queue and never fails the upload", async () => {
  const start = source.indexOf("async function queueDeskRefresh");
  assert(start >= 0, "queueDeskRefresh not found");
  const fn = source.slice(start, source.indexOf("\n}\n", start));
  assert(fn.includes("queueWeekDeskRefresh("), "goes through the shared desk queue");
  const queue = await Deno.readTextFile(new URL("./recon_desk_queue.ts", import.meta.url));
  assert(queue.includes('rpc("recon_enqueue_week_desk"'), "uses recon_enqueue_week_desk");
  assert(queue.includes("p_delay_seconds"), "sends all 4 arguments (the database function has no 3-argument form)");
  const refresh = queue.slice(queue.indexOf("export async function queueWeekDeskRefresh"));
  assert(refresh.includes("catch (e)"), "errors are caught, never thrown to the upload");
});

Deno.test("a replaced batch is linked by its row id, never the key-value name (supersedes is a foreign key)", () => {
  const start = source.indexOf('"/make-server-37f42386/recon/imports/:id/register"');
  const block = source.slice(start);
  assert(block.includes("batchRowId(String(body.supersedes))"), "the screen's supersedes is turned into a row id");
  assert(block.includes("effectiveSupersedes = String((peer as { id?: string }).id || batchRowId(peerId))"),
    "a live peer is linked by its row id");
  const fn = source.slice(source.indexOf("export function batchRowId"), source.indexOf("/** Queue a desk publish"));
  assert(fn.includes('name.startsWith("batch:")'), "batchRowId strips the key-value prefix");
});
