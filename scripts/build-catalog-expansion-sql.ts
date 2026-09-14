/**
 * Builds ops artifacts for Phase D import (no DB credentials required).
 * Writes:
 *  - ops/catalog_expansion_payloads.json
 *  - ops/catalog_expansion_insert.sql (batched inserts with one import_batch_id)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  collectUnknownCatalogCsvHeaders,
  parseVehicleCatalogRowsFromRecords,
} from "../packages/types/src/vehicleCatalogCsvImport.ts";

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

const csvPath = resolve(process.cwd(), "catalog_expansion_2026-09-14.csv");
const text = readFileSync(csvPath, "utf8");
const records = parseCsv(text);
const unknown = collectUnknownCatalogCsvHeaders(Object.keys(records[0] ?? {}));
if (unknown.length) {
  console.error("Unknown headers:", unknown.join(", "));
  process.exit(1);
}
const parsed = parseVehicleCatalogRowsFromRecords(records);
const ready = parsed.rows.filter((r) => r.payload);
const importBatchId = randomUUID();

const cols = [
  "make",
  "model",
  "vehicle_class",
  "production_start_year",
  "production_end_year",
  "production_start_month",
  "production_end_month",
  "trim_series",
  "generation",
  "full_model_code",
  "catalog_trim",
  "emissions_prefix",
  "trim_suffix_code",
  "chassis_code",
  "engine_code",
  "engine_type",
  "body_type",
  "doors",
  "length_mm",
  "width_mm",
  "height_mm",
  "wheelbase_mm",
  "ground_clearance_mm",
  "engine_displacement_l",
  "engine_displacement_cc",
  "engine_configuration",
  "fuel_category",
  "fuel_type",
  "fuel_grade",
  "transmission",
  "drivetrain",
  "horsepower",
  "torque",
  "torque_unit",
  "fuel_tank_capacity",
  "fuel_tank_unit",
  "fuel_economy_km_per_l",
  "estimated_km_per_refuel",
  "seating_capacity",
  "curb_weight_kg",
  "gross_vehicle_weight_kg",
  "max_payload_kg",
  "max_towing_kg",
  "front_brake_type",
  "rear_brake_type",
  "brake_size_mm",
  "tire_size",
  "front_tire_size",
  "rear_tire_size",
  "bolt_pattern",
  "wheel_offset_mm",
  "engine_oil_capacity_l",
  "coolant_capacity_l",
  "final_drive",
  "cooling_type",
  "starter_type",
  "seat_height_mm",
  "front_suspension",
  "rear_suspension",
  "gear_count",
  "dry_weight_kg",
  "wheel_size_front",
  "wheel_size_rear",
  "source",
  "import_batch_id",
] as const;

const valueRows: string[] = [];
for (const r of ready) {
  const p = r.payload as Record<string, unknown>;
  const vals = cols.map((c) => {
    if (c === "source") return sqlLiteral("csv_import");
    if (c === "import_batch_id") return sqlLiteral(importBatchId);
    const v = p[c];
    if (v === "" || v === undefined) return "NULL";
    return sqlLiteral(v);
  });
  valueRows.push(`(${vals.join(",")})`);
}

mkdirSync(resolve(process.cwd(), "ops"), { recursive: true });
writeFileSync(
  resolve(process.cwd(), "ops/catalog_expansion_payloads.json"),
  JSON.stringify(
    {
      import_batch_id: importBatchId,
      ready_count: ready.length,
      update_count: ready.filter((r) => r.catalogId).length,
      create_count: ready.filter((r) => !r.catalogId).length,
    },
    null,
    2,
  ),
  "utf8",
);

const CHUNK = 25;
const sqlParts: string[] = [
  `-- Catalog expansion import batch ${importBatchId}`,
  `-- Creates only (CSV has no ID column updates).`,
  `BEGIN;`,
];
for (let i = 0; i < valueRows.length; i += CHUNK) {
  const slice = valueRows.slice(i, i + CHUNK);
  sqlParts.push(
    `INSERT INTO public.vehicle_catalog (${cols.join(", ")})\nVALUES\n${slice.join(",\n")};`,
  );
}
sqlParts.push(`COMMIT;`);
sqlParts.push(
  `SELECT count(*)::int AS batch_rows FROM public.vehicle_catalog WHERE import_batch_id = '${importBatchId}';`,
);
sqlParts.push(`SELECT count(*)::int AS catalog_total FROM public.vehicle_catalog;`);

const sqlPath = resolve(process.cwd(), "ops/catalog_expansion_insert.sql");
writeFileSync(sqlPath, sqlParts.join("\n\n"), "utf8");
console.log(`Batch ${importBatchId}`);
console.log(`Ready creates: ${ready.filter((r) => !r.catalogId).length}`);
console.log(`SQL → ${sqlPath}`);
