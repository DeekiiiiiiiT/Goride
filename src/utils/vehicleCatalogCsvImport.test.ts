import { describe, it, expect } from "vitest";
import {
  buildVehicleCatalogCreatePayload,
  normalizeEngineType,
  remapCsvRowToCanonical,
} from "./vehicleCatalogCsvImport";

describe("normalizeEngineType", () => {
  it("maps N/A to na", () => {
    expect(normalizeEngineType("N/A")).toBe("na");
    expect(normalizeEngineType("naturally aspirated")).toBe("na");
  });
  it("maps Turbo", () => {
    expect(normalizeEngineType("Turbo")).toBe("turbo");
  });
});

describe("remapCsvRowToCanonical", () => {
  it("maps friendly headers", () => {
    const row = remapCsvRowToCanonical({
      Make: "Toyota",
      Model: "Roomy",
      "Start Year": "2016",
      "Start Month": "11",
      "End Year": "9999",
      "Chassis Code": "M900A",
      "Engine Type": "Turbo",
    });
    expect(row.make).toBe("Toyota");
    expect(row.production_start_year).toBe("2016");
    expect(row.chassis_code).toBe("M900A");
    expect(row.engine_type).toBe("Turbo");
  });
});

describe("buildVehicleCatalogCreatePayload", () => {
  it("builds payload for ongoing end", () => {
    const canon = remapCsvRowToCanonical({
      Make: "Toyota",
      Model: "Roomy",
      "Production start year": "2020",
      "Production end year": "",
      "Engine type": "na",
    });
    const r = buildVehicleCatalogCreatePayload(canon);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.make).toBe("Toyota");
      expect(r.payload.production_end_year).toBeNull();
      expect(r.payload.engine_type).toBe("na");
    }
  });

  it("treats 9999 as ongoing", () => {
    const canon = remapCsvRowToCanonical({
      Make: "Toyota",
      Model: "Roomy",
      "Production start year": "2016",
      "Production end year": "9999",
    });
    const r = buildVehicleCatalogCreatePayload(canon);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.production_end_year).toBeNull();
  });
});
