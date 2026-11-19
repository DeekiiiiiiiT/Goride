# Give Cursor this — Log service parts gaps, Slice C, Round C-Data

You are building **Slice C, Data layer only** of `docs/log-service-parts-gaps-audit.md` (Rev 5.1). Read these parts first; they are the spec:
- the status block at the top and section 0
- section 6 (Slice C): LC-01 … LC-09, "Decision — where a planned job lives", the Rules and the done-tests C1–C7
- section 2 (gates); gates 3, 6 and 7 apply here

Slices A and B are live. Do **not** build the server routes (planning, the parts panel read, the asked state, the bell, the Find parts place fix, Dominion's "Added — pick the part"), any TypeScript, or any screen. Those are later rounds. Do not change any TypeScript in this round.

The working tree has many uncommitted changes. Keep them: never revert, reformat or stash anything.

## What to build

### 1. One new migration
Create it with `npx supabase migration new log_service_parts_that_fit`. That gives it the real current UTC time; never pick or edit the date yourself. Shipped migration files are never edited. In this order:

**1a. A work order can be `planned` (LC-05).** On `public.maintenance_work_orders`:
- drop `maintenance_work_orders_status_check` and add it back with `'planned'` added to today's list (read the live list from the newest migration that touches it; the baseline has `draft, in_progress, completed, cancelled`, keep every value that exists now);
- `COMMENT ON COLUMN … status`: add "planned = a job the fleet plans to do (bought part first); holds one not-done-yet line, J$ 0; never finished, booked or counted as spend".
- `fleet_claim_completion` already refuses anything but `in_progress` (`not_claimable`); do not change it. Prove it in the checks.

**1b. Planned jobs count as open found work.** `CREATE OR REPLACE public.maintenance_found_line_is_open(p_line_id uuid)` (today in `20261118004433_inspection_findings.sql:65-94`): identical, except the found line's **own** work order may be `status IN ('completed', 'planned')`. The "done by a child" part stays exactly as it is (the child service must be `completed`). Keep its grants.

**1c. The found-work list carries the part and where it came from.** `CREATE OR REPLACE public.fleet_open_found_work(p_organization_id text, p_vehicle_id text DEFAULT NULL)` (today in `20261118185817_found_work_positions.sql`): every key it returns today stays, with the same meaning and order. Add:
- `"source"`: `'planned'` when the line's work order is `planned`, else `'inspection'`;
- `"partId"`: `l.part_id`;
- `"partName"`, `"partBrand"`, `"partNumber"`: from `public.part_master` (`name`, `manufacturer`, `oem_part_number`) via `l.part_id`, NULL when there is no part.
- For a planned job, `"inspectionJobName"` is NULL and `"foundDate"` is the planned day (it already falls back to `opened_at`).
Keep its grants.

**1d. Plan a job: `public.fleet_plan_job(...) RETURNS jsonb`** (VOLATILE, SECURITY DEFINER, `SET search_path = public, pg_temp`). Parameters: `p_organization_id text, p_actor_id uuid, p_vehicle_id text, p_component_id uuid, p_positions text[], p_part_id uuid, p_note text, p_idempotency_key text`.
- The car must exist in `fleet.vehicles` with that `organization_id` → else `RAISE EXCEPTION 'vehicle_not_found'`.
- The job must exist in `public.maintenance_service_categories` and be active (`coalesce(status,'active') = 'active'`) → else `'job_not_found'`.
- Places: validate with `public.maintenance_position_codes_allowed(code, position_aware, position_scheme)` exactly as `fleet_save_work_order` does for a new line (`'unknown'` alone is fine; `'unknown'` with anything else, or a code the job doesn't allow → `RAISE EXCEPTION 'position_invalid'`). Store them distinct and sorted; an empty array is stored as NULL.
- Part: when `p_part_id` is given it must exist in `public.part_master` → else `'part_not_found'`. (Whether it fits the car is checked by the server, not here.)
- Note: trimmed, max 500 characters, blank → NULL.
- Same save twice: if a work order with this `(organization_id, idempotency_key)` exists, return it (`created: false`). Use the existing `idempotency_key` column and its index (`20261101030856_fleet_maintenance_logging.sql:37`).
- Already on the list: if the car already has an **open** found line (`maintenance_found_line_is_open`) for the same job with the same places (both sorted; NULL = none), return that one (`created: false, alreadyListed: true`) and change nothing.
- Otherwise insert, in one transaction:
  - a work order: that org and car, `status = 'planned'`, `opened_at = now()`, no performed date, no odometer, all money 0, `version = 1`, the idempotency key, the actor in whichever created-by / updated-by columns exist, `log_mode = 'quick_job'`. Read the table's NOT NULL columns and defaults first; never invent columns;
  - one line: the job's id, code and name (and its system id/code/name if the job has one), `action = 'replace'`, `recommended = true`, `declined = false`, `line_total = 0`, `items_amount = 0`, the places, `part_id`, `notes` = the note, `sort_order = 0`. No items.
- Return `{"workOrderId", "lineId", "created", "alreadyListed"}`.
- It talks to nothing outside the database. `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE … TO service_role`.

**1e. Parts messages can be shown and read (LC-08).** On `public.fleet_parts_notices` (`20261031171644_fleet_find_parts_r2.sql:94`):
- add `vehicle_catalog_id uuid NULL`, `maintenance_component_id uuid NULL`, `position_codes text[] NULL`, `read_at timestamptz NULL`, each with a `COMMENT`;
- index `(organization_id, created_at DESC) WHERE read_at IS NULL`;
- `public.fleet_parts_notices_mark_read(p_organization_id text, p_ids uuid[]) RETURNS integer`: sets `read_at = now()` on that org's unread rows in `p_ids` only; returns how many. SECURITY DEFINER, service_role only.
- The two existing writers (`promote_part_proposal` and the `not_found` path) keep writing as today; their rows simply have NULL car/job/places.

**1f. Answer an ask with a part added by hand (LC-09).** `public.catalog_resolve_request_group(p_group_key text, p_part_id uuid, p_actor_id uuid) RETURNS jsonb` (VOLATILE, SECURITY DEFINER):
- `p_part_id` must exist in `public.part_master` → else `RAISE EXCEPTION 'part_not_found'`.
- Lock and resolve every `add_part_info` request with `research_group_key = p_group_key` and `status IN ('open','in_progress')`: `status = 'resolved'`, `resolved_part_id = p_part_id`, `added_at = now()`, `resolution_note = coalesce(resolution_note, 'Added to catalog')` (the same columns `promote_part_proposal` sets; read it in `20261101163023_catalog_research_fixes_promote_claim.sql`).
- The open research job with `group_key = p_group_key` (states `queued, researching, checking, needs_review, auto_added`) → `state = 'added'`, `updated_at = now()`, plus one `catalog_research_log_event(job, 'added_by_hand', 'added', {"partId", "actorId"})` if that function's signature allows it (read it; skip the event if not).
- One notice per company that had a resolved request: `kind = 'catalog_added'`, `title = 'Part on file'`, `body` = `'<part type name> for your <make model year> is now on file.'` (the same wording promote uses), plus `vehicle_catalog_id`, `maintenance_component_id` and `position_codes` from that company's earliest resolved request in the group.
- Nothing open in the group → change nothing, return `{"resolved": 0}`. Otherwise `{"resolved": n, "companies": m, "jobId": …}`.
- service_role only.

### 2. Checks file: `supabase/tests/log_service_parts_that_fit_checks.sql`
One `BEGIN … ROLLBACK` script in the style of `supabase/tests/log_service_parts_outbox_checks.sql` (make its own test org, car, jobs and a `part_master` row; never use real data). It ends with `RAISE NOTICE 'log_service_parts_that_fit_checks: ok'`. Prove:
1. The status check accepts `planned` and still refuses an unknown status.
2. `fleet_plan_job` on a catalyst job with `{before_cat}` and a part → one `planned` work order, one line `recommended`, J$ 0, places `{before_cat}`, the part; `created = true`.
3. The same idempotency key again → same ids, `created = false`, still one work order.
4. A new key, same car, job and places → `alreadyListed = true`, nothing new.
5. `{LF}` on a catalyst job → `position_invalid`; `{unknown, before_cat}` → `position_invalid`; another org's car → `vehicle_not_found`; an unknown part id → `part_not_found`.
6. `fleet_open_found_work` returns the planned line with `source = 'planned'`, `partId`, `partName`, `partBrand`, `partNumber`, `positions = {before_cat}`; an inspection found line on a `completed` work order returns `source = 'inspection'` with every old key unchanged.
7. `fleet_claim_completion` on the planned work order → `not_claimable`.
8. A completed child service whose line has `from_found_line_id` = the planned line → `maintenance_found_line_is_open` is false and the planned job leaves the list.
9. `fleet_parts_notices_mark_read` marks only the given org's rows and returns the count; another org's id in the list is left unread.
10. `catalog_resolve_request_group`: two companies' open requests in one group → both `resolved` with the part, the open job `added`, exactly two notices (one per company) with car, job and places; calling it again → `{"resolved": 0}` and no new notices; an unknown part → `part_not_found`.
11. Grants: none of the new or changed functions is executable by `anon` or `authenticated`.

### 3. Prove it locally (local database only)
- `npx supabase db reset` (local), then run the checks file with `docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/log_service_parts_that_fit_checks.sql`.
- Also run, unchanged and still passing: `supabase/tests/log_service_positions_checks.sql`, `supabase/tests/log_service_parts_outbox_checks.sql`, `supabase/tests/inspection_findings_checks.sql`.
- `node scripts/validate-migration-sql.mjs` passes.

## Report back
Links only: the migration file, the checks file, and the output lines of the four checks files and the validator. Say plainly if anything failed.

Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183).
