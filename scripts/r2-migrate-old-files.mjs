#!/usr/bin/env node
/**
 * M4 — copy the REAL old files from Supabase Storage to Cloudflare R2 (roam-private).
 *
 * Only the three buckets that hold real data are copied (owner decision, 25 Nov):
 *   ephemeral-evidence   → evidence/<old path>
 *   make-37f42386-docs   → fleet-docs/legacy/<old path>
 *   parts-imports        → parts-imports/platform/<batch>/source.csv
 * The five test buckets are never copied (see scripts/r2-delete-test-buckets.mjs).
 *
 * Default is --dry-run: list every object (paged), print old bucket/path, size and the new key,
 * then per-bucket totals. --apply downloads each object, PUTs it to R2 with its original content
 * type and "private, no-store", HEADs it back and compares the size. Objects already in R2 with
 * the same size are skipped, so re-running is safe.
 *
 * Never deletes anything from Supabase. Never prints a secret.
 * Manifest: .r2-migration/manifest-<utc>.json + manifest-latest.json (git-ignored).
 *
 * Usage:
 *   node scripts/r2-migrate-old-files.mjs [--dry-run]
 *   node scripts/r2-migrate-old-files.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { REPO_ROOT, MissingSecretsError, requireEnv, requireSupabaseSecretKey, supabaseUrlOrProjectUrl } from "./r2-migration/env.mjs";
import { OLD_BUCKETS, PRIVATE_CACHE_CONTROL, contentTypeFor } from "./r2-migration/keys.mjs";
import { buildCopyPlan, shouldSkipExisting, summarizePlan } from "./r2-migration/plan.mjs";
import { R2 } from "./r2-migration/r2.mjs";
import { migrationDir, saveManifest, savePlan } from "./r2-migration/manifest.mjs";
import { fmtBytes, padRight, parseArgs, section, stopForMissingSecrets } from "./r2-migration/ui.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === true;
const dryRun = !apply;
const pageSize = 100;

if (args.help === true) {
  console.log("M4 copy: Supabase Storage → R2. Default --dry-run. Use --apply to copy.\n" +
    "  node scripts/r2-migrate-old-files.mjs [--dry-run] [--apply]");
  process.exit(0);
}

/** Recursive, paged object listing (folders come back with id === null). */
async function listAllObjects(sb, bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`${bucket}/${prefix || ""}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || item.id === undefined) {
        out.push(...(await listAllObjects(sb, bucket, path)));
        continue;
      }
      out.push({
        bucket,
        path,
        size: Number(item.metadata?.size ?? 0),
        contentType: item.metadata?.mimetype ?? null,
      });
    }
    if (data.length < pageSize) break;
    offset += data.length;
  }
  return out;
}

/** evidence_files.storage_path → status, for the ephemeral bucket (keyset paged). */
async function loadEvidenceStatus(sb) {
  const status = new Map();
  let lastId = null;
  for (;;) {
    let query = sb
      .from("evidence_files")
      .select("id,storage_path,status,bucket_id")
      .in("bucket_id", ["ephemeral-evidence", "r2:private"])
      .order("id", { ascending: true })
      .limit(500);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) throw new Error(`evidence_files: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.bucket_id === "ephemeral-evidence" && row.storage_path) status.set(row.storage_path, row.status);
    }
    if (data.length < 500) break;
    lastId = data[data.length - 1].id;
  }
  return status;
}

function printPlan(entries) {
  section("Copy plan (old → new)");
  for (const entry of entries) {
    const size = padRight(fmtBytes(entry.size), 9);
    if (entry.skip) {
      console.log(`${size} SKIP(${entry.skip}) ${entry.bucket}/${entry.path}`);
      if (entry.reason) console.log(`          ${entry.reason}`);
      continue;
    }
    console.log(`${size} ${entry.bucket}/${entry.path}`);
    console.log(`          → roam-private/${entry.key}`);
    if (entry.reason) console.log(`          note: ${entry.reason}`);
  }
}

