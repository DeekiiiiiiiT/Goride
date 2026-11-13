# Cursor prompt — Toll Phase 2, P2-R5b: fixes from Claude's check of P2-R5

Claude checked P2-R5. The Fleet import route, the sweep and the matcher wiring are right. Fix these 8 items. **Do not change any file in `supabase/migrations/`.** Do not commit, branch or push.

## Driver app

### 1. The queue item can be sent before its photo is attached (`DriverExpenses.tsx`, Tolls branch of `doSubmit`)
Today `addToQueue` runs first. The photo is saved and `updateAction` adds `receiptBlobKey` + `legacyTransaction` **afterwards**. If the queue runs in between (the phone comes online, or a sync is already running), the item is sent with no photo. With the switch off, `saveTransaction` then gets a transaction holding only an `id`.

**Fix:** make the item complete **before** it enters the queue:
- save the photo first, under its own key (`toll-receipt-${crypto.randomUUID()}`);
- build `legacyTransaction` (its `id` is replaced by the item id at send time, as `syncCashToll` already does);
- then call `addToQueue` **once** with the full payload. Remove the later `updateAction` call.

### 2. Refusals that will never succeed must stop at once (`syncCashToll.ts`, `OfflineProvider.tsx`)
Today every failure becomes `new Error('Toll sync failed')`, which loses the server's code, and is retried 3 times.

**Fix:**
- pass the server's `code` and `status` through on the thrown error;
- in `OfflineProvider`'s catch, treat `RECEIPT_REQUIRED`, `NO_VEHICLE`, `DRIVER_NOT_FOUND` and any other `400` from `/toll/v2/driver-cash` as **permanent** (the existing `permanent` path), with a plain message, for example "This toll couldn't be sent: no vehicle is assigned to you. Ask your fleet manager.";
- **if the photo is missing** from the phone at send time (no `receiptBlobKey`, or `offlineBlobStore.get` returns nothing): permanent failure, "The receipt photo is missing on this phone. Delete this toll and add it again." **Never** send it without `receipt_url`, and **never** do the old save without the photo.

## Server (`toll_v2_import_controller.ts`, `toll_v2_import_lookups.ts`)

### 3. Driver cash: the switch and the company must be the same company (B7, B11)
Today the switch is read from the token (`toll_v2_enabled`), while the import uses `resolveSplitFillOrgId(...)`, which falls back to the user's id for owners. The two can disagree.

**Fix:**
- company = `getOrgId(c)` only. None → `401 NO_COMPANY`. Drop the `resolveSplitFillOrgId` fallback here.
- check the switch with the **service key**, for that same company: `toll_sys_tolls_v2_on(p_company)`.

The Fleet import route stays as it is: it uses the user token for both the switch and the import.

### 4. Never charge a toll to a made-up driver (`resolveDriverIdForUser`)
Today, when no driver record matches, it returns the user's own id, so a charge can be filed under a driver who doesn't exist.

**Fix:** no match → `null`. The route then answers `400 { code: 'DRIVER_NOT_FOUND' }`. Keep the existing lookups (the driver table, then KV `driver:<userId>`). Only remove the last fallback.

### 5. Check the time and amount before importing (driver cash)
A missing or bad `occurred_at` reaches the database's `::timestamptz` cast and fails with a 500, which the phone retries.

**Fix:** before calling the reader:
- `occurred_at` must parse to a real date, with a time zone offset or `Z`;
- `amount_minor` must be a whole number > 0.

Otherwise answer `400 BAD_REQUEST` with `current_state: { field }`.

## Reader

### 6. An unknown plaza must not share receipt numbers (`driverCashReceipt.ts`)
With `plaza_id = 'unknown'`, receipt `123` from two different unknown plazas gets the same `source_ref`, `receipt:unknown:123`. The second toll is then read as the first one again.

**Fix:** when `plazaId` is `'unknown'` (or empty), use `submission:<submissionId>` even if there is a receipt number. Add a test with two unknown-plaza receipts that have the same number.

## Tests

### 7. SQL section 11 (`supabase/tests/toll_v2_import.sql`)
Also check that the charge has **no ledger rows**. Count `ledger.entries` the same way the earlier sections of this file do.

### 8. New Deno and driver-app tests
- **Deno:**
  - switch off for the token's company → `TOLLS_V2_OFF`, even when `resolveSplitFillOrgId` would return another id;
  - `toll_sys_tolls_v2_on` is called with the token's company;
  - no driver record → `DRIVER_NOT_FOUND`;
  - bad / missing `occurred_at` → `400`;
  - `amount_minor` `0`, `-5` and `12.5` → `400`.
- **Driver app (`syncCashToll.test.ts`):**
  - a missing photo → permanent failure, and nothing is sent (neither the v2 route nor `saveTransaction`);
  - `NO_VEHICLE` → permanent, with the code kept on the error;
  - the queued payload already has `receiptBlobKey` and `legacyTransaction` at the moment `addToQueue` is called. Test this through the payload builder; pull the builder out of `DriverExpenses.tsx` into a small function if needed.

## Run (once; Docker Desktop open)
- `pnpm --filter @roam/toll-core test`
- `pnpm test:toll` (this must run this time; if Docker isn't running, say so and stop)
- the Deno tests for the controller
- the driver app's vitest for the touched files
- `node scripts/build-edge-bundle.mjs fleet-toll`

Afterwards run `pnpm install` (deno test can break the local Fleet app). If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
