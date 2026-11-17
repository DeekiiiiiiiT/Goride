/**
 * WRA-70: every server upload path that saves a manifest upload source must call
 * afterReconSourceUpload (or the client register route that does).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const here = dirname(fromFileUrl(import.meta.url));
const read = (name: string) => Deno.readTextFile(join(here, name));

function blockBetween(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  assert(start >= 0, `missing ${startNeedle}`);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  return end < 0 ? src.slice(start) : src.slice(start, end);
}

Deno.test("import-uber-timeline calls afterReconSourceUpload before success answer", async () => {
  const src = await read("driver_activity_routes.ts");
  const block = blockBetween(src, "import-uber-timeline", "return c.json({\n        success: true,");
  assert(block.includes("afterReconSourceUpload("), "timeline import queues desk refresh");
  assert(block.includes('sourceId: "uber_activity_timeline"'), "timeline source id");
});

Deno.test("recon import register calls afterReconSourceUpload before success answer", async () => {
  const src = await read("recon_import_routes.ts");
  const start = src.indexOf('"/make-server-37f42386/recon/imports/:id/register"');
  assert(start >= 0);
  const block = src.slice(start);
  const refresh = block.indexOf("afterReconSourceUpload(");
  const answer = block.indexOf("return c.json({ success: true, importId, batchId })");
  assert(refresh >= 0, "register must call afterReconSourceUpload");
  assert(answer > refresh, "refresh before success");
});

Deno.test("recon import fuel commit calls afterReconSourceUpload", async () => {
  const src = await read("recon_import_routes.ts");
  const start = src.indexOf('"/make-server-37f42386/recon/imports/:id/commit"');
  assert(start >= 0);
  const block = src.slice(start, src.indexOf('"/make-server-37f42386/recon/imports/:id/rollback"', start));
  assert(block.includes("afterReconSourceUpload("), "fuel commit queues refresh");
});

Deno.test("Roam statement registration queues through afterReconSourceUpload", async () => {
  const src = await read("roam_fuel_statement.ts");
  assert(src.includes("afterReconSourceUpload("), "roam statement uses shared helper");
});

Deno.test("classic batch complete bridge uses afterReconSourceUpload", async () => {
  const src = await read("register_residual_monolith_routes.tsx");
  const idx = src.indexOf("afterReconSourceUpload({");
  assert(idx >= 0, "batch complete bridge");
});

Deno.test("toll v2 fleet import: client register path is the allowed exception", async () => {
  const toll = await read("toll_v2_import_controller.ts");
  assert(!toll.includes("afterReconSourceUpload"), "toll v2 import does not queue server-side");
  const fleet = await Deno.readTextFile(
    join(here, "../../../apps/fleet/src/utils/registerTollV2WithRecon.ts"),
  );
  assert(fleet.includes("registerReconImport"), "fleet client registers + queues via recon register");
});