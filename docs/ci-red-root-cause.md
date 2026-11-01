# GitHub Actions red: what's left

Rev 14. Checked 2026-11-01 20:20 UTC against `main` @ `9c1126b8`.

**Red:** CI ("Start Supabase and bootstrap inventory schema") and Parts SQL ("Start the database").
**Green:** Vercel.

The production sync is right, and the repo now holds real bodies instead of `SELECT 1` stubs. What's left is 4 files where production's copy only works on production's own data. Rev 12's "overwrite every differing file" also removed a replay guard added in an earlier round (`fuel_refineries` T3). That's my mistake, and it's fixed below.

## 1. Four migrations assume production data, which an empty database doesn't have

```
Applying migration 20261029210000_fuel_refineries.sql...
ERROR: T3 e10_87 <NULL> (SQLSTATE P0001)
```

I checked every migration from `20261029140000` onwards for (a) self-tests that compare against fixed production values and (b) data repairs that target hard-coded production rows. The other self-tests compare a table with itself, so they pass on an empty database. The other repairs look rows up first and do nothing when those rows are missing. Only these 4 fail:

| File | Why it fails on an empty DB | Fix |
|---|---|---|
| `20261029210000_fuel_refineries.sql` (~line 934) | T3 expects production's 22 Oct Petrojam prices | Wrap the two T3 price checks (`e10_87`, `ulsd`) in `if exists (select 1 from fuel.petrojam_prices_legacy where price_date = '2026-10-22') then … end if;`. Leave the `2000-01-01` check outside the wrapper |
| `20261101181057_fleet_inventory_r10_03a_phone_balance_seed.sql` | Inserts a balance for item `5129bef3-…` / location `b62780a6-…`, so the foreign key fails | Add `AND EXISTS (SELECT 1 FROM fleet.inv_item WHERE id = '5129bef3-8bab-4793-b84d-fa62f9557c5e') AND EXISTS (SELECT 1 FROM fleet.inv_location WHERE id = 'b62780a6-c9b8-4de3-8bff-3ce1e55faea3')` to its `WHERE` |
| `20261101181109_fleet_inventory_r10_03b_phone_adjust.sql` | Calls `fleet.inv_adjust` on that same missing item | Put both statements inside `DO $$ BEGIN IF EXISTS (SELECT 1 FROM fleet.inv_item WHERE id = '5129bef3-8bab-4793-b84d-fa62f9557c5e') THEN PERFORM fleet.inv_adjust(…same args…); UPDATE …same…; END IF; END $$;` |
| `20261101181112_fleet_inventory_r10_03c_mount_ledger.sql` | Calls `fleet.inv_opening_balance` for mount `ca661367-…`, which doesn't exist | Make the first line after `BEGIN`: `IF NOT EXISTS (SELECT 1 FROM fleet.inv_item WHERE id = v_mount) THEN RETURN; END IF;` |

None of this changes production. All 4 already ran there, and in production each guard is true.

Add these 4 versions to the skip list in `scripts/compare-migration-md5-to-prod.mjs`, with the reason "replay guard, differs from prod on purpose". Otherwise the compare reports them as drift.

## Verify

After one push, CI and Parts SQL get through "Start the database". Parts SQL then has to pass the five `supabase/tests/` files, which have never run yet. Don't mark this doc closed until GitHub shows both green.

Housekeeping: the untracked `scripts/.fp-replay*.json` and `scripts/mismatch-versions.json` are scratch output. Delete them, or add them to `.gitignore`.

## Rule for next time

- Copy a production migration body exactly, then add a guard only where it reads production-only rows or values.
- When syncing from production, keep the skip list of guarded versions so a sync never removes a guard again.
