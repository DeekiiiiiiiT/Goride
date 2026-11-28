import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { browserCheckGate } from "./research_browser_check.ts";

const roomy = ["M900A", "Roomy", "1KR-FE"];

Deno.test("gate: part check needs the car and one of Roam's numbers", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: "M900A  FRONT  PAD KIT  04465-B1190", identity: roomy, candidates: ["04465-B1190"] }),
    { ok: true, detected: "04465-B1190" },
  );
  assertEquals(browserCheckGate({ jobType: "part", pasted: "M900A front pad kit", identity: roomy, candidates: ["04465-B1190"] }).ok, false);
  assertEquals(browserCheckGate({ jobType: "part", pasted: "04465-B1190 front pads", identity: roomy, candidates: ["04465-B1190"] }),
    { ok: false, reason: "no_car" });
});

// RE-57 (21 Nov, live): Amayama's "Scheme fits to" line names both frames; the sister frame was read as the part number.
const AMAYAMA_SCHEME =
  "Steering wheel Right Body style Hatchback Grade CTMG Drive 4WD FF Transmission CVT Fuel Gasoline Engine 1KR-FE " +
  "Volume 1.00 Frame DBA-M900A DBA-M910A Production years 2016 2017 2018";

Deno.test("RE-57: a line with only the car (and a sister frame, years, volume) is never a part number", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: AMAYAMA_SCHEME, identity: roomy, expectedNumber: "90048-51216", candidates: ["90048-51216"] }),
    { ok: false, reason: "no_number" },
  );
  assertEquals(browserCheckGate({ jobType: "part", pasted: AMAYAMA_SCHEME, identity: roomy }), { ok: false, reason: "no_number" });
});

Deno.test("RE-57: the car line plus the part row → Roam's number", () => {
  assertEquals(
    browserCheckGate({
      jobType: "part",
      pasted: `${AMAYAMA_SCHEME}\n90048-51216\tPlug, spark\t21.56\t3`,
      identity: roomy,
      expectedNumber: "90048-51216",
      candidates: ["90048-51216", "SC16HR11"],
    }),
    { ok: true, detected: "90048-51216" },
  );
});

Deno.test("RE-57: a later suggestion counts too; a number not suggested needs typing", () => {
  const pasted = `${AMAYAMA_SCHEME}\n17801-B1010\tElement, air cleaner\t12.00\t1`;
  assertEquals(
    browserCheckGate({ jobType: "part", pasted, identity: roomy, expectedNumber: "70017-AT123", candidates: ["70017-AT123", "17801-B1010"] }),
    { ok: true, detected: "17801-B1010" },
  );
  assertEquals(
    browserCheckGate({ jobType: "part", pasted, identity: roomy, expectedNumber: "70017-AT123", candidates: ["70017-AT123"] }),
    { ok: false, reason: "no_number" },
  );
  assertEquals(
    browserCheckGate({ jobType: "part", pasted, identity: roomy, candidates: ["70017-AT123"], typedNumber: "17801-B1010" }),
    { ok: true, detected: "17801-B1010" },
  );
});

Deno.test("RE-57: a typed number must be on the line and can't be a car code", () => {
  const pasted = `${AMAYAMA_SCHEME}\n17801-B1010\tElement, air cleaner`;
  assertEquals(browserCheckGate({ jobType: "part", pasted, identity: roomy, typedNumber: "17801-B9999" }), { ok: false, reason: "number_not_on_line" });
  assertEquals(browserCheckGate({ jobType: "part", pasted, identity: roomy, typedNumber: "DBA-M900A" }), { ok: false, reason: "number_not_on_line" });
});

Deno.test("gate: the expected number wins when present", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: "Roomy M900A 0446 5B1190 pads", identity: roomy, expectedNumber: "04465-B1190" }),
    { ok: true, detected: "04465-B1190" },
  );
});

Deno.test("gate: battery type and coolant specs confirm without a part number", () => {
  assertEquals(
    browserCheckGate({ jobType: "spec", pasted: "M900A battery M-42 EFB", identity: roomy, specKey: "battery_type" }),
    { ok: true, detected: "EFB" },
  );
  assertEquals(
    browserCheckGate({ jobType: "spec", pasted: "M900A battery M-42 EFB", identity: roomy, specKey: "battery_jis" }),
    { ok: true, detected: "M-42" },
  );
  assertEquals(
    browserCheckGate({ jobType: "spec", pasted: "Roomy M900A coolant Toyota SLLC pink", identity: roomy, specKey: "coolant_type" }).ok,
    true,
  );
  assertEquals(
    browserCheckGate({ jobType: "spec", pasted: "M900A engine oil 3.6 L with filter", identity: roomy, specKey: "engine_oil_capacity_with_filter_l" }),
    { ok: true, detected: "3.6 L" },
  );
  assertEquals(
    browserCheckGate({ jobType: "spec", pasted: "M900A wipers 525 mm driver", identity: roomy, specKey: "wiper_driver_mm" }),
    { ok: true, detected: "525 mm" },
  );
});

Deno.test("gate: a spec line with no value of the right shape stays disabled", () => {
  assertEquals(
    browserCheckGate({ jobType: "spec", pasted: "M900A battery see dealer", identity: roomy, specKey: "battery_type" }),
    { ok: false, reason: "no_value" },
  );
  assertEquals(browserCheckGate({ jobType: "spec", pasted: "   ", identity: roomy, specKey: "tire_size" }),
    { ok: false, reason: "empty" });
});

