# Unified Ledger Disk IO — Audit

**Rev 13 · 2026-10-28 03:13 UTC · Project `csfllzzastacofsvcdsc` (Nano) · Only open items listed**

## Status

R20 is live. `anon.work_mem = 8192` (unitless). An anonymous read of `driver_play_store_releases` returned 200 within 60 seconds. No `8mb` / API errors in that minute. Authenticator stays at 65536. `emergency_off` stays `true`.

R18 logging is on. `current_setting('log_temp_files')` = `0`. Postmaster start is still 21 Oct 05:28 (no restart). The platform API rejects a bare `0` (`expected string, received number`, and `0B` is below its size floor). `log_temp_files=1B` is what it accepts, and Postgres stores that as `0`. Evidence window started **2026-10-28 03:12 UTC**. Do not name a statement before **09:12 UTC**.

The drain is **not** named yet. Do not resume the week calculator.

## Open

| ID | Finding | Fix |
|---|---|---|
| R18 | Logging now records every temp file. The source is still unnamed. | At or after 09:12 UTC, run the query below, add up sizes per statement, and record the top statement here. Then `postgres-config delete --config log_temp_files --no-restart`. |
| R21 | Pause copy is in the Fleet app. If the status check fails, the week screen now says paused instead of spinning forever. Migrations for R19, R18 work_mem, and R20 are in the repo. | Release the Fleet app and `fleet-core` together with this commit. |
| R12 | Week calculator stopped. Last hours before the pause: 332 MB, 320 MB, 356 MB. | Resume only after R18 names the source and one full day reads under 200 MB. |
| R13 | Nano vs one size up. | Decide **4 Nov** from 7 days of snapshots, after R18 is fixed. |

**R18 log query** (Supabase dashboard → Logs → Logs Explorer):

```sql
select timestamp, event_message
from postgres_logs
where event_message like '%temporary file%' or event_message like 'STATEMENT:%'
order by timestamp desc
limit 500
```

Each `temporary file: … size N` line is followed by the `STATEMENT:` that wrote it. Add up sizes per statement; the largest total is the source. Once it is fixed, turn logging off with `postgres-config delete --config log_temp_files --no-restart`.

## Rules

1. API roles take unitless values only (`8MB` → `8mb` breaks every request).
2. Every role setting, cron job and seed row lives in an active migration; check API logs within 60 s.
3. The database adds up; the app asks for answers. No edge function sums raw ledger rows.
4. Every ledger read passes org + date range to SQL. No `select *`, no OFFSET, no exact count unless it is on screen.
5. A capped read that hits its cap is an error, never a partial answer.
6. Never drop a function, schema or nullable column until every deployed bundle has the matching change.
7. A cause is named only from temp-file lines, not from timeouts or guesses.
8. Raising `work_mem` on a login role raises it for every role that doesn't set its own.
