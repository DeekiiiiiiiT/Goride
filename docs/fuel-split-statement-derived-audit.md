# Fuel Split Payment — Statement-Derived Cash Redesign: Audit

**Status:** **Enabled-ready (pilot)** — 2026-09-19. All money-loss findings closed; §11.3 type gate closed; `applySplitCashMatchToTx` proves C1 write outcomes; `pnpm verify:split-cash-enable` is the permanent pre-enable harness. See §9–§12.
**Date:** 2026-09-19
**Scope:** The redesign where the driver confirms only the pump reading, and the cash portion is derived from the Dominion CSV as `cash = pump total − card amount`.
**Predecessor:** `docs/fuel-split-payment-audit.md` (the driver-typed-cash design). That document's §1–§5 structural conclusions still hold and are not repeated here.

### Remediation checklist

| Finding | Status | Verified |
|---|---|---|
| C1 Re-home + sealed write guard | Done — `fuel_split_cash_rehome.ts` + `persistFuelMatchPair` | ✅ §9.1 |
| C2 Acknowledge must resolve money | Done — `fuelSplitCashLifecycle` + `SplitCashResolveDialog` | ✅ §9.2 |
| C3 Awaiting aging surface | Done — Awaiting statement tab + 14d stale | ✅ §9.3 |
| M1 Tank vs price liters | Done — `fuelTankLiters` / `fuelPriceLiters` | ✅ §9.4 |
| M2 Marker O(1) lookup | Done — `fuel_split:{id}` in match path | ✅ §9.6 |
| M3 Zero cash auto-close | Done — `closeCardCoveredSplitCash` | ✅ §9.6 |
| M4 Price-band cross-check | Done — shared `splitPumpLiters` + no stmt-liter fallback | ✅ §9.5 fixed |
| L2 Tolerance drift test | Kept / still enforced | ✅ |
| §9.8.1 Re-home visible in UI | Done — Pending / Awaiting / resolve dialog | ✅ |
| §9.8.2 Blocked reason visible | Done — `splitCashRehomeBlockedReason` + copy helpers | ✅ |
| §9.8.3 Fail closed on missing identity | Done — `classifySplitCashPeriodLanding` | ✅ |
| §9.7 E2E landing sequence tests | Done — `fuelSplitCashRehome.sequence.test.ts` | ✅ |
| §10.1 Duplicate type `tsc` break | Done — single `SplitCashRehomeBlockedReason` export | ✅ |
| §10.7 Matcher M4 mirror drift | Done — shared matcher + source drift test | ✅ |
| §11.3 `SplitCashTxPatch.status` narrow | Done — `'Pending' \| 'Rejected'`; fleet `tsc` = 502 | ✅ §12.1 |
| §12.2 persist apply glue tests | Done — `applySplitCashMatchToTx` + `fuelSplitCashMatchApply.test.ts` | ✅ |
| Pre-enable harness | Done — `pnpm verify:split-cash-enable` | ✅ §12.2 |

**Status:** Ready for ops enable — run `pnpm verify:split-cash-enable`, complete §12.4 walkthrough, then follow §12.5 runbook.

---

## 1. Verdict

The mechanism is built carefully and the arithmetic after reconciliation is exact. The two-row model still holds, the volume guard still holds, and the atomic write path is unchanged and still correct.

**But the redesign is not production-ready as it stands.** Inverting the flow moved the moment the cash amount becomes known from *log time* to *statement time* — which is after the weekly close boundary. Three defects follow from that, and all three end in the same place: **a driver does not get reimbursed and nothing in the system reports it.**

