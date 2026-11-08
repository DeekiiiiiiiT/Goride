import { describe, expect, it } from "vitest";
import { captureFixtureRecords } from "../vehiclesCaptureFixtures";
import { duplicateLine, duplicateOfExisting } from "./vehiclesStitchShared";

describe("add car duplicate on review", () => {
  it("matches Roomy 2016–2020 2WD 1.0 petrol capture draft", () => {
    const items = captureFixtureRecords();
    const match = duplicateOfExisting(items, {
      make: "Toyota",
      model: "Roomy",
      production_start_year: 2016,
      production_end_year: 2020,
      drivetrain: "2WD",
      engine_code: "1KR-FE",
      chassis_code: "M900A",
    });
    expect(match?.id).toBe("ap900005-0000-4000-8000-000000000002");
    expect(duplicateLine(match!)).toBe(
      "A Toyota Roomy 2016–2020 2WD 1.0 petrol already exists",
    );
  });
});
