# Expense Hub migration & cutover

Companion to [expense-hub-architecture.md](expense-hub-architecture.md).

## Feature flag

`expense_hub_v1` (server `FEATURE_FLAGS.EXPENSE_HUB_V1`):

- **Off (default):** Hub reads work; Hub writes return 403; vehicle Fixed Expenses stays editable.
- **On (per org):** Hub writes enabled; vehicle Fixed Expenses becomes read-only with **Manage in Expense Hub**.

Rollback: disable the flag for the org (or globally). No historical ledger rows are deleted.

## Steps

1. `POST /expense-hub/migrate/dry-run` — groups existing `fixed_expense:*` into proposed rule groups; reports pending vs already migrated.
2. Review sample groups and annual projections.
3. `POST /expense-hub/migrate/shadow-compare` — compare legacy vs hub annual projections.
4. Enable `expense_hub_v1` for one organization.
5. `POST /expense-hub/migrate/apply` with `{ "confirm": true }` — creates rule groups + assignments, stamps `managedByExpenseHub` / `ruleGroupId` on configs, adapts legacy paid transactions as `expense_doc:legacy_*` **without re-posting**.
6. Re-run shadow-compare; accountant sign-off on one closed month.
7. Enable for remaining organizations.

## Guarantees

- Existing `fixed_expense` / `operating_expense` / `maintenance` canonical events are not rewritten.
- Fuel and Toll writers are untouched.
- Cancelled/paused rules only remove **future** occurrences.
