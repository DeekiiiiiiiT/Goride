# Consumption Reconciliation — Full Architecture & UX Audit

**Date:** 2026-08-17
**Scope:** The "Consumption Reconciliation" section of Fleet (`apps/fleet`) — the screen that compares actual gas card charges against estimated operating costs across Ride Share / Company Ops / Deadhead / Personal / Misc (Leakage) buckets, plus its Finalize workflow, Business Finance sync, and supporting UI.
**Method:** Read-only code audit (no code changes made). Two parallel deep-dives were performed — one across the frontend/UX layer, one across the calculation engine and backend/finalize pipeline — then cross-referenced and merged below.

---

## 0. Executive Summary

The calculation engine itself is honest, internally consistent, and well-tested at the *pure function* level. The problems are concentrated in three places:

1. **Two competing Finalize code paths compute different numbers for the same week.** The bulk "Finalize weeks" flow silently omits Personal Allowance and skips every safety check the single-week Finalize enforces. This is a real financial-correctness bug, not a cosmetic one.
2. **The money-moving layer (wallet transactions / Finalize orchestration) has no idempotency, no transactionality, and no automated tests**, despite the ledger layer beneath it being properly versioned and idempotent. A failure mid-batch-finalize can leave drivers charged with no record that they were charged.
3. **Roughly half of the built "Consumption Reconciliation" UI is dead code.** A materially better-designed period-card + guided-wizard flow (matching the actual design mockups) exists in the codebase but is never routed to. What's actually shown to users — a single dense scrolling table — has no corresponding design artifact at all.

None of this is visible from the UI in normal use; it surfaces only under concurrency, partial failure, missing odometer data, or when comparing the two Finalize entry points side by side.

---

## 1. Architecture Overview: What's Actually Shipped vs. What Was Built

**What renders on screen** (matches the audited screenshot): `pages/FuelManagement.tsx` → `activeTab === 'reconciliation'` → `components/fuel/ReconciliationTable.tsx` (a single flat, horizontally-scrolling table for one selected week) + `components/fuel/FinalizedReportsTab.tsx` for history. Title/subtitle ("Consumption Reconciliation" / "Compare actual gas card charges against estimated operating costs") is set directly in `FuelManagement.tsx`.

**What was designed and built, but is orphaned (never imported by any route or page):**
- `components/fuel/reconciliation/FuelPeriodLandingPage.tsx` — Outstanding/Completed period cards with per-step status chips.
- `components/fuel/reconciliation/FuelPeriodWizard.tsx` — a 6-step guided flow (Data quality → Disputes → Policy check → Leakage → Settlement → Finalize).
- `components/fuel/reconciliation/FuelPeriodStepper.tsx` — the stepper UI for the wizard.
- `components/fuel/reconciliation/FuelPeriodResetDialog.tsx` — a period-level reset dialog with a different (arguably better) confirm UX than what's shipped.

This is confirmed dead via repo-wide reference search, and `FuelPeriodWizard.tsx` even self-documents it:

```tsx
/**
 * Period wizard shell — NOT the production recon entry point.
 * Production uses ReconciliationTable in FuelManagement. Keep attribution helpers
 * identical so this cannot invent a second belonging path if wired later.
 */
```

The four design mockups in `apps/fleet/design/stitch-fuel-recon/` (`consumption-reconciliation-landing`, `finalize-v2`, `fuel-week-wizard-data-quality`, `reset-period-modal`) all describe **this orphaned flow**, not the shipped table. There is no design artifact anywhere for the table/tooltip UI that users actually see. The design README also claims wiring lives in `components/fuel/reconciliation/` without noting it's disconnected — misleading for future contributors.

**Why this matters beyond tidiness:** the orphaned wizard mounts an entire *hidden, invisible copy* of `ReconciliationTable` (`className="hidden"`) purely to reuse its calculation side-effects, and wraps itself in its own busy-lock provider nested inside the app's outer one — a real double-fetch / broken-mutex hazard if anyone "finishes" wiring the wizard in without first refactoring. Reviving this code is not a matter of just adding a route.

---

## 2. Critical Findings — Correctness & Data Integrity

