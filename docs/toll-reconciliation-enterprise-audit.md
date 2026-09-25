# Toll Reconciliation — Enterprise Readiness Audit

**Scope:** `apps/fleet` Toll Reconciliation (Business Finance → Week Reconciliation → **Tolls**)
**Date:** 2026-09-25
**Type:** Read-only audit. No code was modified.
**Reviewed as:** Principal Systems Architect + Lead UI/UX + Senior Engineering committee (one verdict, not three).

---

## 1. Executive summary

**Is this enterprise-grade today? No — but it is much closer than the code volume suggests, and the gap is narrow and specific.**

The *rules* in this section are genuinely good. Classification, week bucketing, shortfall scoring, refund allocation, netting and period-status logic live in `packages/toll-core` and `packages/finance-core`, are shared by client and edge, and are covered by ~82 test files. The close-side seal orchestration (`week_close.ts`) is mature: idempotency keys, a seal-attempt log, per-lane blocking on failure, drift detection against the sealed statement. That is real engineering and it should not be rewritten.

The problem is the **layer above the rules**: the orchestration, the write-path guards, and the contract between the wizard and the close.

Five things disqualify it from the bar you set ("when I close a week, it must do it to perfection, and it should feel self-serve"):

1. **"Finish" in the wizard and "closeable" in settlement are two different, independently-implemented definitions of done — and they demonstrably disagree.** A trip refund explicitly parked on *pending hold* is `informational` to the wizard (does not block Finish) and simultaneously increments `tollUnmatchedCount`, which `tollsClearFromGate` requires to be zero. The user completes every step, sees "Period fully reconciled", and the week sits at `payout_status = awaiting_tolls` forever with nothing in the toll UI explaining why. This is the single biggest defect in the section.
2. **No mutating toll route checks whether the period is frozen or sealed.** Zero hits for `assertPeriodEndedForReconciliation` / `isPeriodFrozen` in `toll_controller.tsx`. You can re-link, approve, reject or charge a toll in a week that is already sealed and signed. The drift is detected *at the next close*, not refused *at the write*.
3. **The authorization guard test that was written specifically to stop this cannot see the routes it is supposed to guard.** It scans two files that no longer hold these routes, and its path regex matches string literals while these routes are registered with template literals — so it passes vacuously. ~25 mutating toll routes currently have authentication but no `toll.manage` authorization, including `POST /reset-for-reconciliation`, the exact route the test's own docstring names as the reason it exists.
4. **The control that is supposed to prove the four money cards reconcile is a tautology.** `identityResidual` is computed as `Spend − Reimbursed − Charged − Net`, where `Net` is *defined* as `Spend − Reimbursed − Charged`. It is algebraically always 0 on the server, and hardcoded to `0` on the client. The card therefore states "Same as Business Finance P&L" unconditionally, including when the platform filter is on and the number shown is a subset.
5. **Reads mutate money.** `GET /unreconciled?autoMatch=1` writes ledger rows, syncs trip refunds and emits audit events; `GET /unclaimed-refunds` auto-resolves refunds when the automation flag is on. The client's paginating fetch passes `autoMatch` on *every page*, so the scan runs once per page.

None of these require a rewrite. They require a **period state machine that both the wizard and the close read from**, guards on the write path, and one honest reconciliation control. That is a 1–2 quarter program with a strong 1-week quick-win tranche, detailed in §9–§11.

---

## 2. Scope and assumptions

### In scope
| Layer | Files |
|---|---|
| Entry | `apps/fleet/src/components/fleet-financials/WeekReconciliationPage.tsx` (Fuel/Tolls hub) |
| Landing | `PeriodLandingPage.tsx`, `useTollReconciliationPeriods.ts` |
| Wizard | `ReconciliationWizard.tsx` (1,642 ln), `GatedReconciliationStepper.tsx`, `TollBucketPanel.tsx` (1,044 ln), `UnderpaidClaimsStep.tsx` (1,137 ln), `UnclaimedRefundsList.tsx`, `DisputeRefundsList.tsx`, `TollFinancialOverviewCards.tsx` |
| Data | `useTollReconciliation.ts` (728 ln) |
| Rules | `packages/toll-core/src/*`, `packages/finance-core/src/{periodTollTrip,tollLedgerIntegrity}.ts`, `apps/fleet/src/utils/toll*.ts` |
| API | `supabase/functions/_fleet-server/toll_controller.tsx` (10,195 ln, 66 routes), `toll_period_controller.tsx` (946 ln) |
| Close seam | `toll_week_seal.ts`, `week_close.ts`, `period_projector.ts`, `driver_financial_periods.ts` (toll projection only) |

### Explicitly out of scope
Fuel reconciliation, settlement/COD, Stop-to-Stop, Rush, the toll *plaza/rate* database, toll tags, the Rides geofence detector, and Business Finance P&L itself — except where the toll section's outputs cross into them.

### Context you left blank — what I assumed
You submitted the template with the Context block empty. These are **assumptions**, flagged so you can correct them:

- **A1.** Stack: React 18 + TypeScript + Vite + TanStack Query + Tailwind + shadcn/ui on the client; Deno/Hono edge functions on Supabase; Postgres plus a KV-prefix store (`toll_ledger:*`, `trip:*`, `claim:*`). *Verified from the code.*
- **A2.** Scale: low-hundreds of toll rows and trips per week per org; a handful of concurrent fleet-admin users. **Inferred from the caps** (`reconciledLimit`, `unclaimedRefundsLimit`, `AUTO_MATCH_SCAN_CAP = 3000`, 26-week lookback) and from the screenshot ($3,595 spend, 16 items). *Not verified.* If you are actually at thousands of rows/week, several Medium perf findings promote to High.
- **A3.** Cadence: one fleet manager runs this weekly, after the week ends, before Close Week.
- **A4.** No target SLOs were given. I have proposed some in §12; treat them as a starting proposal, not a measurement.
- **A5.** No constraints were given, so I assumed schema changes are permitted but expensive, and that the existing UI shell (period landing → 6-step wizard) should be preserved. **The proposed architecture in §11 preserves it.**

### Observed facts vs assumptions
Everything in §3–§8 marked with a file:line reference is an **observed fact** read out of the repository. Anything phrased "likely", "probably", or "would" is an **inference**. Runtime claims (latency, query plans, actual row counts) are inferences — I have no traces, logs, HAR files or `EXPLAIN` output. §13 lists exactly what to collect.

---

## 3. Functional walkthrough — what the section does today

### 3.1 Entry
`/week-reconciliation` renders `WeekReconciliationPage`, a two-tab hub (Fuel | Tolls) gated by `canView('toll-tags')`. The Tolls tab renders the period landing page.

### 3.2 Period landing
`useTollReconciliationPeriods` → `GET /toll-reconciliation/periods`. The server loads a **26-week lookback** of toll ledger rows, trips, claims and dispute refunds, buckets everything into Monday–Sunday fleet-timezone weeks, and returns per-week:

- `counts` — `{actionable, informational}` for each of the 6 steps
- `financials` — `tollSpend`, `reimbursedByPlatform`, `chargedToDrivers`, `netTollLoss`, plus diagnostic `events*` variants
- `status` — `outstanding | in_progress | reconciled`, derived purely from `actionableTotal`

Weeks render as cards: *"N to review"* / *"N in progress"* / *"Completed"* / *"Opens after week ends"*. Fleet-wide totals render in the same four-card component the wizard uses.

