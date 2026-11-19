# Give Cursor this — Log service parts gaps, Slice A, Round A-Data

You are building **Slice A, Data layer only** of `docs/log-service-parts-gaps-audit.md` (Rev 2.6). Read these parts first; they are the spec:
- section 1 (facts), the "Code" and "Live data" lists
- section 2, Slice A table (LS-01 … LS-08)
- section 3.1 Data, the Slice A bullet
- section 4 (Gates) and section 5 (Done-tests 1–7)

Do **not** build the Slice A server or screen work (section 3.2 / 3.3: the work-order read, the Find parts route, the chips, the "Save line" rule, the found-row chips, history labels on screen). Do not build anything from Slice B. Those are later rounds.

The working tree already has uncommitted changes in some Fleet files (including `LogMaintenanceServiceDialog.tsx`). Keep them: change only the lines this prompt names, and never revert, reformat or stash anything.

## What to build

### 1. The canonical position list: `packages/types/src/partPositions.ts` (LS-01, LS-02, LS-07)

Plain TypeScript, no imports from any app. Export it from `packages/types/src/index.ts` like `partsFitParam`.

1. **Schemes.** `POSITION_SCHEMES`, the 10 values exactly as the DB check in `supabase/migrations/20261107213549_part_position_catalogue_number.sql:18-24`:
   `none, axle, four_corners, driver_passenger_rear, low_high_beam, before_after_catalyst, front_rear_side, axle_left_right, axle_inner_outer, axle_numbered`.
   Export `type PositionScheme`. Export `WHEEL_SCHEMES = ['axle','four_corners','axle_left_right','axle_inner_outer']` and `isWheelScheme(scheme)`.

