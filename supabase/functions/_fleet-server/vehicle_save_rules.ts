/**
 * Vehicle save rules for certificates + pictures (C3a). Injectable store for tests.
 */
import {
  compareDocuments,
  whitelistDocumentFields,
} from "../_shared/vehiclePictures/documentFields.ts";
import {
  mapVehicleColor,
  VEHICLE_COLORS,
  type VehicleColor,
} from "../_shared/vehiclePictures/color.ts";

import {
  runPictureLookup,
  type PictureLookupDeps,
} from "./vehicle_picture_lookup.ts";
import type { PicturePayload } from "./vehicle_picture_types.ts";

export type PictureLookupResult = PicturePayload;

export type DocumentCheckInput = {
  docType: "fitness" | "registration";
  fileSha256: string;
  fields: Record<string, unknown>;
};

export type FleetVehicleRow = {
  id: string;
  organization_id: string;
  license_plate: string;
  vehicle_catalog_id?: string | null;
  color_standard?: string | null;
  picture_id?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  legacy_kv_id?: string | null;
};

export type DocumentCheckRow = {
  id?: string;
  organization_id: string;
  vehicle_id: string;
  doc_type: "fitness" | "registration";
  issue_date?: string | null;
  expiry_date?: string | null;
  file_sha256: string;
  fields_json: Record<string, unknown>;
  read_by: string;
  reader_provider: string;
  reader_model: string;
};

export type VehicleSaveRulesError = {
  ok: false;
  httpStatus: number;
  code: string;
  error: string;
};

export type VehicleSaveRulesSuccess = {
  ok: true;
  vehicle: Record<string, unknown>;
  picture: PictureLookupResult;
};

export type VehiclePictureSettings = {
  reader_provider?: string;
  reader_model?: string;
};

export interface FleetVehicleStore {
  getVehicle(id: string): Promise<FleetVehicleRow | null>;
  tryInsert(row: FleetVehicleRow): Promise<"inserted" | "conflict">;
  updateVehicle(id: string, patch: Partial<FleetVehicleRow>): Promise<void>;
  insertDocumentCheck(row: DocumentCheckRow): Promise<void>;
  getLatestRegistrationCheck(vehicleId: string, orgId: string): Promise<DocumentCheckRow | null>;
}

export type VehicleSaveRulesDeps = {
  loadSettings: () => Promise<VehiclePictureSettings>;
  store: FleetVehicleStore;
  pictureLookup?: PictureLookupDeps;
};

export type VehicleSaveRulesInput = {
  vehicle: Record<string, unknown>;
  organizationId: string;
  userId: string;
  documentChecks?: DocumentCheckInput[];
  updateDocumentsOnly?: boolean;
  colorStandard?: string | null;
};

export type VehicleSaveValidated = {
  plate: string;
  colorStandard: VehicleColor | null;
  vehicle: Record<string, unknown>;
  existing: FleetVehicleRow | null;
  catalogId: string | null;
  prevCatalog: string | null;
  prevColor: string | null;
  unlinkPicture: boolean;
  checks: DocumentCheckInput[];
  readerProvider: string;
  readerModel: string;
};

const STRIP_PAYLOAD_KEYS = [
  "fitnessCertificateUrl",
  "registrationCertificateUrl",
  "image",
] as const;

export function normalizePlate(vehicle: Record<string, unknown>): string | null {
  const raw = String(vehicle.licensePlate ?? vehicle.id ?? "").trim();
  if (!raw) return null;
  const plate = raw.toUpperCase();
  if (plate.startsWith("UNKNOWN-")) return null;
  return plate;
}

function parseIsoDateField(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, 10);
}

export function resolveColorStandard(
  vehicle: Record<string, unknown>,
  clientStandard?: string | null,
): VehicleColor | null {
  if (clientStandard && (VEHICLE_COLORS as readonly string[]).includes(clientStandard)) {
    return clientStandard as VehicleColor;
  }
  const mapped = mapVehicleColor(String(vehicle.color ?? ""));
  return mapped;
}

