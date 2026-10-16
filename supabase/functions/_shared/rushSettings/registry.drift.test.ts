/**
 * Fail when edge REGISTRY keys/defaults drift from packages/rush-settings mirror JSON
 * (generated from the package catalog).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { REGISTRY, REGISTRY_KEYS } from "./registry.ts";

type MirrorRow = {
  key: string;
  default: unknown;
  kind: string;
  clientVisible: boolean;
  risk: string;
};

Deno.test("edge REGISTRY matches registry.mirror.json keys + defaults", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const mirrorPath = join(here, "registry.mirror.json");
  const text = await Deno.readTextFile(mirrorPath);
  const mirror = JSON.parse(text) as MirrorRow[];

  const mirrorKeys = mirror.map((r) => r.key).sort();
  const edgeKeys = [...REGISTRY_KEYS].sort();
  assertEquals(edgeKeys, mirrorKeys, "REGISTRY keys must match mirror JSON");

  for (const row of mirror) {
    const def = REGISTRY[row.key];
    assertEquals(def !== undefined, true, `missing edge key ${row.key}`);
    assertEquals(def.default, row.default, `default drift: ${row.key}`);
    assertEquals(def.kind, row.kind, `kind drift: ${row.key}`);
    assertEquals(def.clientVisible, row.clientVisible, `clientVisible drift: ${row.key}`);
    assertEquals(def.risk, row.risk, `risk drift: ${row.key}`);
  }
});

Deno.test("edge REGISTRY keys align with package vitest snapshot keys", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  // Walk up to repo root from supabase/functions/_shared/rushSettings
  const snapPath = join(
    here,
    "../../../../packages/rush-settings/src/__snapshots__/registry.snapshot.test.ts.snap",
  );
  const snap = await Deno.readTextFile(snapPath);
  // Setting keys always contain a dot; nested template keys like "order_placed" do not.
  const keys = [
    ...new Set(
      [...snap.matchAll(/"key":\s*"([^"]+\.[^"]+)"/g)].map((m) => m[1]),
    ),
  ].sort();
  const edgeKeys = [...REGISTRY_KEYS].sort();
  assertEquals(edgeKeys, keys, "REGISTRY keys must match package snapshot keys");
});
