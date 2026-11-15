# Give Cursor this — Powertrain job fit, Round S1 (Server + schedules)

You are building **Round S1 only** of `docs/powertrain-job-fit-audit.md` (Rev 6). Read these parts first; they are the spec: **PT-1, PT-4, PT-7, PT-8, PT-9, PT-10 (section 2), section 4 "Server" and "Screens" (so you know what the screens need from you), and 6a done-tests 7, 8, 9, 11, 13**. Round D1 is **live**: read `supabase/migrations/20261115214317_powertrain_job_fit.sql` to see what already exists (`job_fits_car`, `job_fit_count`, the `_job_fit_*` helpers, `fit_at_log` set by `fleet_save_work_order`, `vehicle_component_schedule.retired_reason`). Do not change that file. Do not build screens.

Where this file and the audit disagree, the audit wins. Tell me in your report.

## Facts already checked (15 Nov, on the code and on live)
- The schedule builder is SQL: `public.recompute_component_schedules_for_car` and `recompute_component_schedules_for_rule` both call **`public.mm_recompute_schedule_row`** for each (car, job, position). Latest copies: `mm_recompute_schedule_row` in `supabase/migrations/20261106132200_mm_l01_baseline_source_coalesce.sql`; the two callers in `supabase/migrations/20261106130900_mm_units_rename.sql`. The nightly run is `fleet.run_maintenance_nightly_check` (`supabase/migrations/20261106131200_mm_rename_db_readers.sql`), which calls `fleet.recompute_maintenance_schedule` → `recompute_component_schedules_for_car`.
- `mm_recompute_schedule_row` can set a row back to `active`. So the fit rule must live **inside `mm_recompute_schedule_row`**. Every path (one car, one rule, the nightly run) goes through it, so the rule is in one place.
- `vehicle_component_schedule`'s job column is **`category_id`** (not `component_id`).
- `fleet.vehicles.id` is the plate (text, e.g. `5179KZ`); `fleet.vehicles.vehicle_catalog_id` is text. Cast it only after checking it looks like a uuid (an unlinked or malformed link means 'unknown', never an error).
- Fleet job-list routes: `supabase/functions/_fleet-server/maintenance_routes.ts` ~1316–1480 (`GET /maintenance-categories`, `/maintenance-categories/quick-jobs`, `/maintenance-categories/systems/:systemId/components`, `/maintenance-categories/systems/:systemId/sections`). None takes the car today.
- Dominion job editor routes: `supabase/functions/_fleet-server/maintenance_jobs_admin_routes.ts` (`PATCH /admin/maintenance/jobs/:id` ~547, guard `assertCatalogWriteResponse`). Dominion car-model routes: `supabase/functions/_fleet-server/vehicle_catalog_write_routes.ts` (prefix `/make-server-37f42386/admin/vehicle-catalog`, guard `assertVehicleCatalogAccess` + `assertCatalogWriteRateLimit`).
- Flags: `supabase/functions/_fleet-server/feature_flags.ts` (`FEATURE_FLAGS`, `isFeatureEnabled(flag, orgId)`; unset = off).

## What to build

### 1. One new migration
Create it with `npx supabase migration new powertrain_job_fit_schedules` (real current UTC time; never pick or edit the date yourself). Safe to run twice (`CREATE OR REPLACE`).

1. **`public.mm_recompute_schedule_row`**: `CREATE OR REPLACE` it from its latest copy, adding **only** this at the start (after the row is loaded):
   - Work out the fit once: the car's `vehicle_catalog_id` (from `fleet.vehicles`, uuid-checked) → `job_fits_car(<model>, ARRAY[<job>])`.
   - **`fits = 'no'`:** if a row exists and isn't already `retired`, set `schedule_status = 'retired'`, `retired_reason = 'Job doesn''t fit this car''s powertrain'`, `updated_at = now()`, and mark that car's open `fleet.fleet_maintenance_alerts` for that job `superseded` with `resolution_reason = 'schedule_retired'` (the same thing `POST /admin/maintenance-categories/:id/retire` does today). Return `'retired_no_fit'`. If no row exists, create nothing and return `'skipped_no_fit'`. If the row is already retired, touch nothing and return `'skipped_no_fit'`. This applies to `manual_override` rows too.
   - **`fits = 'unknown'`:** never retires, never skips. Carry on exactly as today.
   - **`fits = 'yes'`** on a row retired with that exact `retired_reason` (the rule was widened since): carry on as today, and clear `retired_reason` if the row comes back. Rows retired for any other reason: behave exactly as today.
   - Nothing else in the function changes. Show me the diff against the old copy in your report (a count of changed lines and what they are, not the SQL).
