import { describe, it, expect } from "vitest";
import {
  buildVehicleCatalogCreatePayload,
  normalizeEngineType,
  remapCsvRowToCanonical,
} from "./vehicleCatalogCsvImport";

describe("normalizeEngineType", () => {
  it("trims and preserves labels", () => {
    expect(normalizeEngineType("N/A")).toBe("N/A");
    expect(normalizeEngineType("  Turbo  ")).toBe("Turbo");
    expect(normalizeEngineType("Hybrid (2.0L)")).toBe("Hybrid (2.0L)");
  });
  it("returns null for empty", () => {
    expect(normalizeEngineType("")).toBeNull();
    expect(normalizeEngineType(undefined)).toBeNull();
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

  it("parses English month names for production months", () => {
    const canon = remapCsvRowToCanonical({
      Make: "Toyota",
      Model: "Roomy",
      "Production start year": "2020",
      "Production start month": "November",
      "Production end year": "2021",
      "Production end month": "mar",
    });
    const r = buildVehicleCatalogCreatePayload(canon);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.production_start_month).toBe(11);
      expect(r.payload.production_end_month).toBe(3);
    }
  });

  it("maps CSV PIM headers to new fields", () => {
    const canon = remapCsvRowToCanonical({
      Make: "Toyota",
      Model: "Roomy",
      "Production start year": "2020",
      "Full Model Code": "X-1",
      Trim: "G",
      "Emissions Prefix": "DBA",
      "Trim Suffix Code": "ZZ",
      "Fuel Category": "Gas",
      "Fuel Grade": "87",
    });
    const r = buildVehicleCatalogCreatePayload(canon);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.full_model_code).toBe("X-1");
      expect(r.payload.catalog_trim).toBe("G");
      expect(r.payload.emissions_prefix).toBe("DBA");
      expect(r.payload.trim_suffix_code).toBe("ZZ");
      expect(r.payload.fuel_category).toBe("Gas");
      expect(r.payload.fuel_grade).toBe("87");
    }
  });
});
