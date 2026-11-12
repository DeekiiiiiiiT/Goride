# Cursor prompt — Toll Phase 1: code review fixes (server side)

The 12 Nov `/code-review` found 10 issues in the Phase 1 toll work. Claude fixed the database ones (#5, #9, #10's lookup) in the P1 migrations and updated `supabase/tests/toll_v2_metrics.sql`. **Do not change any migration.** Fix the server ones below exactly as written. Do not commit, branch or push.

**Background that shapes #3 / #4:** since P1-R4, driver settlement for a **v2** company reads only the v2 toll answer. Rows in the old KV toll ledger for a v2 company never reach money. Skipping the old write is tidiness, not a money safeguard, so **when in doubt, keep the old write** (harmless). Never skip a ride the v2 hook won't record.

## #1 — the statement pass must not overwrite v2 toll figures
`driver_financial_periods.ts`, the statement pass ("Pass E", ~lines 1684–1760): when this rebuild's `tollSource === 'toll_v2'`, **don't** replace `tollSpend`, `tollChargedToDriver`, `tollReimbursed`, `tollCashSpend` or `tollTagSpend` from the week statement, and don't recompute settlement with statement toll values. The v2 values are the source; the statements are written from them. The drift comparison can stay. Add a comment saying why.

## #2 — find the company the same way the period does
`driver_financial_periods.ts:~1317`: `orgIdForTolls` uses `context.organizationId`, which can be null. Use the **same** organization the rebuild uses for the period: find where `requirePeriodOrganizationId` (or equivalent) resolves it, and resolve it before the toll switch point. If the organization truly can't be found, keep today's behaviour (legacy), and log it once.

## #3 + #4 — the old Roam paths skip only what v2 records
- `supabase/functions/toll-brain/index.ts` (~line 284) and `bridgeRideTollCrossings` in `supabase/functions/_fleet-server/toll_controller.tsx` (~line 9714): skip the old write **only when all are true**:
  - the ride's `organization_id` is set;
  - its `attribution_mode = 'fleet'`;
  - its `payment_method` is `cash` or `card`;
  - `toll_sys_tolls_v2_on(org)` returned **true**.

  On an RPC **error**, or any of these unknown → **keep the old write** and log it. (During a ride the organization is often not stamped yet; that's fine.)
- Select the extra ride fields you need. Keep the `skippedV2` count in the bridge response.
- These are the same rules as `nativeTollCallsFor` in `supabase/functions/rides/tolls/nativeTollPayload.ts`. Export one shared predicate from there (e.g. `rideRecordedByTollV2(ride)` covering everything except the RPC), and use it in all three places, so they can never drift apart.

## #6 — a missing function means "v2 is not on"
`tollsV2OnForOrg` (`driver_financial_periods.ts:~827`): if the RPC error is "function not found" (PostgREST `PGRST202`, or Postgres `42883`), return **false** (the v2 migrations aren't there, so v2 can't be on). Any other error still throws. Test both.

## #7 — the cash outcome mapping
`nativeTollPayload.ts` `mapCashOutcome` / `buildNativeCashSettled`:
- `split` → `exact` (in `rides/cashSettlement/computeOutcome.ts` a split means the shortfall was covered by card, so the rider paid in full). Read `computeOutcome.ts` and confirm; if `split` can leave a real shortfall, map by total received (cash + card part) vs fare, and say which in your report.
- A missing outcome stays `exact` **only** when `cash_settlement_status = 'settled'`; otherwise make no `cash_settled` call (the ride isn't settled yet).

## #8 — the seal follow-up: both service lines, failures logged
`toll_v2_command_controller.ts` (~line 61): call `runSealSideEffects` for `serviceLine: 'rideshare'` **and** `'rush_delivery'`. If the result has rebuild errors (read `SealSideEffectsResult`), log them (`console.error('[toll-v2-command] seal side effects had errors', …)`). Still return the seal's 200.

## #10 — fetch each company-week once per rebuild run
`driver_financial_periods.ts`: replace the per-driver `toll_sys_driver_week_tolls` call with `toll_sys_week_drivers(p_company, p_week)` → `{ state, weekKey, drivers[] }`. Fetch it once per (org, week) and cache it in `RebuildContext` (like `tollsV2ByOrg`), then pick the driver's line from `drivers[]` (null if absent → zeros). Keep `toll_sys_driver_week_tolls` in the database for other uses.

## Tests
- **Deno:** update `toll_v2_settlement_inputs.test.ts`, `nativeTollPayload.test.ts` and `nativeTollSync.test.ts` for #1 (if the statement-pass rule is testable as a small pure helper, test it), #3 / #4 (the shared predicate: every combination), #6 (function-not-found → false; other errors throw), #7 (split; missing outcome settled vs not), #10 (one fetch per company-week across two drivers).
- **SQL** (`supabase/tests/toll_v2_metrics.sql`): add the case "a v2 company's ride with `attribution_mode` other than `fleet` and a crossing → **no** `roam_gap` alert".
- Rebuild the committed edge bundles that include the changed files (fleet-pay, fleet-toll) and run the manifest and route-contract checks.

## Run (once; Docker Desktop open)
`pnpm test:toll`, the Deno files above plus `settlement_commands.test.ts`, the bundle and manifest checks. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Say what `split` means in `computeOutcome.ts`. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
