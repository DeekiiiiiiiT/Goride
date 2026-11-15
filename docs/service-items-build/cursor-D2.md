# Give Cursor this — Service items, Round D2 (Data: logging core)

You are building **Round D2 only** of `docs/service-items-architecture-audit.md`. Read sections **1, 3 (3a–3e) and the integrity-report bullet in 4.3** first — they are the spec. Round D1 is already built (`supabase/migrations/20261113154942_service_items_catalogue.sql`); don't change it. No server (TypeScript) or screen code in this round.

## What to build

### 1. One new migration
Create it with `npx supabase migration new service_items_logging_core` (real current UTC time). Contents, in this order:

**a. Lines (3b, 3a)**
- `ALTER TABLE public.maintenance_work_order_lines ADD COLUMN items_amount numeric(12,2) NOT NULL DEFAULT 0;`
- `ALTER TABLE public.maintenance_work_order_lines ADD CONSTRAINT maintenance_work_order_lines_wo_id_key UNIQUE (work_order_id, id);`

**b. `public.maintenance_work_order_line_item`** exactly as audit 3a:
- columns as listed (incl. `work_order_id`, `work_order_line_id`, `updated_by uuid NULL`, `created_at`);
- `amount numeric(12,2) NOT NULL GENERATED ALWAYS AS (round(qty * coalesce(unit_cost, 0), 2)) STORED`;
- composite FK `(work_order_id, work_order_line_id)` → `maintenance_work_order_lines (work_order_id, id)` ON DELETE CASCADE; FKs `job_item_id` → `maintenance_job_item(id)`, `part_type_id` → `maintenance_service_categories(id)`, `supply_id` → `maintenance_supply(id)`, `part_id` → `part_master(id)`, all ON DELETE RESTRICT;
- CHECKs: `qty > 0`; `unit_cost IS NULL OR unit_cost >= 0`; `source IN ('suggested','other')`; `item_kind IN ('part_type','supply','other')`; `(source = 'other') = (item_kind = 'other')`; the id matching `item_kind` is set and the other two are NULL (`other` has neither); `(job_item_id IS NOT NULL) = (source = 'suggested')`; `part_id IS NULL OR item_kind = 'part_type'`; `part_number IS NULL OR item_kind = 'part_type'`;
- BEFORE INSERT OR UPDATE trigger: when `part_id` is set, `part_master.maintenance_component_id` must equal `part_type_id` (NULL fails) → **`line_item_part_mismatch`**;
- indexes on `work_order_id`, `work_order_line_id`, and `job_item_id` / `part_type_id` / `supply_id` (each `WHERE … IS NOT NULL`);
- RLS on; policy `mwoli_no_direct` for `authenticated` `USING (false) WITH CHECK (false)`, same as the line table; `GRANT ALL … TO service_role`; revoke from `anon`, `authenticated`;
- audit trigger `trg_mwoli_audit` AFTER INSERT OR UPDATE OR DELETE → `fleet.maintenance_audit_log_trigger_fn()`.

**c. Work orders (3c)**
- `ADD COLUMN version integer NOT NULL DEFAULT 1`, `ADD COLUMN completing_since timestamptz NULL`.
- **Combined guard trigger.** Create `fleet.guard_maintenance_wo()` and trigger `trg_mwo_guard` (BEFORE UPDATE OR DELETE). Then drop `trg_mwo_immutable`. The function must:
  1. keep **every rule** of the current `fleet.guard_completed_maintenance_wo()` (latest definition in `supabase/migrations/20261111163445_maintenance_service_discount.sql`) exactly — the `fleet.legacy_repair` bypass, the void path, the discount / total path and the delete refusal — **with one change:** add `'version'` and `'completing_since'` to the list of keys removed in the `to_jsonb(NEW) - ARRAY[…]` comparison;
  2. only after those checks pass, on `UPDATE`: `NEW.version := OLD.version + 1; NEW.updated_at := now();`
  3. `RETURN COALESCE(NEW, OLD)`.
  Leave the old function in place (unused) or drop it — your choice, but nothing may still call it.

**d. Audit actor (3c "Audit actor")** — `CREATE OR REPLACE FUNCTION fleet.maintenance_audit_log_trigger_fn()` starting from its latest definition (`supabase/migrations/20261102132407_maintenance_audit_log_line_org.sql`), changing only the actor line to:
`v_actor := coalesce(nullif(current_setting('app.actor_id', true), '')::uuid, nullif(v_row ->> 'updated_by', '')::uuid, nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);`
The fleet lookup through `work_order_id` already works for item rows because they carry `work_order_id`.

