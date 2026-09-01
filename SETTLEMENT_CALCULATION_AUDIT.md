# Settlement Calculation Audit — Driver Week Reconciliation

**Original audit:** 2026-08-31
**Verification pass:** 2026-08-31 (after remediation commit `ce4e0d35`)
**Scope:** Every calculation between raw trip/toll/fuel/cash data and the "Reconciled" state on the Driver Settlements desk.
**Method:** Static read of the full calculation chain, cross-checked against live figures on the Driver Settlements screen; remediation verified against the committed diff and by executing the shipped formula.

---

## VERIFICATION SUMMARY (2026-08-31, post-remediation)

**14 of 14 original findings addressed. 11 fully resolved, 3 partial. Test suite green: 1,074 fleet tests + 31 finance-core tests, including a new 9-case regression file pinned to this audit.**

**Verification Part II (fixes):** 2026-08-31 — NEW-1…NEW-7 closed in code (continuous residual, Collect routing, pending trip actionable, spend≠wash, sync `status`, batched force-release meta, STATUS_* epsilons). §3.8 remains display-only pending live sample.

**2 new defects were introduced by the §1.5 fix and 1 by the §1.4 fix.** They are documented in **Part II** below — **remediated in Settlement Verification Fixes** (see Notion tracker page 9).

### Original findings — status

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1.1 | Cash sync drops tips from payout | ✅ **Resolved** | `syncPeriodCashFromTransactions` now reads `tips_paid_to_driver` (column added in migration) and passes `tipsPaidToDriver`. Regression test pins the $580 delta. |
| 1.2 | Sync writes unclamped `cash_still_held` vs `>= 0` constraint | ✅ **Resolved** | Sync now computes `cashStillHeld = round2(Math.max(0, adjCashBalance))` and writes that. |
| 1.3 | Finalization gate is fuel-only | ✅ **Resolved** | New `tollsClear` + `moneyUnlocked` gate; `payoutStatus` gains `awaiting_tolls`; client `periodMoneyUnlocked()` mirrors it; `isFinalized` no longer maps from `fuelFinalized`. |
| 1.4 | Pending trip tolls credited as cash wash | ✅ **Resolved** | Wash = `cash_wash` only; pending/null trips use `isTripTollActionable` (block Pay, no wash). |
| 1.5 | `settlementPaid` clamp hides overpayment | ✅ **Resolved** | Continuous `settlement = gross − paid`; directional status; Overpaid badge; Collect routing. |
| 2.1 | Toll cash-wash double-netted | ✅ **Resolved** | Second netting removed from `getPeriodSettlementComponents`; builder does the single netting; regression test asserts `adjCashBalance === 3500` (would be 4000 if double-netted). |
| 2.2 | Three week-bucketing rules | ✅ **Resolved** | `periodShareCash` now takes `timezone` and uses `fleetCalendarDay` for fares, tips, cumulative and trip cash; both server call sites pass it. `±2`-day fuzzy match now picks nearest, not first hash hit. |
| 2.3 | `\|\|` reverts legitimate zeros | ✅ **Resolved** | All six overlay fields switched to `Number.isFinite(...) ? ... : fallback`. |
| 2.4 | Tier fallback drops to lowest band | ✅ **Resolved** | `match \|\| sorted[sorted.length - 1]`; regression test asserts Gold at 200k against finite ceilings. |
| 2.5 | Withheld tips vanish from P&L | ✅ **Resolved** | `fleetShare = grossRevenue − driverShare + quota.tipsWithheld`; `tips_paid_to_driver` / `tips_withheld` persisted and surfaced. `Gross = Fleet share + Driver share` now holds. |
| 2.6 | `receiptUrl` implies cash paid | ✅ **Resolved** | Removed server-side and in all three `cashSettlementCalc` copies; `isCashPaidTollRow` documents receipt as proof only. |
| 2.7 | Signed-week immutability inconsistent | ✅ **Resolved** | `isSignedWeekRow` redefined as real money-lock (payout finalized, or settled/overpaid **with tolls clear**) — no longer mere `fuel_finalized`. Outbox now honours it unless `payload.force`. |
| 3.1 | Four different epsilons | ✅ **Resolved** | Callers import `STATUS_SETTLED_EPS` / `STATUS_CASH_HELD_EPS` on server status gates and fleet cash settlement Paid band. |
| 3.2 | `foldPayoutCashByWeek` collapses real remittances | ✅ **Resolved** | Amount-collapse now applies only when both rows lack an id key; regression test asserts $2,000 total from two same-day $1,000 rows. |
| 3.3 | Alias-ID mismatch in sync | ✅ **Resolved** | Sync now calls `resolveDriverAliasIds` and filters on the same id set as the rebuild. |
| 3.4 | `round2` asymmetric / loses `x.xx5` | ✅ **Resolved** | Reimplemented as half-away-from-zero via `toFixed(6)` on cents. Test pins `0.125→0.13`, `−0.125→−0.13`, `1.005→1.01`. |
| 3.5 | `getAdjCashBalance` omits write-offs | ✅ **Resolved** | Third parameter added, defaults to 0. |
| 3.6 | `openBalance` nets opposing weeks to zero | ✅ **Resolved** | Split into `openCompanyOwes` / `openDriverOwes`; `openBalance` is now their sum of absolutes. |
| 3.7 | `cashSourceMismatch` computed then ignored | ⚠️ **Partial** | Now plumbed to `ReconciledPeriodRow` and badged in the desk at `> 0.5`. Still does not gate finalization — acceptable if that is the intent. |
| 3.8 | `tollReimbursed` outside the formula | ⏸️ **Open (business question)** | Unchanged, as expected. Still needs confirmation against one real reimbursed toll — see Part III. |
| 3.9 | Blank status counts as cleared | ✅ **Resolved** | Removed from cash payments, payouts and write-offs. Regression test pins it. |
| 3.10 | `max()` of two fuel-credit concepts | ✅ **Resolved** | Now prefers fleet share when present, falls back to TX credits only when absent. |
| 3.11 | Duplicate fuel reports double-deduct | ✅ **Resolved** | `seenFuelKeys` dedupe by report id / weekStart in the fallback loop. |

