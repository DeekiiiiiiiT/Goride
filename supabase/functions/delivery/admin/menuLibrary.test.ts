import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanAliases,
  cleanLabel,
  cuisineIdsForLabels,
  cuisineSlug,
  kitsForMerchant,
  parseKitBody,
  parseTemplateBody,
  validateMerchantCuisines,
  type CuisineRow,
  type KitRow,
} from "./menuLibrary.ts";

const CUISINES: CuisineRow[] = [
  { id: "pizza", label: "Pizza", aliases: [], sort: 1 },
  { id: "italian", label: "Italian", aliases: [], sort: 2 },
  { id: "fried-chicken", label: "Fried Chicken", aliases: ["Chicken"], sort: 3 },
  { id: "jamaican", label: "Jamaican", aliases: [], sort: 4 },
  { id: "old", label: "Old Cuisine", aliases: [], sort: 5, archived_at: "2026-10-01T00:00:00Z" },
];

const KITS: KitRow[] = [
  { id: "kit-pizza", cuisine: "Pizza", cuisine_ids: ["pizza"], name: "Pizza", payload: { sections: [] }, sort: 1 },
  { id: "kit-chicken", cuisine: "Chicken", cuisine_ids: ["fried-chicken"], name: "Chicken", payload: { sections: [] } },
  { id: "kit-gone", cuisine: "Pizza", cuisine_ids: ["pizza"], name: "Gone", payload: { sections: [] }, archived_at: "2026-10-01T00:00:00Z" },
];

Deno.test("slug and label rules", () => {
  assertEquals(cuisineSlug("Vegan Options"), "vegan-options");
  assertEquals(cuisineSlug("Café & Bakery"), "cafe-and-bakery");
  assertEquals(cleanLabel("  Soup  "), "Soup");
  assertEquals(cleanLabel("Italian • Pizza"), null);
  assertEquals(cleanLabel(""), null);
});

Deno.test("combined and old labels map to cuisine ids", () => {
  assertEquals(cuisineIdsForLabels(["Italian • Pizza"], CUISINES), ["italian", "pizza"]);
  assertEquals(cuisineIdsForLabels(["chicken"], CUISINES), ["fried-chicken"]);
  assertEquals(cuisineIdsForLabels(["Nope"], CUISINES), []);
});

Deno.test("other spellings are cleaned and can't clash", () => {
  assertEquals(cleanAliases([" Chicken ", "chicken", "Fried Chicken", "Wings"], "fried-chicken", CUISINES), { ok: true, aliases: ["Chicken", "Wings"] });
  assertEquals(cleanAliases(["Pizza"], "fried-chicken", CUISINES).ok, false);
  assertEquals(cleanAliases(["Chicken"], "pizza", CUISINES).ok, false);
  assertEquals(cleanAliases(["a • b"], "pizza", CUISINES).ok, false);
  assertEquals(cleanAliases("Chicken", "pizza", CUISINES).ok, false);
});

Deno.test("kits match by id, skip archived, and need a cuisine", () => {
  assertEquals(kitsForMerchant(KITS, ["pizza"], CUISINES).map((k) => k.id), ["kit-pizza"]);
  assertEquals(kitsForMerchant(KITS, ["fried-chicken"], CUISINES)[0].cuisine, "Fried Chicken");
  assertEquals(kitsForMerchant(KITS, [], CUISINES), []);
});

Deno.test("restaurant cuisines must be known", () => {
  assertEquals(validateMerchantCuisines(["pizza", "Italian", "Pizza"], CUISINES), { ok: true, labels: ["Pizza", "Italian"] });
  assertEquals(validateMerchantCuisines(["Old Cuisine"], CUISINES), { ok: true, labels: ["Old Cuisine"] });
  assertEquals(validateMerchantCuisines(["Soup"], CUISINES), { ok: false, unknown: ["Soup"] });
});

Deno.test("kit body validation", () => {
  const ids = new Set(CUISINES.map((c) => c.id));
  const ok = parseKitBody({
    name: "Soup shop",
    cuisineIds: ["jamaican"],
    payload: { sections: [{ name: "Soups", sectionType: "sized", products: [{ name: "Red peas", templateId: "t1" }] }] },
  }, ids, new Set(["t1"]));
  assertEquals(ok.ok, true);
  if (ok.ok) assertEquals(ok.kit.payload.sections?.[0].products?.[0], { name: "Red peas", type: "sized", templateId: "t1" });
  assertEquals(parseKitBody({ name: "x", cuisineIds: [], payload: { sections: [{ name: "a", sectionType: "standard" }] } }, ids, new Set()).ok, false);
  assertEquals(parseKitBody({ name: "x", cuisineIds: ["pizza"], payload: { sections: [{ name: "a", sectionType: "soup" }] } }, ids, new Set()).ok, false);
  assertEquals(parseKitBody({ name: "x", cuisineIds: ["mars"], payload: { sections: [{ name: "a", sectionType: "standard" }] } }, ids, new Set()).ok, false);
  assertEquals(parseKitBody({
    name: "x", cuisineIds: ["pizza"],
    payload: { sections: [{ name: "a", sectionType: "standard", products: [{ name: "b", templateId: "missing" }] }] },
  }, ids, new Set()).ok, false);
});

Deno.test("template body validation", () => {
  const ids = new Set(CUISINES.map((c) => c.id));
  const payload = {
    product: { id: "p", type: "build_your_own", name: "Plate", basePrice: 0, groupLinks: [{ groupId: "g1", sort: 0 }] },
    groups: [{ id: "g1", name: "Sides", options: [] }],
    priceMatrix: [],
  };
  assertEquals(parseTemplateBody({ name: "Jamaican plate", productType: "build_your_own", cuisineIds: ["jamaican"], payload }, ids).ok, true);
  assertEquals(parseTemplateBody({ name: "x", productType: "soup", payload }, ids).ok, false);
  assertEquals(parseTemplateBody({ name: "x", productType: "pizza", payload }, ids).ok, false);
  assertEquals(parseTemplateBody({
    name: "x", productType: "build_your_own",
    payload: { ...payload, groups: [] },
  }, ids).ok, false);
});