// Code review on the RE-57 fix (21 Nov).
const AMAYAMA_ROW = `${AMAYAMA_SCHEME}\n17801-B1010\tElement, air cleaner\t12.00\t1`;

Deno.test("RE-57 review: a typed piece of a number, a year or the sister frame is refused", () => {
  for (const typedNumber of ["B1010", "2016", "DBA-M910A", "M910A", "1KR-FE"]) {
    assertEquals(browserCheckGate({ jobType: "part", pasted: AMAYAMA_ROW, identity: roomy, typedNumber }), { ok: false, reason: "number_not_on_line" }, typedNumber);
  }
});

Deno.test("RE-57 review: a suggestion that is only part of a longer number on the page does not match", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: "Roomy M900A 90919-01253 plug", identity: roomy, candidates: ["90919-0125"] }),
    { ok: false, reason: "no_number" },
  );
});

Deno.test("RE-57 review: the number is saved as the page writes it, not as typed", () => {
  assertEquals(browserCheckGate({ jobType: "part", pasted: AMAYAMA_ROW, identity: roomy, typedNumber: "17801-b1010" }), { ok: true, detected: "17801-B1010" });
  assertEquals(browserCheckGate({ jobType: "part", pasted: AMAYAMA_ROW, identity: roomy, typedNumber: "17801 B1010" }), { ok: true, detected: "17801-B1010" });
});

Deno.test("RE-57 review: a leftover typed number never blocks one of Roam's suggestions on the line", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: AMAYAMA_ROW, identity: roomy, candidates: ["17801-B1010"], typedNumber: "99999-X0000" }),
    { ok: true, detected: "17801-B1010" },
  );
});

Deno.test("RE-57 review: a real part number shaped like a frame code (VCH16) can be typed", () => {
  assertEquals(browserCheckGate({ jobType: "part", pasted: "Roomy M900A Denso VCH16 plug", identity: roomy, typedNumber: "VCH16" }), { ok: true, detected: "VCH16" });
});

// RE-60 (21 Nov, live): the air-filter link opened the facelift Roomy (built 09.2020 on) for a car built 11.2016–08.2020.
import { periodsFitCar, periodsOnLine, versionListLink } from "./research_browser_check.ts";

const ROOMY_BUILD = { startYear: 2016, startMonth: 11, endYear: 2020, endMonth: 8 };
const ENGINES = { engineCode: "1KR-FE", otherEngines: ["1KR-VET"] };
const FACELIFT_PAGE = "Toyota Tank/Roomy, M900A-GBME 09.2020 - ...\n17801-21060\t1KRFE..M900,910\t09.2020 - ...\t01\t10.42";
const RIGHT_PAGE = "Toyota Tank/Roomy, M900A-AGBVE 11.2016 - 09.2020\n17801-21060\t1KRFE..M900,910\t11.2016 - 09.2020\t01\t10.42";

Deno.test("RE-60: catalogue periods are read in both formats", () => {
  assertEquals(periodsOnLine("M900A-AGBVE 11.2016 - 09.2020").length, 1);
  assertEquals(periodsOnLine("M900A-GBME 09.2020 - ...")[0].to, Number.POSITIVE_INFINITY);
  assertEquals(periodsOnLine("Production years 2016 2017 2018"), [{ from: 2016 * 12 + 1, to: 2018 * 12 + 12 }]);
  assertEquals(periodsFitCar("M900A-GBME 09.2020 - ...", ROOMY_BUILD), false);
  assertEquals(periodsFitCar("M900A-AGBVE 11.2016 - 09.2020", ROOMY_BUILD), true);
  assertEquals(periodsFitCar("no dates here", ROOMY_BUILD), true);
});

Deno.test("RE-60: the facelift page (09.2020 on) is refused for the 2016–2020 Roomy", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: FACELIFT_PAGE, identity: roomy, candidates: ["17801-21060"], build: ROOMY_BUILD, ...ENGINES }),
    { ok: false, reason: "wrong_years" },
  );
});

Deno.test("RE-60: the right version (11.2016 – 09.2020) confirms the suggested number", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: RIGHT_PAGE, identity: roomy, candidates: ["70017-AT123", "17801-21060"], build: ROOMY_BUILD, ...ENGINES }),
    { ok: true, detected: "17801-21060" },
  );
});

Deno.test("RE-60: a page naming only the turbo engine is refused for the regular-engine car", () => {
  assertEquals(
    browserCheckGate({
      jobType: "part",
      pasted: "Toyota Tank/Roomy, M900A-AGBVJ 11.2016 - 09.2020 Engine 1KRVET\n90048-51220 Plug, spark",
      identity: roomy,
      candidates: ["90048-51220"],
      build: ROOMY_BUILD,
      ...ENGINES,
    }),
    { ok: false, reason: "wrong_engine" },
  );
});

Deno.test("RE-60: an Amayama link to one version is cut back to the frame's version list; others unchanged", () => {
  assertEquals(
    versionListLink("https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a/148005/engine/1703"),
    "https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a",
  );
  const other = "https://www.amayama.com/en/catalogs/toyota/tank/1-hatchback-right-2016-3369/engine-fuel-system-and-tools-1/ignition-coil-spark-plug-33";
  assertEquals(versionListLink(other), other);
  assertEquals(versionListLink(null), null);
});

