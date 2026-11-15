# Give Cursor this — Service items, Round S2 (Server: Fleet work-order save with items)

You are building **Round S2 only** of `docs/service-items-architecture-audit.md`. Read **sections 1, 3a–3c and 4.2** first. Rounds D1, S1 and D2 are built. The database save function `public.fleet_save_work_order` exists (`supabase/migrations/20261113171047_service_items_logging_core.sql`). This round makes the server use it. No screen code in this round.

**Not in this round:** `POST /maintenance-logs` and `PATCH /maintenance-logs/:vehicleId/:id` (the older log routes) and `/maintenance-work-orders/:id/complete`. They move to Round S3. Leave them as they are, except for the shared `mapApiLineToDb` change in step 3.

## What to build

### 1. Two additions to the D2 migration (edit `20261113171047_service_items_logging_core.sql` in place; it is not live)
a. **`supplier_part_offer_id`.** The Log service form saves it on a line (`mapApiLineToDb`), but `fleet_save_work_order` ignores it, so a save drops it. Add it to the function's line INSERT and line UPDATE with the same rule as the other nullable columns: a key that is present is written as sent (`''` → NULL), a missing key keeps the old value.

b. **Record link repair.** The older create route inserts a log as `completed` and then tries to set `maintenance_work_orders.maintenance_record_id`. The finished-log guard refuses that, and the route never checks the error, so those logs have no record link. The D2 integrity arm `completed_without_record` would flag every one of them. After the records backfill in section (e), add a `DO` block that:
   - for each work order with `maintenance_record_id IS NULL` where a `maintenance_records` row has `work_order_id = wo.id`, sets `maintenance_record_id` to that record;
   - first `RAISE NOTICE` + `RAISE EXCEPTION 'record_link_conflict'` if that record id is already on another work order;
   - wraps the update in `PERFORM set_config('fleet.legacy_repair', 'on', true)` … `PERFORM set_config('fleet.legacy_repair', 'off', true)` so the guard allows it.

### 2. Shared line items code — `packages/types/src/serviceItems.ts` (new)
Pure TypeScript with no imports, used by the server now and by Fleet in UI2. The server imports it by relative path, the same way `catalog_api.ts` imports `../../../packages/types/src/partsResolution.ts`. Export it from `packages/types/src/index.ts`.
- Types: `ItemNeed`, `JobItem` (the Fleet shape in step 5a), `LineItemInput` (request), `LineItem` (stored / response).
- **`parseLineItems(raw: unknown, ctx: { declined: boolean }) → { ok: true, items: ParsedLineItem[], itemsAmountCenti: bigint, itemsAmount: string } | { ok: false, code, index? }`**, following audit 4.2:
  - request item: `{ source: 'suggested'|'other', jobItemId?, itemKind: 'part_type'|'supply'|'other', partTypeId?, supplyId?, partId?, itemName?, brand?, partNumber?, qty, unitCost? }`;
  - work from the **text** of each number (`String(value).trim()`), never float maths. `qty` must be > 0 with at most 3 decimals (`qty_precision`, else `qty_invalid`). `unitCost` is blank / null (= not recorded) or ≥ 0 with at most 2 decimals (`cost_precision`, else `cost_invalid`);
  - money in `BigInt`: `qty_milli × cost_centi`, then `amount_centi = (that + 500n) / 1000n`. Blank cost → 0. `itemsAmountCenti` = the sum; `itemsAmount` = that as a 2-decimal string;
  - the same shape rules as the table: `source = 'other'` ⇔ `itemKind = 'other'`; `jobItemId` required ⇔ `suggested`; exactly the id that matches the kind; `partId` and `partNumber` only on `part_type` (`part_number_not_allowed`); `other` needs `itemName` (trimmed, 1–120); brand ≤ 80 and part number ≤ 60 after trimming; declined with any item → `line_items_on_declined`; at most 30 items per line (`too_many_items`).
  - It must give exactly the D2 database amounts: `2 × 600.50 = 1201.00`; `1.5 × 0.33 = 0.50`; `0.005 × 1.00 = 0.01`; `0.015 × 1.00 = 0.02`; `1.005 × 2.00 = 2.01`; `1.005 × blank = 0.00`.

### 3. Line money — `computeWoLineTotal` (`supabase/functions/_fleet-server/maintenance_logging_helpers.ts`)
Add `items_amount` (`line.items_amount ?? line.itemsAmount ?? 0`) to the total after part + labour. Declined stays 0. `mapApiLineToDb` sets `items_amount` (default 0) **before** it computes `line_total`. With no items, every old total is unchanged (audit test 23).

