#!/usr/bin/env node
/**
 * Phase E hard delete of money KV keys — GATED.
 *
 * Refuses to run unless:
 *   LEDGER_HARD_RETIRE_CONFIRM=YES_DELETE_MONEY_LEGACY
 *   and --execute
 *
 * Prefer: full DB backup + ledger-retire-backup.mjs --write first.
 *
 * Usage (dry-run counts):
 *   node scripts/ledger-retire-hard-delete.mjs
 *
 * Execute (destructive):
 *   LEDGER_HARD_RETIRE_CONFIRM=YES_DELETE_MONEY_LEGACY node scripts/ledger-retire-hard-delete.mjs --execute
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const execute = process.argv.includes("--execute");
const confirm = process.env.LEDGER_HARD_RETIRE_CONFIRM;

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

async function countLike(prefix) {
  const { count, error } = await sb
    .from("kv_store_37f42386")
    .select("*", { count: "exact", head: true })
    .like("key", `${prefix}%`);
  if (error) throw error;
  return count ?? 0;
}

const counts = {
  ledger_event: await countLike("ledger_event:"),
  toll_ledger: await countLike("toll_ledger:"),
};
console.log("Would delete KV money keys:", counts);

if (!execute) {
  console.log("Dry-run. Pass --execute with LEDGER_HARD_RETIRE_CONFIRM=YES_DELETE_MONEY_LEGACY to delete.");
  process.exit(0);
}

if (confirm !== "YES_DELETE_MONEY_LEGACY") {
  console.error("Refusing: set LEDGER_HARD_RETIRE_CONFIRM=YES_DELETE_MONEY_LEGACY");
  process.exit(2);
}

for (const prefix of ["ledger_event:", "toll_ledger:"]) {
  let deleted = 0;
  for (;;) {
    const { data, error } = await sb
      .from("kv_store_37f42386")
      .select("key")
      .like("key", `${prefix}%`)
      .limit(200);
    if (error) throw error;
    if (!data?.length) break;
    const keys = data.map((r) => r.key);
    const { error: delErr } = await sb.from("kv_store_37f42386").delete().in("key", keys);
    if (delErr) throw delErr;
    deleted += keys.length;
    console.log(`Deleted ${deleted} ${prefix}* …`);
  }
}

console.log("Hard delete of money KV prefixes complete. SQL island rename/drop is a separate migration after backup verify.");