// Code review on RE-60 (21 Nov).
Deno.test("RE-60 review: engine codes match as whole tokens, never inside a part number", () => {
  // "1KRVET" inside a longer token is not the turbo engine.
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: "Roomy M900A 11.2016 - 09.2020 X1KRVET9 17801-21060", identity: roomy, candidates: ["17801-21060"], build: ROOMY_BUILD, ...ENGINES }),
    { ok: true, detected: "17801-21060" },
  );
});

Deno.test("RE-60 review: year-only and em-dash ranges are read", () => {
  assertEquals(periodsFitCar("Tank/Roomy M900A 2021—2024", ROOMY_BUILD), false);
  assertEquals(periodsFitCar("Tank/Roomy M900A 2021-2024", ROOMY_BUILD), false);
  assertEquals(periodsFitCar("Tank/Roomy M900A 2016-2020", ROOMY_BUILD), true);
  assertEquals(periodsFitCar("part 17801-21060 fits", ROOMY_BUILD), true);
});

Deno.test("RE-60 review: a spec with no value shape takes the row, not the version line", () => {
  assertEquals(
    browserCheckGate({ jobType: "spec", pasted: "Toyota Tank/Roomy, M900A-AGBVE 11.2016 - 09.2020\nSpark plug DENSO K16R-U11", identity: roomy, specKey: "spark_plug_type", build: ROOMY_BUILD, ...ENGINES }),
    { ok: true, detected: "Spark plug DENSO K16R-U11" },
  );
});

Deno.test("RE-60 review: an Amayama link without the language part is cut back too", () => {
  assertEquals(
    versionListLink("https://www.amayama.com/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a/148005/engine/1703"),
    "https://www.amayama.com/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a",
  );
});

// RE-63: remember the catalogue's version for the car.
import { versionCodeOnLine, versionPageUrl } from "./research_browser_check.ts";

Deno.test("RE-63: the version name is read from the pasted title line", () => {
  assertEquals(versionCodeOnLine("Toyota Tank/Roomy, M900A-AGBVE 11.2016 - 09.2020\n17801-21060 ...", "M900A"), "M900A-AGBVE");
  assertEquals(versionCodeOnLine("Frame DBA-M900A DBA-M910A 2016", "M900A"), null);
  assertEquals(versionCodeOnLine("no version here", "M900A"), null);
  assertEquals(versionCodeOnLine("M900A-AGBVE", null), null);
});

Deno.test("RE-63: the version's start page comes from the page the owner used", () => {
  assertEquals(
    versionPageUrl("https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a/147989/engine/1703"),
    "https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a/147989",
  );
  assertEquals(versionPageUrl("https://www.amayama.com/en/genuine-catalogs/epc/toyota-japan/tank-roomy/m900a"), null);
  assertEquals(versionPageUrl("https://partsouq.com/en/catalog/x"), null);
});

Deno.test("RE-63 review: frames stored with a prefix or a list still find the version; two versions → none", () => {
  const title = "Toyota Tank/Roomy, M900A-AGBVE 11.2016 - 09.2020";
  assertEquals(versionCodeOnLine(title, "DBA-M900A"), "M900A-AGBVE");
  assertEquals(versionCodeOnLine(title, "M900A/M910A"), "M900A-AGBVE");
  assertEquals(versionCodeOnLine("DBA-M900A-AGBVE 11.2016 - 09.2020", "M900A"), "M900A-AGBVE");
  assertEquals(versionCodeOnLine("M900A-BGBVE 11.2016 - 09.2020\nM900A-AGBVE 11.2016 - 09.2020", "M900A"), null);
});

import { periodTextOnLine } from "./research_browser_check.ts";

Deno.test("RE-67: the version's dates are read as the catalogue writes them", () => {
  assertEquals(periodTextOnLine("Toyota Tank/Roomy, M900A-AGBVE 11.2016 - 09.2020\n17801-21060 ..."), "11.2016 - 09.2020");
  assertEquals(periodTextOnLine("M900A-GBME 09.2020 - ..."), "09.2020 - ...");
  assertEquals(periodTextOnLine("no dates"), null);
});

// RE-68: answers instead of pasted text.
import { answersGate } from "./research_browser_check.ts";

const ANS_BASE = { jobType: "part" as const, identity: roomy, frame: "M900A", site: "amayama.com", rowName: "ELEMENT SUB-ASSY, AIR CLEANER FILTER", buildText: "11.2016 – 08.2020", knownCode: "M900A-AGBVE", suggestions: ["17801-21060", "04465-B1120"] };
const YES = { versionOk: true, partFound: true, datesOk: true };

Deno.test("RE-68: four Yes answers and a number → confirmed, with the answers as evidence", () => {
  const r = answersGate({ ...ANS_BASE, answers: { ...YES, value: "17801-21060" } });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.detected, "17801-21060");
    assertEquals(r.evidence, "Owner checked on amayama.com · M900A-AGBVE · ELEMENT SUB-ASSY, AIR CLEANER FILTER · 17801-21060 · dates include 11.2016 – 08.2020");
  }
});

