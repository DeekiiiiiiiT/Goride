#!/usr/bin/env node
/**
 * R-04 class guard — SORT_MAP values must not use bare value->> / payload_json->>
 * for keys that behave as numbers (lexicographic sort looks "correct" in the UI).
 * Typed columns and known text JSON fields (status, platform, driverName, …) are OK.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fleetServer = join(__dirname, "..", "supabase", "functions", "_fleet-server");

const FILES = [
  { file: "trip_sort.ts", mapName: "TRIP_SORT_MAP" },
  { file: "fuel_sort.ts", mapName: "FUEL_SORT_MAP" },
  { file: "toll_sort.ts", mapName: "TOLL_SORT_MAP" },
];

/** Keys / JSON path tails that must not be sorted via text JSON extraction. */
const NUMERIC_LOOKING = new Set([
  "distance",
  "duration",
  "amount",
  "liters",
  "odometer",
  "pricePerLiter",
  "price_per_liter",
  "absAmount",
  "netToDriver",
  "net_to_driver",
]);

/** Allowed text fields even when mapped through value->> / payload_json->>. */
const ALLOWED_TEXT_JSON = new Set([
  "status",
  "platform",
  "driverName",
  "date",
  "vehiclePlate",
  "plaza",
  "type",
  "paymentMethod",
  "payment_method",
  "entryMode",
  "entry_mode",
  "auditStatus",
  "audit_status",
  "paymentSource",
  "payment_source",
]);

const JSON_PATH_RE = /^(?:value|payload_json)->>\s*(.+)$/;

/**
 * Parse `export const FOO_SORT_MAP: Record<string, string> = { ... };`
 * @param {string} src
 * @param {string} mapName
 * @returns {Record<string, string>}
 */
function parseSortMap(src, mapName) {
  const startRe = new RegExp(
    `export\\s+const\\s+${mapName}\\s*:\\s*Record<string,\\s*string>\\s*=\\s*\\{`,
  );
  const m = startRe.exec(src);
  if (!m) throw new Error(`Could not find ${mapName}`);
  let i = m.index + m[0].length;
  let depth = 1;
  const bodyStart = i;
  while (i < src.length && depth > 0) {
    const ch = src[i++];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  const body = src.slice(bodyStart, i - 1);
  /** @type {Record<string, string>} */
  const out = {};
  const entryRe = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*"([^"]+)"/g;
  let em;
  while ((em = entryRe.exec(body)) !== null) {
    out[em[1]] = em[2];
  }
  return out;
}

function jsonPathTail(sqlCol) {
  const m = JSON_PATH_RE.exec(String(sqlCol).trim());
  return m ? m[1].trim() : null;
}

function looksNumeric(key, jsonTail) {
  const candidates = [key, jsonTail].filter(Boolean).map((s) => String(s));
  return candidates.some((c) => NUMERIC_LOOKING.has(c));
}

const failures = [];

for (const { file, mapName } of FILES) {
  const src = await readFile(join(fleetServer, file), "utf8");
  const map = parseSortMap(src, mapName);
  for (const [key, sqlCol] of Object.entries(map)) {
    const tail = jsonPathTail(sqlCol);
    if (!tail) continue; // typed / snake_case column — OK
    if (ALLOWED_TEXT_JSON.has(key) || ALLOWED_TEXT_JSON.has(tail)) continue;
    if (looksNumeric(key, tail)) {
      failures.push(
        `${file}: ${mapName}.${key} = "${sqlCol}" — numeric-looking key must use a typed column, not JSON text`,
      );
    }
  }
}

if (failures.length) {
  console.error("assert-ledger-sort-whitelist: FAIL");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}

console.log(
  `assert-ledger-sort-whitelist: OK (${FILES.map((f) => f.mapName).join(", ")} — no bare JSON paths for numeric keys)`,
);
