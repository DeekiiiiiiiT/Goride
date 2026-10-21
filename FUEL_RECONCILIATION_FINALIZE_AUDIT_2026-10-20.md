# Fuel Reconciliation — Finalize Path Audit

**Rev 4 · 2026-10-21** · Read-only check of the Rev 3 fixes against code, gates and production (`csfllzzastacofsvcdsc`). No code, config or data changed.
**Gates:** fuel-core 27/27 ✔ · `deno check` (compute, prepare, routes, fleet_domains, closable gate) ✔ · new Deno tests 4/4 ✔ · fleet `tsc` **497** ✔ (below the 500 baseline)

## Status

All Rev 3 items are fixed in code, and N-1 is fixed in production:

- `orgOf` falls back to `orgId` / `org_id`.
- The backfill is applied: 0 NULL-company rows in fuel entries, transactions and trips, and those three columns are NOT NULL.
- The "failed after success" toast now comes from the job result.
- The snapshot hash covers every engine input.
- The wizard no longer builds the week in the browser.

What's left is small, but item R4-1 will bite on the very next open week.

---

## Open items

### R4-1 · Medium · First finalize of a new week fails once with "This week changed"

- **Where:** `fuel_week_compute.ts` `computeFuelWeekSnapshot`. `inputsHash` is computed **before** `prepareFuelWeekReports`, and prepare is what writes `vehicle_week_distance`. The hash includes those distance rows.
- **Effect:** for a week with no saved distances, snapshot v1 is stored with a hash that has no distance part. At finalize, the live hash now includes the rows prepare just wrote, so `/finalize` returns 409 `inputs_changed`. The operator sees "This week changed. Refresh, then lock again"; the second attempt works. The same happens whenever a recompute changes a vehicle's distance.
- **Evidence:** every week computed earlier today got a v1 and then an identical v2 a few minutes later. **2026-10-05**, the next week to close, has **no** distance rows, so it will hit this.
- **Fix:** recompute the hash **after** prepare and store that one. Alternatively, hash the distance *inputs* (trips, fills) instead of the saved distance rows.
- **Acceptance:** a week with no `vehicle_week_distance` rows → compute → finalize succeeds on the first try. Add that case to `fuel_week_compute_hash.test.ts`.

### R4-2 · Low · Migration history doesn't match the repo

- **Backfill:** the repo has `20261021130000_backfill_fleet_organization_id.sql`, but production recorded it as `20261021171356`.
- **Sweeper:** `20261021145921 fuel_period_job_sweep_cron` exists in production and has **no file** in the repo.
- **Risk:** a fresh environment won't get the sweeper, and `db push` will try to re-run the backfill. The backfill is idempotent, but the history drift is the same class as earlier migration-version issues.
- **Fix:** rename the local file to the production version and add the cron migration file.

### R4-3 · Low · Leftovers

- `null_org_fill` blocker: `fuel_entries.organization_id` is now NOT NULL, so this blocker can never fire. Keep it as a guard or delete it, but don't count it as a control.
- The old browser builder (`buildFuelWeekReportsForFinalize`, `useFuelWeekReports`, `withSoftTimeout` / `degraded`) is still used by bulk finalize, bulk reset, the dashboard and `ReconciliationTable`. Move those to the server snapshot or `/compute`, then delete it.
- `fleet.odometer_readings`: 3 NULL-company rows (check-ins naming a plate with no vehicle row). Documented in the migration; fix or delete those rows.

### R4-4 · Not exercised yet

No week has been finalized through the new path. The only post-deploy job was a test on an already-locked week. Once R4-1 is fixed, finalize **2026-10-05** (28,350) and run the checks below.

### Data (operator work)

- **Open:** 2026-09-21, 2026-09-28 and 2026-10-05.
- **Unfinished reopen:** 2026-09-07 is still `reopened`.
- **Legacy:** 2026-08-31 is locked at −11,777.25 unexplained.

---

## Checks

```sql
-- R4-4: the job posted from a server snapshot, and the ledger matches it
select period_id, state, cursor->>'snapshotVersion' sv, progress_done, failures, created_at
from public.fuel_period_job where kind='finalize' order by created_at desc limit 3;

select s.period_id, s.version, s.money->>'totalSpend' snapshot_total, p.total_spend, p.driver_share
from public.fuel_week_snapshot s join public.fuel_reconciliation_period p on p.id = s.period_id
where s.period_id like '%2026-10-05' order by s.version desc limit 1;

-- R4-1: more than one version with an identical total = hash churn
select period_id, count(*) versions, count(distinct money->>'totalSpend') distinct_totals
from public.fuel_week_snapshot group by 1 having count(*) > 1;
```

## Do not change

- Fill-to-fill efficiency, the window-timing carve, misc → company, the Personal Allowance identity.
- `processJobRow`'s `alreadyLocked` short-circuit, C-8 compensation, and the atomic job claim.
- The Review Queue.
