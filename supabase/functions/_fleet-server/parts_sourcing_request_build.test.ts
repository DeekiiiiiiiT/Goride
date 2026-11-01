/**
 * deno test --no-check supabase/functions/_fleet-server/parts_sourcing_request_build.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPartsSourcingInsert, fitDescriptorFromBody, normalizeMatchType } from "./parts_sourcing_request_build.ts";

Deno.test("normalizeMatchType accepts tier tags", () => {
  assertEquals(normalizeMatchType("Sister"), "Sister");
  assertEquals(normalizeMatchType("same car, different badge"), "Sister");
});

Deno.test("fitDescriptorFromBody prefers fit param", () => {
  const row = fitDescriptorFromBody({ fit: "front:both,rear:left", position: "front", side: "right" });
  assertEquals(row.fitDescriptor, "front:both,rear:left");
  assertEquals(row.install_position, "front");
});

Deno.test("fitDescriptorFromBody maps legacy both axles", () => {
  const row = fitDescriptorFromBody({ position: "both", side: "both" });
  assertEquals(row.fitDescriptor, "front:both,rear:both");
});

function catalogClient(platformId: string) {
  return {
    from(table: string) {
      if (table !== "vehicle_catalog") throw new Error(table);
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: () => Promise.resolve({
          data: { id: "cat-1", platform_id: platformId },
          error: null,
        }),
      };
    },
  };
}

Deno.test("buildPartsSourcingInsert writes catalog id and platform fk", async () => {
  const row = await buildPartsSourcingInsert(catalogClient("plat-9") as never, {
    orgId: "org",
    vehicleId: "veh",
    needText: "Brake pads",
    componentId: "cmp",
    engineFamilyId: null,
    vehicleCatalogId: "cat-1",
    matchType: "Sister",
    fit: { position: "both", side: "both" },
    kind: "add_part_info",
    urgency: null,
    qty: null,
    userId: "u1",
    photoUrl: null,
    sentAt: "2026-11-01T00:00:00.000Z",
    replyDueAt: null,
  });
  assertEquals(row.vehicle_catalog_id, "cat-1");
  assertEquals(row.platform_id, "plat-9");
  assertEquals(row.match_type, "Sister");
  assertEquals(row.maintenance_component_id, "cmp");
});