**e. Service records (3e)**
- `ALTER TABLE public.maintenance_records ADD COLUMN work_order_id uuid NULL;` + partial unique index `WHERE work_order_id IS NOT NULL`.
- Backfill: first from `maintenance_work_orders.maintenance_record_id`, then from `payload_json->>'workOrderId'` where still NULL (only when it's a valid uuid of an existing work order). Before writing, if any conflict exists (one work order would get two records, or one record two work orders), `RAISE NOTICE` each and `RAISE EXCEPTION 'records_backfill_conflict'`. (The live database has none — Round 0 checked.)

**f. Service ledger (3d)**
- `ALTER TABLE public.maintenance_service_ledger ADD CONSTRAINT maintenance_service_ledger_position_not_blank CHECK (position IS NULL OR position <> '');`
- Before the index: count live duplicates on `(work_order_line_id, coalesce(position,''))` where `work_order_line_id IS NOT NULL AND voided_at IS NULL`; if any, `RAISE NOTICE` each and `RAISE EXCEPTION 'ledger_duplicates_found'`.
- `CREATE UNIQUE INDEX maintenance_service_ledger_line_position_live ON public.maintenance_service_ledger (work_order_line_id, coalesce(position, '')) WHERE work_order_line_id IS NOT NULL AND voided_at IS NULL;`

**g. Functions** — all `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO service_role`. Every business error is `RAISE EXCEPTION '<code>' USING HINT = '…'` with exactly the codes below.
- **`public.fleet_save_work_order(p_organization_id text, p_actor_id uuid, p_status text, p_work_order jsonb, p_work_order_id uuid, p_expected_version integer, p_lines jsonb) RETURNS jsonb`** — build it exactly from audit **3c: the work-order column table and steps (1)–(7)**. Codes: `actor_required`, `version_on_create`, `version_required`, `status_invalid`, `work_order_id_taken`, `work_order_not_found`, `work_order_org_mismatch`, `completion_in_progress` (`completing_since` within the last 10 minutes), `stale_edit`, `line_work_order_mismatch`, `line_items_on_declined`, `line_items_amount_mismatch`. Points that are easy to miss:
  - `set_config('app.actor_id', p_actor_id::text, true)` first;
  - update path uses `SELECT … FOR UPDATE` before the checks;
  - only the allow-listed keys are read from `p_work_order`; `organization_id`, `status`, `updated_by`, `opened_at` are set by the function;
  - lines: `id` present ⇔ existing line of this work order; update with `WHERE id = … AND work_order_id = … AND voided_at IS NULL`; 0 rows → skip if that id is a voided line of this work order, otherwise `line_work_order_mismatch`; lines not in `p_lines` are deleted **only if not voided**; `voided_at` is never written; each line's `work_order_id` comes from the work order, never the request; `updated_by = p_actor_id`; `updated_at = now()` on updates;
  - items: per non-voided line in `p_lines`; `work_order_id` / `work_order_line_id` from the line; multiset comparison on the 12 columns listed in 3c step (5) — equal means no writes;
  - `items_amount` check, then `total_cost = round(sum(line_total) FILTER (WHERE voided_at IS NULL) − coalesce(discount_amount, 0), 2)`;
  - returns the work order (with its new `version`), its lines and their items as jsonb.
- **`public.fleet_claim_completion(p_organization_id text, p_work_order_id uuid, p_actor_id uuid) RETURNS jsonb`** — audit 4.3 step 0: sets `app.actor_id`; one conditional `UPDATE … SET completing_since = now(), updated_by = p_actor_id WHERE id = … AND organization_id = … AND status = 'in_progress' AND (completing_since IS NULL OR completing_since < now() - interval '10 minutes') RETURNING …`. If no row: return `{"claimed": false, "reason": "completed"}` when the log is completed, `"in_progress_elsewhere"` when it's claimed, `"not_found"` when it doesn't exist under this fleet, otherwise `"not_claimable"` with the status. If claimed: `{"claimed": true, "version": …}`.
- **`public.fleet_finish_completion(p_organization_id text, p_work_order_id uuid, p_actor_id uuid, p_record_id uuid) RETURNS jsonb`** — audit 4.3 step 9: sets `app.actor_id`; in one `UPDATE … WHERE id = … AND organization_id = … AND status = 'in_progress' AND completing_since IS NOT NULL`: `status = 'completed'`, `closed_at = now()`, `total_cost` (same formula as above), `maintenance_record_id = p_record_id`, `updated_by = p_actor_id`, `completing_since = NULL`. 0 rows → `completion_not_claimed`. Returns the work order.
- **`public.fleet_release_completion(p_organization_id text, p_work_order_id uuid)`** — clears `completing_since` for an `in_progress` log of this fleet (used when a completion step fails). Safe to call twice.

**h. Integrity report (4.3, last bullet)** — `CREATE OR REPLACE FUNCTION fleet.maintenance_integrity_report(p_organization_id text DEFAULT NULL)` starting from its latest definition (`supabase/migrations/20261101190300_fleet_maintenance_enterprise_release34.sql`), keeping both existing arms, and adding `UNION ALL` arms: `completion_stuck`, `completion_never_started`, `completed_without_record`, `completed_missing_service_ledger`, `completed_missing_finance_entry`, `line_items_amount_drift`, `total_cost_drift` — each with `detail` jsonb holding `work_order_id`, `vehicle_id` and the relevant times or amounts, filtered by `p_organization_id` when given. For `completed_missing_finance_entry`, find the canonical ledger table that stores idempotency keys like `maintenance_record:{id}|maintenance` (search `packages/finance-core/src/canonicalMaintenanceLedger.ts` and the migrations) and check against it; say in your report which table you used.

### 2. Tests (pattern: D1's two files)
- **Extend `supabase/tests/service_items_checks.sql`** with invariant counts that must be 0: item rows whose `work_order_id` differs from their line's; lines where `items_amount <> coalesce(sum(item amount), 0)`; items on declined lines; items with `part_id` whose part type differs; ledger live duplicates per line + position; ledger rows with `position = ''`; work orders linked to 2+ records via `maintenance_records.work_order_id`.
- **New `supabase/tests/service_items_save_db_test.sql`** — inside `BEGIN … ROLLBACK`, made-up organization / vehicle ids that can never be real (e.g. `si-d2-test-org`). Prove audit section 6 done-tests **4, 5, 6, 8, 9, 10, 11, 12, 13, 14** (14 as two sequential calls with the same version: first saves, second → `stale_edit`), plus:
  - the money cases in test 4 (`2 × 600.50 = 1201.00`, `1.5 × 0.33 = 0.50`, `0.005 × 1.00 = 0.01`, `0.015 × 1.00 = 0.02`, `1.005 × 2.00 = 2.01`, `1.005 × NULL = 0.00`);
  - claim → finish works; claim on a claimed log returns `in_progress_elsewhere`; a claim older than 10 minutes (set `completing_since` back by 11 minutes) can be taken; `fleet_finish_completion` without a claim → `completion_not_claimed`; `fleet_save_work_order` update on a claimed log → `completion_in_progress`;
  - after `fleet_save_work_order`, audit rows for the work order, its lines and its items exist with `actor_id` = the test actor, including the delete rows when an item set changes (test 12);
  - a refused completed-log edit leaves `version` and `updated_at` unchanged; a void-style update of a completed log is still allowed and bumps `version`;
  - each new integrity-report arm returns a row for a planted bad case and none for the clean fixture.
  Catch each expected error by its code (`SQLERRM`). End with `RAISE NOTICE 'service_items_save_db_test: ok';`.
- **CI:** add the new migration and test file to both `paths` lists in `.github/workflows/parts-sql-checks.yml` and a `docker cp` + `psql -v ON_ERROR_STOP=1 -f` line right after the D1 test lines.

## How to check your work (local only)
1. Docker Desktop open. `npx supabase db reset` on the **local** database — must finish with no error.
2. Run `service_items_checks.sql`, `service_items_db_test.sql`, `service_items_save_db_test.sql`, and the existing `maintenance_discount_checks.sql`, `maintenance_discount_db_test.sql`, `engine_sections_used_ids_test.sql` the way CI does. All must pass (the discount ones prove the combined guard trigger kept today's rules).
3. `node scripts/validate-migration-sql.mjs` and `pnpm check` — both pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- No git branch, commit or push.
- Change only: the new migration, `service_items_checks.sql`, the new test file, and `parts-sql-checks.yml`.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183). Leave the local Supabase database as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL — I'll read the files.
