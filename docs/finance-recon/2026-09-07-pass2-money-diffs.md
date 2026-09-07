# Pass 2 (Pass B) money-fix golden diffs (2026-09-07)

Close Program Pass 2 "money" fixes. Each row is **behaviour before → after**.
Ledger sign convention: a positive driver share/deduction/charge is money the
driver owes; a negative value means the fleet owes / credits the driver.

---

## C-1 — Fuel events path sign (no more `Math.abs`)

**Where:** `supabase/functions/_fleet-server/fuel_financial_reset.ts`,
`supabase/functions/_fleet-server/driver_financial_periods.ts` (events aggregation).

`financial_events.amount_minor` is **signed** (positive = credit to driver,
negative = outflow). A `fuel_deduction`/`fuel_fleet_share` event is posted as
`amountMajor = -share`, so the Expenses projection must **negate** the stored
amount to recover the driver-debt-positive convention (matching the snapshot path).

| Scenario | Before (wrong) | After (correct) |
|---|---|---|
| `report.driverShare = -250` (fleet owes driver) | `Math.abs` → posted/aggregated as `+250` (driver over-charged, $500 swing) | signed `-250` → posted `amountMajor +250`, `direction inflow` (credit) |
| `report.companyShare = -120` | `+120` fleet share | signed `-120` fleet share |
| Events agg, active `fuel_deduction` (deduction `= 300`, stored `amountMajor -300`) | `+ Math.abs(major) = +300` | `- major = +300` (unchanged for positive case) |
| Events agg, active `fuel_deduction` (deduction `= -80`, stored `amountMajor +80`) | `+ Math.abs(major) = +80` (driver debited $80) | `- major = -80` (driver credited $80) |
| `sumsFromActiveFuelEvents` staleness compare | forced magnitude | preserves sign (spend types stay magnitude) |

**Golden:** a week with `driverShare = -250` moves the driver's fuel line from
`+250` to `-250` → **$500** correction on net payout, whether the projection reads
events or the snapshot fallback (both now agree in sign).

---

## C-7 — Signed charged-to-drivers pass-through (no `Math.max(0, …)` floors)

**Where:** `driver_financial_periods.ts` `syncPeriodCashFromTransactions` (`tollPersonal`),
`packages/toll-core/src/tollFleetLossNetting.ts` `sumTollChargedToDriversFromEvents`.

| Scenario | Before (clamped to $0) | After (signed) |
|---|---|---|
| `existing.toll_charged_to_driver = -300` (net reversal/refund) | `Math.max(0,…)` → `0` → driver loses the credit | passes `-300` → gross settlement `+300` to driver |
| Wallet events: charged `100`, reversed `300` | `round2(Math.max(0, -200)) = 0` | `round2(-200) = -200` (net credit survives) |

**Golden:** a driver whose toll charges were net-reversed by $200 keeps the **$200**
credit instead of it being silently floored away.

---

## C-2 — Floor misc before split + over-explained hard blocker

**Where:** `apps/fleet/src/services/fuelCalculationService.ts` (both `splitAllCategoryCosts`
call sites), `apps/fleet/src/utils/fuelFinalizeGating.ts`, `FuelPeriodWizard`,
`FuelBulkFinalizeDialog`.

- Misc is floored with `floorMiscForSplit(...).miscForSplit` before it hits the
  split — a negative (fleet-owes) residual can no longer be split as driver cash.
- `isOverExplainedFuelWeek(totalSpend, misc)` (`|misc| > 25% of spend`) is now a
  **hard** finalize blocker (`hasOverExplainedBlockers`), included in
  `hasBlockingWarnings` and **not** overridable by the finance-warning ack.

| Scenario | Before | After |
|---|---|---|
| `misc = -40` on `$100` spend | split as `Math.abs` → driver debited ~$40 | floored to `0` for split; week flagged over-explained (40% of spend) → finalize refused |
| `misc = 60` on `$100` spend (60%) | finalizes as real cash | hard-blocked in wizard + bulk (`Blocked — over-explained week`) |
| `misc = 20` on `$100` spend (20%) | finalizes | finalizes (within 25% gate) |

**Golden:** the RECONCILIATION headline week (residual that flipped a driver to a
`-$27,898.73` debit) can no longer be finalized and never splits its residual.

---

## C-3 / C-4 — Toll identity (LOCKED: chargedToDrivers IS P&L recovery)

**Where:** `packages/toll-core/src/tollWeekNetting.ts`,
`supabase/functions/_fleet-server/toll_period_controller.tsx`,
`apps/fleet/src/components/toll-tags/reconciliation/TollFinancialOverviewCards.tsx`.

Redefined so the four-card identity closes by construction and matches the Close
Program (`toll_week_seal.ts` fallback + `finance-core/closeInvariants.ts`):

```
netLoss  = tagSpend + cashWashSpend − platformReimbursed − disputeRecovered − chargedToDrivers
residual = spend − reimbursed − chargedToDrivers − netLoss   (≈ 0 by construction)
```

| Scenario | Before | After |
|---|---|---|
| Spend `500`, charged-to-drivers `300` | `netLoss = 500`, `residual = -300` (identity broke) | `netLoss = 200`, `residual = 0` (identity closes) |
| Spend `200`, charged `300` | `netLoss = 200`, residual `-300` | `netLoss = -100` (over-recovered), `clipped = true`, `residual = 0` |
| Headline `netTollLoss` (controller) | floored fleet loss (ignored wallet recovery) | **signed** week netting `netLoss`; totals sum signed nets; response surfaces `netTollLossClipped` / `overRecoveredAmount` / `clippedWeekCount` / `identityResidual` |
| Net Toll Loss card, `netLoss < 0` | showed a rose "loss" of a negative number | shows **"Net Toll Recovery"** in emerald with `|netLoss|` + "fleet over-recovered — net credit" |

**Golden:** a week that charges drivers more than fleet toll spend reports a signed
**net recovery** (credit) instead of an inflated or floored loss, and the four
reconciliation cards always reconcile to a clean P&L identity.

---

## Verification

```
# toll-core (run from repo root)
npx vitest run \
  packages/toll-core/src/tollWeekNetting.test.ts \
  packages/toll-core/src/tollFleetLossNetting.test.ts

# fleet (run from apps/fleet)
npx vitest run \
  src/utils/fuelFinalizeGating.test.ts \
  src/components/fuel/reconciliation/FuelBulkFinalizeDialog.test.tsx \
  src/components/fuel/reconciliation/FuelPeriodWizardShell.test.tsx
```

Covers: signed toll netting + folded charged-to-drivers recovery (C-3/C-4),
signed `sumTollChargedToDriversFromEvents` (C-7), and the over-explained hard
finalize blocker incl. the negative-residual case (C-2).