### 2.1 Bulk Finalize silently omits Personal Allowance (High — financial correctness)

- **Single-week Finalize** (`ReconciliationTable.tsx`): builds a full `personalAllowance` context object and passes it as the 12th argument to `FuelCalculationService.generateDriverFleetReport(...)`.
- **Bulk Finalize** (`utils/buildFuelWeekReportsForFinalize.ts`, used by `FuelBulkFinalizeDialog.tsx`): calls the *same* function but never constructs or passes that 12th argument.
- Inside `fuelCalculationService.ts`, all Personal Allowance logic is gated behind `if (personalAllowance) { ... }` — when the argument is `undefined`, the whole block is skipped, regardless of whether the fleet has Personal Allowance enabled.

**Consequence:** finalizing a given week via the single-week button vs. the "Finalize weeks" bulk button can post two different Personal-cost / driver-deduction numbers to the ledger for the identical week, purely depending on which button the admin clicked.

### 2.2 Bulk Finalize bypasses all safety gating that single-week Finalize enforces (High — correctness/safety)

The single-week path computes `dataQualityWarnings` (unhealthy status, pending logs, open disputes, exception-tier entries) and `reFinalizeWarnings` (delta vs. a prior posted snapshot), **hard-blocks** on exception blockers, and requires an explicit acknowledgment checkbox for soft warnings.

`FuelBulkFinalizeDialog.tsx` has none of this — its only check is `if (!reports.length)` to skip an empty week. The sole safeguard is a typed `FINALIZE {n} WEEKS` confirm phrase, which confirms *intent to bulk-act*, not *awareness of data-quality issues*. A vehicle flagged Red for a data-health issue can be silently finalized through the bulk path.

### 2.3 No idempotency or transactionality on the money-moving layer (High — data integrity)

The canonical ledger layer (`fuel_pnl_offset.ts`, `fuel_financial_reset.ts`) is well-built: versioned markers, idempotency checks, `roundCentsEqual` reconciliation before reposting. The **driver-facing wallet/deduction layer is not**:

- `fuelFinalizeService.ts` loops over every report in a batch; `settlementService.commitWeeklyStatement(...)` (the call that posts real driver wallet-credit / payout-deduction transactions and flips entries to `Verified`) is **awaited with no try/catch**.
- Snapshots are only accumulated in memory and saved **once, after the entire loop completes** (`api.saveFinalizedReports(snapshots)`).
- If `commitWeeklyStatement` throws partway through a bulk batch (network blip, missing active scenario, vehicle not found), reports processed before the failure already have real money transactions posted and entries flipped to `Verified` — but **no snapshot is ever saved for any report in the batch**, including the successful ones. The week then shows as still "outstanding" in the UI, and the Business Finance P&L offset (which only fires from inside the snapshot-save handler) never runs — **fuel double-counts as fleet loss even though the driver was already charged.**
- Retrying doesn't cleanly fix this: already-`Verified` entries are correctly skipped on retry (no duplicate transaction), but a snapshot is still pushed for that driver with an undercounted `successCount`, masking that the original commit happened out-of-band.
- `commitWeeklyStatement`'s `FinancialTransaction` writes use `crypto.randomUUID()` with **no idempotency key and no pre-check for an existing transaction** for the same entry/report pair — two concurrent Finalize calls hitting the same `Pending` entries (a real race window across the GET→compute→POST round trip) could double-post wallet transactions.
- There is **no test file for `fuelFinalizeService.ts`** anywhere in the repo covering any of this.

### 2.4 No distributed lock on Finalize (High — concurrency)

`FleetBusyProvider`/`useFleetBusy` is an in-memory `useRef` flag scoped to a single browser tab. It does nothing across two tabs, two admin sessions, or two devices. `POST /finalized-reports` does an unconditional KV overwrite with no version/etag compare — last write wins if two concurrent Finalize calls target the same driver-week.

### 2.5 Server never validates the client's arithmetic (Medium-High — trust boundary)

Server-side Finalize (`fuel_controller.tsx`, `fuel_financial_reset.ts`) takes the client-computed `report.driverShare` / `report.companyShare` / `report.gasCardSpend` as ground truth and posts them directly to the canonical ledger and driver deductions — it never recomputes or validates the category split server-side. A buggy (or compromised) client can push arbitrary numbers into real financial records.

