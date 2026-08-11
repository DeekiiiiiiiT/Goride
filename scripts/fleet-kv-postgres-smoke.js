#!/usr/bin/env node
/**
 * CI smoke: fleet domain registry shape + migration file presence.
 * Does not hit live DB (credentials not assumed in CI).
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const mig = path.join(root, "supabase/migrations/20260811200000_fleet_schema_foundation.sql");
const domains = path.join(root, "supabase/functions/_fleet-server/fleet_domains.ts");
const flags = path.join(root, "supabase/functions/_fleet-server/fleet_table_flags.ts");
const runbook = path.join(root, "docs/FLEET_TABLE_BACKFILL.md");

for (const f of [mig, domains, flags, runbook]) {
  if (!fs.existsSync(f)) {
    console.error("missing", f);
    process.exit(1);
  }
}

const domainSrc = fs.readFileSync(domains, "utf8");
const required = [
  "drivers",
  "vehicles",
  "trips",
  "toll_ledger",
  "fuel_entries",
  "expense_documents",
  "claims",
  "organization_settings",
];
for (const d of required) {
  if (!domainSrc.includes(`domain: "${d}"`)) {
    console.error("fleet_domains missing domain", d);
    process.exit(1);
  }
}

const migSrc = fs.readFileSync(mig, "utf8");
if (!migSrc.includes("CREATE SCHEMA IF NOT EXISTS fleet")) {
  console.error("migration missing fleet schema");
  process.exit(1);
}

console.log("fleet-kv-postgres smoke OK");
