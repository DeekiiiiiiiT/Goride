/**
 * Fail when the place-kind check in the migration drifts from @roam/plug-core.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { PLACE_KINDS } from "../../../packages/plug-core/src/index.ts";

Deno.test("place kinds in the migration match plug-core", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const migration = await Deno.readTextFile(join(here, "../../migrations/20261026180000_plug_place_kinds.sql"));
  const match = migration.match(/CHECK \(kind IN \(([^)]+)\)\)/);
  if (!match) throw new Error("kind check missing");
  const ids = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
  assertEquals(ids, PLACE_KINDS.map((kind) => kind.id));
});