### 2.6 Bulk-finalize response can look successful when it partially failed (Medium)

`saveFinalizedReports` (`fuel_controller.tsx`) catches per-report failures individually, deletes the KV entry for the failed one, but still returns `success: true` with a `failures` array as long as at least one report saved. A caller not inspecting `failures` treats a partial failure as a full success.

---

## 3. Calculation Engine — Deep Dive

**Core formula** (`fuelCalculationService.ts`, `calculateReconciliation()`), per bucket:

```
bucketCost = (bucketDistance / observedEfficiency) * actualPricePerLiter
miscellaneousCost = totalGasCardCost - (rideShare + companyOps + deadhead + personal)
```

Misc/Leakage is **defined as the algebraic plug** — `Total Spend === sum(5 buckets)` holds by construction, not by a runtime invariant check. There is no assertion anywhere that re-verifies this identity after Personal Allowance is layered on top (see below), and it *can* silently break in one traced edge case.

### 3.1 Missing odometer data is invisibly relabeled as "leakage" (Medium — data quality masking)

With fewer than 2 odometer anchors (a single fill, or fills with no odometer reading), `calculateOdometerBuckets` returns no buckets. Deadhead and Personal both collapse toward zero, Ride Share still computes from GPS trip data, and the *entire* mismatch between estimated and actual spend lands in Misc/Leakage. A genuine "we have no odometer data for this vehicle" data-quality problem is indistinguishable, from the UI, from real unexplained spend — both just show up as a Misc number. The leakage-gap step does gate on `misc > 0.009`, so it isn't silent, but the root cause isn't surfaced.

### 3.2 The Misc invariant can break in the multi-vehicle merge path (Medium — correctness edge case)

For a single vehicle, `earnedCost + overageCost === personalUsageCost` holds exactly because both are derived from the same efficiency/price inputs. In the multi-vehicle merge path (`generateDriverFleetReport`), the efficiency/price used for the allowance split are *back-solved* specifically to preserve that identity — but only when `merged.personalUsageCost > 0`. If it's `<= 0` while `personalDistance > 0` (a real possible rounding/attribution case), the code falls back to a hardcoded default efficiency (`|| 10`) without back-solving, silently breaking the "Total Spend = sum of buckets" invariant for that driver-week. Untested.

### 3.3 Duplicated formula, two independent implementations (Medium — drift risk)

`getBlendedDriverShareRatio` exists **twice**: once in `fuelCalculationService.ts` (frontend) and again as `blendedDriverShareRatio` in `fuel_pnl_offset.ts` (backend). The backend copy's comment explicitly acknowledges it mirrors the frontend formula — the team is trusting a comment, not a shared import, to keep two independent implementations in sync. Any future rounding/floor tweak in one and not the other silently desyncs driver deductions from the Business Finance P&L offset.

### 3.4 Undocumented policy: Fixed_Amount pools Ride Share and Misc together (Low-Medium — documentation gap)

Under the `Fixed_Amount` coverage mode (`fuelCoverageSplit.ts`), Company Ops and Deadhead are always 100% company, Personal is always 100% driver, but **Ride Share and Misc share a single pooled dollar allowance**, pro-rated if exceeded. This means a driver's Misc/Leakage dollars literally compete with their Ride Share dollars for the same pool — a real, non-obvious product rule that isn't mentioned anywhere in `fuel-business-finance-wiring.md`'s "locked product rules," and isn't discoverable from the UI labels.

### 3.5 Week-boundary computation is timezone-optional (Low-Medium)

`fuelWeekBucketForDate()` takes an *optional* timezone; when omitted it uses the browser's local `Date`, not the fleet's operating timezone. The codebase already has a dedicated migration fixing a prior Jamaica-timezone bug in this exact domain — a caller that forgets to pass timezone (e.g. an admin viewing from outside Jamaica) can compute a different week-anchor than the fleet's canonical week near a boundary. Stored comparisons mostly normalize to calendar-date strings and sidestep this, but live/current-week boundary logic doesn't.

### 3.6 Three different "is this dollar amount meaningfully nonzero" epsilons (Low — inconsistency)