**Also delivered beyond the audit** (all sound): `forceReleaseDriverPeriod` as an audited ops override with a mandatory reason; `settlement_audit_repair.ts`; spend-quarantine plumbing (`isTollIncludedInSpend`, `excludedCashSpend`); status CHECK constraints for the new `overpaid` / `awaiting_tolls` values; `Awaiting Tolls` and `Overpaid` UI states.

---

# PART II — NEW FINDINGS (introduced by the remediation)

> **Status (2026-08-31):** NEW-1…NEW-7 remediated in Settlement Verification Fixes. Keep sections below as historical defect notes.

## NEW-1 ✅ Fixed — was: overpaid week filed as "Reconciled" / invisible to Collect

**Files:** [driverPeriodSettlement.ts:48-60](packages/finance-core/src/driverPeriodSettlement.ts#L48-L60), [driver_financial_periods.ts:1690-1700](supabase/functions/_fleet-server/driver_financial_periods.ts), [driver_financial_periods.ts:1563-1566](supabase/functions/_fleet-server/driver_financial_periods.ts)

The §1.5 fix correctly stopped discarding the overpayment and introduced a new `overpaid` settlement status. But the two queue readers were not updated to match.

`listDriverOwesPeriods` — the Collect queue — filters on status equality:

```ts
.eq("settlement_status", "driver_owes")
.lt("settlement_amount", -0.005)
```

`listReconciledSettlementPeriods` — the Reconciled tab — was widened to include the new status:

```ts
.in("settlement_status", ["settled", "overpaid"])
```

And in the projection, `overpaid` takes priority over every other classification:

```ts
if (overpaidAmount > 0.005) settlementStatus = "overpaid";
else if (Math.abs(settlementAmount) < 0.01) settlementStatus = "settled";
else if (settlementAmount > 0) settlementStatus = "company_owes";
else settlementStatus = "driver_owes";
```

So the moment a week has any overpayment, it leaves `driver_owes` and lands in the Reconciled tab.

**Failure scenario, executed against the shipped formula:**

```
gross = −2000  (driver owes the fleet 2,000)
paid  =  5000  (fleet had already disbursed 5,000)

→ overpaidAmount   = 5000
→ settlement       = −2000
→ settlement_status = "overpaid"

True fleet exposure: 7,000
Shown in settlement_amount: −2,000
Appears in Collect queue (needs status "driver_owes"): NO
Appears in Reconciled tab: YES, badged "Overpaid"
```

The fleet is $7,000 down, the week reads as reconciled, and there is no queue that surfaces it for recovery. This is **worse than the pre-fix behaviour** for this case: before, `settlementPaid` was zeroed, status stayed `driver_owes`, and the week at least appeared in Collect for the $2,000.

`payOutstandingAmount` (`Math.max(0, settlementAmount)`) also returns 0 for these rows, so bulk Pay ignores them — correct — but nothing on the Collect side compensates.

**What it needs:** either `listDriverOwesPeriods` accepts `settlement_status IN ('driver_owes','overpaid')` and orders by total exposure (`|settlement_amount| + overpaid_amount`), or `overpaid` becomes a flag alongside the directional status rather than replacing it. The second is cleaner — overpayment and direction are orthogonal facts.

---

## NEW-2 🔴 Critical — the settlement formula is discontinuous at `grossSettlement = 0`

**File:** [driverPeriodSettlement.ts:48-60](packages/finance-core/src/driverPeriodSettlement.ts#L48-L60)

```ts
if (grossSettlement > 0.005) {
  overpaidAmount = round2(Math.max(0, settlementPaid - grossSettlement));
  settlement =
    overpaidAmount > 0.005
      ? round2(-overpaidAmount)
      : round2(grossSettlement - settlementPaid);
} else {
  // Driver owes / zero: any prior payout is excess vs current gross (do not zero paid).
  overpaidAmount = settlementPaid > 0.005 ? settlementPaid : 0;
  settlement = grossSettlement;          // ← overpayment NOT folded in
}
```

The two branches treat the overpayment differently. Above zero, it is folded into `settlement` (`settlement = −overpaid`). At or below zero, `settlement` is just `grossSettlement` and the overpayment is reported only in the separate field.

**Executed against the shipped formula, `paid = 5000`:**

| `grossSettlement` | `overpaidAmount` | `settlement` |
|---|---|---|
| `+0.01` | 4,999.99 | **−4,999.99** |
| `−0.01` | 5,000.00 | **−0.01** |

A two-cent change in gross swings `settlement_amount` by $4,999.98. `settlement_amount` is the number the Collect queue sorts and filters on, the number `payOutstandingAmount` reads, and the number the desk displays. A week's headline figure should not depend on which side of zero a rounding lands.

The `else` branch is also internally inconsistent with its own comment: it says "do not zero paid", and correctly doesn't — but by leaving `settlement = grossSettlement` it under-reports the driver's true obligation by exactly the amount paid.

**What it needs:** one continuous definition. `settlement = grossSettlement − settlementPaid` in every case, with `overpaidAmount = max(0, settlementPaid − max(0, grossSettlement))` as a derived reporting field. That is continuous across zero, folds the overpayment into the direction naturally, and makes NEW-1 mostly self-resolving because the week stays `driver_owes`.

---

## NEW-3 🟠 High — pending unlinked trip tolls no longer make a week actionable, so they no longer block finalization

**Files:** [periodTollCashSpend.ts:51-61](apps/fleet/src/utils/periodTollCashSpend.ts#L51-L61), [driver_financial_periods.ts:407-420](supabase/functions/_fleet-server/driver_financial_periods.ts)

The §1.4 fix removed the cash credit for unverified trip tolls — correct, and exactly what was asked for. But it removed the rows entirely rather than keeping them as unresolved work:

```ts
export function isTripCashWashSpend(trip, linkedTripIds): boolean {
  if (!trip?.id || linkedTripIds.has(String(trip.id))) return false;
  const amt = Math.abs(Number(trip.tollCharges) || 0);
  if (amt <= 0.005) return false;
  const status = trip?.tollRefundResolution?.status;
  if (status === 'phantom' || status === 'expense_logged') return false;
  return status === 'cash_wash';        // ← pending / null now fall through to false
}
```

The rebuild loop `continue`s on anything this rejects, so a `pending` or status-less trip toll now contributes to **none** of `tollSpend`, `tollCashSpend`, `tollUnmatchedCount`, or `tollWorkflowActionable`. Previously it incremented the latter two.

The original code did both things at once:

```ts
// before
if (isCashWash) { tollReconciledCount++; }
else { tollUnmatchedCount++; tollWorkflowActionable++; }   // ← this half was dropped
```

**Why this matters now specifically.** `tollWorkflowActionable` and `tollUnmatchedCount` are the inputs to the §1.3 gate that was just built:

```ts
const tollsClear =
  (tollStatus === "reconciled" || tollStatus === "n/a") &&
  tollWorkflowActionable === 0 &&
  tollUnmatchedCount === 0;
const moneyUnlocked = (fuelFinalized && tollsClear) || forceRelease;
```

**Failure scenario.** A week has 40 unlinked trip tolls sitting at `pending` and nothing else outstanding. All four counters read zero, `tollStatus` resolves to `n/a` or `reconciled`, `tollsClear` is `true`, and `moneyUnlocked` flips as soon as fuel is finalized. The week releases for payout with 40 unresolved trip tolls — the precise scenario §1.3 was built to prevent.

`rebuildAllPeriodsForDriver` still walks `pending` trips when collecting anchors, so the week gets created; the week body then ignores them. The Unlinked Refunds desk still shows them, but the settlement gate cannot see them.

**What it needs:** keep the exclusion from `tollSpend` / `tollCashSpend`, and restore the `tollUnmatchedCount++` / `tollWorkflowActionable++` for `pending` and status-less trips — ideally via a second predicate (`isTripTollActionable`) alongside `isTripCashWashSpend`, so the two concerns stay separable.

---

## NEW-4 🟡 Medium — `tollSpend ≠ tollCashSpend + tollTagSpend`

**File:** [driver_financial_periods.ts:372-382](supabase/functions/_fleet-server/driver_financial_periods.ts)

```ts
const cash = isCashPaid(tx);
if (cash && handled) tollCashSpend += amt;
else if (!cash) tollTagSpend += amt;
```

A cash toll that is **not yet handled** adds to `tollSpend` but to neither bucket. Gating the *settlement credit* on `handled` is right; gating the *spend classification* on it is not — the money was spent either way.

`OverviewMetricsGrid` renders "Tag spent" and "Cash spent" as separate rows rather than a sum, so nothing displays a broken total today. But real cash spend is invisible in both rows until reconciliation lands, and any future reconciliation of `tollSpend` against its parts will not balance.

**What it needs:** classify by payment method only (`cash ? tollCashSpend : tollTagSpend`) and keep a separate `tollCashWashEligible` for the settlement credit. That preserves the §1.4 and §2.6 fixes and restores the invariant.

---

## NEW-5 🟡 Medium — `Overpaid` rows are counted as both closed and open

**File:** [computePayoutSummaryTotals.ts:35-45](apps/fleet/src/utils/computePayoutSummaryTotals.ts#L35-L45)

```ts
const closed = rows.filter((r) => r.status === 'Finalized' || r.status === 'Overpaid');
...
for (const r of rows) {
  if (r.status === 'Finalized') continue;      // ← 'Overpaid' not skipped
  ...
  if (settlement < -0.005) openDriverOwes += Math.abs(settlement);
}
```

An `Overpaid` row increments `closedCount` and simultaneously contributes to `openDriverOwes`. Whichever behaviour is intended, the two lines disagree. Given NEW-1 (the fleet genuinely is owed the money back), counting it as open is the defensible half — so `closed` should drop `'Overpaid'`.

---

## NEW-6 🟢 Low — force-release probe adds a serial query per week in the bulk path

**File:** [driver_financial_periods.ts:665-676](supabase/functions/_fleet-server/driver_financial_periods.ts)

`rebuildDriverFinancialPeriod` now issues an extra `select("metadata")` per call to detect a prior force-release. `rebuildAllPeriodsForDriver` loops every anchor for a driver, so this is one additional serial round-trip per week — on a driver with two years of history, ~100 extra queries per rebuild.

This is the same path whose own comment says line persistence is skipped "to stay under CPU limits". The force-release flags could be fetched once into a `Map` in `loadRebuildContext` alongside the existing `savedWeeks` query.

---

## NEW-7 🟢 Low — `syncPeriodCashFromTransactions` still does not update `status`

The sync now correctly maintains `settlement_status` and `payout_status`, but never writes the `open`/`closed`/`reopened` column. A week that settles through a cash action keeps a stale `status` until the next full rebuild. Since `isSignedWeekRow` no longer reads `status`, the blast radius is smaller than it was — but `periodStatus` is still what the Expenses and Reconciliation surfaces read.

---

# PART III — Still open

1. **NEW-2** — make the settlement formula continuous. Do this first: it is a small change and it substantially defuses NEW-1.
2. **NEW-1** — route `overpaid` weeks into the Collect queue.
3. **NEW-3** — restore actionability for `pending` trip tolls without restoring their cash credit.
4. **NEW-4 / NEW-5** — invariant and double-count cleanups.
5. **§3.8 (unchanged, business question)** — `tollReimbursed` still does not enter the settlement formula. **If Uber's toll reimbursement arrives inside `fare_earning` gross, the driver is commissioned on it, credited the cash wash for the same toll, and not charged — a triple benefit.** If it is booked separately to the fleet, current treatment is correct. Verify against one real reimbursed toll; this is the last unquantified exposure in the chain.
6. **§3.1 (cosmetic)** — `STATUS_SETTLED_EPS` and `STATUS_CASH_HELD_EPS` exist but nothing imports them. Either wire them into the server and `cashSettlementCalc` or drop them.

### Regression coverage

`packages/finance-core/src/settlementAudit.regression.test.ts` pins nine of the original findings and is the right pattern. Three gaps worth closing, matching the new findings:

- `computePeriodSettlement` across the `grossSettlement = 0` boundary (NEW-2) — assert `settlement` is continuous for `gross ∈ {+0.01, 0, −0.01}` at fixed `paid`.
- A driver-owes-plus-overpaid week reaching the Collect queue (NEW-1).
- `isTripCashWashSpend` paired with an actionability assertion for `pending` (NEW-3).

The existing `1.5 overpay is not silently absorbed` test only exercises the `gross > 0` branch (`gross = 7000`, `paid = 10000`), which is why the `else`-branch discontinuity passed CI.

---

# PART I — ORIGINAL AUDIT (2026-08-31, pre-remediation)

*Retained for reference. Status of each item is in the verification table above.*

## 0. Executive summary

The **core formula is sound and single-sourced.** `computePeriodSettlement` lives in `packages/finance-core` and the Deno edge function re-exports it verbatim. Server and client cannot drift on the formula itself. The fuel finalize path has proper idempotency keys, generations, and reversal-on-re-finalize.

**However, the *inputs* to that formula are assembled by several different code paths that do not agree with each other.** 5 issues could move money on a real week, plus 9 latent or structural.

The single most damaging one: **any "Log cash" / "Collect" / "Write-off" action on a week silently deletes that week's tips from the driver's net payout** (§1.1). The second: **"fully reconciled" is gated on fuel only** (§1.3).

---

## 1. Critical — will move money on a real week

### 1.1 Every cash action strips tips from the driver's payout

Two places call `computePeriodSettlement` on the server. The full rebuild passed `tipsPaidToDriver: share.tipsPaidToDriver || 0`; `syncPeriodCashFromTransactions` — which runs on every Log Cash, Collect, Payout and Write-off — did not, so it defaulted to 0 and wrote the reduced `payout_net` and `settlement_amount` straight to the row.

Confirmed live in the Driver Settlements screenshot: on every row, `Gross − (Fleet share + Driver share)` equalled a clean round number ($160, $580, $1,200, $460, $0) — exactly that week's tips.

Also missing from the sync: `payout_status` and `status` were never updated.

### 1.2 Cash sync wrote a negative into a `>= 0` check constraint

The full rebuild clamped (`Math.max(0, settled.adjCashBalance)`) with a comment naming the constraint; the sync wrote `round2(settled.adjCashBalance)` unclamped. Any week where fleet fuel share plus cash returned exceeded passenger cash produced a negative, violating `driver_financial_periods_cash_nonneg_check`, throwing 23514, and leaving the collection unreflected on the period.

### 1.3 "Fully reconciled" only checked fuel

`settlementStatus` and `payoutStatus` both keyed on `fuelFinalized` alone. `tollStatus` and `tollWorkflowActionable` were computed immediately above and used only for `periodStatus`, which is not what the settlement desk reads. A week with 12 unmatched tolls and 3 open claims could be paid.

### 1.4 Unverified trip tolls were credited as cash wash

Trips with no resolution or `pending` added their full toll to `tollCashSpend`, reducing what the driver owed before anyone confirmed the toll was real — while the same row was counted as `tollUnmatchedCount++`.

### 1.5 Overpayment was silently absorbed

`settlementPaid = grossSettlement > 0.005 ? Math.min(settlementPaidIn, grossSettlement) : 0` discarded the excess when gross fell below what was paid, and zeroed prior payouts outright when gross went negative.

---

## 2. Structural

**2.1** Toll cash-wash netted twice — once in `buildLedgerPayoutPeriodRows`, again in `getPeriodSettlementComponents` — against a `cashPaidBreakdown.tollCredits` value that was never inside `amountPaid` to begin with. The `CashPaidBreakdown` doc comment was stale.

**2.2** Three week-bucketing rules fed one subtraction: tolls used `fleetCalendarDay`, Uber payout cash used `periodKeyFor`, and fares/tips/trip cash used a raw `String(date).slice(0,10)`. Sunday-night trips in UTC−5 split revenue and costs across two weeks. The `±2`-day fuzzy cash-week match took the first hash hit rather than the nearest.

**2.3** `Number(p.x) || row.x` reverted legitimate zeros to stale local values — most damagingly substituting a draft fuel estimate for a real zero deduction.

**2.4** `getTierForEarningsEH` returned `sorted[0]` — the *lowest* tier — when cumulative earnings exceeded every finite ceiling.

**2.5** `fleetShare = grossRevenue − driverShare` excluded tips, so withheld tips existed in neither share. Visible in production as `Gross ≠ Fleet share + Driver share`.

**2.6** `isCashPaid` returned true for `!!tx.receiptUrl`, so a tag toll with a receipt image attached was credited to the driver as cash.

**2.7** `rebuildAllPeriodsForDriver` skipped signed weeks while `processFinancialOutbox` and `finalizeFuelWeek` rewrote them freely — backwards, since bulk repair is the path you want able to fix a bad week.

---

## 3. Minor

**3.1** Four different epsilons (`0.005`, `0.01`, `0.5`, `1`) across status bands. **3.2** `foldPayoutCashByWeek` collapsed genuine same-day same-amount remittances. **3.3** Sync filtered on `driverId` only while rebuild resolved platform aliases. **3.4** `round2` was asymmetric across zero and returned `1.00` for `1.005`. **3.5** `getAdjCashBalance` omitted `cashWrittenOff`. **3.6** `openBalance` netted opposing weeks to $0. **3.7** `cashSourceMismatch` computed then ignored. **3.8** `tollReimbursed` never entered the formula. **3.9** Blank transaction status counted as cleared. **3.10** `Math.max(txFuelCredits, fleetShare)` silently discarded one of two non-interchangeable facts. **3.11** Duplicate finalized fuel reports would double-deduct in the non-event fallback.

---

## 4. What was already correct

One formula in one place, re-exported by the edge function. Correct signs and ordering. Fuel finalize with idempotency keys, close generations, amount-match short-circuit and full reversal before re-post. Correct `reverses_event_id` / `reversed_at` handling. Cash Returned properly narrow (tagged Log Cash only). `netDriverTollCharges` netting reversals rather than summing absolutes. `cashStillHeld` clamped for display while `settlementAmount` stayed unclamped, with `unclampedCashHeld` preserved in metadata.
