# Give Cursor this — Log service parts gaps, Slice B, Round B-Server

You are building **Slice B, Server layer only** of `docs/log-service-parts-gaps-audit.md` (Rev 3.3). Read these parts first; they are the spec:
- the status block at the top (Rev 3.2 / 3.3)
- section 1 (facts): "Find parts → Dominion path", "The merge key (v1)", "Finishing a service", "Dominion Pending parts", "Unknown parts in Log service"
- section 2, Slice B table (LS-09 … LS-18, LS-21 … LS-23)
- section 3.2 Server, the Slice B bullet
- section 4 (Gates) and section 5 (Done-tests 8–21)

The Slice B Data round is done and checked: migration `supabase/migrations/20261118195343_log_service_parts_outbox.sql` and `supabase/tests/log_service_parts_outbox_checks.sql`. All the "send once / merge / count / daily limit / cancel / retry time" rules already live in its SQL functions. **This round only calls them.**
- `parts_sourcing_outbox_queue(work_order_id)`
- `parts_sourcing_outbox_claim(limit)`
- `parts_sourcing_outbox_send(outbox_id, row jsonb)` — results `sent | merged | cancelled | not_completed | daily_limit | car_not_linked | not_sent`
- `parts_sourcing_outbox_retry(outbox_id, 'car_not_linked' | 'error')`
- `catalog_research_research_group_key_v2(...)`

Do **not** build any screen (Log service Part number box, the "Roam will look this part up…" lines, the send lines in history, the Dominion Pending catalog columns and drawer). Those are the Screens round.

The working tree has many uncommitted changes. Keep them: change only what this prompt names, and never revert, reformat or stash anything.

## What to build

### 1. One job rule for both doors (LS-12)
Find parts and the outbox must create or join a research job the same way. That migration is not live yet, so **edit `20261118195343_log_service_parts_outbox.sql` in place**. Do not make a new migration for this.
- Add `public.catalog_research_join_or_create_job(p_group_key text, p_vehicle_catalog_id uuid, p_component_id uuid, p_fit_descriptor text, p_match_type text, p_requested_name text, p_requested_part_number text, p_origin text) RETURNS jsonb` (VOLATILE, SECURITY DEFINER, `SET search_path = public, pg_temp`). Its body is exactly step 7 of `parts_sourcing_outbox_send` today:
  - insert … `ON CONFLICT (group_key) WHERE state IN (open states) DO NOTHING`;
  - if new: enqueue + log event (with `origin` = `p_origin` in the detail);
  - else: `fleet_count = fleet_count + 1` and fill `requested_*` only where empty.
  - It returns `{ jobId, newJob }`.
- Make `parts_sourcing_outbox_send` call it instead of its own copy. Nothing else in `send` changes (keep the per-company advisory lock).
- Same grants as the other functions (`service_role` only).
- Add to `log_service_parts_outbox_checks.sql`: calling it twice with the same key → one job, `fleet_count = 2`, first `requested_name` kept, `newJob` true then false.

### 2. Other item can carry a part number (LS-09)
- `packages/types/src/serviceItems.ts` (`parseLineItems`, around lines 178–204) refuses a part number on `other` items in two places. Allow it for `other`; keep refusing it on `supply`.
- For `other`, clean it: keep only `[A-Za-z0-9-]`, then cut to 80 characters. If nothing is left, store `null`. This is the same rule as `old_part_number` in `parts_sourcing_request_build.ts`.
- Return it as `partNumber` / `part_number`, like `part_type` does. `part_type` numbers keep today's handling.
- `service_items_save.ts:673-711` already passes `part_number` through for every kind. Check that an Other item's cleaned number reaches the database.
- Saving doesn't depend on the switch. With the switch off the screen simply has no box.

