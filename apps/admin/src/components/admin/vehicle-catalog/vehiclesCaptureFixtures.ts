import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { CAPTURE_ROOMY_VEHICLE_ID } from "../parts-database/add-parts/catalog/catalogCaptureFixtures";
import { CAPTURE_ROOMY_PRIMARY_ID, vehiclesCaptureVehicleRecords } from "./vehiclesCaptureFixtureData";
import type { VehiclesDashboard } from "./vehiclesCatalogApi";
import type { PartsOverview } from "../parts-database/partsDatabaseApi";
export {
  CAPTURE_ROOMY_PRIMARY_ID,
  VEHICLES_CAPTURE_CHECKLIST,
  VEHICLES_CAPTURE_MAKERS,
  VEHICLES_CAPTURE_SPEC_KEYS,
  vehiclesCaptureVehicleRecords,
} from "./vehiclesCaptureFixtureData";

export type VehiclesCaptureId =
  | "vehicles_master_catalog"
  | "toyota_models"
  | "toyota_roomy_versions"
  | "toyota_roomy_overview"
  | "toyota_roomy_car_specs"
  | "toyota_roomy_add_or_edit_spec"
  | "toyota_roomy_parts_on_file"
  | "toyota_roomy_sister_cars_history"
  | "vehicles_add_a_car"
  | "vehicles_system_states_dialogs"
  | "vehicles_dark_mode_versions_specs"
  | "vehicles_phone_390px_home_versions_specs"
  | "states_empty"
  | "states_loading"
  | "states_error"
  | "states_retire";

export function vehiclesCaptureFromUrl(): VehiclesCaptureId | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("vehiclesCapture")?.trim();
  return (raw as VehiclesCaptureId) || null;
}

const baseFields = {
  vehicle_class: "car" as const,
  body_type: "Hatchback",
  doors: 5,
  trim_series: null,
  generation: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: "active" as const,
};

/** Live-aligned demo rows (5 Roomy, Tank, Thor, Justy). */
export function captureFixtureRecords(): VehicleCatalogRecord[] {
  return vehiclesCaptureVehicleRecords.map((v) => ({
    ...baseFields,
    id: v.id,
    make: v.make,
    model: v.model,
    production_start_year: v.production_start_year,
    production_end_year: v.production_end_year,
    drivetrain: v.drivetrain,
    engine_code: v.engine_code,
    engine_type: v.engine_type ?? (v.engine_code.includes("VET") ? "Turbo" : null),
    engine_displacement_l: 1.0,
    fuel_type: "Petrol",
    chassis_code: v.chassis_code,
    version_name: v.version_name ?? null,
    front_brake_type: "Ventilated disc",
    rear_brake_type: "Drum",
    transmission: "CVT",
    seating_capacity: 5,
  })) as unknown as VehicleCatalogRecord[];
}

export const CAPTURE_PRIMARY_ROOMY_ID = CAPTURE_ROOMY_VEHICLE_ID;

