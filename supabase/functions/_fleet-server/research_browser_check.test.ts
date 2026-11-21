import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { browserCheckGate } from "./research_browser_check.ts";

const roomy = ["M900A", "Roomy", "1KR-FE"];

Deno.test("gate: part check needs the car and a part number", () => {
  assertEquals(
    browserCheckGate({ jobType: "part", pasted: "M900A  FRONT  PAD KIT  04465-B1190", identity: roomy }),
    { ok: true, detected: "04465-B1190" },
  );
  assertEquals(browserCheckGate({ jobType: "part", pasted: "M900A front pad kit", identity: roomy }).ok, false);
  assertEquals(browserCheckGate({ jobType: "part", pasted: "04465-B1190 front pads", identity: roomy }),
    { ok: false, reason: "no_car" });
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