### 3. Finishing a service queues its unknown parts (LS-10, LS-11, LS-18)
In `supabase/functions/_fleet-server/maintenance_completion.ts`:
- Add a step `queueUnknownParts` as the **last** entry of `STEP_SEQUENCE` (after `fleetLogService`, line ~418).
- When `isFeatureEnabled(FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS, orgId)` is false it does nothing (switch off = no outbox rows). When it's true it calls `supabase.rpc("parts_sourcing_outbox_queue", { p_work_order_id: workOrderId })`.
- An error throws, so the finish fails and is retried through today's path (`:596-633`).
- No network call to anything outside the database (gate 1).
- A replay (`idempotentReplay`, `:443-461`) runs no step, so it adds nothing (done-test 10).
- Add it to the `CompletionSteps` type and its default implementation, the same way the other steps are built, so tests can override it.

### 4. The drain: edge function `parts-sourcing-drain` (LS-12, LS-13)
- **Logic** in a new `supabase/functions/_fleet-server/parts_sourcing_drain.ts`, `export async function runPartsSourcingDrain(supabase, opts?: { limit?: number; now?: () => Date })`.
- **Door** in a new `supabase/functions/parts-sourcing-drain/index.ts`, copying `supabase/functions/catalog-research/index.ts`:
  - `requireInternalSecret(req, { envKeys: ["PARTS_SOURCING_DRAIN_SECRET"], headerNames: ["X-Parts-Sourcing-Drain-Secret"] })` — its **own** secret, never the fleet cron secret;
  - a service-role client; POST only;
  - returns the run summary as JSON.
- Add `[functions.parts-sourcing-drain]` with `verify_jwt = false` to `supabase/config.toml`, next to `[functions.catalog-research]`. The database cron calls it with only the secret header, the same as `catalog-research` (the 17 Nov picture-cron 401 was exactly this).

`runPartsSourcingDrain`:
1. `rows = rpc("parts_sourcing_outbox_claim", { p_limit: limit ?? 25 })`.
2. For each row, **one at a time**, inside `try`:
   - Load the item (`maintenance_work_order_line_item` by `line_item_id`), its line (`maintenance_work_order_lines`) and its work order. Load the line's job (`maintenance_service_categories`: `is_part`, `position_scheme`) and, for a typed-in part, the item's `part_type_id`.
   - **Car link:** the same rule as `verifiedCarForVehicle` (`fleet_parts_access.ts:109`), but by organization id + vehicle id with no request context. Add `verifiedCatalogIdForVehicle(supabase, orgId, vehicleId): Promise<string | null>` to `fleet_parts_access.ts`: the kv car, the same org check `filterByOrg` makes, `readExplicitCatalogLink`, `filterLinksExistingInCatalog`. Make `verifiedCarForVehicle` use the same pieces, so there is one rule. No link → `rpc("parts_sourcing_outbox_retry", { p_outbox_id, p_reason: "car_not_linked" })` and go to the next row.
   - **Build the row with the existing `buildPartsSourcingInsert`** (the only request builder):
     - `orgId` = the work order's;
     - `vehicleId` = the work order's;
     - `needText` = the item's `item_name`;
     - `componentId`: for a typed-in part, the item's `part_type_id`; for an Other item, the line's `component_id` when that job has `is_part = true`, else `null`;
     - `vehicleCatalogId` = the link;
     - `matchType: null`, `fit: {}`, `kind: "add_part_info"`, `urgency/qty/photoUrl/replyDueAt: null`;
     - `userId` = the work order's `updated_by` (or null);
     - `sentAt` = now;
     - `oldPartNumber` = the item's `part_number`;
     - `positionScheme` = the line's job `position_scheme` and `positionCodes` = the line's `positions`, only when it has any.

     The wheel translation then fills the fit for wheel codes, exactly as Find parts does.
   - `rpc("parts_sourcing_outbox_send", { p_outbox_id, p_row: { ...row, item_name } })`. Count the `result`.
3. Any thrown error for a row (load, build, or send) → `rpc("parts_sourcing_outbox_retry", { p_outbox_id, p_reason: "error" })`. Log the error text server-side only; it never reaches the fleet or Dominion. Then carry on with the next row. If the retry call itself fails, log and carry on (the claim expires after 10 minutes and the row is picked up again).
4. Stop starting new rows after 45 seconds of run time.
5. Return `{ claimed, sent, merged, cancelled, notCompleted, dailyLimit, carNotLinked, errors }`.

