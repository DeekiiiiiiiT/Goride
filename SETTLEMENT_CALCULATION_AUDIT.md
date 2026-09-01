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

### ✅ Third pass verified (2026-08-31, commits `0529e19b` → `58f0165a`)

**All seven Part II findings confirmed fixed in code. No new money-moving defect found.** Tests green: **34 finance-core** (up from 31) + **1,080 fleet** (up from 1,074).

Independently re-derived, not taken on trust:

- **NEW-1** — `overpaid` is no longer a settlement status at all. Both write paths emit directional status only; `listReconciledSettlementPeriods` is back to `.eq("settled")`; `overpaidAmount` rides along as a reporting field on `listDriverOwesPeriods`, `listCompanyOwesPeriods` and `listRecentlyPaidSettlementPeriods`, and is badged on Collect rows, Pay→Done rows and the Reconciled tab. Re-running the original failure case under the shipped formula: `gross = −2000`, `paid = 5000` → `settlement = −7000`, status `driver_owes`, `amountOwed = 7000` — the **full** exposure, in the Collect queue. Correct.
- **NEW-2** — `settlement = round2(grossSettlement − settlementPaid)` with no branch on sign; `overpaidAmount = max(0, paid − max(0, gross))` is derived. Continuous across zero.
- **NEW-3** — `isTripTollActionable` added and wired; `pending` / null-status trips now increment `tollUnmatchedCount` and `tollWorkflowActionable` and emit a `trip_pending` line, while still contributing no wash credit. The §1.3 gate can see them again.
- **NEW-4** — spend is classified by payment method only (`cash ? tollCashSpend : tollTagSpend`), restoring `tollSpend = tollCashSpend + tollTagSpend`; the settlement credit moved to a separate `tollCashWashEligible` accumulator, persisted in metadata and resolved client-side by `resolvePeriodTollCashWash`. The legacy fallback to `toll_cash_spend` is correct for rows written before the split.
- **NEW-5** — `closed` no longer includes `'Overpaid'`.
- **NEW-6** — force-release metadata batch-loaded once into `periodMetaByAnchor`; the per-week `select` is gone.
- **NEW-7** — sync now writes `status` and `closed_at`.
- **§3.1** — upgraded to Resolved: `STATUS_SETTLED_EPS` / `STATUS_CASH_HELD_EPS` are now imported by the server status gates, `cashSettlementCalc`, `mapPayoutStatus` and `SettlementSummaryView`.

**One deployment prerequisite and four low-severity items remain — see Part III.**

**Delivery program (2026-09-01):** P-0 finance-recon uses `checkPeriodInvariants` + wash resolver; P-1 backfill migration `20260831220000`; P-2–P-5 quick wins; A-1/A-2/A-4 controls + single projector; A-6/A-7/A-8 durability; A-3/A-9/A-10/A-11 foundation migrations `20260831230000`.

### ✅ Fourth pass verified (2026-09-01, commits `64d1641e` → `6353b6fd`) — see **Part V**

**P-0 through P-5 fully closed. A-1, A-2, A-4, A-6, A-8 done.** Tests green: **42 finance-core** (now with property tests) + **1,081 fleet**. `periodInvariants.ts` is the structural win — the nightly control now calls `computePeriodSettlement` and cannot skew from it.