Deno.test("Owner 25 Nov: the dates the owner read go into the evidence; bad ones are left out, never a gate", () => {
  const r = answersGate({
    ...ANS_BASE,
    answers: { ...YES, value: "17801-21060", datesShown: [{ fromMonth: 11, fromYear: 2016, toMonth: 9, toYear: 2020 }] },
  });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.evidence.includes("17801-21060 · dates shown 11.2016 – 09.2020 · dates include"), true);
  const bad = answersGate({ ...ANS_BASE, answers: { ...YES, value: "17801-21060", datesShown: [{ fromMonth: 13, fromYear: 2016, toMonth: 9, toYear: 2020 }] } });
  assertEquals(bad.ok, true);
  if (bad.ok) assertEquals(bad.evidence.includes("dates shown"), false);
});

Deno.test("RE-68: any No stops Confirm; a frame code, year or engine code is never a number", () => {
  assertEquals(answersGate({ ...ANS_BASE, answers: { ...YES, datesOk: false, value: "17801-21060" } }), { ok: false, reason: "dates_no" });
  assertEquals(answersGate({ ...ANS_BASE, answers: { ...YES, versionOk: false, value: "17801-21060" } }), { ok: false, reason: "version_no" });
  assertEquals(answersGate({ ...ANS_BASE, answers: { ...YES, partFound: false, value: "17801-21060" } }), { ok: false, reason: "part_not_found" });
  for (const value of ["DBA-M910A", "2016", "1KR-FE", "M900A"]) {
    assertEquals(answersGate({ ...ANS_BASE, answers: { ...YES, value } }), { ok: false, reason: "bad_number" }, value);
  }
});

Deno.test("RE-68: a side is required when the job has one", () => {
  assertEquals(answersGate({ ...ANS_BASE, needsSide: "front", answers: { ...YES, value: "04465-B1120" } }), { ok: false, reason: "side_no" });
  assertEquals(answersGate({ ...ANS_BASE, needsSide: "front", answers: { ...YES, sideOk: true, value: "04465-B1120" } }).ok, true);
});

Deno.test("RE-68: a typed model for the car's frame is learned; another frame is refused", () => {
  const r = answersGate({ ...ANS_BASE, knownCode: null, answers: { ...YES, versionOk: undefined, versionCode: "m900a-agbve", value: "17801-21060" } });
  assertEquals(r.ok && r.versionCode, "M900A-AGBVE");
  assertEquals(answersGate({ ...ANS_BASE, knownCode: null, answers: { ...YES, versionCode: "NCP10-XYZ", value: "17801-21060" } }), { ok: false, reason: "bad_version" });
});

Deno.test("RE-68: a spec value must have the spec's shape", () => {
  const spec = { ...ANS_BASE, jobType: "spec" as const, specKey: "battery_jis", rowName: "Battery size", suggestions: ["M-42"] };
  assertEquals(answersGate({ ...spec, answers: { ...YES, value: "M-42" } }).ok, true);
  assertEquals(answersGate({ ...spec, answers: { ...YES, value: "see dealer" } }), { ok: false, reason: "no_value" });
});

Deno.test("RE-68 review: a number Roam didn't suggest must be typed twice; no frame on file keeps the typed model", () => {
  assertEquals(answersGate({ ...ANS_BASE, answers: { ...YES, value: "17801-B1010" } }), { ok: false, reason: "retype_mismatch" });
  assertEquals(answersGate({ ...ANS_BASE, answers: { ...YES, value: "17801-B1010", valueAgain: "17801B1010" } }).ok, true);
  const r = answersGate({ ...ANS_BASE, frame: null, knownCode: null, answers: { ...YES, versionCode: "ab12-cdef", value: "17801-21060" } });
  assertEquals(r.ok && r.versionCode, "AB12-CDEF");
  assertEquals(answersGate({ ...ANS_BASE, knownCode: null, answers: { ...YES, value: "17801-21060" } }), { ok: false, reason: "version_no" });
});

Deno.test("RE-69: one number per filled position; empty positions are skipped; typed ones twice", () => {
  const shocks = { ...ANS_BASE, rowName: "ABSORBER ASSY, SHOCK", suggestions: ["48510-B9285", "48520-B9285", "48530-B9285"], positionScheme: "four_corners" };
  const r = answersGate({
    ...shocks,
    answers: {
      ...YES,
      positions: [
        { axle: "front", side: "left", value: "48520-B9285" },
        { axle: "front", side: "right", value: "48510-B9285" },
        { axle: "rear", side: "left", value: "" },
        { axle: "rear", side: "right", value: "48530-Z0001", valueAgain: "48530Z0001" },
      ],
    },
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.items, [
      { detected: "48520-B9285", axle: "front", side: "left" },
      { detected: "48510-B9285", axle: "front", side: "right" },
      { detected: "48530-Z0001", axle: "rear", side: "right" },
    ]);
    assertEquals(r.evidence.includes("front left 48520-B9285, front right 48510-B9285, rear right 48530-Z0001"), true);
  }
  assertEquals(
    answersGate({ ...shocks, answers: { ...YES, positions: [{ axle: "rear", side: "left", value: "48530-Z0001" }] } }),
    { ok: false, reason: "retype_mismatch" },
  );
  assertEquals(answersGate({ ...shocks, answers: { ...YES, positions: [{ axle: "rear", side: "left", value: "" }] } }), { ok: false, reason: "no_value" });
  assertEquals(
    answersGate({ ...shocks, answers: { ...YES, positions: [{ axle: "front", side: "left", value: "DBA-M910A", valueAgain: "DBA-M910A" }] } }),
    { ok: false, reason: "bad_number" },
  );
});

