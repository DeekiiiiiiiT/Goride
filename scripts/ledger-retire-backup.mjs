#!/usr/bin/env node
/**
 * Phase E money-island backup.
 *
 * Usage:
 *   node scripts/ledger-retire-backup.mjs              # dry-run counts
 *   node scripts/ledger-retire-backup.mjs --write      # full JSON dumps under ./tmp/ledger-backup/
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const write = process.argv.includes("--write");

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

async function countKv(prefix) {
  const { count, error } = await sb
    .from("kv_store_37f42386")
    .select("*", { count: "exact", head: true })
    .like("key", `${prefix}%`);
  if (error) throw error;
  return count ?? 0;
}

async function dumpKvPrefix(prefix, outPath) {
  const PAGE = 500;
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from("kv_store_37f42386")
      .select("key,value")
      .like("key", `${prefix}%`)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
    if (offset > 200_000) break;
  }
  await writeFile(outPath, JSON.stringify(all, null, 2));
  return all.length;
}

async function dumpTable(schema, table, outPath, limit = 50_000) {
  const { data, error } = await sb.schema(schema).from(table).select("*").limit(limit);
  if (error) throw error;
  await writeFile(outPath, JSON.stringify(data ?? [], null, 2));
  return (data ?? []).length;
}

const summary = {
  generated_at: new Date().toISOString(),
  kv_ledger_event: await countKv("ledger_event:"),
  kv_toll_ledger: await countKv("toll_ledger:"),
};

try {
  const { count: fe } = await sb.schema("ledger").from("financial_events").select("*", { count: "exact", head: true });
  summary.financial_events = fe ?? 0;
} catch {
  summary.financial_events = null;
}
try {
  const { count: journal } = await sb.schema("rides").from("payment_journal_entries").select("*", { count: "exact", head: true });
  summary.rides_payment_journal = journal ?? 0;
} catch {
  summary.rides_payment_journal = null;
}

console.log(JSON.stringify(summary, null, 2));

if (!write) {
  console.log("\nDry-run only. Re-run with --write to dump to tmp/ledger-backup/");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve("tmp/ledger-backup", stamp);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

const n1 = await dumpKvPrefix("ledger_event:", path.join(outDir, "kv_ledger_event_full.json"));
const n2 = await dumpKvPrefix("toll_ledger:", path.join(outDir, "kv_toll_ledger_full.json"));
let n3 = 0;
let n4 = 0;
try {
  n3 = await dumpTable("ledger", "financial_events", path.join(outDir, "financial_events.json"));
} catch (e) {
  console.warn("financial_events dump skipped:", e.message);
}
try {
  n4 = await dumpTable("rides", "payment_journal_entries", path.join(outDir, "rides_payment_journal.json"));
} catch (e) {
  console.warn("journal dump skipped:", e.message);
}

const manifest = {
  ...summary,
  dumped: {
    kv_ledger_event: n1,
    kv_toll_ledger: n2,
    financial_events: n3,
    rides_payment_journal: n4,
  },
  outDir,
};
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Backup written to ${outDir}`);
console.log(JSON.stringify(manifest.dumped, null, 2));
