import { describe, it, expect } from "vitest";
import {
  buildVehicleCatalogCreatePayload,
  collectUnknownCatalogCsvHeaders,
  normalizeEngineType,
  remapCsvRowToCanonical,
} from "./vehicleCatalogCsvImport";
import { pickCatalogIdFromCandidates } from "./vehicleCatalogResolution";

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

  it("maps motorcycle headers", () => {
    const row = remapCsvRowToCanonical({
      Make: "Honda",
      Model: "Ace 150",
      "Vehicle class": "motorcycle",
      "Final drive": "Chain",
      "Cooling type": "Air",
      "Starter type": "Electric",
      "Front tire size": "2.75-18",
      "Rear tire size": "90/90-18",
    });
    expect(row.vehicle_class).toBe("motorcycle");
    expect(row.final_drive).toBe("Chain");
    expect(row.cooling_type).toBe("Air");
    expect(row.starter_type).toBe("Electric");
    expect(row.front_tire_size).toBe("2.75-18");
    expect(row.rear_tire_size).toBe("90/90-18");
  });
});

describe("collectUnknownCatalogCsvHeaders", () => {
  it("returns empty when all headers are known", () => {
    expect(collectUnknownCatalogCsvHeaders(["Make", "Model", "Production start year"])).toEqual([]);
  });

  it("lists unknown headers without dropping known ones", () => {
    expect(collectUnknownCatalogCsvHeaders(["Make", "Final Drive XYZ", "Seat height mm"])).toEqual([
      "Final Drive XYZ",
    ]);
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
      expect(r.payload.vehicle_class).toBe("car");
      expect(r.payload.production_end_year).toBeNull();
      expect(r.payload.engine_type).toBe("na");
    }
  });

  it("defaults vehicle_class to car and accepts motorcycle", () => {
    const moto = remapCsvRowToCanonical({
      Make: "Honda",
      Model: "Ace 150",
      "Production start year": "2015",
      "Vehicle class": "motorcycle",
      "Final drive": "Chain",
      "Front brake type": "Disc",
    });
    const r = buildVehicleCatalogCreatePayload(moto);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.vehicle_class).toBe("motorcycle");
      expect(r.payload.final_drive).toBe("Chain");
      expect(r.payload.front_brake_type).toBe("Disc");
    }
  });

  it("returns catalogId for upsert when ID is a UUID", () => {
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const canon = remapCsvRowToCanonical({
      ID: id,
      Make: "Honda",
      Model: "Ace 150",
      "Production start year": "2015",
    });
    const r = buildVehicleCatalogCreatePayload(canon);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.catalogId).toBe(id);
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

describe("pickCatalogIdFromCandidates motorcycle discriminators", () => {
  const base = {
    production_start_year: 2015,
    production_end_year: null as number | null,
    vehicle_class: "motorcycle",
    make: "Honda",
    model: "Ace 150",
  };

  it("narrows Ace variants by front brake type", () => {
    const id = pickCatalogIdFromCandidates(
      [
        { id: "a", ...base, front_brake_type: "Drum" },
        { id: "b", ...base, front_brake_type: "Disc" },
      ],
      { vehicle_class: "motorcycle", front_brake_type: "Disc" },
    );
    expect(id).toBe("b");
  });

  it("returns null when multi-variant and no motorcycle hints", () => {
    const id = pickCatalogIdFromCandidates(
      [
        { id: "a", ...base, front_brake_type: "Drum" },
        { id: "b", ...base, front_brake_type: "Disc" },
      ],
      { vehicle_class: "motorcycle" },
    );
    expect(id).toBeNull();
  });
});