### 3.3 The wizard
Selecting a week mounts `ReconciliationWizard` scoped to `{startDate, endDate}`. `useTollReconciliation` fires **nine parallel requests** on mount:

`fetchFleetTimezone` · `/unreconciled` (paginated) · `/reconciled` · `/unclaimed-refunds` · trips in range (paginated, ±2 days) · `/dispute-refunds` · `/refund-suggestions` · `/resolved-refunds` · `/unlinked-shortfall-suggestions`

Date params are padded ±1 day for UTC-midnight edges, then re-trimmed client-side by fleet calendar day.

### 3.4 The six hard-gated steps
`STEP_ORDER = needs-review → personal-use → deadhead → unlinked-refunds → dispute-refunds → underpaid-claims`

`computeGatedStepStates` locks every step after the first one with `actionable > 0`. There is no stored progress — the gate is recomputed from live counts each render, so a background rematch can re-lock a completed step and snap the user backwards (guarded by `holdStepRef` during an in-flight action).

| Step | What the manager does |
|---|---|
| Needs Review | Link a toll to its trip, or resolve manually (Personal / Write-off / Business). "Link all ready N" bulk-links high-confidence pairs. |
| Personal Use | Charge the driver, or have the fleet absorb it. "Auto-charge personal N" for orphan-no-trip rows. |
| Deadhead | Acknowledge as fleet cost, or charge the driver case-by-case. |
| Unlinked Refunds | Trips with `tollCharges > 0` and no linked toll. Resolve as `cash_wash \| phantom \| expense_logged`, or **Apply** the credit to an underpaid shortfall. |
| Dispute Refunds | Match imported Uber Support Adjustments to tolls/claims; cascades to the trip when `disputeRefundTripSyncEnabled` is on. |
| Underpaid & Claims | Whatever is still short after platform credits: file a claim, charge the driver, or write off. Also hosts the History/audit panel. |

### 3.5 Money cards
Four cards computed **client-side** on every render: Toll Spend (+ platform split), Reimbursed, Charged to Drivers, Net Toll Loss. The identity asserted is `Spend − Reimbursed − Charged = Net`.

### 3.6 Finish
`handleFinish` checks that all-platform actionable is 0, invalidates two query keys, toasts *"Period {label} fully reconciled"*, and calls `onExit()`.

**It writes nothing.** There is no toll-period record, no seal, no state transition, no audit event. "Completed" on the landing page is a re-derivation of `actionableTotal === 0` from a fresh aggregate query.

### 3.7 The actual close (separate page)
`CloseWeekPage` → `week_close.ts` → `ensureCloseLaneStatements` seals the toll lane via `sealTollWeek`, which reads `driver_financial_periods` for the anchor week and publishes an immutable `week_statements` row per driver. Close blocks if the seal fails. Separately, `period_projector.derivePeriodStatus` uses `tollsClearFromGate` to decide whether the driver's money unlocks.

**The toll wizard and the close share no state.** They share only the underlying ledger, re-counted three different ways.

---

## 4. Architecture findings

### 4.1 Three counting engines, one question

"Is this week's toll work done?" is answered independently in three places:

| # | Engine | Where | Consumer |
|---|---|---|---|
| 1 | `computeStepCounts` over client-fetched buckets | `ReconciliationWizard.tsx:803` | The gate, Finish |
| 2 | `increment*Count` over a server-side single pass | `toll_period_controller.tsx:437-476` | Landing card status |
| 3 | `tollUnmatchedCount` / `tollWorkflowActionable` | `driver_financial_periods.ts:844-935` | `tollsClearFromGate` → close |

Engines 1 and 2 now share the same classifier functions from `packages/toll-core/src/tollPeriodCounts.ts` (good — that was fixed in R-11). But they **feed it different input sets**: the landing skips trip-linked rows entirely (`incrementLandingUnclaimedTollCount` line 1: `if (tx.tripId) return;`), while the wizard classifies from `/unreconciled` minus claimed. Same classifier, different corpus, no cross-check.

Engine 3 shares nothing. It uses a flat `isHandledToll(tx)` boolean and `isTripTollActionable(trip, linkedTripIds)` — a completely different rule set with no actionable/informational distinction at all.

> **This is the root cause of TR-C1.** Everything else in §5–§7 is downstream of it.

### 4.2 The wizard has no persistent state

There is no `toll_period` row. State is inferred every time from the ledger. Consequences:

- Finish is unfalsifiable — nothing records that a human reviewed the week.
- No "who closed this week, when, on what data" record.
- Reopening is indistinguishable from never having closed.
- The re-lock behaviour (§3.4) is a direct symptom: with no stored progress, late data silently rewinds the user.

### 4.3 Reads that write

| Route | Write performed | Guard |
|---|---|---|
| `GET /unreconciled?autoMatch=1` | `updateTollLedgerEntry` + `syncTripRefundOnTollLink` + `writeTollLedgerEntry` per perfect match | authn only |
| `GET /unclaimed-refunds` | `applyRefundResolution` per auto-classified candidate when `refundAutomationEnabled` | authn only |

`fetchAllUnreconciled` passes `autoMatch` into **every page request** (`useTollReconciliation.ts:117-136`), so a 3-page fetch runs the ≤3000-row auto-match scan three times, each preceded by a fresh `loadTollLedgerWithTrips`.

### 4.4 Non-atomic multi-store writes

`POST /reconcile` (`toll_controller.tsx:6027`) performs five sequential writes across two stores with no transaction and no compensation:

```
updateTollLedgerEntry() → recomputeAndPersistWorkflowStage()
  → safeSyncPlazaTollPnlOffset() → syncTripRefundOnTollLink() → writeTollLedgerEntry()
```

If step 3 throws, the toll is already `reconciled` with no P&L offset and no audit row; the client gets a 500 and the UI's optimistic state has already moved the row. The auto-match path is worse — its whole body is wrapped in `catch (err) { console.log(...) }`, so partial writes are swallowed entirely.

The wizard does implement compensation for the *two-call* case (`chargeDriverForPersonalUse` unreconciles on claim failure, `handleChargeDriverForDeadhead` likewise) — good instinct, but it is client-side saga logic that dies with the tab.

### 4.5 Idempotency

Present where it matters most (`buildSealIdempotencyKey`, `beginSealAttempt` / `completeSealAttempt` in the close path; `POST /reconcile` 409s on already-reconciled). Absent everywhere else: no `Idempotency-Key` on `/approve`, `/reject`, `/resolve`, `/bulk-reconcile`, `/apply-to-claim`, `/personal-use/auto-charge`. A retried bulk charge can create duplicate claims.

### 4.6 Concurrency

No optimistic concurrency control anywhere in the section. No `If-Match`/version on toll rows. Two admins on the same week, or one admin in two tabs, will both execute the mount-time auto-repair effects (§4.7) against the same rows. `tollReconBusyLock` serialises actions **within one tab only**.

### 4.7 Write-on-render

Two `useEffect` hooks mutate financial state on mount, without user consent:

- `ReconciliationWizard.tsx:740-781` — loops `await reconcile(row.transaction, row.trip)` over every "fully covered pending underpaid" row.
- `ReconciliationWizard.tsx:878-911` — calls `repairUnlinkedApplySplits` for the driver scope.

Opening a page to *look* at it changes the books. In an audited financial workflow this is not acceptable regardless of how safe each individual write is.