`0.009` (`fuelPeriodStatus.ts`, ~4 places), `0.01` (`settlementService.ts`), and `1e-9` (`fuel_pnl_offset.ts`) are all used for conceptually the same guard in different files, none as a named shared constant.

### 3.7 Hardcoded fallbacks and thresholds without named constants

`observedEfficiency` falls back to `10` km/L, `actualPricePerLiter` falls back to `1.50`, gap-anomaly thresholds (`10%`, `30%`, `5%` tank overflow) are inlined at multiple call sites (the 1.05 tank-overflow multiplier appears twice, independently), and a `10km` unaccounted-distance threshold for deduction recommendations is a bare magic number. None of these are wrong, but none are named or centrally documented either, which makes them easy to drift apart or forget to update together.

### 3.8 Documented rules vs. code — mostly faithful, with one real gap

The five "locked product rules" in `fuel-business-finance-wiring.md` are accurately implemented, with one exception worth flagging: the doc states offsets are "always on, no settings toggle," but `fuel_pnl_offset.ts` still carries `isFuelPnlOffsetEnabled()` / `getFuelReconciliationSettings()` / `updateFuelReconciliationSettings()` as hardcoded-`true` no-ops kept for older clients — and `api.ts` still exposes get/update endpoints for it. If any UI still surfaces this as a toggle, it's a dead control that visually implies functionality it no longer has.

---

## 4. UI / UX Findings

### 4.1 Terminology drift for the same concept, across 3+ places (Medium)

The "unexplained residual spend" concept is called **"Net Leakage"** in the design mockup, **"Net unassigned"** in the (dead) `FuelPeriodLandingPage`, and **"Misc"** / **"Misc (Leakage)"** in the shipped table — three names for one number, none reconciled.

Similarly, the single action of undoing a finalized week is called **"Delete finalized weeks"** (dialog title), **"Reopen"** (dialog description and success toast), and **"Delete {n} weeks"** (confirm button) — all within one component (`FuelBulkResetDialog.tsx`) and its caller. Four verbs for one destructive, irreversible action is a real risk for a "type to confirm" flow where clarity is the whole point of the friction.

### 4.2 Three separate, differently-designed "undo a finalized week" flows (Medium — redundancy)

1. Per-row trash icon in `FinalizedReportsTab.tsx` → simple confirm dialog, single driver/vehicle.
2. "Delete weeks" button → `FuelBulkResetDialog` → typed generic confirm phrase, multi-week.
3. `FuelPeriodResetDialog.tsx` (dead code, reachable only via the orphaned wizard) → typed exact period label confirm, single period.

Three different confirmation UX patterns for the same category of irreversible action, and one of them isn't even reachable in production.

### 4.3 Color-only leakage indicator (a11y)

`getLeakageColor()` returns text-color classes only (red/amber/emerald/slate) for the Misc/Leakage cell with no accompanying icon or text differentiator. Since the underlying value can legitimately be positive or negative, a color-blind user has no non-color way to tell "high leakage" from "savings" from "neutral" in that column — notably inconsistent with the Data Health column and `BucketReconciliationView`'s GAP/Flagged badges elsewhere in the same feature, which correctly pair color with text/icons.

### 4.4 Loading and empty states are conflated (Low-Medium)

`ReconciliationTable` has no `loading` prop; if `vehicles`/`trips`/`logs` haven't arrived yet on first paint, it renders the same "No vehicles found" message as a genuinely empty week. A fleet manager opening the page fresh will briefly see a false "no data" message.

### 4.5 Two Finalize entry points visible simultaneously, different verbs (Low-Medium)

The single-week "Finalize" button and the "Finalize weeks" bulk button are both visible on the same screen at once, with materially different behavior (§2.1–2.2) that isn't hinted at by the UI. Separately, the single-week button says "Finalize" but its confirmation dialog's primary action reads "Process Ledger Entries" — the word "Finalize" doesn't reappear until the success toast.

### 4.6 Field-name drift papered over in the UI instead of normalized once (Low)

