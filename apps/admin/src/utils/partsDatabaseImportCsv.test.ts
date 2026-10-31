import { describe, expect, it } from "vitest";
import { parseImportVehicleLabel, parsePartsDatabaseImportCsv } from "@roam/types/partsDatabaseImportCsv";

describe("parseImportVehicleLabel", () => {
  it("parses make, model, chassis, and year", () => {
    expect(parseImportVehicleLabel("Toyota Roomy M900A 2019")).toEqual({
      make: "Toyota",
      model: "Roomy",
      year: "2019",
      chassis: "M900A",
    });
  });

  it("parses without chassis", () => {
    expect(parseImportVehicleLabel("Honda Fit 2018")).toEqual({
      make: "Honda",
      model: "Fit",
      year: "2018",
      chassis: null,
    });
  });
});

describe("parsePartsDatabaseImportCsv", () => {
  it("skips the header and reads data rows", () => {
    const parsed = parsePartsDatabaseImportCsv(
      "vehicle,manufacturer,part_number,evidence_url\n33333333-3333-4333-8333-333333333333,Toyota,12345,https://example.com/a",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].part_number).toBe("12345");
  });
});
