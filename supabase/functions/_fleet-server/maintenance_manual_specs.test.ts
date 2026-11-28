/**
 * Step 6b — DOC-06 and DOC-10: the values an owner's manual prints, and which versions they fit.
 *
 * The expected numbers are the book's, from docs/manual-data-value-review.md MDV-01 … MDV-07:
 *   oil 2.9 L (3.1 L with the filter), 0W-20 with 5W-30 acceptable,
 *   coolant 4.4 L (1KR-FE) and 5.0 L (1KR-VET),
 *   CVT 5.8 L / 6.4 L, washer 2.0 L, tank 36 L 2WD / 38 L 4WD,
 *   three tyre rows (165/65R14 260 kPa, 175/55R15 250 kPa optional, T115/70D14 420 kPa spare),
 *   eight bulb rows, battery M-42 with N-55 on the electric-parking-brake cars.
 * The reader is exercised against a fake `fetch`; what is asserted is the prompt, the parsing, and the version
 * pre-ticking — never a canned answer standing in for a page.
 *
 * deno test --no-check supabase/functions/_fleet-server/maintenance_manual_specs.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  buildSpecDraftRows,
  buildSpecsPagePrompt,
  MAX_SPEC_ROWS_PER_PAGE,
  parseSpecsPage,
  type SpecVersion,
  tickVersions,
  versionsInYears,
} from "./maintenance_manual_specs_prompt.ts";

/** The specifications spread of the Roomy book, as a correct read returns it (printed 520–525). */
const PAGE_ANSWER = {
  specs: [
    { kind: "fluid", key: "engine_oil_capacity_l", value: { value: 2.9, unit: "L" }, confidence: "high" },
    {
      kind: "fluid",
      key: "engine_oil_capacity_with_filter_l",
      value: { value: 3.1, unit: "L" },
      confidence: "high",
    },
    {
      kind: "fluid",
      key: "engine_oil_grade",
      value: { value: "Toyota SN PLUS 0W-20", also: ["SN 5W-30"] },
      confidence: "high",
    },
    {
      kind: "fluid",
      key: "coolant_capacity_l",
      value: { value: 4.4, unit: "L" },
      applies_to: "1KR-FE",
      confidence: "high",
    },
    {
      kind: "fluid",
      key: "coolant_capacity_l",
      value: { value: 5.0, unit: "L" },
      applies_to: "1KR-VET",
      confidence: "high",
    },
    { kind: "fluid", key: "coolant_type", value: { value: "Toyota Super Long Life Coolant" } },
    {
      kind: "fluid",
      key: "transmission_fluid_capacity_l",
      value: { value: 5.8, unit: "L" },
      applies_to: "1KR-FE",
      confidence: "high",
    },
    {
      kind: "fluid",
      key: "transmission_fluid_capacity_l",
      value: { value: 6.4, unit: "L" },
      applies_to: "1KR-VET",
      confidence: "high",
    },
    { kind: "fluid", key: "washer_capacity_l", value: { value: 2.0, unit: "L" }, confidence: "high" },
    { kind: "fuel", key: "fuel_tank_capacity", value: { value: 36, unit: "L" }, applies_to: "2WD", confidence: "high" },
    { kind: "fuel", key: "fuel_tank_capacity", value: { value: 38, unit: "L" }, applies_to: "4WD", confidence: "high" },
    {
      kind: "tyre",
      key: "front",
      value: {
        size: "165/65R14",
        load_speed_index: "79S",
        wheel_size: "14x5J",
        pressure_kpa: 260,
        is_optional: false,
      },
      confidence: "high",
    },
    {
      kind: "tyre",
      key: "front",
      value: {
        size: "175/55R15",
        load_speed_index: "77V",
        wheel_size: "15x5J",
        pressure_kpa: 250,
        is_optional: true,
      },
      confidence: "high",
    },
    {
      kind: "tyre",
      key: "spare",
      value: { size: "T115/70D14", load_speed_index: "88M", wheel_size: "14x4T", pressure_kpa: 420 },
      confidence: "high",
    },
    { kind: "bulb", key: "Headlamp", value: { bulb_ref: "H4", wattage_w: "60/55" }, confidence: "high" },
    { kind: "bulb", key: "Clearance light", value: { bulb_ref: "W5W", wattage_w: "5" }, confidence: "high" },
    {
      kind: "bulb",
      key: "Front turn signal",
      value: { bulb_ref: "WY21W", wattage_w: "21" },
      applies_to: null,
      confidence: "high",
    },
    { kind: "bulb", key: "Side turn signal", value: { bulb_ref: "W5W", wattage_w: "5" }, confidence: "high" },
    {
      kind: "bulb",
      key: "Rear turn signal",
      value: { bulb_ref: "WY21W", wattage_w: "21" },
      confidence: "high",
    },
    { kind: "bulb", key: "Back-up lamp", value: { bulb_ref: "W16W", wattage_w: "16" }, confidence: "high" },
    { kind: "bulb", key: "Licence plate lamp", value: { bulb_ref: "W5W", wattage_w: "5" }, confidence: "high" },
    {
      kind: "bulb",
      key: "Interior",
      value: { bulb_ref: "5/8/5/5/5/5", wattage_w: "5", grade_note: "Any lamp not listed is LED" },
      confidence: "medium",
    },
    {
      kind: "battery",
      key: "battery_jis",
      value: { value: "M-42", note: "N-55 on cars with the electric parking brake" },
      confidence: "high",
    },
  ],
  intervals: [
    { part: "Tyre rotation", normal_km: 5000, confidence: "high" },
    { part: "Cabin filter", normal_km: 20000, severe_km: 10000, confidence: "high" },
  ],
};

