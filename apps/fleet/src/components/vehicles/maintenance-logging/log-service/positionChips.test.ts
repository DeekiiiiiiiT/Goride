import { describe, expect, it } from "vitest";
import {
  keepAllowedPositions,
  linePositionsText,
  positionMissing,
  positionsForWire,
  positionUiFor,
  togglePositionCode,
} from "./positionChips";
import type { MaintenanceLogLine } from "../../../../types/maintenance";

const o2 = { code: "oxygen_sensor", position_aware: false, position_scheme: "before_after_catalyst" };
const wipers = { code: "wiper_blades", position_aware: false, position_scheme: "driver_passenger_rear" };
const tire = { code: "tire_change", position_aware: true, position_scheme: "axle" };
const shock = { code: "shock_absorber", position_aware: false, position_scheme: "four_corners" };
const fluid = { code: "brake_fluid", position_aware: false, position_scheme: "none" };
const link = { code: "front_stabilizer_link", position_aware: false, position_scheme: "none" };

describe("positionUiFor", () => {
  it("switch on: oxygen sensor gets Front / Rear / Not sure chips (done-test 1)", () => {
    const ui = positionUiFor(o2, true);
    expect(ui.kind).toBe("chips");
    expect(ui.kind === "chips" && ui.options.map((o) => o.label)).toEqual([
      "Front (before converter)",
      "Rear (after converter)",
      "Not sure",
    ]);
  });

  it("wheel jobs keep today's wheel buttons, switch on or off, never Not sure (gate 4, done-test 2)", () => {
    expect(positionUiFor(tire, true)).toEqual({ kind: "wheels" });
    expect(positionUiFor(tire, false)).toEqual({ kind: "wheels" });
    expect(positionUiFor(link, true)).toEqual({ kind: "wheels" });
  });

  it("switch off: everything is as today (done-test 7)", () => {
    expect(positionUiFor(o2, false)).toEqual({ kind: "none" });
    expect(positionUiFor(wipers, false)).toEqual({ kind: "none" });
    expect(positionUiFor(shock, false)).toEqual({ kind: "wheels" });
  });

  it("a job on a wheel scheme keeps the wheel buttons, switch on or off (Wheel Balancing is priced per wheel)", () => {
    expect(positionUiFor(shock, true)).toEqual({ kind: "wheels" });
    expect(positionUiFor({ code: "wheel_balancing", position_aware: false, position_scheme: "four_corners" }, true)).toEqual({
      kind: "wheels",
    });
  });

  it("a job with no scheme shows nothing", () => {
    expect(positionUiFor(fluid, true)).toEqual({ kind: "none" });
    expect(positionUiFor(null, true)).toEqual({ kind: "none" });
  });
});

describe("togglePositionCode", () => {
  it("several picks are allowed", () => {
    expect(togglePositionCode(["driver"], "passenger")).toEqual(["driver", "passenger"]);
  });
  it("Not sure is picked on its own, and a real pick replaces it", () => {
    expect(togglePositionCode(["driver", "passenger"], "unknown")).toEqual(["unknown"]);
    expect(togglePositionCode(["unknown"], "driver")).toEqual(["driver"]);
  });
  it("tapping a picked chip un-picks it", () => {
    expect(togglePositionCode(["before_cat"], "before_cat")).toEqual([]);
  });
});

describe("positionMissing (Save line waits)", () => {
  it("chips with nothing picked wait; Not sure counts as picked", () => {
    const ui = positionUiFor(o2, true);
    expect(positionMissing(ui, [])).toBe(true);
    expect(positionMissing(ui, ["unknown"])).toBe(false);
    expect(positionMissing(ui, ["before_cat"])).toBe(false);
  });
  it("wheel jobs and the switch-off screen never wait", () => {
    expect(positionMissing(positionUiFor(tire, true), [])).toBe(false);
    expect(positionMissing(positionUiFor(o2, false), [])).toBe(false);
  });
});

describe("keepAllowedPositions (Log it now, LS-06)", () => {
  it("keeps the found position (done-test 3)", () => {
    expect(keepAllowedPositions(positionUiFor(o2, true), ["before_cat"])).toEqual(["before_cat"]);
  });
  it("drops codes the job no longer allows, so the chips ask again", () => {
    expect(keepAllowedPositions(positionUiFor(o2, true), ["front"])).toEqual([]);
  });
  it("wheel jobs keep their wheels", () => {
    expect(keepAllowedPositions(positionUiFor(tire, true), ["LF", "RF"])).toEqual(["LF", "RF"]);
  });
});

describe("positionsForWire (LS-05, golden rule 10)", () => {
  const base: MaintenanceLogLine = { categoryCode: "brakes", categoryName: "Brakes" };
  it("a saved line that wasn't tapped sends no positions key (done-test 5)", () => {
    const out = positionsForWire({ ...base, id: "l1", positions: ["LF"], positionScheme: "axle", positionAware: true });
    expect("positions" in out).toBe(false);
    expect("positionScheme" in out).toBe(false);
    expect("positionAware" in out).toBe(false);
    expect("positionsTouched" in out).toBe(false);
  });
  it("a saved line tapped to nothing sends [] (cleared)", () => {
    const out = positionsForWire({ ...base, id: "l1", positions: [], positionsTouched: true });
    expect(out.positions).toEqual([]);
  });
  it("a saved line tapped sends its picks", () => {
    expect(positionsForWire({ ...base, id: "l1", positions: ["RF"], positionsTouched: true }).positions).toEqual(["RF"]);
  });
  it("a new line sends its picks, or no key when nothing is picked", () => {
    expect(positionsForWire({ ...base, positions: ["LF"] }).positions).toEqual(["LF"]);
    expect("positions" in positionsForWire({ ...base, positions: [] })).toBe(false);
  });
});

describe("linePositionsText (LS-07, done-test 6)", () => {
  it("labels by scheme + code", () => {
    expect(
      linePositionsText({ categoryCode: "oxygen_sensor", positionScheme: "before_after_catalyst", positionAware: false, positions: ["before_cat"] }),
    ).toBe("Front (before converter)");
    expect(
      linePositionsText({ categoryCode: "suspension", positionScheme: "front_rear_side", positionAware: false, positions: ["front"] }),
    ).toBe("Front");
    expect(
      linePositionsText({ categoryCode: "wiper_blades", positionScheme: "driver_passenger_rear", positionAware: false, positions: ["driver", "passenger"] }),
    ).toBe("Driver, Passenger");
  });
  it("wheel codes keep today's labels; old codes on a job without a scheme print as saved", () => {
    expect(
      linePositionsText({ categoryCode: "tire_change", positionScheme: "axle", positionAware: true, positions: ["LF", "RF"] }),
    ).toBe("LF, RF");
    expect(linePositionsText({ categoryCode: "brake_fluid", positionScheme: "none", positionAware: false, positions: ["LF"] })).toBe("LF");
  });
  it("no positions → nothing", () => {
    expect(linePositionsText({ categoryCode: "x", positions: [] })).toBeNull();
  });
});
