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
    catalogueNumber?: number;
    yearFrom?: number;
    yearTo?: number;
    /** Specific-cars step: Confirmed vs Needs checking per listing */
    listingTrust?: "confirmed" | "needs_checking";
    /** Set when the owner picks Confirmed / Needs checking; preview must not overwrite */
    listingTrustManual?: boolean;
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
  catalogueNumber?: number;
  factoryNumbers: Array<{ brand: string; number: string }>;
  existingPartId: string | null;
  skipReplacesStep: boolean;
};

export type CatalogVehicleListing = {
  vehicleId: string;
  yearFrom?: number;
  yearTo?: number;
  trust?: "confirmed" | "needs_checking";
  reason?: string;
  label?: string;
  make?: string;
  model?: string;
  chassisCode?: string | null;
  /** Plain difference line for Selected panel (e.g. 2WD · 1.0 petrol) */
  diffLabel?: string;
  /** A8: cars already on file — shown locked, not sent as new fits */
  locked?: boolean;
};

export type CatalogPartRow = {
  clientId: string;
  partTypeId: string;
  partType?: PartTypeRow | null;
  brand: string;
  partNumber: string;
  position?: string;
  side?: string;
  catalogueNumber?: number;
  existingPartId?: string | null;
  factoryNumbers?: Array<{ brand: string; number: string }>;
};

export type CatalogLinkHints = {
  ok?: boolean;
  host?: string | null;
  trustedSite?: boolean;
  catalogMaker?: string | null;
  frameCodes?: string[];
  sourceTrust?: string;
  error?: string;
};

export type CatalogPageDraft = {
  evidenceUrl: string;
  sourceType: SourceType;
  catalogCarMaker: string;
  madeByCarMaker: boolean | null;
  partKind: "oem" | "aftermarket";
  linkHints: CatalogLinkHints | null;
  vehicleListings: CatalogVehicleListing[];
  partRows: CatalogPartRow[];
  brandDefault: string;
  /** A8 extend part flow */
  extendMode?: boolean;
  extendPartId?: string | null;
  extendPartLabel?: string;
  extendListingCount?: number;
};

export function emptyCatalogDraft(): CatalogPageDraft {
  return {
    evidenceUrl: "",
    sourceType: "car_maker_catalogue",
    catalogCarMaker: "",
    madeByCarMaker: null,
    partKind: "oem",
    linkHints: null,
    vehicleListings: [],
    partRows: [],
    brandDefault: "",
  };
}

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
    catalogueNumber: undefined,
    factoryNumbers: [],
    existingPartId: null,
    skipReplacesStep: false,
  };
}