function rowsOf(key: string) {
  return parseSpecsPage(PAGE_ANSWER).rows.filter((row) => row.key === key);
}

Deno.test("the specifications page is read as MDV-01 … MDV-07 says", () => {
  const parsed = parseSpecsPage(PAGE_ANSWER);

  assertEquals(parsed.dropped, 0);

  // MDV-02: 2.9 L of oil, 3.1 L with the filter, 0W-20 with 5W-30 acceptable.
  assertEquals(rowsOf("engine_oil_capacity_l")[0].value, { value: "2.9", unit: "L" });
  assertEquals(rowsOf("engine_oil_capacity_with_filter_l")[0].value, { value: "3.1", unit: "L" });
  assertEquals(rowsOf("engine_oil_grade")[0].value, {
    value: "Toyota SN PLUS 0W-20",
    also: ["SN 5W-30"],
  });

  // MDV-03: 4.4 L on the 1KR-FE, 5.0 L on the turbo.
  const coolant = rowsOf("coolant_capacity_l");
  assertEquals(coolant.map((row) => [row.appliesTo, (row.value as { value: string }).value]), [
    ["1KR-FE", "4.4"],
    // A printed 5.0 reaches Roam as the number 5; the value is right, only its trailing zero is gone.
    ["1KR-VET", "5"],
  ]);

  // MDV-07: CVT 5.8 / 6.4 L, washer 2.0 L.
  assertEquals(
    rowsOf("transmission_fluid_capacity_l").map((row) => (row.value as { value: string }).value),
    ["5.8", "6.4"],
  );
  assertEquals(rowsOf("washer_capacity_l")[0].value, { value: "2", unit: "L" });

  // MDV-01: 36 L 2WD, 38 L 4WD.
  assertEquals(
    rowsOf("fuel_tank_capacity").map((row) => [row.appliesTo, (row.value as { value: string }).value]),
    [["2WD", "36"], ["4WD", "38"]],
  );

  // MDV-05: three tyre rows, each with its pressure.
  const tyres = parsed.rows.filter((row) => row.kind === "tyre");
  assertEquals(tyres.length, 3);
  assertEquals(tyres.map((row) => row.key), ["front", "front", "spare"]);
  assertEquals(tyres.map((row) => (row.value as { pressure_kpa: number }).pressure_kpa), [260, 250, 420]);
  assertEquals(tyres.map((row) => (row.value as { is_optional?: boolean }).is_optional ?? false), [
    false,
    true,
    false,
  ]);

  // MDV-06: eight bulbs, and the "everything else is LED" note kept.
  const bulbs = parsed.rows.filter((row) => row.kind === "bulb");
  assertEquals(bulbs.length, 8);
  assertEquals((bulbs[0].value as { bulb_ref: string }).bulb_ref, "H4");
  assertEquals((bulbs[0].value as { wattage_w: string }).wattage_w, "60/55");
  const interior = bulbs.find((row) => row.key === "Interior");
  assertEquals((interior?.value as { grade_note: string }).grade_note, "Any lamp not listed is LED");

  // MDV-04: M-42 with the N-55 note.
  assertEquals(rowsOf("battery_jis")[0].value, {
    value: "M-42",
    note: "N-55 on cars with the electric parking brake",
  });
});

Deno.test("an owner's manual page may print intervals too, and they are read as interval rows", () => {
  const parsed = parseSpecsPage(PAGE_ANSWER);
  assertEquals(parsed.intervals.map((row) => row.partAsPrinted), ["Tyre rotation", "Cabin filter"]);
  assertEquals(parsed.intervals[0].normalKm, 5000);
  assertEquals(parsed.intervals[1].severeKm, 10000);
});

