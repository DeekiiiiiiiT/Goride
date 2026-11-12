import { describe, expect, it } from "vitest";
import { defaultActionForCategory, hiddenLineFieldsFor, isServiceJob, serviceJobCost, sidePositionsFor } from "./logServiceJobCost";

describe("service job cost", () => {
  it("total cost is used as-is", () => {
    expect(serviceJobCost({ cost_mode: "total", service_amount: 6000 }, ["LF", "RF"], false)).toBe(6000);
  });

  it("per wheel multiplies by the wheels picked", () => {
    expect(serviceJobCost({ cost_mode: "per_wheel", service_amount: 1500 }, ["LF", "RF", "LR", "RR"], false)).toBe(6000);
  });

  it("per wheel with no wheels picked is 0", () => {
    expect(serviceJobCost({ cost_mode: "per_wheel", service_amount: 1500 }, [], false)).toBe(0);
  });

  it("no charge makes it 0", () => {
    expect(serviceJobCost({ cost_mode: "total", service_amount: 6000 }, [], true)).toBe(0);
  });

  it("blank amount is 0", () => {
    expect(serviceJobCost({ cost_mode: "total", service_amount: null }, [], false)).toBe(0);
  });
});

describe("service job detection + hidden action", () => {
  it("only is_part=false is a service job", () => {
    expect(isServiceJob({ is_part: false })).toBe(true);
    expect(isServiceJob({ is_part: true })).toBe(false);
    expect(isServiceJob({})).toBe(false);
  });

  it("uses the job's own default action (Wheel Alignment saves as adjust)", () => {
    expect(defaultActionForCategory({ is_part: false, code: "wheel_alignment", default_action: "adjust" })).toBe("adjust");
    expect(defaultActionForCategory({ is_part: false, code: "throttle_body_cleaning", default_action: "clean" })).toBe("clean");
    expect(defaultActionForCategory({ is_part: true, code: "crankshaft", default_action: "machine" })).toBe("machine");
  });

  it("falls back only when the job has no default action", () => {
    expect(defaultActionForCategory({ is_part: true, code: "x" })).toBe("replace");
    expect(defaultActionForCategory({ is_part: false, code: "y" })).toBe("other");
  });
});

describe("stabilizer links: Left / Right, short form", () => {
  it("front link picks LF/RF, rear link picks LR/RR", () => {
    expect(sidePositionsFor({ code: "front_stabilizer_link" })?.map((o) => o.value)).toEqual(["LF", "RF"]);
    expect(sidePositionsFor({ code: "rear_stabilizer_link" })?.map((o) => o.value)).toEqual(["LR", "RR"]);
    expect(sidePositionsFor({ code: "front_stabilizer_link" })?.map((o) => o.label)).toEqual(["Left", "Right"]);
    expect(sidePositionsFor({ code: "front_stabilizer_bar" })).toBeNull();
  });

  it("hides labour hours, labour rate, brand and part number on both links", () => {
    for (const code of ["front_stabilizer_link", "rear_stabilizer_link"]) {
      expect(hiddenLineFieldsFor({ code })).toEqual(["labor_hours", "labor_rate", "brand", "part_number"]);
    }
    expect(hiddenLineFieldsFor({ code: "front_stabilizer_bar" })).toEqual([]);
  });
});

describe("engine service parts: short form", () => {
  it("hides labour hours, labour rate, brand and part number on oil change, oil filter and air filter", () => {
    for (const code of ["oil", "oil_filter", "air_filter", "brakes"]) {
      expect(hiddenLineFieldsFor({ code })).toEqual(["labor_hours", "labor_rate", "brand", "part_number"]);
    }
    expect(hiddenLineFieldsFor({ code: "spark_plugs" })).toEqual([]);
  });
});
