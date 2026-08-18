#!/usr/bin/env node
/**
 * Phase 0 / Phase 6 finance recon — read-only dump of driver_financial_periods.
 * Usage: node scripts/finance-recon.mjs
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);
const since = process.argv[2] || "2026-06-16";

const { data, error } = await sb
  .from("driver_financial_periods")
  .select(
    "driver_id, period_anchor, period_end, earnings_gross, cash_collected, cash_returned, cash_still_held, payout_net, settlement_amount, settlement_status, organization_id, fuel_fleet_share, fuel_deduction",
  )
  .gte("period_anchor", since)
  .order("period_anchor", { ascending: true })
  .order("driver_id", { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(2);
}

const rows = data || [];
const mismatches = rows.filter((r) => r.organization_id == null);
console.log(JSON.stringify({ since, rowCount: rows.length, nullOrgCount: mismatches.length, rows }, null, 2));