### 4. Server save helper — `supabase/functions/_fleet-server/service_items_save.ts` (new)
- **`prepareWorkOrderLines(supabase, { orgId, vehicleId, workOrderId | null, rawLines, itemsEnabled })`** → `{ ok, lines }` or `{ ok: false, status, code, error }`:
  - each line → `mapApiLineToDb` (move it out of `maintenance_routes.ts` into this file or a helper so both can use it);
  - **line ids (audit 4.2):** on create, drop every client line id. On update, load this work order's line ids and keep a client id only if it's one of them. Drop non-uuid or unknown ids (new line). An id that belongs to **another** work order → 400 `line_work_order_mismatch`;
  - **items:** flag off and any line has items → 400 `service_items_off`. Otherwise run `parseLineItems`, then check against the database: a `suggested` item's `jobItemId` must be a `maintenance_job_item` whose `job_id` is the line's `component_id` (removed or retired links are accepted — audit test 30), else 400 `line_item_link_wrong_job`; `partTypeId` must be a `kind = 'component'`, `is_part = true` row; `supplyId` must exist; `partId` must be in `getCatalogParts` (`catalog_api.ts`) for this vehicle's catalog and `componentId = partTypeId`, else 400 `line_item_part_not_for_car`. When the part is chosen and brand / part number are blank, fill them from the part;
  - **snapshot:** the server sets `item_name` (part type name / supply name; the typed name for `other`) and `unit_label`. Supplies use their unit. Part types and Other items use the `piece` unit. `label_one` when qty is exactly 1, else `label_many`;
  - return lines in the snake_case shape `fleet_save_work_order` reads, each with `items` and `items_amount` (from `itemsAmount`) and `line_total` from `computeWoLineTotal`.
- **`callSaveWorkOrder(supabase, args)`** → calls the RPC and maps its named errors:

  | Code | HTTP | Message |
  |---|---|---|
  | `version_required` | 428 | "Reload this service and try again." |
  | `stale_edit` | 409 | "Someone else saved this service first. Reload to see their changes." |
  | `completion_in_progress` | 409 | "This service is still finishing saving. Try again in a moment." |
  | `work_order_not_found`, `work_order_org_mismatch` | 404 | "Not found" |
  | `immutable` | 409 | "Completed services can't be changed — void it and log again." |
  | `line_work_order_mismatch`, `line_items_on_declined`, `status_invalid` | 400 | plain message |
  | `work_order_id_taken` | 409 | plain message |
  | `actor_required` | 401 | "Sign in again." |
  | `line_items_amount_mismatch` | 500 | "Couldn't save the items. Try again." (a server bug, log it) |

  Responses are `{ code, error }`.
- Mapper for responses: `mapDbLineItemToApi` → `{ id, source, jobItemId, itemKind, partTypeId, supplyId, partId, itemName, unitLabel, brand, partNumber, qty, unitCost, amount }` (numbers as numbers, `unitCost` null when not recorded).

### 5. Routes (`supabase/functions/_fleet-server/maintenance_routes.ts`)
**a. Job list for Log service — `GET /maintenance-categories/systems/:systemId/sections`.** This is what the Fleet form uses, not quick-jobs. On every job (in `sections[].jobs` and `otherJobs`) add `items: JobItem[]` = `{ linkId, kind, itemId, name, need, qtyHint, note, sortOrder, unitLabelOne, unitLabelMany, defaultFitMode }`. Include only links that aren't removed and whose part type / supply is active. Order by `sort_order`, then `created_at`. `defaultFitMode` is the part type's `default_fit_mode` (null for supplies). Supplies use their unit's labels; part types use `piece` / `pieces`. Add top-level `serviceItemsEnabled: boolean` (the flag for this fleet). Load the links in one query for all jobs in the payload.

**b. `POST /maintenance-work-orders`.** Keep today's flow: idempotency replay, odometer check, discount checks, log number, then `/complete` when `completeNow`. Replace the header + lines inserts with `prepareWorkOrderLines` + `callSaveWorkOrder` (`p_work_order_id` null, `p_expected_version` null, `p_status` = today's `status`, `p_work_order` with `id: woId`, `idempotency_key`, `log_number` and the other header fields, actor = `rbacUserId(c)`). If two requests with the same key race and the database refuses the second (unique violation on the idempotency key), run the replay branch for it instead of returning 500 (audit test 26).

