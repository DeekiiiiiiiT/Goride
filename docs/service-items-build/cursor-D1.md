# Give Cursor this — Service items, Round D1 (Data: Dominion catalogue)

You are building **Round D1 only** of `docs/service-items-architecture-audit.md` (Rev 8). Read sections **3 (intro notes), 3a, 3b, 3c and 3f** of that file first; they are the spec. Do not build anything from other sections.

## What to build

### 1. One new migration
Create it with `npx supabase migration new service_items_catalogue` (real current UTC time; never pick or edit the date yourself). It must contain, in this order:

1. **`public.maintenance_unit`** exactly as audit 3a. Seed `can, bottle, tube, litre, pack, piece, kit, roll` with `label_one` / `label_many` ("can"/"cans", "bottle"/"bottles", "tube"/"tubes", "litre"/"litres", "pack"/"packs", "piece"/"pieces", "kit"/"kits", "roll"/"rolls") and `sort_order` 10, 20, 30 … — `ON CONFLICT (code) DO NOTHING`.
2. **Sequence `public.maintenance_supply_code_seq`** and **`public.maintenance_supply`** exactly as audit 3b:
   - `code text NOT NULL UNIQUE DEFAULT ('SUP-' || lpad(nextval('public.maintenance_supply_code_seq')::text, 5, '0'))`
   - `name` CHECK: `char_length(name) BETWEEN 1 AND 120 AND name = btrim(regexp_replace(name, '\s+', ' ', 'g'))`
   - partial unique index on `lower(name)` WHERE `status = 'active'`; a violation must surface as named error **`supply_name_taken`** (use a BEFORE INSERT/UPDATE trigger that checks and raises it, so the server gets the named code rather than a raw unique-violation)
   - `status` CHECK `IN ('active','retired')`; `unit_id` FK → `maintenance_unit(id)` ON DELETE RESTRICT
   - `created_by`, `updated_by` `uuid NULL` with `COMMENT … 'NULL = added by a migration'`
   - `updated_at` set to `now()` on every update (trigger)
3. **`public.maintenance_job_item`** exactly as audit 3c:
   - FKs to `maintenance_service_categories(id)` / `maintenance_supply(id)`, all ON DELETE RESTRICT
   - CHECK exactly one of `part_type_id`, `supply_id`; CHECK `part_type_id IS DISTINCT FROM job_id`; CHECK `need IN ('usually','sometimes')`; CHECK `qty_hint IS NULL OR qty_hint > 0`
   - partial unique indexes (`job_id`, `part_type_id`) and (`job_id`, `supply_id`) WHERE `removed_at IS NULL`
   - indexes `(job_id, sort_order) WHERE removed_at IS NULL`, `(part_type_id) WHERE part_type_id IS NOT NULL`, `(supply_id) WHERE supply_id IS NOT NULL`
   - trigger `maintenance_job_item_guard` (BEFORE INSERT OR UPDATE): job must be `kind = 'component'` → else **`job_item_job_invalid`**; part type must be `kind = 'component' AND is_part = true` → else **`job_item_part_type_invalid`**; on UPDATE, `job_id` / `part_type_id` / `supply_id` may not change → **`job_item_identity_locked`**; sets `updated_at = now()`
   - no DELETE path is used by the app (soft remove via `removed_at`); do not add a delete trigger
4. **Shared clash check** `public.maintenance_assert_no_also_do_clash(p_job uuid, p_part_type uuid)`: raises **`job_item_also_do_clash`** when the part type is an active May-need of the job (row with `removed_at IS NULL`) **and** there is a `maintenance_job_relations` row `from_category_id = p_job AND to_category_id = p_part_type`. Call it:
   - from a trigger on `maintenance_job_item` (INSERT, and UPDATE when `removed_at` goes from set to NULL), only when `part_type_id` is set;
   - from a new BEFORE INSERT trigger on `maintenance_job_relations` with (`NEW.from_category_id`, `NEW.to_category_id`).
5. **Errors:** every business error is `RAISE EXCEPTION '<code>' USING HINT = '<plain sentence>'` with exactly the codes above.
6. **RLS:** enable on all three tables. Signed-in users may SELECT `maintenance_unit`, `maintenance_supply`, `maintenance_job_item`; nothing else for `authenticated`/`anon`; writes only via `service_role` (copy the pattern used by `maintenance_job_relations` in `supabase/migrations/20261110001951_engine_service_sections.sql`).
7. **Seed (audit 3f steps 1–3):** the supply **Throttle body cleaner** (unit `can`, icon `wrench`, description "An aerosol spray that dissolves carbon and grime inside the throttle body.") — skip if an active supply with that lower-case name exists; a `usually` May-need link from `throttle_body_cleaning` to it with `qty_hint 1` and note "Spray, then wipe with a clean rag." — skip if an active link exists; remove the "material" field from `throttle_body_cleaning.field_schema` (keep the labour field).
8. **Fold-in (audit 3f step 4):** copy `component_related_supply` rows into supplies + `sometimes` links exactly as 3f step 4 says (tidy names, skip blank / >120 / non-component rows with a `RAISE NOTICE` per skip). It has 0 rows on the live database today, but the code must still be correct.
9. **Do NOT** drop `component_related_supply` or `save_related_supply`, and do not change `variant_parts_checklist` — that is Round S1.

### 2. Two SQL test files (pattern: `supabase/tests/engine_sections_checks.sql` and `supabase/tests/engine_sections_used_ids_test.sql`)
- **`supabase/tests/service_items_checks.sql`** — invariant counts that must be 0 (each `DO $$ … RAISE EXCEPTION … $$` block): links whose job isn't a component; links whose part type isn't `is_part`; links with both or neither item; two active links to the same item on one job; active supplies sharing a lower-case name; supply names that aren't tidy; a part type that is both an active May-need and an Also-do of the same job.
- **`supabase/tests/service_items_db_test.sql`** — behaviour, inside `BEGIN … ROLLBACK`, using made-up names that can never match real data. Prove audit done-tests **1, 2, 3, 7**:
  - a link with both or neither item fails; a non-part `part_type_id` fails with `job_item_part_type_invalid`; a second active link to the same supply fails; after setting `removed_at`, adding the same supply again works;
  - changing `supply_id` on a link fails with `job_item_identity_locked`;
  - adding a May-need part type that's already an Also-do fails, and adding an Also-do that's already a May-need fails — both with `job_item_also_do_clash`;
  - inserting "Brake  cleaner" (two spaces) fails the tidy-name check; "Brake cleaner" then "BRAKE CLEANER" both active fails with `supply_name_taken`; a 121-character name fails; the new supply's code looks like `SUP-00002`-style (5 digits);
  - the seed exists: Throttle body cleaner is a `usually` link on `throttle_body_cleaning` with `qty_hint 1`, and that job's `field_schema` has no `material` field.
  Catch each expected error by its code (`SQLERRM`) and `RAISE EXCEPTION` if the wrong thing happened. End with `RAISE NOTICE 'service_items_db_test: ok';`.

### 3. CI
In `.github/workflows/parts-sql-checks.yml` add both test files (and the new migration file) to the `paths` lists for both `pull_request` and `push`, and add the two `docker cp … && docker exec … psql -v ON_ERROR_STOP=1 -f …` run lines right after the `engine_sections_used_ids_test.sql` lines, same style.

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset` on the **local** database only. It must finish with no error.
2. Run both test files against the local database the same way CI does (`docker exec <local db container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<file>`). Both must pass.
3. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`. Both must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change files outside this round's list (the migration, the two test files, the workflow file).
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183). Leave the local Supabase database as you found it if you started it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL — I'll read the files.
