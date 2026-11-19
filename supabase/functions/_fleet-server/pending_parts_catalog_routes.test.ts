/**
 * Pending parts queue must not expose fleet PII.
 * deno test --no-check supabase/functions/_fleet-server/pending_parts_catalog_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enrichPendingPartsGroupsWithJobs,
  groupPartsRequests,
  stripPii,
} from "./pending_parts_catalog_routes.ts";
import { mapPendingOnFileParts } from "./pending_parts_on_file.ts";

function walkKeys(value: unknown, keys: Set<string>): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) walkKeys(v, keys);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    keys.add(k);
    walkKeys(v, keys);
  }
}

Deno.test("stripPii removes org plate and user fields", () => {
  const row = stripPii({
    groupId: "a:b:",
    fleetCount: 2,
    organization_id: "org-secret",
    plate: "5179KZ",
    email: "fleet@example.com",
    fleet_count: 9,
  });
  assertEquals(row.organization_id, undefined);
  assertEquals(row.plate, undefined);
  assertEquals(row.email, undefined);
  assertEquals(row.fleetCount, undefined);
  assertEquals(row.fleet_count, undefined);
  assertEquals((row as { groupId?: string }).groupId, "a:b:");
});

Deno.test("groupPartsRequests groups by stored research_group_key", () => {
  const sharedKey = "v2|v1|c1|fit||Sister|scheme|code|nm:abc";
  const groups = groupPartsRequests([
    {
      id: "1",
      vehicle_catalog_id: "v1",
      platform_id: "p1",
      maintenance_component_id: "c1",
      install_side: "both",
      fit_descriptor: "front:both",
      match_type: "Sister",
      created_at: "2026-10-01T00:00:00Z",
      status: "open",
      research_group_key: sharedKey,
      origin: "service_log",
      catalog_research_job_id: "job-1",
    },
    {
      id: "2",
      vehicle_catalog_id: "v1",
      platform_id: "p1",
      maintenance_component_id: "c1",
      install_side: "both",
      fit_descriptor: "front:both",
      match_type: "Sister",
      created_at: "2026-10-02T00:00:00Z",
      status: "open",
      research_group_key: sharedKey,
      origin: "find_parts",
      photo_url: "x",
      catalog_research_job_id: "job-1",
    },
  ]);
  assertEquals(groups.length, 1);
  assertEquals(groups[0].origins, ["service_log", "find_parts"]);
  assertEquals(groups[0].photoCount, 1);
  assertEquals((groups[0] as { fleetCount?: number }).fleetCount, undefined);
});

Deno.test("enrichPendingPartsGroupsWithJobs attaches requested fields without fleetCount in output", async () => {
  const groups = groupPartsRequests([
    {
      id: "1",
      research_group_key: "v2|k",
      origin: "find_parts",
      created_at: "2026-10-01T00:00:00Z",
      catalog_research_job_id: "job-99",
    },
  ]);
  const supabase = {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({
          data: [{
            id: "job-99",
            requested_name: "Pads",
            requested_part_number: "04465",
            fleet_count: 5,
          }],
          error: null,
        }),
      }),
    }),
  };
  const enriched = await enrichPendingPartsGroupsWithJobs(supabase as never, groups);
  assertEquals(enriched[0].requestedName, "Pads");
  assertEquals(enriched[0].requestedPartNumber, "04465");
  assertEquals(enriched[0].sortFleetCount, 5);
  const safe = stripPii(enriched[0] as unknown as Record<string, unknown>);
  const keys = new Set<string>();
  walkKeys(safe, keys);
  assertEquals(keys.has("fleetCount"), false);
  assertEquals(keys.has("fleet_count"), false);
  assertEquals(keys.has("organization_id"), false);
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
Deno.test("code review #8: a key asked again shows only today's open round, not last month's resolved asks", () => {
  const key = "v2|v1|c1|fit||Sister|scheme|code|nm:again";
  const base = { vehicle_catalog_id: "v1", platform_id: "p1", maintenance_component_id: "c1", research_group_key: key };
  const groups = groupPartsRequests([
    { ...base, id: "new", created_at: "2026-11-19T00:00:00Z", status: "open" },
    { ...base, id: "old-1", created_at: "2026-10-01T00:00:00Z", status: "resolved", photo_url: "x" },
    { ...base, id: "old-2", created_at: "2026-10-02T00:00:00Z", status: "rejected" },
  ]);
  assertEquals(groups.length, 1);
  assertEquals(groups[0].status, "open");
  assertEquals(groups[0].requestIds, ["new"]);
  assertEquals(groups[0].photoCount, 0);
  assertEquals(groups[0].firstAsked, "2026-11-19T00:00:00Z");
});

Deno.test("code review #8: a key with no open ask keeps its closed rows (history unchanged)", () => {
  const key = "v2|v1|c1|fit||Sister|scheme|code|nm:closed";
  const base = { vehicle_catalog_id: "v1", platform_id: "p1", maintenance_component_id: "c1", research_group_key: key };
  const groups = groupPartsRequests([
    { ...base, id: "a", created_at: "2026-10-01T00:00:00Z", status: "resolved" },
    { ...base, id: "b", created_at: "2026-10-02T00:00:00Z", status: "resolved" },
  ]);
  assertEquals(groups.length, 1);
  assertEquals(groups[0].requestIds.sort(), ["a", "b"]);
});
