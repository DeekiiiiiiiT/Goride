#!/usr/bin/env node
/**
 * M5 step 2 — rewrite stored references to the copies made by scripts/r2-migrate-old-files.mjs.
 *
 * Default is --dry-run: prints every change (table, key/id, field, old → new, signature shortened)
 * and writes a redacted preview to .r2-migration/. --apply first writes a JSON backup of every
 * original value to .r2-migration/, then updates the rows.
 *
 * Two halves:
 *   - API rows (KV, evidence_files, part_import_batch, public.* columns): applied by this script.
 *   - fleet.* rows: the schema is not exposed to PostgREST, so the plan is read through the
 *     public.fleet_* views and written to .r2-migration/fleet-rewrite-<stamp>.sql, which backs the
 *     rows up, sets the new values by primary key (md5-guarded: a row edited after the dry run is
 *     skipped and counted) and prints the leftover count. Run it after the owner's check; this
 *     script never writes fleet.*. fleet.master_change_log is history: untouched.
 *
 * What the new values look like (what the live readers already accept):
 *   evidence + fleet docs  → a signed file-link address (signFileLink shape, 1 year)
 *   parts imports          → the bare R2 key (parts_import_storage.ts reads keys)
 * evidence_files additionally becomes bucket_id = 'r2:private' with storage_path = the new key.
 *
 * Only references whose file is in the manifest with ok === true are touched. A file that was not
 * copied (or no longer exists anywhere) keeps its old address and is listed as skipped.
 *
 * Run it while the apps are quiet: a KV update replaces the whole record, so a record written by
 * the app during the run would lose that write (the backup restores the value it replaced).
 *
 * Usage:
 *   node scripts/r2-rewrite-references.mjs [--dry-run] [--manifest <file>] [--verbose]
 *   node scripts/r2-rewrite-references.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MissingSecretsError,
  REPO_ROOT,
  requireSupabaseSecretKey,
  requireEnv,
  resolveEnv,
  supabaseUrlOrProjectUrl,
} from "./r2-migration/env.mjs";
import { discoverReferences } from "./r2-migration/discover.mjs";
import { FILE_LINK_SECONDS, makeFileLinkSigner } from "./r2-migration/fileLinkSigner.mjs";
import {
  loadManifestFile,
  migrationDir,
  newestFile,
  stamp,
  writeJson,
} from "./r2-migration/manifest.mjs";
import { manifestIndex } from "./r2-migration/references.mjs";
import {
  BACKUP_TABLE,
  FLEET_HISTORY_LEFT_AS_WRITTEN,
  buildFleetRewriteSql,
  describeFleetRow,
  summarizeFleetRows,
} from "./r2-migration/fleet.mjs";
import {
  partitionUpdates,
  planEvidenceRewrites,
  planFleetRewrites,
  planKvRewrites,
  planPartsRewrites,
  planTableRewrites,
  summarizeRewrites,
  updateFreshKey,
} from "./r2-migration/rewrite.mjs";
import { padRight, parseArgs, section, shortenLine, stopForMissingSecrets } from "./r2-migration/ui.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === true;
const dryRun = !apply;

function loadIndex(dir) {
  if (args.manifest) {
    const explicit = resolve(process.cwd(), String(args.manifest));
    const parsed = loadManifestFile(explicit);
    return { file: explicit, entries: parsed.entries, preview: parsed.kind === "plan" };
  }
  const manifestFile = resolve(dir, "manifest-latest.json");
  if (existsSync(manifestFile)) {
    const parsed = loadManifestFile(manifestFile);
    return { file: manifestFile, entries: parsed.entries, preview: parsed.kind === "plan" };
  }
  // No manifest yet: fall back to the M4 dry-run plan so the owner can preview the changes now.
  const planFile = newestFile(dir, "plan");
  if (!planFile) {
    throw new Error(
      `No M4 manifest in ${dir}. Run scripts/r2-migrate-old-files.mjs --apply first (or a dry run to create a plan).`,
    );
  }
  const parsed = loadManifestFile(planFile);
  return {
    file: planFile,
    entries: parsed.entries.filter((entry) => !entry.skip).map((entry) => ({ ...entry, ok: true })),
    preview: true,
  };
}

/**
 * Re-read the rows the plan wants to write, in batches, so the apply can refuse a stale write.
 * Returns Map("<schema>.<table>\0<pk>" → row with the planned original fields).
 */
