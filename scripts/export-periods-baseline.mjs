#!/usr/bin/env node
/**
 * Phase 0 characterization — read-only baseline export of
 * ledger.driver_financial_periods for the Flawless Weekly Close Program.
 *
 * Writes docs/fixtures/periods-baseline-{YYYY-MM-DD}.json with:
 *   { exportedAt, rowCount, rows }
 * so characterization goldens can pin today's numbers before any remediation.
 *
 * Usage: node scripts/export-periods-baseline.mjs [sinceDate]
 * Env:   SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 * Read-only: SELECT only, no writes.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);
const since = process.argv[2] || "2026-06-16";

// Key money columns — same shape finance-recon.mjs dumps.
const COLUMNS = [
  "driver_id",
  "period_anchor",
  "period_end",
  "organization_id",
  "earnings_gross",
  "cash_collected",
  "cash_returned",
  "cash_still_held",
  "payout_net",
  "settlement_amount",
  "settlement_status",
  "fuel_fleet_share",
  "fuel_deduction",
].join(", ");

const { data, error } = await sb
  .from("driver_financial_periods")
  .select(COLUMNS)
  .gte("period_anchor", since)
  .order("period_anchor", { ascending: true })
  .order("driver_id", { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(2);
}

const rows = data || [];
const exportedAt = new Date().toISOString();
const dateKey = exportedAt.slice(0, 10);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "docs", "fixtures", `periods-baseline-${dateKey}.json`);

await mkdir(dirname(outPath), { recursive: true });
await writeFile(
  outPath,
  JSON.stringify({ exportedAt, rowCount: rows.length, rows }, null, 2),
  "utf8",
);

console.log(`Wrote ${rows.length} rows (since ${since}) → ${outPath}`);
