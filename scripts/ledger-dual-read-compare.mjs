/**
 * Dual-read comparison stub (Phase 4).
 * Compares /trips/search total vs /ledger/search count for an org.
 *
 * Usage:
 *   LEDGER_COMPARE_ORG=<orgId> SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   node scripts/ledger-dual-read-compare.mjs
 *
 * Requires LEDGER_READ_MODEL=1 (or feature flag) on the edge function.
 */
const orgId = process.env.LEDGER_COMPARE_ORG;
const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!orgId || !base || !key) {
    console.log(`
ledger-dual-read-compare (dry instructions)
-----------------------------------------
1. Apply migration 20260911140000_fleet_ledger_entries_read_model.sql
2. Enable feature flag ledger_read_model OR set LEDGER_READ_MODEL=1 on the edge function
3. Call POST /make-server-37f42386/trips/search and POST /make-server-37f42386/ledger/search
   with the same org + date window
4. Assert trips.total ≈ ledger.stats.count for entry_type=trip (to the row)

Set LEDGER_COMPARE_ORG, SUPABASE_URL, and an auth key to run a live probe.
`);
    process.exit(0);
  }

  console.log(`[dual-read] org=${orgId} base=${base}`);
  console.log('[dual-read] Live probe not fully wired without a user JWT; use the UI dual-read banner after enabling the flag.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
