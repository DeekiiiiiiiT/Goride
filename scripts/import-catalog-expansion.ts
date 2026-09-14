/**
 * Phase D controlled import via PostgREST (service role) using the same CSV
 * parser as Dominion. Stamps source=csv_import + one import_batch_id on creates only.
 *
 * Usage: npx --yes tsx scripts/import-catalog-expansion.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  collectUnknownCatalogCsvHeaders,
  parseVehicleCatalogRowsFromRecords,
  VEHICLE_CATALOG_BULK_MAX_ROWS,
} from "../packages/types/src/vehicleCatalogCsvImport.ts";

function loadEnvFile(path: string) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1]!;
      let val = m[2]!.trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

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

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), "apps/admin/.env.local"));
loadEnvFile(resolve(process.cwd(), "supabase/.env"));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
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
if (ready.length === 0) {
  console.error("No ready rows");
  process.exit(1);
}

const importBatchId = randomUUID();
const sb = createClient(url, key, { auth: { persistSession: false } });
let created = 0;
let updated = 0;
const errors: string[] = [];

for (let i = 0; i < ready.length; i += VEHICLE_CATALOG_BULK_MAX_ROWS) {
  const slice = ready.slice(i, i + VEHICLE_CATALOG_BULK_MAX_ROWS);
  for (const r of slice) {
    const payload = { ...(r.payload as Record<string, unknown>) };
    try {
      if (r.catalogId) {
        payload.updated_at = new Date().toISOString();
        payload.source = "csv_import";
        const { error } = await sb.from("vehicle_catalog").update(payload).eq("id", r.catalogId);
        if (error) throw error;
        updated++;
      } else {
        payload.source = "csv_import";
        payload.import_batch_id = importBatchId;
        payload.updated_at = new Date().toISOString();
        const { error } = await sb.from("vehicle_catalog").insert(payload);
        if (error) throw error;
        created++;
      }
    } catch (e: unknown) {
      errors.push(`Row ${r.rowIndex}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`Progress ${Math.min(i + slice.length, ready.length)}/${ready.length}`);
}

const { count } = await sb.from("vehicle_catalog").select("id", { count: "exact", head: true });

mkdirSync(resolve(process.cwd(), "ops"), { recursive: true });
const notePath = resolve(process.cwd(), "ops", "catalog_expansion_import_batch.json");
writeFileSync(
  notePath,
  JSON.stringify(
    {
      import_batch_id: importBatchId,
      created,
      updated,
      failed: errors.length,
      errors: errors.slice(0, 50),
      catalog_total_after: count ?? null,
      imported_at: new Date().toISOString(),
      source_file: "catalog_expansion_2026-09-14.csv",
    },
    null,
    2,
  ),
  "utf8",
);

console.log({ importBatchId, created, updated, failed: errors.length, catalogTotal: count });
console.log(`Ops note → ${notePath}`);
if (errors.length) {
  console.error("Sample errors:", errors.slice(0, 10));
  process.exit(1);
}
