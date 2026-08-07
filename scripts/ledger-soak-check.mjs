#!/usr/bin/env node
/**
 * Phase 0 soak go/no-go helper.
 * Usage: node scripts/ledger-soak-check.mjs
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);
const { data, error } = await sb.rpc("ledger_soak_status");
if (error) {
  console.error("ledger_soak_status failed:", error.message);
  const { data: islands, error: iErr } = await sb.rpc("ledger_reconcile_islands");
  if (iErr) {
    console.error(iErr.message);
    process.exit(2);
  }
  console.log(JSON.stringify({ fallback: true, islands }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify(data, null, 2));
if (data?.outcome_note) console.log("\n" + data.outcome_note);
const green = data?.go_for_phase_b === true;
const passed = data?.soak_passed_48h === true;
if (passed) {
  console.log("\nGO — Soak passed 48h (islands green + no self-ref)");
  process.exit(0);
}
if (green) {
  console.log(
    `\nGO for Phase B prep (islands green). Soak clock: ${data?.soak_hours_elapsed ?? 0}h / 48h — keep watching dual-write fails.`,
  );
  process.exit(0);
}
console.log("\nNO-GO — fix deltas/self-ref before/during soak");
process.exit(3);
