# GitHub Actions red: what's left

Rev 3. 2026-10-30. Cleared on `main` @ `e23d5f63`. All four workflows are green.

| Workflow | Result |
|---|---|
| CI | Green on `e23d5f63` |
| Deploy Supabase Edge Function | Green on `da6c15be`, then a full deploy of every function |
| Parts SQL checks | Green on `da6c15be` |
| Dominion places checks | Green on `da6c15be` |

Later commits did not change migrations, the Dominion test, or edge functions, so those three workflows were not asked to run again.

Follow-ons, not blockers: the admin type check is still under its limit but not at zero. The fuel-station Deno step retries once if a download does not match the lock. `Deno check edge functions` is allowed to fail and still prints an error. Editing the migrations that already ran does not change the live database.

Rev 2. Checked 2026-10-30 against `main` @ `95c6e01f`. Rev 1 (Plug e2e test, ECR image limit) is fixed and verified: the Plug test passes, and the database now starts in CI.

| Workflow | Fails at | Finding |
|---|---|---|
| CI | `Check public function revoke from anon` | 1 |
| Deploy Supabase Edge Function | `Prebundle fleet edge functions` | 2 |
| Parts SQL checks | `Start the database` (a migration's self-test) | 3 |
| Dominion places checks | `Places register` | 4 |

GitHub skips every step after a failed step. Once one of these is fixed, a later step in the same workflow can still fail; it simply hasn't run yet.

---

## 1. CI: new public functions have no anon revoke

`scripts/assert-public-fn-revoke-anon.mjs` requires a matching `REVOKE … FROM PUBLIC, anon, authenticated` after every `public.*` function created on or after 20261020. Five functions are missing one:

| Function | Created in |
|---|---|
| `admin_body_families()` | `20261030223000_parts_rev3_audit.sql` (re-created; the revoke is in the older `20261030193000`) |
| `admin_save_body_family(jsonb)` | `20261030223000_parts_rev3_audit.sql` (same) |
| `reject_mixed_maker_platform()` | `20261030193000_part_listings.sql` |
| `sync_part_listing_rule()` | `20261030193000_part_listings.sql` |
| `roomy_seed_vehicle(text, text, text, uuid, uuid, integer, integer)` | `20261030210000_roomy_sister_catalog.sql` |

Production is already safe (checked live): both `admin_*` functions deny anon and authenticated, the two trigger functions aren't SECURITY DEFINER, and `roomy_seed_vehicle` is dropped. So this is a missing line in the files, not a live hole.

**Fix:** add the revoke lines to the files that create the functions.

- End of `20261030223000_parts_rev3_audit.sql`:
  ```sql
  REVOKE ALL ON FUNCTION public.admin_body_families() FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.admin_save_body_family(jsonb) FROM PUBLIC, anon, authenticated;
  ```
- In `20261030193000_part_listings.sql`, directly after each function body (before its `CREATE TRIGGER`):
  ```sql
  REVOKE ALL ON FUNCTION public.sync_part_listing_rule() FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.reject_mixed_maker_platform() FROM PUBLIC, anon, authenticated;
  ```
- In `20261030210000_roomy_sister_catalog.sql`, directly after the `roomy_seed_vehicle` function body (before line 132, where it is first called):
  ```sql
  REVOKE ALL ON FUNCTION public.roomy_seed_vehicle(text, text, text, uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
  ```

These three migrations already ran in production, so editing them changes nothing there. They only affect fresh databases and the guard.

**Verify:** `node scripts/assert-public-fn-revoke-anon.mjs` prints `OK`.

---

## 2. Deploy Supabase Edge Function: fleet-core route list is stale

```
FAIL fleet-core: routes.generated.json is stale (committed 685, actual 688). Re-run without --check and commit.
```

Three fleet-core routes were added without regenerating the route list. Because this step fails, **the deploy step is skipped and no edge function has deployed since this started.** Reproduced locally on a clean tree.

**Fix:** regenerate and commit the generated files.

```
node scripts/edge-route-manifest.mjs --all
node scripts/generate-extraction-status.mjs
```

Commit whatever both commands change (the `routes.generated.json` under `supabase/functions/fleet-core/`, and `supabase/functions/_shared/extractionStatus.generated.ts` if it changed).

**Verify:** `node scripts/edge-route-manifest.mjs --all --check` prints `ok` for all six, and `git diff --exit-code` is clean after `generate-extraction-status.mjs`.

---

## 3. Parts SQL checks: `fuel_refineries` self-test expects production data

```
ERROR: T3 e10_87 <NULL> (SQLSTATE P0001)
```

`supabase/migrations/20261029210000_fuel_refineries.sql` ends with a self-test block. T3 (lines 973–978) asserts the exact Petrojam prices for 2026-10-22 (201.8128 / 271.5973). CI runs on an empty database with no Petrojam history, so the lookup returns NULL and the migration aborts. It passed in production because production has that row. (T1, T2, T4, T7 all pass on an empty database.)

**Fix:** run the two dated T3 checks only when that day's data exists. Keep the pre-2004 check unconditional. Replace lines 973–978 with:

```sql
  if exists (select 1 from fuel.petrojam_prices_legacy where price_date = '2026-10-22') then
    if places.wholesale_on('e10_87', '2026-10-22') is distinct from 201.8128 then
      raise exception 'T3 e10_87 %', places.wholesale_on('e10_87', '2026-10-22');
    end if;
    if places.wholesale_on('ulsd', '2026-10-22') is distinct from 271.5973 then
      raise exception 'T3 ulsd %', places.wholesale_on('ulsd', '2026-10-22');
    end if;
  end if;
```

This migration already ran in production, so the edit only affects fresh databases.

**Verify:** the `Parts SQL checks` run gets past `Start the database`. Every later migration and the four check files then run for the first time on this commit. If another migration has an assert that depends on production data, fix it the same way: guard on the data existing.

---

## 4. Dominion places checks: two selects offer "Gas station"

```
e2e/dominion-places.spec.ts:97 › register blocks verify until the checklist is clear
strict mode violation: locator('select').filter({ has: getByRole('option', { name: 'Gas station' }) }) resolved to 2 elements:
  1) <select class="sr-only"> (the list's Type filter)
  2) <select …> labelled "Place type *" (the Add-a-place form)
```

The register page now has a Type filter that also lists "Gas station", so the test's locator matches two selects.

**Fix:** target the form's select by its label. In `e2e/dominion-places.spec.ts` line 100, change:

```ts
  const typeSelect = page.locator('select').filter({ has: page.getByRole('option', { name: 'Gas station' }) });
```

to:

```ts
  const typeSelect = page.getByRole('combobox', { name: /^Place type/ });
```

**Verify:** `npx playwright test -c playwright.dominion.config.ts` reports 0 failed.

---

## Order

1. All four fixes in one commit; they touch separate files.
2. Push to `main`.
3. Check all four workflows. Anything still red is a step that was hidden behind these failures: read the new error and fix it on its own.
