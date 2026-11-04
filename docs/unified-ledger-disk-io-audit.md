# Unified Ledger Disk IO — Audit

**Rev 21 · 2026-11-04 16:00 UTC · Project `csfllzzastacofsvcdsc` (Nano) · FIX LIVE — two dated checks left**

## Status

R14 (dashboard spilling ~20 MB per load) is fixed and verified live. `postgres` now runs with `work_mem = 32768`. The dashboard's function-list query, run through the same `postgres` login with no override, writes **0 bytes** to disk (was 20 MB). The week-calculator resume gate (409 above 200 MB) is in the deployed fleet-core (15:48 UTC).

## Left

| ID | Action | When |
|---|---|---|
| R14-3 | `select pg_size_pretty(private.io_daily_temp_bytes());` is under 200 MB. The first reading with no pre-fix spill in its window is after the **16:07 UTC snapshot on 5 Nov**. | 5 Nov after 16:07 UTC |
| R12 | Fleet admin → Week calculator → Resume (the API refuses until R14-3 passes). | After R14-3 |
| R13 | Stay on Nano if the 7-day average of daily temp stays under 200 MB. | 11 Nov after 16:07 UTC |

**If it returns:** the newest `private.io_snapshots.top_statements` row names the query, and its `-- source:` tag names the caller. Check that role's `work_mem`.

## Rules

1. Role settings are unitless (`8MB` breaks the API) and live in a migration whose file version matches prod; check the API within 60 s.
2. Every role that runs queries has `work_mem` set, including `postgres` (32768).
3. Ledger totals are computed in SQL; reads pass org + date range, with no `select *` and no OFFSET.
4. Every growing log or stats store has a purge or reset job.