### 4.8 Module size

`toll_controller.tsx` is **10,195 lines and 66 routes** — reconciliation, ledger CRUD, eight backfills, quarantine reports, exports, automation settings, the rides bridge and settlement allocations in one file. Every deploy of any toll feature redeploys all of it. Cold-start and review surface both scale with the whole file.

### 4.9 Failure modes observed

| Mode | Behaviour today |
|---|---|
| `/dispute-refunds` fails | Caught → `[]`. Dispute step silently shows zero. Week can "complete" with dispute work invisible. |
| `/refund-suggestions` fails | Caught → `{}`. Rows lose their Apply affordance and become informational → gate opens incorrectly. |
| `/unlinked-shortfall-suggestions` fails | Caught → `{}`. Same as above. |
| Any of the four non-caught calls fails | `catch` logs to console. `loading` clears. **The wizard renders as if the week were empty.** |
| Auto-match partial write | Swallowed. |
| Seal fails at close | Correctly blocks close with `CLOSE_BLOCKED`. ✅ |

The last row is the good pattern. It should be the pattern everywhere.

---

## 5. Performance findings

> All runtime numbers below are **inferences from code shape**, not measurements. §13 says what to collect to confirm.

### 5.1 Network
- **9 parallel requests** per wizard open, of which **five** (`/unreconciled`, `/reconciled`, `/unclaimed-refunds`, `/refund-suggestions`, `/unlinked-shortfall-suggestions`) each independently call `loadTollLedgerWithTrips(from, to)`. The same week's ledger+trips is loaded from Postgres five times per page open. There is no request-scoped or cross-request cache.
- Two of the nine (`/unreconciled`, trips) are paginating loops, so real request count is higher.
- `useTollReconciliationPeriods` sets **no `staleTime`** → TanStack Query default `0` → the 26-week aggregate refetches on every mount and window refocus.

### 5.2 API / compute
- `GET /unreconciled` runs `await resolveTollExpectedCost(tx)` **sequentially, per row** for the whole page, and again per row across the ≤3000-row auto-match scan.
- `GET /unclaimed-refunds` does `await import("./toll_rate_schedule.ts")` **inside the per-candidate loop** — module resolution repeated per iteration — plus `nearestPlazaMetersForTrip` per trip.
- `findTollMatchesServer(tx, trips, …)` is O(tolls × trips) per request. `toll_match_index.ts` exists and is used for *loading* by date range, not for *matching*.
- `GET /periods` fans out `sumActiveTollChargedToDriverMajor` per week via `Promise.all` over up to 26 weeks — 26 concurrent queries on one request.

### 5.3 Client rendering
- The money block (`ReconciliationWizard.tsx:954-1054`) is **in the render body, not memoized**. On every render it: iterates `filteredUnreconciledTolls`; builds `buildTripRefundAllocation` over all reconciled tolls; runs `buildTollFinancialsContext` + `calculateTollFinancials` per reconciled toll; and runs `periodClaims.find()` inside that loop → **O(reconciled × claims)**.
- Several of those results are **never used**: `claimableAmount`, `unreconciledPersonal` (used only via `totalDriverLiability`), `totalDriverLiability`, `refundsAmount`, `totalRecovered`, `reconciledLiability`, `recoveredAmount`. Dead work on every keystroke-triggered render.
- No virtualization on any list. `TollBucketPanel`, `UnclaimedRefundsList`, `DisputeRefundsList` and the History panel all render every row.
- `actionBusy` applies `select-none` to the whole subtree and disables every control — a 25-item bulk charge (sequential `await` per item, `handleBulkChargePersonal:486`) freezes the entire wizard with no per-row progress and no cancel.

### 5.4 Mutation amplification
After most actions the wizard runs `Promise.all([refresh(), refreshClaims()])` **and** `invalidateSharedPeriods()`, which invalidates two query keys **and** fires `rebuildDriverFinancialPeriods` sequentially per affected driver, then `processDriverFinancialOutbox(50)`. `unreconcile()` additionally calls `fetchData()` internally, so the caller's `refresh()` is a second full 9-request fetch (the `fetchGen` guard prevents the stale write, not the network cost).

---

## 6. UX findings

### 6.1 The self-serve promise breaks at the finish line
The wizard is genuinely well-designed for the *middle* of the job: hard gating, an explicit order that matches the settlement logic (platform credits before driver charges), per-step empty states, confidence scores, inline reasons, a busy lock. That part reads as a product, not a tool.

It breaks at both ends:
- **Finish does nothing.** "Period fully reconciled" is a toast over a no-op. Nothing tells the user what happens next, that Close Week exists, or that the week is not actually closed.
- **Nothing surfaces the close blocker.** When `tollUnmatchedCount > 0` the user has no way to see it, let alone fix it, from this screen. They discover it on a different page, phrased as `awaiting_tolls`, with no link back.

### 6.2 The "waiting" affordance is unreachable
`GatedReconciliationStepper.tsx:109`:

```tsx
{step.informational > 0 && step.actionable === 0 && !step.complete && ( …gray clock… )}
```

But line 31 defines `complete = actionable === 0`. So `actionable === 0 ⟹ complete ⟹ !complete === false`. **The gray clock badge can never render.** The legend printed directly beneath it — *"Gray clock = waiting on driver or Uber"* — is therefore always false. Consistent with your screenshot: no clock badges anywhere.

This is the *only* signal that informational work exists, which is exactly the work that later blocks the close.

### 6.3 Money-card copy overstates certainty
- "Same as Business Finance P&L" renders whenever `identityResidual` is 0, which (§7.2) is always.
- The platform filter (`All | Uber | InDrive | Roam | Unlinked`) recomputes `tollSpend`, `reimbursedByUber` and `chargedToDrivers`, so **Net Toll Loss changes with the filter** while the card still claims parity with P&L. A user filtering to "Uber" sees a different Net and the same reassurance.
- The rose "⚠ Alert" chip on the Net card is unconditional markup, not state-driven. It shows at $550 and would show at $0.

