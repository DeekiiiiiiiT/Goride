# Cursor prompt — Toll R4: no paying a driver before the week's tolls are sealed (I24)

Design: `docs/toll-architecture.md` B6 / I24, narrowed in Part F1: **pay, write-off and batch runs are refused; collect (cash coming in) is never refused.** It ships behind a per-company switch that starts **off**, so nothing changes for anyone until the owner switches it on.

No migrations. No screen changes. Do not commit, branch or push.

## 1. The switch
In `supabase/functions/_fleet-server/feature_flags.ts`, add a flag `TOLL_SEAL_BEFORE_PAY: "toll_seal_before_pay"` exactly the way `RECON_V2` is added (constant at ~line 101, default entry at ~line 425). The default is **off for everyone**. It is read with the existing `isFeatureEnabled(flag, orgId)`.

## 2. The check: `supabase/functions/_fleet-server/toll_seal_before_pay.ts`
Export:
```ts
export async function assertTollWeekSealedForPay(input: {
  organizationId: string;
  weekAnchor: string;          // the driver week's Monday (yyyy-MM-dd) = the toll week key
  serviceLine?: string | null; // from the driver period row when it has one; default 'rideshare'
  authHeader: string | null;   // the request's Authorization header (the user's own token)
}): Promise<void>
```
Behaviour:
1. If `isFeatureEnabled("toll_seal_before_pay", organizationId)` is false → return (no change in behaviour).
2. Work out whether this company is on tolls v2. Call `rpc("toll_v2_enabled")` with a **user-token client** (anon key + `global.headers.Authorization = authHeader`, the same pattern as `toll_v2_command_controller.ts`). If the call fails, treat it as **not sealed** (fail closed).
3. Is the week sealed?
   - **v2 company:** read `public.week_statements` (service client is fine; it is a read) for `organization_id`, `kind = 'toll_week'`, `driver_id = '*'`, `week_key = weekAnchor`, taking the **highest version**. Sealed only if its `status = 'closed'`.
   - **Old-system company:** use the existing `probeTollPeriodSealed(organizationId, weekAnchor, serviceLine ?? 'rideshare')` from `toll_period_writable.ts:97`.
4. Not sealed → `throw new SettlementCommandError("TOLL_WEEK_NOT_SEALED", "Tolls for this week aren't sealed yet. Seal the week's tolls before paying the driver.", 409, { weekKey: weekAnchor })`. Use the class from `settlement_commands.ts:90`.

Keep the decision itself as a small pure function, `decideTollSealedForPay({ flagOn, isV2, latestTollWeekStatus, oldSystemSealed })`, so it can be unit tested without a database.

## 3. Where it is called
In `insertMovementAndDualWrite` (`supabase/functions/_fleet-server/settlement_commands_controller.tsx`, ~line 328), right after `assertFinancePeriodNotLocked(...)`:
```ts
if (!isCashReceipt) {
  await assertTollWeekSealedForPay({ organizationId: opts.organizationId, weekAnchor: opts.weekAnchor,
    serviceLine: <periodForGate's service line if the row has one>, authHeader: c.req.header("Authorization") ?? null });
}
```
- That one call covers pay, write-off and the `/runs` batch path, because all of them go through `insertMovementAndDualWrite`. **Check this is true** by reading the pay (~:597), write-off (~:875) and runs (~:1422) handlers. If any of them inserts a movement without going through `insertMovementAndDualWrite`, add the same call there and say so in your report.
- **Also gate `POST /settle-from-balance`** (`settlement_commands_controller.tsx:~563`, logic in `settlement_settle_from_balance.ts`). It settles a fleet-owes week by netting it against a driver-owes week, so it is a payment in effect. Call `assertTollWeekSealedForPay` for **both** weeks it touches, before it writes anything, in `settleFromBalance`, next to its existing `assertFinancePeriodNotLocked` calls. Add a test that it is refused when either week's tolls aren't sealed (flag on).
- **Leave alone (record only, never new payments):** `POST /payout-backfill` (`settlement_payout_backfill.ts`) records payouts that already happened, and `POST /legacy-weeks` / `legacy-kept-repair` (`legacy_weeks.ts`) write corrections. Blocking them would stop history being recorded. They are approver-only repair routes, retired in Phase 5 (I21).
- **Collect is never refused** (`isCashReceipt` is true for it; see the comments at ~:355 and `settlement_period_freeze.ts:103`).
- `commandErrorResponse` (~:447) already turns `SettlementCommandError` into `{ error, code, message, ...details }` with the status. Don't add a new response shape.

## 4. Tests (Deno) — `supabase/functions/_fleet-server/toll_seal_before_pay.test.ts`
Test the pure `decideTollSealedForPay`:
- flag off → allowed, whatever else is true;
- flag on, v2, latest `toll_week` status `closed` → allowed;
- flag on, v2, latest status `draft` (reopened) → refused;
- flag on, v2, no statement → refused;
- flag on, old system, sealed → allowed;
- flag on, old system, not sealed → refused;
- flag on, v2 lookup failed → refused (fail closed).

Also test `assertTollWeekSealedForPay` throws a `SettlementCommandError` with code `TOLL_WEEK_NOT_SEALED`, status 409 and `details.weekKey`, by injecting fakes for the three lookups. Make the lookups injectable through an optional `deps` argument; **don't** add a test-only switch to the app.

Add a test that collect is not gated. A small pure helper `shouldCheckTollSeal(kind, isCashReceipt)` → false for collect / cash receipts, true for `pay` and `write_off` is enough.

Add the test file to the settlement step in `.github/workflows/ci.yml` (~line 388), next to `settlement_commands.test.ts`.

## 5. Rebuild and run (once)
- Regenerate the **fleet-pay** bundle with the repo's existing script (the same way the fleet-toll bundle was regenerated in R3), and run the edge route manifest check for fleet-pay.
- Run `deno test --allow-read --allow-env supabase/functions/_fleet-server/toll_seal_before_pay.test.ts supabase/functions/_fleet-server/settlement_commands.test.ts`.
- If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Say plainly whether pay, write-off and runs all go through `insertMovementAndDualWrite`. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