The drain never checks the switch: rows only exist when the switch was on at finish.

### 5. Key v2 everywhere in TypeScript (LS-14, LS-15)
- `pending_parts_group.ts`:
  - **remove** the v1 builder `pendingPartsGroupKey`, `parsePendingPartsGroupId` and `applyPendingPartsGroupFilters`;
  - add `async researchGroupKeyV2(supabase, input)`: one RPC to `catalog_research_research_group_key_v2`. Its input is the request columns (`vehicle_catalog_id`, `maintenance_component_id`, `fit_descriptor`, `install_side`, `match_type`, `position_scheme`, `position_codes`, `old_part_number`) plus `name`;
  - add `parseGroupKeyV2(key)`: splits on `|` into `{ vehicleCatalogId, componentId, fitOrSide, matchType, positionScheme, positionCodes: string[], identity }`, or `null` when the key doesn't start with `v2|`;
  - add `groupIdForRow(row)`: the row's stored `research_group_key` when not blank, else `legacy:<request id>`;
  - add `applyPendingPartsGroupFilter(query, groupId)`: `legacy:<id>` → `.eq("id", id)`, otherwise `.eq("research_group_key", groupId)`.

  Grouping and filtering by the **stored** key means no key is ever parsed to find rows. Old closed rows keep their stored v1 key and still group together.
- `catalog_research_intake.ts`: `researchGroupKeyFromRow` becomes `async` and calls `researchGroupKeyV2`, with `name` = the request's `need_text`.
- `ensureCatalogResearchJob` calls `rpc("catalog_research_join_or_create_job", …)` (step 1) with `p_origin: "find_parts"`. Pass `p_requested_name` = the request's `need_text` and `p_requested_part_number` = its cleaned `old_part_number`. It returns the job id. No more find-then-insert in TypeScript.
- `fleet_find_parts_routes.ts` `POST /request`:
  - awaits the new key;
  - stores `origin: "find_parts"` explicitly;
  - the dedupe, the daily count and the order of checks stay exactly as today;
  - the request row's `position_scheme` / `position_codes` (Slice A) are passed into the key.
- `catalog_research_notify.ts`: use `applyPendingPartsGroupFilter`.

