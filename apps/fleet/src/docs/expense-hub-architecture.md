# Expense Hub — Accounting & Architecture Contract

Companion to [business-finance-recognition-policy.md](business-finance-recognition-policy.md).
Owns fleet-wide recurring rules, one-off bills, approvals, and payments inside Business Finance.
**Jamaica vendor master + expense category taxonomy** are Roam platform catalogs in Super Admin
(Accounting), consumed read-only by all fleet apps. Fuel and Toll remain specialist desks.

## Surface map

| Surface | Owns |
|---------|------|
| Super Admin → Accounting → Vendor Database | Verified Jamaica company catalog (`platform_vendor:*`) |
| Super Admin → Pending vendor requests | Fleet requests → approve / merge / reject |
| Super Admin → Expense categories | Shared operating-expense taxonomy |
| RoamFleet → Expense Hub | Overview · Register · Approvals · Recurring expenses |

Fleet users **request** missing vendors (pending); they do not create permanent private vendors.

## Non-negotiables

1. A dollar exists to Business Finance only as a canonical `ledger_event:*` (and, for Hub
   documents, a matching balanced journal that **projects** those events).
2. Fuel, Toll, wallet, trip, and settlement writers are never called from the Hub.
3. Historical canonical rows are never rewritten during migration.
4. Recurring schedule due dates recognize P&L; cash moves only on real payments.
5. Vehicle pages are projections of Hub data after cutover — not a second write path.
6. Verified vendors are platform-global (no org stamp), same class as gas stations.

## Document lifecycle

```
Draft → Submitted → Approved | Rejected → Posted → Partially Paid | Paid → Voided
```

| Transition | Who | Effect |
|---|---|---|
| Submit | creator (`expenses.create`) | Queues for approval |
| Approve | different user (`expenses.approve`) unless owner policy allows self-approve | Posts accrual journal + canonical expense |
| Reject | approver | Requires reason; no ledger post |
| Record payment | `expenses.pay` | Posts cash/AP settlement journal once |
| Paid-now create | create + approve + pay in one idempotent command | Both journals in one request |
| Void | `expenses.approve` | Reversing journal; reason required; history retained |

## Journal → canonical projection

New Hub documents write a small balanced journal, then project compatible canonical events:

| Journal lines | Canonical event |
|---|---|
| Dr Expense / Cr AP (accrual on approve) | `operating_expense`, `maintenance`, or `fixed_expense` |
| Dr AP / Cr Cash (payment) | No second P&L hit — cash movement only via payment metadata for Cash & Bank |
| Paid-now (cash purchase) | One expense event + payment metadata on the same document |

Idempotency keys:

- Accrual: `expense_doc:{documentId}|accrual|{version}`
- Payment: `expense_payment:{paymentId}|settle`
- Rule occurrence: existing `fixed_expense:{configId}|{ymd}|{versionTag}`

## Rule groups vs vehicle assignments

- `ExpenseRuleGroup` = master recurring definition (category, vendor, cadence, amount template).
- `ExpenseRuleAssignment` = one vehicle link; may override amount/dates.
- Each assignment maintains a projected `FixedExpenseConfig` (`fixed_expense:{vehicleId}:{id}`)
  so the existing occurrence engine and vehicle reads keep working.

## Fuel / Toll / Maintenance Hub

| Source | Hub role |
|---|---|
| Fuel | Read-only card + deep link to Fuel Overview |
| Tolls | Read-only card + deep link to Toll Reconciliation |
| Maintenance Hub quotes | Never post; realized spend is a Hub `ExpenseDocument` (category Maintenance) |
| Legacy paid `transaction:*` | Adapter as “Legacy paid expense”; no re-post |

## Feature flag

`expense_hub_v1` gates Hub writes and vehicle-page read-only mode. Disabled = legacy
vehicle Fixed Expenses edit path unchanged.

## Vendor catalog migration

`POST /admin/platform-vendors/migrate-legacy` (Super Admin): lifts org `expense_vendor:*` /
`expense_category:*` into `platform_vendor:*` / `platform_expense_category:*` with name-based
dedupe and document/rule `vendorId` remap.

## Future depreciation boundary

`assetId` / capitalization fields are reserved and inactive. Financing principal and
vehicle purchase cost are not operating expense. Depreciation is a later Fixed Assets
subledger that posts into the same journal/canonical projection.
