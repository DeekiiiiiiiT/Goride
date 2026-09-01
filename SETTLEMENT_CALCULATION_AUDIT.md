# Settlement Calculation Audit — Driver Week Reconciliation

**Date:** 2026-08-31
**Scope:** Every calculation between raw trip/toll/fuel/cash data and the "Reconciled" state on the Driver Settlements desk.
**Method:** Static read of the full calculation chain, cross-checked against live figures visible on the Driver Settlements screen.
**Nothing in the codebase was modified.** This document is findings only.

---

## 0. Executive summary

The **core formula is sound and single-sourced.** `computePeriodSettlement` lives in `packages/finance-core` and the Deno edge function re-exports it verbatim (`supabase/functions/_fleet-server/driver_period_settlement.ts` is a two-line re-export). Server and client cannot drift on the formula itself. The fuel finalize path has proper idempotency keys, generations, and reversal-on-re-finalize. That is genuinely good engineering.

**However, the *inputs* to that formula are assembled by several different code paths that do not agree with each other.** I found 5 issues that can move money on a real week, plus 9 that are latent or structural.

The single most damaging one: **any "Log cash" / "Collect" / "Write-off" action on a week silently deletes that week's tips from the driver's net payout** (§1.1). This fires on the most common operator action in the app.

The second: **"fully reconciled" is gated on fuel only.** Toll reconciliation status is computed, displayed, and then ignored by the finalization gate (§1.3).

### Severity table

| # | Finding | Effect | Confidence |
|---|---|---|---|
| 1.1 | Cash sync drops tips from payout | **Underpays driver** by full tip amount | Confirmed |
| 1.2 | Cash sync writes unclamped `cash_still_held` vs a `>= 0` DB constraint | **Collect action hard-fails** on over-returned weeks | Confirmed |
| 1.3 | Finalization gate is `fuelFinalized` only — tolls not required | Pays out on unreconciled tolls | Confirmed |
| 1.4 | Pending/unlinked trip tolls credited as cash wash before verification | **Overpays driver** on unverified credits | Confirmed |
| 1.5 | `settlementPaid` clamped to `min(paid, gross)` | **Hides fleet overpayment** | Confirmed |
| 2.1 | Toll cash-wash double-netted in `getPeriodSettlementComponents` | Understates driver credit (fallback paths) | Confirmed |
| 2.2 | Three different week-bucketing rules feed one subtraction | Cross-week leakage | Confirmed |
| 2.3 | `\|\|` zero-fallbacks revert legitimate zeros to stale values | Wrong deduction | Confirmed |
| 2.4 | Tier lookup falls back to *lowest* tier when cumulative exceeds all tiers | **Underpays driver** ~5-10% of gross | Confirmed (latent) |
| 2.5 | Withheld tips vanish from both driver share and fleet share | P&L hole | Confirmed |
| 2.6 | `receiptUrl` alone marks a toll "cash paid" | Overpays driver | Confirmed |
| 2.7 | `rebuildAll` skips signed weeks but outbox rewrites them | Inconsistent immutability | Confirmed |
| 3.x | Epsilon inconsistency, `foldPayoutCashByWeek` dedupe, alias-ID mismatch, rounding asymmetry, openBalance netting | Minor / cosmetic | Confirmed |

---

## 1. Critical — will move money on a real week

### 1.1 Every cash action strips tips from the driver's payout