export function stripCertificatePayloadFields(vehicle: Record<string, unknown>): Record<string, unknown> {
  const out = { ...vehicle };
  for (const k of STRIP_PAYLOAD_KEYS) delete out[k];
  return out;
}

function fieldsForCompare(checks: DocumentCheckInput[]): {
  fitness?: Record<string, unknown>;
  registration?: Record<string, unknown>;
} {
  const fitness = checks.find((c) => c.docType === "fitness");
  const registration = checks.find((c) => c.docType === "registration");
  return {
    fitness: fitness ? whitelistDocumentFields(fitness.fields) : undefined,
    registration: registration ? whitelistDocumentFields(registration.fields) : undefined,
  };
}

function normChassis(fields: Record<string, unknown> | undefined): string {
  const ch = String(fields?.chassis ?? fields?.vin ?? "");
  return ch.replace(/[\s-]/g, "").toUpperCase();
}

export async function validateVehicleSave(
  deps: VehicleSaveRulesDeps,
  input: VehicleSaveRulesInput,
): Promise<{ ok: true; validated: VehicleSaveValidated } | VehicleSaveRulesError> {
  const plate = normalizePlate(input.vehicle);
  if (!plate) {
    return {
      ok: false,
      httpStatus: 400,
      code: "PLATE_REQUIRED",
      error: "A license plate is required to save this vehicle.",
    };
  }

  const settings = await deps.loadSettings();
  const readerProvider = settings.reader_provider?.trim() || "gemini";
  const readerModel = settings.reader_model?.trim() || "gemini-3.8-flash";

  const checks = input.documentChecks ?? [];
  const { fitness, registration } = fieldsForCompare(checks);

  if (!input.updateDocumentsOnly && fitness && registration) {
    const cmp = compareDocuments(
      {
        plate: String(fitness.plate ?? ""),
        chassis: String(fitness.chassis ?? ""),
        colorAsWritten: String(fitness.colorAsWritten ?? ""),
      },
      {
        plate: String(registration.plate ?? ""),
        chassis: String(registration.chassis ?? ""),
        colorAsWritten: String(registration.colorAsWritten ?? ""),
      },
    );
    if (cmp.chassisMismatch) {
      return {
        ok: false,
        httpStatus: 409,
        code: "CHASSIS_MISMATCH",
        error: "These documents are for different vehicles",
      };
    }
  }

  if (input.updateDocumentsOnly) {
    const regCheck = checks.find((c) => c.docType === "registration");
    if (regCheck) {
      const regPlate = String(whitelistDocumentFields(regCheck.fields).plate ?? "").trim().toUpperCase();
      if (regPlate && regPlate !== plate) {
        return {
          ok: false,
          httpStatus: 409,
          code: "PLATE_MISMATCH",
          error: `This registration is for ${regPlate} — add it as a new vehicle.`,
        };
      }
    }
    const fitCheck = checks.find((c) => c.docType === "fitness");
    if (fitCheck) {
      const lastReg = await deps.store.getLatestRegistrationCheck(plate, input.organizationId);
      const fitCh = normChassis(whitelistDocumentFields(fitCheck.fields));
      const regCh = normChassis(lastReg?.fields_json);
      if (fitCh && regCh && fitCh !== regCh) {
        return {
          ok: false,
          httpStatus: 409,
          code: "CHASSIS_MISMATCH",
          error: "These documents are for different vehicles",
        };
      }
    }
  }

  const existing = await deps.store.getVehicle(plate);
  if (existing && existing.organization_id !== input.organizationId) {
    return {
      ok: false,
      httpStatus: 409,
      code: "PLATE_IN_OTHER_FLEET",
      error: "This plate is registered to another fleet on Roam — contact Roam support.",
    };
  }

  const catalogId =
    input.vehicle.vehicle_catalog_id != null
      ? String(input.vehicle.vehicle_catalog_id).trim() || null
      : null;
  const prevCatalog = existing?.vehicle_catalog_id ?? null;
  const colorStandard = resolveColorStandard(input.vehicle, input.colorStandard);
  const prevColor = existing?.color_standard ?? null;
  const unlinkPicture =
    (colorStandard !== prevColor && (colorStandard != null || prevColor != null)) ||
    (catalogId !== prevCatalog && (catalogId != null || prevCatalog != null));

  let vehicle = stripCertificatePayloadFields({
    ...input.vehicle,
    id: plate,
    licensePlate: plate,
  });
  if (colorStandard) vehicle = { ...vehicle, color_standard: colorStandard };

  return {
    ok: true,
    validated: {
      plate,
      colorStandard,
      vehicle,
      existing,
      catalogId,
      prevCatalog,
      prevColor,
      unlinkPicture,
      checks,
      readerProvider,
      readerModel,
    },
  };
}