Deno.test("RE-69 review: places must fit the part type and the job's axle", () => {
  const base = { ...ANS_BASE, suggestions: ["48510-B9285", "48530-B9285"] };
  const four = { ...base, positionScheme: "four_corners" };
  // a rear place on a front job
  assertEquals(answersGate({ ...four, jobAxle: "front", answers: { ...YES, positions: [{ axle: "rear", side: "left", value: "48530-B9285" }] } }),
    { ok: false, reason: "bad_position" });
  // a four-corner part needs a side; an axle-only part never has one
  assertEquals(answersGate({ ...four, answers: { ...YES, positions: [{ axle: "front", side: null, value: "48510-B9285" }] } }),
    { ok: false, reason: "bad_position" });
  assertEquals(answersGate({ ...base, positionScheme: "axle", answers: { ...YES, positions: [{ axle: "front", side: "left", value: "48510-B9285" }] } }),
    { ok: false, reason: "bad_position" });
  // the same place twice
  assertEquals(answersGate({ ...four, answers: { ...YES, positions: [
    { axle: "front", side: "left", value: "48510-B9285" }, { axle: "front", side: "left", value: "48530-B9285" }] } }),
    { ok: false, reason: "bad_position" });
  // places on a part type without places; a sided part with one number
  assertEquals(answersGate({ ...base, positionScheme: "none", answers: { ...YES, positions: [{ axle: "front", side: null, value: "48510-B9285" }] } }),
    { ok: false, reason: "bad_position" });
  assertEquals(answersGate({ ...four, answers: { ...YES, value: "48510-B9285" } }), { ok: false, reason: "needs_positions" });
  // an axle-only part on its own axle
  assertEquals(answersGate({ ...base, positionScheme: "axle", jobAxle: "front", answers: { ...YES, positions: [{ axle: "front", side: null, value: "48510-B9285" }] } }).ok, true);
});

import { changeAtFits, changeYears } from "./research_browser_check.ts";

Deno.test("RE-70: a number that changed during the build gets years per period", () => {
  assertEquals(changeYears({ month: 11, year: 2018 }, "before"), { yearFrom: null, yearTo: 2018 });
  assertEquals(changeYears({ month: 11, year: 2018 }, "from"), { yearFrom: 2018, yearTo: null });
  // a January change: the old number ends the year before
  assertEquals(changeYears({ month: 1, year: 2019 }, "before"), { yearFrom: null, yearTo: 2018 });
  const roomy = { startYear: 2016, startMonth: 11, endYear: 2020, endMonth: 9 };
  assertEquals(changeAtFits({ month: 11, year: 2018 }, roomy), { month: 11, year: 2018 });
  assertEquals(changeAtFits({ month: 11, year: 2016 }, roomy), null); // the first build month is not a change
  assertEquals(changeAtFits({ month: 10, year: 2020 }, roomy), null); // after the build ended
  assertEquals(changeAtFits({ month: 13, year: 2018 }, roomy), null);
  assertEquals(changeAtFits(null, roomy), null);
});

Deno.test("RE-70: Roomy shocks — before and from numbers per place; an unchanged place is saved once", () => {
  const shocks = {
    ...ANS_BASE,
    rowName: "ABSORBER ASSY, SHOCK",
    suggestions: ["48510-B9285", "48520-B9285", "48530-B9285"],
    positionScheme: "four_corners",
    build: { startYear: 2016, startMonth: 11, endYear: 2020, endMonth: 9 },
    buildText: "11.2016 – 09.2020",
  };
  const r = answersGate({
    ...shocks,
    answers: {
      ...YES,
      changeAt: { month: 11, year: 2018 },
      positions: [
        { axle: "front", side: "left", value: "48520-B9285", period: "before" },
        { axle: "front", side: "left", value: "48520-B9115", valueAgain: "48520-B9115", period: "from" },
        { axle: "rear", side: "right", value: "48530-B9285", period: "before" },
        { axle: "rear", side: "right", value: "48530-B9285", period: "from" },
      ],
    },
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.items, [
      { detected: "48520-B9285", axle: "front", side: "left", yearFrom: null, yearTo: 2018, periodText: "built before 11.2018" },
      { detected: "48520-B9115", axle: "front", side: "left", yearFrom: 2018, yearTo: null, periodText: "built from 11.2018" },
      { detected: "48530-B9285", axle: "rear", side: "right" },
    ]);
    assertEquals(r.evidence.includes("front left 48520-B9285 built before 11.2018"), true);
    assertEquals(r.evidence.includes("changed 11.2018; dates together cover 11.2016 – 09.2020"), true);
  }
  // a change month outside the build; a period without a change date; a change date with a place missing its period
  assertEquals(
    answersGate({ ...shocks, answers: { ...YES, changeAt: { month: 1, year: 2015 }, positions: [{ axle: "front", side: "left", value: "48520-B9285", period: "before" }] } }),
    { ok: false, reason: "bad_change_date" },
  );
  assertEquals(
    answersGate({ ...shocks, answers: { ...YES, positions: [{ axle: "front", side: "left", value: "48520-B9285", period: "before" }] } }),
    { ok: false, reason: "bad_position" },
  );
  assertEquals(
    answersGate({ ...shocks, answers: { ...YES, changeAt: { month: 11, year: 2018 }, positions: [{ axle: "front", side: "left", value: "48520-B9285" }] } }),
    { ok: false, reason: "bad_position" },
  );
});

