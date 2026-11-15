# Give Cursor this — Service items, Round S3 (Server: safe completion + older log routes)

You are building **Round S3 only** of `docs/service-items-architecture-audit.md`. Read **sections 1, 4.2 (the "Changed 13 Nov" note) and 4.3** first. D1, S1, D2 and S2 are built. The database already has `fleet_claim_completion`, `fleet_finish_completion`, `fleet_release_completion`, the ledger dedupe index, `maintenance_records.work_order_id` and the integrity arms (`20261113171047_service_items_logging_core.sql`). S2 built `prepareWorkOrderLines` / `callSaveWorkOrder` (`supabase/functions/_fleet-server/service_items_save.ts`). No screen code in this round.

**Goal:** a log is marked completed only after every completion step has worked. If any step fails, the log stays `in_progress`, nothing is doubled, and running `/complete` again finishes it.

## What to build

### 1. New migration
Create it with `npx supabase migration new service_items_completion` (real current UTC time).
- **`fleet.log_service_finalize`:** today every call inserts a new `service.logged` row into `fleet.maintenance_events`, so a retry adds a duplicate. `CREATE OR REPLACE` it from its definition in `20261101032831_fleet_log_service.sql`, keeping the schedule recompute. Insert the event only when no `service.logged` event exists with the same `payload->>'workOrderId'` and `payload->>'recordId'`. Keep its grants.
- In the D2 migration (not live, edit in place), the integrity arm `completed_missing_service_ledger` wrongly skips position-aware lines with no positions. `recordCompletedServiceLines` **does** write a history row for those (`position: null`, "position_aware_without_positions"). Keep only the declined and no-job skips. Fix the matching test in `service_items_save_db_test.sql`.

### 2. Completion as one runner — `supabase/functions/_fleet-server/maintenance_completion.ts` (new)
`runCompletion(deps, input)` with the steps passed in as functions, so tests can make any step fail. Order (audit 4.3):

| # | Step | Rule |
|---|---|---|
| 0 | `fleet_claim_completion` | `claimed` → go on. `reason: completed` → **replay**: 200 with the saved work order, lines + items, record, `idempotentReplay: true`, no writes. `in_progress_elsewhere` → 409 `completion_in_progress` "This service is still finishing saving. Try again in a moment." `not_found` → 404. `not_claimable` → 409 `{ code: "not_claimable", error: "Save this service as in progress before finishing it." }` |
| 1 | Parts usage (`commitPartsUsage`) | Already one row per line (`ON CONFLICT (line_id)`), so a re-run applies nothing twice |
| 2 | Service record | Find by `maintenance_records.work_order_id`, else by the `recordId` passed in (then set its `work_order_id`), else insert with `work_order_id` and with `recordId` as its id when given. Write the same columns and `payload_json` as today (plus `payloadExtra`, see 4). The id never changes on a retry |
| 3 | `refresh_repeat_part_alerts` | Check its error |
| 4 | `recordCompletedServiceLines` | A unique violation (`23505`) on the ledger insert is a skip. Any **other** insert error is thrown (today every error is swallowed by `if (!ledErr)`). Make that change in `maintenance_service_ledger_core.ts` |
| 5 | `maybeAdvancePackageSchedule` | as today |
| 6 | Business Finance | `appendCanonicalMaintenanceIfEligible` reports `posted: true` even when the append failed, because `appendCanonicalLedgerEvents` catches errors and returns `{ success, failed }`, which is never read. Make it return `failed: true` when `success === false` or `failed > 0` (an already-seen key counts as success). In the runner, a finance failure **stops completion** |
| 7 | `projectFromMaintenanceLog` | keyed on the record id |
| 8 | `fleet_log_service` | deduped by the migration above |
| 9 | `fleet_finish_completion` | with the record id. Its result is the response |

- On a failure at 1–8: call `fleet_release_completion`, log the step name, and return 500 `{ code: "completion_failed", step, error }`. The log stays `in_progress`. Nothing is deleted.
- **Delete** `reverseAndDeleteWorkOrder`, `commitUsageOrDiscardNewWorkOrder`'s delete branch (keep a plain usage call) and `ledgerAllowedAfterParts` if nothing else uses it. After this round no code deletes a work order.

### 3. `POST /maintenance-work-orders/:id/complete`
Rebuild on `runCompletion`. Read everything from the **saved** work order and lines. The body is used only for `recordId`, `type` and `payloadExtra` (internal callers). Drop today's body overrides for date, odometer, provider, notes and invoice. Callers save those first; no screen calls `/complete` directly today. Keep the odometer-required check, the discount-too-large check, the odometer anomaly check and today's response fields (`item`, `record`, `warrantyPrompts`, `stockWarnings`, `ledgerPosted`, `ledgerWarning`, `odometerAnomaly`, `anomalyReason`, `neighbors`, `finalize`). Actor = `rbacUserId(c)`; none → 401 `actor_required`. The `POST /maintenance-work-orders` replay and `completeNow` paths keep calling it.

