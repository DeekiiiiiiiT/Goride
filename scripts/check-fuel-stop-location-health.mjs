#!/usr/bin/env node
/**
 * Fuel stop location health (C1–C9).
 *
 * Gates (fail on any rows): C1, C2, C3, C4, C5, C9
 * Reports (warn only): C6, C7, C8
 *
 * Fail-closed when SUPABASE_DB_URL / DATABASE_URL missing unless FORCE_FUEL_STOP_HEALTH_DRY=1.
 *
 * Usage:
 *   pnpm check:fuel-stop-location-health
 *   DATABASE_URL=postgres://... pnpm check:fuel-stop-location-health
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "sql", "fuel_stop_location_health_checks.sql");
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const dryForced = process.env.FORCE_FUEL_STOP_HEALTH_DRY === "1";

const GATE_CHECKS = new Set(["C1", "C2", "C3", "C4", "C5", "C9"]);
const REPORT_CHECKS = new Set(["C6", "C7", "C8"]);

function printInstructions() {
  console.log(`
check:fuel-stop-location-health
-------------------------------
Runs scripts/sql/fuel_stop_location_health_checks.sql per check via psql.

Gates (fail if any rows): C1 C2 C3 C4 C5 C9
Reports (warn only):      C6 C7 C8

  psql "$DATABASE_URL" -f scripts/sql/fuel_stop_location_health_checks.sql

Set DATABASE_URL or SUPABASE_DB_URL. Set FORCE_FUEL_STOP_HEALTH_DRY=1 to exit 0 without DB.
`);
}

/** Split the combined SQL file into { id, sql } blocks keyed by -- C1: headers. */
function splitChecks(sqlText) {
  const lines = sqlText.split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^--\s*(C\d+)\s*:/);
    if (m) {
      if (current) blocks.push(current);
      current = { id: m[1], lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks.map((b) => ({
    id: b.id,
    sql: b.lines.join("\n").trim(),
  }));
}

/** Count data rows from psql aligned/unaligned output (skip headers/separators). */
function countResultRows(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return 0;
  // (0 rows) / (N rows)
  const paren = text.match(/\((\d+)\s+rows?\)/i);
  if (paren) return Number(paren[1]);
  // CSV / unaligned: non-empty lines that aren't column headers alone
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;
  // If only a header line and no data, psql often still prints "(0 rows)"
  return Math.max(0, lines.length - 1);
}

function runCheck(id, sql) {
  const result = spawnSync(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-P", "pager=off", "-c", sql],
    { encoding: "utf8", shell: false },
  );
  if (result.error?.code === "ENOENT") {
    console.error("check:fuel-stop-location-health: psql not found on PATH");
    process.exit(1);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`check:fuel-stop-location-health: ${id} FAIL (psql exit ${result.status})`);
    return { id, ok: false, rows: -1 };
  }
  const rows = countResultRows(result.stdout);
  return { id, ok: true, rows };
}

async function main() {
  if (!dbUrl) {
    printInstructions();
    if (dryForced) {
      console.log("check:fuel-stop-location-health: dry-run — OK");
      process.exit(0);
    }
    console.error(
      "check:fuel-stop-location-health: FAIL — DATABASE_URL or SUPABASE_DB_URL required (fail-closed).",
    );
    process.exit(1);
  }

  const sqlText = await readFile(sqlPath, "utf8");
  const checks = splitChecks(sqlText);
  if (checks.length === 0) {
    console.error("check:fuel-stop-location-health: no C1–C9 blocks found in SQL file");
    process.exit(1);
  }

  let failed = false;
  for (const check of checks) {
    console.log(`\n=== ${check.id} ===`);
    const result = runCheck(check.id, check.sql);
    if (!result.ok) {
      failed = true;
      continue;
    }
    if (GATE_CHECKS.has(check.id)) {
      if (result.rows > 0) {
        console.error(`::error::${check.id} returned ${result.rows} row(s) — expected 0`);
        failed = true;
      } else {
        console.log(`${check.id}: OK (0 rows)`);
      }
    } else if (REPORT_CHECKS.has(check.id)) {
      if (result.rows > 0) {
        console.warn(`::warning::${check.id} report: ${result.rows} row(s)`);
      } else {
        console.log(`${check.id}: report empty`);
      }
    } else {
      console.log(`${check.id}: ran (${result.rows} rows)`);
    }
  }

  if (failed) {
    console.error("\ncheck:fuel-stop-location-health: FAIL");
    process.exit(1);
  }
  console.log("\ncheck:fuel-stop-location-health: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