### 6.4 Match-quality labelling
`SuggestedMatchCard.tsx:318` prints **"Exact time"** when `timeDifferenceMinutes === 0`. Your screenshot shows "Exact time" on a toll at 9:37 AM matched to a trip at 9:04 AM. The server is almost certainly reporting distance-to-*window* rather than distance-to-*timestamp*, which is correct behaviour with a misleading label. On a screen whose job is to earn trust in automated matches, "Exact time" next to two visibly different times costs more than it gains. *(Inference — I did not read the server's `timeDifferenceMinutes` derivation.)*

### 6.5 Duplicate and competing CTAs
"Link all ready 7" sits in the page header; "Link all 7" sits inside the Suggestions panel; both call `lockedAutoMatch`. Two buttons, same action, different labels, ~700px apart.

### 6.6 Error and empty states
- Per-step empty states are good.
- There is **no error state**. A failed fetch renders an empty, apparently-clean week. For a financial workflow, "I couldn't load your data" and "you have no work" must never look identical.
- Truncation surfaces as an amber banner but the cards below it still render confident totals computed from the truncated set.

### 6.7 Destructive actions
`Reset Period` is styled red, opens a dialog requiring a typed confirmation label, supports dry-run, and is rate-limited server-side. This is the strongest UX pattern in the section — it should be the template for `Auto-charge personal` (which today runs a dry-run and then immediately applies it, with no human between the two).

### 6.8 `window.confirm` on a money path
`confirmChargeSyncOrAbort` (`ReconciliationWizard.tsx:235`) uses a native `window.confirm` — unstyled, unbranded, untestable, and it **fails open**: `catch { return true; }`. If the settings fetch errors, charges post with no confirmation and no wallet sync.

### 6.9 Accessibility
- Stepper: correct `disabled`/`aria-disabled`, but no `aria-current="step"` and no `role="tablist"` semantics; the horizontal scroll container has no keyboard affordance.
- Platform filter: five plain `<button>`s with no `role="radiogroup"`/`aria-pressed`; selection is conveyed by colour alone.
- Tooltip triggers correctly use 44×44 targets. Good.
- Amber-on-white badge text at `text-[10px]` and slate-500 at `text-[11px]` are likely below AA contrast at that size. *Not measured.*
- Loading state is `role="status"` + `aria-live` on the landing page but **not** in the wizard (`Loader2` + plain text).

---

## 7. Correctness findings — the close path

### 7.1 The deadlock (TR-C1) — full trace

For a trip with `tollCharges > 0`, not linked to any toll, and `tollRefundResolution.status === 'pending'`:

```ts
// packages/toll-core/src/unlinkedShortfallEligibility.ts
export function isUnlinkedRefundActionableNow(trip, opts) {
  if (opts?.hasRecommendedShortfall) return true;
  if (opts?.suggestionStatus && opts.suggestionStatus !== 'pending') return true;
  return !isPendingOnlyRefundResolution(trip);   // status === 'pending' → false
}
```
→ `incrementUnlinkedRefundCount` → `counts['unlinked-refunds'].informational++`
→ `computeGatedStepStates`: `complete = actionable === 0` → **true**
→ `handleFinish` passes → *"Period fully reconciled"*

Meanwhile:

```ts
// packages/finance-core/src/periodTollTrip.ts
export function isTripTollActionable(trip, linkedTripIds) {
  …
  return !status || status === 'pending';        // → true
}
```
→ `driver_financial_periods.ts:931` → `tollUnmatchedCount++`, `tollWorkflowActionable++`
→ `period_projector.ts:30`:

```ts
export function tollsClearFromGate(tolls) {
  return (tollStatus === 'reconciled' || tollStatus === 'n/a')
    && Number(tolls.tollWorkflowActionable || 0) === 0
    && Number(tolls.tollUnmatchedCount || 0) === 0;   // → false
}
```
→ `moneyUnlocked = false` → `payoutStatus = 'awaiting_tolls'` → `periodStatus = 'open'`.

**Result: the week is declared reconciled by the UI and permanently un-closeable by the engine, with no shared surface where the contradiction is visible.** The only exit today is `forceRelease`.

### 7.2 The identity control cannot fire (TR-C4)

Server, `toll_period_controller.tsx:576-579`:
```ts
const netTollLoss    = round2(tollSpend - reimbursedByPlatformNet - chargedToDrivers);
const identityResidual = round2(tollSpend - reimbursedByPlatformNet - chargedToDrivers - netTollLoss);
```
Substituting: `identityResidual ≡ 0`, always, by construction.

Client, `ReconciliationWizard.tsx:1054-1055`:
```ts
const netTollLoss = Math.round((tollSpend - reimbursedByUber - chargedToDrivers) * 100) / 100;
const identityResidual = 0;
```

`TollFinancialOverviewCards` has a complete, well-written non-reconciling branch (*"Cards off by $X — not yet reconciled"*). **It is dead code.** The control designed to catch card drift is incapable of detecting it.

The materials for a real check already exist and are already returned by the server but never compared: `eventsTollSpend`, `eventsReimbursedByPlatform`, `eventsNetTollLoss` (from `computeTollWeekNetting` over `financial_events`). The residual should be `cards.netTollLoss − events.netTollLoss`, i.e. **projection vs. independent event netting**, not an algebraic restatement.

### 7.3 Two Toll Spend formulas (TR-H1)

| | Trip-side contribution to Toll Spend |
|---|---|
| **Wizard** | `collectTripOnlyTollSpend({ tolls, unclaimedRefunds, resolvedRefunds })` — trip toll charges with no matching ledger row |
| **`/periods`** | `if (!linkedTripIds.has(t.id) && status === 'cash_wash') acc.financials.tollSpend += tc` — cash-wash only (`toll_period_controller.tsx:501`) |

Different rules → the same week's Toll Spend can differ between the landing card and the wizard card. In your screenshot the split shows **`Unlinked $275.00`**, which is exactly a trip-only contribution; unless that trip is resolved `cash_wash`, the landing card for that week is showing a different number than the wizard.

### 7.4 No period-freeze guard on any toll mutation (TR-C2)

```
$ grep -n "assertPeriodEndedForReconciliation\|isPeriodFrozen\|periodFrozen" toll_controller.tsx
(no output)
```

`toll_period_controller.tsx` correctly calls `assertPeriodEndedForReconciliation(weekKey)` before sealing. `toll_controller.tsx` — which owns `/reconcile`, `/unreconcile`, `/approve`, `/reject`, `/resolve`, `/edit`, `/bulk-reconcile`, `/personal-use/auto-charge`, `/unlinked-refunds/apply-to-claim` — checks nothing.

A toll edited after its week is sealed changes the live ledger while `week_statements` keeps the sealed figure. `tollPeriodDisagreesWithSeal` will notice **at the next close**, converting a refusable write into a forensic investigation. Invariant-based design says: make the illegal state unrepresentable at the write, not detectable at the close.

> This is the same class of finding as the `stop-to-stop-audit` "no period-lock check" item. It is a systemic gap, not a toll-specific one.

### 7.5 Authorization guard test is vacuous (TR-C3)

`toll_route_auth.test.ts` asserts every mutating toll route carries `requirePermission('toll.manage')`. Two independent reasons it cannot see these routes:

1. **Wrong files.** It reads only `make_server_legacy_boot.tsx` and `register_residual_monolith_routes.tsx`. The reconciliation routes live in `toll_controller.tsx` and `toll_period_controller.tsx`.
2. **Wrong matcher.** `PATH_RE = /"(\/make-server-37f42386\/[^"]*)"/` requires a double-quoted string literal. These routes register as `` app.post(`${BASE}/approve`, …) `` — a template literal. Even if the files were added to the scan, **zero routes would match and the test would still pass**.

Routes currently registered with `requireAuth` only (no `toll.manage`), in `toll_controller.tsx`:

`POST /reset-for-reconciliation` · `POST /approve` · `POST /reject` · `POST /resolve` · `PATCH /edit` · `PUT /automation-settings` · `POST /personal-use/auto-charge` · `POST /unlinked-refunds/apply-to-claim` · `POST /unlinked-refunds/undo-apply` · `POST /unlinked-refunds/repair-split` · `POST /resolve-refund` · `POST /resolve-refund/bulk` · `POST /repair-dispute-partial-claims` · `POST /bridge-rides` · `POST /toll-ledger/:id/plaza` · `POST /toll-ledger/repair-dates` · `POST /toll-ledger/backfill` · `POST /toll-ledger/plaza-backfill` · `POST /toll-ledger/tag-backfill` · `POST /match-index/backfill` · `POST /toll-pnl-offset-backfill/backfill` · `POST /toll-pnl-offset-backfill/repair-orphans` · `POST /workflow-stage/backfill` · `POST /personal-rematch/backfill` · `POST /rematch-candidates/:id/dismiss` · `POST /backfill-linked-trip-resolutions` *(has `data.backfill`)*

The test's own docstring reads: *"`POST /toll-reconciliation/reset-for-reconciliation` (a destructive reset) … shipped completely open … This test is what stops that from coming back."* It did not.

### 7.6 Dead cross-week recovery (TR-H2)

`useTollReconciliation.ts:244-245` declares:
```ts
/** Unscoped reconciled tolls — used to recover same-week rows the date filter drops. */
const [allReconciledTolls, setAllReconciledTolls] = useState<FinancialTransaction[]>([]);
```
Lines 343-344:
```ts
setReconciledTolls(reconciled);
setAllReconciledTolls(reconciled);   // ← same scoped, same trimmed array
```

`allReconciledTolls` is never fetched unscoped. Every consumer that reads it as a fallback — `mergeReconciledTollsForUnderpaid`, `underpaidPipeline`, `tollLookup`, `historyAudit.allReconciledTolls` — is working from the identical trimmed set. The fallback is structurally dead, and the rows it was written to recover (week-key members that the ±1-day fleet-day trim drops) are still dropped.

### 7.7 Seal skips drivers with no period row (TR-H9)

`sealTollWeek` (`toll_week_seal.ts:196-205`) iterates `driver_financial_periods` filtered by `organization_id` + `period_anchor`. A driver with toll activity in that week but **no** `driver_financial_periods` row is never iterated: no statement, no `published` increment, no warning. `ensureCloseLaneStatements` then checks statements only for drivers that *do* have period rows — so the absence is invisible to the close gate too.

*(Inference: whether this can occur depends on whether period-row creation is guaranteed for any driver with toll activity. §13 has the query to confirm.)*

### 7.8 No actor attribution (TR-H5)

`updateTollLedgerEntry(id, patch, event, actor)` receives the string literal `"admin"` at lines 4110, 6065, 6160, 6334, 6417, 6709, 6784, 6992; `"system"`/`"system-auto"` elsewhere. `matchedBy: "admin"` at 6099; `resolvedBy: auto ? "system-auto" : "admin"` at 7703. `rbacUser` is read 11 times in the file — **only to build rate-limit keys**.

The toll audit ledger therefore records *that* a toll was reconciled but never *by whom*. Every manual action in a money workflow is attributed to the same anonymous string.

### 7.9 Stale architecture comment

`toll_period_controller.tsx:19-28` states the Deno runtime cannot import client utils and that the rules are *"mirrored locally below"*. The file now imports `tollPeriodCounts`, `tollPeriodBucket`, `tollFleetLossNetting`, `tollWeekNetting` and `tollLedgerIntegrity` directly from `packages/`. The stated obstacle no longer exists. This matters because the comment actively discourages the correct fix (§11 Phase 1) for the one rule still not shared: `tollUnmatchedCount`.

---

## 8. Findings table

Sorted by severity, then by ID. Effort: **S** ≤1 day · **M** 2–5 days · **L** 1–3 weeks · **XL** >3 weeks.

| ID | Sev | Category | Evidence | Impact | Recommendation | Effort |
|---|---|---|---|---|---|---|
| TR-C1 | **Critical** | Correctness / Close | `unlinkedShortfallEligibility.ts:isUnlinkedRefundActionableNow` vs `periodTollTrip.ts:isTripTollActionable`; `period_projector.ts:30-37` | Wizard says "fully reconciled"; week is permanently `awaiting_tolls`. Requires `forceRelease` to escape. | Single `computeTollPeriodReadiness(orgId, weekKey)` on the server; wizard gate, landing status and `tollsClearFromGate` all consume it. Ship a parity test asserting the three counts agree on the same week. | L |
| TR-C2 | **Critical** | Correctness / Integrity | `grep assertPeriodEndedForReconciliation toll_controller.tsx` → 0 hits | Post-seal mutation silently diverges the live ledger from `week_statements`; caught only at next close. | Add a `assertTollPeriodWritable(weekKey)` guard to every mutating toll route; return `409 PERIOD_SEALED` with the reopen path in the body. | M |
| TR-C3 | **Critical** | Security / AuthZ | `toll_route_auth.test.ts:33-59` scans wrong files; `PATH_RE` requires a string literal vs template literals | ~25 mutating routes have authn but no `toll.manage`. Guard test passes vacuously. Includes `/reset-for-reconciliation`. | Fix the test first (scan `toll_controller.tsx` + `toll_period_controller.tsx`; match `` `${BASE}/… `` ), watch it fail, then add the missing guards. | M |
| TR-C4 | **Critical** | Correctness / Controls | `toll_period_controller.tsx:576-579`; `ReconciliationWizard.tsx:1055` | The only card-reconciliation control is algebraically always 0. Cards claim P&L parity unconditionally. | Redefine residual as `cards.netTollLoss − events.netTollLoss` (both already computed and returned). Surface it and block Finish above tolerance. | S |
| TR-C5 | **Critical** | Architecture / Safety | `toll_controller.tsx:1859-1975`, `:2228-2250`; `useTollReconciliation.ts:117-136` | GETs write money; run once per pagination page; retries/prefetch duplicate work. | Move auto-match to `POST /auto-match` with an `Idempotency-Key`, called once. Move automation to a scheduled job. Make GETs pure. | M |
| TR-H1 | High | Correctness | `tollFinancialOverview.ts:128-149` vs `toll_period_controller.tsx:490-511` | Landing and wizard can show different Toll Spend for the same week. | Move the spend formula into `toll-core`; both callers import it. Golden-fixture parity test. | M |
| TR-H2 | High | Correctness | `useTollReconciliation.ts:244, 343-344` | Documented cross-week recovery fallback is dead; rows dropped by the fleet-day trim stay dropped. | Either fetch `allReconciledTolls` unscoped (by week key) or delete the field and its four consumers' fallback branches. Do not leave it half-wired. | M |
| TR-H3 | High | Architecture | `ReconciliationWizard.tsx:740-781`, `:878-911` | Page load mutates the books; concurrent tabs/admins race. | Convert both to explicit, previewed actions ("N rows can be auto-cleared — review"). Never write on mount. | M |
| TR-H4 | High | Reliability | `toll_controller.tsx:6027-6100`; auto-match `catch` at `:1957` | Partial writes leave `reconciled` rows with no P&L offset / no audit row; failures swallowed. | Wrap the write set in a server-side transaction or an outbox with compensation. Never swallow a write error. | L |
| TR-H5 | High | Audit / Compliance | `toll_controller.tsx:6065, 6099, 6160, 6334, 6417, 6709, 6784, 6992, 7683, 7703` | No per-action actor in a money audit trail. | Thread `rbacUser.userId` through `updateTollLedgerEntry` / `writeTollLedgerEntry`. Add a lint rule banning literal actor strings. | M |
| TR-H6 | High | UX / Correctness | `GatedReconciliationStepper.tsx:31, 109` | Gray-clock badge is unreachable; the printed legend is always false; the one signal for close-blocking informational work is invisible. | Change the condition to `step.informational > 0 && step.actionable === 0`. Render it alongside the green check. | S |
| TR-H7 | High | UX / Money | `ReconciliationWizard.tsx:235-253` | `window.confirm` on a charge path, and `catch { return true }` fails open. | Replace with the existing `Dialog`. On settings-fetch failure, **block** and surface the error. | S |
| TR-H8 | High | UX / Trust | `TollFinancialOverviewCards.tsx:205-222`; filter at `ReconciliationWizard.tsx:1024-1054` | Filtered Net still claims "Same as Business Finance P&L". | When `platformFilter !== 'all'`, label the card "Filtered view — not the P&L figure" and drop the parity claim. | S |
| TR-H9 | High | Correctness / Close | `toll_week_seal.ts:196-205`; `week_close.ts:826-888` | Driver with toll activity but no period row → no statement, silently, and the close gate can't see the gap. | Seal from the union of period rows and drivers with week toll activity; emit `TOLL_SEAL_DRIVER_MISSING` when they differ. | M |
| TR-H10 | High | Test coverage | 1 test file in `reconciliation/` (14k+ lines of components); 728-line hook untested | The money-mutating orchestration is the untested layer; the pure rules are well covered. | Integration tests for: Finish→readiness parity, rollback on charge failure, error-state rendering, gate re-lock. | L |
| TR-M1 | Med | Performance | `useTollReconciliation.ts:283-323` | 9 requests/open, 5 of them re-loading the same ledger; no cache; double-fetch on `unreconcile`. | Move the hook to TanStack Query with per-resource keys; add a request-scoped ledger cache server-side; remove the internal `fetchData()` from `unreconcile`. | L |
| TR-M2 | Med | Performance | `ReconciliationWizard.tsx:954-1054` | O(reconciled × claims) recomputed every render; ~7 computed values unused. | `useMemo` the block; delete the dead values. | S |
| TR-M3 | Med | Performance | `toll_controller.tsx:1874` (`await` in loop), `:2233` (`await import` in loop), `ReconciliationWizard.tsx:489`, `:174` | Serial I/O where concurrency is safe. | Hoist the dynamic import; batch `resolveTollExpectedCost`; bounded-concurrency bulk ops. | M |
| TR-M4 | Med | Performance | `useTollReconciliationPeriods.ts:68-78` | 26-week aggregate refetched on every mount/refocus. | `staleTime: 60_000`, `refetchOnWindowFocus: false`. | S |
| TR-M5 | Med | Correctness / UX | `TOLL_RECON_CAPS`, `tollReconTruncationMessage` | Truncated week still renders confident totals. | When truncated, suppress the money cards and block Finish. | S |
| TR-M6 | Med | UX | `SuggestedMatchCard.tsx:318` | "Exact time" on visibly different timestamps erodes trust in the matcher. | Label it "Within trip window" when the diff is window-relative; show the actual delta. | S |
| TR-M7 | Med | UX | Header vs Suggestions panel | Two CTAs, same action, different labels. | Keep the in-context one; drop the header duplicate. | S |
| TR-M8 | Med | Maintainability | `toll_period_controller.tsx:19-28` | Comment claims mirrors that no longer exist and discourages the correct fix. | Rewrite the header to describe the `toll-core` import model. | S |
| TR-M9 | Med | UX / Close | `PeriodLandingPage.tsx:97-100` | "Completed" is `actionableTotal === 0`, not sealed. No seal state, no route to Close Week. | Add a seal chip (`Reviewed` / `Sealed` / `Closed`) from `week_statements`, and a "Close this week" link. | M |
| TR-M10 | Med | Maintainability | `isReconWeekSealed` = "week has not ended yet" | Collides with `sealTollWeek` / `week_statements` "sealed". | Rename to `isReconWeekNotYetOpen`. | S |
| TR-M11 | Med | UX | `tollReconBusyLock`, `handleBulkChargePersonal:486` | Whole-wizard freeze on sequential bulk ops; no progress, no cancel. | Per-row status + `N of M` progress + abort. | M |
| TR-M12 | Med | Reliability | `useTollReconciliation.ts:299-322` vs `:390-393` | Three fetches fail soft to empty (gate opens wrongly); four fail hard to a blank-but-clean week. | One policy: any load failure → error state, gate closed, Finish disabled. | M |
| TR-L1 | Low | a11y | Stepper + platform filter | No `aria-current="step"`; filter has no radiogroup semantics; selection is colour-only. | Add roles/state. | S |
| TR-L2 | Low | UX | `TollFinancialOverviewCards.tsx` Net card | "⚠ Alert" chip is unconditional markup. | Render only above a threshold. | S |
| TR-L3 | Low | UX | `ReconciliationWizard.tsx:112-117` | DEV-only test harness uses `alert()`. | Route to console/devtools panel. | S |
| TR-L4 | Low | Architecture | `toll_controller.tsx` = 10,195 ln / 66 routes | Every toll deploy ships everything; large review + cold-start surface. | Split: `recon`, `ledger`, `backfills`, `exports`, `automation`. | L |

**Accepted, not a finding:** backend `unclaimed*` vs UI "Unlinked Refunds" is a deliberate compatibility split (see `toll-naming-convention` memory). Leave it. It is worth one line in the code comment so the next reviewer doesn't re-flag it.

---

## 9. Quick wins (1–3 days)

Ordered so each is independently shippable. All are S-effort and none touch the data model.

1. **TR-H6 — unreachable gray clock.** One-line condition change. Restores the only visual signal for the work that later blocks the close. *Do this first; it makes TR-C1 visible to users while you build the real fix.*
2. **TR-C4 — make the identity control real.** Compare `cards.netTollLoss` to the already-returned `eventsNetTollLoss`; pass the difference as `identityResidual`. The "cards don't reconcile" UI already exists and starts working immediately.
3. **TR-H7 — replace `window.confirm`, stop failing open.** Use the existing `Dialog`; on settings-fetch error, block instead of proceeding.
4. **TR-H8 — stop claiming P&L parity under a filter.** Conditional label when `platformFilter !== 'all'`.
5. **TR-M2 — memoize the money block, delete ~7 unused computations.** Pure win; measurably cuts wizard INP.
6. **TR-M4 — `staleTime` on the periods query.** One line; removes a 26-week aggregate from every refocus.
7. **TR-M5 — truncation blocks Finish and hides the cards.** Prevents signing off on a partial week.
8. **TR-M6 / TR-M7 / TR-L2 — labelling honesty pass.** "Within trip window"; drop the duplicate CTA; make the Alert chip conditional.

**Deliberately not in the quick-win list:** TR-C3 (fix the test first, then expect a non-trivial permission cleanup) and TR-C2 (needs the period-state concept from Phase 1).

---

## 10. Strategic improvements (1–2 quarters)

### Q1 — Make the close honest
- **One readiness engine** (TR-C1). Server-computed `TollPeriodReadiness`; three consumers, one definition.
- **Write-path period guards** (TR-C2). `409 PERIOD_SEALED` everywhere, with a documented reopen path.
- **AuthZ closure** (TR-C3). Repair the guard test so it can fail; then close every route it reports.
- **Pure reads** (TR-C5). Auto-match becomes an explicit idempotent command; automation becomes a scheduled job.
- **Actor attribution** (TR-H5) + a lint rule so it cannot regress.

### Q2 — Make it feel self-serve and stay fast
- **Persist the toll period** (§11). A real state machine with a real Finish.
- **Close the loop with Close Week** (TR-M9): seal chip on the landing, deep link both directions, and *"this week is blocked on N toll items — fix them here"* on the close page.
- **Data-layer rewrite of `useTollReconciliation`** (TR-M1) onto TanStack Query with per-resource keys and targeted invalidation.
- **Server-side request-scoped ledger cache** so one page open loads the week once, not five times.
- **Integration test suite** for the orchestration layer (TR-H10).
- **Split `toll_controller.tsx`** (TR-L4).

---

## 11. Proposed architecture change

I am **not** recommending a rewrite. The rules layer (`toll-core`, `finance-core`) is the right design and is already shared. The change is additive: give the section the two things it is missing — **a persisted period state** and **a single readiness contract**.

### 11.1 The one new concept: `toll_period`

```
toll_period(organization_id, week_key, driver_scope)
  state          : open | in_review | ready | sealed | reopened
  readiness_hash : hash of the inputs readiness was computed from
  reviewed_by    : user id
  reviewed_at    : timestamptz
  finish_note    : text
  blockers       : jsonb   -- last computed, for display
```

This is the record that does not exist today. It is what makes Finish falsifiable, makes "who signed off" answerable, and makes "is this week writable" a lookup instead of an inference.

### 11.2 The one new contract: `TollPeriodReadiness`

```
GET /toll-reconciliation/periods/:weekKey/readiness
→ {
    weekKey, computedAt, readinessHash,
    steps:    { [stepId]: { actionable, informational } },
    blockers: [ { code, count, amountMajor, drillPath } ],
    identity: { cardsNetLoss, eventsNetLoss, residual, withinTolerance },
    seal:     { state, publishedDrivers, missingDrivers }
  }
```

Computed **once, server-side**, from `toll-core`. Consumed by:

| Consumer | Replaces |
|---|---|
| Wizard gate + Finish | client `computeStepCounts` |
| Landing card status | the `/periods` per-week recount |
| `tollsClearFromGate` | `tollUnmatchedCount` / `tollWorkflowActionable` |
| Close Week preview | its own toll lane probe |

`blockers[]` is the key UX unlock: the close page's `awaiting_tolls` becomes a list of named, counted, **clickable** items that deep-link back into the exact wizard step.

### 11.3 Commands, not RPC-shaped mutations

Every mutating toll route becomes a command with a uniform envelope:

```
POST /toll-reconciliation/commands/:name
Idempotency-Key: <uuid>
→ guard: assertTollPeriodWritable(weekKey)   // 409 PERIOD_SEALED
→ guard: requirePermission('toll.manage')
→ effect: single transaction OR outbox entry with compensation
→ audit: { actorId, commandName, idempotencyKey, before, after }
```

This one envelope closes TR-C2, TR-C3, TR-H4 and TR-H5 simultaneously, because they are four symptoms of the same missing abstraction.

### 11.4 Trade-offs

| | For | Against |
|---|---|---|
| **Persisted period** | Falsifiable Finish; real audit; cheap writability check; reopen is explicit | New table + migration; a second state that can drift from the ledger — mitigated by `readiness_hash` (recompute and compare on read; stale ⇒ recompute, never trust blindly) |
| **Server-computed readiness** | One definition, permanently; wizard gets simpler; close gets a real blocker list | One more endpoint on wizard open — pays for itself by replacing client recounting; needs caching or it becomes the slowest call |
| **Command envelope** | Uniform guards/audit/idempotency; one place to enforce policy | Touches ~25 routes; mechanical but wide; must ship behind a flag with old routes proxying to new |
| **Do nothing structural, patch symptoms** | Fastest | TR-C1 recurs the moment a seventh step or a new resolution status is added — the divergence is structural, not a bug |

### 11.5 Migration path (no big bang)

1. **Introduce readiness read-only.** New endpoint. Wizard keeps its own counting but logs `client_counts vs server_readiness` mismatches. **Run for two weeks and read the log** — this both proves TR-C1 in production and sizes it.
2. **Flip consumers one at a time**, behind `tollReadinessServerAuthoritative`: landing → wizard gate → `tollsClearFromGate`. Each flip is independently revertible.
3. **Add `toll_period`, write-only.** Finish starts writing `in_review`/`ready`; nothing reads it yet.
4. **Turn on the writability guard** in shadow mode (log what *would* have been refused), then enforce.
5. **Migrate routes to the command envelope** in tranches, highest-risk first (`/approve`, `/reject`, `/resolve`, `/apply-to-claim`). Old paths proxy to new until the last consumer moves.
6. **Delete the third counting engine** (`tollUnmatchedCount` derivation) once `tollsClearFromGate` reads readiness. This is the step that permanently closes TR-C1.

Follows the same shape as the fuel work in `fuel-service-line-split` and `fuel-split-statement-derived`: flag-gated, parity-logged before flip, controls armed in the same commit as the behaviour change.

---

## 12. Instrumentation and validation plan

### 12.1 Prove each fix

| Finding | Proof it worked |
|---|---|
| TR-C1 | Parity job over the last 26 weeks: `|wizard.actionable − readiness.actionable| = 0` **and** `readiness.blockers = ∅ ⟺ tollsClearFromGate = true`. Alert on any non-zero. Zero weeks in `awaiting_tolls` with a "Completed" landing card. |
| TR-C2 | Integration test: seal a week, attempt each mutating route, assert `409 PERIOD_SEALED`. Counter `toll.write_refused_sealed` — expect >0 within a week (proves it fires), then trending to 0 (proves users stopped trying). |
| TR-C3 | `toll_route_auth.test.ts` fails on a deliberately unguarded new route **before** the guards land. Then a route-inventory snapshot test that must be updated to add any route. |
| TR-C4 | Backfill `residual = cardsNet − eventsNet` over 26 weeks; publish the distribution. Any week with `|residual| > $0.01` is a real, previously invisible discrepancy — investigate before suppressing. |
| TR-C5 | Assert zero ledger writes on `GET` in an integration test. Log `auto_match.invocations` per page-open — expect exactly 1, not N. |
| TR-H1 | Golden-fixture test: same week fixture → landing `tollSpend` === wizard `tollSpend`. |
| TR-H2 | Test with a toll whose fleet-day falls outside the ±1-day pad but inside the week key; assert it appears in `underpaidReconciledTolls`. |
| TR-H5 | Query: `count(*) from toll audit where actor in ('admin','system')` for rows created after the fix = 0. |
| TR-H6 | Snapshot test on a step with `actionable = 0, informational > 0` → clock badge present. |
| TR-H9 | Nightly: `drivers_with_week_toll_activity − drivers_with_toll_week_statement` = ∅. |

### 12.2 Metrics to add (none exist today for this section)

- `toll_recon.wizard_open.duration_ms` (p50/p95/p99) — split client vs server
- `toll_recon.endpoint.duration_ms{route}` — the five ledger-loading routes especially
- `toll_recon.ledger_loads_per_page_open` — target 1, currently ~5
- `toll_recon.finish` / `toll_recon.finish_to_close_lag_hours`
- `toll_recon.weeks_awaiting_tolls` — **the TR-C1 canary; this is the number that should go to zero**
- `toll_recon.identity_residual_abs` (p95)
- `toll_recon.command.{name}.{outcome}` with `PERIOD_SEALED` / `PERMISSION_DENIED` broken out
- Client: INP on the wizard, time-to-interactive after step switch

### 12.3 Proposed SLOs (starting proposal — you did not specify)

| Metric | Target |
|---|---|
| Period landing TTI | p95 < 1.5 s |
| Wizard open (all 9 calls settled) | p95 < 2.5 s |
| Step switch INP | p95 < 200 ms |
| Single reconcile/approve/reject round trip | p95 < 600 ms |
| Bulk link, 50 rows | p95 < 8 s, with visible progress |
| `/periods` (26-week aggregate) | p95 < 2 s |
| Weeks reconciled-but-not-closeable | **0** |
| `\|identity residual\|` per week | **≤ $0.01** |

### 12.4 Validation gates before any behaviour flip
- `tsc` clean against the current baseline (per `fuel-split-statement-derived`: vitest strips types — gate on `tsc`, not tests alone).
- The parity log from migration step 1 shows zero mismatches for two consecutive weeks.
- E2E `pnpm test:e2e:toll` extended to cover: Finish → readiness → seal → close, and a sealed-week write refusal.
- Controls armed in the **same commit** as the behaviour change (the `fuel-service-line-split` lesson: a parity test that isn't in `ci.yml` is not a control).

---

## 13. Open questions and what to collect next

### Blocking — I need these to size TR-C1 and confirm TR-H9

1. **How many weeks are affected right now?**
```sql
-- Weeks the wizard would call "Completed" but the engine will not close
select period_anchor,
       count(*) filter (where toll_unmatched_count > 0)   as unmatched_drivers,
       sum(toll_unmatched_count)                          as unmatched_total,
       count(*) filter (where payout_status = 'awaiting_tolls') as awaiting
from driver_financial_periods
where organization_id = :org
  and period_anchor >= (current_date - interval '26 weeks')
group by 1 order by 1 desc;
```
   Cross-reference against `GET /toll-reconciliation/periods` → any week with `status = 'reconciled'` and `unmatched_total > 0` is a live instance.

2. **How many pending-hold trips are driving it?**
```sql
select count(*), sum(toll_charges)
from trips
where toll_charges > 0
  and toll_refund_resolution->>'status' = 'pending'
  and dropoff_time >= (current_date - interval '26 weeks');
```

3. **Does TR-H9 actually occur?** Drivers with toll ledger activity in a week but no `driver_financial_periods` row for that anchor.

4. **Does TR-H1 show up live?** For 3–4 recent weeks, capture the landing card `tollSpend` and the wizard card `tollSpend` side by side. Your screenshot's `Unlinked $275.00` is the likely tell.

### Needed to grade the performance findings honestly
5. **A HAR of one wizard open** on a real week — I want request count, waterfall and payload sizes. My §5 numbers are inferred from code shape only.
6. **Supabase edge function logs** for `/unreconciled`, `/reconciled`, `/unclaimed-refunds`, `/periods` — p50/p95/p99 and any 546/timeout rate.
7. **Real row counts per week**: toll ledger rows, trips, claims, dispute refunds. This determines whether A2 holds and whether TR-M1/M3 are Medium or High.
8. **Whether any week has ever hit a truncation cap** (`reconciledLimit`, `unclaimedRefundsLimit`, `MAX_FETCH_PAGES`).

### Product/policy questions only you can answer
9. **Should Finish seal the toll week, or only mark it reviewed?** My recommendation: **reviewed**. Sealing at close (as today) is correct — one instant, all lanes, one `as_of`. Finish should record *"a human reviewed this and found nothing outstanding"* and nothing more.
10. **Is a pending-hold unlinked refund allowed to block the close?** This is the actual policy question under TR-C1. Three defensible answers: (a) yes, block — then the wizard must show it as actionable; (b) no — then `isTripTollActionable` must exclude it; (c) block only above an amount threshold. **You have to pick one.** The bug is that the codebase currently picks (b) in the UI and (a) in the engine.
11. **Who is allowed to run `/reset-for-reconciliation` and the backfills?** Needed before I can say what the correct permission is in TR-C3, rather than just that one is missing.
12. **Is the `disputeRefundTripSyncEnabled` flag on in production?** It changes whether Dispute Refunds cascades into the trip's Unlinked status, which changes the counts TR-C1 depends on.
13. **Target concurrency** — is more than one person ever in this screen at once? If yes, TR-H3 and §4.6 move up a severity band.

---

## Prioritized implementation order

Follow top to bottom. Each block is shippable and independently valuable.

**Block 0 — Measure (½ day, do before anything).**
Run queries 1–4 from §13. If query 1 returns rows, TR-C1 is live and everything below is correctly ordered. If it returns nothing, demote TR-C1 to High and promote Block 3 ahead of Block 2.

**Block 1 — Honesty pass (2–3 days, no structural risk).**
TR-H6 (clock badge) → TR-C4 (real identity residual) → TR-H7 (`confirm` + fail-open) → TR-H8 (filtered P&L claim) → TR-M5 (truncation blocks Finish) → TR-M6, TR-M7, TR-L2 (labels).
*After this block, the UI stops asserting things it cannot know — which is a prerequisite for trusting anything else you measure.*

**Block 2 — Close the security gap (3–5 days).**
Fix `toll_route_auth.test.ts` so it can fail (TR-C3) → watch it fail → add `requirePermission('toll.manage')` to every route it names → answer §13 Q11 for the backfills → add the route-inventory snapshot test.

**Block 3 — Performance (2–3 days).**
TR-M2 (memoize + delete dead compute) → TR-M4 (`staleTime`) → TR-M3 (hoist the in-loop dynamic import; batch `resolveTollExpectedCost`) → remove the double-fetch in `unreconcile`.
*Cheap, visible, and it makes the Block 4 parity log fast enough to run on every open.*

**Block 4 — Readiness contract, shadow mode (1–2 weeks).**
Build `GET /periods/:weekKey/readiness` from `toll-core`. Wizard keeps its own counting and logs mismatches. **Run two weeks. Read the log.** This is the load-bearing step — it converts TR-C1 from an argument into a number.

**Block 5 — Flip the consumers (1–2 weeks, flagged).**
Landing → wizard gate → `tollsClearFromGate`, one at a time, each revertible. Delete the third counting engine at the end. **TR-C1 closes here.**

**Block 6 — Write-path guards (1 week).**
`toll_period` table → writability guard in shadow mode → enforce → `409 PERIOD_SEALED` surfaced in the UI with a reopen path. **TR-C2 closes here.**

**Block 7 — Command envelope (2–3 weeks, tranched).**
Idempotency key + actor + transaction/outbox + audit, highest-risk routes first. **TR-H4 and TR-H5 close here.**

**Block 8 — Self-serve finish (1–2 weeks).**
Real Finish writing `toll_period`. Seal chip and deep links on the landing (TR-M9). Blocker list on the close page linking back into the exact step. Explicit, previewed replacements for the two write-on-mount effects (TR-H3). Bulk-op progress + cancel (TR-M11). Unified error-state policy (TR-M12).

**Block 9 — Durability (ongoing).**
Orchestration integration tests (TR-H10) → split `toll_controller.tsx` (TR-L4) → a11y pass (TR-L1) → naming cleanups (TR-M8, TR-M10).

---

### One closing note

The instinct that produced `packages/toll-core`, the mirror-parity golden tests, the seal-attempt log and the `PeriodResetDialog` confirmation flow is the right instinct, and it is already in this codebase. Every Critical in this audit is a place where that instinct was applied to the *rules* but not to the *seams between systems* — the wizard/close seam, the read/write seam, the test/route seam. Fix the seams and this section is enterprise-grade without rewriting the part you got right.
