/**
 * Pending parts queue must not expose fleet PII.
 * deno test --no-check supabase/functions/_fleet-server/pending_parts_catalog_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groupPartsRequests, stripPii } from "./pending_parts_catalog_routes.ts";

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

Deno.test("groupPartsRequests aggregates by variant component and side", () => {
  const groups = groupPartsRequests([
    { id: "1", platform_id: "v1", maintenance_component_id: "c1", install_side: "left", created_at: "2026-10-01T00:00:00Z", status: "open" },
    { id: "2", platform_id: "v1", maintenance_component_id: "c1", install_side: "left", created_at: "2026-10-02T00:00:00Z", status: "open", photo_url: "x" },
  ]);
  assertEquals(groups.length, 1);
  assertEquals(groups[0].fleetCount, 2);
  assertEquals(groups[0].photoCount, 1);
});
