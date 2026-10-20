# Week Reconciliation — Guided Wizard & Service-Line Split

**Rev 4 · 2026-10-19 · verification of working tree on `3dd5116b` (21 files uncommitted) + prod**
Open items only. Earlier revisions are in git history.

## Status

The wizard works on one screen (Product rule met). Of the Rev 3 items, R3-02, 04, 05, 07, 08, 09, 10, 11 and 13 are verified closed. **R3-06 is half done. R3-12 introduced a money regression (R4-02).** Running this round also found a **live security hole (R4-01)** that my Rev 3 check missed: I verified tables and views, not functions.

Prod: schema and migration history match the repo, `fleet-core` v73 / `fleet-toll` v43 / `fleet-fuel` v72 run this code, and `recon_wizard` is on for all orgs. **0 week runs and 0 staged imports so far, so nothing has been damaged yet.**

---

## R4-01 · Anyone with the anon key can call 6 `SECURITY DEFINER` functions · Critical (live)

The recon migrations do `REVOKE ALL ... FROM PUBLIC`. On Supabase that isn't enough: default privileges grant `EXECUTE` on new `public` functions **directly to `anon` and `authenticated`**, and revoking from `PUBLIC` leaves those grants in place. Verified in prod with `has_function_privilege`:

| Function (public) | What an anonymous caller can do |
|---|---|
| `bulk_insert_toll_ledger(jsonb)` | **Insert toll rows into any org** (any `organization_id`, driver, amount). There's no org or auth check in the body. |
| `try_claim_week_close(...)` / `release_week_close_lock(...)` | Hold or release any org's Close Week lock (`p_actor` is caller-supplied) |
| `compute_source_coverage(...)` / `list_week_source_summaries(...)` | Read any org's coverage and week summaries |
| `fleet_compute_vehicle_tag_balance(text)` | Read any vehicle's tag balance |

**Fix now (one statement each):** `REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM anon, authenticated;`, then put the same lines in a migration. Add a CI guard: any migration that creates a function in `public` must explicitly revoke from `anon, authenticated` (next to `assert-ledger-view-invoker.mjs`). Then sweep older migrations for the same pattern; the week-close lock RPCs predate recon.

## R4-02 · CSV tolls imported through the wizard skip their money events · High (live, not yet triggered)

R3-12 changed `/recon/imports/:id/commit` (`recon_import_routes.ts:680-726`) to insert via `bulk_insert_toll_ledger` and then mirror to KV. `kv.set` covers service-line stamping, the table upsert and the tag-balance refresh. Everything else `saveTollLedgerEntry` does (`toll_controller.tsx:2933-3045`) is **skipped**:

- plaza-ID match + toll-rate provenance (before the insert)
- content fingerprint (future dedupe)
- canonical toll append → **Business Finance P&L**
- unified-ledger dual write
- **`toll_usage` financial event → driver settlement**

**Effect on the next wizard upload:** the tolls appear in the toll lane but are never charged to drivers, never reach the P&L, and Close Week blocks with `TOLL_EVENT_MISSING`.
**Fix:** split `saveTollLedgerEntry` into `prepareTollLedgerEntry()` (run before the bulk insert) and `afterTollLedgerInsert()` (run for each inserted row), and call both from the bulk path. Until that exists, go back to the per-row `saveTollLedgerEntry` path. Add a test: a toll committed through `/recon/imports` produces exactly one `toll_usage` event and one canonical toll.

## R4-03 · Prod is again running uncommitted code · High

21 modified files and 3 new ones (including migration `20261020120000`, already applied to prod and recorded in its history) are deployed but not committed. Commit them, together with the R4-01 migration.

## R4-04 · First real end-to-end run still not done · High

0 `recon.week_runs`, 0 `recon.import_staging`. After R4-01 and R4-02, run one week: open run → upload toll CSV + Uber bundle → Sources show Covered → **check a `toll_usage` event exists for each imported toll** → Tolls Finish → Fuel → Close preview.

## R4-05 · Close can't detect late rows · Medium (R3-06, half done)

The wizard hashes **live** volume (`sourceVolumeMetrics`, `recon_routes.ts:112`). Close (`week_close_recon.ts:269-272`) hashes the **stored** `run_sources.row_count/amount_minor`. Rows added after the wizard last refreshed don't change close's hash, so `STEP_STALE` won't fire at close. Export `sourceVolumeMetrics` and use it at close.

---

## Deferred with Delivery (unchanged)

Delivery stays behind its readiness card: courier statement writer, courier close, vehicle link, Rush sign-off. Owner questions Q2 (shared-cost allocation), Q3 (payout netting), Q5 (toll statement closing balance) wait for it. Q1 is decided: waive is approver-only.

## Order

R4-01 (today) → R4-02 → R4-03 → R4-04 → R4-05.