| Severity | Finding | One-line |
|---|---|---|
| 🔴 **Critical** | [C1](#c1) | Awaiting-cash rows are excluded from the finalize blockers, so the week closes without them — and the later write has no period-lock check |
| 🔴 **Critical** | [C2](#c2) | "Acknowledge split mismatch" makes an unpaid $0 reimbursement invisible everywhere, permanently |
| 🟠 **High** | [C3](#c3) | If the statement never arrives, nothing ever surfaces the stranded row |
| 🟡 Medium | [M1](#m1) | `fuelOpsLiters` now counts volume without its cost — JMD/L is understated during the awaiting window |
| 🟡 Medium | [M2](#m2) | Full transaction-table scan per matched statement row, unscoped by org or date |
| 🟡 Medium | [M3](#m3) | A fully card-covered fill leaves a $0 Pending reimbursement sitting in the approval queue |
| 🟡 Medium | [M4](#m4) | The independent cross-check is gone — an OCR error in the pump total now flows straight into the payout |

C1–C3 are correctness bugs, not rollout-pace concerns. Fixing them is what removes the need for a soak period — they should be closed regardless of how fast you want to ship.

---

## 2. What changed

| | Previous design | New design |
|---|---|---|
| Driver types | Cash portion | **Nothing** — confirms OCR'd pump total + liters |
| Cash amount at log time | Known, real | **$0**, `awaitingCashStatement: true` |
| Card amount at log time | Derived claim (`pump − cash`) | Unknown |
| Cash amount resolved | Never — it was the truth | `pump − card`, when the CSV lands |
| Cross-check | Statement vs driver's claim | Card ≤ pump + tolerance only |
| Reimbursement timing | Same week as the fill | **Whenever the statement arrives** |

The last row is the whole audit. Everything below follows from it.

Confirmed in code: `DriverExpenses.tsx` now passes `{ cashAmountOverride: 0 }`, the cash field component is gone, and validation is `validateSplitPumpAmounts(amount, liters)`. `persistSplitFill` force-sets `cashTx.amount = 0` and stamps `awaitingCashStatement: true`. `fuel_jaa_match.ts` derives `splitDerivedCashAmount = pump − stmt` and writes the real amount onto the cash transaction.

---

## 3. What is correct

Worth stating, because the core is sound and should not be disturbed while fixing the rest.

- **`awaitingCashStatement: true` is stamped at creation**, both client-side in `buildCashSplitMetadata` and server-side in `persistSplitFill`. The $0 row is correctly excluded from spend totals via `countsInFuelLogSpend` from the moment it exists — there is no window where a $0 row counts as a real cash expense.
- **Post-reconciliation arithmetic is exact.** Cash row gets `pump − card`, card row gets `stmt.amount`, cash row owns all pump liters. The two amounts sum to the pump total, so ops `JMD/L = pumpTotal ÷ pumpLiters` once both halves are settled.
- **The volume guard survived the rewrite in both matcher copies** (`jaaFuelStatementMatcher.ts` and `fuel_jaa_match.ts`). The card row still gets `liters: 0` and `countsInFuelVolume: false` permanently, with statement liters retained as `splitStatementLiters` for audit.
- **Atomicity is untouched and still correct** — guards before any write, cash-then-card with compensating delete, idempotent on `fillGroupId`, client-minted IDs.
- **`splitPumpTotal` is now mandatory server-side** (`MISSING_PUMP_TOTAL`, 400). Since the entire cash derivation hangs off it, rejecting a fill without it is exactly right. The old fallback of inferring the pump total from `cashTx.amount` would now silently produce `0`.
- **Legacy dual-read is handled.** Fills created under the old design still carry `splitExpectedCardAmount`; both matchers compare the statement against that claim *as well as* against the pump and flag variance if either disagrees. Old in-flight fills will not be mis-reconciled.
- **The flag mirrors stayed consistent.** `OPT_IN_MODULE_KEYS` is emptied in both `packages/platform-settings/src/modules.ts` and `supabase/functions/_fleet-server/enterprise_modules.ts`, so client and server agree that `fuelSplitPayment` is now default-on. Orgs can still explicitly disable it (`org[key] !== false`).

---

## 4. Findings

### <a id="c1"></a>🔴 C1 — Split cash reimbursements escape their own week

**The defect.** `listUnapprovedFuelTxInWindow` is documented in its own header as *"Pending fuel reimbursements in [startYmd, endYmd] inclusive — **Finalize hard blockers**."* It now skips awaiting-cash rows:

```ts
// packages/fuel-core/src/fuelReviewQueue.ts:190-193
if (!isPendingFuelQueueRow(t)) continue;
if (metaFlagOn(t.metadata?.awaitingCashStatement)) continue;   // ← skipped
```

`isPendingReadyForReview` also returns `false` for them, so they never appear in the review queue as actionable either.

**Why that is fatal.** The cash transaction is dated on the fill date. So:

1. Monday — driver logs a split fill. Cash tx created at **$0**, `awaitingCashStatement: true`.
2. Sunday — week finalizes. The row blocks nothing and is visible nowhere. **The week closes with the cash portion recorded as $0.**
3. Later — the Dominion CSV arrives. `persistFuelMatchPair` sets `tx.amount = -derivedCash`.
4. That transaction is dated **inside a week that is already closed.**

**There is no period-lock check anywhere in the write path.** `fuel_jaa_match.ts` writes the amount with a bare `kv.set` — it does not consult the week seal, the period lock, or the finalize state. It will happily mutate money inside a sealed period.

**The blast radius is total.** `awaitingCashStatement` appears in the eligibility rules, the review queue, the matcher, the split-fill writer and the display layer. It appears in **none** of:

- `apps/fleet/src/utils/fuelFinalizeGating.ts`
- `apps/fleet/src/services/fuelFinalizeService.ts`
- `apps/fleet/src/services/settlementService.ts`
- `supabase/functions/_fleet-server/week_close.ts`
- `supabase/functions/_fleet-server/fuel_week_seal.ts`

The close path has no idea this state exists. The outcome is one of two bad ones, depending on whether the sealed week is re-openable: either the reimbursement is **never paid**, or a **sealed period mutates retroactively**. Neither is acceptable for money that a driver is owed.

This is the exact failure mode the project's own reconciliation work already learned — the settlement-close memory records the rule as *"make invariants unrepresentable, and evaluate every refusal before the irreversible step."* Week close is the irreversible step, and it currently cannot see this refusal.

**Fix direction.** Pick one, deliberately:

- **(a) Block the close.** Treat an awaiting-cash row in the window as a finalize blocker with its own reason (`awaiting_card_statement`). Honest and safe, but week close now depends on Dominion's delivery cadence — likely unacceptable operationally.
- **(b) Re-home the money (recommended).** Let the week close, but when the statement lands, post the derived cash into the **current open period** rather than the fill's original week, carrying `originalFillDate` and `fillGroupId` for audit. The fill's *physical* facts (liters, odometer) stay in week N; the *money* lands where it can actually be paid. This matches how the card half already behaves.
- **(c) Refuse to close silently.** At minimum, if neither (a) nor (b), the close must record that week N contains N unresolved split fills, and a report must list closed weeks holding unpaid split cash.

Whichever you choose, `fuel_jaa_match.ts` needs an explicit period check before it writes an amount, so a sealed week can never be mutated by a CSV import.

---

### <a id="c2"></a>🔴 C2 — "Acknowledge split mismatch" permanently hides an unpaid reimbursement

**The defect.** The operator action in `FuelManagement.tsx:1370` calls:

```ts
// packages/fuel-core/src/fuelReviewQueue.ts:167-175
export function acknowledgeSplitVarianceMeta(meta) {
  return { ...meta, splitReconciled: true };   // ← that is all it does
}
```

It sets `splitReconciled: true` and nothing else. It does **not** clear `awaitingCashStatement`, and it does **not** set a cash amount.

**Trace the row afterwards.** With `splitReconciled: true`, `awaitingCashStatement: true`, `amount: 0`:

| Surface | Predicate | Result |
|---|---|---|
| Variance count | `isUnresolvedSplitVariance` requires `!splitReconciled` | ❌ dropped |
| Review queue | `isPendingReadyForReview` returns false while awaiting | ❌ never shown |
| Finalize blockers | `listUnapprovedFuelTxInWindow` skips awaiting | ❌ never blocks |
| Amount | untouched | **$0** |

The transaction becomes **invisible on every surface simultaneously, permanently, at zero.** The driver is never paid and no report will ever mention it again.

The trigger is a normal operator action whose label — "Split mismatch acknowledged" — implies the discrepancy was *reviewed*, not that the reimbursement was *cancelled*. An operator clearing a variance queue has no way to know they just wrote off a driver's money.

**Secondary issue:** the handler loops over all `fillGroupId` siblings and stamps `splitReconciled: true` on the **card** row too. The card row was never in variance; marking it reconciled is semantically wrong and destroys the audit trail of what actually disagreed.

**Fix direction.** Acknowledging a variance must be a decision about the *money*, not just the flag. It needs to either (i) accept the derived cash and set the real amount, (ii) accept an operator-entered cash amount with a reason, or (iii) explicitly void the reimbursement with a reason — and in all three cases clear `awaitingCashStatement` so the row rejoins the normal approval path. Leaving a row both "reconciled" and "awaiting" should be unrepresentable.

---

### <a id="c3"></a>🟠 C3 — A statement that never arrives is never surfaced

There is no aging, staleness or exception surface for awaiting-cash rows. A search for any such detector (`staleSplit`, `awaitingSince`, `daysAwaiting`, …) returns nothing.

The cash row depends on the card row matching a statement line, which requires a score ≥ 55 on card + vehicle + time. That match can legitimately fail: the card was never swiped after all, the CSV row is missing or malformed, the vehicle/card assignment changed, or the fill falls outside the 36-hour window.

When it fails, the cash transaction sits at $0 with `awaitingCashStatement: true` **forever** — outside the review queue, outside the finalize blockers, outside the variance count. It is functionally identical to the C2 end state, just reached by inaction instead of a click.

**Fix direction.** Any awaiting-cash row older than one statement cycle (or a fixed threshold — two weeks is a defensible start) must escalate onto an exceptions surface with an operator resolution path. Until a row is either paid or explicitly voided with a reason, it must remain visible somewhere.

---

### <a id="m1"></a>🟡 M1 — Volume is now counted without its cost, understating JMD/L

`fuelOpsLiters` gained a special case: an awaiting-cash split volume-owner returns its full pump liters even though `countsInFuelLogSpend` is false.

```ts
// packages/fuel-core/src/fuelOpsEligibility.ts:79-87
if (countsInFuelLogSpend(entry)) return liters;
if (meta?.awaitingCashStatement === true && meta?.splitVolumeOwner === true && …) {
  return liters;   // ← liters counted, spend is 0
}
```

The intent — tank truth for the cycle engine — is legitimate. The problem is that this one function serves two different questions, and its own prior contract said so explicitly. The comment that was replaced read:

> *"Litres for ops analytics / JMD/L — same eligibility as spend (F-3). … fee/declined/**awaiting** rows do not dilute price."*

That invariant is now broken. During the awaiting window the fill contributes **all** of its liters and **none** of its cost, so every price metric built on `spend ÷ liters` reads artificially low.

This is not a narrow blast radius. `fuelOpsLiters` feeds `useFuelAnalytics`, `fuelAnalyticsAggregates` (including the price-outlier loss estimate at `:778`), `FuelPerformanceAnalytics`, `ReportsPage`, `deriveWindowMoneyFromEntries`, `odometerBucketEngine`, and — notably — `supabase/functions/_fleet-server/fuel_week_closable_gate.ts`, the week-closable gate.

**Fix direction.** Separate the two concepts rather than overloading one. A `fuelTankLiters` (physical volume, includes awaiting split rows) and a `fuelPriceLiters` (price denominator, excludes anything whose cost is not yet known) makes both answers correct. The already-deprecated `fuelOpsPriceLiters` alias suggests this split was once intended.

---

### <a id="m2"></a>🟡 M2 — Full transaction-table scan per matched statement row

To find the cash sibling, `persistFuelMatchPair` does:

```ts
const txs = (await kv.getByPrefix("transaction:")) || [];
for (const raw of txs) { … if (tm.fillGroupId !== fillGroupId …) continue; … }
```

`getByPrefix` pages through **every transaction in the KV store** — no organization scope, no date bound — accumulating all of them into an in-memory array (`kv_store.tsx:176-196`). This runs **once per matched statement row**.

A CSV import containing *M* split matches against a table of *N* transactions is O(N × M) with *N* full materialisations. On a fleet with tens of thousands of transactions this will be slow and memory-hungry inside an edge function, which has hard CPU and memory ceilings. Since the ask is production-now, this is worth fixing before volume builds rather than after.

It is also a cross-tenant read: the scan walks other organizations' transactions. Correctness is not at risk (a `fillGroupId` is a UUID, so collisions are implausible), but it is a wider data read than the operation needs.

**Fix direction.** Index the lookup on `fillGroupId` — either a `fuel_split:{fillGroupId}` marker extended to carry the cash transaction id (the marker already exists and already stores `cashTransactionId`), or a scoped query. The marker written by `persistSplitFill` already has exactly the id needed; reading it is O(1) and removes the scan entirely.

---

### <a id="m3"></a>🟡 M3 — A fully card-covered fill leaves a $0 reimbursement in the queue

When the card covered the entire sale, `derivedCash` is `0` and the row reconciles cleanly: `reconciled = true`, `awaitingCashStatement = false`, `amount = 0`.

`isPendingFuelQueueRow` has **no amount check** (`fuelReviewQueue.ts:96-108`) — it matches on status, category and payment method only. So a `$0` `Pending` Fuel expense with `paymentMethod: 'RideShare Cash'` now enters the approval queue and an operator must action a reimbursement for nothing.

Mildly confusing at one fill; meaningful noise at scale, and it dilutes attention on a queue that is the sole fuel approval gate.

**Fix direction.** When `derivedCash` rounds to zero, void or auto-close the cash transaction with a reason (`card_covered_full`) instead of leaving it Pending. It was never a real expense.

---

### <a id="m4"></a>🟡 M4 — The independent cross-check is gone

This is a design consequence rather than a coding defect, but it should be an explicit decision rather than a side effect.

The previous design had **two independent sources** for the same fill: the driver's typed cash and the Dominion statement. Comparing them caught errors on both sides — a mistyped cash figure *and* a wrong statement line.

The new design *defines* cash as `pump − card`. The pump total is now a single point of failure with no second opinion. The only remaining guard is `card ≤ pump + tolerance`, which catches the card being too large but says nothing about the pump total itself being wrong.

Concretely: if OCR reads `$5,400` as `$8,400` and the driver confirms it (a confirm-only step invites less scrutiny than a type-it step), and the card statement says `$3,000`, the system derives `$5,400` of cash and reimburses it. Nothing anywhere will flag this. The old design would have caught it — the driver's typed cash of `$2,400` versus a derived `$5,400` is a `$3,000` variance.

This is a real loss of control, and it interacts badly with C1–C3: the error surfaces as money paid out, days later, in a week that has already closed.

**Fix direction.** Not necessarily a reversal. A cheap independent check restores most of the value — for example validating the derived `$/L` against the station's known price band for that date (the codebase already has `stampFuelEntryRetailPrice` and a Petrojam price feed), and flagging a fill whose implied price deviates materially. That catches a mis-read pump total without asking the driver to type anything.

---

### Low / notes

- **L1** — In both matchers, `derivedCash >= -tolerance` is implied by `stmtAmt <= pumpTotal + tolerance`; the condition is redundant. Harmless, but it makes the rule read as more defensive than it is.
- **L2** — The tolerance rule (`max(50, pump × 0.01)`) now exists in three places: `fuelSplitPayment.ts` plus both matcher mirrors. Keep-in-sync comments are present and correct, but nothing enforces them. A drift test would.
- **L3** — `fuelSplitPayment` is now default-on for every org, with both mirrors consistent and per-org disable still available. That matches the stated intent; it simply means C1–C3 land on every org at once rather than on a pilot.

---

## 5. The structural point

Each finding above has its own fix, but they share one cause worth naming.

The old design had a useful property: **the money was fully known at the moment the record was created.** Everything downstream — approval, settlement, week close — could treat a split fill as an ordinary fill, which is exactly why §5 of the previous audit could truthfully say the money layer needed zero changes.

The new design breaks that property. The record is now created in an *incomplete* state and completed asynchronously by an external file that arrives on someone else's schedule. That is a legitimate thing to build, but it introduces a lifecycle the money layer has never had to model before — and the money layer was not told.

C1 is the close boundary not knowing about the incomplete state. C2 is the resolution path not knowing it owns money. C3 is nobody owning the case where completion never happens. All three are the same omission viewed from different angles: **an asynchronous completion needs a guardian — something that knows a row is incomplete, blocks or defers the irreversible step, and escalates when completion doesn't arrive.** Right now `awaitingCashStatement` is a display flag that three different subsystems use to *skip* the row, and no subsystem uses to *chase* it.

Fixing C1–C3 individually will work. Introducing that guardian explicitly would prevent the next three.

---

## 6. Recommended order before going live

1. **C2** — smallest change, largest immediate risk. Make "acknowledge" resolve the money, and make `reconciled && awaiting` unrepresentable. One function plus its handler.
2. **C1** — decide (a) block, (b) re-home, or (c) report; then add a period-lock check in `fuel_jaa_match.ts` so a CSV can never write into a sealed week regardless of which you chose.
3. **C3** — an aging surface for awaiting-cash rows, with an operator resolution path.
4. **M2** — read the `fuel_split:{fillGroupId}` marker instead of scanning; it already holds `cashTransactionId`.
5. **M3** — void zero-cash rows rather than queueing them.
6. **M1** — split tank liters from price liters.
7. **M4** — add the price-band sanity check on the derived `$/L`.

Items 1–3 are what make the soak unnecessary. They close the paths where money is lost silently; once nothing can fail without being visible, shipping fast is a reasonable call.

---

## 7. Test and typecheck status

| Check | Result |
|---|---|
| Vitest — `fuel-core`, `roam-shared/fuel`, fuel logs | ✅ **168/168** across 24 files |
| Deno — split-fill gate, opt-in modules, odometer collapse | ✅ pass |
| Deno `check` on `fuel_split_fill.ts` | ⚠️ 3 errors — **all pre-existing**, verified against a clean `9aa06730` worktree (2 in `fuel_posted_guarantee.ts`, 1 pre-dating this change). **No regression.** |
| `fuelPaidByDriver.n1.test.ts` | ⚠️ still fails to load on missing `VITE_SUPABASE_URL` — pre-existing environment issue, unrelated |

**The tests passing is not reassurance about C1–C3.** Every finding in §4 is about behaviour that spans subsystems — the close path, the acknowledge path, the never-arrives path. The unit tests cover each piece in isolation and all of them are individually correct. No test in the suite creates a split fill, closes a week, and then imports a statement, which is the sequence that fails.

---

## 8. Key file reference

| Concern | File |
|---|---|
| Split contract, derivation, validation | `packages/fuel-core/src/fuelSplitPayment.ts` |
| Spend / volume eligibility (**M1**) | `packages/fuel-core/src/fuelOpsEligibility.ts` |
| Review queue, finalize blockers (**C1**, **C2**, **M3**) | `packages/fuel-core/src/fuelReviewQueue.ts` |
| Server statement match + cash write (**C1**, **M2**) | `supabase/functions/_fleet-server/fuel_jaa_match.ts` |
| Shared matcher mirror (**L2**) | `packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts` |
| Split creation, $0 stamp, module gate | `supabase/functions/_fleet-server/fuel_split_fill.ts` |
| Acknowledge handler (**C2**) | `apps/fleet/src/pages/FuelManagement.tsx:1370` |
| Driver pump-confirm flow | `apps/driver/src/components/fleet/DriverExpenses.tsx` |
| Finalize gating — unaware of awaiting (**C1**) | `apps/fleet/src/utils/fuelFinalizeGating.ts` |
| Settlement — unaware of awaiting (**C1**) | `apps/fleet/src/services/settlementService.ts` |
| Week close / seal — unaware of awaiting (**C1**) | `supabase/functions/_fleet-server/week_close.ts`, `fuel_week_seal.ts` |
| KV prefix scan (**M2**) | `supabase/functions/_fleet-server/kv_store.tsx:176` |
| Module flag defaults (**L3**) | `packages/platform-settings/src/modules.ts`, `supabase/functions/_fleet-server/enterprise_modules.ts` |
| **Split Cash Guardian** (remediation) | `packages/fuel-core/src/fuelSplitCashLifecycle.ts` |
| **Re-home planner** (remediation) | `supabase/functions/_fleet-server/fuel_split_cash_rehome.ts` |
| **Resolve dialog** (remediation) | `apps/fleet/src/components/fuel/SplitCashResolveDialog.tsx` |

---

## 9. Remediation review (2026-09-19)

Reviewed against the working tree (uncommitted, on top of `c91511ba`). **All seven findings are genuinely closed** — not flag-flipped, but fixed at the mechanism. One new defect was introduced inside the M4 fix, and three residual gaps remain that are visibility rather than money.

The naming is apt: `fuelSplitCashLifecycle.ts` is the guardian §5 said was missing. `awaitingCashStatement` is no longer a flag that three subsystems use to *skip* a row — there is now a module that owns the incomplete state, classifies it, ages it, and forces a resolution.

### 9.1 C1 — Re-home + sealed-write guard ✅

`planSplitCashPeriodLanding` checks **three independent seal sources** before any money write: `fuel_reconciliation_period` (status / `locked_at`), `driver_financial_periods` (status / `fuel_finalized` / `closed_at`), and the latest week statement. If the fill week is sealed it walks forward up to 12 candidate weeks for the first open one.

All three outcomes are correct:

- `write_in_place` — week open, normal write.
- `rehome` — stamps `originalFillDate` / `cashRehomedFromWeek` / `cashRehomedToWeek` and moves `tx.date` to the open week. Physical facts (liters, odometer) stay on the original fill; only the money moves. This is option (b) from C1.
- `blocked_no_open_target` — **never mutates the money.** Leaves `awaitingCashStatement: true`, sets `splitVariance: true`, stamps `splitCashRehomeBlocked`, and logs. The sealed week is not touched.

That last branch is the important one: the failure mode is now "visible and unpaid" rather than "silently mutated". Combined with the re-home path, it is now defensible that awaiting rows are excluded from `listUnapprovedFuelTxInWindow` — the money has somewhere legitimate to land, so skipping the finalize blocker is no longer a leak. The header comment was updated to say exactly that, which matters for whoever reads it next.

### 9.2 C2 — Acknowledge must resolve money ✅

The strongest fix of the set. `acknowledgeSplitVarianceMeta` was not merely left unused — it now **throws**, with a test asserting the throw:

```ts
throw new Error('acknowledgeSplitVarianceMeta_removed: use resolveSplitCashAcceptDerived|Manual|Void');
```

Killing a dangerous API by making every remaining caller fail loudly is the right call; deprecating it while it still worked would have left the trap armed.

It is replaced by three explicit actions, each of which decides the *money*:

| Action | Amount | Status | Guard |
|---|---|---|---|
| `resolveSplitCashAcceptDerived` | `-derivedCash` | Pending | falls through to card-covered close when cash ≤ 0 |
| `resolveSplitCashManual` | `-enteredCash` | Pending | **requires a reason ≥ 8 chars**, throws otherwise |
| `resolveSplitCashVoid` | `0` | **Rejected** | **requires a reason ≥ 8 chars**, throws otherwise |

The invariant is now structurally enforced rather than merely observed: `normalizeSplitCashResolvedMeta` always writes `splitReconciled: true`, `awaitingCashStatement: false` and `splitVariance: false` together, and `assertSplitCashInvariant` clears `awaiting` if any caller ever stamps both. `reconciled && awaiting` — the exact state that made C2 invisible — is unrepresentable on every write path.

`stampSplitVarianceSiblingAudit` also fixes the secondary issue: the card sibling gets an audit stamp instead of a false `splitReconciled: true`, so the record of what actually disagreed survives.

### 9.3 C3 — Aging surface ✅

`isAwaitingCashTx`, `daysAwaitingCash`, `isStaleAwaitingCash` (14 days), `listAwaitingCashStatement`, `listStaleAwaitingCashStatement`, and `classifySplitCashState` covering `awaiting | variance | stale | resolved | voided | card_covered`.

Crucially, `countFuelReviewQueueWork` now adds `awaitingCash` **into `total`**, so these rows reach the nav badge. A dedicated Awaiting-statement tab renders them with a stale count and an explicit banner — *"N fills waiting 14+ days — chase the statement or enter cash / void."* That sentence names the two exits, which is what stops a queue becoming a graveyard.

The `blocked_no_open_target` rows from §9.1 surface here too: they are both awaiting and variance, so they appear in the tab and in the variance count.

### 9.4 M1 — Tank vs price liters ✅

The best judgement call in the batch. Rather than migrating ~20 call sites and hoping none were missed, `fuelOpsLiters` was redefined to delegate to `fuelPriceLiters` — the **safe, pre-change** semantics. Every existing analytics call site reverts to correct behaviour with no edit, and only call sites that genuinely need physical volume opt in to `fuelTankLiters`.

The opt-ins are exactly the right three: `odometerBucketEngine` (tank cycles, 4 sites), `stopToStopClosableFlags`, and `fuel_week_closable_gate`. The documented invariant — *"fee/declined/awaiting rows do not dilute price"* — is restored verbatim in the `fuelPriceLiters` docstring.

Defaulting the ambiguous name to the conservative behaviour is why this one is safe.

### 9.5 ⚠️ M4 — built, but it will false-positive on nearly every split fill

**The control works; its input never reaches it.** `splitPumpLiters` is stamped on both rows, but the two lines are not equivalent:

```ts
// cash row (fuel_split_fill.ts:132) — has the fuelVolume fallback
splitPumpLiters: Number(cashTx.quantity) || Number(cashTx.metadata?.fuelVolume) || undefined,

// card row (fuel_split_fill.ts:146) — does NOT
splitPumpLiters: Number(cardEntry.liters) || Number((cashTx as { quantity?: number }).quantity) || undefined,
```

On the card row, `cardEntry.liters` is `0` by construction (the volume guard), and `cashTx.quantity` is **never set** — `FinancialTransaction.quantity` exists on the type (`packages/types/src/data.ts:855`) but `DriverExpenses.tsx` never populates it; the driver writes `metadata.fuelVolume`. So the card row's `splitPumpLiters` resolves to `undefined`.

`applyFuelMatchLinks` reads the **card** row, so:

```
drvMeta.splitPumpLiters → undefined
drv.liters              → 0   (card row, by design)
litersForBand           → falls back to stmtLitersNum — the CARD PORTION's liters
```

The implied price becomes *full pump total ÷ partial liters*, inflated by construction.

**Worked example.** Pump $10,000 for 50 L — a true $200/L. The card covered $6,000, so the statement reports ~30 L. Implied = `10,000 ÷ 30 = $333/L` against a $200 retail estimate → 66% over → **outlier flagged**, at an 18% threshold, on a completely normal fill.

No money moves on this flag, so it is not a C-class defect. But a control that fires on nearly every split fill is worse than no control: it trains operators to dismiss the one badge that exists to catch a mis-read pump total — the exact threat M4 was added for. It will also light up the Awaiting-statement tab and the resolve dialog, both of which render `splitPumpPriceOutlier`.

**Fix:** give the card row the same `cashTx.metadata?.fuelVolume` fallback the cash row already has. One expression.

**Worth noting how this hid.** The explicit cast `(cashTx as { quantity?: number })` on the card line silenced the type error that would have flagged the missing fallback — while the cash line, written without a cast, is precisely the one Deno now reports (§9.7a). The cast suppressed the checker on the line that was wrong and left it on the line that was right.

### 9.6 M2, M3 ✅

**M2** — `loadCashSiblingTx` reads `fuel_split:{fillGroupId}` and fetches the transaction by id: O(1), using the `cashTransactionId` the marker already carried. The legacy full-scan is retained as a fallback for pre-marker rows and **backfills the marker when it finds one**, so old rows self-heal onto the fast path instead of scanning forever.

**M3** — `closeCardCoveredSplitCash` sets `status: 'Rejected'` with `splitCardCoveredFull` + `splitCashVoided`, so a zero-cash fill leaves the queue instead of sitting Pending. `isPendingReadyForReview` gained three independent guards (card-covered, voided, and a `< 0.005` reconciled-split amount check), so the row cannot re-enter by any route.

### 9.7 Tests and typecheck

| Check | Result |
|---|---|
| Vitest — `fuel-core`, `roam-shared/fuel`, fuel logs | ✅ **186/186** across 27 files |
| Deno — split-fill gate, opt-in modules, odometer collapse | ✅ pass |
| Deno `check` | ⚠️ **3 → 4 errors** — one new (§9.7a) |
| Wider `apps/fleet/src/components/fuel` | ⚠️ 6 failures — **unrelated**, see below |

**9.7a — one new Deno type error.** `fuel_split_fill.ts:132`: `Property 'fuelVolume' does not exist on type '{}'` — `cashTx.metadata` is untyped, so the property access does not check. Type-only; the runtime behaviour is correct (this is the line that *works*). It will not block deploy, since the edge bundle is built by esbuild without type-checking. But the count moved the wrong way, and it sits one line from the real defect in §9.5.

**The 6 wider failures are not from this work.** Three files — `FuelPeriodLandingPage`, `FuelPeriodResetDialog`, `FuelPeriodWizardShell` — are **untouched by this change** (`git status` on `apps/fleet/src/components/fuel/reconciliation/` is empty), and the failure modes are a missing `toBeEnabled` jest-dom matcher and `Found multiple elements with role "button"` from duplicate responsive rendering. Neither touches split cash, liters, or the review queue. A further 8 files fail to load on the long-standing missing `VITE_SUPABASE_URL`. *Caveat:* I could not run a clean baseline to prove these green beforehand — the throwaway worktree lacked module resolution — so this rests on the files being untouched and the failure modes being unrelated. Strong, but not a direct measurement.

**As in the previous round, the green split suites are not evidence about C1–C3.** No test walks the full sequence — create split fill → close week → import statement → assert the money landed in the open period. That sequence is now *implemented* correctly; it remains *untested* end to end. `fuelSplitCashRehome.sequence.test.ts` covers the planner's decisions, which is most of the value, but it does not exercise `persistFuelMatchPair` against sealed-period fixtures.

### 9.8 Residual gaps — visibility, not money

None of these can lose a reimbursement. All three are worth closing before ops meet the feature.

1. **The re-home is invisible on screen.** `originalFillDate`, `cashRehomedFromWeek`, `cashRehomedToWeek` and `cashRehomedAt` are all stamped, but nothing renders them — no reference in `FuelReimbursementTable.tsx` or `SplitCashResolveDialog.tsx`. An operator reconciling week N+1 sees a fuel reimbursement dated in a week where no fill happened, with no explanation. The audit trail exists in the data and not in the UI, which is exactly where trust in a money system is won or lost. A "moved from week N — fill dated X" line closes it.

2. **`splitCashRehomeBlocked` is written but never read.** The blocked row does surface (as awaiting + variance), so nothing is lost — but the operator sees a generic mismatch rather than *"no open period to post this into."* Those need different actions: one is a statement problem, the other is period management.

3. **The seal check fails open when identity is missing.** `planSplitCashPeriodLanding` returns `write_in_place` when `orgId` or `driverId` is empty — bypassing all three seal checks. In `persistFuelMatchPair` both resolve through several fallbacks and will normally be present, but an unassigned-driver fill would write into a possibly-sealed week, silently skipping the guarantee C1 exists to provide. Since this branch is the guardian's own front door, it should fail **closed** — treat missing identity as `blocked_no_open_target`.

### 9.9 Verdict

The structural criticism in §5 has been answered. The incomplete state now has an owner: it is classified, aged, escalated, forced to a reasoned resolution, and — most importantly — it can no longer be marked resolved while still awaiting, because that combination is unrepresentable on every write path. The three money-loss paths are closed at the mechanism, not patched at the symptom.

**Before enabling:**

1. **§9.5** — add the `metadata?.fuelVolume` fallback to the card row's `splitPumpLiters`. One expression, and without it M4 is noise that will be trained away.
2. **§9.8.3** — make the missing-identity branch fail closed.
3. **§9.8.1** — render the re-home on the reimbursement row.

Items 2 and 3 are small; item 1 is one line. With those, this is ready. The end-to-end sequence test in §9.7 is the thing worth adding next — it is the only check that would catch a regression in any of C1–C3 at once.

*All four were closed in the following round — see §10.*

---

## 10. Polish round review (2026-09-19)

All four §9.9 items are closed, and the two fixes I proposed were both implemented better than proposed. One new defect was introduced, and it breaks the build.

| Item | Verified |
|---|---|
| §9.5 M4 price band | ✅ §10.2 — fixed at the root, and it now fails safe on legacy rows |
| §9.8.3 Fail closed on missing identity | ✅ §10.3 — extracted to a pure, testable classifier |
| §9.8.2 Blocked reason visible | ✅ §10.3 |
| §9.8.1 Re-home visible in UI | ✅ §10.4 |
| §9.7 E2E sequence tests | ✅ §10.5 — 5 tests, all four landing decisions |
| — | 🔴 **§10.1 — new duplicate type, `tsc` fails** |

### 10.1 🔴 New: duplicate `export type` breaks the typecheck

~~`packages/fuel-core/src/fuelSplitCashLifecycle.ts` declares the same type twice~~ — **Closed:** single `SplitCashRehomeBlockedReason` export remains; `tsc` clean on fuel-core.

```
line 356:  export type SplitCashRehomeBlockedReason = 'missing_identity' | 'no_open_period';
line 387:  export type SplitCashRehomeBlockedReason = 'missing_identity' | 'no_open_period';
```

```
packages/fuel-core/src/fuelSplitCashLifecycle.ts(356,13): error TS2300: Duplicate identifier 'SplitCashRehomeBlockedReason'.
packages/fuel-core/src/fuelSplitCashLifecycle.ts(387,13): error TS2300: Duplicate identifier 'SplitCashRehomeBlockedReason'.
```

Fleet typecheck moved **502 → 505**. Both declarations are identical, so deleting either one fixes it with no other change.

**Why the tests did not catch it.** Vitest compiles through esbuild, which strips types without checking them — so 195/195 passed with a type error sitting in the file. This is the same blind spot that let the M4 cast hide a real defect last round (§9.5): the suite is green on code `tsc` rejects. Worth wiring a typecheck into whatever gate runs before enable, because the test suite structurally cannot see this class of problem.

### 10.2 M4 — fixed at the root ✅

Better than the one-line patch I suggested. Rather than duplicating the fallback onto the card row, the liters are now resolved **once** and stamped on both rows from the same value:

```ts
// Shared pump liters BEFORE card liters are zeroed — M4 price band needs full pump volume
const cashMeta = (cashTx.metadata as Record<string, unknown> | undefined) || {};
const pumpLiters =
  Number(cashTx.quantity) || Number(cashMeta.fuelVolume) || Number(cardEntry.liters) || 0;
const splitPumpLiters = pumpLiters > 0 ? pumpLiters : undefined;
```

The ordering is the subtle part — this runs *before* `cardEntry.liters = 0`, and the comment says so, which is what stops someone reordering it later and silently re-breaking the band.

The matcher was tightened to match: `fuel_jaa_match.ts:109` now reads `Number(drvMeta.splitPumpLiters) || 0` with **no fallback to statement liters**. That removes the inflation path entirely rather than making it less likely.

**It also fails safe on legacy rows.** A split fill created before this change has no `splitPumpLiters`, so `pumpLiters` is `0`, `impliedSplitPumpPerLiter` returns `null`, and the patch is `{ splitPumpPriceOutlier: false }`. Old fills produce no flag rather than a false one — the right default for a control whose whole value is its signal-to-noise.

Re-running my §9.5 worked example: pump $10,000 / 50 L, `cashMeta.fuelVolume` = 50 → `splitPumpLiters` = 50 on both rows → implied `$200/L` = retail → no flag. Correct.

### 10.3 Fail-closed + blocked reason ✅

Also better than proposed. Instead of adding a guard inside the I/O function, the decision was extracted into a **pure function** in fuel-core:

```ts
classifySplitCashPeriodLanding({ orgId, driverId, fillWeekKey, originalFillDate, fillWeekSealed, openTargetWeek })
  → 'write_in_place' | 'rehome' | 'blocked_no_open_target'
```

`planSplitCashPeriodLanding` now calls it with `fillWeekSealed: true, openTargetWeek: null` when identity is incomplete — **before any seal I/O** — so the guardian's front door fails closed and does not even query. The classifier independently re-checks identity and returns `blockedReason: 'missing_identity'`.

Extracting the decision is what made §10.5's tests possible; it turned the branch I flagged into something assertable without a database.

The two blocked reasons carry distinct, actionable operator copy — each naming the fix rather than the symptom:

- `missing_identity` → *"Cannot post this cash — fill is missing driver or organization. Assign the driver, then re-import the statement."*
- `no_open_period` → *"No open week to post this cash — reopen or create a later fuel period."*

That resolves §9.8.2: a period-management problem no longer reads as a statement problem.

### 10.4 Re-home visible ✅

`describeSplitCashRehome` produces *"Moved from fill 2026-09-14 (week 2026-09-14)"*, rendered directly beneath the date cell in `FuelReimbursementTable` (three render sites: Pending, Awaiting-statement, and the row detail) and in `SplitCashResolveDialog`. Placing it under the date is right — that is the field that looks wrong, so the explanation sits where the confusion starts.

### 10.5 Sequence tests ✅

`fuelSplitCashRehome.sequence.test.ts` now has five cases covering every landing decision and asserting the *downstream* consequence, not just the classifier's return value:

- `write_in_place` — date stays, amount set, pending-ready
- `rehome` — `tx.date` moves, `originalFillDate` preserved, pending-ready
- `blocked_no_open_period` — amount stays `0`, awaiting stays `true`, reason stamped
- `blocked_missing_identity` — never `write_in_place`
- card-covered `$0` — never enters pending-ready

That composes the classifier, the resolve patch and the queue predicate, which is the interaction that would actually regress. It still does not drive `persistFuelMatchPair` against KV fixtures, so the server glue remains unproven by test — but the decision logic that glue depends on is now locked down.

### 10.6 Tests and typecheck

| Check | Result |
|---|---|
| Vitest — `fuel-core`, `roam-shared/fuel`, fuel logs | ✅ **195/195** across 27 files (was 186) |
| Deno `check` on `fuel_split_fill.ts` | ✅ **4 → 3 errors** — the `fuelVolume` error is gone; back to the pre-remediation baseline, all 3 pre-existing |
| Fleet `tsc` | 🔴 **502 → 505** — 2 are §10.1; the rest pre-existing |
| `fuelPaidByDriver.n1.test.ts` | ⚠️ unchanged pre-existing `VITE_SUPABASE_URL` load failure |

The Deno count returning to baseline is worth noting: the M4 refactor removed the type error it introduced last round, because reading `cashMeta.fuelVolume` off a typed local is checkable where `cashTx.metadata?.fuelVolume` was not.

### 10.7 Minor — mirror drift on the price band

~~The price-band control exists only in the server matcher~~ — **Closed:** `jaaFuelStatementMatcher.ts` now stamps `splitPumpPriceOutlier` from `splitPumpLiters` with the same no-stmt-liter rule; drift test in `fuelSplitPayment.test.ts` asserts both mirrors contain the M4 markers.

### 10.8 Verdict

The remediation holds up. Both fixes I proposed were implemented at the root rather than at the symptom — M4 by resolving liters once for both rows instead of duplicating a fallback, and the fail-closed guard by extracting a pure classifier instead of adding a conditional. In both cases the better structure is what made the behaviour testable, which is why §10.5 exists at all.

**Enable gate (closed):** §10.1 duplicate type removed; §10.7 matcher mirror aligned. **Ready for ops enable.**

*Both verified in the following round — see §11, which also isolates one type error that was sitting underneath §10.1.*

---

## 11. Enable-gate review (2026-09-19)

Both §10 items are closed, and the drift fix went further than asked. One type error remains — it is not the one I flagged last round, it was sitting underneath it.

| Item | Verified |
|---|---|
| §10.1 Duplicate type | ✅ §11.1 — single declaration, `TS2300` count now 0 |
| §10.7 Matcher mirror drift | ✅ §11.2 — band mirrored **and** a source drift test that pins both rules |
| — | 🟡 **§11.3 — `SplitCashTxPatch.status` too loose; `tsc` fails on the C2 handler** |

### 11.1 Duplicate type removed ✅

One declaration remains, at `fuelSplitCashLifecycle.ts:385`. The fleet `TS2300` count is **0**.

### 11.2 Mirror drift — closed, and better than proposed ✅

The shared matcher now carries the M4 band, and I checked that the two copies compute the same thing rather than merely both having one. They agree on every axis that matters:

| | Server (`fuel_jaa_match.ts`) | Shared (`jaaFuelStatementMatcher.ts`) |
|---|---|---|
| Liters source | `Number(drvMeta.splitPumpLiters) \|\| 0` | identical |
| Statement-liter fallback | none | none |
| Guard | `pumpLiters > 0` | `pumpLiters > 0` |
| Threshold | `0.18` | `0.18` |
| Rounding | `round(total ÷ liters × 100)/100` | identical |
| Missing retail | `{ splitPumpPriceOutlier: false }` | same |
| Keys emitted | 4 | same 4 |

The server delegates to `splitPumpPriceOutlierPatch` in fuel-core while the shared copy inlines it — unavoidable, since roam-shared cannot import fuel-core without a cycle. That is the same constraint the tolerance rule lives under.

**The drift test is the part worth calling out.** `fuelSplitPayment.test.ts` now reads both mirrors off disk and asserts the rules are present in each:

- the tolerance expression `Math.max(50, pumpTotal * 0.01)` in both — which closes the **L2** gap open since the first audit;
- `splitPumpLiters`, `splitPumpPriceOutlier`, and `Number(drvMeta.splitPumpLiters) || 0` in both;
- and a **negative** assertion — `expect(src).not.toMatch(/litersForBand/)` — pinning the exact defect from §9.5 so the statement-liters fallback cannot come back.

A source-text regex is not behavioural equivalence, and it cannot catch a divergence that keeps the same tokens. But it catches the regression that actually happened, it costs nothing, and it is the only option available under the import cycle. Pinning a fixed bug by name is the right instinct.

The shared copy also gained three behavioural tests of its own: the outlier fires on inflated `$/L`, does not fire when pump liters match the retail band, and skips entirely when `splitPumpLiters` is missing — the legacy fail-safe from §10.2.

### 11.3 ✅ Closed: `SplitCashTxPatch.status` narrowed

~~`SplitCashTxPatch` declares `status?: string`~~ — **Closed:** `status?: 'Pending' | 'Rejected'` in `fuelSplitCashLifecycle.ts`. Fleet `tsc` returns **502** (baseline). `FuelManagement` resolve handler typechecks without a cast.

### 11.4 Tests and typecheck

| Check | Result |
|---|---|
| Vitest — `fuel-core`, `roam-shared/fuel`, fuel logs | ✅ (see §12 for current counts) |
| Deno tests — gate, opt-in modules, odometer collapse | ✅ **13/13** |
| Deno `check` on `fuel_split_fill.ts` | ✅ **3 errors** — unchanged pre-existing baseline |
| Fleet `tsc` | ✅ **502** baseline restored after §11.3 |
| `fuelPaidByDriver.n1.test.ts` | ⚠️ unchanged pre-existing `VITE_SUPABASE_URL` load failure |

The Deno test command still reports the 3 pre-existing type errors and needs `--no-check` to execute; with it, all 13 pass. Those 3 live in `fuel_posted_guarantee.ts` and an untyped `kv` payload, none from this work.

### 11.5 Verdict

Both gate items are genuinely closed, and §10.7 was closed more thoroughly than asked — a mirror that agrees on every axis, plus a drift test that also retires the long-standing L2 gap.

**Enable gate (closed in §12):** §11.3 status narrow + `applySplitCashMatchToTx` glue tests + `pnpm verify:split-cash-enable`.

---

## 12. Enable hardening (2026-09-19)

### 12.1 §11.3 type gate ✅

`SplitCashTxPatch.status` is `'Pending' | 'Rejected'`. Fleet error count **502**. Money-spine `node scripts/typecheck-fuel-money.mjs fleet` → 0 money errors.

### 12.2 Server glue + harness ✅

`persistFuelMatchPair` now calls pure `applySplitCashMatchToTx` (fuel-core) for the cash-sibling branch. Tests in `fuelSplitCashMatchApply.test.ts` cover:

| Case | Assert |
|---|---|
| write_in_place | amount set, date unchanged, pending-ready |
| rehome | date moved, originalFillDate + rehome stamps, pending-ready |
| blocked no_open_period | amount 0, date unchanged, `amountMutated: false` |
| blocked missing_identity | never write_in_place |
| card_covered $0 | Rejected, not pending-ready |
| not reconciled | awaiting kept, no invented amount |

**Permanent gate:** `pnpm verify:split-cash-enable` (`scripts/verify-split-cash-enable.mjs`) runs fuel-core vitest, roam-shared fuel vitest, Deno 13, fleet `tsc` ≤ 502 with zero SplitCash filter hits, and fuel-money typecheck.

### 12.3 UX polish (walkthrough prep) ✅

`SplitCashResolveDialog` resets choice / amount / reason when a different row opens so operators cannot confirm a prior money decision against a new fill. Re-home / blocked / outlier / stale / busy states already present on Awaiting + Pending + dialog.

### 12.4 Operator walkthrough script (sign-off before pilot)

Run on localhost or staging Fuel Management after `pnpm verify:split-cash-enable`:

1. Happy path — open-week statement match → Pending cash → approve.
2. Re-home — sealed fill week → cash in open week with “Moved from fill …” under date.
3. Blocked — no open period → Awaiting shows period-management copy → reopen period → re-import.
4. Stale — ≥14d → banner + badge; Accept / Enter (≥8 chars) / Void (≥8 chars).
5. Price outlier — badge visible; accept still a conscious pay decision.
6. Card-covered full — $0 never in Pending.
7. Approve guard — awaiting cash toast-blocks approval.

**Acceptance:** every irreversible action names pay / enter / void; weird dates explained beside the date; blocked ≠ generic variance.

### 12.5 Ops enable runbook

1. Confirm `fuelSplitPayment` default-on in `packages/platform-settings/src/modules.ts` and `supabase/functions/_fleet-server/enterprise_modules.ts` (`OPT_IN_MODULE_KEYS` empty; product default `true`). Org can still set `false`.
2. Prefer **one pilot org** for 48–72h if any org had previously disabled the module; otherwise treat as global default-on with the same watch window.
3. Day-0: verify script green + §12.4 signed off + one Dominion CSV import on pilot.
4. Watch: awaiting count, stale (≥14d), `splitCashRehomeBlocked`, rehomes/import, `splitPumpPriceOutlier` rate (high → calibrate OCR/band, do not silence).
5. **Kill:** sealed-period amount mutation, `reconciled && awaiting` row, or acknowledge-style API returning → pause statement matching for pilot until fixed.
6. Mark this audit **Enabled (pilot)** / **Enabled (global)** with date + signer when watch clears.

### 12.6 Post-enable (queued, not blocking)

Nav already badges awaiting cash. **Do not** build a weekly stale digest unless the 48–72h watch shows stale > 0 for multiple days. Unrelated fleet `tsc` debt and FuelPeriod* test failures stay out of scope.

### 12.7 Verdict

Money-loss paths remain closed. The last type gate and the C1 write-boundary proof are in place. Enable is an ops decision gated by `pnpm verify:split-cash-enable` + §12.4 walkthrough + §12.5 watch — not more code.
