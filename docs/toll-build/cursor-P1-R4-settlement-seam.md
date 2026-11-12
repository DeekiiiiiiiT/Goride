# Cursor prompt — Toll Phase 1, P1-R4: driver settlement reads toll v2

Read `docs/toll-architecture.md` → Part F → "P1-R4 look-first" (facts, plan, mapping). Claude built the database side in `supabase/migrations/20261112230351_toll_v2_settlement_lines.sql`. **Do not change any migration.** Do not commit, branch or push.

What the database now gives you:
- `TollWeekResultV1.drivers[]` lines now also carry `spendMinor, tagSpendMinor, cashSpendMinor, platformMinor, fleetMinor`.
- `public.toll_sys_driver_week_tolls(p_company uuid, p_week date, p_driver text)` (service key only) → `{ state, weekKey, line }`. `line` is that driver's `drivers[]` entry, or null if they had no tolls. It is sealed once the week is sealed, live before.
- `public.toll_sys_tolls_v2_on(p_company uuid)` → boolean (service key only).
- The v2 seal writes each driver's `kind 'toll'` week statement (closed). Reopen writes drafts.
- A trigger queues `period_projection_refresh` outbox rows for every v2 change that moves a driver's toll lines.

**The rule for this round:** for a company **not** on v2, settlement behaves **exactly** as today. No new reads, no changed numbers. Every change below sits behind `toll_sys_tolls_v2_on`.

## 1. The settlement switch point: `supabase/functions/_fleet-server/driver_financial_periods.ts`
In `rebuildDriverFinancialPeriod` (~line 834), **after** today's inline toll figures are computed (~lines 862–1149) and **before** the first `computePeriodSettlement` call (~line 1301):
- If the period's organization is on v2 (one RPC per organization per rebuild run; cache it in the function's context, **not** across requests), call `toll_sys_driver_week_tolls(org, periodAnchor, driverId)` and **replace** the toll figures with:
  - `tollChargedToDriver = owesFleetMinor/100`
  - `tollCashWashEligible = fleetOwesMinor/100`
  - `tollSpend = spendMinor/100`
  - `tollCashSpend = cashSpendMinor/100`
  - `tollTagSpend = tagSpendMinor/100`
  - `tollReimbursed = platformMinor/100`
  - a null `line` means all of them are 0.
- These are the same variables the code already persists and feeds into `computePeriodSettlement` (`tollPersonal`, `tollCashWash`), so `syncPeriodCashFromTransactions` (~2382) and the statement pass (~1684–1756) pick them up unchanged. **Check** that the statement pass doesn't overwrite them with something different for a v2 company: the v2 seal writes matching `kind 'toll'` statements, so they should agree. If they could disagree, report it.
- **If a v2 lookup fails, throw** (don't fall back to the old numbers). The rebuild then fails and is retried, and money is never computed from the wrong system.
- Put the mapping in a small pure function `v2DriverTollInputs(line)` in `supabase/functions/_fleet-server/toll_v2_settlement_inputs.ts`, and record `metadata.financeCore.tollSource = 'toll_v2' | 'legacy'` on the period so it's visible which system fed it.

## 2. After a v2 seal or reopen: the existing follow-up
In `supabase/functions/_fleet-server/toll_v2_command_controller.ts`, after a successful (non-replay) `seal_week` or `reopen_week`, call `runSealSideEffects({ organizationId: getOrgId(c), weekKey })` (`seal_side_effects.ts:18`), the same thing the old toll finish does (`toll_period_controller.tsx:985`). It rebuilds the week's open driver periods, refreshes close blockers and republishes the desk. Wrap it in try/catch: the seal already succeeded, so log a failure and still return 200.

## 3. The contract: `packages/toll-core/src/v2/weekResultV1.ts`
Add the five new fields to the `drivers` item type (with comments), and update the vitest sample.

## 4. Tests
- **Deno**, `supabase/functions/_fleet-server/toll_v2_settlement_inputs.test.ts`:
  - the mapping, including a null line → zeros and cents → dollars rounding;
  - a fake-driven test that for a **non-v2** company the rebuild path never calls `toll_sys_driver_week_tolls` (extract a small helper `resolveTollInputs(org, driver, week, legacy, deps)` if that's what it takes; **don't** add a test-only switch to the app);
  - a failed v2 lookup throws.

  Add it to the settlement step in `.github/workflows/ci.yml`.
- **SQL**, `supabase/tests/toll_v2_settlement_lines.sql` (2024 dates, same style as the other toll tests):
  1. Driver lines: a week with a tag charge to the driver (`driver_pays`), a cash charge that is fleet business, and a platform-linked charge. Check each of the 9 numbers on the driver's line.
  2. Seal as the owner, with `ledger.driver_financial_periods` rows for this driver and for a second driver with **no** tolls. Each gets a closed `kind 'toll'` statement with the right six amounts (the second all zeros), and spend − reimbursed − charged − netLoss = 0.
  3. Reopen → a draft version for each. Seal again → a new closed version, and the previous closed one becomes `restated`.
  4. `toll_sys_driver_week_tolls`: sealed vs open state, null line for an unknown driver; EXECUTE for `service_role` only.
  5. Refresh trigger: inserting an allocation, a charge and a driver-received payback for a v2 company queues one outbox row each, with the right `driver_id` / `period_anchor`. Nothing is queued for a company with v2 off, or for a charge with no driver.
  6. Check 3, every account: on a clean open week every row is ok. Plant one break per account (an allocation to the driver with no P7; a fleet allocation with no P8; a cash charge with no P3; a top-up with no P1; a fleet-received payback with no P4). Each makes that week's check 3 row fail, with the matching `*_flow` ≠ `*_expected` in `detail`.

  Add it to `.github/workflows/parts-sql-checks.yml`.

## Run (once; Docker Desktop open)
- `pnpm test:toll`;
- the settlement Deno step's files plus the new one;
- `pnpm --filter @roam/toll-core test`;
- rebuild **fleet-pay** and **fleet-toll** (the edge bundles that include the changed files) with `scripts/build-edge-bundle.mjs`, plus the manifest and route-contract checks.

If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Say exactly where the switch point was added (file:line) and whether the statement pass needed anything. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
