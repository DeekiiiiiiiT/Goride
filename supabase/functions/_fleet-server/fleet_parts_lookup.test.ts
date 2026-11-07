/**
 * Fleet parts lookup validation.
 * deno test --no-check supabase/functions/_fleet-server/fleet_parts_lookup.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readFleetPartLookup } from "./fleet_parts_lookup.ts";

function mockSb(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: () => Promise.resolve({ data, error }),
  };
}

Deno.test("lookup returns 400 for invalid part id", async () => {
  const out = await readFleetPartLookup(mockSb(null) as never, { partId: "not-a-uuid" });
  assertEquals(out.status, 400);
});

Deno.test("lookup maps fits with engine field", async () => {
  const partId = "e200000f-0000-4000-8000-000000000002";
  const out = await readFleetPartLookup(mockSb({
    partId,
    brand: "FxBrand",
    number: "FX-1",
    name: "Pad",
    partType: "Brake pads",
    position: "front",
    status: "verified",
    groupMembers: [{ partId: "e200000f-0000-4000-8000-000000000003", brand: "FxB", number: "FX-2", name: "Pad" }],
    fits: [{
      variantId: "e2000005-0000-4000-8000-000000000010",
      make: "FxToyota",
      model: "FxRoomy",
      chassis: "FX-M900A",
      engine: "FX-1KR",
      years: "2018–2022",
      linkType: "DIRECT",
      trust: "confirmed",
    }],
  }) as never, { partId, vehicleCatalogId: "e2000005-0000-4000-8000-000000000010" });
  assertEquals(out.status, 200);
  if ("body" in out) {
    assertEquals(out.body!.alsoFits[0].engine, "FX-1KR");
    assertEquals(out.body!.alsoFits[0].isYourCar, true);
  }
});
