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
    componentId: null,
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

Deno.test("both position keeps front and rear rows", () => {
  const items = [
    { id: "front", position: "front", side: null },
    { id: "rear", position: "rear", side: null },
    { id: "blank", position: null, side: null },
  ];
  assertEquals(keepForPosition(items, "both").map((item) => item.id).sort(), ["blank", "front", "rear"]);
});

Deno.test("both side keeps left and right rows", () => {
  const items = [
    { id: "left", position: "front", side: "left" },
    { id: "right", position: "front", side: "right" },
    { id: "blank", position: "front", side: null },
  ];
  assertEquals(keepForPosition(items, "front", "both").map((item) => item.id).sort(), ["blank", "left", "right"]);
});

Deno.test("Roomy rear left brake filters to rear left parts only", async () => {
  const client = catalogClient([car("m900")]);
  const body = await findParts(client as never, {
    make: "Toyota",
    model: "Roomy",
    year: 2019,
    position: "rear",
    side: "left",
    orgId: null,
  }, async () => ({
    mode: "tiered" as const,
    items: [
      { part: { id: "rear-left", name: "Rear brake shoe kit", manufacturer: "Toyota", oem_part_number: "04495-B2400", catalog_decision: "confirmed" }, tier: 1, position: "rear", side: "left" },
      { part: { id: "rear-right", name: "Rear brake shoe kit", manufacturer: "Toyota", oem_part_number: "04495-B2401", catalog_decision: "confirmed" }, tier: 1, position: "rear", side: "right" },
      { part: { id: "front-pad", name: "Front brake pad set", manufacturer: "Toyota", oem_part_number: "04465-B1190", catalog_decision: "confirmed" }, tier: 1, position: "front", side: "left" },
    ],
    universal: [],
  }));
  const text = JSON.stringify(body.sections);
  assertEquals(text.includes("04495-B2400"), true);
  assertEquals(text.includes("04495-B2401"), false);
  assertEquals(text.includes("04465-B1190"), false);
});

Deno.test("Roomy both axles returns six brake rows", async () => {
  const client = catalogClient([car("m900")]);
  const items = [
    ...Array.from({ length: 4 }, (_, i) => ({
      part: { id: `front-${i}`, name: "Front brake pad set", manufacturer: "Toyota", oem_part_number: `04465-F${i}`, catalog_decision: "confirmed" },
      tier: 1,
      position: "front",
      side: null,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      part: { id: `rear-${i}`, name: "Rear brake shoe kit", manufacturer: "Toyota", oem_part_number: `04495-R${i}`, catalog_decision: "confirmed" },
      tier: 1,
      position: "rear",
      side: null,
    })),
  ];
  const body = await findParts(client as never, {
    make: "Toyota",
    model: "Roomy",
    year: 2019,
    position: "both",
    side: "both",
    orgId: null,
  }, async () => ({ mode: "tiered" as const, items, universal: [] }));
  const ids = JSON.stringify(body.sections);
  assertEquals(ids.includes("04465-F0"), true);
  assertEquals(ids.includes("04495-R0"), true);
  const sectionItems = ((body.sections || []) as Array<{ items?: unknown[] }>).flatMap((s) => s.items || []);
  assertEquals(sectionItems.length, 6);
});

function catalogClientWithTolerance(
  variants: Array<Record<string, unknown>>,
  toleranceMm: number | null,
) {
  return {
    from(table: string) {
      if (table === "vehicle_catalog") return chain(variants);
      if (table === "universal_part") {
        const row = toleranceMm != null ? { tolerance_mm: toleranceMm } : null;
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: row, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return chain([]);
    },
  };
}

Deno.test("findParts returns tolerance_mm and interchange group count", async () => {
  const componentId = "11111111-1111-4111-8111-111111111101";
  const client = catalogClientWithTolerance([car("m900")], 0.05);
  const body = await findParts(client as never, {
    variantId: "m900",
    componentId,
    orgId: null,
  }, async () => ({
    mode: "tiered" as const,
    items: [
      {
        part: {
          id: "p1",
          name: "Front brake pad set",
          manufacturer: "Toyota",
          oem_part_number: "04465-B1190",
          catalog_decision: "confirmed",
          interchange_group_id: "g1",
        },
        tier: 1,
        groupId: "g1",
        position: "front",
        side: "both",
      },
      {
        part: {
          id: "p2",
          name: "Front brake pad kit",
          manufacturer: "Toyota",
          oem_part_number: "04465-B1191",
          catalog_decision: "confirmed",
          interchange_group_id: "g2",
        },
        tier: 1,
        groupId: "g2",
        position: "front",
        side: "both",
      },
    ],
    universal: [],
  }));
  assertEquals(body.universalToleranceMm, 0.05);
  assertEquals(body.universal_part?.tolerance_mm, 0.05);
  assertEquals(body.databaseNodeGroups, 2);
});

function tierRowFromPartId(partId: string) {
  return {
    tier: 1,
    part_id: partId,
    part_name: "Front brake pad set",
    oem_part_number: "04465-B1190",
    manufacturer: "Toyota",
    part_kind: "oem",
    fit_scope: null,
    rule_source: null,
    position: "front",
    maintenance_component_id: null,
    category_id: null,
    sister_names: null,
    source_make: null,
    reference_oem: null,
    also_known_as: [],
    confirmed_installs: 0,
    description: null,
    evidence_url: null,
    match_reason_code: null,
    match_reason_params: null,
    match_status: null,
    fit_source: null,
    via: null,
    part_badge_code: null,
    part_badge_params: null,
    side: null,
    catalogue_number: null,
    derived_id: null,
    wva: null,
    checking_note: null,
    interchange_group_id: partId,
  };
}

function roomy2019Client(partsByVariant: Record<string, string[]>) {
  const variants = [car("m900"), car("m910")];
  return {
    from(table: string) {
      if (table === "vehicle_catalog") return chain(variants);
      if (table === "variant_parts_readiness") return chain({ ready: true });
      if (table === "supplier_part_offer") return chain([]);
      if (table === "component_related_supply") return chain([]);
      if (table === "part_listing") return chain([]);
      if (table === "part_master") return chain([]);
      return chain([]);
    },
    rpc(name: string, args?: Record<string, unknown>) {
      if (name === "parts_for_vehicle") {
        const catalogId = String(args?.p_catalog_id ?? "");
        const ids = partsByVariant[catalogId] ?? [];
        return Promise.resolve({ data: ids.map(tierRowFromPartId), error: null });
      }
      if (name === "universal_section_for_variant") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

Deno.test("Roomy 2019 2WD vs 4WD sets askVariant from parts_for_vehicle", async () => {
  const sameParts = roomy2019Client({
    m900: ["pad-shared"],
    m910: ["pad-shared"],
  });
  const sameBody = await findParts(sameParts as never, {
    make: "Toyota",
    model: "Roomy",
    year: 2019,
    orgId: null,
  });
  assertEquals(sameBody.askVariant, false);

  const differentParts = roomy2019Client({
    m900: ["pad-2wd"],
    m910: ["pad-4wd"],
  });
  const askBody = await findParts(differentParts as never, {
    make: "Toyota",
    model: "Roomy",
    year: 2019,
    orgId: null,
  });
  assertEquals(askBody.askVariant, true);
  assertEquals(askBody.candidates.length, 2);
});
