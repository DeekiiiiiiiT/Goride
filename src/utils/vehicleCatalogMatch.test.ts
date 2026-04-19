import { describe, it, expect } from "vitest";
import { normalizeVehicleMatchKey, diceCoefficient } from "./vehicleCatalogMatch";

describe("vehicleCatalogMatch", () => {
  it("normalizeVehicleMatchKey is stable", () => {
    expect(normalizeVehicleMatchKey(" Toyota ", "Roomy", 2019)).toBe("toyota|roomy|2019");
  });

  it("diceCoefficient returns 1 for identical", () => {
    expect(diceCoefficient("toyota", "toyota")).toBe(1);
  });
});