Deno.test("RE-70: a part without places — one number before, another from", () => {
  const filter = { ...ANS_BASE, suggestions: ["87139-B2010"], build: { startYear: 2016, startMonth: 11, endYear: 2020, endMonth: 9 } };
  const r = answersGate({
    ...filter,
    answers: { ...YES, changeAt: { month: 6, year: 2019 }, value: "87139-B2010", valueFrom: "87139-B2030", valueFromAgain: "87139-B2030" },
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.items, [
      { detected: "87139-B2010", axle: null, side: null, yearFrom: null, yearTo: 2019, periodText: "built before 06.2019" },
      { detected: "87139-B2030", axle: null, side: null, yearFrom: 2019, yearTo: null, periodText: "built from 06.2019" },
    ]);
  }
  // the same number both times → saved once, for every year
  const same = answersGate({ ...filter, answers: { ...YES, changeAt: { month: 6, year: 2019 }, value: "87139-B2010", valueFrom: "87139-B2010" } });
  assertEquals(same.ok && same.items, [{ detected: "87139-B2010", axle: null, side: null }]);
  // the "from" number typed once only
  assertEquals(
    answersGate({ ...filter, answers: { ...YES, changeAt: { month: 6, year: 2019 }, value: "87139-B2010", valueFrom: "87139-B2030" } }),
    { ok: false, reason: "retype_mismatch" },
  );
});

// Owner 25 Nov: a list of numbers per place, each with the dates the site shows (any site, any number of numbers).
import { rangesCoverBuild } from "./research_browser_check.ts";

const ROOMY_BUILD_NL = { startYear: 2016, startMonth: 11, endYear: 2020, endMonth: 9 };
const SHOCKS = {
  ...ANS_BASE,
  rowName: "SHOCK, REAR",
  suggestions: ["48530-B9285", "48530-B9165"],
  positionScheme: "four_corners",
  jobAxle: "rear" as const,
  build: ROOMY_BUILD_NL,
  buildText: "11.2016 – 09.2020",
};

Deno.test("numbers list: Roomy rear shocks — two numbers per side, each with its dates → years per number", () => {
  const d1 = { fromMonth: 11, fromYear: 2016, toMonth: 11, toYear: 2018 };
  const d2 = { fromMonth: 11, fromYear: 2018, toMonth: 9, toYear: 2020 };
  const r = answersGate({
    ...SHOCKS,
    answers: {
      ...YES,
      numbers: [
        { axle: "rear", side: "left", value: "48530-B9285", dates: d1 },
        { axle: "rear", side: "left", value: "48530-B9165", dates: d2 },
        { axle: "rear", side: "right", value: "48530-B9285", dates: d1 },
        { axle: "rear", side: "right", value: "48530-B9165", dates: d2 },
      ],
    },
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.items, [
      { detected: "48530-B9285", axle: "rear", side: "left", yearFrom: null, yearTo: 2018, periodText: "dates 11.2016 – 11.2018" },
      { detected: "48530-B9165", axle: "rear", side: "left", yearFrom: 2018, yearTo: null, periodText: "dates 11.2018 – 09.2020" },
      { detected: "48530-B9285", axle: "rear", side: "right", yearFrom: null, yearTo: 2018, periodText: "dates 11.2016 – 11.2018" },
      { detected: "48530-B9165", axle: "rear", side: "right", yearFrom: 2018, yearTo: null, periodText: "dates 11.2018 – 09.2020" },
    ]);
    assertEquals(r.evidence.endsWith("dates cover 11.2016 – 09.2020"), true);
  }
});

Deno.test("numbers list: years only, left and right on different dates, three numbers — all fine", () => {
  const r = answersGate({
    ...SHOCKS,
    answers: {
      ...YES,
      numbers: [
        { axle: "rear", side: "left", value: "48530-B9285", dates: { fromYear: 2016, toYear: 2017 } },
        { axle: "rear", side: "left", value: "48530-B9165", dates: { fromYear: 2017, toYear: 2018 } },
        { axle: "rear", side: "left", value: "48530-B9175", valueAgain: "48530-B9175", dates: { fromYear: 2019, toYear: 2020 } },
        { axle: "rear", side: "right", value: "48530-B9285", dates: { fromMonth: 11, fromYear: 2016, toMonth: 9, toYear: 2020 } },
      ],
    },
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.items?.length, 4);
    assertEquals(r.items?.[3], { detected: "48530-B9285", axle: "rear", side: "right", yearFrom: null, yearTo: null, periodText: "dates 11.2016 – 09.2020" });
    assertEquals(r.items?.[0].periodText, "dates 2016 – 2017");
  }
});

