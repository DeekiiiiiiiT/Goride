import type { AddPartVehicleRow } from "../addPartsApi";
import { emptyCatalogDraft, type CatalogPageDraft } from "../addPartsTypes";
import { vehiclesCaptureVehicleRecords } from "../../../vehicle-catalog/vehiclesCaptureFixtureData";

/** Stable id shared with e2e capture mocks (Handbrake cable, axle_numbered). */
export const CAPTURE_HAND_BRAKE_TYPE_ID = "a9000003-0000-4000-8000-000000000030";

export const CAPTURE_ROOMY_VEHICLE_ID = "ap900005-0000-4000-8000-000000000002";
export const CAPTURE_TANK_VEHICLE_ID = "ap900005-0000-4000-8000-000000000003";

/** Search + sister mocks: 5 Roomy versions + Tank, Thor, Justy. */
export const catalogCaptureVehicleRows: AddPartVehicleRow[] = vehiclesCaptureVehicleRecords.map((v) => ({
  id: v.id,
  make: v.make,
  model: v.model,
  chassis_code: v.chassis_code,
  production_start_year: v.production_start_year,
  production_end_year: v.production_end_year,
  engine_code: v.engine_code,
  version_name: v.version_name ?? null,
  platform_id: "p-m900-sister",
  drivetrain: v.drivetrain,
}));

export const catalogCaptureSisterRows: AddPartVehicleRow[] = catalogCaptureVehicleRows.filter((v) =>
  v.model === "Thor" || v.model === "Justy",
);

function buildCaptureDraft(): CatalogPageDraft {
  return {
    ...emptyCatalogDraft(),
    evidenceUrl:
      "https://partsouq.com/en/catalog/toyota/diagram/JP/2019/TANK-ROOMY/M900A-AGBGE/category/2/diagram/4601/illustration/461556B",
    catalogCarMaker: "Toyota",
    madeByCarMaker: true,
    partKind: "oem",
    brandDefault: "Toyota",
    linkHints: {
      ok: true,
      trustedSite: true,
      catalogMaker: "Toyota",
      frameCodes: ["M900A"],
    },
    vehicleListings: [
      {
        vehicleId: CAPTURE_ROOMY_VEHICLE_ID,
        label: "Toyota Roomy",
        make: "Toyota",
        model: "Roomy",
        chassisCode: "M900A",
        diffLabel: "2WD · 1.0 petrol",
        yearFrom: 2016,
        yearTo: 2020,
        trust: "confirmed",
      },
      {
        vehicleId: CAPTURE_TANK_VEHICLE_ID,
        label: "Toyota Tank",
        make: "Toyota",
        model: "Tank",
        chassisCode: "M900A",
        diffLabel: "2WD · 1.0 petrol",
        yearFrom: 2016,
        yearTo: 2020,
        trust: "confirmed",
      },
    ],
    partRows: [
      {
        clientId: "capture-row-1",
        partTypeId: CAPTURE_HAND_BRAKE_TYPE_ID,
        brand: "Toyota",
        partNumber: "46410-B1011",
        position: "front",
        catalogueNumber: 1,
      },
      {
        clientId: "capture-row-2",
        partTypeId: CAPTURE_HAND_BRAKE_TYPE_ID,
        brand: "Toyota",
        partNumber: "46420-B1090",
        position: "rear",
        catalogueNumber: 2,
      },
      {
        clientId: "capture-row-3",
        partTypeId: CAPTURE_HAND_BRAKE_TYPE_ID,
        brand: "Toyota",
        partNumber: "46430-B1090",
        position: "rear",
        catalogueNumber: 3,
      },
    ],
  };
}

/** Demo draft for screenshot harness (?addPartsCapture=…). */
export function catalogCaptureDraft(kind: string): CatalogPageDraft | null {
  const base = buildCaptureDraft();
  if (kind === "step_3_just_one_part") {
    return { ...base, partRows: [base.partRows[0]!] };
  }
  if (kind === "phone_390px_parts_intake_mobile") {
    return base;
  }
  if (
    kind === "step_1_the_page"
    || kind === "step_2_which_cars"
    || kind === "step_3_parts_on_this_page"
    || kind === "step_4_review_trust_for_each_car"
    || kind === "step_4_review_and_save"
    || kind === "dark_mode_parts_table_review"
    || kind === "help_built_into_the_page"
  ) {
    return base;
  }
  return base;
}

export type CatalogCaptureStep = 1 | 2 | 3 | 4 | 5;

export function catalogCaptureStepFor(kind: string): { step: CatalogCaptureStep; reviewPhase?: "trust" | "save"; singlePart?: boolean } | null {
  switch (kind) {
    case "step_1_the_page":
    case "help_built_into_the_page":
      return { step: 1 };
    case "step_2_which_cars":
      return { step: 2 };
    case "step_3_parts_on_this_page":
      return { step: 3 };
    case "step_3_just_one_part":
      return { step: 3, singlePart: true };
    case "step_4_review_trust_for_each_car":
    case "dark_mode_parts_table_review":
      return { step: 4, reviewPhase: "trust" };
    case "step_4_review_and_save":
      return { step: 4, reviewPhase: "save" };
    case "saved_confirmation_next_steps":
      return { step: 5 };
    case "phone_390px_parts_intake_mobile":
      return { step: 3 };
    default:
      return null;
  }
}
