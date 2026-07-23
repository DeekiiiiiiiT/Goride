# Business Finance Coverage Audit — What's Wired, What Isn't

A full-app sweep of RoamFleet, read as an accountant would: for every place
money actually moves, does a number show up in Business Finance, or does it
vanish into a module BF never looks at? No code changes — this is the
punch list. See also [fuel-business-finance-wiring.md](fuel-business-finance-wiring.md)
and [indrive-wallet-business-finance-wiring.md](indrive-wallet-business-finance-wiring.md)
for the two areas already covered in depth.

## The mechanism, in one paragraph

Business Finance (`fetchBusinessFinanceBundle.ts`) reads exactly one feed:
canonical `ledger_event:*` records, fetched with no event-type filter for the
whole period, then netted by domain-specific pure functions
(`tollFleetLossNetting.ts`, `fuelFleetLossNetting.ts`) into the P&L, Expenses,
and Cash & Bank tabs. **If a dollar never becomes a `ledger_event:*` row, it
does not exist to Business Finance — no matter how real, approved, or paid it
is elsewhere in the app.** Only a short allow-list of write sites currently
produce those rows: trip imports (fares/tips/platform fees), Toll
Reconciliation, Fuel entries + Consumption Reconciliation finalize, and
InDrive wallet top-ups. Everything below is graded against that one rule.

## Fully wired

- **Trip revenue & platform fees** (Uber/InDrive/Roam fare, tip, promotion,
  platform fee) — via `payment_ledger_line_controller.tsx` / trip imports →
  `fare_earning` / `tip` / `platform_fee` canonical events → P&L gross,
  platform fees, platform split.
- **Tolls** — full offset/netting pipeline (see prior audit). Reference
  implementation.
- **Fuel** — full offset/netting pipeline (see prior audit), now matching
  Tolls.
- **Bank deposits / driver payouts / driver cash** — `payout_bank`,
  `payout_cash`/`driver_payout`, driver-financial-period cash figures feed
  Cash & Bank and Driver Balances.

> **Status update (2026-07-21):** A remediation program is now underway. See
> [business-finance-recognition-policy.md](business-finance-recognition-policy.md)
> for the accounting contract governing the fixes below.
>
> **Implementation update (2026-07-21):** Fixed Expenses, generic posted
> transactions, posted Maintenance spend, and Budgets vs Actual are now wired.
> Historical rows can be synced from Business Finance → Expenses. See
> [business-overhead-finance-wiring.md](business-overhead-finance-wiring.md).

## Partially wired

- **InDrive Wallet loads** — ~~hardcoded `walletLoads = 0`~~ **Now wired
  (2026-07-20).** `fetchBusinessFinanceBundle.ts` sums canonical `wallet_credit`
  via `computeIndriveWalletLoadsFromLedgerEntries`, and a fleet-wide
  "drivers short on wallet balance" risk signal (`walletShortDriverCount`) is
  populated from `GET /ledger/indrive-wallet/fleet`. Loads are shown as a
  transfer (Cash & Bank / Overview Transfers), not a P&L expense. See the
  dedicated wiring doc.

## Original gaps — remediation status

### 1. Fixed Expenses — wired 2026-07-21

Real, persisted, per-vehicle recurring costs: `apps/fleet/src/types/expenses.ts`
defines `FixedExpenseConfig` (amount, frequency, category, start/end date),
entered via `AddFixedExpenseDialog.tsx` on the vehicle detail page, saved
through `expenseService.ts` to real server routes —
`GET/POST /fixed-expenses`, `DELETE /fixed-expenses/:vehicleId/:id`
(`index.tsx:9774-9807`). This is not a stub; owners can (and presumably do)
record vehicle insurance premiums, lease/financing payments, GPS tracker
subscriptions, software subscriptions, permits & licenses, and equipment
rental here today.

Fixed Expense rules now expand into idempotent `fixed_expense` occurrences on
scheduled due dates. P&L, Expenses, Overview, and Budgets read those canonical
events. A schedule does not move Cash & Bank; only a posted payment does.

