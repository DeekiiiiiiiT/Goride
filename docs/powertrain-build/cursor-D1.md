# Give Cursor this — Powertrain job fit, Round D1 (Database)

You are building **Round D1 only** of `docs/powertrain-job-fit-audit.md` (Rev 6). Read these parts of that file first; they are the spec: **PT-2 to PT-11 (section 2), 3a, 3b, 3c, section 4 "Database", section 5, 6a tests 9, 10, 12, 14–25, 27, and 6b**. Do not build routes, screens or the flag; those are later rounds.

Where this file and the audit disagree, the audit wins. Tell me in your report.

## What to build

### 1. One new migration
Create it with `npx supabase migration new powertrain_job_fit` (real current UTC time; never pick or edit the date yourself). It must be **safe to run twice** (`ADD COLUMN IF NOT EXISTS`, guarded constraints, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`). Header comment: the re-run caveat from 3c, and the 6b "future-proofing" note (any column added to `vehicle_catalog` or `maintenance_service_categories` later must be added to the live file's snapshot exclusion lists).

In this order:

1. **`vehicle_catalog` columns (PT-2):** `powertrain text`, `fuel text`, `powertrain_status text`, `powertrain_note text`, `powertrain_last_confirmed_by uuid`, `powertrain_last_confirmed_at timestamptz`. All nullable, **no default**. Checks:
   - `powertrain IN ('ice','mhev','hev','phev','erev','bev','fcev')` or NULL;
   - `fuel IN ('petrol','diesel','cng','hydrogen','electric')` or NULL;
   - `powertrain_status IN ('derived','confirmed','needs_check')`;
   - `derived` and `confirmed` rows have both `powertrain` and `fuel` set.
   - Column comments, including the exact 3b comment on `powertrain_last_confirmed_by / _at`.
2. **One derivation function** `public.vehicle_catalog_derive_powertrain(p_fuel_type text, p_engine_type text, p_fuel_category text) RETURNS TABLE (powertrain text, fuel text, status text)`, IMMUTABLE. It is the rule table in **3a, rules 1–13 in that order** (engine_type keywords are case-insensitive "contains"; blank = NULL or empty after trim). The backfill and the trigger both call it. There is no second copy of the rule.
3. **Drop the derivation trigger if it exists** (so a re-run doesn't fire it during the backfill).
4. **Backfill (3c):** first `SET LOCAL part_match.busy = 'on'` (PT-11). Then **one** UPDATE exactly as 3c (skips `confirmed`, writes only where `IS DISTINCT FROM`). Run it inside a `DO` block that reads `GET DIAGNOSTICS … ROW_COUNT`, does `RAISE NOTICE 'powertrain D1: car rows changed = %'`, and stores the number in a temp table `pt_d1_counts(what text, n int)` (`CREATE TEMP TABLE IF NOT EXISTS`); the live file's assertion 11 reads it. After the backfill: `ALTER COLUMN powertrain_status SET NOT NULL`.
5. **Derivation trigger (3b)**, created **after** the backfill: BEFORE INSERT, and BEFORE UPDATE OF `fuel_type`, `engine_type`, `fuel_category` (only acts when one of them really changed). It follows every row of the 3b transition table, including "confirmed + text change + same derived values → stays confirmed, note cleared" and "confirmed + different/no values → needs_check, values and confirmation kept, note 'Text changed after confirmation: please re-confirm'". An insert that arrives already `confirmed` with both values is left alone.
6. **`maintenance_service_categories` columns (PT-3, PT-5):** `fits_powertrains text[]`, `fits_fuels text[]` (nullable; NULL = inherit), `is_high_voltage boolean NOT NULL DEFAULT false`. Checks: arrays not empty (`cardinality > 0`); every element in the code lists above; `CHECK (kind = 'component' OR is_high_voltage = false)`. Column comments that say NULL on a job = "same as group", NULL on a group = "any car", and that "All" on a job is stored as the full code list (section 4).
7. **Starting values (section 5 + PT-5)**: **one** `UPDATE … FROM (VALUES …)` by `code`, carrying every column D1 sets on that row, and writing only where something differs (`IS DISTINCT FROM`), so a re-run changes 0 rows. Same `GET DIAGNOSTICS` + `RAISE NOTICE` + `pt_d1_counts` row ('job rows changed'). Exactly these **47 rows** (codes checked on live, 15 Nov):

   Presets: Combustion = `{ice,mhev,hev,phev,erev}` · Electrified = `{hev,phev,erev,bev,fcev}` · Plug-in = `{phev,erev,bev}` · Spark-ignition = `{petrol,cng}`.

   | Code(s) | fits_powertrains | fits_fuels | is_high_voltage |
   |---|---|---|---|
   | groups `sys_engine`, `sys_belts`, `sys_transmission`, `sys_exhaust` | Combustion | NULL | false |
   | group `sys_hybrid` | Electrified | NULL | false |
   | `spark_plugs`, `spark_plug_wires`, `ignition_coil`, `throttle_body_cleaning`, `throttle_body_relearn`, `carburetor_cleaning` | NULL | Spark-ignition | false |
   | `oil_filter`, `air_filter`, `fuel_filter` | Combustion | NULL | false |
   | `oil`, `engine_oil_part`, `coolant_flush` | Combustion | NULL | false |
   | `dpf_cleaning`, `dpf_replacement`, `scr_service`, `adblue_topup`, `nox_sensor`, `glow_plugs`, `egt_sensor`, `dpf_pressure_sensor` | NULL | `{diesel}` | false |
   | `evap_canister`, `purge_valve` | NULL | `{petrol}` | false |
   | `ev_charging_port`, `ev_onboard_charger` | Plug-in | NULL | **true** |
   | `ev_charging_port_cleaning` | Plug-in | NULL | false (+ description sentence, PT-5) |
   | `ev_battery_coolant_service`, `ev_battery_coolant_pump` | `{phev,erev,bev}` | NULL | false |
   | `hv_battery_fan_filter`, `hv_battery_fan_cleaning` | `{hev,phev}` | NULL | false |
   | `inverter_coolant_service`, `inverter_coolant_pump` | `{hev,phev,erev}` | NULL | false |
   | `ev_reduction_gear_oil` | `{bev,erev,fcev}` | NULL | false |
   | `electric_ac_compressor` (HVAC) | Electrified | NULL | **true** (+ description sentence, PT-5) |
   | `ELEC-ALT` | `{ice}` | NULL | false |
   | `ELEC-START` | `{ice,mhev}` | NULL | false |
   | `hv_battery_health_check`, `hv_battery_module`, `hv_battery_pack`, `hv_insulation_inspection`, `hv_cable`, `ev_dc_dc_converter`, `ev_traction_motor` | NULL (inherit) | NULL | **true** |

   That's 5 groups + 35 job overrides + 7 HV-only = 47. Every other row keeps NULL / NULL / false. The two description sentences are the exact text in PT-5, **appended** (old text + one space + sentence; just the sentence if the old text is blank), and only when the description doesn't already end with that sentence. If a code isn't found, stop with `RAISE EXCEPTION 'powertrain D1: job code missing: %'`.
8. **`maintenance_work_order_lines.fit_at_log text`**, CHECK `IN ('yes','no','unknown')` or NULL, with a comment (PT-8). Old lines stay NULL.
9. **`vehicle_component_schedule.retired_reason text`** (PT-4), with a comment. Don't retire anything in D1.
10. **Fit functions (PT-9, PT-10, section 4):**
    - One internal helper that resolves a job's effective lists (job value, else group value, else "any") and one that decides the answer (exception row for (job, model) first, then (job, model's `platform_id`), then the lists; NULL / `needs_check` model → 'unknown' before anything else). Both public functions use these helpers. No second copy of the rule.
    - `public.job_fits_car(p_vehicle_catalog_id uuid, p_job_ids uuid[] DEFAULT NULL) RETURNS TABLE (job_id uuid, fits text)`: exactly as PT-10 (every active `kind = 'component'` job when the array is NULL; NULL ids skipped; STABLE; the comment "Assumes vehicle_class = 'car'. Extend when other classes are added.").
    - `public.job_fit_count(p_job_id uuid, p_overrides jsonb DEFAULT NULL) RETURNS TABLE (fits int, unknown int, total int)`: exactly as section 4 (one set-based query; missing key = saved value, array = that list, JSON null = "same as group"; bad key or empty array → `RAISE EXCEPTION 'job_fit_count_bad_override' USING HINT = '<plain sentence>'`).
    - `REVOKE ALL … FROM PUBLIC, anon, authenticated` on every new function and trigger function; `GRANT EXECUTE` on `job_fits_car` and `job_fit_count` to `service_role` only.
11. **`fleet_save_work_order` sets `fit_at_log` (PT-8).** This function is SQL (latest copy in `supabase/migrations/20261115165536_service_items_part_source.sql`), so it belongs in this round, not S1. `CREATE OR REPLACE` it from that latest copy, changing **only** this: when a line is inserted, and when an update changes the line's `component_id`, set `fit_at_log` from `job_fits_car(<car's vehicle_catalog_id>, ARRAY[<job>])` (an unlinked car → 'unknown'). At no other time. A quantity, price or note edit keeps it. It never refuses a save.
12. `NOTIFY pgrst, 'reload schema';`

### 2. Past-lines check file
`docs/service-items-build/live/powertrain-past-lines.sql`: read-only (PT-8). Prints "N lines were logged as not usual; M of them still don't fit today", then the lines behind M (car, date, job name). The owner runs it by hand.

### 3. Live file + its DRYRUN (pattern: `docs/service-items-build/live/README-dryrun.md` and `double-log-notes.sql`)
- **`docs/powertrain-build/live/D1-powertrain_job_fit.sql`**: `BEGIN;` → the **6b snapshot** (temp tables, before any change, exactly the columns and tables 6b lists) → the migration body, verbatim → one `DO $chk$` block with **all 13 assertions of 6b**, each stopping with `Stopped, nothing saved: <check> on <ids>` → the line `-- (real run: no stop here; COMMIT follows)` → `END $chk$;` → `COMMIT;` → the logbook line `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<version>', 'powertrain_job_fit') ON CONFLICT (version) DO NOTHING;` → a short after-save query showing the 3a split and the two Fleet cars.
  - Assertion 2 uses the exact 3a numbers. Assertion 11 reads `pt_d1_counts` and the `platform_revision` count difference; its message prints all three numbers (expected 2,679 + 47 = 2,726 on the first run, 0 on a re-run).
  - Header: "Run D1-powertrain_job_fit-DRYRUN.sql first", the re-run caveat, and the future-proofing note.
- **`docs/powertrain-build/live/D1-powertrain_job_fit-DRYRUN.sql`**: **generated**, never hand-edited, first line carries the SHA-256 of the real file. The `-- (real run …)` line becomes an always-stop `RAISE EXCEPTION 'DRY RUN OK, nothing saved: cars changed=%, jobs changed=%, revision rows=%, needs_check=%', …`; everything after `END $chk$;` is cut.
- **`docs/powertrain-build/live/README-dryrun.md`**: the exact Git Bash command that regenerates the DRYRUN (same style as the service-items README) and the expected DRY RUN OK message.

### 4. SQL tests (pattern: `supabase/tests/service_items_checks.sql` and `supabase/tests/service_items_db_test.sql`)
- **`supabase/tests/powertrain_checks.sql`**: invariants that must be 0: `derived`/`confirmed` rows missing a value; unknown codes in any new column; empty `fits_*` arrays; `is_high_voltage` on a group; HV jobs ≠ the 10 PT-5 codes; mild hybrids that fit any Hybrid & electric job or `electric_ac_compressor` (assertion 13).
- **`supabase/tests/powertrain_db_test.sql`**: behaviour inside `BEGIN … ROLLBACK`, with made-up fixture models and jobs whose names can never match real data. Prove audit done-tests **9 (function half: the 6 model kinds), 10, 12, 14–18, 20–25, 27**:
  - **12** on local data: one fixture model per 3a rule (13 rows + a Hydrogen non-fuel-cell row) gives the rule's exact values. The real 2,679 split is proven on live by the DRYRUN's assertion 2, not here.
  - **25** on local data: `job_fit_count` equals the counts from `job_fits_car` over all models, for the 4 fixture jobs the test names; the three override states (no override / `{"fits_powertrains": null}` / all 7 codes) give three different counts that equal "save it and count again"; a bad key and an empty array raise `job_fit_count_bad_override`.
  - **22**: prove `SET LOCAL part_match.busy = 'on'` stops `part_match_vehicle_catalog_years_upd` from reaching `part_match_oe_chain`, and that without it a year change does reach it. If it ever doesn't, fail with "part_match.busy no longer suppresses the year trigger".
  - **16 + 24** go through the real `fleet_save_work_order`: a line saved 'no' stays 'no' after the rule changes; changing a saved line's job to a non-fitting one sets 'no'; a quantity edit keeps it; the past-lines query returns N and M correctly when one rule was widened after logging.
  - Catch each expected error by its code (`SQLERRM`) and `RAISE EXCEPTION` if the wrong thing happened. End with `RAISE NOTICE 'powertrain_db_test: ok';`.
- **`supabase/tests/powertrain_rerun_test.sql`** (test **19**): inside `BEGIN … ROLLBACK`, count `vehicle_catalog` and `maintenance_service_categories` rows changed and `platform_revision` rows, run the migration file a second time, and assert 0 car rows, 0 job rows, 0 confirmed rows and 0 revision rows changed.

### 5. CI
In `.github/workflows/parts-sql-checks.yml` add the three test files and the new migration file to the `paths` lists for both `pull_request` and `push`, and add their `docker cp … && docker exec … psql -v ON_ERROR_STOP=1 -f …` run lines right after the `service_items_completion_db_test.sql` lines, same style (the rerun test needs the migration file copied in too).

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset` on the **local** database only. It must finish with no error.
2. Run the three test files against the local database the way CI does. All must pass. Also run the existing `service_items_save_db_test.sql` and `service_items_completion_db_test.sql`: they must still pass after the `fleet_save_work_order` change.
3. Run the live file's **DRYRUN on the local database** once, just to prove it parses and reaches its last check (the live-only numbers in assertions 2, 5 and 11 will differ locally; report which assertion stopped it and with what message).
4. Regenerate the DRYRUN with the README command and confirm its first-line hash matches `sha256sum` of the real file.
5. Run `node scripts/validate-migration-sql.mjs` and `pnpm check`. Both must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Do not change files outside this round's list (the migration, the past-lines file, the 3 live-folder files, the 3 test files, the workflow file).
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183). Leave the local Supabase database as you found it if you started it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL — I'll read the files.
