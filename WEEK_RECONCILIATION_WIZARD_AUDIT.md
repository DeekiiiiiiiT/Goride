# Week Reconciliation — Guided Wizard & Service-Line Split

**Rev 9 · 2026-10-21 · verification of working tree on `605087fe` (66 files uncommitted) + prod (`fleet-core` v95)**
Open items only. Earlier revisions are in git history.

## Status

R7-01 (declared coverage at upload), R7-02 (Log Cash tests in CI) and the earnings-draft cleanup are **done**. Prod has 0 driver-weeks with more than one draft, and `publishWeekStatement` now retires older drafts on write. Gates: finance-core 248/248, fleet recon 9/9, Deno 34/34, and all three security guards pass. **Fleet `tsc` 506** (+6 over baseline, see R8-01).

**Prod run (rideshare, Oct 12–18):** every step except **Close** is complete.

---

## R8-01 · Locking a fuel week always reports "Finalization failed" · High

`apps/fleet/src/pages/FuelManagement.tsx:2038-2045` still reads `weekResult`, but its declaration was removed in your uncommitted changes. These are the 6 new `tsc` errors (`TS2304 Cannot find name 'weekResult'`). The line runs **after the server has locked the week**, so it throws a `ReferenceError`; the `catch` shows *"Finalization failed: weekResult is not defined"* and returns `false`. Every successful fuel lock, including the wizard's Fuel step, will look like a failure, and users will retry a week that's already locked. Use `jobInterp` / `jobRes` for the toast counts. Gate the commit on `tsc` = 500.

## R8-02 · Declared coverage has no upper limit · Medium

`coverageGapMessage` (`packages/finance-core/src/statementCoverage.ts:109-128`) only checks that the declared range **includes** every transaction date. Nothing limits how far it extends: a one-week toll file declared as "Jan 1 – Dec 31" marks **every week of the year Covered**, which hides missing uploads in all of them.
**Fix:** cap the declared range at the file's printed statement period if it has one, otherwise at the run's week (or ≤ 31 days). Anything wider needs `recon.approve` and shows as a `warn` on the Close step ("Toll usage declared to cover 2 weeks beyond its data").

## R8-03 · Migration history has drifted again · Medium

- Prod recorded `20261021145921 fuel_period_job_sweep_cron`; the repo file is `20261021180000_fuel_period_job_sweep_cron.sql`.
- The draft cleanup exists **twice** in the repo: `20261021151239_…` (applied in prod) and `20261021200000_retire_older_week_statement_drafts.sql` (same SQL, not applied). Delete the `200000` copy.

Then run `supabase migration repair` for the cron one. Apply SQL from the repo file so the versions match.

## R8-04 · Prod is running uncommitted code again · Medium

`fleet-core` v95 contains the R7-01 code, but the source is in 66 uncommitted files (mixed with fuel and Disk IO work). Commit the recon/settlement part together with R8-01 and R8-03.

## R5-05 · Close the first run, and push one upload through the wizard · High

1. **Close preview** for Oct 12–18 (the only step left).
2. **The wizard's upload path still has never run in prod.** `recon.import_staging` = 0, and no toll has been added since 2026-10-19. Upload one real toll CSV for **Oct 19–25** through the wizard, using the new "This file covers" field, and check:
   - Sources flips to Covered for exactly the declared days;
   - one `toll_usage` event per inserted toll, none for skipped rows.

---

## Wizard ↔ Driver Settlements (added 2026-10-21)

Checked against the live Oct 12–18 run: Kenny is owed **$17,183.53** (`settlement_amount`), `settlement_paid` = 0, and every wizard step except Close shows Complete.

### R9-01 · Settlement says "Complete" while $17k is unpaid, and paying means leaving the wizard · High

`settlement_preview` is hard-coded to `actionable: 0` (`recon_routes.ts:639`), so it completes whatever is owed. Close then refuses with `SETTLEMENT_FLEET_OWES` (`closeInvariants.ts:603-613`, block), and neither `ReconSettlementStep` nor `ReconCloseStep` can pay or collect. Both only read the queues and point to Driver Settlements, which breaks the one-screen rule at the last step.
**Fix:**
- `settlement_preview.actionable` = open Pay + Collect rows for the week (the same `useSettlementQueue` data the step already shows). It completes only when the residual is 0.
- Put **Pay** and **Collect** on each driver row in the step, reusing the Cash desk dialogs and `settlementCommandsApi` (idempotency key + `expectedOutstanding`). "Awaiting bank clear" counts as paid for this step if Close accepts it.
- Keep "Open in Driver Settlements" as a secondary link.

