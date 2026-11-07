/**
 * RB-13 brakes overview helpers.
 * deno test --no-check supabase/functions/_fleet-server/read_brakes_overview.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { setupWord } from "./read_brakes_overview.ts";

Deno.test("setupWord maps disc and drum labels", () => {
  assertEquals(setupWord("Disc", "Drum"), { front: "Disc setup", rear: "Drum setup" });
  assertEquals(setupWord("", ""), { front: "Disc setup", rear: "Drum setup" });
});

Deno.test("readSpecCounts: a sourced car spec counts for its part type via any link", async () => {
  const { readSpecCounts } = await import("./read_brakes_overview.ts");
  const tables: Record<string, unknown[]> = {
    spec_key: [
      { key: "brake_fluid", component_id: null, maintenance_component_id: null },
      { key: "wiper_driver_mm", component_id: "wiper", maintenance_component_id: "wiper" },
    ],
    part_type_spec_field: [{ spec_key: "brake_fluid", part_type_id: "fluid" }],
  };
  const fake = {
    rpc: () => Promise.resolve({
      data: [
        { specKey: "brake_fluid", items: [] },
        { specKey: "wiper_driver_mm", items: [{ id: "a" }, { id: "b" }] },
      ],
      error: null,
    }),
    from: (t: string) => ({ select: () => Promise.resolve({ data: tables[t] ?? [], error: null }) }),
  };
  // deno-lint-ignore no-explicit-any
  const counts = await readSpecCounts(fake as any, "v", 2019);
  assertEquals(counts.get("fluid"), 1);
  assertEquals(counts.get("wiper"), 2);
});