Deno.test("numbers list: a gap in the dates, dates outside the build, or backwards dates stop Confirm", () => {
  const gap = answersGate({
    ...SHOCKS,
    answers: { ...YES, numbers: [{ axle: "rear", side: "left", value: "48530-B9285", dates: { fromMonth: 11, fromYear: 2016, toMonth: 11, toYear: 2018 } }] },
  });
  assertEquals(gap, { ok: false, reason: "dates_no" });
  const outside = answersGate({
    ...SHOCKS,
    answers: {
      ...YES,
      numbers: [
        { axle: "rear", side: "left", value: "48530-B9285", dates: { fromMonth: 11, fromYear: 2016, toMonth: 9, toYear: 2020 } },
        { axle: "rear", side: "left", value: "48530-B9165", dates: { fromYear: 2010, toYear: 2014 } },
      ],
    },
  });
  assertEquals(outside, { ok: false, reason: "dates_no" });
  const backwards = answersGate({
    ...SHOCKS,
    answers: { ...YES, numbers: [{ axle: "rear", side: "left", value: "48530-B9285", dates: { fromYear: 2020, toYear: 2016 } }] },
  });
  assertEquals(backwards, { ok: false, reason: "bad_dates" });
  // No dates shown: the owner's "Yes, it fits" stands; the number is saved for every year.
  const undated = answersGate({ ...SHOCKS, answers: { ...YES, numbers: [{ axle: "rear", side: "left", value: "48530-B9285", dates: null }] } });
  assertEquals(undated.ok, true);
  if (undated.ok) assertEquals(undated.items, [{ detected: "48530-B9285", axle: "rear", side: "left", yearFrom: null, yearTo: null, periodText: null }]);
  // The wrong axle for this check, or a sided part without a side, is refused.
  assertEquals(answersGate({ ...SHOCKS, answers: { ...YES, numbers: [{ axle: "front", side: "left", value: "48530-B9285" }] } }), { ok: false, reason: "bad_position" });
  assertEquals(answersGate({ ...SHOCKS, answers: { ...YES, numbers: [{ axle: "rear", side: null, value: "48530-B9285" }] } }), { ok: false, reason: "bad_position" });
});

Deno.test("numbers list: a part without places", () => {
  const r = answersGate({
    ...ANS_BASE,
    build: ROOMY_BUILD_NL,
    answers: { ...YES, numbers: [{ value: "17801-21060", dates: { fromMonth: 11, fromYear: 2016, toYear: 2020 } }] },
  });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.items, [{ detected: "17801-21060", axle: null, side: null, yearFrom: null, yearTo: null, periodText: "dates 11.2016 – 2020" }]);
});

Deno.test("rangesCoverBuild: touching ranges cover; gaps and short ends don't; open-ended builds need no end", () => {
  const m = (y: number, mo: number) => y * 12 + mo;
  assertEquals(rangesCoverBuild([{ from: m(2016, 11), to: m(2018, 11) }, { from: m(2018, 11), to: m(2020, 9) }], ROOMY_BUILD_NL), true);
  assertEquals(rangesCoverBuild([{ from: m(2016, 11), to: m(2018, 10) }, { from: m(2018, 11), to: m(2020, 9) }], ROOMY_BUILD_NL), true);
  assertEquals(rangesCoverBuild([{ from: m(2016, 11), to: m(2018, 9) }, { from: m(2018, 11), to: m(2020, 9) }], ROOMY_BUILD_NL), false);
  assertEquals(rangesCoverBuild([{ from: m(2017, 1), to: m(2020, 9) }], ROOMY_BUILD_NL), false);
  assertEquals(rangesCoverBuild([{ from: m(2016, 1), to: m(2030, 12) }], { startYear: 2016, endYear: null }), true);
  assertEquals(rangesCoverBuild([], null), true);
});

import { withoutPrices } from "./research_browser_check.ts";

Deno.test("RE-59: pasted text loses prices, keeps dates, part numbers and sizes", () => {
  assertEquals(
    withoutPrices("48530-B9285 M900..NTBO 11.2016 - 11.2018 01 81.91"),
    "48530-B9285 M900..NTBO 11.2016 - 11.2018 01",
  );
  assertEquals(withoutPrices("90041-79333 M8 11.2016 - 09.2020 02 1.49 $1,204.50 USD 3"), "90041-79333 M8 11.2016 - 09.2020 02");
  assertEquals(withoutPrices("Price from, USD 4.63 · 165/65R14 · 0.8 mm"), "Price from, · 165/65R14 · 0.8 mm");
});

import { confirmedPartKind } from "./research_browser_check.ts";

Deno.test("Owner 25 Nov: a number confirmed on the car maker's catalogue is the car maker's OEM part", () => {
  // The engine had suggested it as aftermarket (17801-21060 on the Roomy): the car maker's page wins.
  assertEquals(confirmedPartKind(true, "Toyota", { brand: "Toyota", match_kind: "aftermarket" }), { brand: "Toyota", matchKind: "oem" });
  assertEquals(confirmedPartKind(true, "Toyota", null), { brand: "Toyota", matchKind: "oem" });
  // A part maker's page keeps the suggestion's brand and kind.
  assertEquals(confirmedPartKind(false, "Toyota", { brand: "NiBK", match_kind: "aftermarket" }), { brand: "NiBK", matchKind: "aftermarket" });
  assertEquals(confirmedPartKind(false, "Toyota", null), { brand: "Toyota", matchKind: "oem" });
});

