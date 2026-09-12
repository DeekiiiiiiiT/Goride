#!/usr/bin/env node
/**
 * N-01 guard — every public.fleet_* view's chronologically latest CREATE OR REPLACE
 * in supabase/migrations must include WITH (security_invoker = true).
 * Also fails if a later ALTER VIEW … SET (security_invoker = true) is missing when
 * the latest CREATE omitted WITH (hotfix pattern).
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const CREATE_RE =
  /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.(fleet_[a-zA-Z0-9_]+)\s*(WITH\s*\([^)]*\))?\s*AS/gi;
const ALTER_RE =
  /ALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?public\.(fleet_[a-zA-Z0-9_]+)\s+SET\s*\(\s*security_invoker\s*=\s*true\s*\)/gi;

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

/** @type {Map<string, { file: string; hasInvoker: boolean }>} */
const latestCreate = new Map();
/** @type {Map<string, string>} view → latest file that set invoker via ALTER */
const latestAlter = new Map();

for (const file of files) {
  const text = await readFile(join(migrationsDir, file), "utf8");
  let m;
  CREATE_RE.lastIndex = 0;
  while ((m = CREATE_RE.exec(text)) !== null) {
    const name = m[1];
    const withClause = m[2] ?? "";
    const hasInvoker = /security_invoker\s*=\s*true/i.test(withClause);
    latestCreate.set(name, { file, hasInvoker });
  }
  ALTER_RE.lastIndex = 0;
  while ((m = ALTER_RE.exec(text)) !== null) {
    latestAlter.set(m[1], file);
  }
}

const failures = [];
for (const [name, info] of [...latestCreate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (info.hasInvoker) continue;
  const alterFile = latestAlter.get(name);
  if (alterFile && alterFile >= info.file) continue; // hotfix after bare recreate
  failures.push(
    `${info.file}: public.${name} latest recreate missing security_invoker=true` +
      (alterFile ? ` (stale alter in ${alterFile})` : " (no later ALTER hotfix)"),
  );
}

if (failures.length) {
  console.error("assert-fleet-view-invoker: FAIL");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}

console.log(
  `assert-fleet-view-invoker: OK (${files.length} migrations, ${latestCreate.size} fleet_* views)`,
);