async function readFreshRows(sb, updates) {
  const map = new Map();
  const groups = new Map();
  for (const update of updates) {
    const key = `${update.schema}.${update.table}`;
    if (!groups.has(key)) {
      groups.set(key, {
        schema: update.schema,
        table: update.table,
        pkColumn: update.pkColumn,
        columns: new Set(),
        pks: new Set(),
      });
    }
    const group = groups.get(key);
    for (const column of Object.keys(update.original ?? {})) group.columns.add(column);
    group.pks.add(update.pk);
  }
  for (const group of groups.values()) {
    const select = [...new Set([group.pkColumn, ...group.columns])].join(",");
    const pks = [...group.pks];
    for (let i = 0; i < pks.length; i += 100) {
      const chunk = pks.slice(i, i + 100);
      const { data, error } = await sb
        .schema(group.schema)
        .from(group.table)
        .select(select)
        .in(group.pkColumn, chunk);
      if (error) throw new Error(`${group.schema}.${group.table}: ${error.message}`);
      for (const row of data ?? []) {
        map.set(`${group.schema}.${group.table}\u0000${row[group.pkColumn]}`, row);
      }
    }
  }
  return map;
}

function printUpdates(results) {
  for (const result of results) {
    for (const update of result.updates) {
      for (const edit of update.edits) {
        console.log(
          `${padRight(update.table, 24)} ${padRight(String(update.pk).slice(0, 36), 38)} ${padRight(edit.pointer, 12)}`,
        );
        console.log(`    old: ${shortenLine(edit.from)}`);
        console.log(`    new: ${shortenLine(edit.to)}`);
      }
    }
  }
}

function redactUpdates(results) {
  return results.map((result) => ({
    updates: result.updates.map((update) => ({
      ...update,
      patch: undefined, // full new values are not needed in the preview file
      edits: update.edits.map((edit) => ({ ...edit, from: shortenLine(edit.from), to: shortenLine(edit.to) })),
    })),
    skipped: result.skipped,
  }));
}

