# Give Cursor this — Service items, Round S3 fixes

Round S3 is built. The check found 5 problems. Fix only these. Don't change anything else.

## Fix 1 — `/complete` can overwrite another fleet's service record (High)
`upsertServiceRecord` in `supabase/functions/_fleet-server/maintenance_completion.ts` takes `recordId` from the request body. If a record with that id exists, it updates it. It never checks that the record belongs to this fleet, or that another log isn't already using it. `/complete` is a normal signed-in route, so a request with another fleet's record id overwrites that record. `legacyCompleteRecordId` in `maintenance_routes.ts` has the same gap.

Fix: use the `recordId` hint only when the record has `organization_id = orgId`, `vehicle_id` = this work order's vehicle, and `work_order_id` either NULL or this work order. Otherwise ignore the hint and insert a new record with a new id. Apply the same filter in `legacyCompleteRecordId`.

Deno tests:
- a hint pointing at another fleet's record → a new record is inserted, and the other record isn't updated;
- a hint pointing at a record linked to another work order → a new record is inserted;
- a hint pointing at this fleet's record-only log → that record is reused.

## Fix 2 — finished records lose their id in history (High)
In the update paths (found by `work_order_id`, found by hint), `payload_json` is built with `id: undefined`, so the stored payload has no `id`. `GET /maintenance-logs/:vehicleId` returns `payload_json` as the log, so that log comes back with no id. Fleet can't open or edit it, and a retried completion always takes the update path.

Fix: in all three paths, `payload_json.id` = the record's id. Deno test: the update path writes `payload_json.id` equal to the record id.

## Fix 3 — completion reads the lines before it holds the claim (Medium)
The route loads the work order and lines, then `runCompletion` claims. A save that lands in between leaves the record cost, history rows and parts usage built from old lines, while `fleet_finish_completion` totals the new ones.

Fix: after a successful claim, `runCompletion` re-reads the work order and its lines and uses those for every step. Keep the route's discount check, and run it again on the re-read lines (too large → release the claim, then return the same response as today). Deno test: the steps receive the re-read lines, not the ones passed in.

## Fix 4 — history retry skips the schedule update (Low)
In `recordCompletedServiceLines` (`maintenance_service_ledger_core.ts`), a `23505` on the position insert does `continue`, which also skips `upsertComponentScheduleRow` for that position. If a first run inserted the history row and then failed in the schedule update, the retry never updates the schedule.

Fix: on `23505`, don't count the row, but still run the schedule upsert. Update the existing test to check that the upsert runs after a `23505`.

## Fix 5 — tests
- `maintenance_discount.test.ts` "CR-02" fails. It searches the source for `discountTooLarge(editLines, storedDiscount)`, and the legacy edit now calls `discountTooLarge(prepared.lines, storedDiscount)`. Update the pattern so it checks the new call. The guard itself is still there. Don't change the guard to fit the test.
- `upsertServiceRecord` ignores the error from its two `maybeSingle` reads. Throw it.

## Then (local only)
1. `npx supabase db reset --no-seed` (if `DbSetupError` while starting, run it once more). Run **all 7** SQL tests the way CI does: `service_items_checks`, `service_items_db_test`, `service_items_save_db_test`, `service_items_completion_db_test`, `maintenance_discount_checks`, `maintenance_discount_db_test`, `engine_sections_used_ids_test`.
2. `deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/parts_finder.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts`. That is the full set, and all must pass.
3. `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs`, `pnpm check`. Rebuild `fleet-ops/index.ts` with `node scripts/build-edge-bundle.mjs fleet-ops`.

## Rules
- Never touch the live database, `.env.local` or any login / permission code. **Don't stop or start anything on ports 3000, 3001 or 5173.** No git branch, commit or push.
- Change only: `maintenance_completion.ts`, `maintenance_routes.ts`, `maintenance_service_ledger_core.ts`, their test files, `maintenance_discount.test.ts`, and the rebuilt `fleet-ops/index.ts`.
- Report: clickable links to changed files + pass / fail of each check (the full lists above). Don't paste file contents.
