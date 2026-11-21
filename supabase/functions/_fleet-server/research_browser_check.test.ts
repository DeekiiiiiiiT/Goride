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