// R7 (SP-30): every date form a catalogue page uses, one test each.
const at = (y: number, m: number) => y * 12 + m;

Deno.test("R7: 11.2016 reads as November 2016", () => {
  assertEquals(periodsOnLine("11.2016"), [{ from: at(2016, 11), to: at(2016, 11) }]);
});

Deno.test("R7: 11/2016 reads as November 2016", () => {
  assertEquals(periodsOnLine("11/2016"), [{ from: at(2016, 11), to: at(2016, 11) }]);
});

Deno.test("R7: 2016/11 reads as November 2016", () => {
  assertEquals(periodsOnLine("2016/11"), [{ from: at(2016, 11), to: at(2016, 11) }]);
});

Deno.test("R7: 2016-11 reads as November 2016", () => {
  assertEquals(periodsOnLine("2016-11"), [{ from: at(2016, 11), to: at(2016, 11) }]);
});

Deno.test("R7: 2016.11 reads as November 2016", () => {
  assertEquals(periodsOnLine("2016.11"), [{ from: at(2016, 11), to: at(2016, 11) }]);
});

Deno.test("R7: Nov 2016 reads as November 2016", () => {
  assertEquals(periodsOnLine("Nov 2016"), [{ from: at(2016, 11), to: at(2016, 11) }]);
});

Deno.test("R7: November 2016 reads as November 2016", () => {
  assertEquals(periodsOnLine("November 2016"), [{ from: at(2016, 11), to: at(2016, 11) }]);
});

Deno.test("R7: 2016 alone reads as the whole year", () => {
  assertEquals(periodsOnLine("2016"), [{ from: at(2016, 1), to: at(2016, 12) }]);
  // A sentence's full stop is not a number touching the date (SP-40).
  assertEquals(periodsOnLine("built 2016."), [{ from: at(2016, 1), to: at(2016, 12) }]);
});

Deno.test("R7: ranges joined by -, –, ~ and to", () => {
  for (const sep of ["-", "–", "~", "to"]) {
    assertEquals(periodsOnLine(`11.2016 ${sep} 09.2020`), [{ from: at(2016, 11), to: at(2020, 9) }], sep);
  }
});

Deno.test("R7: an open end is read (11.2016 - and 11.2016 - present)", () => {
  assertEquals(periodsOnLine("11.2016 -"), [{ from: at(2016, 11), to: Number.POSITIVE_INFINITY }]);
  assertEquals(periodsOnLine("11.2016 - present"), [{ from: at(2016, 11), to: Number.POSITIVE_INFINITY }]);
});

Deno.test("R7: a range is one period, not a range plus its two dates", () => {
  assertEquals(periodsOnLine("48510-B9285 11.2016 - 09.2020").length, 1);
});

Deno.test("R7: a table row's From and To cells (joined with |) are one range", () => {
  assertEquals(periodsOnLine("11111-A1001 | 11.2016 | 11.2018"), [{ from: at(2016, 11), to: at(2018, 11) }]);
  assertEquals(periodsOnLine("22222-B1002 | from frame 0255547 | 11.2018 | 09.2020"), [{ from: at(2018, 11), to: at(2020, 9) }]);
});

// R7/R8: an open-ended number saves with no end year.
Deno.test("R7/R8: a numbers row with an open end saves with no end year", () => {
  const ans = answersGate({
    jobType: "part",
    answers: {
      versionOk: true,
      partFound: true,
      datesOk: true,
      numbers: [{ value: "11111-A1001", valueAgain: "11111-A1001", dates: { fromYear: 2016, fromMonth: 11, toYear: null } }],
    },
    identity: roomy,
    frame: "M900A",
    site: "example.com",
    knownCode: "M900A-AGBGE",
    positionScheme: "none",
    build: { startYear: 2016, startMonth: 11, endYear: null },
  });
  assertEquals(ans.ok, true);
  if (ans.ok) assertEquals([ans.items?.[0]?.yearFrom, ans.items?.[0]?.yearTo], [null, null]);
});
import { typedLooksLikePartNumber } from "./research_browser_check.ts";

Deno.test("P1: a date is never a part number", () => {
  assertEquals(typedLooksLikePartNumber("11.2016", "11.2016", []), false);
  assertEquals(typedLooksLikePartNumber("2016-11", "2016-11", []), false);
  assertEquals(typedLooksLikePartNumber("11111-A1001", "11111-A1001", []), true);
});
// SP-40 (server layer review): a year inside a part number is not a date.
Deno.test("SP-40: a year inside a part number is not a date", () => {
  assertEquals(periodsOnLine("88568-52010"), []);
  assertEquals(periodsOnLine("90919-02016"), []);
  assertEquals(periodsOnLine("Toyota Roomy M900A 88568-52010"), []);
});

Deno.test("SP-40: a part number with a year inside still passes the step-by-step check", () => {
  assertEquals(
    browserCheckGate({
      jobType: "part",
      pasted: "Toyota Roomy M900A 88568-52010",
      identity: roomy,
      candidates: ["88568-52010"],
      build: ROOMY_BUILD,
      ...ENGINES,
    }),
    { ok: true, detected: "88568-52010" },
  );
});