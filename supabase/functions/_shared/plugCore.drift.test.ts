/**
 * Fail if the edge entry stops re-exporting @roam/plug-core.
 * Do not paste a second copy of the rules into this folder.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";

Deno.test("plugCore stays a re-export of @roam/plug-core", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const text = await Deno.readTextFile(join(here, "plugCore.ts"));
  const code = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("/**") && !line.startsWith("*"))
    .join("\n");
  assertEquals(code, 'export * from "../../../packages/plug-core/src/index.ts";');
});