2. **Fleet codes and labels.** Export `WHEEL_CODES = ['LF','RF','LR','RR']` and `NOT_SURE = 'unknown'`.
   Export `fleetPositionOptions(job: { code?: string | null; position_aware?: boolean | null; position_scheme?: string | null }): { code: string; label: string }[]`, in this order of rules:
   - `code = 'front_stabilizer_link'` → `LF` "Left", `RF` "Right". `code = 'rear_stabilizer_link'` → `LR` "Left", `RR` "Right". (Same as `sidePositionsFor` in `apps/fleet/.../log-service/logServiceJobCost.ts:62-68`.)
   - else `position_aware = true` → the four wheel codes, label = the code itself (today's labels: "LF", "RF", "LR", "RR").
   - else by scheme:
     - wheel schemes → the four wheel codes, label = the code;
     - `before_after_catalyst` → `before_cat` "Front (before converter)", `after_cat` "Rear (after converter)";
     - `driver_passenger_rear` → `driver` "Driver", `passenger` "Passenger", `rear` "Rear";
     - `low_high_beam` → `low` "Low beam", `high` "High beam";
     - `front_rear_side` → `front` "Front", `rear` "Rear", `side` "Side";
     - `axle_numbered` → `front` "Front", `rear` "Rear";
     - `none`, NULL, blank or an unknown value → `[]`.
   - Then **"Not sure"**: when `position_aware` is not true **and** the scheme is not `none`/NULL/blank/unknown, add `{ code: 'unknown', label: 'Not sure' }` last. Position-aware jobs never get it.

   This follows the owner decision in audit section 0: "Not sure" is offered on every job that has positions **except** position-aware (wheel) jobs. So a non-position-aware job on a wheel scheme (Shock absorber `four_corners`, and Tire Valve Stem / Wheel Balancing after step 2) gets LF/RF/LR/RR **and** "Not sure".

   Export `allowedPositionCodes(job)` = the codes of `fleetPositionOptions(job)`.

3. **Validation.** Export `positionCodesProblem(job, codes: string[]): null | 'code_not_allowed' | 'not_sure_with_others'`:
   - `null` when `codes` is empty;
   - `'not_sure_with_others'` when `unknown` is in the list together with anything else;
   - `'code_not_allowed'` when any code is not in `allowedPositionCodes(job)`;
   - duplicates are ignored. Several picks are allowed.
   It **never** says a position is missing (the "must pick" rule is screen-only, LS-04).

4. **Labels by scheme + code (LS-07).** Export `positionLabel(job, code): string`. Look the code up in `fleetPositionOptions(job)`; if not found (old saved data, e.g. `LF` on a `none` job), return the code unchanged. Export `positionsLabel(job, codes)` = labels joined with ", ". Example: `front` under `front_rear_side` = "Front"; `before_cat` under `before_after_catalyst` = "Front (before converter)".

5. **Wheel translation (LS-02).** Export `wheelCodesToFitPairs(codes: string[]): PartsFitPair[]` using the `PartsFitPair` type from `./partsFitParam`. LF→front+left, RF→front+right, LR→rear+left, RR→rear+right. Both sides of one axle → one pair with side `both`. Front pair first, then rear. Non-wheel codes are ignored (they return `[]`). This is the **only** place the translation lives.

6. **Dominion lists, moved (LS-01).** Move these constants **unchanged** (same ids, labels, icon strings and order) out of `apps/admin/src/components/admin/parts-database/add-parts/Step2FitBlock.tsx:7-39` into `partPositions.ts` and export them: `AXLE_POSITIONS`, `CATALYST_POSITIONS`, `CORNER_SIDES`, `DRIVER_PASSENGER_REAR`, `LOW_HIGH_BEAM`, `FRONT_REAR_SIDE`. In `Step2FitBlock.tsx`, delete the local copies and import them from `@roam/types/partPositions` (the same import style as `@roam/types/partPositionNorm`). If a `MaterialIcon` prop needs the icon type, keep the `as const` on the moved arrays. Dominion must look and behave exactly as today; change nothing else in that file.

   Leave the 8-value `POSITION_SCHEMES` picker list in `apps/admin/.../add-parts/part-types/PartTypesSettings.tsx:101` alone; it is a picker subset, not the canonical list.

### 2. One new migration
Create it with `npx supabase migration new log_service_positions`. That gives it the real current UTC time; never pick or edit the date yourself. It contains, in this order:

1. **SQL twin of the rule: `public.maintenance_position_codes_allowed(p_job_code text, p_position_aware boolean, p_scheme text) RETURNS text[]`** (IMMUTABLE, `SET search_path = ''`). It returns exactly what `allowedPositionCodes` returns in TS for the same inputs (step 1.2), in the same order. Add a `COMMENT` saying it must stay in step with `packages/types/src/partPositions.ts`. `REVOKE ALL … FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE … TO service_role`.

2. **The C6 schemes (LS-03).** This is a Dominion master-data change on purpose:
   ```sql
   UPDATE public.maintenance_service_categories
   SET position_scheme = 'four_corners'
   WHERE code IN ('tire_valve_stem', 'wheel_balancing')
     AND position_scheme = 'none';
   ```
   Do not touch any other job. `LGT-TAIL`, `brake_fluid`, `brake_master_cylinder`, `tire_pressure` and `wheel_alignment` stay `none`. Write the rollback as a comment at the top of the file (set the two back to `none`). These codes may not exist in the local database; the UPDATE must simply do nothing then.

3. **Position fields on requests (LS-08).** On `public.parts_sourcing_requests`, each with a `COMMENT`:
   - `position_scheme text NULL`, CHECK `position_scheme IS NULL OR position_scheme IN (<the 10 schemes>)`;
   - `position_codes text[] NULL`;
   - CHECK `position_codes IS NULL OR position_scheme IS NOT NULL`.
   Nothing writes them yet (the Find parts route is the Server round).

4. **New version of `public.fleet_save_work_order` (LS-05).** Copy the **latest** body, from `supabase/migrations/20261118004433_inspection_findings.sql` line 156 to its `GRANT` at line ~720, and keep everything else exactly as it is: same signature, return shape, error codes, `SECURITY DEFINER`, `search_path`, the `REVOKE` / `GRANT` lines. Change only this:
   - After the line's final `component_id` is known (sent `component_id` when the key is present, else the stored one), and **before** the line is written, run the position check **only when all of these hold**:
     - the line has the `positions` key and its value is a JSON array;
     - the line is **new** (no `id`), **or** the sent array, as a sorted distinct set, is different from the stored `positions` as a sorted distinct set (NULL stored = empty).
   - The check: read `code`, `position_aware`, `position_scheme` of that `component_id` from `public.maintenance_service_categories`. If `component_id` is NULL or not found, skip the check. Otherwise:
     - `unknown` together with any other code → `RAISE EXCEPTION 'position_invalid' USING HINT = '"Not sure" can''t be picked together with a position.'`
     - any code not in `maintenance_position_codes_allowed(...)` → `RAISE EXCEPTION 'position_invalid' USING HINT = 'That position doesn''t fit this job.'`
   - An empty array is always allowed. A missing `positions` key is never checked and keeps the stored value, exactly as today. **Never** require a position.
   - Do not change how `positions` is stored on insert or update (`absent = keep`, `[]` = cleared, non-empty = replace is already what lines 406-413 and the insert do).

5. Every new function in this migration is REVOKEd from `anon`; `node scripts/assert-public-fn-revoke-anon.mjs` must pass.

### 3. Fleet: the word guess goes, in this same round (LS-03)
The audit ties removing the word guess to the C6 migration, so Tire Valve Stem and Wheel Balancing never lose their wheel buttons.

- Fleet already receives every job column (`maintenance_routes.ts:1277` selects `*`); only the type is missing it. Add `position_scheme?: string | null;` to `MaintenanceServiceCategory` in `apps/fleet/src/types/maintenance.ts` (next to `position_aware`, line 96).
- In `apps/fleet/src/components/vehicles/maintenance-logging/log-service/logServiceJobCost.ts`, add and export `showsWheelButtons(cat)`: true when `sidePositionsFor(cat)` is not null, or `cat.position_aware === true`, or `isWheelScheme(cat.position_scheme)` (import from `@roam/types/partPositions`). No name or word matching.
- In `LogMaintenanceServiceDialog.tsx`, make `needsPositions` (lines 255-260) return `showsWheelButtons(cat)`. Change nothing else in that file.
- Effect, on purpose: Brake and tail bulb, Brake Fluid, Master cylinder, Tire Pressure Check and Wheel Alignment no longer show wheel buttons; Shock absorber now shows them (optional, it doesn't move a schedule because it isn't position-aware). Non-wheel chips and "Not sure" are **not** shown yet; that is the Screens round.

## Tests (update and run them in this round)

### A. Deno test `packages/types/src/partPositions.test.ts`
Same style as `packages/types/src/partPositionNorm.test.ts`. It holds one fixture table, `EXPECTED`, listing for each of the 10 schemes × position-aware true/false the exact allowed codes, plus both stabiliser-link codes. Check:
- `POSITION_SCHEMES` equals the 10-value list;
- `allowedPositionCodes` matches `EXPECTED` row by row;
- "Not sure" is offered on every non-position-aware job with a scheme, never on a position-aware job, never on `none`;
- `positionCodesProblem`: empty → null; `['before_cat','after_cat']` → null; `['unknown','before_cat']` → `not_sure_with_others`; `['LF']` on a `before_after_catalyst` non-position-aware job → `code_not_allowed`; `['LF']` on a `none` job → `code_not_allowed`;
- `positionLabel`: `front` under `front_rear_side` = "Front", `before_cat` = "Front (before converter)", `LF` on a position-aware job = "LF", `LF` on a `none` job = "LF" (returned unchanged);
- `wheelCodesToFitPairs`: `['LF']` → front:left; `['LF','RF']` → front:both; `['RR','LF']` → front:left, rear:right; `['front']` → `[]`.

Add it to `.github/workflows/ci.yml` as its own small step next to the other Deno steps: `deno test --no-check packages/types/src/partPositions.test.ts`.

### B. Vitest
In `apps/fleet/src/components/vehicles/maintenance-logging/log-service/logServiceJobCost.test.ts`, add `showsWheelButtons` cases: position-aware Tire Change → true; `four_corners` Wheel Balancing (not position-aware) → true; Brake Fluid with scheme `none` → **false**; `front_stabilizer_link` → true; `before_after_catalyst` Oxygen sensor → false. Then search the Fleet unit tests and the `e2e/` Playwright tests for anything that expects wheel buttons on Brake Fluid, Master cylinder, Tire Pressure Check, Wheel Alignment or Brake and tail bulb, and update it in this round. Say in your report which ones you found (or that there were none).

### C. SQL checks file `supabase/tests/log_service_positions_checks.sql`
Follow the pattern of `supabase/tests/inspection_findings_checks.sql` and `inspection_findings_db_test.sql`. Invariants first, each in a `DO $$ … RAISE EXCEPTION … $$` block; then behaviour inside `BEGIN … ROLLBACK` with a made-up company, car and job names that can never match real data.
- **Schemes in step:** the fixture list of the 10 schemes in this file equals the values allowed by `maintenance_service_categories_position_scheme_check`, and every distinct `position_scheme` in the table is in the list.
- **SQL twin = TS:** `maintenance_position_codes_allowed` returns, for every row of the same `EXPECTED` fixture as the Deno test (copy it exactly), the same codes in the same order.
- **No guessed job left (C6):** 0 jobs whose `code`, `name` or `icon_key` matches `tire|brake|wheel` (case-insensitive) that are not position-aware, have scheme `none`, are not a stabiliser link, and are not one of the five kept on purpose (`op_code = 'LGT-TAIL'`, `code IN ('brake_fluid','brake_master_cylinder','tire_pressure','wheel_alignment')`).
- **Behaviour**, calling `fleet_save_work_order` with the **same JSON shape the server sends** (every line key present, JSON nulls where empty; copy the shape from `inspection_findings_db_test.sql`). Insert the made-up jobs you need into `maintenance_service_categories` inside the transaction. Catch each expected error by `position_invalid` in `SQLERRM`; `RAISE EXCEPTION` if the wrong thing happens.
  1. New line on a `before_after_catalyst` job with `["before_cat"]` → saves, stored `{before_cat}`.
  2. New line on the same job with `["LF"]` → `position_invalid`.
  3. New line with `["unknown","before_cat"]` → `position_invalid`. With `["unknown"]` → saves.
  4. New line on a position-aware wheel job with `["LF","RF"]` → saves; with `["unknown"]` → `position_invalid`.
  5. New line on a `none` job with `[]` → saves. With no `positions` key → saves, stored NULL.
  6. **Old line re-saves unchanged (Gate 7, done-test 4):** put a line holding `{LF}` on a `none` job directly with an INSERT (old data). Re-save the work order sending that line with `["LF"]` → no error, still `{LF}`. Send it with the `positions` key **absent** → no error, still `{LF}`. Send it with `[]` → saves, stored empty (cleared). Send it with `["RF"]` → `position_invalid` (a change is checked).
  7. **Absent vs empty (golden rule 10):** the two cases in step 6 give different stored values; assert both.
  8. Inspection gate still holds: a `recommended = true` line with `["before_cat"]` saves at J$0 with no items.

  End with `RAISE NOTICE 'log_service_positions_checks: ok';`.

Add the file to `.github/workflows/parts-sql-checks.yml`: to both `paths` lists (`pull_request` and `push`, next to `inspection_findings_db_test.sql`), and its `docker cp … && docker exec … psql -v ON_ERROR_STOP=1 -f …` lines right after the `inspection_findings_db_test.sql` lines, in the same style.

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset --no-seed` on the **local** database only. If it fails with `DbSetupError`, run it once more. It must finish with no error.
2. Run the new SQL file **and** every existing maintenance SQL test against the local database the way CI does: `inspection_findings_checks`, `inspection_findings_db_test`, `service_items_checks`, `service_items_db_test`, `service_items_save_db_test`, `service_items_completion_db_test`, `service_items_part_source_db_test`, `powertrain_checks`, `powertrain_db_test`, `maintenance_discount_checks`, `maintenance_discount_db_test`.
   ```
   export MSYS_NO_PATHCONV=1
   docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/<f>.sql
   docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<f>.sql
   ```
   All must pass. The old ones prove nothing else changed.
3. Run `deno test --no-check packages/types/src/partPositions.test.ts`.
4. Run the Fleet vitest for `logServiceJobCost.test.ts` and any test you changed, from `C:\Roam\Goride` in PowerShell (not a `/c/...` bash path).
5. Run `pnpm --filter @roam/admin typecheck` and `pnpm --filter @roam/fleet typecheck`, then `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs` and `pnpm check`. All must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit, stash or push.
- Change only: `packages/types/src/partPositions.ts` + its test, `packages/types/src/index.ts`, `Step2FitBlock.tsx`, the new migration, `apps/fleet/src/types/maintenance.ts`, `logServiceJobCost.ts` + its test, the one function in `LogMaintenanceServiceDialog.tsx`, tests that expected the old word guess, the new SQL file, `parts-sql-checks.yml` and `ci.yml`.
- Shipped migration files are never edited.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173 and 5180–5183). If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL; I'll read the files.
