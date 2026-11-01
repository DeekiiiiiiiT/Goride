/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildAddPartInfoRequestBody,
  clearFindPartsFitState,
  findPartsPositionLabel,
  findPartsUrlAfterNewPartPick,
} from "./findPartsRoute";

describe("clearFindPartsFitState", () => {
  it("clears position side and fit after picking a new part", () => {
    expect(clearFindPartsFitState()).toEqual({ position: "", side: "", fitParam: "" });
  });
});

describe("findPartsUrlAfterNewPartPick", () => {
  it("drops pos side and fit from the url patch", () => {
    expect(findPartsUrlAfterNewPartPick("veh-1", "cmp-belt")).toEqual({
      vehicle: "veh-1",
      part: "cmp-belt",
      pos: "",
      side: "",
      fit: "",
    });
  });
});

describe("findPartsPositionLabel", () => {
  it("shows dash when position is empty", () => {
    expect(findPartsPositionLabel("")).toBe("—");
    expect(findPartsPositionLabel(null)).toBe("—");
  });
});

describe("buildAddPartInfoRequestBody", () => {
  it("omits fit side and position after brake then drive belt flow", () => {
    clearFindPartsFitState();
    const body = buildAddPartInfoRequestBody({
      vehicleId: "veh-1",
      componentId: "cmp-belt",
      partName: "Drive belt",
      note: "",
      fitParam: "",
      position: "",
    });
    expect(body.fit).toBeUndefined();
    expect(body.side).toBeUndefined();
    expect(body.position).toBeUndefined();
    expect(body.partName).toBe("Drive belt");
  });

  it("includes fit and position for a brake pad request", () => {
    const body = buildAddPartInfoRequestBody({
      vehicleId: "veh-1",
      componentId: "cmp-pads",
      partName: "Brake pads",
      fitParam: "front:both",
      position: "front",
    });
    expect(body.fit).toBe("front:both");
    expect(body.position).toBe("front");
  });
});
