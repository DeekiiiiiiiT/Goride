# Give Cursor this — Service items, Round S1 fixes

Round S1 is built. The check found 3 problems. Fix only these. Don't change anything else.

## Fix 1 — May-need links make a job look "used in service logs"
`public.maintenance_job_used_ids()` counts a job as used when **any** table has a foreign key to `maintenance_service_categories`. It already skips `maintenance_job_section_members.category_id` and `maintenance_job_relations.from_category_id / to_category_id`. It does **not** skip the new `maintenance_job_item` (`job_id`, `part_type_id`). So after D1 the seeded Throttle Body Cleaning link makes that job "used". Dominion then wrongly refuses to change its home group or form type, and `supabase/tests/engine_sections_used_ids_test.sql` fails ("section-only job must not be in maintenance_job_used_ids()").

Fix: at the end of `supabase/migrations/20261113162605_service_items_drop_old_supply_link.sql`, add `CREATE OR REPLACE FUNCTION public.maintenance_job_used_ids()`. Copy its latest definition from `supabase/migrations/20261110001951_engine_service_sections.sql`, keep its return type, settings and grants, and add one more exclusion:
`AND NOT (c.relname = 'maintenance_job_item' AND a.attname IN ('job_id', 'part_type_id'))`.
Real logs must still count, including the coming D2 table `maintenance_work_order_line_item.part_type_id`, so don't skip anything else.

Test: in `supabase/tests/service_items_db_test.sql` (inside its transaction), assert that Throttle Body Cleaning (which has the seeded May-need link) is **not** in `maintenance_job_used_ids()`, and that the Throttle body gasket part type is also not in it after you add it as a May-need link to a job.

## Fix 2 — wrong message when two people add the same supply name at once
In `mapServiceItemsDbError` (`supabase/functions/_fleet-server/maintenance_jobs_admin_helpers.ts`), a unique violation (`23505`) always returns "This item is already listed for this job." In the `supply` context it comes from the index `maintenance_supply_active_name_lower`. There it must return the `supply_name_taken` message: "Another active supply uses this name. Rename one of them first." (409). Add a unit test for the supply context.

## Fix 3 — long notes are cut off without a word
`POST /admin/maintenance/job-items` and `PATCH /admin/maintenance/job-items/:id` silently cut `note` to 300 characters. Refuse instead: after trimming, more than 300 characters → 400 "Note must be 300 characters or fewer." Put the check in a pure helper `validateJobItemNote` (blank → `null`) and use it in both routes. Unit tests: blank → null; 300 characters ok; 301 refused.

## Then
1. Rebuild the bundle: `node scripts/build-edge-bundle.mjs fleet-ops`.
2. Local only: `npx supabase db reset --no-seed`, then run `service_items_checks.sql`, `service_items_db_test.sql`, `maintenance_discount_checks.sql`, `maintenance_discount_db_test.sql`, `engine_sections_used_ids_test.sql` the way CI does. All must pass.
3. `deno test --no-check` on the three maintenance-jobs test files and `parts_finder.test.ts`; `node scripts/validate-migration-sql.mjs`.

## Rules
- Never touch the live database, `.env.local` or any login / permission code. No git branch, commit or push.
- Change only: the S1 migration, `service_items_db_test.sql`, `maintenance_jobs_admin_helpers.ts`, `maintenance_jobs_admin_routes.ts`, `maintenance_supplies_admin_helpers.test.ts`, and the rebuilt `fleet-ops/index.ts`.
- Before you finish, stop any server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
- Report: clickable links to changed files + pass / fail of each check. Don't paste file contents.
