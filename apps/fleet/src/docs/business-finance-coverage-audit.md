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

## Partially wired

- **InDrive Wallet loads** — canonical `wallet_credit` events exist and are
  already fetched into `fetchBusinessFinanceBundle.ts`'s in-memory event list,
  but the aggregation is a hardcoded `walletLoads = 0` — the CashBankTab card
  always reads $0.00 regardless of real activity. No fleet-wide "drivers
  short on wallet balance" risk signal exists either. (Full detail in the
  dedicated doc.)

## Not wired at all — real money, zero visibility in Business Finance

### 1. Fixed Expenses (Insurance, Lease/Financing, Security/GPS, Software, Permits, Equipment) — biggest gap found

Real, persisted, per-vehicle recurring costs: `apps/fleet/src/types/expenses.ts`
defines `FixedExpenseConfig` (amount, frequency, category, start/end date),
entered via `AddFixedExpenseDialog.tsx` on the vehicle detail page, saved
through `expenseService.ts` to real server routes —
`GET/POST /fixed-expenses`, `DELETE /fixed-expenses/:vehicleId/:id`
(`index.tsx:9774-9807`). This is not a stub; owners can (and presumably do)
record vehicle insurance premiums, lease/financing payments, GPS tracker
subscriptions, software subscriptions, permits & licenses, and equipment
rental here today.

None of it ever becomes a canonical ledger event. `fetchBusinessFinanceBundle.ts`
never calls `expenseService`/`getFixedExpenses` and there is no
`fixed_expense_*` write path into `ledger_event:*`. Every dollar of insurance,
lease, and subscription cost an owner has entered is invisible in the P&L,
Expenses tab, and Overview risk signals. The Expenses tab's "Maintenance"
category is explicitly `tracked: false, amount: null` — but Insurance,
Lease, Security, Software, Permits, and Equipment aren't even represented as
untracked placeholders; they don't appear in Business Finance's category list
(`ExpenseCategoryId` = `'fuel' | 'toll' | 'maintenance' | 'other'`) at all.

### 2. Maintenance spend (parts/labor, not the Fixed Expense "Maintenance Contract" category)

`FleetMaintenanceHub.tsx` tracks supplier quotes and unit pricing per
maintenance task (`Suppliers / price` column, `unit_price`/`currency` per
order) — real procurement cost data. It never posts to `transaction:*`,
`financial_ledger.ts`, or the canonical ledger. Business Finance already
handles this honestly (Maintenance P&L line and Expenses category are both
explicitly `null`/`tracked: false` rather than silently showing $0), but the
underlying cost data that *should* eventually fill that line already exists
in the Maintenance module and nothing pipes it out.

### 3. Budgets

Real backend (`GET/POST /budgets`, `index.tsx:9643-9662`), seeded with
Fuel/Maintenance/Insurance/Fleet Cleaning limits, but only ever read by the
legacy Dashboard "Financials" tab (see below). Business Finance has no
budget-vs-actual view anywhere, even for the categories (Fuel, Tolls) it
already tracks accurately.

### 4. Manually-logged transactions outside the allow-list

The general transaction save path (`index.tsx`, `POST /transactions`) only
canonicalizes one category: `"InDrive Wallet Credit"`. But
`TransactionCategory` (`types/data.ts:586`) defines a much longer list that's
presumably selectable wherever transactions get added: `Registration`,
`Bank Charges`, `Office Expenses`, `Software/Subscription`, `Marketing`,
`Vehicle Payment`, `Supplier Payment`, `Tax Payment`, `Cash Collection Fees`,
`Bonuses`, `Other Income`, plus ad-hoc one-off `Insurance`/`Maintenance`
entries logged as a transaction rather than through Fixed Expenses. If an
admin logs "Vehicle registration renewal — $340" or "Office rent — $1,200" as
a transaction today, it's saved to `transaction:{id}` and then simply never
looked at again by anything financial. There is no generic
"any expense/income transaction → canonical ledger" bridge — only the
purpose-built ones (toll, fuel, wallet credit) exist.

### 5. Canonical event types that are declared but never emitted

`LedgerEventType` (`types/data.ts:604`) includes `maintenance`, `insurance`,
`cash_collection`, `surge_bonus`, `wallet_debit`, `cancelled_trip_loss`,
`refund_expense`, and `other` as valid values. A repo-wide search for every
`eventType: "..."` write site turns up **zero** emitters for any of these —
they exist only in the type contract. `businessFinancePnL.ts`'s
`sumExpenseRowsFromEvents` even lists `refund_expense` in its `RECOGNIZED`
set, netting an event type that no code path has ever produced — dead logic
waiting for a writer that doesn't exist. Worth knowing before anyone assumes
"the type is declared" means "the data flows."

## A conflicting source of truth, currently live

`Dashboard.tsx` renders a `"financials"` tab (`FinancialsView.tsx`, also
reachable standalone via `FinancialsPage.tsx`) that blends three things: (a)
a real ledger-sourced `fleetSummary` on the main Dashboard call site, (b)
**entirely fabricated data** — `generateMockTransactions()` in
`financialService.ts` invents random Fuel/Maintenance/Insurance/Bank Fee
amounts, random driver "Incentive"/"Fine" transactions, and a hardcoded
`$25,571.82` opening balance, all clearly placeholder — and (c) the real
Budgets feature from #3 above. `FinancialsPage.tsx` calls `FinancialsView`
with *no* `fleetSummary` at all, meaning that route is 100% mock data end to
end. Both are currently reachable in the app. An owner who opens the
Dashboard's Financials tab and the new Business Finance section side by side
will see two different, disagreeing numbers for the same business — and one
of them is partly synthetic. This should be resolved (retire, gate behind a
flag, or clearly relabel as "legacy/demo") before it's mistaken for a second
opinion on real numbers.

## Lower-priority / not yet real features (no action needed today)

- **Driver bonuses/incentives/penalties/fines** — appear only in
  `generateMockTransactions()`'s fake data; no real write path exists
  anywhere in the server. Not a wiring gap because there's no real feature to
  wire yet — flag only if/when it's built.
- **Vehicle depreciation / capex schedule** — no depreciation tracking found;
  vehicle financing is folded into the Fixed Expense "Lease" category (see
  #1), which is itself unwired. One fix (wiring Fixed Expenses) covers this
  too.

## Priority order (accountant's view)

1. **Fixed Expenses → canonical ledger** (#1) — largest, most concrete dollar
   amount currently invisible; real recurring costs an owner already trusts
   are being tracked "somewhere."
2. **Resolve the Dashboard Financials / mock-data conflict** — not a missing
   feature, but an active correctness risk: two disagreeing dashboards, one
   partly fake, both currently visible.
3. **InDrive Wallet loads aggregation** (already scoped, cheapest fix — data's
   already in memory).
4. **Generic transaction → canonical bridge** (#4) — turns every future
   manually-logged expense/income category into something Business Finance
   can see, instead of adding one allow-listed category at a time.
5. **Maintenance and Budgets** (#2, #3) — real underlying data, lower
   urgency than #1 since Business Finance already labels Maintenance as
   honestly untracked rather than silently wrong.
