/**
 * Pending parts queue must not expose fleet PII.
 * deno test --no-check supabase/functions/_fleet-server/pending_parts_catalog_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groupPartsRequests, stripPii } from "./pending_parts_catalog_routes.ts";
import { mapPendingOnFileParts } from "./pending_parts_on_file.ts";

Deno.test("stripPii removes org plate and user fields", () => {
  const row = stripPii({
    groupId: "a:b:",
    fleetCount: 2,
    organization_id: "org-secret",
    plate: "5179KZ",
    email: "fleet@example.com",
  });
  assertEquals(row.organization_id, undefined);
  assertEquals(row.plate, undefined);
  assertEquals(row.email, undefined);
  assertEquals(row.fleetCount, 2);
});

Deno.test("groupPartsRequests aggregates by catalog component fit and match type", () => {
  const groups = groupPartsRequests([
    {
      id: "1",
      vehicle_catalog_id: "v1",
      platform_id: "p1",
      maintenance_component_id: "c1",
      install_side: "both",
      fit_descriptor: "front:both,rear:both",
      match_type: "Sister",
      created_at: "2026-10-01T00:00:00Z",
      status: "open",
    },
    {
      id: "2",
      vehicle_catalog_id: "v1",
      platform_id: "p1",
      maintenance_component_id: "c1",
      install_side: "both",
      fit_descriptor: "front:both,rear:both",
      match_type: "Sister",
      created_at: "2026-10-02T00:00:00Z",
      status: "open",
      photo_url: "x",
    },
  ]);
  assertEquals(groups.length, 1);
  assertEquals(groups[0].fleetCount, 2);
  assertEquals(groups[0].photoCount, 1);
  assertEquals(groups[0].vehicleCatalogId, "v1");
  assertEquals(groups[0].matchType, "Sister");
});

Deno.test("mapPendingOnFileParts dedupes by part id and maps tier labels", () => {
  const rows = mapPendingOnFileParts([
    {
      tier: 1,
      part: { id: "p1", manufacturer: "Toyota", oem_part_number: "04465-1234" },
    },
    {
      tier: 1,
      part: { id: "p1", manufacturer: "Toyota", oem_part_number: "04465-1234" },
    },
    {
      tier: 2,
      part: { id: "p2", manufacturer: "Daihatsu", oem_part_number: "04465-9999" },
    },
  ]);
  assertEquals(rows.length, 2);
  assertEquals(rows[0].brand, "Toyota");
  assertEquals(rows[0].partNumber, "04465-1234");
  assertEquals(rows[0].matchType, "Made for your car");
  assertEquals(rows[1].matchType, "Same car, different badge");
});
