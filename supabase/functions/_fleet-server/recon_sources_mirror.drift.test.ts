/**
 * Fail when edge recon source ids drift from finance-core manifest.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { RECON_SOURCE_IDS as EDGE_IDS } from "./recon_sources_mirror.ts";

function extractManifestIds(source: string): string[] {
  const match = source.match(/export const RECON_SOURCES[\s\S]*?\] as const;/);
  if (!match) throw new Error("RECON_SOURCES block not found");
  return [...match[0].matchAll(/\bid:\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]).sort();
}

Deno.test("RECON_SOURCE_IDS match packages/finance-core/src/reconSources.ts", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const corePath = join(here, "../../../packages/finance-core/src/reconSources.ts");
  const mirrorPath = join(here, "recon_sources_mirror.ts");
  const coreText = await Deno.readTextFile(corePath);
  const mirrorText = await Deno.readTextFile(mirrorPath);
  const coreIds = extractManifestIds(coreText);
  const mirrorIds = extractManifestIds(mirrorText);
  assertEquals(mirrorIds, coreIds);
  assertEquals([...EDGE_IDS].sort(), coreIds);
});