### 2. Maintenance spend — auto-posted from service logs 2026-07-23

`FleetMaintenanceHub` Compatible Parts still shows supplier quotes
(`supplier_part_offer`) — procurement estimates, never posted to the books.
**Realized** maintenance spend is logged via Fleet Maintenance → Log service
(`maintenance_records` with `status=Completed` and `cost > 0`). The server
appends a canonical `maintenance` ledger event
(`sourceType: financial_event`, idempotency `maintenance_record:{id}|maintenance`).
Quotes remain excluded. Business Finance → Expenses still accepts one-off
"Other vehicle-related (not a service log)" rows for edge cases; shop work
should use Log service so history and P&L stay in sync.

### 3. Budgets — moved to Business Finance 2026-07-21

The existing backend (`GET/POST /budgets`) is now used by Business Finance →
Budgets. Actuals come from the canonical ledger. The Dashboard no longer
calculates budget actuals from trip-note guesses.

### 4. Manually-logged transactions — generic bridge wired 2026-07-21

The general transaction save path (`index.tsx`, `POST /transactions`) now
canonicalizes posted business expenses/income in addition to
`"InDrive Wallet Credit"`. The
`TransactionCategory` (`types/data.ts:586`) defines a much longer list that's
presumably selectable wherever transactions get added: `Registration`,
`Bank Charges`, `Office Expenses`, `Software/Subscription`, `Marketing`,
`Vehicle Payment`, `Supplier Payment`, `Tax Payment`, `Cash Collection Fees`,
`Bonuses`, `Other Income`, plus ad-hoc one-off `Insurance`/`Maintenance`
entries logged as a transaction rather than through Fixed Expenses. If an
admin logs "Vehicle registration renewal — $340" or "Office rent — $1,200" as
a transaction today, it maps to `operating_expense`, `maintenance`, or
`other_income`. Pending/Rejected/Void rows do not enter the books. Fuel, Toll,
Wallet, and trip-derived categories keep their specialized writers.

### 5. Canonical event types — partially remediated

`LedgerEventType` (`types/data.ts:604`) includes `maintenance`, `insurance`,
`cash_collection`, `surge_bonus`, `wallet_debit`, `cancelled_trip_loss`,
`refund_expense`, and `other` as valid values. A repo-wide search for every
`maintenance` now has a real writer. Several future-product types still have
no emitter and remain type-contract placeholders. `businessFinancePnL.ts`'s
`sumExpenseRowsFromEvents` even lists `refund_expense` in its `RECOGNIZED`
set, netting an event type that no code path has ever produced — dead logic
waiting for a writer that doesn't exist. Worth knowing before anyone assumes
"the type is declared" means "the data flows."

## Dashboard source-of-truth conflict — resolved 2026-07-21

`Dashboard.tsx` now labels the former Financials tab **Revenue** and limits it
to ledger-sourced revenue analytics. Budgets moved to Business Finance. The
orphan `FinancialsPage.tsx` and mock transaction generator were deleted, so
Business Finance is the sole P&L / cash / expense story.

## Lower-priority / not yet real features (no action needed today)

- **Driver bonuses/incentives/penalties/fines** — no complete real write path
  exists today. Not a wiring gap until that product is built.
- **Vehicle depreciation / capex schedule** — no depreciation tracking found;
  lease payments can be tracked as Fixed Expenses, but financing principal is
  not depreciation. A proper asset/depreciation schedule remains a separate,
  lower-priority accounting feature.

## Remediation result (accountant's view)

1. **Done:** Fixed Expenses → canonical ledger.
2. **Done:** Dashboard conflict resolved (Revenue analytics only; Budgets moved).
3. **Done:** InDrive Wallet load aggregation and short-driver risk.
4. **Done:** Generic posted transaction → canonical bridge.
5. **Done:** Posted Maintenance actuals and Budgets vs ledger actual.
6. **Remaining future scope:** depreciation/capex schedules and any not-yet-real
   bonus/fine products.
