import { describe, expect, it } from "vitest";
import { canonicalOdometerFromMaps } from "./canonicalOdometerMath";

describe("canonicalOdometerFromMaps", () => {
  it("returns max of metrics, manual map, and fuel map", () => {
    const maps = {
      manualMaxByVehicleId: new Map([["v1", 140000]]),
      fuelMaxByVehicleId: new Map([["v1", 152657]]),
    };
    expect(canonicalOdometerFromMaps("v1", 121952, maps)).toBe(152657);
  });

  it("uses metrics when supplements are lower", () => {
    const maps = {
      manualMaxByVehicleId: new Map<string, number>(),
      fuelMaxByVehicleId: new Map<string, number>(),
    };
    expect(canonicalOdometerFromMaps("v1", 90000, maps)).toBe(90000);
  });

  it("uses manual when higher than metrics and fuel", () => {
    const maps = {
      manualMaxByVehicleId: new Map([["v1", 200000]]),
      fuelMaxByVehicleId: new Map([["v1", 100000]]),
    };
    expect(canonicalOdometerFromMaps("v1", 50000, maps)).toBe(200000);
  });
});