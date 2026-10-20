#!/usr/bin/env node
/**
 * R4-01 guard — public SECURITY DEFINER wrappers must revoke EXECUTE from
 * anon + authenticated (REVOKE FROM PUBLIC alone leaves Supabase defaults).
 *
 * 1. Hard-check audited recon/week-close/toll names always have a revoke at or
 *    after their latest CREATE.
 * 2. Forward-looking: any CREATE OR REPLACE FUNCTION public.* in migrations
 *    dated >= FORWARD_CUTOFF must include (or be followed by) a matching
 *    REVOKE … FROM … anon, authenticated.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

/** Migrations at/after R4-01 must revoke on every new public function create. */
const FORWARD_CUTOFF = "20261020140000";

/** Always assert these (audit R4-01 + R5-02 legacy SD sweep). */
const AUDITED_NAMES = new Set([
  "bulk_insert_toll_ledger",
  "try_claim_week_close",
  "release_week_close_lock",
  "compute_source_coverage",
  "list_week_source_summaries",
  "fleet_compute_vehicle_tag_balance",
  "fleet_toll_tag_balance_rows",
  // R5-02 — write money state
  "rush_post_journal",
  "rush_transition_money_state",
  "rush_lock_week",
  "rush_lock_lines",
  "rush_week_payable",
  "freeze_settlement_periods_batch",
  "fleet_rebuild_operational_periods",
  // R5-02 — change fleet state
  "fleet_assign_toll_tag",
  "fleet_unassign_toll_tag",
  "fleet_retire_toll_tag",
  "fleet_scan_toll_low_balances",
  "delivery_refresh_surge_now",
  // R5-02 — read another org / live locations
  "fleet_driver_lifetime_totals",
  "fleet_fare_earnings_by_driver",
  "fleet_period_earnings_by_driver",
  "fleet_operational_rollup_by_driver",
  "fleet_trip_status_buckets_by_driver",
  "sum_settlement_queue_totals",
  "delivery_couriers_in_h3_cells",
  "rides_drivers_in_h3_cells",
]);

const CREATE_FN_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\(/gi;

const REVOKE_FN_RE =
  /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\([^)]*\)\s+FROM\s+([^;]+)/gi;

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

/** @type {Map<string, { createFile: string; revokeFile: string | null }>} */
const latest = new Map();

/**
 * @param {string} text
 * @param {string} file
 * @returns {Set<string>} function names revoked from anon+authenticated in this file
 */
function revokedNamesInFile(text, file) {
  const names = new Set();

  REVOKE_FN_RE.lastIndex = 0;
  let m;
  while ((m = REVOKE_FN_RE.exec(text)) !== null) {
    const roles = m[2].toLowerCase();
    if (roles.includes("anon") && roles.includes("authenticated")) {
      names.add(m[1]);
    }
  }

  // DO $$ name-list sweeps targeting public (see fleet_driver_activity / R4-01)
  const inPublicSweep =
    /n\.nspname\s*=\s*'public'/i.test(text) ||
    /n\.nspname\s+IN\s*\([^)]*'public'/i.test(text);
  const hasRevokeLoop =
    /REVOKE\s+ALL\s+ON\s+FUNCTION/i.test(text) &&
    /FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(text);
  if (inPublicSweep && hasRevokeLoop) {
    for (const am of text.matchAll(/'([a-zA-Z0-9_]+)'/g)) {
      names.add(am[1]);
    }
  }

  void file;
  return names;
}

for (const file of files) {
  const text = await readFile(join(migrationsDir, file), "utf8");
  const version = file.slice(0, 14);

  CREATE_FN_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_FN_RE.exec(text)) !== null) {
    const name = m[1];
    const prev = latest.get(name);
    latest.set(name, {
      createFile: file,
      revokeFile: prev?.revokeFile && prev.createFile > file ? prev.revokeFile : null,
    });
  }

  const revoked = revokedNamesInFile(text, file);
  for (const name of revoked) {
    const prev = latest.get(name) ?? { createFile: file, revokeFile: null };
    if (!prev.revokeFile || file >= prev.revokeFile) {
      latest.set(name, { ...prev, revokeFile: file });
    }
  }

  void version;
}

const failures = [];

for (const name of [...AUDITED_NAMES].sort()) {
  const info = latest.get(name);
  if (!info) {
    failures.push(`audited public.${name}() not found in any migration CREATE`);
    continue;
  }
  if (!info.revokeFile || info.revokeFile < info.createFile) {
    failures.push(
      `${info.createFile}: audited public.${name}() lacks REVOKE FROM anon, authenticated` +
        (info.revokeFile ? ` (last revoke ${info.revokeFile})` : ""),
    );
  }
}

for (const [name, info] of [...latest.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const createVer = info.createFile.slice(0, 14);
  if (createVer < FORWARD_CUTOFF) continue;
  if (AUDITED_NAMES.has(name)) continue; // already checked
  if (!info.revokeFile || info.revokeFile < info.createFile) {
    failures.push(
      `${info.createFile}: public.${name}() created at/after ${FORWARD_CUTOFF} without REVOKE FROM anon, authenticated`,
    );
  }
}

if (failures.length) {
  console.error("assert-public-fn-revoke-anon: FAIL");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}

const auditedOk = [...AUDITED_NAMES].filter((n) => latest.has(n)).length;
console.log(
  `assert-public-fn-revoke-anon: OK (${files.length} migrations, ${auditedOk}/${AUDITED_NAMES.size} audited revoked, forward cutoff ${FORWARD_CUTOFF})`,
);
