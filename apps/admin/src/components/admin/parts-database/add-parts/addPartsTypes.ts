export type FitMode = "specific" | "engine" | "spec";

export type SourceType = "car_maker_catalogue" | "part_maker_catalogue" | "other";

export type PartTypeRow = {
  id: string;
  opCode: string | null;
  name: string;
  tradeTerm: string | null;
  editorHint: string | null;
  defaultFitMode: FitMode;
  positionScheme: string;
  status: string;
  iconKey: string | null;
  areaId: string | null;
  specFields: Array<{
    specKey: string;
    label: string;
    unit: string | null;
    dataType: string;
    options: unknown;
    required: boolean;
    example: string | null;
  }>;
};

export type AddPartsDraft = {
  partType: PartTypeRow | null;
  brand: string;
  partNumber: string;
  name: string;
  madeByCarMaker: boolean | null;
  /** Which car maker's EPC when source is car_maker_catalogue */
  catalogCarMaker: string;
  sourceType: SourceType;
  evidenceUrl: string;
  fitMode: FitMode;
  listings: Array<{
    vehicleId: string;
    label?: string;
    position?: string;
    side?: string;
    yearFrom?: number;
    yearTo?: number;
    /** Specific-cars step: Confirmed vs Needs checking per listing */
    listingTrust?: "confirmed" | "needs_checking";
    reason?: string;
  }>;
  engineFamilyId: string;
  engineCode: string;
  excludedVehicleIds: string[];
  specKey: string;
  specValue: string;
  specValues: Record<string, string>;
  position: string;
  side: string;
  factoryNumbers: Array<{ brand: string; number: string }>;
  existingPartId: string | null;
  skipReplacesStep: boolean;
};

export function emptyDraft(): AddPartsDraft {
  return {
    partType: null,
    brand: "",
    partNumber: "",
    name: "",
    madeByCarMaker: null,
    catalogCarMaker: "",
    sourceType: "part_maker_catalogue",
    evidenceUrl: "",
    fitMode: "specific",
    listings: [],
    engineFamilyId: "",
    engineCode: "",
    excludedVehicleIds: [],
    specKey: "",
    specValue: "",
    specValues: {},
    position: "",
    side: "",
    factoryNumbers: [],
    existingPartId: null,
    skipReplacesStep: false,
  };
}
