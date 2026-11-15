# Give Cursor this — Service items, Round D2 fixes

Round D2 is built and all its tests pass. The check found 4 problems. Fix only these. Don't change anything else.

The migration `supabase/migrations/20261113171047_service_items_logging_core.sql` and the D1 migration `20261113154942_service_items_catalogue.sql` have **not** been run on the live database, so edit them in place. Don't add a new migration.

## Fix 1 — a finished log can be reopened and edited (proven on the local copy)
`fleet_save_work_order` never checks the current status on the update path. A completed log saved with `p_status = 'in_progress'` passes the guard trigger, because the guard only checks completed → completed. The log silently becomes `in_progress` again. Today's server allows only completed → closed.

Fix: in the update path, right after the `work_order_org_mismatch` check, refuse with `RAISE EXCEPTION 'immutable' USING HINT = 'This service is finished and can no longer be edited.'` when `v_wo.voided_at IS NOT NULL` or `v_wo.status NOT IN ('draft', 'in_progress')`.

Test (in `service_items_save_db_test.sql`): save → claim → finish, then a save with the new version → `immutable`, and the status, version and lines are unchanged. Do the same for a voided draft.

## Fix 2 — a field can't be cleared on edit (proven: provider and invoice link stay after being cleared)
On the update path, the work order and line `UPDATE`s use `coalesce(<request value>, <old value>)`. So sending `null` or `''` keeps the old value. A user can't remove the shop name, invoice link, notes or template, can't take a part off a line (`part_id`, `brand`, `part_number`), and can't blank a part price or labour (`unit_price`, `material`, `labor_amount`, `labor_hours`, `labor_rate`). Those blanks are money.

Fix: for every **nullable** column in those two `UPDATE`s, write it as `CASE WHEN <json> ? '<key>' THEN <value as sent, '' → NULL> ELSE <old value> END`. A key that is present is written as sent, including null. A missing key keeps the old value. Columns that are `NOT NULL` (check the table definitions) keep today's `coalesce`. Make the create path read the same keys the same way.

Test: create with provider, invoice link, and a part line with `part_id` / `brand` / `part_number` / `unit_price`. Then save with those keys set to `null`: all are now NULL. Then save with the keys left out: values are kept.

## Fix 3 — "missing service history" check gives false alarms
The integrity arm `completed_missing_service_ledger` flags lines that are skipped on purpose when a log is finished. The skip rules are in `recordCompletedServiceLines` (`supabase/functions/_fleet-server/maintenance_service_ledger_core.ts`, around line 225):
- declined lines;
- lines with no job (`component_id IS NULL`);
- jobs where `position_aware = true` and the line has no positions.

It also skips `recommended` lines, which the finish step does **not** skip.

Fix: make the arm use exactly those three skip rules and remove the `recommended` exclusion. Test: a completed log with a declined line, a line with no job, and a position-aware line with no positions → no row; a normal line with no ledger row → one row.

## Fix 4 — `pnpm check` fails on D1 (missing permission blocks)
`node scripts/assert-public-fn-revoke-anon.mjs` fails. Six D1 functions in `public` are created without `REVOKE … FROM anon, authenticated`:
- `maintenance_assert_no_also_do_clash()`
- `maintenance_job_item_guard()`
- `trg_maintenance_job_item_also_do_clash()`
- `trg_maintenance_job_relations_also_do_clash()`
- `trg_maintenance_supply_name_guard()`
- `trg_maintenance_supply_touch()`

Fix: at the end of the D1 migration, add `REVOKE ALL ON FUNCTION public.<name>(<args>) FROM PUBLIC, anon, authenticated;` for each one, with the exact argument types. Triggers still fire after this, so don't grant them to anyone. Then run the script and `pnpm check`: both must pass.

## Then (local only)
1. `npx supabase db reset --no-seed`. If it fails with `DbSetupError` while starting, run it once more.
2. Run the way CI does: `service_items_checks.sql`, `service_items_db_test.sql`, `service_items_save_db_test.sql`, `maintenance_discount_checks.sql`, `maintenance_discount_db_test.sql`, `engine_sections_used_ids_test.sql`. All must pass.
3. `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs`, `pnpm check`.

## Rules
- Never touch the live database, `.env.local` or any login / permission code. No git branch, commit or push.
- Change only: the D2 migration, the D1 migration (Fix 4 only), `service_items_save_db_test.sql`.
- Before you finish, stop any server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
- Report: clickable links to changed files + pass / fail of each check. Don't paste file contents.
