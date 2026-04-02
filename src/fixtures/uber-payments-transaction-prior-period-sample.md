# Sample `payments_transaction` rows — prior-period adjustments (Phase 5)

Redacted values. Use with automated tests in `src/utils/uberPriorPeriodPhase5.test.ts` and manual import QA.

## Scenario A — Two adjustments, same trip (160 total)

Two rows, same **Trip UUID**, Description **`trip fare adjust order`**, Tip column **80** each (Uber often duplicates payout in Tip).

| Row | Trip UUID (redacted) | Description               | Tip col | Expected `uberPriorPeriodAdjustment` after merge |
|-----|----------------------|---------------------------|---------|--------------------------------------------------|
| 1   | `aaaaaaaa-…`         | trip fare adjust order    | 80      | accumulates toward trip                          |
| 2   | `aaaaaaaa-…`         | trip fare adjust order    | 80      | **sum = 160** for that trip                      |

## Scenario B — Completed trip with rider tip

| Description            | Tip col | Expected in `fareBreakdown.tips` / SSOT tips |
|------------------------|---------|---------------------------------------------|
| trip completed order   | 5.00    | 5.00 (not prior-period)                     |

## Scenario C — Payment-only prior period (no `trip_activity` row)

If the UUID appears only in `payments_transaction`, import still creates/merges the trip; **`uberPriorPeriodAdjustment`** should still populate when Description matches. Validate in app after import (no separate automated CSV merge test here).

## Reconciliation

For a period, **ledger** sum of `prior_period_adjustment` (Uber) should match the **sum of prior-period row amounts** in imported `payments_transaction` for that driver and date range (see `solution.md` Phase 3).

**Note:** `payments_driver.csv` **Total Earnings:Tip** may not break out prior-period adjustments; do not expect statement tip line alone to match app “Adjustments from previous periods.”
