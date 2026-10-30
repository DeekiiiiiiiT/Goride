/**
 * T2, T3, T4, T5, T7. deno test --no-check supabase/functions/_fleet-server/parts_finder.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fillPlainReason } from "../../../packages/types/src/partsResolution.ts";
import {
  findParts,
  keepForPosition,
  plainSections,
  shouldAskVariant,
  universalsToFound,
  type FoundPart,
} from "./parts_finder.ts";

Deno.test("ask which version only when the parts differ", () => {
  assertEquals(shouldAskVariant([["oil"], ["oil"]]), false);
  assertEquals(shouldAskVariant([["oil"], ["pads"]]), true);
  assertEquals(shouldAskVariant([["oil"]]), false);
});

Deno.test("front keeps front and blank, and drops rear", () => {
  const items = [
    { id: "front", position: "front", side: null },
    { id: "blank", position: null, side: null },
    { id: "rear", position: "rear", side: null },
    { id: "both", position: "both", side: "left" },
  ];
  assertEquals(keepForPosition(items, "front").map((item) => item.id), ["front", "blank", "both"]);
  assertEquals(keepForPosition(items, null, "right").map((item) => item.id), ["front", "blank", "rear"]);
});

Deno.test("legacy mode lists the parts in the first type only", () => {
  const item: FoundPart = {
    partId: "oil",
    name: "Oil filter",
    brand: "Toyota",
    number: "04152",
    tier: 4,
    reason: "old",
    position: null,
    side: null,
    status: "verified",
    fitsVariantIds: ["car"],
    evidenceUrl: null,
    alsoKnownAs: [],
  };
  const built = plainSections([item], true);
  assertEquals(built.sections.map((section) => section.tier), [1]);
  assertEquals(built.sections[0].items[0].reason, "Listed for this car.");
  assertEquals(built.emptyTiers, [2, 3, 4]);
});

Deno.test("universal rows are tier 5 parts", () => {
  const found = universalsToFound([
    {
      specKey: "engine_oil_grade",
      label: "Engine oil",
      value: "0W-20",
      items: [{ id: "oil", manufacturer: "Any", partNumber: "0W-20", name: "Engine oil" }],
    },
  ], "fit");
  assertEquals(found[0].tier, 5);
  assertEquals(found[0].partId, "oil");
  assertEquals(found[0].fitsVariantIds, ["fit"]);
});

Deno.test("tier 4 with no brand does not repeat the factory part", () => {
  assertEquals(fillPlainReason(4), "Another brand's part replaces the factory part.");
});

function chain(data: unknown) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  for (const name of ["select", "eq", "ilike", "lte", "or", "limit", "in", "order"]) builder[name] = self;
  builder.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null });
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null });
  return builder;
}

function catalogClient(variants: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table === "vehicle_catalog") return chain(variants);
      return chain([]);
    },
  };
}

const car = (id: string) => ({
  id,
  make: "Toyota",
  model: "Roomy",
  production_start_year: 2019,
  production_end_year: 2020,
  chassis_code: id,
  engine_displacement_l: 1,
  fuel_type: "Petrol",
  drivetrain: id === "m910" ? "4WD" : "2WD",
});

Deno.test("findParts skips the question when every version has the same parts", async () => {
  const client = catalogClient([car("m900"), car("m910")]);
  const same = async () => ({
    mode: "legacy" as const,
    items: [{ part: { id: "oil", name: "Oil filter", manufacturer: "Toyota", oem_part_number: "04152", catalog_decision: "confirmed" }, tier: 1 }],
    universal: [],
  });
  const skipped = await findParts(client as never, { make: "Toyota", model: "Roomy", year: 2019, orgId: null }, same);
  assertEquals(skipped.askVariant, false);
  assertEquals(skipped.pickedVariantId, null);

  let n = 0;
  const different = async () => {
    n += 1;
    return {
      mode: "legacy" as const,
      items: [{ part: { id: n === 1 ? "oil" : "pads", name: "Part", catalog_decision: "confirmed" }, tier: 1 }],
      universal: [],
    };
  };
  const asked = await findParts(client as never, { make: "Toyota", model: "Roomy", year: 2019, orgId: null }, different);
  assertEquals(asked.askVariant, true);
});

Deno.test("findParts legacy mode keeps listed parts and hides a customer", async () => {
  const client = catalogClient([car("m900")]);
  const body = await findParts(client as never, { variantId: "m900", orgId: null }, async () => ({
    mode: "legacy",
    items: [{ part: { id: "oil", name: "Oil filter", manufacturer: "Toyota", oem_part_number: "04152", catalog_decision: "confirmed" }, tier: 4 }],
    universal: [{ specKey: "engine_oil_grade", label: "Engine oil", value: "0W-20", items: [{ id: "uni", name: "Oil", manufacturer: "Any", partNumber: "0W-20" }] }],
  }));
  assertEquals(body.mode, "legacy");
  assertEquals(body.plainSections?.map((section) => section.tier), [1]);
  const text = JSON.stringify(body);
  for (const key of ["organization", "stockQty", "bestOffer", "plate", "driver"]) {
    assertEquals(text.includes(`"${key}"`), false);
  }
});

Deno.test("findParts shows more than six version cards", async () => {
  const variants = Array.from({ length: 7 }, (_, index) => car(`v${index}`));
  const body = await findParts(catalogClient(variants) as never, { make: "Toyota", model: "Roomy", year: 2019, orgId: null }, async () => ({
    mode: "legacy",
    items: [{ part: { id: "oil", name: "Oil filter", catalog_decision: "confirmed" }, tier: 1 }],
    universal: [],
  }));
  assertEquals(body.candidates.length, 7);
});
