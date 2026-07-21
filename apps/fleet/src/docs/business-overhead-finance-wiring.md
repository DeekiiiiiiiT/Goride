# Business Overhead → Business Finance

**Status: implemented 2026-07-21.**

This closes the coverage-audit gaps for recurring vehicle costs, posted
maintenance spend, generic business transactions, budget-vs-actual, and the
legacy Financials conflict.

## Accounting model

| Source | Canonical event | P&L | Cash & Bank |
|---|---|---|---|
| Fixed Expense rule occurrence | `fixed_expense` | On scheduled due date | No movement until a real payment is posted |
| Posted maintenance transaction | `maintenance` | Expense | Payment outflow |
| Other posted business expense | `operating_expense` | Expense | Payment outflow |
| Other posted income | `other_income` | Income | Receipt inflow |
| Budget | None | Never | Never |

Wallet loads remain transfers and are excluded from P&L.

## Write paths

- Fixed Expense create/edit generates dated occurrences through a rolling
  five-year horizon. Idempotency:
  `fixed_expense:{configId}|{occurrenceYmd}|{versionTag}`.
- Edit rebuilds that config's occurrence schedule.
- Delete keeps incurred history through today and removes future occurrences.
- Posted generic transactions map by category; Pending/Rejected/Void rows never
  post.
- Fuel, Tolls, Wallet and trip-derived categories remain on their specialized
  writers, preventing double count.

## Owner surfaces

- Business Finance → P&L: Fixed overhead, Maintenance, Other operating
  expenses, Other income.
- Business Finance → Expenses: category cards + canonical detail.
- Business Finance → Cash & Bank: real business payment outflows/receipts;
  scheduled fixed costs excluded.
- Business Finance → Budgets: targets compared with ledger actuals.
- Dashboard `Financials` is now `Revenue`; budgets moved to Business Finance.

## Historical sync

Fleet Owners can use **Business Finance → Expenses → Sync historical**.

Equivalent API:

```json
POST /make-server-37f42386/ledger/canonical-backfill
{
  "dryRun": false,
  "types": "fixed_expenses,generic_transactions"
}
```

The operation is organization-scoped and idempotent.

## Verification

1. Add monthly vehicle insurance due inside the selected BF period.
2. Confirm Insurance / Fixed overhead and operating profit change.
3. Confirm Cash & Bank does **not** move from the schedule.
4. Log a completed Maintenance expense from BF → Expenses.
5. Confirm Maintenance P&L and Business payments both change once.
6. Re-run historical sync; inserted count should be zero and rows should be
   reported as skipped.
7. Delete the recurring rule; prior/today history remains and future
   occurrences disappear.

