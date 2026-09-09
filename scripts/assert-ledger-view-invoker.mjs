#!/usr/bin/env node
/**
 * N-1 guard — for each public.* → ledger.* 1:1 wrapper view, the chronologically
 * latest CREATE OR REPLACE VIEW in supabase/migrations must include
 * WITH (security_invoker = true). Earlier migrations may omit it; a later
 * recreate without WITH resets reloptions and is a regression.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const VIEW_RE =
  /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.([a-zA-Z0-9_]+)\s*(WITH\s*\([^)]*\))?\s*AS\s+SELECT\s+\*\s+FROM\s+ledger\.([a-zA-Z0-9_]+)/gi;

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
/** @type {Map<string, { file: string; hasInvoker: boolean }>} */
const latest = new Map();

for (const file of files) {
  const text = await readFile(join(migrationsDir, file), "utf8");
  let m;
  VIEW_RE.lastIndex = 0;
  while ((m = VIEW_RE.exec(text)) !== null) {
    const publicName = m[1];
    const withClause = m[2] ?? "";
    const ledgerName = m[3];
    if (publicName !== ledgerName) continue;
    const hasInvoker = /security_invoker\s*=\s*true/i.test(withClause);
    latest.set(publicName, { file, hasInvoker });
  }
}

const failures = [];
for (const [name, info] of [...latest.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!info.hasInvoker) {
    failures.push(`${info.file}: public.${name} latest recreate missing security_invoker=true`);
  }
}

if (failures.length) {
  console.error("assert-ledger-view-invoker: FAIL");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}

console.log(
  `assert-ledger-view-invoker: OK (${files.length} migrations, ${latest.size} wrapper views, all latest defs invoker)`,
);