async function main() {
  const serviceKey = requireSupabaseSecretKey({ label: "M5 rewrite" });
  const env = requireEnv(["FILE_LINK_SECRET"], { label: "M5 rewrite" });
  const supabaseUrl = supabaseUrlOrProjectUrl(resolveEnv(["SUPABASE_URL"]).values);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const dir = migrationDir(REPO_ROOT);
  const { file: manifestFile, entries, preview } = loadIndex(dir);
  const index = manifestIndex(entries);

  const seconds = args.seconds ? Number(args.seconds) : FILE_LINK_SECONDS;
  const nowSeconds = args.now ? Number(args.now) : Math.floor(Date.now() / 1000);
  const signLink = makeFileLinkSigner({ secret: env.FILE_LINK_SECRET, supabaseUrl, nowSeconds, seconds });

  section(`M5 rewrite ${dryRun ? "(dry run — nothing is written)" : "(APPLY)"}`);
  console.log(`Manifest: ${manifestFile} (${index.size} copied file(s) with ok=true)`);
  if (preview) {
    console.log("PREVIEW: this manifest is an M4 plan, not a copy result. --apply is refused until M4 --apply runs.");
  }
  console.log(`Links signed for: ${new Date((nowSeconds + seconds) * 1000).toISOString()} (expiry)`);

  if (index.size === 0) {
    console.log("\nNothing copied yet — no reference can be rewritten.");
    return;
  }

  const found = await discoverReferences(sb, {
    // KV defaults to the deep walk: file addresses sit in nested arrays (fuelCycles[0]…receiptUrl).
    kvDeep: args["kv-fast"] !== true,
    supabaseUrl,
    apiKey: serviceKey,
    maxRows: Number(args["max-rows"] ?? 2000),
    jsonMaxRows: Number(args["json-max-rows"] ?? 1000),
    kvMaxRows: Number(args["kv-max-rows"] ?? 10000),
    fleetMaxRows: Number(args["fleet-max-rows"] ?? 6000),
  });
  if (found.errors.length) {
    section("Discovery errors (reported, run continues)");
    for (const error of found.errors) console.log(`- ${error}`);
  }

  const results = [
    planKvRewrites(found.kv.rows, index, signLink),
    planEvidenceRewrites(found.evidence.rows, index, signLink),
    planPartsRewrites(found.parts.rows, index),
    ...found.tables.map((table) =>
      planTableRewrites(table.rows, {
        column: table.column,
        index,
        signLink,
        schema: table.schema,
        table: table.table,
        pkColumn: table.pkColumn,
      })
    ),
  ];
  const fleetPlan = planFleetRewrites(found.fleet.groups, index, signLink);

  const totals = summarizeRewrites(results);
  section("Changes (API: applied by this script)");
  if (totals.rowCount === 0) console.log("none");
  else printUpdates(results);

  section("Changes (fleet.*: applied later by the generated SQL)");
  if (fleetPlan.rows.length === 0) {
    console.log("none");
  } else {
    for (const { table, rows } of summarizeFleetRows(fleetPlan.rows)) {
      console.log(`${padRight(table, 30)} ${padRight(rows, 6)} row(s)`);
    }
    console.log(
      `${padRight("fleet total", 30)} ${padRight(fleetPlan.rows.length, 6)} row(s) · ${fleetPlan.editCount} field change(s)`,
    );
    if (args.verbose === true) {
      for (const row of fleetPlan.rows) {
        const line = describeFleetRow(row);
        console.log(`  ${line.text}`);
        if (line.old) console.log(`      old: ${line.old}`);
        if (line.new) console.log(`      new: ${line.new}`);
      }
    }
  }

  const fleetSqlFile = resolve(dir, `fleet-rewrite-${stamp()}.sql`);
  writeFileSync(fleetSqlFile, buildFleetRewriteSql({ rows: fleetPlan.rows, entries }), "utf8");

  const skipped = [...results.flatMap((result) => result.skipped ?? []), ...fleetPlan.skipped];
  if (skipped.length) {
    section(`Not rewritten (${skipped.length}) — evidence deleted or file not in the manifest`);
    for (const row of skipped.slice(0, 40)) {
      console.log(`- ${row.source} ${row.pk}${row.ref ? ` ${row.ref.bucket}/${row.ref.path}` : ""} — ${row.reason}`);
    }
    if (skipped.length > 40) console.log(`… +${skipped.length - 40} more`);
  }

  console.log(
    `\nTOTAL: API ${totals.rowCount} row(s) / ${totals.editCount} field change(s)` +
      ` + fleet ${fleetPlan.rows.length} row(s) / ${fleetPlan.editCount} field change(s); ${skipped.length} left alone.`,
  );
  console.log(`Fleet SQL (git-ignored): ${fleetSqlFile}`);
  if (fleetPlan.rows.length) {
    console.log(
      `Fleet backup table: ${BACKUP_TABLE} · fleet history left as written: ${FLEET_HISTORY_LEFT_AS_WRITTEN.join(", ")}`,
    );
  }

  if (dryRun) {
    const previewFile = writeJson(resolve(dir, `rewrite-preview-${stamp()}.json`), {
      script: "r2-rewrite-references",
      createdAt: new Date().toISOString(),
      manifest: manifestFile,
      previewOfPlan: preview,
      totals,
      results: redactUpdates(results),
      fleet: {
        rows: fleetPlan.rows.length,
        fields: fleetPlan.editCount,
        byTable: summarizeFleetRows(fleetPlan.rows),
        sql: fleetSqlFile,
        backupTable: BACKUP_TABLE,
        rowsDetail: fleetPlan.rows.map((row) => ({
          table: `fleet.${row.table}`,
          pk: row.pk,
          columns: row.columns.map((column) => ({
            column: column.column,
            edits: column.edits.map((edit) => ({ from: shortenLine(edit.from), to: shortenLine(edit.to) })),
          })),
        })),
      },
      skipped,
    });
    console.log(`\nDry run: nothing written to the database. Preview: ${previewFile}`);
    return;
  }

  if (preview) {
    console.error("\nRefusing --apply: the manifest is a dry-run plan, so the files are not in R2 yet.");
    process.exitCode = 1;
    return;
  }

  // Stale-write guard: re-read every planned row and only write the ones still holding the
  // value the dry run saw. A row edited since then is skipped, never overwritten.
  const allUpdates = results.flatMap((result) => result.updates);
  section("Freshness check (re-read before writing)");
  const fresh = await readFreshRows(sb, allUpdates);
  const { ready, changed } = partitionUpdates(allUpdates, fresh);
  console.log(`${ready.length} row(s) unchanged since the dry run · ${changed.length} changed`);
  if (changed.length) {
    section(`Changed since the dry run — skipped (${changed.length}); run the dry run again to pick them up`);
    for (const row of changed.slice(0, 40)) {
      console.log(`- ${row.schema}.${row.table} ${String(row.pk).slice(0, 40)}${row.reason ? ` (${row.reason})` : ""}`);
    }
    if (changed.length > 40) console.log(`… +${changed.length - 40} more`);
  }

  // Backup before any write, and only for rows that passed the freshness check.
  const backupFile = writeJson(resolve(dir, `backup-${stamp()}.json`), {
    script: "r2-rewrite-references",
    createdAt: new Date().toISOString(),
    manifest: manifestFile,
    rows: ready.map((update) => ({
      source: update.source,
      schema: update.schema,
      table: update.table,
      pkColumn: update.pkColumn,
      pk: update.pk,
      fields: update.edits.map((edit) => ({ pointer: edit.pointer, from: edit.from, to: edit.to })),
      original: update.original,
    })),
  });
  console.log(`\nBackup of every original value: ${backupFile}`);
  if (fleetPlan.rows.length) {
    console.log(`fleet.* is NOT written by this script: ${fleetPlan.rows.length} row(s) are in ${fleetSqlFile}.`);
    console.log("Run that SQL after this script finishes (it backs up, updates by primary key, then prints 0).");
  }

  section("Applying");
  let failed = 0;
  for (const update of ready) {
    const { error } = await sb
      .schema(update.schema)
      .from(update.table)
      .update(update.patch)
      .eq(update.pkColumn, update.pk);
    if (error) {
      failed += 1;
      console.error(`✗ ${update.table} ${update.pk}: ${error.message}`);
      continue;
    }
    console.log(`✓ ${update.table} ${String(update.pk).slice(0, 36)} (${update.edits.length} field(s))`);
  }

  // Verification pass: the same discovery must now find nothing for the copied files.
  if (args["no-verify"] !== true) {
    section("Verify (re-scan)");
    const after = await discoverReferences(sb, {
      kvDeep: args["kv-fast"] !== true,
      supabaseUrl,
      apiKey: serviceKey,
      maxRows: Number(args["max-rows"] ?? 2000),
      jsonMaxRows: Number(args["json-max-rows"] ?? 1000),
      kvMaxRows: Number(args["kv-max-rows"] ?? 10000),
      fleetMaxRows: Number(args["fleet-max-rows"] ?? 6000),
    });
    const changedKeys = new Set(changed.map(updateFreshKey));
    let remaining = 0;
    let remainingChanged = 0;
    const countRefs = (schema, table, pk, refs) => {
      const n = (refs ?? []).filter((ref) => index.has(`${ref.bucket}\u0000${ref.path}`)).length;
      if (!n) return;
      if (changedKeys.has(`${schema}.${table}\u0000${pk}`)) remainingChanged += n;
      else remaining += n;
    };
    for (const row of after.kv.rows) countRefs("public", "kv_store_37f42386", row.key, row.refs);
    for (const row of after.evidence.rows) countRefs("public", "evidence_files", row.id, row.refs);
    for (const row of after.parts.rows) countRefs("public", "part_import_batch", row.id, row.refs);
    for (const table of after.tables) {
      for (const row of table.rows) countRefs(table.schema, table.table, row.pk, row.refs);
    }
    let fleetRemaining = 0;
    for (const group of after.fleet.groups) {
      for (const row of group.rows) {
        fleetRemaining += row.refs.filter((ref) => index.has(`${ref.bucket}\u0000${ref.path}`)).length;
      }
    }
    console.log(remaining === 0
      ? "0 remaining API references to the copied files."
      : `${remaining} API reference(s) still point at copied files — inspect the output above.`);
    if (remainingChanged) {
      console.log(
        `${remainingChanged} reference(s) belong to rows that changed since the dry run — re-run the dry run to pick them up.`,
      );
    }
    console.log(
      `fleet references still present: ${fleetRemaining} (expected until the generated SQL runs; it prints 0 after).`,
    );
    if (remaining !== 0) failed += 1;
  }

  // Keep an audit record of the apply run next to the manifest.
  writeJson(resolve(dir, `rewrite-${stamp()}.json`), {
    script: "r2-rewrite-references",
    createdAt: new Date().toISOString(),
    manifest: manifestFile,
    totals,
    fleet: { rows: fleetPlan.rows.length, fields: fleetPlan.editCount, sql: fleetSqlFile },
    fresh: { ready: ready.length, changed: changed.length },
    failed,
    updatedAt: new Date().toISOString(),
    rows: ready.map((update) => ({
      table: update.table,
      pk: update.pk,
      fields: update.edits.map((edit) => edit.pointer),
    })),
    changedRows: changed.map((update) => ({ table: update.table, pk: update.pk })),
  });

  if (failed) {
    console.error(`\n${failed} update(s) failed. The backup above restores anything that changed.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  if (error instanceof MissingSecretsError) {
    stopForMissingSecrets(error);
    return;
  }
  console.error("\nERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
