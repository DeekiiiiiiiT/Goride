#!/usr/bin/env node
/**
 * Delete the five TEST-only Supabase Storage buckets — the ones the owner decided NOT to copy.
 *
 * Dry run (default) lists every object and per-bucket totals; nothing is deleted.
 * --apply empties and deletes the buckets, and refuses to run without --i-have-owner-ok.
 *
 * The three buckets that hold real data (ephemeral-evidence, make-37f42386-docs, parts-imports)
 * are never touched: the script refuses to start if one of them is in its list.
 *
 * Usage:
 *   node scripts/r2-delete-test-buckets.mjs
 *   node scripts/r2-delete-test-buckets.mjs --apply --i-have-owner-ok
 */
import { createClient } from "@supabase/supabase-js";
import {
  MissingSecretsError,
  requireSupabaseSecretKey,
  resolveEnv,
  supabaseUrlOrProjectUrl,
} from "./r2-migration/env.mjs";
import { OLD_BUCKETS, TEST_BUCKETS } from "./r2-migration/keys.mjs";
import { fmtBytes, padRight, parseArgs, section, stopForMissingSecrets } from "./r2-migration/ui.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === true;
const ownerOk = args["i-have-owner-ok"] === true;
const pageSize = 100;
const removeChunk = 100;

const overlap = TEST_BUCKETS.filter((bucket) => OLD_BUCKETS.includes(bucket));
if (overlap.length) {
  console.error(`REFUSING: the delete list overlaps the real-data buckets: ${overlap.join(", ")}`);
  process.exit(1);
}

async function listAllObjects(sb, bucket, prefix = "") {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      if (/not found|does not exist/i.test(error.message)) return { missing: true, objects: [] };
      throw new Error(`${bucket}/${prefix || ""}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || item.id === undefined) {
        const nested = await listAllObjects(sb, bucket, path);
        if (nested.missing) return { missing: true, objects: [] };
        out.push(...nested.objects);
        continue;
      }
      out.push({ path, size: Number(item.metadata?.size ?? 0) });
    }
    if (data.length < pageSize) break;
    offset += data.length;
  }
  return { missing: false, objects: out };
}

async function main() {
  const serviceKey = requireSupabaseSecretKey({ label: "test bucket delete" });
  const supabaseUrl = supabaseUrlOrProjectUrl(resolveEnv(["SUPABASE_URL"]).values);
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (apply && !ownerOk) {
    console.error("REFUSING --apply without --i-have-owner-ok (the owner confirms each bucket delete).");
    process.exitCode = 1;
    return;
  }

  section(`Test buckets ${apply ? "(APPLY — this deletes them)" : "(dry run — nothing is deleted)"}`);
  console.log(`Buckets: ${TEST_BUCKETS.join(", ")}`);
  console.log(`Never touched: ${OLD_BUCKETS.join(", ")}`);

  const plans = [];
  for (const bucket of TEST_BUCKETS) {
    const listed = await listAllObjects(sb, bucket);
    const bytes = listed.objects.reduce((sum, object) => sum + object.size, 0);
    plans.push({ bucket, ...listed, bytes });
    if (listed.missing) {
      console.log(`${padRight(bucket, 24)} bucket does not exist`);
      continue;
    }
    console.log(`${padRight(bucket, 24)} ${padRight(listed.objects.length, 5)} object(s) · ${fmtBytes(bytes)}`);
    if (args.verbose === true) {
      for (const object of listed.objects) console.log(`    ${fmtBytes(object.size)} ${object.path}`);
    }
  }

  const totalObjects = plans.reduce((n, plan) => n + plan.objects.length, 0);
  const totalBytes = plans.reduce((n, plan) => n + plan.bytes, 0);
  console.log(`\nTOTAL: ${totalObjects} object(s) · ${fmtBytes(totalBytes)} across ${plans.length} bucket(s)`);

  if (!apply) {
    console.log("\nDry run: nothing deleted. Use --apply --i-have-owner-ok to empty and delete these buckets.");
    return;
  }

  section("Emptying and deleting");
  for (const plan of plans) {
    if (plan.missing) {
      console.log(`= ${plan.bucket}: already gone`);
      continue;
    }
    const paths = plan.objects.map((object) => object.path);
    let removed = 0;
    for (let i = 0; i < paths.length; i += removeChunk) {
      const chunk = paths.slice(i, i + removeChunk);
      const { error } = await sb.storage.from(plan.bucket).remove(chunk);
      if (error) {
        throw new Error(`${plan.bucket}: remove failed: ${error.message}`);
      }
      removed += chunk.length;
    }
    const { error: deleteError } = await sb.storage.deleteBucket(plan.bucket);
    if (deleteError) throw new Error(`${plan.bucket}: deleteBucket failed: ${deleteError.message}`);
    console.log(`✓ ${plan.bucket}: removed ${removed} object(s), bucket deleted`);
  }

  section("Verify");
  for (const plan of plans) {
    const { data } = await sb.storage.getBucket(plan.bucket);
    console.log(`${padRight(plan.bucket, 24)} ${data ? "STILL PRESENT" : "gone"}`);
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
