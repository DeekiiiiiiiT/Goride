# Cursor prompt — Toll Phase 2, P2-R5: Fleet import route, driver cash toll, matcher sweep

This round wires up pieces that are already built. **Do not change any file in `supabase/migrations/`.** If the database looks wrong, or you need a database change, report it and stop: Claude writes the SQL. Do not commit, branch or push.

## Read first
- `docs/toll-architecture.md`:
  - Part F → Phase 2: "Look first (12 Nov)", "Decisions" 1–8 and the **"P2-R5 starting brief"**;
  - B3 (`import_batch`), B7 (company isolation), B9 (adapter contract), B11 (the switch);
  - I6 (`driver_outbox_crash`).
- What is already built:
  - **File readers** (pure): `packages/toll-core/src/v2/adapters/` (`tagStatement`, `topupProvider`, `uber`, `indrive`, `driverCashReceipt`; types in `types.ts`).
  - **The import, for people:** `public.toll_v2_command('import_batch', { command_id, kind, file_name, rows })`, called with the user's token. `kind` is `tag_statement | topups | driver_cash | uber | indrive`.
  - **The import, for the system:** `public.toll_sys_import(p_company, p_kind, p_rows, p_command_id, p_actor_job)`, service key only. The same `command_id` gives back the first answer with `replay: true`. **It does not check the `tolls_v2` switch**, so the caller must check it first.
  - **The matcher runner:** `supabase/functions/_fleet-server/toll_v2_matcher_run.ts` (`runTollMatcher(rpc, company)`, `runTollMatcherSweep(rpc)`), service key only.
  - **The command route** to copy from: `supabase/functions/_fleet-server/toll_v2_command_controller.ts`. It uses the user-token client, checks `toll_v2_enabled` first, then calls the RPC and maps errors with `mapTollCommandError`.
  - **The function entry point:** `supabase/functions/fleet-toll/src/main.ts`. `fleet-toll/index.ts` is generated (`node scripts/build-edge-bundle.mjs fleet-toll`), so never edit it by hand.

## Rules for the whole round
- **The company always comes from the user's token** (`app_metadata.organizationId`, `getOrgId(c)`), never from the request body (B7).
- **Check the switch once, at the top of every new route.** When `tolls_v2` is off, the route writes nothing and answers `409 { code: 'TOLLS_V2_OFF' }` (`tollsV2OffResponse()`). Today's old screens and routes stay exactly as they are (B11).
- **Auto-apply stays off.** The matcher only stores suggestions. Nothing in this round calls `apply_suggestion`.
- **A matcher failure never fails an import.** The import's answer is already stored. Log the error, return the import report with `matcher: { ok: false }`, and leave the queued work for the sweep.

## 1. Fleet import route (user token)
New file `supabase/functions/_fleet-server/toll_v2_import_controller.ts`, mounted in `fleet-toll/src/main.ts` next to `tollV2CommandApp`.

`POST /toll/v2/import`, `requirePermission("toll.manage")`, multipart form:
- `kind`: `tag_statement | topups | uber | indrive`. **Not** `driver_cash`; that comes only from the driver app (section 2).
- `file`: the CSV. For `uber`, two files: `payments_transaction` and `trip_activity` (see `UberFiles` in `uber.ts`).
- `command_id`: made by the Fleet screen, one per upload attempt. Missing → `400 BAD_REQUEST`.

What it does:
1. Check the switch (above).
2. **Build the reader's lookups on the server** from the company's own data, read with the user's token:
   - tag → vehicle and vehicle → driver: the same toll tag data `GET /toll-tags` serves (`toll_inventory_controller.tsx`);
   - plaza name → plaza id: the same plaza list `GET /toll-plazas` serves. **These must be the same plaza ids that Roam crossings use**, or cross-source duplicates will never be found. If they are not the same, report it and stop;
   - Uber driver UUID → driver id, and plate → vehicle id: reuse `driver_identity.ts` and the vehicle list. Don't write a new matching rule.
3. Run the reader. **Rows the reader can't use** (`problems`) never go to the database. They come back in the report.
4. **A tag statement file can hold top-ups as well as crossings** (`TagStatementResult.topups`). Send them as **two** imports: `tag_statement` with `command_id`, then `topups` with `command_id + ':topups'` (only if there are any).
5. Call `toll_v2_command('import_batch', …)` with the user's token. Map errors with `mapTollCommandError`.
6. Then `runTollMatcher` for that company, using a **service-key** client (it is service only), in a `try` (see the rules above).
7. Answer `200`:
   ```
   { kind, file_name,
     imports: [ <each import_batch answer, unchanged> ],
     problems: [ { row, reason } ],
     matcher: { ok, rounds?, stored?, queueLeft? } }
   ```
   A replay (the same `command_id`) returns the stored import answers. The matcher still runs, which is harmless.

**Leave alone:** `BulkImportTollTransactionsModal.tsx`, `recon_import_routes.ts` and the other old toll routes. The Fleet screen for this route is built in Phase 3 (from Stitch). This round only adds an API client method in `apps/fleet/src/services/api.ts` (`importTollFileV2`), with no screen changes.

## 2. Driver app cash toll (offline queue + required photo)

### Server route
In the same new controller: `POST /toll/v2/driver-cash`, for a **signed-in driver**. Use the same caller and company checks as `POST /fuel/split-fill` (`assertSplitFillAllowedAsync` in `fuel_split_fill.ts`), but not its fuel module switch.

Body: `{ submission_id, receipt_url, receipt_number?, occurred_at, amount_minor, plaza_name, lane?, collector?, vehicle_class? }`.