2. **`public.job_fit_models(p_job_id uuid, p_overrides jsonb DEFAULT NULL, p_limit int DEFAULT 50) RETURNS TABLE (vehicle_catalog_id uuid, make text, model text, year_from int, year_to int, powertrain text, fuel text)`** for the Dominion "See which" button. It returns the models where the answer is 'yes', ordered by make, model, year, using **the same override parsing and the same `_job_fit_for_model(…, true)` call as `job_fit_count`**, so the list always matches the count. Move the override parsing into one shared helper that both functions call; don't copy it. (Use the real year column names from `vehicle_catalog`.) Same `REVOKE` / `GRANT EXECUTE … TO service_role` pattern as D1.
3. `NOTIFY pgrst, 'reload schema';`

### 2. Live file + DRYRUN (same pattern as `docs/powertrain-build/live/D1-*`)
- **`docs/powertrain-build/live/S1-powertrain_job_fit_schedules.sql`**: `BEGIN;` → snapshot (count + md5 of `vehicle_component_schedule` and of open `fleet.fleet_maintenance_alerts`) → the migration body, verbatim → one `DO $chk$` block → the `-- (real run: no stop here; COMMIT follows)` line → `END $chk$;` → `COMMIT;` → the logbook line (`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<version>', 'powertrain_job_fit_schedules') ON CONFLICT (version) DO NOTHING;`).
- Checks (each stops with `Stopped, nothing saved: <check> on <ids>`): (a) the schedule rows the new rule would retire on live = **0** (read-only: rows not retired whose job is 'no' for their car); (b) both snapshots unchanged (the file must not run any recompute); (c) for 4 jobs (`spark_plugs`, `ev_charging_port`, `oil`, `ELEC-ALT`) `count(*) FROM job_fit_models(job, NULL, 100000)` = `job_fit_count(job).fits`; (d) the same with the override `{"fits_powertrains": null}` on `ELEC-ALT` (expected: every placed model, 2,667).
- **`S1-powertrain_job_fit_schedules-DRYRUN.sql`**: generated by extending `regen-dryrun.mjs` to take the file name as an argument (keep D1 working). Stop message: `DRY RUN OK, nothing saved: would retire=%, models list = count on 4 jobs + override`. Update `README-dryrun.md`.
- **Before you report:** run the DRYRUN on the **local** database once with every `RAISE EXCEPTION 'Stopped` turned into `RAISE NOTICE` (a throwaway copy in your temp folder, not committed), so every check actually runs to the end. PL/pgSQL only finds a wrong column name when the line runs. Report which notices fired (local data differs from live, so some will).

### 3. Fleet job-list routes (PT-1, PT-7, PT-10)
Add flag **`JOB_FIT_FILTER: "job_fit_filter"`** to `FEATURE_FLAGS` (comment: "Log service shows jobs that fit the car's powertrain. Default off.").

