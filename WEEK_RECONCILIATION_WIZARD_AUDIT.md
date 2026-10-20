# Week Reconciliation — Guided Wizard & Service-Line Split

**Rev 5 · 2026-10-20 · verification of working tree on `ff095c51` (16 files uncommitted) + prod (`fleet-core` v75)**
Open items only. Earlier revisions are in git history.

## Status

R4-01 (the six recon functions callable by anon), R4-02 (money events skipped on bulk commit) and R4-05 (close used stored volume) are **fixed and live**. Tests: finance-core 238/238, Deno 8/8, new `assert-public-fn-revoke-anon` guard passes. Still **0 week runs and 0 staged imports in prod.**

---

## R5-01 · A bulk toll commit can charge for tolls that were never saved · High

`fleet.bulk_insert_toll_ledger` returns only `{inserted, skipped}` counts, and it swallows every per-row error (`ON CONFLICT DO NOTHING` + `EXCEPTION WHEN others THEN skipped += 1`). The commit (`recon_import_routes.ts:727-743`) then mirrors to KV and runs `afterTollLedgerInsert` for **every prepared row, including skipped ones**.
**Effect:** a duplicate ref+date row in one CSV, a double-submitted import, or a bad date cast produces a `toll_usage` charge (and a P&L entry) for a toll that isn't in `fleet.toll_ledger`. That's an orphan event and a possible double charge.
Also, `afterTollLedgerInsert` errors are only logged (`:741`), so commit reports success even when money events are missing.
**Fix:**
- Make the RPC return the inserted ids (`RETURNING id`), and run the KV mirror + `afterTollLedgerInsert` only for those ids.
- Drop `WHEN others`, so an unexpected error aborts the whole batch. That's the atomicity R3-12 was meant to add.
- Count `afterTollLedgerInsert` failures, mark the staging row `partial`, and return a non-success.
- Extend `recon_toll_commit_money.test.ts` with a skipped-row case: 0 events for skipped rows.

## R5-02 · 23 other `public` `SECURITY DEFINER` functions are still callable by anon · High (older than recon)

The R4-01 sweep found the same exposure outside the recon work. This is the open "anon-reachable ledger RPCs" finding from the Supabase RLS exposure audit, now named. **Verify each one; the body pattern check found no `auth.uid()`/JWT check:**

| Risk | Functions |
|---|---|
| **Write money state** | `rush_post_journal`, `rush_transition_money_state`, `rush_lock_week`, `rush_lock_lines`, `rush_week_payable`, `freeze_settlement_periods_batch`, `fleet_rebuild_operational_periods` |
| **Change fleet state** | `fleet_assign_toll_tag`, `fleet_unassign_toll_tag`, `fleet_retire_toll_tag`, `fleet_scan_toll_low_balances`, `delivery_refresh_surge_now` |
| **Read another org's data** | `fleet_driver_lifetime_totals`, `fleet_fare_earnings_by_driver`, `fleet_period_earnings_by_driver`, `fleet_operational_rollup_by_driver`, `fleet_trip_status_buckets_by_driver`, `sum_settlement_queue_totals`, `delivery_couriers_in_h3_cells`, `rides_drivers_in_h3_cells` (live locations) |
| Ignore | `st_estimatedextent` ×3 (PostGIS) |

**Root cause is still live.** `pg_default_acl` on `public` still grants `EXECUTE` on every new function to `anon` and `authenticated`. The new guard only checks migrations after `20261020140000`, so it can't catch these 23.
**Fix:**
- `REVOKE EXECUTE ... FROM anon, authenticated` on each one the server calls with the service role.
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;` so new functions start closed.
- Add a **live** check (a SQL query over `has_function_privilege`) to the finance-recon/doctor job.

## R5-03 · Prod is running uncommitted code again · Medium

16 files, including migration `20261020140000` (applied and recorded in prod), the guard script and two new tests, are deployed but not committed. Commit them.

## R5-04 · New Deno tests aren't in CI · Medium

`recon_close_live_volume.test.ts` and `recon_toll_commit_money.test.ts` pass locally (8/8), but `ci.yml` lists Deno suites by name, and these aren't listed, so they can't fail a build. Add them in the same commit.

## R5-05 · First real end-to-end run still not done · High

Unchanged from R4-04. After R5-01: open run → upload toll CSV + Uber bundle → Sources Covered → **exactly one `toll_usage` event per imported toll, none for duplicates** → Tolls Finish → Fuel → Close preview.

---

## Deferred with Delivery (unchanged)

Delivery stays behind its readiness card. Owner questions Q2 (shared-cost allocation), Q3 (payout netting) and Q5 (toll statement closing balance) wait for it.

## Order

R5-03 + R5-04 (one commit) → R5-01 → R5-05 → R5-02 (security sweep; can run in parallel).
