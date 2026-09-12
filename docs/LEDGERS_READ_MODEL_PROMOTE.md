# Ledgers read-model promote path (Block E)

Promote the unified `fleet.ledger_entries` read model behind `ledger_read_model` /
`LEDGER_READ_MODEL` — **do not flip the production default on** until dual-read
counts are green for a pilot org.

## Endpoints (already registered)

| Method | Path | Role |
|--------|------|------|
| POST | `/make-server-37f42386/ledger/search` | Page entries (keyset cursor) |
| POST | `/make-server-37f42386/ledger/stats` | Aggregates for the same filter body |
| POST | `/make-server-37f42386/ledger/export` | CSV export (same filters) |

One filter shape (`entryType`, `startDate`, `endDate`, …) across all three.
Smoke-check: routes remain wired via `registerLedgerEntriesRoutes` in the fleet server.

## Dual-read gate

```bash
LEDGER_COMPARE_ORG=<orgId> SUPABASE_URL=... LEDGER_COMPARE_JWT=<token> \
  npm run check:ledger-dual-read
# or: SUPABASE_ANON_KEY as bearer when no JWT
```

Compares `POST /trips/stats` → `totalTrips` vs `POST /ledger/stats` with
`entryType=trip` → `count` for the same date window. Exit `1` on large mismatch
(see `LEDGER_COMPARE_MAX_DELTA` / `LEDGER_COMPARE_MAX_PCT`).

**CI fail-closed:** without live env the script exits `1`. Local instruction-only:
`FORCE_LEDGER_DUAL_READ_DRY=1 npm run check:ledger-dual-read`.

## Migrations (required before promote)

Apply in order (do not skip):

1. `20260911140000_fleet_ledger_entries_read_model.sql`
2. `20260911190000_fleet_ledger_entries_invoker_and_net_backfill.sql`
3. `20260911200000_fleet_ledger_entries_period_key.sql`
4. `20260911210000_fleet_trips_distance_duration.sql` (typed distance/duration for sort)

Confirm with `list_migrations` / Supabase dashboard before enabling the flag for a pilot.

## Promote order

1. **Trip** — enable flag for one pilot org; run dual-read compare on trip counts;
   keep Trip Ledger desk on existing `/trips/*` until green.
2. **Fuel** — same pattern vs fuel desk stats/search once trip parity holds.
3. **Toll** — same for toll.
4. **Default on** — only after trip → fuel → toll dual-read is stable for pilot(s),
   turn the feature flag default / org rollout **on**. Still optional env override.
5. **Retire desk duplicate endpoints last** — after UI tabs read exclusively from
   `/ledger/search|stats|export`, decommission overlapping trip/fuel/toll ledger
   search/stats/export duplicates. Do this **last**, not at flag-on.

## What stays

- **Trip Logs** (`TripLogsPage` / ops trip log UI) stays an **ops** surface — not
  replaced by the finance Ledgers desk or the unified read model.
- Client preview toggle `localStorage.roam_ledger_read_model=1` for local UX;
  server still requires the feature flag or `LEDGER_READ_MODEL=1`.

## Explicit non-goals for this phase

- Do **not** set `LEDGER_READ_MODEL=1` as the production edge default.
- Do **not** leave `FEATURE_FLAGS.LEDGER_READ_MODEL` default `enabled: true`.
- Do **not** delete desk `/trips|fuel|toll` endpoints until step 5.

## R-05 period_key (Gate 2) — closed

Org weeks are **Monday-start**. `period_key` stays `to_char(date_trunc('week', …), 'IYYY-"W"IW')` — no org-anchor migration. When joining settlement / UI period ids (Monday `yyyy-MM-dd`) to read-model keys (`2026-W37`), convert Monday ↔ ISO week; do not string-compare the two shapes. Details: `docs/LEDGERS_STRICT_ORG_FILTER.md` § R-05.
