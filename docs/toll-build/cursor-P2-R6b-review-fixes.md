# Cursor prompt — Toll Phase 2, P2-R6b: code review fixes

Claude ran `/code-review` on all of Phase 2 (`512492ff..HEAD`) and checked every finding against the code. Ten are real. Claude fixed #8 (database) in `supabase/migrations/20261113001948_toll_v2_import_core.sql`. **Fix the other nine below, one fix each, and add a test for each.** Don't change any other migration. Do not commit, branch or push.

## File readers (`packages/toll-core/src/v2/adapters/`)

**1. InDrive plate lookup** (`indrive.ts` ~line 44). The plate is looked up raw, but the map is keyed by `normalizePlate`. **Fix:** normalize the plate before the lookup. **Test:** `'1234 ab'` finds the vehicle stored under `1234AB`.

**2. InDrive driver lookup** (`indrive.ts` ~line 35, and `buildIndriveCtx` in `supabase/functions/_fleet-server/toll_v2_import_lookups.ts`). The map is filled from **Uber** UUIDs but looked up by **driver name**, so it can never match.
- **Fix in `buildIndriveCtx`:** fill `driverByExternalId` from each driver record's `inDriveDriverId`, plus the driver's full name normalized (trimmed, upper case, single spaces).
- **Fix in the reader:** look up an InDrive driver id column first, then the normalized `driverName`.
- **Test:** both lookups resolve, and an Uber UUID never resolves an InDrive row.

**3. Tag statement top-ups need no plaza** (`tagStatement.ts` ~line 98). The "Plaza not known" check runs before the top-up branch, so a top-up row with a blank or non-plaza name is dropped. **Fix:** check the plaza only for crossings (negative amounts). **Test:** a `+500.00` row with Plaza Name `Top Up` becomes a top-up.

**4. Driver cash receipt ids must include the driver** (`driverCashReceipt.ts` ~line 20). Two drivers at the same plaza can hand in the same receipt number (per-lane numbering, a counter reset, an OCR misread). The second one is then read as the first, and can even change its amount. **Fix:** `source_ref = receipt:<plaza_id>:<driver_id>:<number>`. Keep the rule that an unknown plaza uses `submission:<id>`. **Test:** two drivers with the same plaza and number get two refs; the same driver sending the same receipt twice gets one ref.

**5. Uber must report rows it can't place** (`uber.ts` ~lines 141, 180–182). When a driver or vehicle isn't found, the raw Uber UUID or plate is stored as if it were our id, so the payback can never match and the report shows nothing wrong.
- **Fix:**
  - an unknown driver → a problem (`Driver not found: <uuid>`), and the row is not imported;
  - for trips, an unknown plate → a problem (`Vehicle not found: <plate>`), and the row is not imported.
  - This applies to adjustments (driver only) and to trips.
- **Test:** one of each, and they appear in `problems`.

**6. `toll_payback_minor` is already in cents** (`indrive.ts` ~line 77). That column goes through `toMinor`, which multiplies by 100. **Fix:** read the `toll_payback_minor` column as a whole number, and keep `toMinor` for the `tollCharges` / `toll_charges` dollar columns. **Test:** `toll_payback_minor = 37000` → 37000, and `tollCharges = 370` → 37000.

**7. Times written in UTC or with an offset** (`common.ts`, ISO branch of `parseCsvDateTimeToJamaicaIso`, ~line 142). A trailing `Z` or `+hh:mm` is dropped, and the clock time is stamped `-05:00`, so the time is off by hours. **Fix:** when the text has `Z` or an offset, convert that moment to Jamaica time; when it has neither, keep today's behaviour (the clock time is Jamaica time). **Test:** `2026-08-24T15:30:00Z` → `2026-08-24T10:30:00-05:00`, and `2026-08-24 15:30` → `2026-08-24T15:30:00-05:00`.

## Server

**9. One company's failure must not stop the sweep** (`supabase/functions/_fleet-server/toll_v2_matcher_run.ts`, `runTollMatcherSweep` ~line 69). **Fix:** wrap each company in `try/catch`, log the error, record `{ organizationId, error }` in the result, and carry on with the next company. **Test:** company A throws; B and C are still matched, and A's error is in the result.

## Driver app

**10. A toll saved while online can sit on the phone** (`DriverExpenses.tsx` ~line 1032, `OfflineProvider.tsx`). `processQueue()` does nothing while a sync is already running, and nothing runs it again afterwards.
- **Fix in `OfflineProvider`:** when `processQueue` is called during a running sync, remember it. When that sync ends, run the queue once more if any item still has `retryCount < MAX_RETRIES`.
- **Toast when online:** "Toll saved — sending now". Keep the offline toast as it is.
- **Count tolls separately** in the "Synced …" toast (`1 toll`), not as fuel logs.
- **Test:** a call during a running sync leads to exactly one more run after it finishes.

## Database test for Claude's fix #8
Add a section to `supabase/tests/toll_v2_import.sql` (inside its `BEGIN … ROLLBACK`):
1. import an Uber trip with a vehicle and a drop-off time;
2. import the same trip again with no plate, no drop-off and payment method `unknown`;
3. check that `vehicle_id`, `dropoff_at` and `payment_method` keep their first values, and that the nightly checks pass.

## Run (once; Docker Desktop open)
- `pnpm --filter @roam/toll-core test`
- `pnpm test:toll`
- the Deno tests for `toll_v2_import_controller` and `toll_v2_matcher_run`
- `pnpm --filter @roam/driver test`
- `node scripts/build-edge-bundle.mjs fleet-toll`

Afterwards run `pnpm install`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents; I'll read the files. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183). You may leave the Supabase Docker database running.
