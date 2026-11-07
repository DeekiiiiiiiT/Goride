/**
 * RB-12 grouping tests.
 * deno test --no-check supabase/functions/_fleet-server/parts_finder_group.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groupSectionItemsByInterchange } from "./parts_finder_group.ts";

Deno.test("groups same interchange into one card with brand numbers", () => {
  const items = [
    {
      tier: 1,
      groupId: "g1",
      catalogDecision: "confirmed",
      part: { id: "p1", manufacturer: "FxA", oem_part_number: "N1" },
    },
    {
      tier: 4,
      groupId: "g1",
      catalogDecision: "pending",
      part: { id: "p2", manufacturer: "FxB", oem_part_number: "N2" },
    },
    {
      tier: 1,
      groupId: "g2",
      part: { id: "p3", manufacturer: "Solo", oem_part_number: "N3" },
    },
  ];
  const out = groupSectionItemsByInterchange(items as never);
  assertEquals(out.length, 2);
  const grouped = out.find((r) => r.grouped === true) as { brandNumbers?: unknown[]; groupId?: string };
  assertEquals(grouped?.groupId, "g1");
  assertEquals(grouped?.brandNumbers?.length, 2);
});
