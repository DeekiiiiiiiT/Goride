/** Parts database Import tab CSV (vehicle + listing columns). */

import { splitCsvLine } from "./partsCatalogCsvImport.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEADER_ALIASES: Record<string, string> = {
  vehicle: "vehicle",
  vehicle_id: "vehicle",
  vehicle_catalog_id: "vehicle",
  vehiclecatalogid: "vehicle",
  manufacturer: "manufacturer",
  brand: "manufacturer",
  part_number: "part_number",
  "part number": "part_number",
  partnumber: "part_number",
  part_name: "part_name",
  "part name": "part_name",
  name: "part_name",
  part_kind: "part_kind",
  "part kind": "part_kind",
  kind: "part_kind",
  category_slug: "category_slug",
  "category slug": "category_slug",
  category: "category_slug",
  job: "job",
  op_code: "job",
  position: "position",
  year_from: "year_from",
  "year from": "year_from",
  year_to: "year_to",
  "year to": "year_to",
  evidence_url: "evidence_url",
  "evidence url": "evidence_url",
  source: "evidence_url",
  evidence: "evidence_url",
};

export type PartsDatabaseImportRow = Record<string, string>;

export function isCatalogVariantUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** e.g. "Toyota Roomy M900A 2019" or "Honda Fit 2018" */
export function parseImportVehicleLabel(raw: string): { make: string; model: string; year: string; chassis: string | null } | null {
  const text = raw.trim();
  if (!text || isCatalogVariantUuid(text)) return null;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;
  const yearToken = tokens[tokens.length - 1];
  if (!/^\d{4}$/.test(yearToken)) return null;
  const year = yearToken;
  const rest = tokens.slice(0, -1);
  const make = rest.shift();
  if (!make) return null;
  let chassis: string | null = null;
  if (rest.length >= 2 && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(rest[rest.length - 1])) {
    chassis = rest.pop() ?? null;
  }
  const model = rest.join(" ").trim();
  if (!model) return null;
  return { make, model, year, chassis };
}

export function parsePartsDatabaseImportCsv(text: string): { rows: PartsDatabaseImportRow[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: ["The file is empty."] };
  const headers = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
  const errors: string[] = [];
  const rows: PartsDatabaseImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;
    const row: PartsDatabaseImportRow = {};
    headers.forEach((key, idx) => {
      if (key) row[key] = (cells[idx] ?? "").trim();
    });
    const lineNo = i + 1;
    if (!row.vehicle || !row.manufacturer || !row.part_number || !row.evidence_url) {
      errors.push(`Line ${lineNo}: vehicle, brand, part number, and source link are required.`);
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}
