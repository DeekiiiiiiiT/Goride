import { describe, expect, it } from "vitest";
import { defaultActionForCategory, isServiceJob, serviceJobCost } from "./logServiceJobCost";

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
