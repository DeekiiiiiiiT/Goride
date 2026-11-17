/**
 * T2 — look_key
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildLook, faceliftStage, normalizeLookPart } from "./lookKey.ts";

Deno.test("Roomy + white → expected key", () => {
  const r = buildLook({
    make: "Toyota",
    model: "Roomy",
    generation: "1st Gen",
    body_type: "Hatchback",
    trim_series: "Pre-Facelift",
    start_year: 2017,
    end_year: 2022,
  }, "white");
  assert(!("error" in r));
  assertEquals(r.key, "toyota|roomy|1st gen|hatchback|pre_facelift|white");
});

Deno.test("Fit Hybrid trim → standard facelift", () => {
  const r = buildLook({
    make: "Honda",
    model: "Fit",
    generation: "3rd Gen",
    body_type: "Hatchback",
    trim_series: "Hybrid (i-DCD)",
    start_year: 2013,
    end_year: 2020,
  }, "grey");
  assert(!("error" in r));
  assertEquals(r.key, "honda|fit|3rd gen|hatchback|standard|grey");
});

Deno.test("Hatch Back = Hatchback; pre facelift = Pre-Facelift stage", () => {
  const a = buildLook({
    make: "A", model: "B", generation: "1st Gen", body_type: "Hatch Back", trim_series: null,
    start_year: null, end_year: null,
  }, "black");
  const b = buildLook({
    make: "A", model: "B", generation: "1st Gen", body_type: "Hatchback", trim_series: null,
    start_year: null, end_year: null,
  }, "black");
  assert(!("error" in a) && !("error" in b));
  assertEquals(a.key, b.key);
  assertEquals(faceliftStage("pre facelift"), "pre_facelift");
  assertEquals(faceliftStage("Pre-Facelift"), "pre_facelift");
});

Deno.test("different engine trim → same key", () => {
  const base = {
    make: "Honda", model: "Fit", generation: "3rd Gen", body_type: "Hatchback",
    start_year: 2013, end_year: 2020,
  };
  const a = buildLook({ ...base, trim_series: "Hybrid (i-DCD)" }, "grey");
  const b = buildLook({ ...base, trim_series: "Petrol LX" }, "grey");
  assert(!("error" in a) && !("error" in b));
  assertEquals(a.key, b.key);
});

Deno.test("Japanese-script model → NON_LATIN_CATALOG_VALUE", () => {
  const r = buildLook({
    make: "Toyota",
    model: "ルーミー",
    generation: "1st Gen",
    body_type: "Hatchback",
    trim_series: null,
    start_year: null,
    end_year: null,
  }, "white");
  assertEquals(r, { error: "NON_LATIN_CATALOG_VALUE" });
});

Deno.test("normalizeLookPart collapses spaces and strips case", () => {
  assertEquals(normalizeLookPart("  Pre-Facelift  "), "pre facelift");
});