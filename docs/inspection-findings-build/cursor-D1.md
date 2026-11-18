# Give Cursor this — Inspection findings, Round D1 (Data)

You are building **Round D1 only** of `docs/inspection-findings-audit.md` (Rev 4). Read these parts first; they are the spec:
- section 2 (problems IF-1 and IF-4 to IF-10)
- section 3 (Data)
- section 6 (Gates)

Do not build anything from sections 4 or 5 (server and screens). Those are later rounds.

## What to build

### 1. One new migration
Create it with `npx supabase migration new inspection_findings`. That gives it the real current UTC time; never pick or edit the date yourself. It must contain the following, in this order.

1. **Mark inspection jobs**
   - Add `public.maintenance_service_categories.records_findings boolean NOT NULL DEFAULT false`.
   - Set it to true where `code IN ('inspection_diagnostic_fee', 'leak_inspection', 'exhaust_inspection', 'hv_insulation_inspection', 'ev_charging_port_cleaning')`.
   - Add a `COMMENT` saying: "Job is an inspection: Log service shows 'What the inspection found'."

2. **New columns on `public.maintenance_work_order_lines`**, each with a `COMMENT`:
   - `from_found_line_id uuid NULL REFERENCES public.maintenance_work_order_lines(id) ON DELETE RESTRICT`: on a job that was done, this points to the found job it closes.
   - `closed_at timestamptz NULL`
   - `closed_reason text NULL CHECK (closed_reason IN ('not_needed', 'service_deleted'))`
   - `closed_by uuid NULL`
   - CHECK `closed_at IS NULL OR recommended = true` (only found jobs can be closed).
   - CHECK `(closed_at IS NULL) = (closed_reason IS NULL)`.
   - CHECK `from_found_line_id IS NULL OR recommended = false` (a found job can't close another found job).
   - CHECK `from_found_line_id IS DISTINCT FROM id`.
   - Partial unique index on `(from_found_line_id) WHERE from_found_line_id IS NOT NULL AND voided_at IS NULL`. A found job can be closed by one live job only.
   - Index `(work_order_id) WHERE recommended = true AND voided_at IS NULL`.

3. **Helper `public.maintenance_found_line_is_open(p_line_id uuid) RETURNS boolean`** (STABLE). It returns true only when **all** of these hold, exactly as audit section 3 defines "open":
   - The line has `recommended = true`, `declined = false`, `closed_at IS NULL` and `voided_at IS NULL`.
   - Its work order has `status = 'completed'` and `voided_at IS NULL`.
   - No other line with `voided_at IS NULL`, on a work order with `voided_at IS NULL`, has `from_found_line_id = p_line_id`.

4. **Link guard trigger** `fleet.trg_found_line_link_guard`, BEFORE INSERT OR UPDATE OF `from_found_line_id` on `maintenance_work_order_lines`. It runs only when `NEW.from_found_line_id IS NOT NULL` and the value changed.
   - The target must be open (use the helper). Otherwise `RAISE EXCEPTION 'found_line_not_open' USING HINT = 'This found job is already closed or no longer exists.'`
   - The target's work order must have the same `organization_id` and `vehicle_id` as `NEW`'s work order. Otherwise `RAISE EXCEPTION 'found_line_wrong_car' USING HINT = 'That found job belongs to a different car.'`

5. **New version of `public.fleet_save_work_order`.** Copy the **latest** body, from `supabase/migrations/20261115214317_powertrain_job_fit.sql` line 755 on, and keep everything else exactly as it is. Change only these things:
   - **IF-1:** when a line has `recommended = true`:
     - it is saved with `line_total = 0` and `material`, `labor_amount`, `unit_price` and `labor_rate` all NULL, whatever was sent;
     - items on it are refused with `RAISE EXCEPTION 'line_items_on_found_job' USING HINT = 'Jobs not done yet cannot include items.'`, the same way declined lines refuse items today.
   - The work order total (`v_line_sum`, around line 1236) adds only lines with `recommended = false`.
   - Read `fromFoundLineId` from each line (`v_line ->> 'fromFoundLineId'`, NULL when missing or blank) and save it into `from_found_line_id` on both insert and update. The guard in step 4 does the checking.
   - Keep the same signature, return shape, error codes and grants. Copy the `REVOKE` / `GRANT` lines from the same file (around line 1279).

6. **IF-10: finished-service lock.** Make a new version of `fleet.guard_completed_maintenance_wo_line()`; its latest body is in `supabase/migrations/20261109213835_void_single_service_line.sql`. Keep everything it allows today, and add one more allowed UPDATE on a completed, not-voided service. All of these must hold:
   - `OLD.recommended = true`
   - `OLD.declined = false`, `NEW.declined = true`
   - `OLD.closed_at IS NULL`, `NEW.closed_at IS NOT NULL`, `NEW.closed_reason IS NOT NULL`
   - nothing else changes: `(to_jsonb(NEW) - ARRAY['declined','closed_at','closed_reason','closed_by','updated_at','updated_by']) = (to_jsonb(OLD) - same list)`

   Anything else still raises `'completed work order lines cannot be edited'`.

7. **IF-7: deleting a service closes its open found jobs.** Add an AFTER UPDATE OF `voided_at` trigger on `public.maintenance_work_orders`, firing when `OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL`. For that work order's lines with `recommended = true`, `declined = false`, `closed_at IS NULL` and `voided_at IS NULL`, it sets:
   - `closed_at = now()`
   - `closed_reason = 'service_deleted'`
   - `declined = true`

   Make sure the line guard (step 6) doesn't block this: the work order is already voided at that point, so the guard lets it through. Check that this really happens. Found jobs that were already done stay as they are.

8. **`public.fleet_open_found_work(p_organization_id text, p_vehicle_id text DEFAULT NULL) RETURNS jsonb`** (STABLE, SECURITY DEFINER, `SET search_path = public, pg_temp`). It returns a JSON array of the open found jobs (use the helper), oldest first. Each item has:
   - `lineId`, `workOrderId`, `vehicleId`
   - `jobId` (`component_id`), `jobName` (`component_name`), `systemName`
   - `note` (`notes`)
   - `foundDate` (the work order's `performed_at_date`; when that's NULL, the date part of `opened_at`)
   - `daysWaiting` (whole days from `foundDate` to `current_date`, never below 0)
   - `garage` (the work order's `provider`)
   - `inspectionJobName`: the `component_name` of the first live line on the same work order whose job has `records_findings = true`, else NULL.

   `p_vehicle_id` NULL means all cars in the company. Always filter by `organization_id = p_organization_id`.

9. **`public.fleet_found_work_counts(p_organization_id text) RETURNS jsonb`** (same settings). It returns `{ "total": n, "cars": n, "oldestDays": n|null, "byVehicle": { "<vehicleId>": n, … } }`, counting open found jobs only.

10. **`public.fleet_close_found_work(p_organization_id text, p_actor_id uuid, p_line_id uuid) RETURNS jsonb`** (VOLATILE, SECURITY DEFINER, same search_path).
    - It locks the line (`FOR UPDATE`).
    - The line must belong to the company. Otherwise `RAISE EXCEPTION 'found_line_not_found'`.
    - The line must be open. Otherwise `RAISE EXCEPTION 'found_line_not_open' USING HINT = 'Someone else already closed this job.'`
    - It sets `declined = true`, `closed_at = now()`, `closed_reason = 'not_needed'`, `closed_by = p_actor_id` and `updated_at = now()`.
    - It returns `{ lineId, workOrderId, vehicleId, closedAt }`.
    - `p_actor_id` NULL raises `'actor_required'`.

11. **Grants for steps 8–10:** `REVOKE ALL … FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE … TO service_role`, the same as `fleet_save_work_order`. `node scripts/assert-public-fn-revoke-anon.mjs` must pass.

12. **Errors:** every business error is `RAISE EXCEPTION '<code>' USING HINT = '<plain sentence>'` with exactly the codes above.

### 2. Two SQL test files
Follow the pattern of `supabase/tests/service_items_checks.sql` and `supabase/tests/service_items_save_db_test.sql`.

- **`supabase/tests/inspection_findings_checks.sql`**: invariant counts that must be 0, each in a `DO $$ … RAISE EXCEPTION … $$` block:
  - found jobs (`recommended = true`, not voided) with `line_total <> 0` or with items;
  - lines whose `from_found_line_id` points at a line that isn't `recommended`, or at a line on a different car or company;
  - two live lines pointing at the same found job;
  - closed lines with `recommended = false`;
  - work orders whose `total_cost` doesn't equal the sum of their live non-found lines minus the discount.

- **`supabase/tests/inspection_findings_db_test.sql`**: behaviour, inside `BEGIN … ROLLBACK`, using made-up company, car and names that can never match real data.
  - Make one inspection service by calling `fleet_save_work_order` with the **same JSON shape the server sends**: every line key present, with JSON nulls where empty. Copy the shape from an existing save test, not hand-made short JSON. It has:
    - the inspection job J$8,000;
    - "Wiper Blades", done (J$1,500 + an item J$1,800);
    - "Brake rotor", `recommended = true`, sent with a cost of 5000 (it must be saved as 0);
    - "Shock absorber", `recommended = true`.
  - Mark the work order completed the same way the existing completion tests do (`fleet_claim_completion` / `fleet_finish_completion`, or whatever `service_items_completion_db_test.sql` uses).
  - Each check below matches an audit gate in section 6. Catch each expected error by its code in `SQLERRM`, and `RAISE EXCEPTION` if the wrong thing happened.
    1. **Gate 1:** the work order total is **11300**, and Brake rotor's `line_total` is 0.
    2. **Gate 3:** sending an item on a recommended line fails with `line_items_on_found_job`.
    3. **Gate 12:** before completion, `fleet_open_found_work` returns nothing for the car. After completion it returns Brake rotor and Shock absorber, with `inspectionJobName` "Inspection / diagnostic fee" and the right `garage`. `fleet_found_work_counts` says total 2.
    4. **Gates 4 and 5:** a second service on the **same car** with a line that has `fromFoundLineId` = Brake rotor saves, and Brake rotor is no longer open. A third service pointing at Brake rotor fails with `found_line_not_open`. A service on a **different car** pointing at Shock absorber fails with `found_line_wrong_car`.
    5. **Gate 11:** void the second service (the one that did Brake rotor) → Brake rotor is open again.
    6. **Gate 10:** `fleet_close_found_work` on Shock absorber works on the finished service. It is no longer open, and `closed_reason = 'not_needed'` and `closed_by` are set. Calling it again fails with `found_line_not_open`. A plain update of the notes on that finished line still fails with `completed work order lines cannot be edited`.
    7. **Gate 7 (IF-8):** removing a found line from the finished inspection service through `fleet_save_work_order` fails, because the service is locked.
    8. **Gate 6 (IF-7):** a fourth inspection with one open found job, then void that service → the found job has `closed_reason = 'service_deleted'` and is not open.
    9. **Gate 8:** the Wiper Blades line is saved exactly as a normal job: `line_total` 3300, items saved.

  End with `RAISE NOTICE 'inspection_findings_db_test: ok';`.

### 3. CI
In `.github/workflows/parts-sql-checks.yml`:
- add both test files to the `paths` lists for both `pull_request` and `push`;
- add the two `docker cp … && docker exec … psql -v ON_ERROR_STOP=1 -f …` run lines right after the `service_items_save_db_test.sql` lines, in the same style.

## How to check your work (local only)
1. Docker Desktop must be open. Run `npx supabase db reset --no-seed` on the **local** database only. If it fails with `DbSetupError`, run it once more. It must finish with no error.
2. Run both new test files, **and** every existing maintenance SQL test, against the local database the way CI does. The existing tests are:
   - `service_items_checks`
   - `service_items_db_test`
   - `service_items_save_db_test`
   - `service_items_completion_db_test`
   - `service_items_part_source_db_test`
   - `maintenance_discount_checks`
   - `maintenance_discount_db_test`

   Use these commands:
   ```
   export MSYS_NO_PATHCONV=1
   docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/<f>.sql
   docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<f>.sql
   ```
   All of them must pass. The old ones prove nothing else changed.
3. Run `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs` and `pnpm check`. All must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit or push.
- Change only these files: the new migration, the two new test files and the workflow file.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173 and 5180–5183). If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL; I'll read the files.
