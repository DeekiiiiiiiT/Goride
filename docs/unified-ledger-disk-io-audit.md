# Unified Ledger Disk IO — Audit

**Rev 17 · 2026-10-28 04:25 UTC · Project `csfllzzastacofsvcdsc` (Nano) · Fixed — only waiting items left**

## Status

Drain stopped, verified live: no new temp files from 04:01 to 04:23 UTC (`temp_files` flat at 423,223; was ~100 files/hour). `pgss-daily-reset` is scheduled at 04:08 UTC daily. Logging is off, no restart. Week calculator still paused.

## Open

| ID | Action | When |
|---|---|---|
| R23 | Done. `supabase/migrations/20261028040000_pgss_daily_reset.sql` and this doc are in source control. | 2026-10-28 |
| R12 | Turn the week calculator back on (Fleet admin → Week calculator). | **29 Oct after 04:07 UTC**, if `select pg_size_pretty(private.io_daily_temp_bytes());` is under 200 MB. |
| R13 | Stay on Nano, or move one size up. | **4 Nov**: stay on Nano if the 7-day average is under 200 MB/day and Disk IO is out of the red. |

## Watch — 2026-10-28

Checked live after the 04:07 UTC snapshot. Gate not met. Calculator stays paused.

| Check | Result | Pass |
|---|---|---|
| `private.io_daily_temp_bytes()` | 1,461 MB | No. Needs under 200 MB |
| `extensions.pg_stat_statements` | 36 | Yes |
| Latest `temp_files` | 423,223 (flat) | Yes |
| `pgss-daily-reset` | `8 4 * * *` | Yes |
| Week calculator | paused | Stays paused |

Next check: 29 Oct after 04:07 UTC. Do not resume on this number.

If the drain ever returns, check `select count(*) from extensions.pg_stat_statements;` first (should stay in the hundreds), then confirm the reset job still exists in `cron.job`.

## Rules

1. API roles take unitless values only (`8MB` → `8mb` breaks every request).
2. Every role setting, cron job and seed row lives in an active migration; check API logs within 60 s.
3. The database adds up; the app asks for answers. No edge function sums raw ledger rows.
4. Every ledger read passes org + date range to SQL. No `select *`, no OFFSET, no exact count unless it is on screen.
5. Every growing log or stats store has a purge or reset job.
