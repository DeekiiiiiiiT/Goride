/** Shared types for fleet Find parts ↔ fleet-core /parts/* */

export type PartsMyVehicleRow = {
  id?: string;
  vehicle_id?: string;
  plate?: string;
  license_plate?: string;
  label?: string;
  name?: string;
  make?: string;
  model?: string;
  year?: string | number;
  parts_on_shelf?: number;
  subtitle?: string;
  service_due?: string;
  hub?: string;
};

export type PartsVehicleOptions = {
  makes: string[];
  models: string[];
  years: number[];
  versions?: Array<{
    id: string;
    name?: string;
    description?: string;
    fleetCount?: number;
    chassisPrefix?: string;
    chassis_serial_from?: string | null;
  }>;
};

export type PartsTermResult = {
  hits?: Array<{ label: string; make?: string; model?: string; year?: number }>;
  components?: Array<{ id: string; name: string }>;
  synonyms?: string[];
  parts?: Array<{ id: string; name: string }>;
};

export type PartsFindResult = {
  linked?: boolean;
  askVariant?: boolean;
  make?: string;
  model?: string;
  year?: number;
  vehicle?: { plate?: string; label?: string };
  sections?: Array<{ tier?: number; label?: string; items?: Array<Record<string, unknown>> }>;
  car?: { label?: string };
};

export type PartsQuotePayload = {
  partId?: string;
  partNumber?: string;
  qty: number;
  urgency?: string;
  note?: string;
  vehicleId?: string | null;
  componentId?: string;
  workOrder?: string;
  targetPriceJmd?: number;
};

export type PartsRequestPayload = {
  vehicleId?: string | null;
  componentId?: string;
  partName?: string;
  qty?: number;
  urgency?: string;
  note?: string;
  photo_url?: string;
  kind?: string;
  make?: string;
  model?: string;
  year?: number;
};
