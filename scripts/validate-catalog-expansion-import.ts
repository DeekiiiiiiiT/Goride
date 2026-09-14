/**
 * Phase 6 pre-flight: validate catalog_expansion CSV parses and is import-ready.
 * Does not write to the database — run after deploying edge + provenance migration.
 *
 * Usage (from repo root):
 *   npx --yes tsx scripts/validate-catalog-expansion-import.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const csvPath = resolve(process.cwd(), "catalog_expansion_2026-09-14.csv");
const text = readFileSync(csvPath, "utf8");
const records = parseCsv(text);
const unknown = collectUnknownCatalogCsvHeaders(Object.keys(records[0] ?? {}));
const parsed = parseVehicleCatalogRowsFromRecords(records);
const ready = parsed.rows.filter((r) => r.payload);
const withId = ready.filter((r) => r.catalogId);
const errors = parsed.rows.filter((r) => r.parseError);

console.log("=== Catalog expansion pre-flight ===");
console.log(`File: ${csvPath}`);
console.log(`Data rows: ${records.length}`);
console.log(`Ready payloads: ${ready.length}`);
console.log(`ID updates: ${withId.length}`);
console.log(`Parse-error rows: ${errors.length}`);
console.log(`Unknown headers: ${unknown.length ? unknown.join(", ") : "(none)"}`);
console.log("");
console.log("Ops checklist before Dominion Import CSV:");
console.log("  [x] Apply migration 20260914140000_vehicle_catalog_provenance (applied to GoRide)");
console.log("  [ ] Deploy _fleet-server (make-server-37f42386) with bulk/undo/deps routes");
console.log("  [ ] Export current catalog CSV as restore point");
console.log("  [ ] Import via Dominion → Vehicle Catalog → Import CSV");
console.log("  [ ] Record import_batch_id from result dialog");
console.log("  [ ] Spot-check 10 variants; watch Catalog orphans panel 24h");
if (unknown.length > 0 || ready.length === 0) {
  console.error("\nFAIL: CSV is not import-ready.");
  process.exit(1);
}
console.log("\nPASS: CSV parse is import-ready (no unknown headers; ready rows present).");
