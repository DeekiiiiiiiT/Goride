import { describe, expect, it } from "vitest";
import { versionDifferenceLabel, versionYearsLabel } from "./versionDifferenceLabel.ts";

describe("versionDifferenceLabel", () => {
  it("Roomy 2WD 1.0 petrol", () => {
    expect(
      versionDifferenceLabel({
        drivetrain: "2WD",
        engine_code: "1KR-FE",
        engine_displacement_l: 1.0,
        fuel_type: "Petrol",
      }),
    ).toBe("2WD · 1.0 petrol");
  });

  it("Roomy turbo", () => {
    expect(
      versionDifferenceLabel({
        drivetrain: "2WD",
        engine_code: "1KR-VET",
        engine_displacement_l: 1.0,
      }),
    ).toBe("2WD · 1.0 turbo petrol");
  });

  it("years 2020 on", () => {
    expect(versionYearsLabel(2020, null)).toBe("2020 on");
  });
});
