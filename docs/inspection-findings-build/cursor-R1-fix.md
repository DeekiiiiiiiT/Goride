# Give Cursor this — Inspection findings, Round R1-fix (Data + Server)

Fix round after the code review of `docs/inspection-findings-audit.md`. Read section 0 and section 5 (**IF-17, IF-18, IF-19, IF-24, IF-25, IF-26**) first.
The screens side of this review (IF-20 to IF-23) is already done by Claude. Do not change any screen component or `apps/fleet/src`.

**What changed on the app side, so you know:** every found job an inspection job saves now carries `values.found_by_job = <inspection job id>`
(in `values_json`). "Done today" jobs carry `values.found_today = true` **and** `values.found_by_job`. Lines from the old Digital
inspection step are still `recommended = true` but have **no** `found_by_job`.

## What to build

### 1. Database — edit the existing D1 migration
Put all database changes in `supabase/migrations/20261118004433_inspection_findings.sql`. It has not been run on the live database
yet, so **do not** create a new migration file.

- **IF-18 — a voided service blocks doing the found job again.** Drop the partial unique index `idx_mwol_from_found_line_live` (remove
  its `CREATE UNIQUE INDEX` and add `DROP INDEX IF EXISTS idx_mwol_from_found_line_live;` so a database that already has it loses it).
  Instead, in `fleet.trg_found_line_link_guard()`, when a line is inserted or updated with `from_found_line_id` set: lock the found
  line (`SELECT … FOR UPDATE`), then refuse with the existing `found_line_not_open` error when **another** line with the same
  `from_found_line_id`, `voided_at IS NULL`, sits on a work order with `voided_at IS NULL` (any status). Lines on voided work orders no
  longer count.
- **IF-19 — an unfinished "Log it now" service counts as done.** In `public.maintenance_found_line_is_open`, the `NOT EXISTS` child
  check counts a child only when its work order has `status = 'completed'` (and is not voided). Make the same change everywhere else
  in the migration that decides "done" from a child line (`fleet_open_found_work`, `fleet_found_work_counts`, and any history/status
  helper; search for `from_found_line_id`).
- **IF-26 — the fleet card needs the oldest car.** `public.fleet_found_work_counts` also returns `oldestVehicleId` (the vehicle of
  the open found job with the largest days waiting; ties → any). Keep the other keys exactly as they are.

### 2. Server
- **IF-17 — switch off blocks the old Digital inspection step.** `inspectInspectionFindingsOffPayload` in
  `supabase/functions/_fleet-server/service_items_save.ts` returns true only for a line with `fromFoundLineId`/`from_found_line_id`,
  or `values.found_by_job`, or `values.found_today === true`. A plain `recommended: true` line no longer trips it.
- **IF-19 (server half).** `enrichApiLinesWithFound` in `maintenance_routes.ts` reports `done` only from a child line whose work order
  is `completed` and not voided.
- **IF-24 — a found line that also claims to close a found line.** In the save path (`prepareWorkOrderLines` or wherever lines are
  checked before saving), a line with `recommended: true` **and** a `fromFoundLineId` is refused with
  `400 { code: "found_line_invalid", error: "A job not done yet can't also close a found job." }` before the database is called.
- **IF-25 — two flag lookups one after the other.** Where the sections route reads `SERVICE_ITEMS` then `INSPECTION_FINDINGS`, read
  both with `Promise.all`. Give `inspectionFindingsOffResponse` the flag value when the caller already has it, so a save reads the flag once.
- **IF-26 (server half).** The counts route passes `oldestVehicleId` through (default `null` in the empty answer).

Then rebuild the bundle: `node scripts/build-edge-bundle.mjs fleet-ops`. That file is kept in git.

### 3. Tests
Add to `supabase/tests/inspection_findings_db_test.sql` (inside the existing `BEGIN … ROLLBACK`, same made-up company and cars):
1. **IF-18:** service B does found job X → void B → X is open again → service C does X → the save succeeds and X is closed.
2. **IF-18 control:** two live services both trying to do X → the second is refused with `found_line_not_open`.
3. **IF-19:** a **draft** service that does X → X is still open and still counted; finish that service → X is closed.
4. **IF-26:** counts return the car with the oldest open found job as `oldestVehicleId`.

Add to `supabase/functions/_fleet-server/inspection_findings.test.ts`:
1. **IF-17:** switch-off check is false for `{ recommended: true }` and `{ recommended: true, values: {} }`; true for
   `{ values: { found_by_job: "x" } }`, `{ values: { found_today: true } }` and `{ fromFoundLineId: … }`.
2. **IF-24:** `recommended: true` + `fromFoundLineId` → `found_line_invalid` (400).
3. **IF-19:** `enrichApiLinesWithFound` with a child on a draft work order → status `waiting`, not `done`.

Catch everything by its result, and `RAISE EXCEPTION` (SQL) or fail (Deno) with a plain message if it's wrong.

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset --no-seed` on the **local** database only (run it once more if it fails
   with `DbSetupError`). Then run against the local database: `inspection_findings_checks`, `inspection_findings_db_test`,
   `service_items_checks`, `service_items_db_test`, `service_items_save_db_test`, `service_items_completion_db_test`,
   `maintenance_discount_checks`, `maintenance_discount_db_test`. All must pass.
2. Run the server tests:
   ```
   deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/inspection_findings.test.ts supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/parts_finder.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts
   ```
   Everything must pass (159 before this round, plus your new tests). Heavy Deno use can break the local Fleet dev app; if it does,
   stop the app and run `pnpm install`.
3. Run `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs` and `pnpm check`. All must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Change only: the D1 migration, `service_items_save.ts`, `maintenance_routes.ts`, the two test files, and the rebuilt bundle.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173 and 5180–5183).
  If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text).
  Don't paste file contents or full SQL; I'll read the files.
