#!/usr/bin/env node
/**
 * M5 step 1 — READ-ONLY inventory of every stored reference to the three old buckets.
 *
 * Searches for "/storage/v1/object/", "ephemeral-evidence", "make-37f42386-docs" and
 * "parts-imports" in:
 *   • kv_store_37f42386 values (deep walk by default; --kv-fast is the quick targeted scan)
 *   • evidence_files (bucket_id / storage_path / public_url)
 *   • part_import_batch.storage_path
 *   • every table in the public schema with a column whose name looks like *url*, *path*,
 *     *receipt*, *photo*, *document*, *image*, *invoice* or *metadata* (plus the KV-mirror
 *     `payload_json` columns)
 *   • fleet.* through its public.fleet_* views (the schema itself is not exposed), and writes the
 *     same counts as a read-only SQL file in .r2-migration/ for an independent check
 *
 * Guardrails (CLAUDE.md): ledger tables and ledger KV keys are skipped and named, no `select *`,
 * no OFFSET, no exact count, every query has a LIMIT and pages by primary key. Nothing is written
 * to production; the JSON report goes to .r2-migration/ (git-ignored) with signatures shortened.
 *
 * Usage:
 *   node scripts/r2-find-old-references.mjs [--kv-fast] [--max-rows 2000] [--json-max-rows 1000]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MissingSecretsError,
  REPO_ROOT,
  requireSupabaseSecretKey,
  resolveEnv,
  supabaseUrlOrProjectUrl,
} from "./r2-migration/env.mjs";
import { OLD_BUCKETS } from "./r2-migration/keys.mjs";
import { FILE_PATH_FIELDS } from "./r2-migration/discovery.mjs";
import { discoverReferences } from "./r2-migration/discover.mjs";
import { FLEET_HISTORY_LEFT_AS_WRITTEN, buildFleetInventorySql } from "./r2-migration/fleet.mjs";
import { migrationDir, loadCopiedEntries, stamp, writeJson } from "./r2-migration/manifest.mjs";
import { padRight, parseArgs, section, shortenLine, stopForMissingSecrets } from "./r2-migration/ui.mjs";

const args = parseArgs(process.argv.slice(2));
const kvFast = args["kv-fast"] === true;

function shortenRef(ref) {
  return { ...ref, text: shortenLine(ref.text) };
}

async function main() {
  const serviceKey = requireSupabaseSecretKey({ label: "M5 inventory" });
  const env = resolveEnv(["SUPABASE_URL"]).values;
  const supabaseUrl = supabaseUrlOrProjectUrl(env);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  section(`M5 inventory (read-only) — ${supabaseUrl}`);
  console.log(`Buckets: ${OLD_BUCKETS.join(", ")}`);
  console.log(kvFast ? "KV: targeted scan (--kv-fast; misses nested records)" : "KV: deep scan (all non-ledger keys)");

  const found = await discoverReferences(sb, {
    kvDeep: !kvFast,
    supabaseUrl,
    apiKey: serviceKey,
    maxRows: Number(args["max-rows"] ?? 2000),
    jsonMaxRows: Number(args["json-max-rows"] ?? 1000),
    kvMaxRows: Number(args["kv-max-rows"] ?? 10000),
    fleetMaxRows: Number(args["fleet-max-rows"] ?? 6000),
    onProgress: (p) => {
      if (p.step === "table") return; // one line per table would be noise; errors are reported
      process.stdout.write(`  ${p.step}… ${p.rows} row(s) with references\n`);
    },
  });

  const report = [];
  const kv = found.kv;
  report.push({
    table: "public.kv_store_37f42386",
    column: "value",
    rowsScanned: kv.scanned,
    capped: kv.capped,
    rowsWithRefs: kv.rows.length,
    refs: kv.rows.reduce((n, r) => n + r.refs.length, 0),
    examples: kv.rows.slice(0, 5).map((r) => ({ pk: r.key, ...shortenRef(r.refs[0]) })),
    detail: kv.rows.map((r) => ({ pk: r.key, refs: r.refs.map(shortenRef) })),
  });
  report.push({
    table: "public.evidence_files",
    column: "bucket_id + storage_path + public_url",
    rowsScanned: null,
    capped: false,
    rowsWithRefs: found.evidence.rows.length,
    refs: found.evidence.rows.reduce((n, r) => n + r.refs.length, 0),
    examples: found.evidence.rows.slice(0, 5).map((r) => ({ pk: r.id, ...shortenRef(r.refs[0]) })),
    detail: found.evidence.rows.map((r) => ({ pk: r.id, status: r.status, refs: r.refs.map(shortenRef) })),
  });
  report.push({
    table: "public.part_import_batch",
    column: "storage_path",
    rowsScanned: null,
    capped: false,
    rowsWithRefs: found.parts.rows.length,
    refs: found.parts.rows.reduce((n, r) => n + r.refs.length, 0),
    examples: found.parts.rows.slice(0, 5).map((r) => ({ pk: r.id, ...shortenRef(r.refs[0]) })),
    detail: found.parts.rows.map((r) => ({ pk: r.id, code: r.code, refs: r.refs.map(shortenRef) })),
  });
  for (const table of found.tables) {
    report.push({
      table: `${table.schema}.${table.table}`,
      column: table.column,
      rowsScanned: table.scanned,
      capped: table.capped,
      rowsWithRefs: table.rows.length,
      refs: table.rows.reduce((n, r) => n + r.refs.length, 0),
      examples: table.rows.slice(0, 3).map((r) => ({ pk: r.pk, ...shortenRef(r.refs[0]) })),
      detail: table.rows.map((r) => ({ pk: r.pk, refs: r.refs.map(shortenRef) })),
    });
  }

  // fleet.* is read through its public.fleet_* views (same rows) because the schema itself is
  // not exposed to PostgREST. The read-only SQL file below is the independent cross-check.
  let fleetRows = 0;
  let fleetRefs = 0;
  for (const group of found.fleet.groups) {
    if (!group.rows.length) continue;
    fleetRows += group.rows.length;
    const refs = group.rows.reduce((n, r) => n + r.refs.length, 0);
    fleetRefs += refs;
    report.push({
      table: `fleet.${group.target.table} (public.${group.target.view})`,
      column: group.column,
      rowsScanned: group.scanned,
      capped: group.capped,
      rowsWithRefs: group.rows.length,
      refs,
      examples: group.rows.slice(0, 3).map((r) => ({ pk: r.pk, ...shortenRef(r.refs[0]) })),
      detail: group.rows.map((r) => ({ pk: r.pk, refs: r.refs.map(shortenRef) })),
    });
  }

  section("References found");
  let totalRows = 0;
  let totalRefs = 0;
  for (const row of report) {
    totalRows += row.rowsWithRefs;
    totalRefs += row.refs;
    if (!row.rowsWithRefs) continue;
    const caps = row.capped ? " (capped)" : "";
    console.log(
      `${padRight(`${row.table}.${row.column}`, 62)} rows ${padRight(row.rowsWithRefs, 5)} refs ${padRight(row.refs, 5)} scanned ${row.rowsScanned ?? "?"}${caps}`,
    );
    for (const example of row.examples ?? []) {
      console.log(`    ${example.form}${example.pointer ? ` ${example.pointer}` : ""}  ${example.text}`);
    }
  }
  console.log(`\nTOTAL: ${totalRows} row(s), ${totalRefs} reference(s) to rewrite`);
  if (fleetRows) {
    console.log(
      `  of which fleet.* ${fleetRows} row(s) / ${fleetRefs} reference(s) (read via public.fleet_* views; ` +
        `${FLEET_HISTORY_LEFT_AS_WRITTEN.join(", ")} left as written)`,
    );
  }

  if (found.skippedLedger.length) {
    section("Skipped ledger tables (guardrail — never scanned without org + date range)");
    console.log(found.skippedLedger.join(", "));
  }
  section("Coverage");
  console.log(`columns scanned: ${found.scannedColumns.length}`);
  console.log(
    kvFast
      ? `KV: targeted search over ${FILE_PATH_FIELDS.length} known file-address fields`
      : "KV: every key scanned except the ledger prefixes (nested records included)",
  );
  if (found.errors.length) {
    section("Errors (reported, run continues)");
    for (const error of found.errors) console.log(`- ${error}`);
  }

  const dir = migrationDir(REPO_ROOT);
  const fleetSql = resolve(dir, `fleet-inventory-${stamp()}.sql`);
  writeFileSync(fleetSql, buildFleetInventorySql({ entries: loadCopiedEntries(dir) }), "utf8");
  console.log(`\nFleet read-only SQL (independent count, changes nothing): ${fleetSql}`);

  const file = writeJson(resolve(dir, `inventory-${stamp()}.json`), {
    script: "r2-find-old-references",
    createdAt: new Date().toISOString(),
    supabaseUrl,
    kvFast,
    buckets: OLD_BUCKETS,
    fleetRows,
    fleetRefs,
    fleetSql,
    skippedLedger: found.skippedLedger,
    scannedColumns: found.scannedColumns,
    errors: found.errors,
    report,
  });
  console.log(`Report: ${file}`);
}

main().catch((error) => {
  if (error instanceof MissingSecretsError) {
    stopForMissingSecrets(error);
    return;
  }
  console.error("\nERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
