import { describe, it, expect } from "vitest";
import { catalogCreateDriftFieldNames } from "./vehicleCatalogWriteDrift";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../types/vehicleCatalog";

describe("catalogCreateDriftFieldNames", () => {
  it("flags when server returned blank for sent CSV fields", () => {
    const sent = {
      make: "Toyota",
      model: "Roomy",
      production_start_year: 2016,
      trim_suffix_code: "GBME",
      production_start_month: 11,
      engine_code: "1KR-FE",
      engine_type: "N/A",
    } as VehicleCatalogCreatePayload;
    const returned = {
      id: "x",
      make: "Toyota",
      model: "Roomy",
      production_start_year: 2016,
      production_end_year: 2016,
      trim_series: "Pre-Facelift · Custom G",
      generation: "1st Gen",
      trim_suffix_code: null,
      production_start_month: null,
      engine_code: null,
      engine_type: null,
      body_type: "Hatchback",
      doors: 5,
      length_mm: 3700,
      width_mm: 1670,
      height_mm: 1735,
      wheelbase_mm: 2490,
      ground_clearance_mm: 130,
      engine_displacement_l: 1,
      engine_displacement_cc: 996,
      engine_configuration: "Inline-3",
      fuel_type: "Petrol",
      transmission: "CVT",
      drivetrain: "4WD",
      horsepower: 69,
      torque: 92,
      torque_unit: "Nm",
      fuel_tank_capacity: 36,
      fuel_tank_unit: "L",
      seating_capacity: 5,
      curb_weight_kg: 1150,
      gross_vehicle_weight_kg: 1425,
      max_payload_kg: 275,
      max_towing_kg: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as VehicleCatalogRecord;
    const drift = catalogCreateDriftFieldNames(sent, returned);
    expect(drift.sort()).toEqual(["engine_code", "engine_type", "production_start_month", "trim_suffix_code"].sort());
  });

  it("returns empty when stored matches sent", () => {
    const sent = {
      make: "Toyota",
      model: "Roomy",
      production_start_year: 2016,
      engine_type: "Turbo",
    } as VehicleCatalogCreatePayload;
    const returned = {
      id: "x",
      make: "Toyota",
      model: "Roomy",
      production_start_year: 2016,
      production_end_year: null,
      trim_series: null,
      generation: null,
      body_type: null,
      doors: null,
      length_mm: null,
      width_mm: null,
      height_mm: null,
      wheelbase_mm: null,
      ground_clearance_mm: null,
      engine_displacement_l: null,
      engine_displacement_cc: null,
      engine_configuration: null,
      fuel_type: null,
      transmission: null,
      drivetrain: null,
      horsepower: null,
      torque: null,
      torque_unit: null,
      fuel_tank_capacity: null,
      fuel_tank_unit: null,
      seating_capacity: null,
      curb_weight_kg: null,
      gross_vehicle_weight_kg: null,
      max_payload_kg: null,
      max_towing_kg: null,
      engine_type: "Turbo",
      created_at: "",
      updated_at: "",
    } as VehicleCatalogRecord;
    expect(catalogCreateDriftFieldNames(sent, returned)).toEqual([]);
  });
});
