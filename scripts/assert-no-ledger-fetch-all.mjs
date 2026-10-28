#!/usr/bin/env node
/**
 * L-14 guardrail — fail CI if the fetch-all ledger pattern returns under supabase/functions.
 * Banned:
 *   - listAllUnifiedCanonicalEvents
 *   - .from("ledger_entries").select("*")  (and select('*'))
 *   - .from("ledger_entries") … .range( on the same chain
 *   - maxRows above 1000
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "supabase", "functions");

const SKIP_DIRS = new Set(["node_modules", ".deno", "dist"]);
/** Bundled / generated edge entrypoints — lint sources only. */
const SKIP_FILE_RE =
  /[/\\]fleet-(core|ops|pay|fuel|toll|claims)[/\\]index\.ts$/i;

/** R15: resurrecting the monolith entry would reintroduce fetch-all drains. */
const BANNED_PATH_RE = /[/\\]make-server-37f42386[/\\]/i;

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(p, out);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(ent.name)) continue;
    if (SKIP_FILE_RE.test(p)) continue;
    out.push(p);
  }
  return out;
}

const failures = [];
const files = await walk(root);

for (const file of files) {
  const text = await readFile(file, "utf8");
  const rel = relative(join(__dirname, ".."), file).replace(/\\/g, "/");
  if (BANNED_PATH_RE.test(file)) {
    failures.push(`${rel}: make-server-37f42386 is retired — routes live in fleet-* bundles`);
    continue;
  }
  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  if (/\blistAllUnifiedCanonicalEvents\b/.test(withoutComments)) {
    failures.push(`${rel}: listAllUnifiedCanonicalEvents is banned — use weekSummary / ledgerPage`);
  }

  if (/\.from\(\s*["']ledger_entries["']\s*\)\s*\.select\(\s*["']\*["']/.test(withoutComments)) {
    failures.push(`${rel}: .from("ledger_entries").select("*") is banned — use ledger read API`);
  }

  // Same-chain OFFSET: from("ledger_entries") … .range( before next .from(
  const chainRe =
    /\.from\(\s*["']ledger_entries["']\s*\)[\s\S]{0,400}?\.range\s*\(/g;
  if (chainRe.test(withoutComments)) {
    failures.push(`${rel}: .from("ledger_entries")…range( is banned — use keyset ledger.page`);
  }

  const maxRowsHits = [...withoutComments.matchAll(/maxRows\s*:\s*(\d[\d_]*)/g)];
  for (const m of maxRowsHits) {
    const n = Number(String(m[1]).replace(/_/g, ""));
    if (Number.isFinite(n) && n > 1000) {
      failures.push(`${rel}: maxRows ${n} > 1000 is banned`);
    }
  }
}

if (failures.length) {
  console.error("assert-no-ledger-fetch-all: FAIL");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}

console.log(`assert-no-ledger-fetch-all: OK (${files.length} files scanned)`);