### 4. Older log routes on the new save
**`POST /maintenance-logs`** (Fleet, Fleet Admin, Driver app):
- Optional `idempotencyKey`: same replay rules as `POST /maintenance-work-orders` (completed → replay, in progress → `/complete`, key race → replay).
- **With lines:** `prepareWorkOrderLines` + `callSaveWorkOrder` with status `in_progress` when the log's status is Completed, otherwise `draft`. Then:
  - **Completed:** call `/complete` internally with `recordId` = the client's `log.id` (when it's a uuid not already used by a record), `type` and `payloadExtra` = the client log without `lines`, `cost`, `status`, `id`, `vehicleId`. `/complete` creates the record.
  - **Not completed:** insert the record as today, with `work_order_id` set.
  - Return today's response shape (`success`, `data` = the record, `workOrderId`, `lines`, `warrantyPrompts`, `stockWarnings`, `ledgerPosted`, `ledgerWarning`), built from the save + `/complete` results. A completion failure returns its 500 / 409 body.
- **Without lines:** keep today's record-only path, but use the fixed finance result from step 2.6.

**`PATCH /maintenance-logs/:vehicleId/:id`:**
- Keep today's refusals (completed → 409 `immutable`, the discount-locked rule).
- Find the work order by `maintenance_records.work_order_id`, else `payload_json.workOrderId`.
- When it has lines or a work order: `expectedVersion` is required (428 `version_required`). History already returns `version` per log since S2; the Fleet and Fleet Admin clients send it in UI2. Save through `prepareWorkOrderLines` + `callSaveWorkOrder` (create a work order if none yet, then set the record's `work_order_id`). Status is `in_progress` if the new status is Completed, else `draft`. Update the record row as today for non-completed. When it becomes Completed, call `/complete` internally with `recordId` = this record's id.
- Delete `syncWorkOrderLines` and the `leftCompleted` branch. A completed log can't reach this code, so the branch never runs.

### 5. Board-only status change to completed
`PATCH /maintenance-work-orders/:id` board path: `status: "completed"` → 409 `{ code: "use_complete", error: "Use Finish to complete this service." }`. Only `/complete` may complete a log (audit rule 7). The board screen only offers draft → open, so nothing in the app changes.

## Tests
- **Deno `supabase/functions/_fleet-server/maintenance_completion.test.ts` (new):** with stub steps:
  - make each of steps 1–8 fail in turn: release is called, finish isn't, and the response names the step (audit test 31);
  - after a failure, a second run with the same record id finishes, and step 2 is called with the same record id;
  - claim `completed` → replay with no step called (32);
  - `in_progress_elsewhere` → 409 (36);
  - `not_claimable` → 409;
  - finance `failed: true` stops before step 7.
- **Deno, extend existing tests:** `appendCanonicalMaintenanceIfEligible` returns `failed: true` when the append returns `{ success: false }`; `recordCompletedServiceLines` skips `23505` and throws other errors; board PATCH to `completed` → 409 `use_complete`; legacy POST builds the `/complete` call with the client id as `recordId`; legacy PATCH without `expectedVersion` → 428.
- **SQL `supabase/tests/service_items_completion_db_test.sql` (new, `BEGIN … ROLLBACK`):**
  - `fleet.log_service_finalize` twice with the same work order + record → one `service.logged` event (39);
  - `apply_parts_usage_for_work_order` twice → one usage row per line and stock adjusted once (35);
  - two ledger inserts for the same line + position → the second is refused by the unique index (40);
  - claim → release → claim again works; claim → finish → claim returns `completed`.
  End with `RAISE NOTICE 'service_items_completion_db_test: ok';`.
- **CI:** add the migration and the SQL test to both `paths` lists and the run steps in `.github/workflows/parts-sql-checks.yml`. Add the new Deno file to the "Deno test maintenance jobs + service items" step in `ci.yml`.
- **Repo search gate (audit 7):** excluding migrations and docs, `reverseAndDeleteWorkOrder` and `syncWorkOrderLines` find nothing, and `set_config('app.actor_id'` appears only in the D2 functions.

## Built bundle
Rebuild `supabase/functions/fleet-ops/index.ts` with `node scripts/build-edge-bundle.mjs fleet-ops`.

## How to check your work (local only)
1. `npx supabase db reset --no-seed` (if `DbSetupError` while starting, run it once more). Run the 7 SQL tests the way CI does: `service_items_checks`, `service_items_db_test`, `service_items_save_db_test`, `service_items_completion_db_test`, `maintenance_discount_checks`, `maintenance_discount_db_test`, `engine_sections_used_ids_test`.
2. `deno test --no-check --allow-read --allow-env` on `service_items_*.test.ts`, `maintenance_*.test.ts`, `parts_finder.test.ts` and any test file for `canonical_from_ops.ts`.
3. `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs`, `pnpm check`.

## Rules
- Never touch the live database, `.env.local` or any login / permission code. **Don't stop or start anything on ports 3000, 3001 or 5173** — those are the owner's apps. Stop only what you started.
- No git branch, commit or push.
- Change only: the new migration, the D2 migration (step 1 arm only), `maintenance_completion.ts` (new), `maintenance_routes.ts`, `maintenance_service_ledger_core.ts`, `canonical_from_ops.ts`, `service_items_save.ts` (only if a helper must move), the named test files, `ci.yml`, `parts-sql-checks.yml`, and the rebuilt `fleet-ops/index.ts`.
- Report: clickable links to changed files + pass / fail of each check. Don't paste file contents.
