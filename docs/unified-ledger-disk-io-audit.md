# Unified Ledger Disk IO — Audit

**Rev 18 · 2026-10-28 12:45 UTC · Project `csfllzzastacofsvcdsc` (Nano) · Fixed — two dated checks left**

## Status

Fixed and committed (`81a3ae5d`). Verified live at 12:44 UTC: **0 bytes** of temp written since 04:07 UTC (8.5 hours), `temp_files` flat at 423,223, `pg_stat_statements` at 237 entries, `pgss-daily-reset` scheduled, no restart. The `io_daily_temp_bytes()` reading still includes the old drain until its 24 h window rolls past 04:07 today.

## Left

| ID | Action | When |
|---|---|---|
| R12 | Turn the week calculator back on (Fleet admin → Week calculator). | **29 Oct after 04:07 UTC**, if `select pg_size_pretty(private.io_daily_temp_bytes());` is under 200 MB. |
| R13 | Stay on Nano. Move one size up only if the check fails. | **4 Nov**: 7-day average under 200 MB/day and Disk IO chart out of the red. |

If the drain ever returns: `select count(*) from extensions.pg_stat_statements;` should stay in the hundreds, and `pgss-daily-reset` must still be in `cron.job`.

## Rules

1. API roles take unitless values only (`8MB` → `8mb` breaks every request).
2. Every role setting, cron job and seed row lives in an active migration; check API logs within 60 s.
3. The database adds up; the app asks for answers. No edge function sums raw ledger rows.
4. Every ledger read passes org + date range to SQL. No `select *`, no OFFSET, no exact count unless it is on screen.
5. Every growing log or stats store has a purge or reset job.
