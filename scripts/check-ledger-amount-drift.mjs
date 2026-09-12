#!/usr/bin/env node
/**
 * F-26 / Block C — amount drift check wrapper.
 *
 * Fail-closed for CI: exits NON-ZERO when DATABASE_URL / SUPABASE_DB_URL is missing,
 * unless FORCE_LEDGER_DRIFT_DRY=1 (prints instructions and exits 0).
 *
 * Usage:
 *   pnpm check:ledger-amount-drift
 *   DATABASE_URL=postgres://... pnpm check:ledger-amount-drift
 *   FORCE_LEDGER_DRIFT_DRY=1 pnpm check:ledger-amount-drift
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "ledger-amount-drift-check.sql");
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const dryForced = process.env.FORCE_LEDGER_DRIFT_DRY === "1";

function printInstructions() {
  console.log(`
check:ledger-amount-drift (instructions)
----------------------------------------
Compares typed fleet.trips amount/net_to_driver and fleet.toll_ledger
is_reconciled/trip_id vs payload_json (F-26).

Run in Supabase SQL editor or psql:

  \\i scripts/ledger-amount-drift-check.sql

Or:

  psql "$DATABASE_URL" -f scripts/ledger-amount-drift-check.sql

Expect all mismatch counts = 0 (or investigate non-zero rows).

Set DATABASE_URL or SUPABASE_DB_URL to run automatically via psql.
Set FORCE_LEDGER_DRIFT_DRY=1 to print these instructions and exit 0 without a DB URL.
`);
}

async function main() {
  if (!dbUrl) {
    printInstructions();
    if (dryForced) {
      console.log("check:ledger-amount-drift: dry-run (FORCE_LEDGER_DRIFT_DRY=1) — OK");
      process.exit(0);
    }
    console.error(
      "check:ledger-amount-drift: FAIL — DATABASE_URL or SUPABASE_DB_URL required (fail-closed for CI).",
    );
    process.exit(1);
  }

  const sql = await readFile(sqlPath, "utf8");
  const result = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    shell: false,
  });
  if (result.error?.code === "ENOENT") {
    console.error("check:ledger-amount-drift: psql not found on PATH; run the SQL manually:");
    console.error(`  psql "$DATABASE_URL" -f scripts/ledger-amount-drift-check.sql`);
    process.exit(1);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error("check:ledger-amount-drift: FAIL");
    process.exit(result.status ?? 1);
  }
  console.log("check:ledger-amount-drift: OK (psql finished)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
