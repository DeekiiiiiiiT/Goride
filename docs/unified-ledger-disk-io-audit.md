# Unified Ledger Disk IO — Audit

**Rev 9 · 2026-10-28 02:25 UTC · Project `csfllzzastacofsvcdsc` (Nano) · Only open items listed**

## Status

Verified live: R14 done (`9473 / 9473` rows, 0 null org, `organization_id` NOT NULL, signed sums equal `1,992,697,888` minor on both sides), R15 done (folder gone), R16 done (`fleet-claims` rebuilt/deployed; bundle has 9 `organization_id required for` guards; smoke-edge-fn passed), R17 done (ledger org commit `d7177319`, Uber timeline commit `b72e89ef`; `fleet-ops` redeployed with activity routes), R11b done (schema-only baseline `20260320000000_baseline_prod_schema.sql`; 689 older files in `supabase/migrations_archive/`; prod history repaired to baseline only; preview branch `r11b-baseline-replay` replayed clean — migration `20260320000000` only, `ledger.entries.organization_id` NOT NULL — then deleted). No old fetch-all calls since the cutover. No ledger errors in Postgres logs since 01:00 UTC. `emergency_off` is still `true`.

## Open

| ID | Finding | Fix |
|---|---|---|
| R12 | The "423 MB/day" reading is not a real day. `private.io_daily_temp_bytes()` falls back to the first snapshot (27 Oct 23:54) when none is 24 h old, so it measures the migration night: 443 MB from 23:54 to 01:07, while tracked statements grew only ~20 MB after 01:07. `emergency_off` is still `true`. | Read it again at **29 Oct after 02:07 UTC** (the first full 24 h after the last migration at 01:40). Under 200 MB → turn the week calculator back on from Fleet admin. |
| R13 | Nano vs one size up. | Decide **4 Nov** from 7 days of `private.io_snapshots`: average under 200 MB/day and Disk IO chart out of the red → stay on Nano. |

## Rules

1. API roles take unitless values only (`8MB` → `8mb` breaks every request).
2. Every role/setting change goes in a migration; test on a branch; check API logs within 60 s.
3. The database adds up; the app asks for answers. No edge function sums raw ledger rows.
4. Every ledger read passes org + date range to SQL. No `select *`, no OFFSET, no exact count unless it is on screen.
5. A capped read that hits its cap is an error, never a partial answer.
6. Never drop a function, schema or nullable column until **every** deployed bundle has the matching change (check each bundle and its deploy time, not just source).
7. Before moving a filter from JS into SQL, count the rows the JS filter let through on purpose.
8. Ledger read changes ship with an old-vs-new parity test on real rows, to the cent.
9. Rides/Rush minute crons stay off on Nano while those apps are idle.
