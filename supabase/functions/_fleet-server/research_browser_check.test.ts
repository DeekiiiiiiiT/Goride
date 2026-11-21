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