function printTotals(summary) {
  section("Totals per bucket");
  let listed = 0;
  let toCopy = 0;
  let bytes = 0;
  for (const [bucket, row] of summary) {
    listed += row.listed;
    toCopy += row.toCopy;
    bytes += row.bytes;
    const parts = [
      `listed ${row.listed}`,
      `to copy ${row.toCopy}`,
      fmtBytes(row.bytes),
      row.skippedDeleted ? `skipped deleted ${row.skippedDeleted}` : null,
      row.skippedPlaceholder ? `placeholders ${row.skippedPlaceholder}` : null,
      row.skippedUnsafe ? `UNSAFE ${row.skippedUnsafe}` : null,
      apply ? `copied ${row.copied}` : null,
      apply ? `already in R2 ${row.alreadyInR2}` : null,
      apply && row.failed ? `FAILED ${row.failed}` : null,
      row.warnings ? `warnings ${row.warnings}` : null,
    ].filter(Boolean);
    console.log(`${padRight(bucket, 22)} ${parts.join(" · ")}`);
  }
  console.log(`${padRight("TOTAL", 22)} listed ${listed} · to copy ${toCopy} · ${fmtBytes(bytes)}`);
}

async function main() {
  const env = requireEnv(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"], { label: "M4 copy" });
  env.SUPABASE_SECRET_KEY = requireSupabaseSecretKey({ label: "M4 copy" });
  const serviceKey = env.SUPABASE_SECRET_KEY;
  const supabaseUrl = supabaseUrlOrProjectUrl(env);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const r2 = new R2({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  section(`M4 copy ${dryRun ? "(dry run — nothing is written)" : "(APPLY)"}`);
  console.log(`Supabase: ${supabaseUrl}`);
  console.log(`Buckets:  ${OLD_BUCKETS.join(", ")}`);

  const objects = [];
  for (const bucket of OLD_BUCKETS) {
    const listed = await listAllObjects(sb, bucket);
    console.log(`listed ${padRight(listed.length, 5)} object(s) in ${bucket}`);
    objects.push(...listed);
  }

  const evidenceStatus = await loadEvidenceStatus(sb);
  const entries = buildCopyPlan({ objects, evidenceStatusByPath: evidenceStatus });
  const summary = summarizePlan(entries);

  if (args.quiet !== true) printPlan(entries);
  else {
    section("Objects");
    console.log(`${entries.length} object(s) listed (see the plan file for the full list)`);
  }

  const dir = migrationDir(REPO_ROOT);

  if (dryRun) {
    printTotals(summary);
    const saved = savePlan({ dir, entries, script: "r2-migrate-old-files" });
    console.log(`\nDry run: nothing copied. Plan written to ${saved.plan}`);
    console.log("Re-run with --apply to copy.");
    return;
  }

  section("Copying");
  for (const entry of entries) {
    if (entry.skip) {
      entry.ok = false;
      continue;
    }
    const row = summary.get(entry.bucket);
    try {
      const existing = await r2.head(entry.key);
      if (shouldSkipExisting(existing, entry.size)) {
        entry.ok = true;
        entry.skippedExisting = true;
        entry.copiedAt = new Date().toISOString();
        row.alreadyInR2 += 1;
        console.log(`= already in R2  ${entry.key}`);
        continue;
      }
      const { data: blob, error } = await sb.storage.from(entry.bucket).download(entry.path);
      if (error || !blob) throw new Error(`download failed: ${error?.message ?? "no data"}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const contentType = contentTypeFor(entry.path, blob.type || entry.contentType);
      await r2.put(entry.key, bytes, contentType, PRIVATE_CACHE_CONTROL);
      const verified = await r2.head(entry.key);
      if (!verified || verified.size !== bytes.byteLength) {
        throw new Error(`HEAD size mismatch (${verified?.size ?? "missing"} vs ${bytes.byteLength})`);
      }
      entry.ok = true;
      entry.size = bytes.byteLength;
      entry.contentType = contentType;
      entry.copiedAt = new Date().toISOString();
      row.copied += 1;
      console.log(`✓ ${fmtBytes(entry.size)} ${entry.bucket}/${entry.path} → ${entry.key}`);
    } catch (e) {
      entry.ok = false;
      entry.error = e instanceof Error ? e.message : String(e);
      row.failed += 1;
      console.error(`✗ ${entry.bucket}/${entry.path}: ${entry.error}`);
    }
  }

  const saved = saveManifest({ dir, entries, script: "r2-migrate-old-files" });
  printTotals(summary);
  console.log(`\nManifest: ${saved.manifest}`);
  console.log(`Latest:   ${saved.latest}`);
  const failed = [...summary.values()].reduce((sum, row) => sum + row.failed, 0);
  if (failed) {
    console.error(`\n${failed} object(s) failed — the manifest marks them ok:false, so M5 will not rewrite them.`);
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
