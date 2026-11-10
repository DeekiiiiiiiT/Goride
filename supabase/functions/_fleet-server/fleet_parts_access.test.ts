/**
 * Fleet parts verified-car access helpers.
 * deno test --no-check supabase/functions/_fleet-server/fleet_parts_access.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assembleVerifiedCarAccess,
  findPartsCatalogVariant,
  partFitsCatalogIds,
  partInterchangeFitsCatalogIds,
  readExplicitCatalogLink,
  rejectUnlessVehicleId,
  requireVariantInVerifiedSet,
  vehicleContextStatus,
  verifiedCatalogIdFromLink,
} from "./fleet_parts_access.ts";

const CATALOG_A = "e2000005-0000-4000-8000-000000000010";
const CATALOG_MISSING = "e2000005-0000-4000-8000-000000000099";
const PART_ID = "e200000f-0000-4000-8000-000000000002";
const GROUP_ID = "a1111111-1111-4111-8111-111111111111";

Deno.test("explicit vehicle_catalog_id is read; MMY alone is not a link", () => {
  assertEquals(
    readExplicitCatalogLink({
      make: "Toyota",
      model: "Roomy",
      year: 2019,
      vehicle_catalog_id: CATALOG_A,
    }),
    CATALOG_A,
  );
  assertEquals(
    readExplicitCatalogLink({ make: "Toyota", model: "Roomy", year: 2019 }),
    null,
  );
});

Deno.test("verified link requires a catalog row", () => {
  assertEquals(verifiedCatalogIdFromLink(CATALOG_A, [CATALOG_A]), CATALOG_A);
  assertEquals(verifiedCatalogIdFromLink(CATALOG_MISSING, [CATALOG_A]), null);
});

Deno.test("other org car is 403, missing car is 404", () => {
  assertEquals(vehicleContextStatus(true, false), 403);
  assertEquals(vehicleContextStatus(false, false), 404);
  assertEquals(vehicleContextStatus(true, true), 200);
});

Deno.test("partInterchangeFitsCatalogIds needs listing on allowed catalog", () => {
  const map = new Map<string, Set<string>>([[GROUP_ID, new Set([CATALOG_A, "other"])]]);
  assertEquals(partInterchangeFitsCatalogIds(GROUP_ID, map, [CATALOG_A]), true);
  assertEquals(partInterchangeFitsCatalogIds(GROUP_ID, map, [CATALOG_MISSING]), false);
  assertEquals(partInterchangeFitsCatalogIds(null, map, [CATALOG_A]), false);
});

Deno.test("requireVariantInVerifiedSet", () => {
  assertEquals(requireVariantInVerifiedSet("", [CATALOG_A]).ok, false);
  assertEquals(requireVariantInVerifiedSet("not-uuid", [CATALOG_A]).status, 400);
  assertEquals(requireVariantInVerifiedSet(CATALOG_MISSING, [CATALOG_A]).status, 404);
  assertEquals(requireVariantInVerifiedSet(CATALOG_A, [CATALOG_A]).ok, true);
});

Deno.test("assembleVerifiedCarAccess: explicit link that exists", () => {
  const vehicle = { organizationId: "org-mine", vehicle_catalog_id: CATALOG_A };
  const out = assembleVerifiedCarAccess(true, true, vehicle, new Set([CATALOG_A]));
  assertEquals(out.status, 200);
  assertEquals(out.catalogId, CATALOG_A);
});

Deno.test("assembleVerifiedCarAccess: link to missing catalog row is not verified", () => {
  const vehicle = { organizationId: "org-mine", vehicle_catalog_id: CATALOG_MISSING };
  const out = assembleVerifiedCarAccess(true, true, vehicle, new Set([CATALOG_A]));
  assertEquals(out.status, 200);
  assertEquals(out.catalogId, null);
});

Deno.test("assembleVerifiedCarAccess: make/model/year only is not verified", () => {
  const vehicle = { make: "Toyota", model: "Roomy", year: 2019 };
  const out = assembleVerifiedCarAccess(true, true, vehicle, new Set([CATALOG_A]));
  assertEquals(out.catalogId, null);
});

Deno.test("assembleVerifiedCarAccess: other org refused", () => {
  const out = assembleVerifiedCarAccess(true, false, { vehicle_catalog_id: CATALOG_A }, new Set([CATALOG_A]));
  assertEquals(out.status, 403);
});

Deno.test("rejectUnlessVehicleId and findPartsCatalogVariant", () => {
  assertEquals(rejectUnlessVehicleId("")?.status, 400);
  assertEquals(findPartsCatalogVariant(CATALOG_A, CATALOG_MISSING), CATALOG_A);
});

Deno.test("partFitsCatalogIds via mock chain", async () => {
  const supabase = {
    from(table: string) {
      const state: Record<string, string> = {};
      const chain = {
        select() { return chain; },
        eq(col: string, val: string) { state[col] = val; return chain; },
        in() { return chain; },
        maybeSingle: () => Promise.resolve({
          data: table === "part_master" ? { interchange_group_id: GROUP_ID } : null,
          error: null,
        }),
        then(resolve: (v: unknown) => void) {
          const data = table === "part_listing"
            ? [{ vehicle_catalog_id: CATALOG_A }]
            : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  assertEquals(await partFitsCatalogIds(supabase as never, PART_ID, [CATALOG_A]), true);
  assertEquals(await partFitsCatalogIds(supabase as never, PART_ID, [CATALOG_MISSING]), false);
});
