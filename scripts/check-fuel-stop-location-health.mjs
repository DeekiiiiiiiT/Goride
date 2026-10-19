#!/usr/bin/env node
/**
 * Fuel stop location health (C1–C9).
 *
 * Gates (fail on any rows): C1, C2, C3, C4, C5, C9
 * Reports (warn only): C6, C7, C8
 *
 * Connection (first match):
 *   1. DATABASE_URL / SUPABASE_DB_URL with a password → psql
 *   2. FUEL_STOP_HEALTH_VIA_CLI=1 or passwordless URL + SUPABASE_ACCESS_TOKEN
 *      → `npx supabase db query --linked` (CLI login role)
 *   3. Else fail-closed (unless FORCE_FUEL_STOP_HEALTH_DRY=1)
 *
 * Usage:
 *   pnpm check:fuel-stop-location-health
 *   DATABASE_URL=postgres://... pnpm check:fuel-stop-location-health
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "sql", "fuel_stop_location_health_checks.sql");
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const dryForced = process.env.FORCE_FUEL_STOP_HEALTH_DRY === "1";
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.SUPABASE_PROJECT_ID ||
  "csfllzzastacofsvcdsc";

const GATE_CHECKS = new Set(["C1", "C2", "C3", "C4", "C5", "C9"]);
const REPORT_CHECKS = new Set(["C6", "C7", "C8"]);

function printInstructions() {
  console.log(`
check:fuel-stop-location-health
-------------------------------
Runs scripts/sql/fuel_stop_location_health_checks.sql per check.

Gates (fail if any rows): C1 C2 C3 C4 C5 C9
Reports (warn only):      C6 C7 C8

Prefer a passworded DATABASE_URL / SUPABASE_DB_URL for psql.
Or set SUPABASE_ACCESS_TOKEN (+ optional FUEL_STOP_HEALTH_VIA_CLI=1) to use
\`npx supabase db query --linked\` (same login-role path as local CLI).

Set FORCE_FUEL_STOP_HEALTH_DRY=1 to exit 0 without DB.
`);
}

/** True when URI has user:password@ (not bare user@ or host-only). */
function dbUrlHasPassword(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  // postgres[ql]://user:pass@host — password may be URL-encoded
  return /^(postgres(?:ql)?:\/\/)[^:/@]+:[^@]+@/i.test(s);
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
  const paren = text.match(/\((\d+)\s+rows?\)/i);
  if (paren) return Number(paren[1]);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;
  return Math.max(0, lines.length - 1);
}

function runCheckPsql(id, sql) {
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

/** Parse `supabase db query --linked` JSON ({ rows: [...] }) from mixed stdout. */
function countCliJsonRows(stdout) {
  const text = String(stdout || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return 0;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(parsed?.rows)) return parsed.rows.length;
    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    /* fall through */
  }
  return 0;
}

function ensureLinkedProject() {
  // Already linked locally (supabase/.temp/project-ref) — skip. In CI, link with project-ref only.
  const refPath = join(__dirname, "..", "supabase", ".temp", "project-ref");
  if (existsSync(refPath)) {
    const existing = String(readFileSync(refPath, "utf8") || "").trim();
    if (existing === projectRef) return true;
  }
  const link = spawnSync(
    "npx",
    ["supabase", "link", "--project-ref", projectRef],
    {
      encoding: "utf8",
      shell: true,
      env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
      input: "\n",
    },
  );
  if (link.status !== 0) {
    if (link.stdout) process.stdout.write(link.stdout);
    if (link.stderr) process.stderr.write(link.stderr);
    console.warn("check:fuel-stop-location-health: supabase link returned non-zero — continuing");
  }
  return true;
}

function runCheckCli(id, sql) {
  // Newer CLI: SQL via stdin (positional SQL is ignored → LegacyDbQueryNoStdinSqlError)
  const result = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked"],
    {
      encoding: "utf8",
      shell: true,
      env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
      input: sql.endsWith(";") ? sql : `${sql};`,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`check:fuel-stop-location-health: ${id} FAIL (cli exit ${result.status})`);
    return { id, ok: false, rows: -1 };
  }
  return { id, ok: true, rows: countCliJsonRows(result.stdout) };
}

function resolveRunner() {
  const forceCli = process.env.FUEL_STOP_HEALTH_VIA_CLI === "1";
  const hasToken = Boolean(String(process.env.SUPABASE_ACCESS_TOKEN || "").trim());
  if (dbUrlHasPassword(dbUrl) && !forceCli) return "psql";
  // CLI login role: uses SUPABASE_ACCESS_TOKEN in CI, or local `supabase login` creds
  if (forceCli || hasToken || !dbUrl) {
    if (dbUrl && !dbUrlHasPassword(dbUrl)) {
      console.warn(
        "check:fuel-stop-location-health: SUPABASE_DB_URL has no password — using supabase CLI login role",
      );
    }
    return "cli";
  }
  if (dbUrl && !dbUrlHasPassword(dbUrl)) {
    console.warn(
      "check:fuel-stop-location-health: SUPABASE_DB_URL has no password — using supabase CLI login role",
    );
    return "cli";
  }
  return null;
}

async function main() {
  const runner = resolveRunner();
  if (!runner) {
    printInstructions();
    if (dryForced) {
      console.log("check:fuel-stop-location-health: dry-run — OK");
      process.exit(0);
    }
    console.error(
      "check:fuel-stop-location-health: FAIL — need passworded DATABASE_URL/SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN (fail-closed).",
    );
    process.exit(1);
  }

  const sqlText = await readFile(sqlPath, "utf8");
  const checks = splitChecks(sqlText);
  if (checks.length === 0) {
    console.error("check:fuel-stop-location-health: no C1–C9 blocks found in SQL file");
    process.exit(1);
  }

  if (runner === "cli") {
    if (!ensureLinkedProject()) process.exit(1);
  }

  let failed = false;
  for (const check of checks) {
    console.log(`\n=== ${check.id} ===`);
    const result =
      runner === "cli" ? runCheckCli(check.id, check.sql) : runCheckPsql(check.id, check.sql);
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
