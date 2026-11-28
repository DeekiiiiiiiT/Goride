import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anyPageEvidenceOk, specSearchLink, specSource } from "./research_spec_source.ts";
import { answersGate } from "./research_browser_check.ts";

Deno.test("specSource: bulb, tyre, oil, battery, fluids are checked on any page; others keep the catalogue", () => {
  for (const k of ["headlight_low_bulb", "headlight_high_bulb", "tire_size", "engine_oil_grade", "engine_oil_capacity_with_filter_l", "battery_jis", "battery_type", "brake_fluid", "coolant_type"]) {
    assertEquals(specSource(k), "any_page", k);
  }
  assertEquals(specSource("wiper_driver_mm"), "catalogue");
  assertEquals(specSource(null), "catalogue");
});

Deno.test("specSearchLink: the car and the spec in one search", () => {
  const url = specSearchLink({ make: "Toyota", model: "Roomy", chassis_code: "M900A", production_start_year: 2016, production_end_year: 2020 }, "High beam bulb");
  assertEquals(decodeURIComponent(new URL(url).searchParams.get("q") ?? ""), "Toyota Roomy M900A 2016-2020 High beam bulb");
});

Deno.test("anyPageEvidenceOk: any https page, never the search page or plain http", () => {
  assertEquals(anyPageEvidenceOk("https://www.toyota.jp/roomy/manual.html"), true);
  assertEquals(anyPageEvidenceOk("https://www.google.com/search?q=roomy+bulb"), false);
  assertEquals(anyPageEvidenceOk("http://example.com/x"), false);
  assertEquals(anyPageEvidenceOk("not a link"), false);
});

Deno.test("answersGate anyPage: 'is it for your car' Yes replaces the model code", () => {
  const base = {
    jobType: "spec" as const,
    identity: ["roomy"],
    frame: "M900A",
    specKey: "headlight_high_bulb",
    site: "toyota.jp",
    knownCode: null,
    suggestions: ["H4"],
    anyPage: true,
  };
  const ok = answersGate({ ...base, answers: { versionOk: true, partFound: true, datesOk: true, value: "H4" } });
  assertEquals(ok.ok, true);
  assertEquals(ok.ok && ok.versionCode, null);
  assertEquals(answersGate({ ...base, answers: { versionOk: false, partFound: true, datesOk: true, value: "H4" } }), { ok: false, reason: "version_no" });
  // Without anyPage the same answers still need the model code.
  assertEquals(answersGate({ ...base, anyPage: false, answers: { versionOk: true, partFound: true, datesOk: true, value: "H4" } }), { ok: false, reason: "version_no" });
});