1. Check the switch. Off → `409 TOLLS_V2_OFF`, nothing written.
2. **The driver comes from the token** (the caller's own driver record), never from the body. **The vehicle** is the driver's assigned vehicle, resolved on the server the same way the app does today (`resolveVehicleIdForDriver`). No vehicle → `400 { code: 'NO_VEHICLE' }`.
3. **The plaza id** comes from `plaza_name` through the plaza list. An unknown plaza is still accepted, using `plaza_id = 'unknown'`; a person sees it when they verify the receipt. Never invent an id from the name.
4. **No `receipt_url` → `400 { code: 'RECEIPT_REQUIRED' }`.**
5. Run `driverCashReceipt(...)` with `submissionId = submission_id`. Any `problems` → `400 BAD_REQUEST` with the problems.
6. Call `toll_sys_import(company, 'driver_cash', rows, command_id = submission_id, 'driver_app')` with the service key. The charge arrives `unverified` (nothing posts until a person verifies it).
7. Then `runTollMatcher` for that company, as in section 1.
8. Answer `200 { charge_id, status, replay }`. The `status` is the row's status from the import report.

**One small reader fix (in `driverCashReceipt.ts`):** a receipt number is only unique at its own plaza. Make `source_ref` = `receipt:<plaza_id>:<number>` when there is a receipt number, and keep `submission:<id>` otherwise. Update `driverCashReceipt.test.ts` to match, and add a case where two plazas issue the same receipt number and get two different `source_ref`s.

### Driver app
In `apps/driver/src/components/fleet/DriverExpenses.tsx`, the Tolls path (`toll_scan` → `toll_review` → `doSubmit`):
- **A receipt photo is required.** No photo → the submit button is disabled, with the text "Take a photo of the toll receipt first". This applies whether the phone is online or offline.
- **Every cash toll goes through the offline queue,** online or not:
  - new action type `SUBMIT_CASH_TOLL` in `apps/driver/src/types/offline.ts`, with a payload type like `SubmitFuelExpensePayload`: the toll fields plus `receiptBlobKey`, `receiptFileName` and `receiptMimeType`;
  - the photo goes into `offlineBlobStore` (IndexedDB), like the fuel path does. Never base64 in localStorage.
  - the outbox item's `id` (made once by `addToQueue`) is the `submission_id`, and it **never changes on a retry**. That is what stops a resend from creating two charges (I6).
- **Sending it** (`OfflineProvider.tsx` / `OfflineSyncManager.tsx`, next to `SUBMIT_FUEL_EXPENSE`):
  1. upload the photo with `uploadEvidenceFile` (`evidenceType: 'toll_receipt'`, `sourceId` = the item id);
  2. `POST /toll/v2/driver-cash`;
  3. `200` → remove the item from the queue;
  4. `409 TOLLS_V2_OFF` → **today's save** (`api.saveTransaction` with the same transaction the old Tolls path builds, and `id` = the item id, so a retry overwrites instead of adding), then remove the item;
  5. any other error → keep the item and retry, as the queue already does.
- **Queue item label:** `Toll — <MMM d>`. Show it in the sync list like the other items.

## 3. Matcher sweep
- In the new controller, `POST /internal/toll-matcher-sweep`: **service key only**. Refuse any user token with `403`. Register it before the routes that require a user login, as `main.ts` already does for `/internal/seal-toll-week`. It runs `runTollMatcherSweep` and returns its reports.
- **Don't add the schedule** (pg_cron). Claude writes that SQL for P2-R6.

## 4. Tests
Deno tests next to the new controller (`toll_v2_import_controller.test.ts`), with a fake RPC client like `toll_v2_matcher_run.test.ts` uses:
1. **Switch off:** both routes → `409 TOLLS_V2_OFF`, and no import RPC is called.
2. **Company from the token only:** a body with `organization_id` / `company` for another company is ignored. The RPC gets the token's company.
3. **Tag statement with top-ups:** two imports, the second with `command_id:topups`. With no top-ups, only one import.
4. **Reader problems** come back in `problems` and are not sent to the RPC.
5. **The matcher throws:** still `200`, with `matcher.ok = false` and the import answers included.
6. **Driver cash:**
   - no `receipt_url` → `RECEIPT_REQUIRED`;
   - no vehicle → `NO_VEHICLE`;
   - the driver id in the body is ignored;
   - an unknown plaza → `plaza_id 'unknown'`;
   - `command_id` = `submission_id`;
   - `actor_job = 'driver_app'`.
7. **Sweep:** a user token → `403`; the service key → runs the sweep.
8. **Driver outbox crash (I6), on a real local database:** add a section to `supabase/tests/toll_v2_import_core.sql`, or a new SQL test file if that one doesn't fit, run inside `BEGIN … ROLLBACK`:
   - call `toll_sys_import(…, 'driver_cash', <one row>, '<uuid>', 'driver_app')` **twice** with the same `command_id`. The second call gives `replay: true` with the same charge id, and there is exactly one charge;
   - the charge is `unverified` with no ledger rows;
   - the nightly checks pass afterwards.
   - If you add a new file, add it to `.github/workflows/parts-sql-checks.yml` (`paths:` and the run step).
9. **Driver app:** a unit test for the sync step:
   - `200` removes the item;
   - `TOLLS_V2_OFF` falls back to `saveTransaction` with `id` = the item id;
   - a network error keeps the item, and the retry sends the **same** `submission_id`.

## Run (once; Docker Desktop open)
- `pnpm --filter @roam/toll-core test`
- `pnpm test:toll`
- the new Deno tests, and the driver app's tests for the files you touched
- `node scripts/build-edge-bundle.mjs fleet-toll` (it must build)

Running `deno test` can break the local Fleet app (`node_modules/.deno`); run `pnpm install` afterwards. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
