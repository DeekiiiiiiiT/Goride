# Supabase Disk IO Plan — GoRide (`csfllzzastacofsvcdsc`)

**Rev 7 · 2026-10-21 · Closeout in progress. Only items still open are listed.**

## Closed this pass

- Migration history for the 21 Oct files now matches the repo. The eight production-only version numbers were marked reverted (history only). The five repo files, including the fuel-week file whose objects were already live, are marked applied. A dry-run still stops on older remote versions from before this audit. Do not bulk-revert that older list. Doing so would make the next push re-run months of SQL.
- Driver ledger pages sort the narrow columns, then load the full row only for the page. On the busiest driver the first 20 rows, the page at offset 5000, and the total (7,414) match the old function. `explain (analyze, buffers)` for a 1,000-row page shows a memory sort (168 kB) and no temp written. No schema-cache errors after the change.
- Expenses rebuild and toll matching no longer download `payload_json` for a driver's trips and transactions. They ask for the typed columns plus the few JSON fields those screens show (toll amount, times, resolution, and the toll link). Deployed with fleet-core. Health check passed.
- Week close sync's one 500 was real: `permission denied for table week_seal_log`. The view runs as the caller, and the service role could not read the table underneath. Select, insert, and update are now granted. A read as that role succeeds.
- The live API no longer loads the unused `accounting` schema. `recon` and `rush_config` stay. Timeouts were not changed. The schema cache reloaded in 36 ms. No schema-cache failure and no 500s in the following minute. A public catalog read returned 200. Accounting requests are rejected. Fleet sign-in, Rush, the partner app, the courier app, freight, haulage, and rides all returned 200.

## Still open

### Usage logger

`private.api_usage_events` latest row is still **2026-10-20 20:02 UTC**. No map or AI call has happened since the deploy, and there is no `log_api_usage` error after the function was created. Check again after the next real map or AI call. The time must be newer than 2026-10-21 05:30 UTC.

### Figma Make

No Figma traffic in the last day of logs, and the integrations list was not available from here. Do not disconnect anything until the Supabase dashboard shows Figma Make connected and unused.

### Measurements and later cleanups

Do not run these early.

- After **22:50 UTC on 2026-10-21**, run the two queries below and fill the log. Target: under 200 MB of temp disk per day.

```sql
select pg_size_pretty(temp_bytes - 1477770294817) from pg_stat_database where datname = current_database();
select calls, temp_blks_written, round(mean_exec_time::numeric,1) mean_ms, left(query,120)
from extensions.pg_stat_statements where temp_blks_written > 0
order by temp_blks_written desc limit 10;
```

- **2026-10-28:** read the Disk IO chart. Under half the budget: stay on this compute size. Still near the limit: move up one size. Then `drop table private.io_baseline_20261020;`
- One week after the ledger rewrite (about **2026-10-28**): the planner still used `idx_ledger_entries_debit` / `_credit` on the new query. Compare `idx_scan` and drop whichever pair is unused, in its own quiet migration.

## Rules (from two outages)

1. Never set unit-suffixed values on API roles. PostgREST lowercases them (`8MB` → `8mb`), and Postgres rejects that, so every request fails.
2. Run heavy migrations one at a time, in a quiet hour, and load a real screen after each one.
3. After any database setting or schema change, check the API logs for 4xx/5xx within 60 seconds.
4. List screens: no `select *` on tables with big jsonb columns, no OFFSET loops, and `count: "exact"` only when the total is shown.
5. Every new log-style table or KV prefix gets a purge job on day one.

## Measurements log

| When (UTC) | Temp since 22:48 reset | Notes |
|---|---|---|
| 10-20 22:48 | 0 | Reset. Counter 1,477,770,294,817 |
| 10-21 02:00 | 191 MB | Before the app switch |
| 10-21 06:10 | 211 MB | After the deploy, which went live ~05:30. Old ledger/trips queries gone |
| 10-21 06:34 | | Ledger rewrite live. 1,000-row page: memory sort, no temp. Rows unchanged |
| 10-21 06:53 | | API schema list live. Accounting removed. Cache reload 36 ms. No 500s |
| 10-21 ≥ 22:50 | | Official 24 h number |
| 10-28 | | Compute decision, baseline drop, unused-index check |
