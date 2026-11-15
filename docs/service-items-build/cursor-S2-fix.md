# Give Cursor this — Service items, Round S2 fixes

Round S2 is built and its tests pass. The check found 4 problems. The first one breaks every Log service save. Fix only these. Don't change anything else.

The D2 migration `supabase/migrations/20261113171047_service_items_logging_core.sql` is not live, so edit it in place.

## Fix 1 — every save without wheel positions fails (Critical, proven on the local copy)
`mapApiLineToDb` sends `positions: null` for any line without wheel positions, which is most lines. In `fleet_save_work_order`, `v_line ? 'positions'` is true for a JSON null, and `jsonb_array_elements_text('null')` raises "cannot extract elements from a scalar". So `POST` and `PATCH /maintenance-work-orders` fail for almost every job, with the switch on or off. The same happens on a content edit without `lines`, because `loadWorkOrderLinesForRpc` sends the stored `positions` (usually NULL) back.

Fix in the function, on both the line INSERT and the line UPDATE:
- `positions`: when the key is present and `jsonb_typeof(...) = 'array'` → the array. When present and anything else (JSON null) → NULL. When missing → keep the old value (UPDATE) / NULL (INSERT).
- Treat a JSON `null` as SQL NULL for every jsonb value the function reads: `values_json`, `payload_json` and the line's `items` (`items` null → empty list). Today a JSON null is stored as the jsonb value `'null'`.

Test: in `supabase/tests/service_items_save_db_test.sql`, add a create and an update whose lines have **exactly the shape `prepareWorkOrderLines` returns**: every key present, with `positions`, `values_json`, `brand`, `part_number`, `part_id`, `supplier_part_offer_id`, `condition` and `notes` set to JSON null, plus `items: []`. Both must save. `positions` and `values_json` are SQL NULL afterwards. Add one line with `positions: ["FL","FR"]` that saves as an array.

## Fix 2 — editing a finished log gives the wrong error
`PATCH /maintenance-work-orders/:id` content edit: when the stored status is `completed`, the route sets `saveStatus` to `completed` and returns 400 `status_invalid` before the database is called. Audit test 28 needs 409 `immutable`.

Fix: right after loading `existing`, on the content-edit path, if `existing.voided_at` is set or `existing.status` is not `draft` / `in_progress` → 409 `{ code: "immutable", error: "Completed services can't be changed — void it and log again." }`.

## Fix 3 — an edit that also sets the status is refused as "mixed"
`isMixedPatchBody` counts `status` as a board-only key, so a content edit that sends `status: "in_progress"` gets 400 "Save the job details and the status separately." The spec allows a content edit to carry `status` `draft` / `in_progress`.

Fix: `status` is a board key only when the body has no content keys. A body is mixed only when it has content keys **and** any of `priority`, `vendorId` / `vendor_id`, `source`, `cancelReason` / `cancel_reason`. Update the Deno tests for content + status (allowed), content + vendor (mixed) and status only (board).

## Fix 4 — a suggested item isn't checked against its link
In `prepareWorkOrderLines`, a `suggested` item only checks that its link's `job_id` matches the line's job, and it skips even that when the line has no job. So a request can send the link for "Throttle body cleaner" with a different `supplyId`, and it saves as "suggested" under the wrong link.

Fix:
- the link's `part_type_id` / `supply_id` must equal the item's `partTypeId` / `supplyId`, else 400 `line_item_link_mismatch`;
- a line with no job can't have `suggested` items → 400 `line_item_link_wrong_job`.

Deno tests for both.

## Then (local only)
1. `npx supabase db reset --no-seed` (if `DbSetupError` while starting, run it once more). Run the 6 SQL tests the way CI does: `service_items_checks`, `service_items_db_test`, `service_items_save_db_test`, `maintenance_discount_checks`, `maintenance_discount_db_test`, `engine_sections_used_ids_test`.
2. `deno test --no-check --allow-read --allow-env` on `service_items_*.test.ts`, every `maintenance_*.test.ts` and `parts_finder.test.ts`.
3. `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs`, `pnpm check`.
4. Rebuild `supabase/functions/fleet-ops/index.ts` with `node scripts/build-edge-bundle.mjs fleet-ops`.

## Rules
- Never touch the live database, `.env.local` or any login / permission code. No git branch, commit or push.
- Change only: the D2 migration, `service_items_save.ts`, `maintenance_routes.ts`, `service_items_save_db_test.sql`, `service_items_save.test.ts`, and the rebuilt `fleet-ops/index.ts`.
- Before you finish, stop any server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
- Report: clickable links to changed files + pass / fail of each check. Don't paste file contents.
