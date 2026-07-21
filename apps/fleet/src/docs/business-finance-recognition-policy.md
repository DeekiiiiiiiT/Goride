# Business Finance — Money Recognition Policy (accounting contract)

Governs the Business Finance coverage program: how overhead, manual costs,
maintenance, and budgets reach the owner books. Companion to
[business-finance-coverage-audit.md](business-finance-coverage-audit.md),
[fuel-business-finance-wiring.md](fuel-business-finance-wiring.md), and
[indrive-wallet-business-finance-wiring.md](indrive-wallet-business-finance-wiring.md).

## The one rule

A dollar exists to Business Finance only when it is a canonical `ledger_event:*`
row. Business Finance never reads module KV/config directly for P&L. Every new
money stream must post a canonical event, or it stays invisible.

## Recognition (when cost hits Profit & Loss)

| Money stream | Recognized on | Notes |
|---|---|---|
| Trip fares / tips / fees | Trip/statement event date | Existing |
| Fuel (net) / Tolls (net) | Ops event date + offsets | Existing |
| Driver payouts | Payout event | Existing |
| **Fixed expenses** (insurance, lease, GPS, software, permits, equipment) | **Schedule due date** of each occurrence | P&L reflects the obligation as it comes due; independent of whether a payment was logged |
| **Generic manual expenses/income** | Transaction date | Bridged from `transaction:*` on save |
| **Maintenance parts/labor** | Completed + amount-known date | Quotes never post; only realized spend |
| **Budgets** | Never posted | Targets only; read-side overlay vs ledger actuals |

## Cash vs P&L (do not conflate)

- P&L recognizes cost when **due/incurred** (occurrence date).
- Cash & Bank moves only on a **real payment/transfer** event. A recurring
  schedule alone never creates a bank outflow — otherwise the bank balance
  would drift from reality.
- Wallet top-ups (`wallet_credit`) remain **transfers**, excluded from P&L.

## Fixed-expense occurrence model

- Each `FixedExpenseConfig` expands into dated occurrences by cadence
  (`daily|weekly|monthly|quarterly|annually|one_time`).
- Event: `eventType: 'fixed_expense'`, `direction: 'outflow'`,
  `sourceType: 'financial_event'`, `sourceId: {configId}`, `category`
  (normalized), `vehicleId`, org-stamped.
- **`driverId` sentinel:** overhead is fleet-level, not a driver cost. Use the
  reserved id `"fleet"` (the append validator requires a non-empty `driverId`).
- **Idempotency key:** `fixed_expense:{configId}|{occurrenceYmd}|v{version}`.
  `version` increments when amount/frequency/dates change so stale occurrences
  can be voided and re-posted without double counting.

## Edit / delete rules (insert-only ledger)

- The ledger is append-only; corrections are made by delete-by-source +
  re-append, never in-place mutation.
- **Edit a rule:** delete this `sourceId`'s occurrences in the affected range
  and re-post from the new config.
- **Delete a rule:** remove future occurrences; already-incurred past
  occurrences are retained as history unless an explicit void is requested.
- Generic transaction delete: `deleteCanonicalLedgerBySource('transaction', [id])`.

## Vocabulary normalization

Legacy UI synonyms/casing collapse to one canonical vocabulary before posting
(`normalizeExpenseFrequency`, `normalizeExpenseCategory` in
[`types/expenses.ts`](../types/expenses.ts)): e.g. `Tracking → Security`,
`License → Permits`, `Yearly → annually`, `One-time → one_time`.

## Guardrails

- Never change settlement, bank-confirm, fuel, or toll math while wiring
  overhead. Business Finance is read-only aggregation.
- New event types must be added to the **server** allow-list
  (`VALID_CANONICAL_EVENT_TYPES` in
  [`ledger_canonical.ts`](../supabase/functions/server/ledger_canonical.ts))
  before any writer emits them, or append validation fails.
- Maintenance stays `tracked: false` in Business Finance until a realized-spend
  writer exists — show "Not tracked yet", never a fake $0.
