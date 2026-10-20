/**
 * R4-05: Close Week must hash live sourceVolumeMetrics (not stored run_sources volume).
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const CLOSE = new URL("./week_close_recon.ts", import.meta.url);
const VOLUME = new URL("./recon_volume.ts", import.meta.url);
const ROUTES = new URL("./recon_routes.ts", import.meta.url);

Deno.test("recon_volume exports sourceVolumeMetrics", async () => {
  const src = await Deno.readTextFile(VOLUME);
  assert(
    /export async function sourceVolumeMetrics\(/.test(src),
    "sourceVolumeMetrics must live in recon_volume.ts",
  );
});

Deno.test("week_close_recon hashes live sourceVolumeMetrics", async () => {
  const src = await Deno.readTextFile(CLOSE);
  assert(
    /from ["']\.\/recon_volume\.ts["']/.test(src),
    "week_close_recon must import recon_volume",
  );
  assert(
    /await sourceVolumeMetrics\(/.test(src),
    "loadWeekCloseReconContext must call sourceVolumeMetrics",
  );
  assert(
    /R4-05/.test(src),
    "close hash path must document R4-05 live volume",
  );
  assert(
    !/persisted as \{ row_count/.test(src),
    "must not hash stored run_sources.row_count for close",
  );
});

Deno.test("recon_routes uses shared recon_volume (no private twin)", async () => {
  const src = await Deno.readTextFile(ROUTES);
  assert(
    /from ["']\.\/recon_volume\.ts["']/.test(src),
    "recon_routes must import sourceVolumeMetrics from recon_volume",
  );
  assert(
    !/async function sourceVolumeMetrics\(/.test(src),
    "recon_routes must not redefine sourceVolumeMetrics locally",
  );
});
