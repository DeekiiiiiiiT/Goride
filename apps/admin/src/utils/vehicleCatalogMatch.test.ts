import { describe, it, expect } from "vitest";
import { normalizeVehicleMatchKey, diceCoefficient } from "./vehicleCatalogMatch";
import { pickCatalogIdFromCandidates, catalogRowContainsFleetMonth } from "./vehicleCatalogResolution";

describe("vehicleCatalogMatch", () => {
  it("normalizeVehicleMatchKey is stable", () => {
    expect(normalizeVehicleMatchKey(" Toyota ", "Roomy", 2019)).toBe("toyota|roomy|2019");
  });

  it("diceCoefficient returns 1 for identical", () => {
    expect(diceCoefficient("toyota", "toyota")).toBe(1);
  });
});

describe("catalogRowContainsFleetMonth", () => {
  it("accepts in-range month", () => {
    expect(
      catalogRowContainsFleetMonth(
        {
          production_start_year: 2020,
          production_start_month: 8,
          production_end_year: 2021,
          production_end_month: 3,
        },
        2020,
        9,
      ),
    ).toBe(true);
  });

  it("rejects before window", () => {
    expect(
      catalogRowContainsFleetMonth(
        {
          production_start_year: 2020,
          production_start_month: 8,
          production_end_year: 2020,
          production_end_month: 10,
        },
        2020,
        7,
      ),
    ).toBe(false);
  });
});

describe("pickCatalogIdFromCandidates", () => {
  const a = {
    id: "a",
    production_start_year: 2018,
    production_end_year: 2022,
    production_start_month: null,
    production_end_month: null,
    trim_series: "Base",
    chassis_code: null as string | null,
    engine_code: null as string | null,
    engine_type: null as string | null,
    drivetrain: null as string | null,
    fuel_type: null as string | null,
    transmission: null as string | null,
  };
  const b = {
    id: "b",
    production_start_year: 2018,
    production_end_year: 2022,
    production_start_month: null,
    production_end_month: null,
    trim_series: "XLE",
    chassis_code: null as string | null,
    engine_code: null as string | null,
    engine_type: null as string | null,
    drivetrain: null as string | null,
    fuel_type: null as string | null,
    transmission: null as string | null,
  };

  it("returns the only candidate", () => {
    expect(pickCatalogIdFromCandidates([a], {})).toBe("a");
  });

  it("returns null when multiple candidates and no hints", () => {
    expect(pickCatalogIdFromCandidates([a, b], {})).toBeNull();
  });

  it("narrows by trim_series", () => {
    expect(pickCatalogIdFromCandidates([a, b], { trim_series: "Base" })).toBe("a");
  });

  it("narrows by full_model_code hint", () => {
    const base = {
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      generation: null,
      full_model_code: null as string | null,
      catalog_trim: null as string | null,
      emissions_prefix: null as string | null,
      trim_suffix_code: null as string | null,
      chassis_code: null,
      engine_code: null as string | null,
      engine_type: null as string | null,
      drivetrain: null as string | null,
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    const x = { ...base, id: "x", full_model_code: "DBA-M900A" };
    const y = { ...base, id: "y", full_model_code: "5BA-M900A" };
    expect(pickCatalogIdFromCandidates([x, y], { full_model_code: "DBA-M900A" })).toBe("x");
  });

  it("narrows by chassis_code hint", () => {
    const x = {
      id: "x",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: "M900A",
      engine_code: null as string | null,
      engine_type: null as string | null,
      drivetrain: null as string | null,
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    const y = {
      id: "y",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: "K410",
      engine_code: null as string | null,
      engine_type: null as string | null,
      drivetrain: null as string | null,
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    expect(pickCatalogIdFromCandidates([x, y], { chassis_code: "M900A" })).toBe("x");
  });

  it("narrows by engine_code hint", () => {
    const x = {
      id: "x",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: null,
      engine_code: "1KR-FE",
      engine_type: null as string | null,
      drivetrain: null as string | null,
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    const y = {
      id: "y",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: null,
      engine_code: "2ZR-FE",
      engine_type: null as string | null,
      drivetrain: null as string | null,
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    expect(pickCatalogIdFromCandidates([x, y], { engine_code: "1KR-FE" })).toBe("x");
  });

  it("narrows by engine_type hint", () => {
    const x = {
      id: "x",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: null,
      engine_code: null,
      engine_type: "turbo",
      drivetrain: null as string | null,
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    const y = {
      id: "y",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: null,
      engine_code: null,
      engine_type: "na",
      drivetrain: null as string | null,
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    expect(pickCatalogIdFromCandidates([x, y], { engine_type: "turbo" })).toBe("x");
  });

  it("narrows by drivetrain hint", () => {
    const x = {
      id: "x",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: null,
      engine_code: null,
      engine_type: null,
      drivetrain: "2WD",
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    const y = {
      id: "y",
      production_start_year: 2018,
      production_end_year: 2018,
      production_start_month: null,
      production_end_month: null,
      trim_series: null,
      chassis_code: null,
      engine_code: null,
      engine_type: null,
      drivetrain: "4WD",
      fuel_type: null as string | null,
      transmission: null as string | null,
    };
    expect(pickCatalogIdFromCandidates([x, y], { drivetrain: "4WD" })).toBe("y");
  });
});