On the 4 routes above, accept an optional `vehicleId` query parameter:
- **Flag off, or no `vehicleId`:** the response is **byte-for-byte today's** (no new keys). Done-test 11.
- **Flag on + `vehicleId`:** look the car up in `fleet.vehicles` **within the caller's organisation** (`getOrgId(c)`); not found → 404 `{ error: "Car not found." }`. Then **one** `job_fits_car(<model or NULL>, NULL)` call per request (an unlinked car passes NULL and gets 'unknown' for every job; done-test 13). Add:
  - on every **job** object (`kind = 'component'`), wherever it appears in the response (including jobs nested in sections and their related "also do" jobs): `fits: 'yes' | 'no' | 'unknown'`;
  - on every **group** object (`kind = 'system'`): `fitJobCount` and `hiddenJobCount` over that group's active jobs ('unknown' counts as fitting, so `hiddenJobCount` = the 'no' count);
  - at the top level: `jobFit: { status: 'known' | 'unknown', powertrain, fuel }` (from the car's model; 'unknown' when unlinked or `needs_check`).
  - If the `job_fits_car` call **fails**, still return the normal jobs, with no `fits` keys and `jobFit: { status: 'error' }`, so the screen can show "Couldn't check which jobs fit this car. Showing every job." (PT-7). Never return a 500 because the fit check failed.
- The server **never hides** a job; the screen does. Rows already carry `is_high_voltage`, `fits_powertrains` and `fits_fuels` because the routes select `*`. Keep it that way.
- Work-order and Service history line payloads (wherever Fleet reads `maintenance_work_order_lines`) must include **`fit_at_log`**, plus the line's job **`is_high_voltage`** (for the amber chip). Find every such read; list them in your report.
- **The 7 server files that read `vehicle_component_schedule`** (`fleet_admin_maintenance_ledger_routes.ts`, `fleet_find_parts_routes.ts`, `maintenance_log_service_context.ts`, `maintenance_master_fleet_enrich.ts`, `maintenance_master_routes.ts`, `maintenance_routes.ts`, `maintenance_service_ledger_core.ts`): check every read. Any read that shows due / overdue / upcoming items must leave out `schedule_status = 'retired'` rows. Fix the ones that don't. In your report, list each read with "already excluded" / "fixed" / "not a due-items read".

### 4. Dominion routes
In `maintenance_jobs_admin_routes.ts` (guard `assertCatalogWriteResponse`; allowed on **used** jobs too, since history is frozen by `fit_at_log`, so make sure `usedJobPatchRefusal` doesn't refuse these keys):
- **`PATCH /admin/maintenance/jobs/:id`** also accepts `fitsPowertrains`, `fitsFuels` (key missing = leave as is; `null` = "Same as group"; array = that list, **non-empty, known codes only**, de-duplicated; "All" arrives from the screen as the full code list and is stored as-is, see section 4 of the audit) and `isHighVoltage` (boolean). Bad values → 400 with a plain message.
- **`PATCH /admin/maintenance/groups/:id/fits`** for `kind = 'system'` rows only: `fitsPowertrains`, `fitsFuels` (`null` = any car). `isHighVoltage` in the body → 400 "Groups can't be marked high-voltage.". A job id → 400.
- **`GET /admin/maintenance/jobs/:id/fit-count?overrides=<url-encoded JSON>`** → `{ fits, unknown, total }` from `job_fit_count`. The DB's `job_fit_count_bad_override` → 400 `{ error: <its hint>, code: "job_fit_count_bad_override" }`. Bad JSON → the same 400.
- **`GET /admin/maintenance/jobs/:id/fit-models?overrides=…&limit=50`** → `{ items }` from `job_fit_models` (limit capped at 200).
- Job and group payloads in this file's list / detail responses (`loadJobItem` and the jobs list) include `fitsPowertrains`, `fitsFuels`, `isHighVoltage`, plus each job's group values `groupFitsPowertrains`, `groupFitsFuels` (the drawer shows "Same as group (<preset name>)").

In `vehicle_catalog_write_routes.ts` (same guards as its `PATCH /…/vehicle-catalog/:id`):
- **`PATCH /make-server-37f42386/admin/vehicle-catalog/:id/powertrain`** body `{ powertrain, fuel }`, both required and known codes → sets them, `powertrain_status = 'confirmed'`, `powertrain_last_confirmed_by` = the signed-in user, `_at = now()`, `powertrain_note = NULL`. Returns the row. (This is 3b's last row: "owner confirms / edits in Dominion".)
- **`GET /make-server-37f42386/admin/vehicle-catalog/powertrain-check`** → `{ count, items }`: every `needs_check` model with id, make, model, years, raw `fuel_type` / `engine_type` / `fuel_category`, current `powertrain` / `fuel`, `powertrain_note`, last confirmed by / at, and `disagreement: { fuelType, category } | null`. The disagreement is set when the row is in the list because the two disagree (3a rule 2: Hybrid(petrol) + category Gas). Order: disagreements first, then make, model.
- **`GET /make-server-37f42386/admin/vehicle-catalog/powertrain-summary`** → `{ total, needsCheck, byPowertrain: { ice, mhev, hev, phev, erev, bev, fcev } }` for the Vehicles home cards. Dominion data only.
- The existing single-model GET used by the car model page must return the 6 powertrain columns (check; add if it picks columns).

### 5. Tests
- **SQL, `supabase/tests/powertrain_schedule_db_test.sql`** (inside `BEGIN … ROLLBACK`, made-up fixture names, pattern `supabase/tests/mm_s03_nightly_twice.sql`). Proves done-test **7**: a bev fixture car with a rule for an Engine-oil-like job gets **no** schedule row; an existing active row on a non-fitting job is retired with the reason, and its open alert superseded; running `fleet.run_maintenance_nightly_check` twice retires it once and touches nothing the second time; an 'unknown' (unlinked) car keeps all its rows; a petrol fixture car's rows are unchanged; widening the job's rule brings the row back and clears `retired_reason`. Plus `job_fit_models` row count = `job_fit_count.fits` for 3 fixture jobs, with and without an override. End with `RAISE NOTICE 'powertrain_schedule_db_test: ok';`.
- **Deno, `supabase/functions/_fleet-server/maintenance_powertrain_fit.test.ts`** (pattern `maintenance_jobs_admin_routes.test.ts`; the `maintenance_` prefix makes `pnpm test:service-items` pick it up). Proves done-tests **9 (route half: the route's `fits` equals what `job_fits_car` returned, for the 6 model kinds in 6a test 9)**, **11** (flag off → identical response; flag on without `vehicleId` → identical), **13** (unlinked car → every job 'unknown', status 'unknown', no error), the `status: 'error'` fallback, car in another org → 404, `fitJobCount` / `hiddenJobCount`, and the Dominion routes' validation (empty array, unknown code, HV on a group, bad override JSON → 400 with the code).
- **Done-test 8** (saving or editing an old service never fails or loses a line; old lines keep `fit_at_log = NULL`) was proven in D1's `powertrain_db_test.sql` through `fleet_save_work_order`. Add one Deno case that saves an edit to an old line through the real save route and gets 200 with the line intact.
- Add `powertrain_checks`, `powertrain_db_test` and `powertrain_schedule_db_test` to `SQL_TESTS` in `scripts/run-service-items-tests.mjs`.
- CI: in `.github/workflows/parts-sql-checks.yml` add the new test file and migration to both `paths` lists and a run line after the `powertrain_rerun_test.sql` lines, same style.

## How to check your work (local only)
1. Docker Desktop must be open. `npx supabase db reset --no-seed` on the **local** database only. No error.
2. Run all powertrain SQL tests and `mm_s03_nightly_twice.sql` (the existing nightly test must still pass after the `mm_recompute_schedule_row` change). All pass.
3. `pnpm test:service-items --no-e2e`. All pass. (Deno runs write into `node_modules/.deno`. If the local Fleet app is running, tell me in your report so the owner can run `pnpm install` afterwards.)
4. The S1 DRYRUN local run with stops turned into notices (section 2). Then regenerate the DRYRUN and confirm its first-line hash matches the real file.
5. `node scripts/validate-migration-sql.mjs` and `pnpm check`. Both pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push. Do not deploy anything.
- Do not change D1's files (`20261115214317_powertrain_job_fit.sql`, `docs/powertrain-build/live/D1-*`), except `regen-dryrun.mjs` and `README-dryrun.md` as section 2 says.
- Do not change files outside this round's list: the new migration, the S1 live files, `regen-dryrun.mjs`, `README-dryrun.md`, `feature_flags.ts`, `maintenance_routes.ts`, `maintenance_jobs_admin_routes.ts`, `vehicle_catalog_write_routes.ts`, the schedule-reader files you fix in section 3, the 2 new test files, `scripts/run-service-items-tests.mjs`, the workflow file.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183). Leave the local Supabase database as you found it if you started it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL — I'll read the files.