**Three items shipped as scaffolds that are not yet load-bearing, and two reintroduced the §1.1 pattern:** the rebuild wipes `signedSnapshot` (**C-1**, high — A-7's audit trail survives only until the next background job); the A-3 `*_minor` columns are dual-written by the rebuild but not the cash sync (**C-2**, latent landmine at cutover); `driver_settlement_transactions` is a table with no code and both KV full-scans remain (**C-3**). Root cause of C-1 and C-2 is the same: **A-2 unified status derivation but not the persist body**, so each write path still assembles its own column set.

### ✅ Fifth pass verified (2026-09-01, commit `f3eecf1d`) — see **Part VI**

**C-1 through C-5 all fixed. A-2 is now genuinely complete** — `buildPeriodMetadata` + `buildCashSettlementPersistFields` mean both write paths share the persist body, removing the cause of C-1/C-2 rather than the instances. Tests green: **52 finance-core** + **1,081 fleet**; CI import guard clean on both rules. The architecture program (A-1, A-2, A-4, A-6, A-7, A-8, A-9, C-5) is done and load-bearing.

**Two new latent defects, both in the A-11 flag path — production-safe while `SETTLEMENT_TX_TABLE_READ` is off, but blocking for cutover:** the mirror predicate omits `Cash Write Off` and `Toll Charge` (**D-1** — flipping the flag would underpay by every write-off and overpay by every toll charge), and the backfill script looks for `'Driver Payout'` / `'Driver_Payout'` while the data says `'Driver Payouts'` / `'Payout'`, so it would mirror zero payouts (**D-2**). Three disagreeing definitions of "settlement transaction" now exist; unify one predicate in `finance-core` and add a mirror-vs-KV parity check before flipping.

### ✅ Sixth pass verified (2026-09-01, commit `e22752c2`) — see **Part VII**

**COMPLETE. No money-affecting finding remains.** D-1/D-2/D-3 fixed via a single `isSettlementParticipantTransaction` in `finance-core` with a lockstep parity test; A-11 backfilled and parity-verified against real data (**715/715, 0 misses**) and cut over; and **§3.8 / P-6 — the last open business question — is closed**: a traced live week (2026-08-24) confirms toll reimbursement is tag/plaza attribution, not a `fare_earning` line item, so the triple-benefit scenario does not occur and display-only treatment is correct. Tests green: **55 finance-core** + **1,082 fleet**.

Across six passes: **35 findings raised, 35 closed.** Flawless Finish program (2026-09-01) closed E-1, ops webhook, predicate triple-lock, A-5 tolls wiring, A-3 minor formula, and settlement desk data-sources panel. **Watch items:** full A-3 NUMERIC deprecation; enable `PROJECTION_EVENTS_FARES` / `PROJECTION_EVENTS_TOLLS` in prod when parity reviewed; cash events deferred per ADR.

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
| 3.7 | `cashSourceMismatch` computed then ignored | ✅ **Resolved (intentional badge-only)** | Badge at `> 0.5`; does **not** gate Pay/finalization — ledger Uber cash already wins. See `docs/settlement-toll-reimbursement-trace.md` §3.7. |
| 3.8 | `tollReimbursed` outside the formula | ✅ **Resolved (display-only intentional)** | Live sample 2026-08-24: plaza/tag reimbursement separate from fare; formula unchanged. See `docs/settlement-toll-reimbursement-trace.md`. |
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

## NEW-2 ✅ Fixed — was: settlement formula discontinuous at `grossSettlement = 0`

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

## NEW-3 ✅ Fixed — was: pending unlinked trip tolls no longer blocked finalization

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

## NEW-4 ✅ Fixed — was: `tollSpend ≠ tollCashSpend + tollTagSpend`

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

## NEW-5 ✅ Fixed — was: `Overpaid` rows counted as both closed and open

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

## NEW-6 ✅ Fixed — was: force-release probe added a serial query per week

**File:** [driver_financial_periods.ts:665-676](supabase/functions/_fleet-server/driver_financial_periods.ts)

`rebuildDriverFinancialPeriod` now issues an extra `select("metadata")` per call to detect a prior force-release. `rebuildAllPeriodsForDriver` loops every anchor for a driver, so this is one additional serial round-trip per week — on a driver with two years of history, ~100 extra queries per rebuild.

This is the same path whose own comment says line persistence is skipped "to stay under CPU limits". The force-release flags could be fetched once into a `Map` in `loadRebuildContext` alongside the existing `savedWeeks` query.

---

## NEW-7 ✅ Fixed — was: `syncPeriodCashFromTransactions` did not update `status`

The sync now correctly maintains `settlement_status` and `payout_status`, but never writes the `open`/`closed`/`reopened` column. A week that settles through a cash action keeps a stale `status` until the next full rebuild. Since `isSignedWeekRow` no longer reads `status`, the blast radius is smaller than it was — but `periodStatus` is still what the Expenses and Reconciliation surfaces read.

---

# PART III — Still open (as of third verification pass)

One live defect (P-0), one **deployment prerequisite** (P-1), and four low-severity items.

## 🔴 P-0 — The nightly reconciliation job now false-positives on every week with unmatched cash tolls

**File:** [finance-recon/index.ts:70-89](supabase/functions/finance-recon/index.ts#L70-L89)

`finance-recon` re-implements the cash identity by hand instead of calling the shared formula, and it was not updated for the NEW-4 split:

```ts
const expectedHeld = round2(Math.max(0,
  (Number(p.cash_collected) || 0) +
  (Number(p.toll_charged_to_driver) || 0) -
  (Number(p.cash_returned) || 0) -
  (Number(p.toll_cash_spend) || 0) -        // ← wash credit is now tollCashWashEligible
  (Number(p.fuel_fleet_share) || 0) -
  (Number(p.cash_written_off) || 0)));
```

After NEW-4, `toll_cash_spend` is *all* cash tolls (payment-method classification) while the settlement credit is `metadata.financeCore.tollCashWashEligible`. The projection uses the latter; the recon uses the former.

**Executed:** a week with $10,000 passenger cash, $2,000 returned, and $3,000 of cash tolls of which only $1,000 is handled →

```
projection cash_still_held : 7000
finance-recon expectedHeld : 5000
drift flagged              : 2000   ← false positive
```

Drift equals the unmatched-cash-toll amount, on every affected week, every night. `finance_recon_runs.ok` goes false and stays false, which trains everyone to ignore the one automated check that would catch a real drift. Fix by resolving the wash the same way the client does (`tollCashWashEligible ?? toll_cash_spend`) — or better, per **A-1** below, by calling `computePeriodSettlement` instead of re-deriving.

## ⚠️ P-1 — Legacy `settlement_status = 'overpaid'` rows are orphaned from every queue until repaired

**This is the one thing that must happen at deploy time.**

The previous deploy (`ce4e0d35`) wrote `settlement_status = 'overpaid'` to real production rows. This deploy removed `overpaid` as a status but **shipped no backfill migration**. Every list endpoint now filters it out:

| Endpoint | Filter | Legacy `overpaid` row |
|---|---|---|
| `listReconciledSettlementPeriods` | `.eq("settlement_status", "settled")` | excluded |
| `listDriverOwesPeriods` | `.eq("settlement_status", "driver_owes")` | excluded |
| `listCompanyOwesPeriods` | `.eq("settlement_status", "company_owes")` | excluded |
| `listRecentlyPaidSettlementPeriods` | `.eq("settlement_status", "settled")` | excluded |
| `listCashHeldPeriods` | `.or(status.eq.pending, fuel_finalized.eq.false)` | excluded once fuel is finalized |

Any week still carrying `'overpaid'` is invisible on every desk. The CHECK constraint still permits the value, so nothing errors — the rows simply disappear.

`repairDriverSettlementWeeks({ driverId, onlyOpenOrOwes: true })` does handle them (`settlement_audit_repair.ts:41` includes `'overpaid'` in its target list), but it is a manual, per-driver ops call. **Either run it across every driver as part of the deploy, or add a one-line backfill migration** — e.g. re-derive status from `settlement_amount` for rows where `settlement_status = 'overpaid'`. A migration is safer: it cannot be forgotten and does not depend on a full projection rebuild succeeding.

## P-2 🟢 Low — `repairDriverSettlementWeeks` reloads the full context once per week

**File:** [settlement_audit_repair.ts:30, 63](supabase/functions/_fleet-server/settlement_audit_repair.ts#L30)

Both branches call `rebuildDriverFinancialPeriod(driverId, anchor)` without a context argument, so each iteration runs `loadRebuildContext` — the whole toll ledger, every `transaction:` KV row, finalized reports, claims, ledger events, and now the period-metadata batch query. A driver with 30 target weeks pays that cost 30 times.

This is the tool that repairs the entire audit, including P-1. On a real driver it will be very slow and may exceed the edge function's CPU/wall limit, which would leave the repair half-applied. Load the context once and pass it into each call — the same pattern `rebuildAllPeriodsForDriver` already uses.

## P-3 🟢 Low — overlay error path shows raw cash spend as the wash credit

**File:** [DriverSettlementsPage.tsx:770](apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx#L770)

The success path correctly resolves the wash (`tollCashSpend: resolvePeriodTollCashWash({...})`, line 720). The `catch` fallback assigns `tollCashSpend: row.tollCashSpend` raw — which, after NEW-4, is *all* cash tolls rather than the wash-eligible subset.

The overlay labels that field "Cash toll credit" / "Cash plaza wash" in both places it renders it, so on an API error the credit is overstated and the printed money flow (*passenger cash → returns & credits → still held − net payout → residual*) will not add up. Display-only, error path only. Apply `resolvePeriodTollCashWash` in the fallback too.

## P-4 🟢 Low (operational, not a bug) — sub-dollar residuals now populate the desks

Tightening the settled band from `< 1` to `< STATUS_SETTLED_EPS` (0.01) was correct. The consequence is that a week with a $0.40 residual now classifies as `company_owes` / `driver_owes` and clears the queue thresholds (`> 0.005` / `< -0.005`), where previously anything under $1.00 was absorbed as `settled`.

Expect the Collect and Pay queues to gain trailing rows worth cents. The `minAmount` filter already exists on both endpoints — consider defaulting it to ~$1 on the desk so operators are not chasing rounding dust.

## P-5 🟢 Cosmetic — two leftovers from the epsilon sweep

- [cashSettlementCalc.ts:339](apps/fleet/src/utils/cashSettlementCalc.ts#L339) still hardcodes `amountPaid > week.amountOwed + 1` for the Overpaid band while the Paid band on the line above was converted to `STATUS_SETTLED_EPS`. Half-converted.
- `'Overpaid'` is now dead in the `PayoutStatus` union: `mapPayoutStatus` no longer returns it, so `SettlementSummaryView`'s `row.status === 'Overpaid'` check and the `computePayoutSummaryTotals` filters can never see it. Harmless, but it will mislead the next reader into thinking a status exists that doesn't. The `showOverpaidBadge` flag is the live mechanism.

## P-6 ⏸️ Open (business question, unchanged) — `tollReimbursed` outside the formula

Still display-only, and the Reconciled overlay now says so explicitly in an amber callout — good interim handling. **The underlying question is unanswered: if Uber's toll reimbursement arrives inside `fare_earning` gross, the driver is commissioned on it, credited the cash wash for the same toll, and not charged — a triple benefit.** If it is booked separately to the fleet, the current treatment is correct.

This is the last unquantified money exposure in the chain. It needs one real reimbursed toll traced end-to-end, not more code.

---

### Regression coverage — now good

`settlementAudit.regression.test.ts` grew from 9 to 12 cases and the three gaps flagged in the previous pass are closed: the `grossSettlement = 0` boundary, overpay routing, and `pending` trip actionability. `periodTollCashSpend.test.ts` and `computePayoutSummaryTotals.test.ts` were extended alongside.

Two cases still worth adding, matching the items above:

- A legacy row with `settlement_status = 'overpaid'` surviving a repair pass into a directional status (P-1) — this is the regression that would have caught the missing backfill.
- `resolvePeriodTollCashWash` on a row whose `toll_cash_spend` exceeds `tollCashWashEligible`, asserting the settlement credit uses the smaller value (guards the NEW-4 split from regressing through the legacy fallback).

---

# PART IV — ARCHITECTURE REVIEW

*Added 2026-08-31, fourth pass. Not a bug list — a review of the structural properties that allowed 21 findings to exist, and what would stop the class from returning.*

## Verdict

**The bugs are fixed. The architecture that produced them is largely unchanged.**

Every finding in this audit was fixed correctly and the test suite pins them. But look at the *shape* of the findings and a pattern is unmistakable:

- §1.1, §1.2, NEW-7 — the partial write path forgot a field the full write path had.
- §2.1, P-0 — an identity was re-implemented by hand in a second place and drifted.
- §2.2 — the same concept (a week) was derived three different ways.
- §2.3, §3.10 — a fallback silently substituted a different source.
- §3.4 — float arithmetic needed a bandaid.

None of these are hard bugs. They are all **duplication of a definition that should exist once.** The remediation fixed each instance; it did not remove the duplication. The next feature that adds a field to the projection will reintroduce the §1.1 class on day one, because nothing prevents it.

P-0 is the proof: the NEW-4 fix was correct and complete in the projection, and it silently broke the control job that re-derives the same identity 200 lines away in another file. That happened *during this audit*, with the audit open.

**Ship it** — after P-1 and P-0. Then work the list below, because right now the system is correct by inspection and vigilance rather than by construction.

---

## Tier 1 — Removes whole classes of bug

### A-1. Make the control layer call the formula instead of re-deriving it

`finance-recon` hand-codes the cash identity (that's P-0). The projection, the cash sync, the client components and the recon job each restate pieces of the same arithmetic.

The recon job should import `computePeriodSettlement` from `finance-core`, feed it the persisted inputs, and compare its outputs field-by-field against the persisted outputs. Then drift detection **cannot** skew relative to the formula — if the formula changes, the check changes with it. That single change would have made P-0 impossible and would catch any future §1.1.

Extend it beyond the one identity it checks today. The full set worth asserting nightly:

| Identity | Currently checked |
|---|---|
| `cash_still_held == max(0, adjCashBalance)` | ✅ (incorrectly — P-0) |
| `settlement == grossSettlement − settlementPaid` | ❌ |
| `payout_net == driverShare − fuelDeduction + tipsPaid` | ❌ |
| `earnings_gross == driver_share + fleet_share + tips_paid` | ❌ (only as an ad-hoc heuristic inside the repair tool) |
| `toll_spend == toll_cash_spend + toll_tag_spend` | ❌ |
| projection totals vs `financial_events` sums | ❌ |

The last one is the real control total and the only one that would catch the projection diverging from the posted ledger. Nothing checks it today.

Also: `finance-recon` reports drift by writing a row and calling `console.warn`. Nobody is paged. A control that nobody reads is not a control.

### A-2. One projector, not two write paths

`rebuildDriverFinancialPeriod` (full) and `syncPeriodCashFromTransactions` (partial) both compute and persist money on the same row. §1.1 (tips), §1.2 (clamp), NEW-7 (`status`) were all the same bug: the partial path lacked something the full path had. Three instances of one design flaw.

The `syncPeriodCash` shortcut exists for a good reason — its comment says a full rebuild "was rewriting those inputs and making Driver owes jump on every collect action." That's a legitimate performance and stability concern. But the answer isn't a second formula; it's:

```
type PeriodInputs = { driverShare, fuelDeduction, cashCollected, tollCashWashEligible, ... }

loadInputsFull(driverId, anchor)   → PeriodInputs   // recompute everything
loadInputsCashOnly(existing, txs)  → PeriodInputs   // reuse persisted, refresh cash fields
projectPeriod(inputs)              → PeriodRow      // ONE function, always
```

Both paths differ only in how they assemble `PeriodInputs`. Persisting is one function. A new field is added in one place and both paths get it for free. This is the highest-value refactor on the list.

### A-3. Integer minor units end-to-end

`financial_events.amount_minor` is `BIGINT` — correct. `driver_financial_periods.*` is `NUMERIC(14,2)` read into JS `number` — every settlement computation is IEEE754 floating point with `round2` applied defensively at each step.

§3.4 existed because of this, and the fix was to rewrite `round2` with a `toFixed(6)` trick to dodge the `1.005 * 100 = 100.4999…` edge. That is a bandaid on a design choice. `round2` is currently called ~15 times inside one `computePeriodSettlement` call, each one a place where a representation error can be baked in.

The standard for money is integers in minor units, converted only at the display boundary. The event layer already does this. Migrating the projection to `*_minor BIGINT` removes an entire error class permanently, makes the DB constraints exact, and lets `round2` disappear from the core formula. It is the largest change on this list and the one with the longest tail of benefit.

### A-4. Property-based tests for the invariants

`settlementAudit.regression.test.ts` is good work, but it is example-based: it pins the specific numbers that were wrong. It cannot catch the *next* violation of the same rule — which is exactly what happened with the `else`-branch discontinuity (NEW-2) passing CI under a test named "overpay is not silently absorbed."

Four properties, fuzzed over random inputs (`fast-check` or equivalent), subsume most of this audit:

```
∀ inputs:  adjCashBalance == cashOwed − cashPaid − fuelCredits − cashWrittenOff
∀ inputs:  settlement     == grossSettlement − settlementPaid          // catches NEW-2
∀ inputs:  netPayout      == driverShare − fuelDeduction + tipsPaid     // catches §1.1
∀ inputs:  settlement is continuous in grossSettlement                  // catches NEW-2 directly
∀ tiers:   share% is monotonic non-decreasing in cumulative earnings     // catches §2.4
```

That last one is worth highlighting: §2.4 (tier fallback to the *lowest* band) is precisely a monotonicity violation, and a property test would have found it without anyone thinking to look.

---

## Tier 2 — Structural durability

### A-5. Events only; retire snapshot sources from the money path

The projection currently reads from five sources with three different mutability guarantees:

| Source | Kind | Idempotent |
|---|---|---|
| `financial_events` | append-only, reversible | ✅ |
| `finalized_report:` KV | mutable snapshot | ❌ — caused §3.11 |
| `transaction:` KV | mutable rows | ❌ |
| `toll_ledger` | mutable rows | ❌ |
| `trips` | mutable rows | ❌ |

§3.11 (duplicate fuel reports double-deducting) existed only in the *snapshot* fallback; the event path was immune because it has idempotency keys and generations. That is the pattern working exactly as intended in one place and absent in four others.

Everything that moves money should post a `financial_event`; the projection should read events and nothing else. Operational tables stay operational. This also makes A-1's control total trivially expressible.

### A-6. Optimistic concurrency on the money row

`projection_version` is computed (`existing.projection_version + 1`) and written, but never used as a guard — the upsert has no version predicate:

```ts
.upsert(upsertBody, { onConflict: "driver_id,period_anchor" })
```

Four writers can touch the same row: the outbox drain, `syncPeriodCashFromTransactions`, `finalizeFuelWeek`, and `forceReleaseDriverPeriod`. A cash sync interleaved with a fuel finalize silently loses one of them, last-write-wins, with no trace. Add `.eq('projection_version', expectedVersion)` and retry on a zero-row result. The column already exists; it just isn't load-bearing.

### A-7. An immutable record of what the driver was actually paid on

`settlement_paid` is re-derived from live `transaction:` rows on every rebuild. Edit or void a payout transaction and the week's history silently changes — there is no "as-of" record of what the desk showed when someone clicked Pay.

For a system that cuts payments, that is the gap that hurts in a dispute. `source_event_hash` is already computed and is exactly the right primitive, but nothing ever compares against it. Either stamp a `signed_snapshot` JSONB on the row at payout time, or add an append-only `driver_period_revisions` table. Combined with A-6, this gives a defensible audit trail.

### A-8. Delete the dual pay formula

`unifiedToll` defaults to `false`, and that branch in `buildLedgerPayoutPeriodRows` still computes `netPayout = driverShare − grossTolls − fuelDeduction` — a materially different pay formula from the unified path, selectable per tenant at runtime.

The shared-period projection is now SSOT for weekly rows, so this branch is mostly unreachable — "mostly" being the problem. Two live formulas for what a driver is paid is not a state an enterprise finance system should be able to enter. Delete the legacy branch and the `unifiedTollSettlementEnabled` flag.

---

## Tier 3 — Hygiene worth doing

### A-9. Stop the edge functions importing from `apps/fleet/src/`

```ts
// supabase/functions/_fleet-server/driver_financial_periods.ts
import { isTollIncludedInSpend, isTollLedgerVoided } from "../../../apps/fleet/src/utils/tollLedgerIntegrity.ts";
import { isTripCashWashSpend, isTripTollActionable } from "../../../apps/fleet/src/utils/periodTollCashSpend.ts";
```

Server money math depends on frontend app code. A refactor in the fleet UI package can change what drivers get paid, and nothing in the type system or CI flags it. `finance-core` and `toll-core` already exist and are the right home — `periodTollCashSpend.ts` in particular is pure domain logic with no UI concern. (This is not hypothetical: `canonical_from_ops.ts` and `make-server-37f42386/index.ts` do the same thing.)

### A-10. Brand the domain types

```ts
export type WeekKey = string;    // today: any string passes
export type Money = number;      // today: any number passes
```

§2.2 (three different week-bucketing rules) was possible because every candidate is `string`. A branded type makes it a compile error to pass a raw slice where a fleet-calendar week key is required:

```ts
type WeekKey = string & { readonly __brand: 'WeekKey' };   // only periodKeyFor() can mint one
type Minor   = number & { readonly __brand: 'Minor' };     // pairs with A-3
```

Cheap, mechanical, and it makes the §2.2 class unrepresentable rather than merely fixed.

### A-11. Bounded reads in the money path

`kv.getByPrefix("transaction:")` loads **every transaction in the system** and filters by driver in memory — on every period rebuild, and again on every cash sync. No index, no pagination, unbounded growth. This is why P-2 (the repair tool reloading context per week) is slow enough to risk a timeout, and it will degrade linearly forever.

Transactions that participate in settlement belong in a real table indexed on `(driver_id, period_anchor)`. This is also a prerequisite for A-5 being practical.

---

## What is already enterprise-grade

Worth stating, because the list above is long and the foundation is genuinely good:

- **One formula, one place**, re-exported to Deno rather than copied. This is the reason the audit's fixes were as clean as they were — most systems this size have three divergent copies.
- **`financial_events` is a proper append-only ledger** with idempotency keys, close generations, reversal semantics (`reverses_event_id` / `reversed_at`), debit/credit account keys and allocations. The fuel finalize path is textbook.
- **A projection/outbox pattern** with `financial_outbox`, retry with backoff, and a dead-letter state.
- **Real DB constraints** on money columns (`cash_nonneg`, status CHECKs) — and §1.2 proves they work, because the constraint caught the bug rather than letting bad data land.
- **A nightly control job exists at all** (`finance-recon`, `finance-doctor`, `checkProductBalances`). Most fleets this size have nothing. It needs A-1, not replacing.
- **An audited ops override** (`forceReleaseDriverPeriod` with a mandatory reason recorded in metadata) rather than someone editing the database.

The gap between where this is and enterprise-grade is narrower than the length of this list suggests. It is mostly **A-1, A-2 and A-4** — make the control call the formula, collapse the two write paths into one projector, and assert the invariants as properties. Those three are a few days of work and they convert "correct because we audited it" into "correct because it cannot be otherwise."

---

# PART V — FOURTH VERIFICATION PASS (2026-09-01, commits `64d1641e` → `6353b6fd`)

**Tests green: 42 finance-core (up from 34, now including 3 property tests) + 1,081 fleet.**

Every Part III and Part IV item was attempted. **P-0 through P-5 are fully closed. A-1, A-2, A-4, A-6 and A-8 are genuinely done.** Three architecture items shipped as scaffolds that are not yet load-bearing, and one of them reintroduced the §1.1 pattern. Details below.

## Confirmed done

| Item | Status | Evidence |
|---|---|---|
| **P-0** finance-recon false positives | ✅ | Now calls `checkPeriodInvariants(p)` instead of hand-coding the identity; selects the columns it needs; `console.error` on drift. |
| **P-1** legacy `overpaid` rows orphaned | ✅ | Migration `20260831220000` re-derives directional status from `settlement_amount`. `scripts/pre_deploy_overpaid_count.sql` for the pre-check. |
| **P-2** repair tool reloads context per week | ✅ | New `rebuildPeriodsForAnchors(driverId, anchors)` loads one context. |
| **P-3** overlay error path shows raw spend as wash | ✅ | `catch` branch now calls `resolvePeriodTollCashWash`. |
| **P-4** sub-dollar rows flooding the desks | ✅ | `minAmount` defaults to `'1'`. |
| **P-5** epsilon + dead status leftovers | ✅ | `amountPaid > week.amountOwed + STATUS_SETTLED_EPS`. |
| **A-1** control layer calls the formula | ✅ | `packages/finance-core/src/periodInvariants.ts` — `checkPeriodInvariants` recomputes via `computePeriodSettlement` and diffs field-by-field. This is exactly right: the check can no longer skew relative to the formula. |
| **A-2** single projector | ✅ (scoped) | `period_projector.ts` — `derivePeriodStatus` is now the one place status/gate logic lives, called by both the rebuild and the cash sync. See the note below on what it does *not* cover. |
| **A-4** property tests | ✅ | `periodInvariants.property.test.ts` (3 properties) alongside the example suite. |
| **A-6** optimistic concurrency | ✅ | `period_persist.ts` — `persistPeriodRowWithVersion` / `updatePeriodCashWithVersion` guard on `.eq('projection_version', expected)` with bounded retry and 23505 handling. Correct. |
| **A-8** dual pay formula | ✅ | `unifiedToll` is gone from `buildLedgerPayoutPeriodRows` entirely. |

`checkPeriodInvariants` covers five identities: `cash_still_held`, `settlement_amount`, `payout_net`, `toll_spend_split`, `earnings_gross_identity`. That is the right set and it directly encodes four of this audit's findings as permanent checks.

---

## C-1 🟠 High — the full rebuild wipes `signedSnapshot`, destroying the A-7 audit trail

**Files:** [driver_financial_periods.ts:811-845](supabase/functions/_fleet-server/driver_financial_periods.ts#L811) (rebuild), [driver_financial_periods.ts:1419-1434](supabase/functions/_fleet-server/driver_financial_periods.ts#L1419) (sync)

A-7 was implemented — but in one write path only.

`syncPeriodCashFromTransactions` correctly stamps a snapshot when `settlement_paid` increases, and carries a prior one forward:

```ts
const signedSnapshot =
  settled.settlementPaid > prevPaid + 0.005
    ? { at, settlement_amount, payout_net, settlement_paid, cash_still_held }
    : (meta.signedSnapshot as Record<string, unknown> | undefined);

const nextMeta = { ...meta, ...(signedSnapshot ? { signedSnapshot } : {}), financeCore: {...} };
```

`rebuildDriverFinancialPeriod` builds `metadata` from scratch. It reads `priorMeta` — but only to recover `forceRelease` — and never spreads it:

```ts
metadata: {
  excludedCashSpend, excludedCashCount,
  financeCore: { ... },
  ...(forceRelease ? { forceRelease: {...} } : {}),
},
```

**Consequence.** Any full rebuild erases the snapshot: a fuel re-finalize, an outbox event, a toll reconciliation, a `repairDriverSettlementWeeks` run. Those are the *most common* background operations on a week. And because the rebuild never creates a snapshot either, a payout whose projection lands via the rebuild path never gets one at all.

The net effect is an audit trail that exists only until the next background job touches the week — which is worse than none, because it looks present. For a system that cuts payments, this is the record you would actually need in a dispute.

**Fix:** spread `priorMeta` in the rebuild's metadata construction (preserving `signedSnapshot` and anything else added later), and move the snapshot-stamping logic into a shared helper the way `derivePeriodStatus` already is.

---

## C-2 🟡 Medium (latent) — the A-3 minor columns are dual-written by the rebuild only

**Files:** [driver_financial_periods.ts:922-924](supabase/functions/_fleet-server/driver_financial_periods.ts#L922) vs the sync's `updatePeriodCashWithVersion` body at [:1445-1458](supabase/functions/_fleet-server/driver_financial_periods.ts#L1445)

The rebuild writes the new minor-unit columns:

```ts
settlement_amount_minor: Math.round((Number(row.settlementAmount) || 0) * 100),
payout_net_minor:        Math.round((Number(row.payoutNet) || 0) * 100),
cash_still_held_minor:   Math.round((Number(row.cashStillHeld) || 0) * 100),
```

The cash sync writes `settlement_amount`, `payout_net` and `cash_still_held` — and none of their `_minor` twins.

**This is the §1.1 pattern recurring, inside the scaffold built to fix the float problem.** After any Log Cash / Collect / Payout / Write-off, the `_minor` columns hold the previous rebuild's values while the NUMERIC columns hold the current ones. The two representations of the same money disagree, silently.

It is harmless *today* because nothing reads the minor columns. It becomes a live incident at cutover: every week touched by a cash action since its last rebuild would read a stale settlement amount. A dual-write migration whose two writers disagree is worse than not having started.

Two things close it:

1. Write the minor columns in both paths — or better, per A-2, derive the persist body once so the question cannot arise.
2. **Add `*_minor == round(numeric * 100)` to `checkPeriodInvariants`.** This is the check that keeps a dual-write honest for the whole duration of the migration, and it is the natural use of the invariant module you just built. Without it, nothing will tell you the scaffold has drifted until you cut over.

---

## C-3 🟡 Medium — A-11 shipped as a table with no code

Migration `20260831230000` creates `ledger.driver_settlement_transactions` with a `(driver_id, period_anchor)` index. Nothing references it:

```
$ grep -rn "driver_settlement_transactions" supabase/functions apps packages
(no matches)
```

Both unbounded scans remain:

```
driver_financial_periods.ts:272   kv.getByPrefix("transaction:")   // loadRebuildContext
driver_financial_periods.ts:1348  kv.getByPrefix("transaction:")   // syncPeriodCashFromTransactions
```

So every rebuild and every cash sync still loads **every transaction in the system** and filters in memory. The stated goal — bounded reads in the money path — is not achieved, and the P-2 timeout risk it was meant to relieve is unchanged (P-2 was fixed by reusing context, which reduces the number of full scans but not their cost).

The table and index are the right shape. What's missing is the dual-write on transaction create/update, a backfill, and switching the two read sites. Until then this is a migration that only adds a table to maintain.

---

## C-4 🟢 Low — A-9 partially done, and the new CI guard doesn't check what was raised

Real progress: `periodTollCashWash.ts` and `periodTollTrip.ts` now live in `finance-core`, and `apps/fleet/src/utils/periodTollCashSpend.ts` has been reduced to mostly re-export shims. That is the right direction.

But `driver_financial_periods.ts` still reaches into the frontend app for two things:

```ts
import { isTollIncludedInSpend, isTollLedgerVoided } from "../../../apps/fleet/src/utils/tollLedgerIntegrity.ts";
import { sumExcludedCashFromWeek } from "../../../apps/fleet/src/utils/periodTollCashSpend.ts";
```

The new CI guard does not catch this. `check-fleet-edge-roam-imports.mjs` walks the edge graph looking for **bare `@roam/*` specifiers** — a Deno bundling concern, and a worthwhile check on its own — not for `apps/fleet/src` dependencies. It reports clean (`25 reachable fleet file(s), 0 bare @roam/* imports`) while the layering violation stands.

If the intent is to enforce the boundary, the guard needs a second rule: no file under `supabase/functions/` may import from `apps/`. Today a refactor in the fleet UI package can still change what drivers are paid, with CI green.

---

## C-5 — note: A-1's sixth identity is still missing

`checkPeriodInvariants` verifies the row against **itself** — five internal consistency identities, all correct and all valuable. What it does not do is verify the row against the posted ledger:

> projection totals vs `financial_events` sums

That was the one I called the real control total, and it is the only one that would catch the projection as a whole diverging from what was actually posted. Every current check would pass on a period that is internally perfect and completely disconnected from the ledger. Worth adding as a separate aggregate check rather than a per-row one.

---

## Where this leaves the architecture

The three items that mattered most — **A-1 (control calls the formula), A-2 (shared derivation), A-4 (property tests)** — are done and done well. `periodInvariants.ts` is the piece that changes the system's character: a future §1.1 now has a nightly job that catches it, and `derivePeriodStatus` means status logic cannot drift between the two write paths again.

C-1 and C-2 are both the same lesson one more time: **A-2 unified the *status* derivation but not the *persist body*.** The two write paths still each assemble their own column set, which is why the rebuild forgot `signedSnapshot` and the sync forgot the `_minor` columns — two new instances of the original bug, in the same week, from the same cause. Finishing A-2 properly (one function that produces the complete row, both paths differing only in how they build its inputs) closes C-1, C-2, and the next three of these before they are written.

C-3 and the A-3 scaffold are unfinished rather than wrong. Neither is dangerous while unused; both should either be completed or reverted, because half-migrated state is its own liability.

---

# PART VI — FIFTH VERIFICATION PASS (2026-09-01, commit `f3eecf1d`)

**Tests green: 52 finance-core (up from 42) + 1,081 fleet. CI import guard passes both rules.**

**All five Part V findings (C-1…C-5) are fixed, and A-2 is now properly finished** — which was the one structural item I said would prevent the next three bugs. Two new defects found, both latent behind the `SETTLEMENT_TX_TABLE_READ` flag; neither affects production while that flag is off.

## Confirmed done

| Item | Status | Evidence |
|---|---|---|
| **C-1** rebuild wipes `signedSnapshot` | ✅ | `periodSignedSnapshot.ts` — `resolveSignedSnapshot` stamps on payout increase and carries prior forward; `preservePeriodMetaKeys` allowlists it across rebuilds. Both paths call `buildPeriodMetadata` (rebuild `:789`, sync `:1450`). Backed by `driver_period_revisions` (migration `20260901120000`) + `period_revision.ts`. |
| **C-2** `_minor` written by rebuild only | ✅ | `buildCashSettlementPersistFields` returns the `_minor` triple; rebuild consumes it at `:956-958`, sync passes the whole object to `updatePeriodCashWithVersion` at `:1466`. **And** `checkPeriodInvariants` now asserts `*_minor` against the NUMERIC columns (`:118-143`) — exactly the guard that keeps the dual-write honest through cutover. |
| **C-3** A-11 dead table | ✅ (staged) | Now a real migration: dual-write hooked into `kv_store.tsx:66`, bounded read via `loadMirroredDriverTransactions`, flag defaulting off, backfill script. Both read sites collapsed into one `loadDriverTransactionsForSettlement` helper. |
| **C-4** layering + wrong CI guard | ✅ | `tollLedgerIntegrity.ts` and `periodTollCashSpend.ts` moved into `finance-core`; zero `apps/` imports remain in `driver_financial_periods.ts`; `check-fleet-edge-roam-imports.mjs` gained a second rule that actually bans `apps/` imports in the settlement money path. Guard reports clean on both rules. |
| **C-5** no projection↔ledger control total | ✅ | `periodLedgerRecon.ts` sums active `financial_events` by type and diffs against the projection; wired into `finance-recon`. |

### A-2 is now genuinely complete

This is the important one. `buildPeriodMetadata` + `buildCashSettlementPersistFields` mean **both write paths now share the persist body**, not just the status derivation. C-1 and C-2 were two instances of the same root cause — each path assembling its own column set — and the fix removes the cause rather than the instances. A future field added to `CashSettlementPersistFields` reaches both writers automatically.

---

## D-1 🟠 High (latent behind the flag) — the mirror omits two transaction types the settlement math depends on

**Files:** [settlement_transactions.ts:18-20](supabase/functions/_fleet-server/settlement_transactions.ts#L18), [driver_financial_periods.ts:263-273, 305-307](supabase/functions/_fleet-server/driver_financial_periods.ts#L263)

The mirror predicate is:

```ts
export function isSettlementMirrorTransaction(tx: Record<string, unknown>): boolean {
  return isDriverCashPaymentTransaction(tx) || isDriverPayoutTransaction(tx);
}
```

`isDriverCashPaymentTransaction` explicitly returns `false` for write-offs and payouts; `isDriverPayoutTransaction` matches only `type === 'Payout'` / `category === 'Driver Payouts'`. Neither matches `Cash Write Off` or `Toll Charge`.

But `loadDriverTransactionsForSettlement` — the single helper both paths now use — feeds two consumers that need exactly those:

```ts
const driverTxAll = await loadDriverTransactionsForSettlement(driverId, idSet);
const chargeTxAll = driverTxAll.filter((t) => String(t.category || "") === "Toll Charge");
//                                                                          ↑ never mirrored
// and computeWeekCashBase(…, transactions: driverTxAll) → isCashWriteOffForWeek
//                                                          ↑ never mirrored
```

**Executed against the shipped predicate:**

```
  MIRRORED  Cash Collection  (cashReturned)
  MIRRORED  Driver Payout    (settlementPaid)
X MISSING   Cash Write Off   (cashWrittenOff)
X MISSING   Toll Charge      (tollChargedToDriver)
```

With `SETTLEMENT_TX_TABLE_READ=true`:

| Field | Becomes | Effect on settlement |
|---|---|---|
| `cashWrittenOff` | `0` | `adjCashBalance` rises → gross falls → **driver underpaid** by the write-off amount |
| `tollChargedToDriver` | `0` | `cashOwed` falls → gross rises → **driver overpaid** by the charge amount |

They move in opposite directions, so they will not cancel or present as a single clean delta. `checkPeriodInvariants` would not catch it either — the row would be internally consistent with its own (wrong) inputs.

**Do not flip that flag until the predicate covers all four types.**

## D-2 🟠 High (latent) — the backfill script would mirror zero payouts

**File:** [backfill_settlement_transactions.mjs:17-23](scripts/backfill_settlement_transactions.mjs#L17)

```js
function isSettlementTx(tx) {
  const cat = String(tx?.category || "");
  const type = String(tx?.type || "");
  if (cat === "Cash Collection" && type === "Payment_Received") return true;
  if (cat === "Driver Payout" || type === "Driver_Payout") return true;
  return false;
}
```

`buildDriverPayoutTx` emits `category: 'Driver Payouts'` (plural) and `type: 'Payout'`. The script looks for `'Driver Payout'` and `'Driver_Payout'`. **Neither string exists in the data** — every historical payout would be skipped, so `settlementPaid` would read `0` for all backfilled weeks.

The cash branch is also narrower than runtime: it requires category **and** type together, while `isDriverCashPaymentTransaction` accepts either, plus the description-based match (`'cash payment from driver'`) and the `type === 'revenue' && cat.includes('cash')` branch.

So there are now **three different definitions of "a settlement transaction"** — the backfill's, the runtime mirror's, and what the settlement math actually consumes — and all three disagree.

**Fix for both D-1 and D-2 is the same shape as A-1/A-2, one layer down:** export a single `isSettlementParticipantTransaction` from `finance-core`, defined as *anything `computeWeekCashBase` or the Toll Charge filter reads*, and have the mirror, the backfill and any future consumer call it. Then add it to `checkPeriodInvariants`' remit or a dedicated parity check: for a sample of drivers, assert the mirrored set equals the KV set. That parity check is what makes the cutover safe rather than hopeful.

## D-3 🟢 Low — mirror and backfill bucket the period anchor differently

`resolveTransactionPeriodAnchor` (runtime) falls back to `periodKeyFor(date, tz)` — fleet-calendar Monday. The backfill's `periodAnchor()` falls back to `String(tx.date).slice(0, 10)` — a raw date, not a week key, and not timezone-aware.

This is the §2.2 lesson recurring in the new code. Impact is currently nil because `loadMirroredDriverTransactions` queries by `driver_id` alone and the real week filtering still happens inside `computeWeekCashBase`. But the column is indexed as if it were authoritative, and the moment anything reads `period_anchor` from this table the two writers will disagree. Use `periodKeyFor` in both.

---

## Where this leaves things

The architecture work is essentially done. A-1 (control calls the formula), A-2 (one persist body), A-4 (property tests), A-6 (version guards), A-7 (revisions + preserved snapshot), A-8 (dual formula deleted), A-9 (boundary enforced in CI), and C-5 (ledger control total) are all real and load-bearing. The invariant suite now encodes eight checks, including the minor/NUMERIC parity that protects the in-flight A-3 migration.

What remains is **finishing A-11 safely**. Everything about its staging is right — dual-write first, read behind a flag, backfill script, one read helper — but the predicate that decides *what* gets mirrored is wrong in two places and inconsistent in a third. That is a pre-cutover problem, not a production one, and D-1/D-2 are exactly the kind of thing this staged approach exists to catch before the flag flips.

**Recommended order:** unify the predicate in `finance-core` → fix the backfill strings → add a mirror-vs-KV parity check → backfill → verify parity on real drivers → only then flip `SETTLEMENT_TX_TABLE_READ`.

---

# PART VII — CLOSING (Sixth pass + Flawless Finish 2026-09-01)

**Tests green after Flawless Finish.** Deploy + smoke test done. A-11 cutover live (715/715, 0 misses).

## Sixth verification pass (commit `e22752c2`)

**D-1, D-2 and D-3 are all fixed, the A-11 backfill and parity run has been executed against real data (715/715, 0 misses), the read flag has been cut over to ON, and §3.8 / P-6 — the last open business question in the entire audit — is closed with a live sample and a locked decision.**

This is the first pass where I have no money-affecting finding to report.

## Confirmed done

| Item | Status | Evidence |
|---|---|---|
| **D-1** mirror omits write-offs and toll charges | ✅ | `isSettlementParticipantTransaction` in `finance-core/driverCashPayment.ts` covers all four types (`isTollChargeTransaction`, `isCashWriteOffTransaction`, `isDriverPayoutTransaction`, `isDriverCashPaymentTransaction`). `settlement_transactions.ts` calls it; the old `isSettlementMirrorTransaction` is a deprecated alias, so no call site can drift. |
| **D-2** backfill misses every payout | ✅ | Both backfill paths rewritten. `scripts/lib/settlementParticipant.mjs` is a plain-JS port of the finance-core predicates, held in lockstep by `settlementParticipantParity.test.ts` — which asserts the two implementations agree on the exact strings that were wrong (`'Driver Payout'` / `'Driver_Payout'` are now explicit negative samples). `scripts/sql/backfill_settlement_transactions.sql` is a faithful translation including every sub-branch of the cash predicate. |
| **D-3** mirror and backfill bucket differently | ✅ | Both use `periodKeyFor`; the parity test asserts `jsPeriodKeyFor('2026-08-31') === periodKeyFor('2026-08-31')`. |
| **§3.8 / P-6** toll reimbursement | ✅ **Closed** | `docs/settlement-toll-reimbursement-trace.md` records a real traced week (2026-08-24, $3,605 reimbursed against $5,920 spend on $96,442.57 gross). Finding: reimbursement is tag/plaza attribution, **not** a fare line item, so it is not inside `fare_earning` gross. Decision locked: keep `tollReimbursed` display-only. The triple-benefit scenario I raised does not occur. |
| **A-11 cutover** | ✅ | Backfill + parity executed 2026-09-01, 715/715 with 0 misses. `SETTLEMENT_TX_TABLE_READ` now defaults ON with an explicit `=false` rollback documented in `docs/runbooks/settlement-ops.md`. |

### The predicate-duplication concern is properly mitigated

D-1/D-2 arose from three disagreeing definitions of "a settlement transaction." There are still three implementations — TS, `.mjs`, and SQL — because a Node script and a SQL migration cannot import TypeScript. That is a real constraint, not an oversight, and the mitigation is the right one: `settlementParticipantParity.test.ts` fails CI the moment TS and `.mjs` diverge, and it uses the previously-wrong strings as its test samples. The SQL copy is the one still held only by review; worth a note if the predicate ever changes again.

### On the parity verifier's data source — checked and correct

I initially flagged that `verify_settlement_tx_parity.mjs` compares the mirror against `fleet.transactions` while the runtime fallback reads `kv.getByPrefix("transaction:")`, which would have validated the wrong link in the chain. **This is not a problem:** `transaction:` is a mapped dual-write domain in `fleet_domains.ts` (`domain: "transactions"`, `prefixes: ["transaction:"]`), and `kv.getByPrefix` read-throughs to the fleet table first via `readMappedKvPrefix`. The fallback and the verifier read the same source, which is exactly what the runbook means by "fleet table scan." Noting it because it is the kind of thing that looks wrong from the flag name alone.

---

## E-1 — Closed (Flawless Finish Phase 0 + 3B)

- `projectionReadsEventsForTolls()` wired in `driver_financial_periods.ts`
- `projectionReadsEventsForCash()` marked **RESERVED** — ADR `docs/adr/settlement-cash-events-deferred.md`
- CI guard: `scripts/check-projection-flags-wired.mjs`

---

## Flawless Finish program deliverables

| Item | Status | Evidence |
|---|---|---|
| **E-1** flags | ✅ | Tolls wired; cash reserved + CI guard |
| **Ops webhook** | ✅ | `finance-recon` + `FINANCE_RECON_WEBHOOK_DRY_RUN` |
| **Recon minors** | ✅ | SELECT includes `*_minor`; invariants run nightly |
| **Predicate triple-lock** | ✅ | Fixtures + `verify_settlement_predicate_parity.mjs` in CI |
| **A-5 tolls** | ✅ | `PROJECTION_EVENTS_TOLLS` wired; hybrid workflow |
| **A-5 fares recon** | ✅ | `ledger_fare_earning` in `periodLedgerRecon.ts` |
| **A-5 cash** | ✅ Deferred | ADR — A-11 mirror remains cash-tx source |
| **A-3 formula** | ✅ | `computePeriodSettlementMinor` + backfill migration |
| **UX sources panel** | ✅ | `ReconciledPeriodOverlay` data sources |
| **Runbook** | ✅ | Flag matrix + incident tree |

**Prod flag flips (manual):** `PROJECTION_EVENTS_FARES=true`, `PROJECTION_EVENTS_TOLLS=true` after parity scripts reviewed.

---

## Sixth pass detail (retained)

The original audit raised 14 findings. Five subsequent passes raised 7 (NEW), 6 (P), 5 (C) and 3 (D) more — 35 in total, every one of which is now closed except a two-line documentation nit.

More importantly, the architecture program that came out of Part IV is complete and load-bearing:

- **A-1** the nightly control calls `computePeriodSettlement` and cannot skew from it; `periodInvariants.ts` encodes eight identities including the `*_minor` parity that protects the in-flight A-3 migration, and `periodLedgerRecon.ts` adds the projection↔`financial_events` control total.
- **A-2** one metadata builder and one persist body, shared by both write paths — the fix that removed the cause of §1.1, §1.2, NEW-7, C-1 and C-2 rather than their instances.
- **A-4** property tests alongside the example suite.
- **A-6** optimistic concurrency with version guards and bounded retry.
- **A-7** `driver_period_revisions` plus a `signedSnapshot` preserved across rebuilds.
- **A-8** the dual pay formula deleted.
- **A-9** the `apps/` → edge boundary enforced in CI.
- **A-11** staged properly — dual-write, flag-gated read, backfill, parity verification against real data, then cutover.

Three of the last five passes found defects introduced *by the fixes*. That stopped with this one, and the reason is structural rather than lucky: the shared persist body and the invariant suite now make the two most common failure modes — a write path forgetting a field, and a control drifting from the formula — impossible to introduce silently.

**Remaining watch items:** A-3 full NUMERIC deprecation; prod enablement of fares/tolls event flags; cash event writers (Phase 3C backlog).

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
