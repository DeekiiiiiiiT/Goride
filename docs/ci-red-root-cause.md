# GitHub Actions red: what's left

Rev 7. Closed 2026-11-01. Rev 6's last red item (Parts SQL migration order) is fixed in git; production migration history repaired.

## Status

| Check | Status |
|-------|--------|
| CI (main job) | Green on Rev 6 baseline |
| Dominion places | Green |
| Deploys + Test Supabase Functions | Green |
| Parts SQL checks | **Fix merged in working tree** — confirm green on next `main` run after push (local Docker unavailable here; same as Rev 6) |
| UTF-8 migration gate | Green (`scripts/assert-migrations-utf8.mjs`) |
| Future-dated migration guard | Added in `scripts/validate-migration-sql.mjs` (CI main job) |
| Full-stack replay on migration PRs | Re-enabled in `.github/workflows/verify-migrations-replay.yml` (ADR 0001) |

## What we did (Parts SQL / maintenance order)

**Problem (Rev 6):** `20261103120000_fleet_maintenance_logging.sql` sorted after Nov‑1 fix migrations, so fresh replay failed with `42P16` on `fleet.maintenance_due_v`.

**Done:**

1. Renamed base migration to [`supabase/migrations/20261101030856_fleet_maintenance_logging.sql`](../supabase/migrations/20261101030856_fleet_maintenance_logging.sql) (contents unchanged).
2. Updated prereq comment in `20261101030000_fleet_maintenance_nov1_prereq.sql` and [`docs/maintenance-overdue-digest-cron.md`](./maintenance-overdue-digest-cron.md).
3. **Production (`csfllzzastacofsvcdsc`):** pre-flight confirmed `20261101030856` applied and orphan `20261103120000` present; ran `supabase migration repair --status reverted 20261103120000` (history only). Verified: only `20261101030856` remains for `fleet_maintenance_logging`.
4. Docs: [`docs/supabase-migrations-maintenance-logging.md`](./supabase-migrations-maintenance-logging.md) policy + repair note.

**Replay order now:** `…30000` prereq → `…30708` → **`…30856` base** → `…32731` fixes → … → `20261105030000_fn_revoke_anon.sql`.

**Verify after push:** [Parts SQL checks](../.github/workflows/parts-sql-checks.yml) must pass `Apply migrations without seed data` and all five files under `supabase/tests/` (parts_rev2, guided_parts, vehicle_database_rebuild, places, price_engine). If anything fails, it was previously hidden behind the migration error — triage as a new issue.

## Rule for next time

Name new migrations with the current UTC time (`supabase migration new <name>` does this). A migration dated in the future sorts after everything written in the meantime, and this error comes back. CI now rejects future-dated filenames (see `scripts/validate-migration-sql.mjs` and [ADR 0001](./adr/0001-migration-reorder-decision.md)).

## Historical note (Rev 6 root cause)

<details>
<summary>Original failure log and analysis</summary>

```
Applying migration 20261103120000_fleet_maintenance_logging.sql...
ERROR: cannot drop columns from view (SQLSTATE 42P16)
CREATE OR REPLACE VIEW fleet.maintenance_due_v AS ...
```

Production had applied the base as `20261101030856` first; the misnamed `20261103120000` file only broke empty-database replay and CI.

</details>
