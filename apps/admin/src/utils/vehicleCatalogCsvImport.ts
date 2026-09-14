/**
 * Parse vehicle catalog CSV for Super Admin import.
 * Core remap/payload logic lives in @roam/types; Papa stays app-local.
 */
import Papa from "papaparse";
export {
  ALIAS_TO_CANONICAL,
  VEHICLE_CATALOG_WRITABLE_KEYS,
  MAX_ENGINE_TYPE_LEN,
  normalizeCatalogCsvHeader,
  collectUnknownCatalogCsvHeaders,
  remapCsvRowToCanonical,
  normalizeEngineType,
  buildVehicleCatalogCreatePayload,
  parseVehicleCatalogRowsFromRecords,
  isVehicleCatalogUuid,
  type BuildPayloadResult,
  type ParsedCatalogImportRow,
  type ParseVehicleCatalogRowsResult,
} from "../../../../packages/types/src/vehicleCatalogCsvImport.ts";
import {
  parseVehicleCatalogRowsFromRecords,
  type ParsedCatalogImportRow,
} from "../../../../packages/types/src/vehicleCatalogCsvImport.ts";

export function parseVehicleCatalogCsvWithPapa(text: string): {
  rows: ParsedCatalogImportRow[];
  unknownHeaders: string[];
} {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => String(h ?? "").replace(/^\uFEFF/, "").trim(),
  });
  return parseVehicleCatalogRowsFromRecords((parsed.data || []) as Record<string, unknown>[]);
}