**Files:** [driver_financial_periods.ts:1230-1240](supabase/functions/_fleet-server/driver_financial_periods.ts#L1230-L1240) vs [driver_financial_periods.ts:634-645](supabase/functions/_fleet-server/driver_financial_periods.ts#L634-L645)

There are two places that call `computePeriodSettlement` on the server.

The **full rebuild** passes tips:

```ts
const settled = computePeriodSettlement({
  driverShare, fuelDeduction,
  baseCashOwed: cashCollected, baseCashPaid: cashReturned,
  tollCashWash: tollCashSpend,
  tollPersonal: Math.max(0, tollChargedToDriver),
  fuelCredits: fuelFleetShare,
  cashWrittenOff, settlementPaid: settlementPaidRaw,
  tipsPaidToDriver: share.tipsPaidToDriver || 0,   // ← present
});
```

The **cash sync** — which runs on every Log Cash, Collect, Payout and Write-off — does not:

```ts
const settled = computePeriodSettlement({
  driverShare: Number(existing.driver_share) || 0,
  fuelDeduction: Number(existing.fuel_deduction) || 0,
  baseCashOwed: Number(existing.cash_collected) || 0,
  baseCashPaid: cashReturned,
  tollCashWash: Number(existing.toll_cash_spend) || 0,
  tollPersonal: Math.max(0, Number(existing.toll_charged_to_driver) || 0),
  fuelCredits: Number(existing.fuel_fleet_share) || 0,
  cashWrittenOff,
  settlementPaid: settlementPaidRaw,
  // tipsPaidToDriver missing → defaults to 0
});
```

`computePeriodSettlement` computes `netPayout = driverShare − fuelDeduction + tipsPaid`. With `tipsPaid` defaulting to 0, the sync then writes the reduced value straight to the row:

```ts
payout_net: round2(settled.netPayout),
settlement_amount: round2(settled.settlement),
```

**Failure scenario.** A week has $580 in tips with the quota met. Rebuild writes `payout_net = driverShare − fuel + 580`. An operator then logs a $5,000 cash collection against that week. The sync recomputes and writes `payout_net = driverShare − fuel`. The $580 is gone from both `payout_net` and `settlement_amount`. The driver is short $580 and there is no error, no warning, and no line item explaining it. `driver_share` is untouched, so the Reconciled table still shows the original share — only the payout column silently drops.

This is confirmed live in the Driver Settlements screenshot: on every row, `Gross − (Fleet share + Driver share)` equals a clean round number ($160, $580, $1,200, $460, $0), which is exactly the tips for that week. Tips are real, they are in these weeks, and they are the amount at risk.

**Also missing from the sync:** `payout_status` and `status` are never updated, so a week that flips from `awaiting_cash` to fully settled keeps a stale payout status until the next full rebuild.

---

### 1.2 Cash sync writes a negative into a `>= 0` check constraint

**Files:** [driver_financial_periods.ts:1257](supabase/functions/_fleet-server/driver_financial_periods.ts#L1257), [20260728120000_driver_financial_periods_settlement_paid.sql:20-28](supabase/migrations/20260728120000_driver_financial_periods_settlement_paid.sql#L20-L28)

The full rebuild clamps, deliberately, with a comment naming the constraint:

```ts
// Pocket cash cannot go negative (DB cash_nonneg). Over-return vs collected
// is fleet-owes on settlement_amount, not a negative held balance.
const cashStillHeld = round2(Math.max(0, settled.adjCashBalance));
```

The cash sync does not:

```ts
cash_still_held: round2(settled.adjCashBalance),   // ← unclamped
```

The constraint is live:

```sql
ADD CONSTRAINT driver_financial_periods_cash_nonneg_check
CHECK (
  COALESCE(cash_collected, 0) >= 0
  AND COALESCE(cash_returned, 0) >= 0
  AND COALESCE(cash_still_held, 0) >= 0
  ...
);
```

**Failure scenario.** `adjCashBalance = cashOwed − cashPaid − fuelCredits − cashWrittenOff`. Any week where the driver returned more cash than they held — or, far more commonly, where fleet fuel share plus cash returned exceeds passenger cash — produces a negative. The `UPDATE` violates the constraint, Postgres raises 23514, `syncPeriodCashFromTransactions` throws, and the collection is not reflected on the period. The transaction row exists in the ledger but the settlement desk never moves. From the operator's seat this looks like "I logged the cash and nothing happened."

This is not theoretical: the codebase already tracks `cashHeldClamped: settled.adjCashBalance < -0.005` in period metadata, which means negative `adjCashBalance` is a known, expected state.

---

### 1.3 "Fully reconciled" only checks fuel

**File:** [driver_financial_periods.ts:663-680](supabase/functions/_fleet-server/driver_financial_periods.ts#L663-L680)

```ts
let settlementStatus = "pending";
if (fuelFinalized) {
  if (Math.abs(settlementAmount) < 1) settlementStatus = "settled";
  else if (settlementAmount > 0) settlementStatus = "company_owes";
  else settlementStatus = "driver_owes";
}

let payoutStatus = "pending";
if (fuelFinalized) {
  payoutStatus = cashStillHeld > 0.5 ? "awaiting_cash" : "finalized";
}
```

Both money-facing statuses key on `fuelFinalized` alone. `tollStatus` and `tollWorkflowActionable` are computed immediately above and used only for `periodStatus` (`open`/`closed`), which is not what the settlement desk or the payout UI read.

The client mirrors this: `periodsToPayoutPeriodRows` sets `isFinalized: !!p.fuelFinalized` ([useDriverFinancialPeriods.ts:134](apps/fleet/src/hooks/useDriverFinancialPeriods.ts#L134)), and `getPeriodSettlementComponents` releases the payout on exactly that flag:

```ts
const netPayoutApplied =
  row.isFinalized || (opts?.includeEstimate && row.isEstimate) ? row.netPayout : 0;
```

**Failure scenario.** Finalize fuel on a week that still has 12 unmatched tolls and 3 open claims. `settlementStatus` becomes `company_owes`, the week appears in the Pay queue with a real dollar figure, and it can be paid. The tolls get reconciled two weeks later, which changes `tollChargedToDriver` and `tollCashSpend` — but the driver has already been paid on the pre-reconciliation number.

This is the exact gap your question describes. The system has all the information needed to gate on it (`tollWorkflowActionable > 0`, `tollUnmatchedCount > 0`, `disputeRefundUnmatched > 0`) and uses it for `periodStatus` — but the payout gate doesn't consult it.

---

### 1.4 Unverified trip tolls are credited to the driver as cash wash

**File:** [driver_financial_periods.ts:385-407](supabase/functions/_fleet-server/driver_financial_periods.ts#L385-L407)

```ts
const isCashWash = status === "cash_wash";
const isOpenUnlinked = !status || status === "pending";
if (!isCashWash && !isOpenUnlinked) continue;
...
tollSpend += amt;
tollCashSpend += amt;      // ← both branches credit cash
if (isCashWash) {
  tollReconciledCount++;
} else {
  tollUnmatchedCount++;    // ← explicitly unreconciled
  tollWorkflowActionable++;
}
```

Trips with **no resolution at all** (`!status`) or an explicitly `pending` one add their full toll amount to `tollCashSpend`. That value is passed straight into the formula as `tollCashWash`, where `cashPaid = baseCashPaid + tollCashWash` — it reduces what the driver owes, immediately, before anyone has confirmed the toll was real or that the driver paid it in cash.

The same row is simultaneously counted as `tollUnmatchedCount++`. The code knows it is unverified and credits it anyway.

**Failure scenario.** Uber reports $4,000 of trip toll charges on 40 trips. None are linked or resolved yet. The driver's cash-owed drops $4,000 on the spot. Combined with §1.3 (fuel finalize alone releases the payout), the week can be paid out on that $4,000 credit. If reconciliation later determines half were personal-use or phantom, the money is already out the door.

Contrast the handling of `phantom` and `expense_logged`, which are correctly skipped. The gap is specifically `pending` and null.

---

### 1.5 Overpayment is silently absorbed by the `settlementPaid` clamp

**File:** [driverPeriodSettlement.ts:44-47](packages/finance-core/src/driverPeriodSettlement.ts#L44-L47)

```ts
const settlementPaid =
  grossSettlement > 0.005 ? round2(Math.min(settlementPaidIn, grossSettlement)) : 0;
const settlement =
  grossSettlement > 0.005 ? round2(grossSettlement - settlementPaid) : grossSettlement;
```

Two distinct losses here:

**(a) When gross drops below what was already paid,** `Math.min` discards the excess. Fleet owes the driver $10,000, pays $10,000, then a late cash import raises `cashCollected` and gross falls to $7,000. Now `settlementPaid = 7,000` and `settlement = 0`. The week reads as cleanly settled. The $3,000 the fleet actually overpaid is not recorded anywhere in the projection. The only trace is the raw `Driver Payouts` transaction in the ledger, which no settlement surface reconciles against.

**(b) When gross is negative (driver owes),** `settlementPaid` is forced to `0` outright. Any prior payout tagged to that week disappears from the projection entirely. A week that swings from fleet-owes to driver-owes after reconciliation loses all record of what was already disbursed.

The clamps are defensible as a guard against nonsense values, but silently zeroing a real, cleared payout transaction is not a safe failure mode for money. There is no exception surface, no warning, and no `overpaid` status.

---

## 2. Structural — real, but conditional or latent

### 2.1 Toll cash-wash is netted twice

**Files:** [driverSettlementMath.ts:27-30](packages/finance-core/src/driverSettlementMath.ts#L27-L30), [buildLedgerPayoutPeriodRows.ts:321-322](apps/fleet/src/utils/buildLedgerPayoutPeriodRows.ts#L321-L322)

The row builder already nets the wash against what is supposedly inside Cash Paid:

```ts
const washAlreadyInPaid = cashPaidBreakdown?.tollCredits ?? 0;
const cashTollWashExtra = Math.max(0, periodCashTollWash - washAlreadyInPaid);
// ... returned as  cashTollWash: cashTollWashExtra
```

Then `getPeriodSettlementComponents` nets it again against the same number, from the same row:

```ts
const washAlreadyInPaid = Math.max(0, br?.tollCredits ?? 0);
const explicitWash = Math.max(0, row.cashTollWash ?? 0);
const tollCashWash = Math.max(0, explicitWash - washAlreadyInPaid);
```

Worse, the premise is wrong in the first place. `cashPaidBreakdown.tollCredits` maps from `CashWeekData.breakdown.tollExpenses` — but `computeWeeklyCashSettlement` sets `amountPaid = week.allocatedPaid` (tagged Log Cash rows only). Toll credits are **not** inside `amountPaid`:

```ts
// cashSettlementCalc.ts:329-330
return weeksData.map(week => {
  const amountPaid = week.allocatedPaid;
```

The doc comment on `CashPaidBreakdown` — *"components that sum to Cash Paid (amountPaid)"* — is stale. So a value that isn't in Cash Paid is subtracted from the wash credit twice.

**Why this is §2 and not §1:** the primary weekly path is `periodsToPayoutPeriodRows`, which hardcodes `tollCredits: 0`, and the legacy cash-toll accumulator is zeroed when `unifiedTollSettlementEnabled` is on. The bug fires on the **fallback** paths — first paint before the shared projection loads, daily/monthly period types, and any tenant with the unified-toll flag off. `kennyWeekSettlement.golden.test.ts` passes `tollExpenses: 0`, so the golden test cannot catch it.

**Related, same function:** the "status preview" in the builder is documented as matching the settlement math but no longer does — it uses the wash once (correctly) and omits `cashWrittenOff` entirely:

```ts
// "Still-held preview for status (same formula as getPeriodSettlementComponents)."
const stillHeldPreview =
  Math.round((passengerCash + tollPersonal - baseCashPaid - cashTollWashExtra - effectiveFuelCredits) * 100) / 100;
```

The status badge and the money column can therefore disagree on the same row.

---

### 2.2 Three different week-bucketing rules feed one subtraction

The settlement formula subtracts cash from earnings from tolls. Those three inputs are bucketed into weeks by three different rules:

| Input | Rule | Location |
|---|---|---|
| Tolls | `fleetCalendarDay(date, timezone)` — fleet-local | [driver_financial_periods.ts:334](supabase/functions/_fleet-server/driver_financial_periods.ts#L334) |
| Uber payout cash | `periodKeyFor(e, fleetTz)` — fleet-local | [payoutCashDedupe.ts:50](packages/finance-core/src/payoutCashDedupe.ts#L50) |
| Fares, tips, trip cash | `String(date).slice(0,10)` — **raw string, no timezone** | [periodShareCash.ts:58-59, 128, 207](packages/finance-core/src/periodShareCash.ts#L58-L59) |

```ts
function ymd(d: string | undefined): string {
  return String(d || '').slice(0, 10);
}
```

**Failure scenario.** Jamaica is UTC−5. A trip completing at `2026-06-29T02:00:00Z` is Sunday 9pm local — it belongs to the week ending 2026-06-28. `fleetCalendarDay` correctly puts its toll in that week. `ymd()` slices `2026-06-29` and puts its fare, its tip, and its trip cash in the *following* week. Every Sunday-night trip splits its revenue and its costs across two settlement weeks. In a fleet running late-night rides this is a persistent multi-hundred-dollar weekly discrepancy in both directions, and it never nets to zero for any individual week.

Same class of issue on the client: `buildLedgerPayoutPeriodRows` matches a cash week to a payout period by fuzzy date proximity when the exact key misses —

```ts
if (Math.abs(differenceInCalendarDays(keyDate, ckDate)) <= 2) {
  cw = cv;
  break;   // first match in Map iteration order, not nearest
}
```

A ±2-day window that takes the first hit in hash order can attach the wrong week's cash to a period. The identical pattern appears again for bank-settled in [useDriverPayoutPeriodRows.ts:226-232](apps/fleet/src/hooks/useDriverPayoutPeriodRows.ts#L226-L232).

---

### 2.3 `||` fallbacks turn legitimate zeros into stale values

**File:** [useDriverFinancialPeriods.ts:213-224](apps/fleet/src/hooks/useDriverFinancialPeriods.ts#L213-L224)

```ts
fuelDeduction: Number(p.fuelDeduction) || row.fuelDeduction,
fuelCredits:   Number(p.fuelFleetShare) || row.fuelCredits,
driverShare:   Number(p.driverShare)   || row.driverShare,
netPayout:     Number(p.payoutNet)     || row.netPayout,
tripCount:     Number(p.tripCount)     || row.tripCount,
driverSharePercent: Number(p.driverSharePercent) || row.driverSharePercent,
```

`0 || x` evaluates to `x`. A server value that is legitimately zero is discarded in favour of a locally-computed one from a different source.

**Failure scenario.** A driver buys no fuel this week. The server correctly projects `fuelDeduction: 0`. The overlay throws that away and substitutes `row.fuelDeduction` — which, for a non-finalized week, is the *draft* fuel estimate from `draftFuelByPeriod`. The driver is deducted for fuel they did not buy. `?? ` is the correct operator here; `||` is not.

Same pattern in [DriverSettlementsPage.tsx:302](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L302) and [:669-675](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L669-L675).

---

### 2.4 Tier lookup silently drops a top earner to the lowest tier

**File:** [periodShareCash.ts:35-41](packages/finance-core/src/periodShareCash.ts#L35-L41)

```ts
const match = sorted.find((t) => {
  if (t.maxEarnings === null || t.maxEarnings === undefined) {
    return cumulative >= t.minEarnings;
  }
  return cumulative >= t.minEarnings && cumulative < t.maxEarnings;
});
return match || sorted[0];
```

If the highest tier has a finite `maxEarnings` and the driver's month-to-date cumulative exceeds it, **no tier matches**, and the fallback is `sorted[0]` — the *lowest* tier, sorted ascending by `minEarnings`.

The shipped defaults are safe (`tier_3` Gold has `maxEarnings: null`). But `legacyEarnings.tiers` comes from `preferences:general`, which is admin-editable through the UI. An admin who types a ceiling into the top tier converts the best-performing driver's rate from 30% to 25% with no error and no visible cause. On $100k gross that is a $5,000 underpayment in one week.

The fallback should be the highest tier, not the lowest.

---

### 2.5 Withheld tips are money that exists nowhere

**File:** [periodShareCash.ts:88-93, 153-155](packages/finance-core/src/periodShareCash.ts#L88-L93)

```ts
tipsPaidToDriver: quotaMet ? tips : 0,
tipsWithheld:     quotaMet ? 0 : tips,
```
```ts
const driverShare = round2(grossRevenue * (pct / 100));
const fleetShare  = round2(grossRevenue - driverShare);
const earningsGross = round2(grossRevenue + tips);
```

`fleetShare` is derived from `grossRevenue`, which excludes tips. `driverShare` likewise. Tips reach the driver only via `netPayout = driverShare − fuelDeduction + tipsPaid`.

When the quota is missed, `tipsPaidToDriver = 0` and the tips are withheld — but they were never added to `fleetShare` either. The money is in `earningsGross` and in neither share. It is recorded in `metadata.financeCore.tipsWithheld` and nowhere else in the accounting.

This is also directly visible in production. On the Driver Settlements screen, `Gross ≠ Fleet share + Driver share` on five of the nine visible rows, by exactly $160 / $580 / $1,200 / $460. Anyone reconciling that table against the books will find that gap and be unable to explain it from the columns shown.

---

### 2.6 A receipt image is treated as proof of cash payment

**File:** [driver_financial_periods.ts:68-71](supabase/functions/_fleet-server/driver_financial_periods.ts#L68-L71)

```ts
function isCashPaid(tx: any): boolean {
  const pm = String(tx?.paymentMethod || "").toLowerCase();
  return pm.includes("cash") || !!tx?.receiptUrl;
}
```

Every toll classified this way lands in `tollCashSpend`, which becomes `tollCashWash`, which credits the driver's cash-owed. A **tag** toll — paid from the fleet's tag balance, not the driver's pocket — with any receipt image attached is credited to the driver as though they paid cash for it.

The same permissive rule appears client-side (`isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl` in [cashSettlementCalc.ts:230](apps/fleet/src/utils/cashSettlementCalc.ts#L230)), so it is consistent — consistently wrong. Attaching a receipt to a tag toll for documentation is a completely ordinary operator action with no visible warning that it moves money.

---

### 2.7 Signed weeks are immutable to one rebuild path and mutable to two others

**File:** [driver_financial_periods.ts:1083-1088, 1150-1163](supabase/functions/_fleet-server/driver_financial_periods.ts#L1083-L1088)

```ts
function isSignedWeekRow(r) {
  return !!r.fuel_finalized
      || String(r.status||"") === "closed"
      || String(r.payout_status||"").toLowerCase() === "finalized";
}
// rebuildAllPeriodsForDriver:
if (signedAnchors.has(anchor)) { skippedSigned++; continue; }
```

`rebuildAllPeriodsForDriver` refuses to touch a signed week without `force`. But:

- `processFinancialOutbox` calls `rebuildDriverFinancialPeriod` directly with **no signed check** — any queued event rewrites a signed week.
- `finalizeFuelWeek` calls it directly too ([fuel_financial_reset.ts:346](supabase/functions/_fleet-server/fuel_financial_reset.ts#L346)).
- `syncPeriodCashFromTransactions` updates signed rows unconditionally.

So a signed week is protected from a bulk repair but freely rewritten by an event. That is backwards: bulk repair is the path you *want* to be able to fix a bad week, and per-event rewrite is the path most likely to silently change a figure the driver was already paid on.

Combined with §1.3, the practical consequence is: finalize fuel → week is "signed" → bulk rebuild will never repair it → tolls reconciled later never flow into the settlement unless something happens to enqueue an outbox job for that exact anchor.

---

## 3. Minor — worth knowing, low dollar impact

**3.1 Four different epsilons.** `MONEY_EPS = 0.005` is the house standard. But `settlementStatus` uses `Math.abs(settlementAmount) < 1` (a full dollar), `payoutStatus` uses `cashStillHeld > 0.5` (fifty cents), and `cashSettlementCalc` status uses `amountPaid >= week.amountOwed - 0.01` and `> amountOwed + 1`. A week with $0.99 residual reads "settled". Cosmetic, but it means "Reconciled" does not mean "zero".

**3.2 `foldPayoutCashByWeek` can collapse genuine duplicate remittances.** [payoutCashDedupe.ts:40-49](packages/finance-core/src/payoutCashDedupe.ts#L40-L49) — dedupe key is `day|amount` across the entire event list. Two real same-day, same-amount Uber cash remittances without distinct idempotency keys become one. Real cash disappears from `passengerCash`, which *reduces* what the driver owes.

**3.3 Alias-ID mismatch between the two server paths.** `loadRebuildContext` resolves `uberDriverId` / `inDriveDriverId` aliases via `resolveDriverAliasIds`; `syncPeriodCashFromTransactions` filters on `String(t?.driverId) === driverId` only ([:1215-1217](supabase/functions/_fleet-server/driver_financial_periods.ts#L1215-L1217)). A payout or collection recorded under an alias is seen by rebuild and invisible to sync — the two paths compute different `cashReturned` for the same week.

**3.4 `round2` is asymmetric across zero and loses `x.xx5`.** `Math.round` rounds half toward +∞: `round2(0.125) = 0.13` but `round2(-0.125) = -0.12`. Systematically half a cent in the fleet's favour on negative settlements. Separately, `round2(1.005) = 1.00` (not 1.01) because `1.005 * 100 = 100.49999999999999` in IEEE754. Sub-cent, but it means `round2` is not the exact half-up function the comment implies.

**3.5 `getAdjCashBalance` disagrees with the real formula.** [driverSettlementMath.ts:4-6](packages/finance-core/src/driverSettlementMath.ts#L4-L6) returns `cashBalance − fuelCredits`, omitting `cashWrittenOff`, while `computePeriodSettlement` subtracts both. Any surface still calling the helper shows a different still-held figure than the settlement.

**3.6 `openBalance` nets opposing weeks to zero.** [computePayoutSummaryTotals.ts:34-42](apps/fleet/src/utils/computePayoutSummaryTotals.ts#L34-L42) sums signed settlements. A driver with +$30k on one open week and −$30k on another shows an open balance of $0 while both weeks are genuinely unsettled. The desk-level KPIs split the directions correctly; this per-driver card does not.

**3.7 `cashSourceMismatch` is computed and then ignored.** When Uber's statement cash disagrees with trip-level cash, the delta is recorded in `metadata.financeCore.cashSourceMismatch` and the statement silently wins. Nothing gates on it, nothing surfaces it. A $5,000 statement/trip disagreement reconciles clean.

**3.8 `tollReimbursed` never enters the settlement formula.** It is computed, persisted, and used only for display in the Expenses tab. **This needs a business answer, not a code fix:** if Uber's toll reimbursement arrives inside `fare_earning` gross, then the driver is (a) commissioned on it, (b) credited the cash wash for the same toll, and (c) not charged — a triple benefit. If the reimbursement is booked separately to the fleet, the current treatment is correct. Worth confirming against one real reimbursed toll.

**3.9 Blank status counts as cleared.** [driverCashPayment.ts:79-85](packages/finance-core/src/driverCashPayment.ts#L79-L85) — `isClearedDriverCashPayment` treats `status === ''` as cleared for cash payments. An unverified cash row with a blank status reduces what the driver owes.

**3.10 `effectiveFuelCredits` takes a `max` of two different concepts.** [buildLedgerPayoutPeriodRows.ts:275-277](apps/fleet/src/utils/buildLedgerPayoutPeriodRows.ts#L275-L277) — `Math.max(txFuelCredits, fleetShare)`. If both a real Fuel Reimbursement transaction *and* a finalized fleet share exist, `max` silently discards one. They are not alternates; they are separate facts.

**3.11 Duplicate finalized fuel reports would double-deduct.** [driver_financial_periods.ts:554-570](supabase/functions/_fleet-server/driver_financial_periods.ts#L554-L570) — the non-event fallback loops all `Finalized` reports whose `weekStart` falls in the period and **sums** them, with no dedupe by report id or week. Two finalized snapshots for the same week double `fuelDeduction`. The primary event path is protected by idempotency keys and generations; only this fallback is exposed.

---

## 4. What is genuinely correct

Worth stating plainly, since the list above is long:

- **One formula, one place.** `computePeriodSettlement` is defined once in `finance-core` and re-exported by the edge function. There is no second implementation to drift.
- **The formula itself is right.** `cashOwed = passengerCash + personalToll`, `cashPaid = cashReturned + cashWash`, `adjCash = balance − fuelCredits − writeOffs`, `gross = netPayout − adjCash`. The signs and the ordering are correct.
- **Fuel finalize is well-built.** Idempotency keys, close generations (`:g2`, `:g3`), amount-match short-circuit, and full reversal before re-posting. This is the strongest part of the system.
- **Reversal handling in `financial_events` is correct** — `reverses_event_id` and `reversed_at` are both honoured when filtering active events.
- **Cash Returned is properly narrow.** It is tagged Log Cash rows only; fuel reimbursements and toll credits are explicitly excluded and documented as such. That discipline is the reason most of the toll double-counting risk stays theoretical.
- **`netDriverTollCharges` correctly nets reversals** rather than summing absolute values — a bug that was clearly found and fixed once already.
- **`cashStillHeld` is clamped for display while `settlementAmount` stays unclamped**, with `unclampedCashHeld` preserved in metadata. That is the right call, in the rebuild path.

---

## 5. Suggested order of work

Not implemented — this audit changed no code.

1. **§1.1** — add `tipsPaidToDriver` to the sync call. One line, highest dollar impact, fires constantly.
2. **§1.2** — clamp `cash_still_held` in the sync to match the rebuild. One line, unblocks a hard failure.
3. **§1.4** — restrict the trip cash-wash credit to `status === 'cash_wash'` only; count `pending`/null toward `tollUnmatchedCount` without crediting cash.
4. **§1.3** — decide the policy: should `payoutStatus`/`settlementStatus` require `tollWorkflowActionable === 0`? This is a business decision, not a bug fix, but the current behaviour is almost certainly not what "fully reconciled" is meant to mean.
5. **§1.5** — add an `overpaid` state rather than silently clamping. At minimum, surface the discarded delta.
6. **§2.3** — `||` → `??` across the overlay functions. Mechanical, low risk.
7. **§2.4** — change the tier fallback from `sorted[0]` to the highest tier.
8. **§2.2** — unify on `fleetCalendarDay` / `periodKeyFor` everywhere; retire raw `ymd()` for week bucketing.
9. **§2.1** — remove one of the two nettings, and correct the stale `CashPaidBreakdown` doc comment.

**Test coverage gap worth closing regardless:** `kennyWeekSettlement.golden.test.ts` is the one end-to-end golden, and it passes `tollExpenses: 0`, `tollCredits: 0`, no tips, no write-offs, and no prior settlement paid — i.e. every field implicated in §1.1, §1.5, §2.1 and §2.5 is zeroed. A second golden with all of them non-zero would have caught four of the five critical findings.
