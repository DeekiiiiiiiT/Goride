# Supabase Disk IO Plan — GoRide (`csfllzzastacofsvcdsc`)

**Rev 9 · 2026-10-21 · Verified against prod at 14:31 UTC. Only open items are listed.**

All fixes are live and verified. Temp writes are **269 MB since the 22:48 reset** (≈175 MB/day; target < 200 MB), and there have been no 5xx errors since 06:00.

## Open

1. **Commit this round.** It's deployed (fleet-core) but not committed:
   - `supabase/migrations/20261021142520_db_io_api_role_statement_timeout.sql` (untracked)
   - the `fuelQueue` changes in `register_residual_monolith_routes.tsx`, `apps/fleet/src/services/api.ts`, `useFuelReviewQueueCounts.ts`, and `FuelManagement.tsx`
   - The fleet-core bundle also packed the other modified files in the tree (`fuel_controller.tsx`, `rbac_middleware.ts`, …), so commit those too, or confirm they were meant to ship.

2. **Prove the API usage logger writes.** The latest row is still 2026-10-20 20:02 UTC, because no map or AI call has happened since the deploy. After the next one, run:
   ```sql
   select max(occurred_at) from private.api_usage_events;
   ```
   It must be newer than 2026-10-21 05:30. If it isn't, check the function logs for `log_api_usage` errors.

3. **Tonight, after 22:50 UTC:** record the 24 h number in the log below.
   ```sql
   select pg_size_pretty(temp_bytes - 1477770294817) from pg_stat_database where datname = current_database();
   select calls, temp_blks_written, round(mean_exec_time::numeric,1) mean_ms, left(query,120)
   from extensions.pg_stat_statements where temp_blks_written > 0
   order by temp_blks_written desc limit 10;
   ```
   Ignore rows whose `calls` have stopped growing; those are the old pre-fix queries.

4. **2026-10-28:**
   - Read the Disk IO chart. Under half the budget: keep the current compute size. Near the limit: move up one size.
   - `drop table private.io_baseline_20261020;`
   - Compare `idx_scan` on `ledger.idx_ledger_entries_debit`/`_credit` vs `_debit_eff`/`_credit_eff`, then drop the unused pair in its own quiet migration.

5. **A fresh Supabase branch can't be rebuilt from your migrations.** Replaying them failed during the timeout test. That means branches (and any rebuild from scratch) are broken until the failing migration is fixed. It's not a disk issue, but it blocks rule 2.

## Rules

1. API roles take unitless values only (`8MB` becomes `8mb`, which breaks every request).
2. Every role or setting change goes in a migration. Test on a branch, then check the API logs within 60 s.
3. Run heavy migrations one at a time, in a quiet hour, and load a real screen after each.
4. List screens: no `select *` on big jsonb tables, no OFFSET loops, and `count: "exact"` only when the total is shown.
5. Every new log table or KV prefix gets a purge job on day one.

## Measurements log

| When (UTC) | Temp since 22:48 reset | Notes |
|---|---|---|
| 10-20 22:48 | 0 | Reset. Counter 1,477,770,294,817 |
| 10-21 14:31 | 269 MB | All fixes live. `service_role` 30 s / `authenticator` 120 s timeouts live, no errors |
| 10-21 ≥ 22:50 | | Official 24 h number |
| 10-28 | | Compute decision, baseline drop, index check |