### R9-02 · Close will also block on cash over-returned, and no step shows it · High

Kenny's Oct 12 period has `cashHeldClamped: true`, `unclampedCashHeld: −3,221.23`, so Close will add `CASH_HELD_OVER_RETURNED` (block, `closeInvariants.ts:640-651`). Trips & Earnings counts only six codes (`TRIPS_EARNINGS_BLOCKER_CODES`, `coverageInputHash.ts:30`), not this one, so it was marked done at 15:33 with `actionable: 0`.
The period was rewritten at **15:32:06**, the same second the Uber statement cash was accepted ($22,470.65 vs trip cash $19,269.38, +$3,201.27). **Accepting statement cash appears to have pushed cash held below zero.**
**Fix:**
- Give **every** block-severity close code a home step: the money lane's `CASH_*` / `SETTLEMENT_*` codes go to Trips & Earnings or Settlement. Add a test that every code in `BLOCKER_LABELS` maps to exactly one step, so new codes can't fall through.
- **Before closing this week**, explain the −3,221.23. Either the acknowledgement double-applies cash, or the over-return is real and needs a correction. Don't close until it's understood.

### R9-03 · A run never becomes "closed" · Medium

Nothing writes `recon.week_runs.state = 'closed'` / `closed_at` / `close_run_id`; only reopen has a writer (`week_close_recon.ts:338`). Two effects:
- **Tag Account has no opening balance from week 2 on.** `loadPriorTagClosingMinor` (`recon_routes.ts:920-945`) reads only prior runs with `state = 'closed'`.
- **The week list can't tell closed from open.** `GET /recon/weeks` sets state to `collecting` / `reconciling` only, and "Completed" means *all sources received* (`blockers === 0`). That's why a week with $17k unpaid lists as Completed.

**Fix:** on a successful freeze in `week_close.ts` (whether from the wizard or the Close Week tab), update the run for that line: `state = 'closed'`, `closed_at`, `close_run_id`. List weeks as Outstanding (sources missing) → In progress (sources OK, not closed) → Completed (closed).

### R9-04 · The wizard can still change a closed week · Medium

None of the recon writes check whether the week is frozen: attest, waive, attribution (which rewrites `service_line` on toll and fuel rows), step complete, and import commit. The wizard's toll commit calls `prepareTollLedgerEntry` directly, which has no sealed-period check (`refuseIfTollPeriodSealed` is only on the 9 HTTP toll routes). So the wizard can add tolls **and their `toll_usage` charges** to a frozen week.
**Fix:** one guard on every recon mutation and on the import commit (reuse `assertMovementAllowed` / `refuseIfTollPeriodSealed`) → 409 `PERIOD_FROZEN`: "Reopen the week first".

### R9-05 · Two ways to close a week · Decision

Driver Settlements → **Close Week** still closes a week without the wizard. While `SOURCE_ENFORCE` is unset (warn), that path can close a week with required CSVs missing.
**Suggest:** point that tab at the wizard's Close step for the week, and flip `SOURCE_ENFORCE=enforce` (`docs/recon-source-enforce-flip.md`) after two weeks have closed through the wizard.

---

## Noted

- Settlement is per driver-week, not per line. In a both-lines org, the Rideshare run's Settlement step would show a driver's whole week, delivery included. Deferred with Delivery.
- After the next earnings sync, re-run the "more than one draft per driver-week" query to confirm the retire-on-write code is live. The minified bundle doesn't let me confirm it.
- Delivery stays behind its readiness card. Q2 (shared-cost allocation), Q3 (payout netting) and Q5 (toll statement closing balance) wait for it.

## Order

R8-01 → R8-03 + R8-04 (one commit) → **R9-02 investigation (before closing Oct 12)** → R9-01 → R9-03 → R9-04 → R5-05 → R8-02 → R9-05 decision.