### 6. Dominion Pending parts read (LS-17, LS-21, LS-23)
In `pending_parts_catalog_routes.ts`:
- **List** (`GET` the parts queue):
  - Also select `research_group_key, origin, old_part_number, position_scheme, position_codes, catalog_research_job_id`.
  - Group by `groupIdForRow`.
  - Then load the jobs of those rows in **one** query (`catalog_research_job`: `id, requested_name, requested_part_number, fleet_count`).
  - Each group returns:
    - `requestedName`, `requestedPartNumber` (from the job, or `null`);
    - `positionScheme`, `positionCodes` (the group's earliest request);
    - `origins: string[]` (distinct, `service_log` first).
  - Remove `fleetCount` from the group. Sort groups by the job's `fleet_count` (most asked first), then `lastAsked` newest first; `fleet_count` is used only for sorting and is never returned.
  - `stripPii` stays.
- **Detail** (`GET /:groupId`): use `applyPendingPartsGroupFilter`. Return the same LS-23 fields. Remove `fleetCount: notes.length`.
- **PATCH** (`/:groupId`): use `applyPendingPartsGroupFilter`.
- Gate 3: Dominion gets no fleet names, plates, counts or prices. Add `fleet_count` and `fleetCount` to `FORBIDDEN_RESPONSE_KEYS`.
- `apps/admin/src/services/pendingPartsCatalogService.ts`: make `fleetCount` optional in its three types and add the new optional fields. **Types only.** The Screens round removes "Asked by N fleets" and adds the Source chips and the second line.

### 7. Service history shows what happened to each unknown part (LS-16)
- `GET /maintenance-work-orders/:id`: load the outbox rows for that work order in **one** query (`parts_sourcing_outbox`: `line_item_id, state, reason_code`).
- Add `sourcingState` (`pending | sent | merged | not_sent | cancelled`, or `null` when the item has no row) and `sourcingReason` (`car_not_linked | daily_limit | error`, or `null`) to each item, where items are mapped (`mapDbLineItemToApi` / `enrichLinesWithItems`).
- Do the same on the completed-replay path of `POST /maintenance-work-orders`.
- `apps/fleet/src/types/maintenance.ts`: add the two optional fields to the saved item type. **Types only.**

### 8. Rebuild the bundles
- `node scripts/build-edge-bundle.mjs fleet-ops`
- `node scripts/build-edge-bundle.mjs fleet-core`
- `parts-sourcing-drain` is a plain function like `catalog-research` (not bundled). Check `deploy-supabase-edge.yml` picks up a new function folder by itself; say in your report whether it does.

## Tests (update and run them in this round)
Use **real** shapes: the real `buildPartsSourcingInsert`, `mapDbLineItemToApi`, `groupPartsRequests` and the completion step list. Use fake Supabase clients that record every `rpc` call and its arguments. Add `supabase/functions/_fleet-server/parts_sourcing_drain.test.ts` and `supabase/functions/_fleet-server/log_service_unknown_parts.test.ts`; extend `parts_sourcing_request_build.test.ts`, `fleet_find_parts_routes.test.ts` and the serviceItems tests. Prove:

1. **Queued once:**
   - with the switch on, finishing calls `parts_sourcing_outbox_queue` once with the work order id, as the last step;
   - a replay calls no step;
   - with the switch off it is never called (done-tests 10, 20);
   - a queue error makes the finish fail through today's path.
2. **Two drains at once send once:** two `runPartsSourcingDrain` runs whose claims return disjoint rows (as `SKIP LOCKED` does) call `send` once per row, never twice for one row. The SQL side is proven in the checks file.
3. **Drain row shape:**
   - an Other item "Front oxygen sensor", `89467-TEST1`, on an Oxygen-sensor line with `{before_cat}` → `send` gets `need_text` "Front oxygen sensor", `old_part_number` "89467-TEST1", `position_scheme` "before_after_catalyst", `position_codes` ["before_cat"], no fit, `item_name` set (done-test 8);
   - a typed-in part → `maintenance_component_id` = its part type (done-test 9);
   - an Other item on a wheel job with `{LF,RF}` → fit `front:both`.
4. **Each reason code:**
   - no car link → `retry(car_not_linked)`, no `send`;
   - a thrown error → `retry(error)`, and the next row still runs;
   - each `send` result (`sent`, `merged`, `cancelled`, `not_completed`, `daily_limit`, `car_not_linked`) is counted in the summary.
5. **Secret:** the door refuses a missing or wrong `X-Parts-Sourcing-Drain-Secret` with 403, and the fleet cron secret is not accepted.
6. **Key v2 in TS:**
   - `researchGroupKeyFromRow` makes one RPC with all inputs, `name` = `need_text`;
   - `groupIdForRow` / `applyPendingPartsGroupFilter` handle a v2 key, a v1 stored key and a blank key (`legacy:`);
   - `parseGroupKeyV2` reads a key whose name had `:` in it.
7. **Find parts request** stores `origin: "find_parts"` and calls `catalog_research_join_or_create_job` with the need text and cleaned number. Dedupe-before-limit order is unchanged.
8. **Pending parts read (gate 3, done-tests 18, 21):**
   - groups from two companies with the same stored key → one group with `origins` `["service_log","find_parts"]`, plus the job's requested name and number;
   - no `fleetCount`, `fleet_count`, `organization_id`, `vehicle_id`, `created_by` or plate anywhere in the JSON (walk every key);
   - sorted by the job's count.
9. **Work-order read:** items get `sourcingState` / `sourcingReason` from the outbox; items without a row get `null`; one outbox query.
10. **LS-09:**
    - an Other item with `" 89467-test1 "` parses to `89467-test1` (cleaning, not upper-casing; upper-casing only happens inside the key);
    - one with `"!!!"` parses to `null`;
    - a `supply` item with a number is still refused with `part_number_not_allowed`.

Add both new test files to the right Deno step in `.github/workflows/ci.yml`: the drain and unknown-parts files to "Deno test maintenance jobs + service items", and `parts_sourcing_request_build.test.ts` to "Deno test find parts" if it isn't in a CI step yet.

## How to check your work (local only)
1. Server tests:
   ```
   deno test --no-check --allow-read --allow-env supabase/functions/_fleet-server/parts_sourcing_drain.test.ts supabase/functions/_fleet-server/log_service_unknown_parts.test.ts supabase/functions/_fleet-server/log_service_positions.test.ts supabase/functions/_fleet-server/parts_sourcing_request_build.test.ts supabase/functions/_fleet-server/fleet_find_parts_routes.test.ts supabase/functions/_fleet-server/inspection_findings.test.ts supabase/functions/_fleet-server/service_items_*.test.ts supabase/functions/_fleet-server/maintenance_*.test.ts supabase/functions/_fleet-server/catalog_research_*.test.ts supabase/functions/_fleet-server/canonical_from_ops*.test.ts packages/types/src/partPositions.test.ts
   ```
   Everything must pass, including every `catalog_research_*` test that used the old key helpers. Heavy Deno use can break the local Fleet dev app; if it does, the owner stops the app and runs `pnpm install`. Never delete `node_modules/.deno`.
2. Docker Desktop must be open. Run `npx supabase db reset --no-seed` on the **local** database only (once more on `DbSetupError`). Then run `log_service_parts_outbox_checks`, `log_service_positions_checks`, `inspection_findings_db_test`, `service_items_save_db_test` and `service_items_completion_db_test` the way CI does:
   ```
   export MSYS_NO_PATHCONV=1
   docker cp supabase/tests/<f>.sql supabase_db_Goride:/tmp/<f>.sql
   docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/<f>.sql
   ```
   All must pass.
3. Fleet vitest for any test touching `serviceItems` parsing, run from `C:\Roam\Goride` in PowerShell (not a `/c/...` bash path).
4. `pnpm --filter @roam/admin typecheck` must pass. `pnpm --filter @roam/fleet typecheck` already fails in files this round doesn't touch; report only whether any error is in a file you changed (there must be none).
5. `node scripts/validate-migration-sql.mjs`, `node scripts/assert-public-fn-revoke-anon.mjs` and `pnpm check`. All must pass.

## Rules
- Never touch the live database, `.env.local`, normal dev ports (3000, 3001, 5173) or any login or permission code.
- Do not create, switch or commit git branches, and do not commit, stash or push.
- Shipped (live) migrations are never edited. `20261118195343_log_service_parts_outbox.sql` is not live yet and is the one exception, for step 1 only.
- Change only:
  - the files named above: `20261118195343_…sql` and its checks file, `serviceItems.ts`, `maintenance_completion.ts`, `parts_sourcing_drain.ts`, the new `parts-sourcing-drain/index.ts`, `config.toml` (the one new section), `fleet_parts_access.ts`, `pending_parts_group.ts`, `catalog_research_intake.ts`, `fleet_find_parts_routes.ts`, `catalog_research_notify.ts`, `pending_parts_catalog_routes.ts`, `maintenance_routes.ts` / `service_items_save.ts` (the item mapping), `feature_flags.ts` only if needed;
  - the two type files: `pendingPartsCatalogService.ts` and Fleet `types/maintenance.ts`;
  - the tests, `ci.yml` and the two rebuilt bundles.
- Before you finish, stop any app, dev server or test server you started (check ports 3000, 3001, 4173, 5173 and 5180–5183). If you started the local Supabase database, leave it as you found it.
- In your report, give clickable links to the files you changed and the results of what you ran (pass / fail and any error text). Don't paste file contents or full SQL; I'll read the files.