**c. `PATCH /maintenance-work-orders/:id`.**
- **Content edit** (body has `lines`, or any of `performedAtDate`, `odometer`, `provider`, `currency`, `templateId`, `packageComplete`, `logMode`, `notes`, `invoiceUrl`, `discount`): requires `expectedVersion` (missing → 428 `version_required`). Status in the body, if any, must be `draft` or `in_progress`. Keep today's discount checks, then `prepareWorkOrderLines` + `callSaveWorkOrder`. Header fields not in the body are left out of `p_work_order`, so they're kept. Lines keep their ids (no more "fresh ids on replace").
- **Board-only change** (only `status`, `priority`, `vendorId`, `source`, `cancelReason`): keep today's code path exactly. It never touches lines or items. `expectedVersion` is optional here; when sent and different from the stored version → 409 `stale_edit`.
- A body mixing both kinds → 400 "Save the job details and the status separately."

**d. Reads.** `mapDbWorkOrderToApi` adds `version` and `notFinished` (`status = 'in_progress'` and `updated_at` older than 2 minutes). `mapDbLineToApi` adds `itemsAmount`. `GET /maintenance-work-orders/:id`, the POST / PATCH responses and the `/complete` response attach `items` to each line (one query for all lines). `GET /maintenance-logs/:vehicleId` (history): for each record, find its work order (`maintenance_records.work_order_id`, else `payload_json.workOrderId`). Attach `items` and `itemsAmount` to each payload line whose `id` matches a work-order line, and put `version` on the log. Use one query per request, not per record.

**e. Flag.** Add `SERVICE_ITEMS: "service_items"` to `FEATURE_FLAGS` in `feature_flags.ts`. Use `isFeatureEnabled(FEATURE_FLAGS.SERVICE_ITEMS, orgId)`. It is off unless set, so nothing changes for anyone until the owner turns it on.

### 6. Tests
- **New `supabase/functions/_fleet-server/service_items_line_items.test.ts` (Deno):** `parseLineItems` — every amount in step 2, `qty 1.2345` → `qty_precision`, `unitCost 0.005` → `cost_precision`, negative cost, blank cost = null and 0 amount, declined with items, `partNumber` on a supply, Other item with no name, the shape rules, 31 items; and the BigInt sum of several items. `computeWoLineTotal`: service $3,000 + items 1,200 + 800 → 5000 (test 21); part 4 × 1,000 + labour 1,000 + item 500 → 5500 (test 22); old line with no `items_amount` → same as before (test 23); declined with `items_amount` → 0.
- **New `supabase/functions/_fleet-server/service_items_save.test.ts` (Deno, stubbed Supabase and `getCatalogParts`, like `maintenance_jobs_admin_routes.test.ts`):** create drops client line ids; update keeps known ids, drops unknown / non-uuid, refuses another work order's id; flag off with items → `service_items_off` (test 20); flag off with no items → passes; link of another job → `line_item_link_wrong_job`; removed / retired link accepted (test 30); part not for this car → `line_item_part_not_for_car` and a chosen part fills brand + part number (test 25); snapshot unit label `1 → can`, `2 → cans`, part type → `piece` (test 29 base); every row of the error table; content-edit vs board-only detection, including the mixed body.
- **SQL:** in `supabase/tests/service_items_save_db_test.sql`, `supplier_part_offer_id` is saved, kept when missing, cleared when null. In `supabase/tests/service_items_checks.sql`, add a count that must be 0: completed work orders with `maintenance_record_id IS NULL` while a record has `work_order_id = wo.id`.
- **CI:** add both Deno files to the "Deno test maintenance jobs admin" step in `.github/workflows/ci.yml` (rename it "Deno test maintenance jobs + service items").

### 7. Built bundle
`supabase/functions/fleet-ops/index.ts` serves these routes. Rebuild it with `node scripts/build-edge-bundle.mjs fleet-ops`. Don't hand-edit or commit any other bundle.

## How to check your work (local only)
1. `npx supabase db reset --no-seed` (if it fails with `DbSetupError` while starting, run it once more). Then run, the way CI does: `service_items_checks.sql`, `service_items_db_test.sql`, `service_items_save_db_test.sql`, `maintenance_discount_checks.sql`, `maintenance_discount_db_test.sql`, `engine_sections_used_ids_test.sql`. All pass.
2. `deno test --no-check` on the two new files, the three maintenance-jobs admin test files, `parts_finder.test.ts` and every existing `maintenance_*.test.ts` in `_fleet-server`. All pass.
3. `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs`, `pnpm check`. All pass.
4. `pnpm --filter fleet exec tsc --noEmit`: no new errors in files you changed (the package export).

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login / permission code.
- No git branch, commit or push.
- Change only: the D2 migration (step 1 only), `packages/types/src/serviceItems.ts` + its export line, `maintenance_logging_helpers.ts`, `maintenance_routes.ts`, the new `service_items_save.ts`, `feature_flags.ts`, the new and named test files, `ci.yml`, and the rebuilt `fleet-ops/index.ts`.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173, 5180–5183). Leave the local Supabase database as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents.
