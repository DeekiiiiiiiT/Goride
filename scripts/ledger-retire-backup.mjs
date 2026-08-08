#!/usr/bin/env node
/**
 * Phase E money-island backup (dry-run by default).
 *
 * Usage:
 *   node scripts/ledger-retire-backup.mjs              # dry-run counts
 *   node scripts/ledger-retire-backup.mjs --write      # write JSON dumps under ./tmp/ledger-backup/
 *
 * Hard delete is intentionally NOT in this script. See ledger-retire-hard-delete.mjs
 * which requires LEDGER_HARD_RETIRE_CONFIRM=YES_DELETE_MONEY_LEGACY.
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

const summary = {
  generated_at: new Date().toISOString(),
  kv_ledger_event: await countKv("ledger_event:"),
  kv_toll_ledger: await countKv("toll_ledger:"),
};

const { count: fe } = await sb.schema("ledger").from("financial_events").select("*", { count: "exact", head: true });
const { count: journal } = await sb.schema("rides").from("payment_journal_entries").select("*", { count: "exact", head: true });
summary.financial_events = fe ?? 0;
summary.rides_payment_journal = journal ?? 0;

console.log(JSON.stringify(summary, null, 2));

if (!write) {
  console.log("\nDry-run only. Re-run with --write to dump samples to tmp/ledger-backup/");
  process.exit(0);
}

const outDir = path.resolve("tmp/ledger-backup");
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

const { data: kvSample } = await sb
  .from("kv_store_37f42386")
  .select("key,value")
  .like("key", "ledger_event:%")
  .limit(500);
await writeFile(path.join(outDir, "kv_ledger_event_sample.json"), JSON.stringify(kvSample ?? [], null, 2));

const { data: tollSample } = await sb
  .from("kv_store_37f42386")
  .select("key,value")
  .like("key", "toll_ledger:%")
  .limit(500);
await writeFile(path.join(outDir, "kv_toll_ledger_sample.json"), JSON.stringify(tollSample ?? [], null, 2));

console.log(`Wrote samples to ${outDir}`);
console.log("For full pg_dump of SQL islands, use Supabase dashboard / CLI backup before Phase E.");
