import { describe, it, expect } from "vitest";
import { normalizeVehicleMatchKey, diceCoefficient } from "./vehicleCatalogMatch";
import { pickCatalogIdFromCandidates } from "./vehicleCatalogResolution";

describe("vehicleCatalogMatch", () => {
  it("normalizeVehicleMatchKey is stable", () => {
    expect(normalizeVehicleMatchKey(" Toyota ", "Roomy", 2019)).toBe("toyota|roomy|2019");
  });

  it("diceCoefficient returns 1 for identical", () => {
    expect(diceCoefficient("toyota", "toyota")).toBe(1);
  });
});

describe("pickCatalogIdFromCandidates", () => {
  const a = { id: "a", trim_series: "Base", generation_code: "M900A", model_code: null as string | null };
  const b = { id: "b", trim_series: "XLE", generation_code: "M900A", model_code: null as string | null };

  it("returns the only candidate", () => {
    expect(pickCatalogIdFromCandidates([a], {})).toBe("a");
  });

  it("returns null when multiple candidates and no hints", () => {
    expect(pickCatalogIdFromCandidates([a, b], {})).toBeNull();
  });

  it("narrows by trim_series", () => {
    expect(pickCatalogIdFromCandidates([a, b], { trim_series: "Base" })).toBe("a");
  });

  it("narrows by model_code hint", () => {
    const x = { id: "x", trim_series: null, generation_code: null, model_code: "ABC" };
    const y = { id: "y", trim_series: null, generation_code: null, model_code: "XYZ" };
    expect(pickCatalogIdFromCandidates([x, y], { model_code: "ABC" })).toBe("x");
  });
});