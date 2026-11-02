# GitHub Actions red: what's left

Rev 15. Checked 2026-11-02 against `main` @ `faf0fcaf`.

**Red:** CI and Parts SQL.
**Green:** Vercel, Deploy Edge Function, Test Supabase Functions, recon-worker.

The 4 Rev 14 guards worked. The replay now gets past `fuel_refineries` and stops 2 files later. Two more files further down will also fail. CI separately stops at a new check whose command line is wrong.

## 1. CI: the version-list check calls the CLI with a flag that doesn't exist

```
Unrecognized flag: --project-ref in command supabase migration list
```

`scripts/assert-migration-versions-parity.mjs` stops CI before any other check runs. The two lists already agree: I compared them directly, and production and the repo both have 176 versions, all identical.

**Fix:** in `linkedVersions()`, replace the `execFileSync('npx', ['supabase@2.99.0', 'migration', 'list', …])` call and the row loop below it with a direct read of production's history:

```js
async function linkedVersions() {
  // keep the existing token / SKIP_LINKED_MIGRATION_PARITY lines above this
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select version from supabase_migrations.schema_migrations' }),
  });
  if (!res.ok) { console.error('Production query failed:', res.status, await res.text()); process.exit(1); }
  const set = new Set();
  for (const row of await res.json()) {
    const v = String(row.version);
    if (/^\d{14}$/.test(v) && !MIGRATION_SYNC_SKIP_VERSIONS.has(v)) set.add(v);
  }
  return set;
}
```

Then change the call site to `const linked = await linkedVersions();`. Top-level `await` works in `.mjs`. This also fixes a hidden bug in the old version: it counted local-only rows as "in production", so the check could never fail.

## 2. Three more migrations assume production data

The Parts SQL replay now stops here:

```
Applying migration 20261029214649_places_fuel_overview.sql...
ERROR: T2 quality {... "failing": 0 ...} vs {"score": null, "failing": null}
```

| File | Why it fails on an empty DB | Fix |
|---|---|---|
| `20261029214649_places_fuel_overview.sql` (~line 268) | There is no `stations` row in `fleet.dataset_quality`, so the comparison side is null | Change the T2 condition to `if found and ( …existing two conditions… ) then` |
| `20261101022741_fleet_find_parts_f5_brake_components.sql` | Inserts components under Brakes `b1000000-…-000000000004`, which doesn't exist on an empty DB, so the `parent_id` foreign key fails | Turn `insert … values (…)` into `insert … select * from (values (…), (…)) v(id, code, name, plain_name, parent_id, icon_key, position_aware, sort_order) where exists (select 1 from public.maintenance_service_categories where id = 'b1000000-0000-4000-8000-000000000004')`. Keep the `on conflict` clause and both `update public.part_master` statements as they are |
| `20261101024022_fleet_find_parts_f5_merge_brake_pads.sql` | Raises "canonical Brake pads not found" before checking whether there is anything to merge | Move the existing `IF NOT EXISTS (… WHERE id = v_duplicate) THEN RAISE NOTICE …; RETURN; END IF;` block up to be the first statement after `BEGIN` |

None of this changes production, because all 3 already ran there.

Add these 3 versions to `MIGRATION_SYNC_SKIP_VERSIONS` in `scripts/migration-md5-normalize.mjs`, next to the 4 from last round.

I checked every self-test and every fixed-id insert from `20261029214649` onwards. The rest either look rows up first or compare a table with itself, so these 3 are the only ones left that I can find by reading the files.

## Verify

After one push, CI and Parts SQL should get through "Start the database". Parts SQL then runs the five `supabase/tests/` files, which have never run. Don't mark this doc closed until GitHub shows both green.

## Rule for next time

- A data repair or self-test in a migration must do nothing when its rows aren't there: check first, then act.
- Copy production bodies exactly, and keep every guarded version in the skip list.