`FinalizedReportsTab.tsx` reads `r.companyUsageCost ?? r.companyOpsCost`, `r.personalUsageCost ?? r.personalCost`, `r.miscellaneousCost ?? r.miscCost` in multiple places — evidence that the API has used at least two field-naming conventions over time, with the fallback logic living in UI code rather than being normalized once at the schema/service boundary.

### 4.7 "Standard Fleet Rule" tab label is opaque jargon

Inside the reconciliation tab, the inner sub-tabs are labeled "Standard Fleet Rule" vs. "Finalized" — "Standard Fleet Rule" doesn't communicate "this week's live/draft view" to a new user, and doesn't match the "Outstanding/Completed" language used everywhere else in the same feature's design intent (mockups, dead landing page).

### 4.8 Minor: stray dead markup, encoding artifacts, no-op console logs

- `FuelLayout.tsx` keeps an empty `<div>` alive solely to hold an explanatory comment about consolidated functionality — could just be deleted.
- `FuelManagement.tsx` has mojibake (`â€”`) in a couple of `console.log` strings — harmless at runtime, but a sign of an unclean copy/paste at some point.
- Several `/* Phase N: ... */` breadcrumb comments referencing now-dead settlement paths are scattered through `FuelManagement.tsx` handlers and could be consolidated or removed now that the migration they describe is long complete.

---

## 5. Redundancy & Duplication

| Redundancy | Where | Note |
|---|---|---|
| `FuelBulkFinalizeDialog` / `FuelBulkResetDialog` are ~85% structurally identical | both files in full | Same selection-set state, cap constant, confirm-phrase gate, sequential executor, results screen — strong candidate for one shared `BulkWeekActionDialog` primitive. |
| Coverage matrix rendered twice | `FuelCoverageMatrix.tsx` (reusable) vs. inline reimplementation in `FuelPeriodWizard.tsx` | Two renderers for one concept; only relevant if the wizard is ever revived, but currently just dead duplication. |
| Blended driver-share ratio computed twice, independently | `fuelCalculationService.ts` vs `fuel_pnl_offset.ts` | See §3.3 — real drift risk, not just style duplication. |
| Deadhead/attribution methodology explained independently in two places | `ReconciliationTable` tooltip vs. `DeadheadAnalysisPanel`'s "How KM Attribution Works" banner | Different wording for the same explanation, maintained separately — will drift. |
| Trips fetched up to 3 times for the same vehicle/period | `FuelManagement.tsx` (week-level), `ReconciliationTable`'s brain-classification effect, `BucketReconciliationView`'s own anchor-range fetch | No shared cache/dedup layer; each layer justifies its own fetch independently. |
| Sequential vs. parallel implementations of the same fuel-brain classification loop | `ReconciliationTable.tsx` (sequential `for`/`await`) vs. `buildFuelWeekReportsForFinalize.ts` (uses `mapPool` concurrency) | Same work, two different performance characteristics depending on which screen triggers it. |

---

## 6. Performance / Optimization Opportunities

- **No pagination or virtualization anywhere in the reconciliation stack.** `ReconciliationTable` renders every driver/vehicle row (each with 4+ tooltip triggers) into a plain `overflow-x-auto` scroll container — no `react-window`/virtualization anywhere in `components/fuel/`. `FinalizedReportsTab` and `DeadheadAnalysisPanel`'s per-vehicle table have the same gap (though `FinalizedReportsTab`'s collapsed-by-default week cards partially mitigate this). For a fleet with hundreds of vehicles, this is a real initial-render and scroll-jank risk with no fallback today.
- **N+1 fan-out for ledger gross-by-driver.** `ReconciliationTable` calls `api.getLedgerDriverOverview` once per driver via `Promise.all`, every time the component mounts or the week changes — no batch endpoint apparent.
- **Sequential fuel-brain classification loop** in the live table (§5) is meaningfully slower than it needs to be relative to the already-parallelized bulk-finalize equivalent — worth aligning the two to use the same `mapPool` pattern.
- **No shared data-fetching/caching layer.** `ReconciliationTable` uses five independent `useState`/`useEffect` fetch chains despite `@tanstack/react-query` being used elsewhere in the app — introducing a shared query cache here would remove the triple-fetch of trips (§5) essentially for free.

---

