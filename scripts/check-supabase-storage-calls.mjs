#!/usr/bin/env node
/**
 * M6 guard — no new Supabase Storage calls of any kind in `apps/` or `supabase/functions/`.
 *
 * Plan: docs/cloudflare-r2-storage-migration-audit.md §3.7 / §5 M6. After the R2 takeover every
 * file lives on R2, so any `storage.from(` in app or function code (upload, download,
 * createSignedUrl, getPublicUrl, list, remove, …) is a regression. The remaining call sites are the deliberately kept "switch off" branches
 * of migrated routes, the two apps that still fall back to the old direct upload until their next
 * release, and the local test-copy seeder / manual reset scripts (allow-listed). They are pinned
 * in scripts/supabase-storage-baseline.json by exact count, so:
 *   - a call site in a file that is not listed fails the build (new code),
 *   - adding another call site to a listed file fails the build,
 *   - removing one is fine (the baseline is then reported as stale so it can be trimmed).
 *
 * Usage:
 *   node scripts/check-supabase-storage-calls.mjs
 *   node scripts/check-supabase-storage-calls.mjs --write-baseline
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "supabase-storage-baseline.json");
const ROOTS = ["apps", "supabase/functions"];
const WRITE = process.argv.includes("--write-baseline");

const SKIP_DIR = new Set(["node_modules", "dist", "build", ".next", "coverage", "android", "ios", "Pods", ".gradle"]);
// The big monolith index.ts files are scanned too (review 25 Nov: they used to be skipped).
const SKIP_FILE = [
  /\.test\.(ts|tsx|mjs|js)$/,
  /\.d\.ts$/,
];

/**
 * Every `storage.from(` call: upload, download, createSignedUrl, getPublicUrl, list, remove, …
 * The bucket argument may hold nested calls (`.from(bucketFor(x))`), so the opening is matched on
 * its own; the method that follows is only read for the report.
 */
const CALL = /storage\s*\.\s*from\s*\(/g;
const METHOD = /^[\s\S]{0,400}?\)\s*\.\s*([A-Za-z]+)\s*\(/;

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function isAllowed(rel) {
  // Only the local test-copy seeder and the manual reset scripts. They live in scripts/, which
  // this check does not scan; the patterns are kept so the rule stays in one place.
  return /^scripts\/vehicle-pictures-reset(-t22)?\.mjs$/.test(rel);
}

function findCalls(file) {
  const text = readFileSync(file, "utf8");
  const calls = [];
  for (const match of text.matchAll(CALL)) {
    const line = text.slice(0, match.index).split("\n").length;
    const method = METHOD.exec(text.slice(match.index + match[0].length));
    calls.push({ kind: method ? method[1] : "from", line });
  }
  return calls;
}

function baselineReason(rel) {
  if (rel.startsWith("apps/")) {
    return "outside focus (courier/haul); old direct upload until slice 7's scan key + their next release";
  }
  if (rel.startsWith("supabase/functions/")) {
    return "switch-off branch of a migrated route, kept until the old buckets go at M7";
  }
  return "existing call site";
}

function main() {
  const found = new Map();
  for (const root of ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      const rel = toPosix(relative(ROOT, file));
      if (SKIP_FILE.some((re) => re.test(rel))) continue;
      const calls = findCalls(file);
      if (calls.length) found.set(rel, calls);
    }
  }

  if (WRITE) {
    const baseline = {
      note:
        "M6 ratchet: existing Supabase Storage call sites (any storage.from call). Each entry is the exact " +
        "number of calls allowed in that file. New files or extra calls fail CI. Remove an entry " +
        "when its switch-off branch goes at M7.",
      allow: ["scripts/vehicle-pictures-reset.mjs", "scripts/vehicle-pictures-reset-t22.mjs"],
      legacy: Object.fromEntries(
        [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, calls]) => [
          file,
          {
            count: calls.length,
            kinds: calls.map((c) => `${c.kind}:${c.line}`),
            reason: baselineReason(file),
          },
        ]),
      ),
    };
    writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(`Wrote ${relative(ROOT, BASELINE)} with ${found.size} file(s).`);
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch {
    console.error(`Missing or unreadable ${relative(ROOT, BASELINE)}. Run with --write-baseline once.`);
    process.exit(1);
  }
  const legacy = baseline.legacy ?? {};
  const errors = [];
  const warnings = [];

  for (const [file, calls] of found) {
    if (isAllowed(file)) continue;
    const expected = Number(legacy[file]?.count ?? 0);
    if (calls.length > expected) {
      const extra = calls.slice(expected).map((c) => `line ${c.line} (${c.kind})`).join(", ");
      errors.push(
        expected === 0
          ? `${file}: new Supabase Storage ${calls[0].kind} call (line ${calls[0].line}). Files live on R2 now (presign → R2, file-link).`
          : `${file}: ${calls.length} call(s), baseline ${expected}; new: ${extra}.`,
      );
    } else if (calls.length < expected) {
      warnings.push(`${file}: ${expected} -> ${calls.length} call(s); trim the baseline entry.`);
    }
  }
  for (const file of Object.keys(legacy)) {
    if (!found.has(file)) warnings.push(`${file}: no call site left; remove the baseline entry.`);
  }

  const legacyCalls = [...found.values()].reduce((n, calls) => n + calls.length, 0);
  console.log(`Supabase Storage guard — ${found.size} file(s), ${legacyCalls} existing call site(s).`);
  if (warnings.length) {
    console.log("\nStale baseline (not a failure):");
    for (const warning of warnings) console.log(`- ${warning}`);
  }
  if (errors.length) {
    console.error("\nFAIL — new Supabase Storage call(s):");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("OK — no new Supabase Storage call sites.");
}

main();