export async function commitVehicleSave(
  deps: VehicleSaveRulesDeps,
  input: VehicleSaveRulesInput,
  validated: VehicleSaveValidated,
): Promise<VehicleSaveRulesSuccess | VehicleSaveRulesError> {
  const { plate, colorStandard, existing, catalogId, unlinkPicture } = validated;

  const row: FleetVehicleRow = {
    id: plate,
    organization_id: input.organizationId,
    license_plate: plate,
    vehicle_catalog_id: catalogId,
    color_standard: colorStandard,
    picture_id: unlinkPicture ? null : (existing?.picture_id ?? null),
    make: input.vehicle.make != null ? String(input.vehicle.make) : existing?.make ?? null,
    model: input.vehicle.model != null ? String(input.vehicle.model) : existing?.model ?? null,
    year:
      input.vehicle.year != null && String(input.vehicle.year).trim()
        ? Number(input.vehicle.year)
        : existing?.year ?? null,
    legacy_kv_id: existing?.legacy_kv_id ?? `vehicle:${plate}`,
  };

  if (!existing) {
    const ins = await deps.store.tryInsert(row);
    if (ins === "conflict") {
      const again = await deps.store.getVehicle(plate);
      if (!again) {
        return {
          ok: false,
          httpStatus: 500,
          code: "PLATE_CONFLICT",
          error: "Could not save vehicle.",
        };
      }
      if (again.organization_id !== input.organizationId) {
        return {
          ok: false,
          httpStatus: 409,
          code: "PLATE_IN_OTHER_FLEET",
          error: "This plate is registered to another fleet on Roam — contact Roam support.",
        };
      }
      await deps.store.updateVehicle(plate, row);
    }
  } else {
    await deps.store.updateVehicle(plate, row);
  }

  for (const check of validated.checks) {
    const fields = whitelistDocumentFields(check.fields);
    await deps.store.insertDocumentCheck({
      organization_id: input.organizationId,
      vehicle_id: plate,
      doc_type: check.docType,
      issue_date: parseIsoDateField(fields.issueDate),
      expiry_date: parseIsoDateField(fields.expiryDate),
      file_sha256: check.fileSha256,
      fields_json: fields,
      read_by: input.userId,
      reader_provider: validated.readerProvider,
      reader_model: validated.readerModel,
    });
  }

  let picture: PictureLookupResult = { status: "none", url: null };
  if (deps.pictureLookup) {
    const catalogStatus =
      typeof input.vehicle.catalogStatus === "string" ? input.vehicle.catalogStatus : null;
    picture = await runPictureLookup(deps.pictureLookup, {
      vehicleId: plate,
      organizationId: input.organizationId,
      vehicleCatalogId: catalogId,
      colorStandard,
      catalogStatus,
    });
  }
  return { ok: true, vehicle: validated.vehicle, picture };
}

/** One-shot validate + commit for unit tests. */
export async function applyVehiclePictureSaveRules(
  deps: VehicleSaveRulesDeps,
  input: VehicleSaveRulesInput,
): Promise<VehicleSaveRulesSuccess | VehicleSaveRulesError> {
  const v = await validateVehicleSave(deps, input);
  if (!v.ok) return v;
  return commitVehicleSave(deps, input, v.validated);
}