# Give Cursor this — Inspection findings, Round D1-fix (Data)

Small fix to Round D1 of `docs/inspection-findings-audit.md`. Read problem **IF-11** in section 2 and gate **13** in section 6 first.

**The problem:** a found job ("not done yet") is saved as a line with `recommended = true`. Three database functions skip `declined` lines but not `recommended` ones, so:
- a found Brake rotor that is later done looks like "the same part was replaced twice", which raises a false repeat-part alert;
- a found job that carries a part number would count as parts used.

## What to build

### 1. Edit the existing D1 migration
Put the changes in `supabase/migrations/20261118004433_inspection_findings.sql`. It has not been run on the live database yet, so **do not** create a new migration file. Add them at the end of the file, before the final grants.

The latest bodies of all three functions are in `supabase/migrations/20260320000000_baseline_prod_schema.sql`; no later migration redefines them, so check that with a search first. Copy each body **exactly** and change only the line filter:

- `public.refresh_repeat_part_alerts(p_km integer, p_days integer, p_vehicle_id text)`: in **both** places where it reads `maintenance_work_order_lines` with `l.declined IS NOT TRUE`, add `AND l.recommended IS NOT TRUE`.
- `public.apply_parts_usage_for_work_order(p_work_order_id uuid)`: everywhere it filters lines with `declined IS NOT TRUE`, add `AND recommended IS NOT TRUE` (use the same alias style as the line you're changing). The baseline has more than one `CREATE OR REPLACE` for this function; use the **last** one in the file.
- `public.backfill_work_order_part_links()`: same change.

Keep each function's signature, return type, `LANGUAGE`, security setting and grants exactly as they are. Re-state their existing `REVOKE` / `GRANT` lines from the baseline if the baseline has any.

### 2. Add to `supabase/tests/inspection_findings_db_test.sql` (gate 13)
Add these inside the existing `BEGIN … ROLLBACK`, using the same made-up company and cars:

1. A finished inspection service with a found "Brake rotor" (`recommended = true`, action `replace`), then a second finished service on the same car that does Brake rotor (`fromFoundLineId` set) a few km later. Call `refresh_repeat_part_alerts(10000, 90, <car>)`. **No** open `part_repeat_alert` row exists for that car and component.
2. A control check: two **done** Brake rotor jobs on the same car a few km apart **do** raise the alert. This proves the test can catch it.
3. A found line saved with a `part_number` on a finished service: `apply_parts_usage_for_work_order(<that work order>)` creates no usage row for that line. Check the table `apply_parts_usage_for_work_order` writes to; find it in its body.

Catch everything by its result, and `RAISE EXCEPTION` with a plain message if it's wrong.

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset --no-seed` on the **local** database only (run it once more if it fails with `DbSetupError`).
2. Run every one of these against the local database, the same way as in Round D1:
   - `inspection_findings_checks`
   - `inspection_findings_db_test`
   - `service_items_checks`
   - `service_items_db_test`
   - `service_items_save_db_test`
   - `service_items_completion_db_test`
   - `service_items_part_source_db_test`
   - `maintenance_discount_checks`
   - `maintenance_discount_db_test`
   - `engine_sections_used_ids_test`

   All must pass.
3. Run `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs` and `pnpm check`. All must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Change only these two files: the D1 migration and `inspection_findings_db_test.sql`.
- Before you finish, stop any app, dev server or test server you started. If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL; I'll read the files.