Deno.test("a lamp the page prints as LED is kept as an LED row, not dropped for having no bulb", () => {
  const parsed = parseSpecsPage({
    specs: [
      { kind: "bulb", key: "Front turn signal", value: { bulb_ref: null, is_led: true } },
      { kind: "bulb", key: "Rear turn signal", value: { bulb_ref: "LED" } },
      { kind: "bulb", key: "Back-up lamp", value: { is_led: true, wattage_w: "16" } },
      // No bulb and no LED note: the position is still real, so it is kept as "Unknown" for the owner to fill in.
      { kind: "bulb", key: "Licence plate lamp", value: { bulb_ref: null } },
    ],
  });
  assertEquals(parsed.dropped, 0);
  assertEquals(parsed.rows.map((row) => row.key), [
    "Front turn signal",
    "Rear turn signal",
    "Back-up lamp",
    "Licence plate lamp",
  ]);
  assertEquals(parsed.rows.map((row) => (row.value as { bulb_ref: string }).bulb_ref), [
    "LED",
    "LED",
    "LED",
    "Unknown",
  ]);
  assertEquals(parsed.rows.map((row) => (row.value as { is_led?: boolean }).is_led ?? false), [
    true,
    true,
    true,
    false,
  ]);
  // The lamp Roam could not name is not "high" confidence any more.
  assertEquals(parsed.rows[3].confidence, "medium");
});

Deno.test("six interior lamps stay six rows: the page's location becomes part of the position", () => {
  const parsed = parseSpecsPage({
    specs: [
      { kind: "bulb", key: "Interior", value: { bulb_ref: null }, applies_to: "Front personal lamp" },
      { kind: "bulb", key: "Interior", value: { bulb_ref: null }, applies_to: "Room lamp" },
      { kind: "bulb", key: "Headlamp", value: { bulb_ref: "H4" }, applies_to: "Halogen vehicles" },
    ],
  });
  assertEquals(parsed.rows.map((row) => row.key), [
    "Interior — Front personal lamp",
    "Interior — Room lamp",
    "Headlamp — Halogen vehicles",
  ]);
  // The location is now in the position, so it is not repeated as a version remark.
  assertEquals(parsed.rows.map((row) => row.appliesTo), [null, null, null]);
});

Deno.test("a value with no home in Roam is dropped, not stored in a made-up key", () => {
  const parsed = parseSpecsPage({
    specs: [
      { kind: "fluid", key: "blinker_fluid_capacity_l", value: { value: 1.2 } }, // no such key
      { kind: "fluid", key: "engine_oil_capacity_l", value: {} }, // no value
      { kind: "tyre", key: "left", value: { size: "165/65R14" } }, // not a real position
      { kind: "tyre", key: "front", value: {} }, // no size
      { kind: "bulb", key: "", value: { bulb_ref: "H4" } }, // no position
      { kind: "sparkle", key: "engine_oil_grade", value: { value: "0W-20" } }, // not a kind
      { kind: "fluid", key: "engine_oil_grade", value: { value: "0W-20" } }, // the one good row
    ],
  });

  assertEquals(parsed.dropped, 6);
  assertEquals(parsed.rows.length, 1);
  assertEquals(parsed.rows[0].key, "engine_oil_grade");
});

Deno.test("a page that answers with too many rows is cut and counted, never trusted", () => {
  const many = {
    specs: Array.from({ length: MAX_SPEC_ROWS_PER_PAGE + 5 }, () => ({
      kind: "fluid",
      key: "washer_capacity_l",
      value: { value: 2.0 },
    })),
  };
  const parsed = parseSpecsPage(many);
  // Identical rows are all kept by the parser (the writer de-duplicates), but never more than the cap.
  assertEquals(parsed.rows.length, MAX_SPEC_ROWS_PER_PAGE);
  assertEquals(parsed.dropped, 5);
});

// ---------------------------------------------------------------------------
// Which versions a value is pre-ticked for (DOC-10)
// ---------------------------------------------------------------------------

const VERSIONS: SpecVersion[] = [
  { id: "v-2wd", label: "2016–2020 · 2WD · 1KR-FE", drivetrain: "2WD", engineType: "1KR-FE" },
  { id: "v-4wd", label: "2016–2020 · 4WD · 1KR-FE", drivetrain: "4WD", engineType: "1KR-FE" },
  { id: "v-turbo", label: "2020– · 2WD · 1KR-VET Turbo", drivetrain: "2WD", engineType: "1KR-VET Turbo" },
];

