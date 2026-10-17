/**
 * Fail when edge menuEngine mirror drifts from packages/menu-engine.
 * Re-sync with: node packages/menu-engine/scripts/sync-edge-mirror.mjs
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ENGINE_API_VERSION, ENGINE_EXPORTS } from "./index.ts";

Deno.test("edge menuEngine exports match exports.mirror.json", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const mirror = JSON.parse(await Deno.readTextFile(join(here, "exports.mirror.json"))) as {
    apiVersion: number;
    exports: string[];
  };
  assertEquals(ENGINE_API_VERSION, mirror.apiVersion, "ENGINE_API_VERSION drift");
  assertEquals([...ENGINE_EXPORTS].sort(), [...mirror.exports].sort(), "ENGINE_EXPORTS drift");
});

Deno.test("edge menuEngine source matches package source", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const pkg = join(here, "../../../../packages/menu-engine/src");
  const files = [
    "types.ts",
    "conditions.ts",
    "ticket.ts",
    "priceLine.ts",
    "presets.ts",
    "convertLegacy.ts",
    "kits.ts",
    "snapshot.ts",
    "locationOverrides.ts",
    "index.ts",
  ];
  for (const file of files) {
    const edge = await Deno.readTextFile(join(here, file));
    const canonical = await Deno.readTextFile(join(pkg, file));
    assertEquals(edge, canonical, `mirror drift: ${file} — run sync-edge-mirror.mjs`);
  }
});
