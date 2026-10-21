# Fuel Reconciliation — Finalize Path Audit

**Rev 3 · 2026-10-21** · Read-only check of the Rev 2 fixes against code, gates and production (`csfllzzastacofsvcdsc`). No code, config or data changed.
**Gates:** fuel-core 27/27 ✔ · `deno check` on `fuel_week_prepare.ts`, `fuel_week_compute.ts`, `fuel_period_routes.ts`, `fuel_distance.ts` ✔ · fleet `tsc` **506** ✖ (baseline 500; see N-2)

## Status

The architecture is now in place. The server computes the week with the same engine as the screen (`fuel_week_prepare.ts` → `generateDriverFleetReport`), saves it as a versioned snapshot, and finalize posts **only** that snapshot (`snapshots: []` + required `snapshotVersion`).

- The client gate is single-sourced on `/closable`.
- `/closable` is refetched on step change, dispositions and acks.
- The sweeper runs on `pg_cron` and returns 200; your `proof-kick-disabled` job proves it.
- Dedup pairs card rows on `jaaMatchedDriverEntryId`.
- The receipt shows statement and ledger ids.
- Distances are saved before compute, and nothing closes cycles during a preview.

**What's left:** the server is now the money authority, so its **input** completeness is what decides correctness. It is currently missing a fill, and finalize reports failure after a success. **Do not finalize an open week until N-1 and N-2 are fixed.**

---

## Open items

### N-1 · Critical · Server snapshot silently drops rows with a NULL `organization_id`

- **Evidence:** server snapshot for 2026-10-12 = **17,500** (cash 2,500). Real spend = **19,000** (cash 4,000), which is also what was posted on 10-20.
  - The missing row is `fleet.fuel_entries` `1b4ed81c…`, 10-17 Reimbursement 1,500 at odometer 192,145. Its `organization_id` is **NULL**.
  - Its payload has `orgId` and `org_id` but no `organizationId`. It came through the station-gate release approval path.
  - The org-scoped loader (`loadWeekFuelEntries` → `queryFleet({org})`) never sees it.
- **Cause:** `fleet_domains.ts:57` `orgOf()` reads only `organizationId` / `organization_id`.
- **Blast radius beyond fuel entries:** the same function stamps every fleet table. `fleet.transactions` has **887** NULL-org rows (881 fuel-like, all recoverable from `orgId`/`org_id` in the payload, 2026-09-05 → 10-20). The server gate's unapproved-fuel-reimbursement check reads transactions org-scoped, so a **pending** reimbursement written this way would not block a close. None is pending today.
  - Other non-zero counts: `odometer_readings` 29, `checkins` 27, `drivers` 2.
  - `stations`, `toll_plazas` and `platform_vendors` are global master data; expected.
- **Why it's Critical now:** an open week containing such a fill is computed, shown and **posted** short, and nothing compares it with anything.
- **Fix:**
  1. `orgOf` falls back to `orgId` → `org_id`.
  2. Backfill: `update fleet.<table> set organization_id = coalesce(payload_json->>'organizationId', payload_json->>'orgId', payload_json->>'org_id') where organization_id is null` for the org-owned tables.
  3. Make it unrepresentable: `organization_id NOT NULL` (or a check constraint) on `fuel_entries`, `transactions`, `odometer_readings`, `trips`.
  4. Defence in depth: a `/closable` blocker when any fill for the week's vehicles has a NULL org.
- **Acceptance:** recompute 2026-10-12 → snapshot 19,000 / driver 1,808.12; the SQL check below returns 0.

### N-2 · High · Finalize reports "failed" after a successful lock (`tsc` +6)

- **Where:** `pages/FuelManagement.tsx:2038-2045` still reads `weekResult`, which no longer exists now that the browser build is gone.
- **Effect:** after the job succeeds, a `ReferenceError` is thrown. The catch then shows **"Finalization failed: weekResult is not defined"** and returns `false`. This is the Rev 1 failure mode again: money posted, operator told it failed.
- **Fix:** derive the toast from the job result (`jobInterp` / job `progress_done`). Then bring `tsc` back to 500.
- **The other new type errors:**
  - `useFuelPeriods.ts:113`: `reviewLeakage` no longer passes the now-required `disposition`. Any caller of that mutation will fail; route it through the disposition form or delete it.
  - `FuelPeriodWizard.tsx:1434`: `vehicleSnaps` type mismatch into `FuelLeakageStep` (type-only).
  - `services/api.ts:4912`: `item` is `unknown`.
  - `ImportsPage.tsx` errors are outside fuel.

### N-3 · Medium · Snapshot reuse ignores inputs that change the money

- **Where:** `fuel_week_compute.ts` `hashFuelWeekInputs` hashes fills and trips only.
- **What it misses:** mileage adjustments, fuel scenarios/policy versions, Personal Allowance prefs and bonuses, earnings policies, odometer anchors, saved distances.
- **Effect:** after the operator logs a personal-km adjustment or changes a driver's scenario, `/compute` returns the **reused** old snapshot. `/finalize`'s `inputs_changed` check passes, and the old money is posted.
- **Fix:** include `updated_at`/id of every input `prepareFuelWeekReports` reads (or an engine-input digest returned by prepare).
- **Acceptance:** add an adjustment to an open week → `/compute` returns version +1 with different category costs.

### N-4 · Low · The browser still builds the whole week as a fallback

- `useFuelWeekReports` still fans out to trips, deadhead, PA and ledger on every open, although finalize can only use the server snapshot.
- Keep it only while the snapshot is loading, or delete it. That also removes `withSoftTimeout` / `degraded` plumbing that no longer gates money.

### N-5 · Not exercised yet

The new money path (server snapshot → job → ledger) has **never posted**. The only post-deploy job was a no-op on an already-locked week. After N-1 and N-2, finalize one open week (2026-10-05, 28,350) and run the checks below.

### Data (operator work, not code)

- **Open with fuel:** 2026-09-21 (snapshot 31,000) and 2026-09-28 (28,000) now have period rows but are **open**. 2026-10-05 (28,350) is open.
- **Unfinished reopen:** 2026-09-07 is still `reopened`.
- **Legacy:** 2026-08-31 is locked at −11,777.25 unexplained.

---

## Order of work

1. **N-2** (small): fix the toast; `tsc` back to 500.
2. **N-1:** `orgOf` fallback → backfill → NOT NULL → `/closable` blocker.
3. **N-3:** hash every engine input.
4. Finalize 2026-10-05 end-to-end (**N-5**), then work through the open weeks.
5. **N-4.**

## Checks

```sql
-- N-1: must be 0 for org-owned tables
select 'fuel_entries' t, count(*) from fleet.fuel_entries where organization_id is null
union all select 'transactions', count(*) from fleet.transactions where organization_id is null
union all select 'odometer_readings', count(*) from fleet.odometer_readings where organization_id is null;

-- N-1/N-5: server snapshot equals the canonical fills for the week
select period_id, version, money->>'totalSpend' total from public.fuel_week_snapshot
order by created_at desc limit 5;

-- N-5: the job posted from a server snapshot
select period_id, state, cursor->>'snapshotVersion' sv, progress_done, created_at
from public.fuel_period_job where kind='finalize' order by created_at desc limit 5;
```

## Do not change

- Fill-to-fill efficiency, the window-timing carve, misc → company, the Personal Allowance identity.
- `processJobRow`'s `alreadyLocked` short-circuit and C-8 compensation; the atomic job claim.
- The Review Queue.