export function captureInitialRoute(cap: VehiclesCaptureId | null): {
  screen: "home" | "maker" | "model" | "car" | "add" | "states";
  make?: string;
  model?: string;
  carId?: string;
  tab?: string;
  specPanel?: boolean;
  retireDialog?: boolean;
  statesMode?: "empty" | "loading" | "error" | "retire" | "gallery";
} {
  if (!cap) return { screen: "home" };
  switch (cap) {
    case "toyota_models":
      return { screen: "maker", make: "Toyota" };
    case "toyota_roomy_versions":
    case "vehicles_dark_mode_versions_specs":
    case "vehicles_phone_390px_home_versions_specs":
      return { screen: "model", make: "Toyota", model: "Roomy" };
    case "toyota_roomy_overview":
      return {
        screen: "car",
        make: "Toyota",
        model: "Roomy",
        carId: CAPTURE_PRIMARY_ROOMY_ID,
        tab: "overview",
      };
    case "toyota_roomy_car_specs":
      return {
        screen: "car",
        make: "Toyota",
        model: "Roomy",
        carId: CAPTURE_PRIMARY_ROOMY_ID,
        tab: "specs",
      };
    case "toyota_roomy_add_or_edit_spec":
      return {
        screen: "car",
        make: "Toyota",
        model: "Roomy",
        carId: CAPTURE_PRIMARY_ROOMY_ID,
        tab: "specs",
        specPanel: true,
      };
    case "toyota_roomy_parts_on_file":
      return {
        screen: "car",
        make: "Toyota",
        model: "Roomy",
        carId: CAPTURE_PRIMARY_ROOMY_ID,
        tab: "parts",
      };
    case "toyota_roomy_sister_cars_history":
      return {
        screen: "car",
        make: "Toyota",
        model: "Roomy",
        carId: CAPTURE_PRIMARY_ROOMY_ID,
        tab: "history",
      };
    case "vehicles_add_a_car":
      return { screen: "add" };
    case "states_empty":
      return { screen: "states", statesMode: "empty" };
    case "states_loading":
      return { screen: "states", statesMode: "loading" };
    case "states_error":
      return { screen: "states", statesMode: "error" };
    case "states_retire":
      return { screen: "states", statesMode: "retire" };
    case "vehicles_system_states_dialogs":
      return { screen: "states", statesMode: "gallery" };
    default:
      return { screen: "home" };
  }
}

/**
 * Capture-only sample for the Vehicles home dashboard screenshots.
 * Live counts come from admin_vehicles_dashboard / parts-overview; these are never written anywhere.
 */
export const VEHICLES_CAPTURE_OVERVIEW: PartsOverview = {
  vehicles: 1833,
  partsOnFile: 28,
  fitmentsOnFile: 149,
  vehiclesWithParts: 63,
  waiting: 6,
} as PartsOverview;

export const VEHICLES_CAPTURE_DASHBOARD: VehiclesDashboard = {
  versions: 1833,
  completeness: { high: 0, mid: 4, low: 59, none: 1770 },
  withSpecs: 41,
  withoutSpecs: 1792,
  mostComplete: [
    { id: CAPTURE_ROOMY_PRIMARY_ID, keyParts: 4, specCount: 6 },
    { id: "ap900005-0000-4000-8000-000000000003", keyParts: 4, specCount: 6 },
    { id: "cap-roomy-2016-4wd", keyParts: 4, specCount: 3 },
  ],
  cars: [
    { id: "ap900005-0000-4000-8000-000000000001", keyParts: 4, specCount: 3 },
    { id: CAPTURE_ROOMY_PRIMARY_ID, keyParts: 4, specCount: 6 },
  ],
  pendingApproval: 6,
  recentParts: [
    { id: "cap-part-1", name: "Front brake hose No.1", brand: "Toyota", at: "2026-11-07T20:00:00Z", cars: ["Toyota Roomy", "Toyota Tank"], carCount: 2 },
    { id: "cap-part-2", name: "Rear handbrake cable No.3", brand: "Toyota", at: "2026-11-07T20:00:00Z", cars: ["Toyota Roomy", "Toyota Tank"], carCount: 2 },
    { id: "cap-part-3", name: "Front brake pads", brand: "Toyota", at: "2026-11-07T18:00:00Z", cars: ["Toyota Roomy", "Toyota Tank"], carCount: 2 },
  ],
  recentChanges: [
    { id: "cap-chg-1", carId: CAPTURE_ROOMY_PRIMARY_ID, at: "2026-11-07T21:00:00Z", kind: "spec", action: "added", specLabel: "Brake fluid", fields: [], actor: "Deeki T" },
    { id: "cap-chg-2", carId: "cap-roomy-2016-4wd", at: "2026-11-07T19:00:00Z", kind: "car", action: "edited", fields: ["chassis_code"], actor: "Deeki T" },
  ],
};
