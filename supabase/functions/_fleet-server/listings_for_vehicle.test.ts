import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { listingRowsToFitmentShape } from "./listings_for_vehicle.ts";

const listing = (over: Record<string, unknown>) => ({
  id: "l1",
  vehicle_catalog_id: "car-1",
  interchange_group_id: "g1",
  position: "front",
  side: null,
  year_from: 2016,
  year_to: 2020,
  trust: "confirmed",
  verified_at: "2026-11-20T00:00:00Z",
  vehicle_catalog: { chassis_code: "M900A", engine_code: "1KR-FE" },
  part_interchange_group: { part_master: [{ id: "p-b", name: "Pads B" }, { id: "p-a", name: "Pads A" }] },
  ...over,
});

Deno.test("RE-12: part_listing rows come back in part_fitment's shape", () => {
  const [row] = listingRowsToFitmentShape([listing({})] as never);
  assertEquals(
    [row.id, row.part_id, row.vehicle_catalog_id, row.chassis_code, row.engine_code, row.year_from, row.year_to],
    ["l1", "p-a", "car-1", "M900A", "1KR-FE", 2016, 2020],
  );
  assertEquals(row.part_master.name, "Pads A");
});

Deno.test("RE-12: a part is never listed twice for the same car and place", () => {
  const rows = listingRowsToFitmentShape([listing({ id: "l1" }), listing({ id: "l2" })] as never);
  assertEquals(rows.length, 1);
  const twoPlaces = listingRowsToFitmentShape([listing({ id: "l1" }), listing({ id: "l2", position: "rear" })] as never);
  assertEquals(twoPlaces.length, 2);
});

Deno.test("RE-12: groups with no usable part are skipped; rejected parts are ignored", () => {
  assertEquals(listingRowsToFitmentShape([listing({ part_interchange_group: { part_master: [] } })] as never).length, 0);
  const [row] = listingRowsToFitmentShape([
    listing({ part_interchange_group: { part_master: [{ id: "p-a", name: "A", catalog_decision: "rejected" }, { id: "p-z", name: "Z" }] } }),
  ] as never);
  assertEquals(row.part_id, "p-z");
});

Deno.test("review #10: asking for one part labels every row with that part, not the group's first", () => {
  const group = { part_master: [
    { id: "p-bosch", name: "Bosch 0986", catalog_decision: null },
    { id: "p-aisin", name: "Aisin BPZ", catalog_decision: null },
  ] };
  const [row] = listingRowsToFitmentShape([listing({ part_interchange_group: group })] as never, "p-bosch");
  assertEquals(row.part_id, "p-bosch");
  const [byName] = listingRowsToFitmentShape([listing({ part_interchange_group: group })] as never);
  assertEquals(byName.part_id, "p-aisin");
});
