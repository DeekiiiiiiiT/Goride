/**
 * WRA-69: week desk saves return X-Recon-Week-Version on applied/replay.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

const here = dirname(fromFileUrl(import.meta.url));
const source = await Deno.readTextFile(join(here, "recon_routes.ts"));

function weekChangeResponseBlock(): string {
  const start = source.indexOf("async function weekChangeResponse");
  assert(start >= 0, "weekChangeResponse missing");
  const end = source.indexOf("\nfunction canAccessExternalQueue", start);
  return source.slice(start, end < 0 ? undefined : end);
}

Deno.test("weekChangeResponse sets X-Recon-Week-Version on applied and replay", () => {
  const block = weekChangeResponseBlock();
  assert(block.includes("attachWeekVersionHeader"), "uses shared header helper");
  assertEquals(block.match(/attachWeekVersionHeader/g)?.length, 2, "replay and applied paths");
  assert(block.includes("outcome.version"), "header uses claim version");
  assert(block.includes('if (outcome.kind === "refused") return outcome.response'), "refused unchanged");
});