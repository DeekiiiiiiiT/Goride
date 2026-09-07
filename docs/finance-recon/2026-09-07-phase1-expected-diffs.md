# Phase 1 "stop-the-bleeding" expected diffs (2026-09-07)

Golden diffs for the Phase 1 money fixes. Each row is **behaviour before → after**.
Signs follow the ledger convention: a positive driver share/deduction is money the
driver owes; a negative value means the fleet owes the driver.

---

## C-1 — Signed fuel shares (no more `Math.abs`)

**Where:** `driver_financial_periods.ts` (snapshot fallback), `fuel_financial_reset.ts` (event posting).

| Scenario | Before (wrong) | After (correct) |
|---|---|---|
| Report `driverShare = -250` (fleet owes driver) | aggregated as `+250` deduction (driver over-charged $500 swing) | aggregated as `-250` (driver credited) |
| Report `companyShare = -120` | `+120` fleet share | `-120` fleet share |
| `fuel_deduction` event, deduction `= 300` | posted `amountMajor -300` only when `> 0` | posted `amountMajor -300` when `|300| > 0.005`, `direction outflow` |
| `fuel_deduction` event, deduction `= -80` | **not posted** (`> 0` guard) → driver silently loses $80 credit | posted `amountMajor +80`, `direction inflow` (credit to driver) |
| `fuel_fleet_share` event | posted with **no** debit/credit account keys | posted `debit platform:fleet_fuel_expense`, `credit platform:driver_payable` (M-2 partial) |

**Golden:** a week with `driverShare = -250` moves the driver's fuel line from
`+250` to `-250` → **$500** correction on net payout.

> Scope note: the *event* aggregation loop in `driver_financial_periods.ts` still
> reads magnitude for the dominant positive case (per audit scope, C-1 there is the
> snapshot fallback only). Negative-deduction weeks are now posted with the correct
> sign at the source (`fuel_financial_reset.ts`).

---

## C-7 — Signed settlement pass-through (no `Math.max(0, …)` clamps)

**Where:** `finance-core/driverPeriodSettlement.ts`, `driver_financial_periods.ts` (lines ~1052, ~1191).

Fields now signed: `tipsPaidToDriver`, `tollPersonal`, `tollCashWash`,
`fuelCredits`, `cashWrittenOff`, `settlementPaid`, and persisted `toll_charged_to_driver`.

| Scenario | Before (clamped) | After (signed) |
|---|---|---|
| `tollPersonal = -300` (toll refund) | clamped to `0` → cash owed unchanged | cash owed `-300` → gross settlement `+300` to driver |
| `fuelCredits = -150` | clamped to `0` | adjusted cash balance `+150` |
| `settlementPaid = -50` | clamped to `0` | passes through `-50` |
| persisted `toll_charged_to_driver = -40` | stored `0` | stored `-40` |

**Helper:** `collectSettlementSignDrift(input)` returns the names of any of the six
clamped fields that arrived negative, so callers can write drift/audit records
instead of swallowing the sign.

**Golden:** driver with a `-300` toll refund and otherwise-zero week gains **$300**
of gross settlement instead of `$0`.

---

## H-6 — Fuel snapshot matched by anchor equality

**Where:** `driver_financial_periods.ts` snapshot fallback.

`if (!(start >= periodAnchor && start <= periodEnd))` → `if (start !== periodAnchor)`.

| Scenario | Before | After |
|---|---|---|
| Period `2026-08-25`, reports for `08-25` and `08-18` both `start ≤ periodEnd` | **both** counted → fuel double-counted across weeks | only `08-25` report counted |

**Golden:** a driver with two adjacent finalized reports no longer double-books the
prior week's fuel into the current period.

---

## H-5 — `Fixed_Amount` uses `getCategoryCoverageSplit`

**Where:** `fuel-core/weekSnapshotEngine.ts` ratio path.

| Scenario (`coverageValue = 600` allowance) | Before (flat 50%) | After (allowance split) |
|---|---|---|
| $1,000 spend, no stamped ratios | driver `500` / company `500` | driver `400` / company `600` |
| $200 spend stamped 100% driver + $800 unstamped | driver `500` / company `500` | driver `400` / company `600` (stamped honoured, allowance applied to unstamped) |

`companyCoveragePercentFromFuelRule` still returns `50` for `Fixed_Amount` but is
**no longer reached** for `Fixed_Amount` weeks — documented as a percentage-only
fallback.

**Golden:** the $1,000 / $600-allowance week shifts **$100** from driver to company.

---

## H-3 — Fuel reversal is append-only + scoped

**Where:** `fuel_enterprise_settlement.ts` `reverseEnterpriseFuelSyncForSnapshot`.

| Concern | Before | After |
|---|---|---|
| Money rows | `kv.del` destroyed transactions (no audit trail, unreplayable) | offsetting reversal txns posted (`amount` negated, `metadata.reversesTransactionId`, `metadata.reversalReason`, idempotent via `reversal:<id>`) |
| Re-run safety | delete-then-recreate races | already-reversed originals skipped → idempotent |
| Entry reset scope | any `Verified` entry for the driver in the date window | **only** entries whose `metadata.finalizedByReport` matches this report's id candidates |

**Golden:** re-running a snapshot reset produces exactly one reversal per original
money row and leaves entries owned by other reports untouched.

---

## Verification

```
npx vitest run \
  packages/finance-core/src/driverPeriodSettlement.test.ts \
  packages/fuel-core/src/weekSnapshotEngine.test.ts
```

Covers: Fixed_Amount ratio parity (H-5), signed settlement incl. negative
`tollPersonal` (C-7), and `collectSettlementSignDrift`.