## 7. Test Coverage Assessment

**Well covered:** pure calculation utilities — `fuelCoverageSplit.test.ts` (split math including the pooled-allowance case and a totals-balance sanity check), `businessFinancePnL.test.ts` (P&L netting, including fuel-specific cases), `fuelPeriodGating.test.ts` / `fuelPeriodStatus.test.ts` / `fuelWeekPeriod.test.ts` (gating state machine, week-boundary math), `fuelCalculationService.test.ts` / `.driverWeek.test.ts` (core recon math).

**Zero coverage, and precisely where this audit's highest-severity findings live:**
- `fuelFinalizeService.ts` — no test file exists. The actual Finalize orchestration engine (settlement commit, reversal, cycle-close, snapshot build) has no coverage of the partial-failure race (§2.3).
- `fuel_pnl_offset.ts` — no test file exists, despite being the mechanism keeping Business Finance's Fuel P&L line in sync with Finalize. Its idempotency/versioning transitions are entirely unverified.
- `settlementService.ts` (`commitWeeklyStatement`) — no test file exists.
- The Finalize / reset HTTP routes in `fuel_controller.tsx` — no dedicated test file (only unrelated `fuel_cycle_stamp.test.ts` / `fuel_entry_link.test.ts` exist in that directory).
- The multi-vehicle merge Personal-Allowance fallback edge case (§3.2) — not evidenced as covered by the existing driver-week test file.
- Ironically, the one piece of reconciliation-adjacent logic with dedicated tests (`fuelPeriodStatus.test.ts`'s coverage of `deriveFuelReconciliationPeriods`) backs the **dead** period-card/wizard flow, not the shipped table.
- No component-level tests exist for any reconciliation UI file (`ReconciliationTable.tsx`, all wizard/dialog components, `BucketReconciliationView.tsx`, `DeadheadAnalysisPanel.tsx`, `FinalizedReportsTab.tsx`).

**Net read:** the math you'd catch in a unit test is tested; the orchestration that actually moves money and locks periods — where every high-severity finding in this audit lives — is not.

---

## 8. Consolidated Findings Table

| # | Severity | Finding | Location |
|---|---|---|---|
| 2.1 | **High** | Bulk Finalize omits Personal Allowance entirely → different driver deductions than single-week Finalize for the same week | `buildFuelWeekReportsForFinalize.ts` vs `ReconciliationTable.tsx`; gate in `fuelCalculationService.ts` |
| 2.2 | **High** | Bulk Finalize bypasses all data-quality/dispute/re-finalize-delta gating that single-week Finalize enforces | `FuelBulkFinalizeDialog.tsx` |
| 2.3 | **High** | No idempotency/transactionality on wallet-transaction layer; partial mid-batch failure leaves money moved with no snapshot record | `fuelFinalizeService.ts`, `settlementService.commitWeeklyStatement` |
| 2.4 | **High** | No distributed lock on Finalize — busy-lock is per-tab, in-memory only; server does unconditional KV overwrite | `FleetBusyLock.tsx`, `fuel_controller.tsx` |
| 2.5 | **Medium-High** | Server never recomputes/validates client-submitted driverShare/companyShare before posting to the ledger | `fuel_controller.tsx`, `fuel_financial_reset.ts` |
| 2.6 | Medium | Bulk-finalize API can return `success: true` on a partial failure if caller doesn't inspect `failures` array | `fuel_controller.tsx` |
| — | **High (architecture)** | Entire period-card + guided-wizard UX is dead code, never routed; no design artifact exists for what's actually shipped | `FuelPeriodLandingPage.tsx`, `FuelPeriodWizard.tsx`, `FuelPeriodStepper.tsx`, `FuelPeriodResetDialog.tsx` |
| 3.2 | Medium | Misc/Leakage invariant can silently break in one multi-vehicle merge edge case | `fuelCalculationService.ts` (`generateDriverFleetReport`) |
| 3.3 | Medium | Blended driver-share ratio duplicated independently in frontend and backend | `fuelCalculationService.ts` vs `fuel_pnl_offset.ts` |
| 3.1 | Medium | Missing odometer data is invisibly relabeled as "leakage" with no distinguishing flag | `fuelCalculationService.ts` |
| 3.4 | Low-Medium | Fixed_Amount mode pools Ride Share + Misc into one allowance — real, undocumented product rule | `fuelCoverageSplit.ts` |
| 3.5 | Low-Medium | Week-boundary computation is timezone-optional in a domain with a known prior timezone bug | `fuelWeekPeriod.ts` |
| — | Medium | Perf: no pagination/virtualization anywhere in the reconciliation table stack | `ReconciliationTable.tsx`, `FinalizedReportsTab.tsx`, `DeadheadAnalysisPanel.tsx` |
| — | Medium | UX: same concept named 3 different ways ("Net Leakage"/"Net unassigned"/"Misc"); same action named 4 different ways (Delete/Reopen/Reset) | mockup vs. dead component vs. shipped table; `FuelBulkResetDialog.tsx` |
| — | Medium | Three separate, differently-designed "undo finalize" flows, one of them dead code | `FinalizedReportsTab.tsx`, `FuelBulkResetDialog.tsx`, `FuelPeriodResetDialog.tsx` |
| 4.3 | Medium | Color-only leakage indicator, no icon/text differentiator (a11y) | `ReconciliationTable.tsx` (`getLeakageColor`) |
| 4.4 | Low-Medium | Loading and empty states conflated — "No vehicles found" shows before data has even loaded | `ReconciliationTable.tsx` |
| 4.6 | Low | Backend field-name drift (`companyUsageCost`/`companyOpsCost` etc.) patched over with fallback chains in UI instead of normalized once | `FinalizedReportsTab.tsx` |
| — | Low | `FuelBulkFinalizeDialog`/`FuelBulkResetDialog` ~85% duplicated code | both files |
| 4.5 | Low | "Finalize" button → dialog CTA reads "Process Ledger Entries"; two live Finalize entry points with silently different behavior shown side by side | `ReconciliationTable.tsx`, `FuelManagement.tsx` |
| 3.6/3.7 | Low | Three different epsilon thresholds for "nonzero" across files; several inline magic-number thresholds not centralized | `fuelPeriodStatus.ts`, `settlementService.ts`, `fuel_pnl_offset.ts`, `fuelCalculationService.ts` |
| 3.8 | Low | Dead settings surface: `fuel_pnl_offset.ts` keeps a no-op enable/disable toggle "for older clients"; still exposed via `api.ts` | `fuel_pnl_offset.ts`, `api.ts` |
| — | Info | No component tests for any reconciliation UI file; no tests at all for the highest-risk orchestration files (`fuelFinalizeService.ts`, `fuel_pnl_offset.ts`, `settlementService.ts`, Finalize/reset HTTP routes) | see §7 |
| — | Info | Latent bug if dead wizard is ever revived without flattening: nested `FuelReconBusyProvider` instances would silently fail to mutex against the outer app-level provider | `FuelManagement.tsx`, `FuelPeriodLandingPage.tsx`, `FuelPeriodWizard.tsx` |

---

## 9. Suggested Priority Order (for your own planning — no action taken)

1. **Unify the two Finalize code paths** so bulk and single-week Finalize call one shared calculation + gating function. This alone fixes §2.1, §2.2, and most of §3.3's drift risk.
2. **Add idempotency + a transactional/compensating-action boundary to `commitWeeklyStatement`**, and wrap the Finalize loop so a mid-batch failure either rolls back or is recorded rather than silently orphaning already-moved money (§2.3).
3. **Decide the fate of the orphaned wizard**: either delete it (and its mockups/docs) to stop it misleading contributors, or schedule the work to actually wire it in — which will require flattening the nested busy-lock providers and replacing the "hidden ReconciliationTable" calc-reuse pattern with a real shared hook first.
4. **Add tests for the orchestration layer** (`fuelFinalizeService.ts`, `fuel_pnl_offset.ts`, `settlementService.ts`, the Finalize/reset HTTP routes) — this is where 100% of the high-severity findings live and 0% of the test coverage does.
5. Everything else (terminology unification, color-only leakage fix, virtualization, dedup of the two bulk dialogs) is real but lower-stakes UX/perf polish that can follow once the correctness issues above are closed.