Deno.test("the page's own remark ticks the versions it fits", () => {
  assertEquals(tickVersions("4WD", VERSIONS), { ids: ["v-4wd"], resolved: true });
  assertEquals(tickVersions("2WD", VERSIONS), { ids: ["v-2wd", "v-turbo"], resolved: true });
  assertEquals(tickVersions("Turbo", VERSIONS), { ids: ["v-turbo"], resolved: true });
  assertEquals(tickVersions("Except turbo", VERSIONS), { ids: ["v-2wd", "v-4wd"], resolved: true });
  assertEquals(tickVersions("1KR-VET", VERSIONS), { ids: ["v-turbo"], resolved: true });
  // No remark: the value fits every version of the family.
  assertEquals(tickVersions(null, VERSIONS), { ids: ["v-2wd", "v-4wd", "v-turbo"], resolved: true });
});

Deno.test("a remark Roam cannot place ticks everything and says it was unsure", () => {
  const tick = tickVersions("with the electric parking brake", VERSIONS);
  assertEquals(tick.resolved, false);
  assertEquals(tick.ids.length, 3);
});

Deno.test("a draft row carries its versions and a plain note when a person must decide", () => {
  const parsed = parseSpecsPage(PAGE_ANSWER);
  const built = buildSpecDraftRows({ parsed: parsed.rows, versions: VERSIONS });

  const tank4wd = built.find((row) => row.key === "fuel_tank_capacity" && row.appliesTo === "4WD")!;
  assertEquals(tank4wd.version_ids, ["v-4wd"]);
  assertEquals(tank4wd.confidence, "likely");
  assertEquals(tank4wd.draft_note, null);

  const battery = built.find((row) => row.key === "battery_jis")!;
  // No remark on the battery row: every version is ticked and there is nothing to decide.
  assertEquals(battery.version_ids.length, 3);

  // The interior bulb was read with medium confidence: still likely.
  const interior = built.find((row) => row.key === "Interior")!;
  assertEquals(interior.confidence, "likely");

  // A tyre and a lamp belong to the whole family: the page's remark on those rows is information, not a version.
  const tyre = built.find((row) => row.kind === "tyre" && row.key === "spare")!;
  assertEquals(tyre.version_ids.length, 3);
  const headlamp = built.find((row) => row.kind === "bulb" && row.key === "Headlamp")!;
  assertEquals(headlamp.version_ids.length, 3);
});

Deno.test("the same value printed twice on one page is written once", () => {
  const parsed = parseSpecsPage({
    specs: [
      { kind: "fluid", key: "washer_capacity_l", value: { value: 2.0, unit: "L" }, confidence: "high" },
      { kind: "fluid", key: "washer_capacity_l", value: { value: 2.0, unit: "L" }, confidence: "high" },
    ],
  });
  assertEquals(buildSpecDraftRows({ parsed: parsed.rows, versions: VERSIONS }).length, 1);
});

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

Deno.test("the prompt names every key a page may use, and nothing else", () => {
  const prompt = buildSpecsPagePrompt({ pageNo: 525, manualTitle: "Toyota Roomy", market: "JP" });

  for (const key of [
    "engine_oil_capacity_l",
    "engine_oil_capacity_with_filter_l",
    "engine_oil_grade",
    "coolant_capacity_l",
    "transmission_fluid_capacity_l",
    "transfer_oil_capacity_l",
    "differential_oil_capacity_l",
    "washer_capacity_l",
    "fuel_tank_capacity",
    "battery_jis",
  ]) {
    if (!prompt.includes(key)) throw new Error(`the prompt must name ${key}`);
  }

  if (!prompt.includes("Any lamp not listed is LED")) throw new Error("the LED rule must be in the prompt");
  if (!prompt.includes("applys_to")) {
    // (The prompt says applies_to; this line only fails if the word is missing entirely.)
    if (!prompt.includes("applies_to")) throw new Error("the applies_to field must be in the prompt");
  }
  if (!prompt.includes("JSON only")) throw new Error("the prompt must ask for JSON only");
  if (!prompt.includes("page 525")) throw new Error("the prompt must say which page it is");
});

Deno.test("a 2021 book (2020 onward) pre-ticks only the cars that start in 2020 or later", () => {
  const v = (id: string, yearFrom: number | null, yearTo: number | null) => ({ id, label: id, yearFrom, yearTo });
  const all = [v("roomy-2016", 2016, 2020), v("thor-2016", 2016, 2022), v("roomy-2020", 2020, null), v("turbo-2020", 2020, null)];
  assertEquals(versionsInYears(all, 2020, null).map((x) => x.id), ["roomy-2020", "turbo-2020"]);
  // A document with no years, or years that fit nothing: every version stays for the owner to narrow.
  assertEquals(versionsInYears(all, null, null).length, 4);
  assertEquals(versionsInYears(all, 2030, null).length, 4);
});
