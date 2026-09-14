# Fuel Review Queue — Architecture Audit & Disposition Decision

**Route:** `/fuel-reimbursements` → nav leaf **Fleet Operations › Fuel Management › Review Queue**
**Component:** [FuelReimbursementTable.tsx](apps/fleet/src/components/fuel/FuelReimbursementTable.tsx)
**Host:** [FuelManagement.tsx](apps/fleet/src/pages/FuelManagement.tsx) `activeTab === 'reimbursements'`

| Rev | Date | Status |
|---|---|---|
| Rev 1 | 2026-09-14 | Audit — disposition decision (keep, re-scope, add finalize blocker) |
| Rev 2 | 2026-09-14 | Implementation review — F1/F3–F8 closed, R1–R7 raised |
| **Rev 3** | **2026-09-14** | **Remediation shipped — R8–R11 closed; F2 accepted risk** |
| Rev 3 audit | 2026-09-14 | Closure verification of Rev 2; raised R8–R11 |

Audit only — no code changed by the auditor in any rev.

---

# Rev 3 — Closure verification

Every Rev 2 closure claim was independently checked against the code. **All seven hold.** The implementation is sound and, in two places, better than the audit asked for. Three new findings emerged, one of which is material.

## 3.1 Verified closures

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| R1 | Refusal moved into `processJobRow`; auto-close skips | ✅ **Confirmed** | Guard at [fuel_period_routes.ts:336](supabase/functions/_fleet-server/fuel_period_routes.ts#L336), placed **after** the idempotent-resume early return and **before** snapshots/money/lock; fails the job with the blocker payload. Auto-close skips via `skip_unapproved_fuel` ([:1341](supabase/functions/_fleet-server/fuel_period_routes.ts#L1341)). HTTP 422 retained at [:920](supabase/functions/_fleet-server/fuel_period_routes.ts#L920) as a fast UI fail. Both the cron bypass and the TOCTOU window are genuinely closed. |
| R2 | Panel/wizard/bulk copy split actionable vs holds | ✅ **Confirmed** | `FuelUnapprovedTxBlockersPanel` partitions on `holdReason` ([:58-59](apps/fleet/src/components/fuel/reconciliation/FuelUnapprovedTxBlockersPanel.tsx#L58)); the Review Queue CTA renders **only** under the actionable group; holds get "Station Database. Review Queue cannot clear them." Wizard ([FuelPeriodWizard.tsx:618-633](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L618)) and bulk dialog ([:289-296](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L289)) mirror the split. No holds-only week dead-ends at an empty queue. |
| R3 | Both callers pass `transactions` | ✅ **Confirmed** | [FuelManagement.tsx:1377](apps/fleet/src/pages/FuelManagement.tsx#L1377) and [FuelBulkFinalizeDialog.tsx:379](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L379). Condition correctly changed to `deps.transactions !== undefined` — an empty array now runs the loop rather than silently skipping. |
| R4 | Ledger filter widened | ✅ **Confirmed** | `isFuelExpenseLedgerVisibleRow` = Approved/Rejected ∧ (`isFuelReimbursement` ∨ `isLedgerFuelExpenseRow`) ([fuelExpenseLedgerFilter.ts:17](apps/fleet/src/utils/fuelExpenseLedgerFilter.ts#L17)), with a dedicated regression test *"includes Rejected Reimbursement claims (R4)"*. |
| R5 | Edit/Delete restored | ✅ **Confirmed** at the UI level | Page grew 130 → 358 lines with detail dialog, `SubmitExpenseModal` edit and delete confirm — **but the handlers are not at parity: see R8.** |
| R6 | Shared lookback | ✅ **Confirmed** | `fuelReviewQueueLookbackRange()` ([fuelReviewQueueLookback.ts](apps/fleet/src/utils/fuelReviewQueueLookback.ts)) consumed by both the badge hook and the page load, which switches window on `activeTab === 'reimbursements'` ([FuelManagement.tsx:501](apps/fleet/src/pages/FuelManagement.tsx#L501)). Badge and queue can no longer disagree on scope. |
| R7 | Resolved via R2 | ✅ **Confirmed** | Holds still excluded from badge `total` (correct — not admin-actionable), and Finalize messaging no longer implies queue action for them. |

**Test run** — the Rev 2 blocker was environmental, and supplying dummy `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` lets the fleet suites execute. They now run and pass:

```
packages/fuel-core/src/fuelReviewQueue.test.ts      12 passed
apps/fleet/src/utils/fuelExpenseLedgerFilter.test.ts 4 passed
apps/fleet/src/services/fuelFinalizeService.test.ts  6 passed
apps/fleet/src/utils/fuelFinalizeGating.test.ts      9 passed
                                        Tests  31 passed (31)
```

The Rev 2 "written but unverified" caveat is lifted — the gating assertions genuinely pass. (The stderr in `fuelFinalizeService` is an intentional negative-path case.) No test-env stub is needed in the repo; the vars just have to be present when running fleet suites.

## 3.2 F2 — **Accepted risk** (no further product change)

Rev 2 recorded F2 as policy with *"Save & Approve mitigates admin busywork."* That is accurate and the feature is real ([SubmitExpenseModal.tsx:702](apps/fleet/src/components/fuel/SubmitExpenseModal.tsx#L702), [FuelManagement.tsx](apps/fleet/src/pages/FuelManagement.tsx)) — gated on `canApproveFuel && !initialData`, it saves and approves a cash receipt in one step so admin entries no longer self-queue.

**Accepted risk (stamped):** Save & Approve resolves the ergonomic half of F2 and formalizes the control half. Create-and-approve by a single actor is one click by design. Dual control remains at week finalize. This is intentional — not an open defect.

---

## 3.3 Remediations shipped (R8–R11)

| # | Finding | Status | Evidence |
|---|---|---|---|
| R8 | Ledgers edit/delete bypassed cascade | ✅ **Closed** | Server cascade in `DELETE /transactions/:id` via [`fuel_tx_cascade.ts`](supabase/functions/_fleet-server/fuel_tx_cascade.ts); shared [`fuelExpenseMutationService.ts`](apps/fleet/src/services/fuelExpenseMutationService.ts) used by Ledgers + Fuel Management; delete confirm copy states linked fill + wallet credit purge |
| R9 | `FuelExpenseLedgerTx` vs `FuelReviewQueueTx` tsc | ✅ **Closed** | `FuelClassifyFields` in [`fuelReviewQueue.ts`](packages/fuel-core/src/fuelReviewQueue.ts) — classify predicates no longer require `id` |
| R10 | Badge 6k ceiling vs queue | ✅ **Closed** | Shared `FUEL_REVIEW_QUEUE_TX_PAGE_SIZE` / `MAX_PAGES` (1500×40); truncation banner on Review Queue tab |
| R11 | Mutations gated on `fuel.approve` | ✅ **Closed** | Ledgers + Review Queue Edit/Delete use `fuel.edit_entry` / `fuel.delete_entry` |

### Historical write-up (pre-closure)

### R8 — Ledgers › Fuel Expenses edit and delete bypass the cascade — **High** *(closed above)*

R5 restored the buttons but not the logic behind them. Both handlers on the relocated page called the bare API. Server `DELETE /transactions/:id` removed a single row and never touched `fuel_entry` or `fuel-credit-*`. Durable fix: server-side cascade + shared client mutation service.

### R9 — New typecheck error in `fuelExpenseLedgerFilter.ts` — **Low** *(closed above)*

### R10 — Badge still caps at 6,000 rows; queue fetch does not — **Low** *(closed above)*

### R11 — Note: ledger mutations gated on `fuel.approve` — **Low** *(closed above)*

---

## 3.4 What's left

Nothing material for this section. Optional: deploy edge function so production DELETE cascade is live.

**Assessment.** Finalize cannot bypass unapproved fuel; queue/badge share window and ceiling; station holds route correctly; rejected claims stay auditable with cascade-safe edit/delete; F2 is an accepted risk at Finalize.

---

# Rev 2 — Findings as raised (historical)

*Kept for traceability. All statuses superseded by §3.1.*

### R1 — The Finalize refusal does not cover the irreversible step — **High** *(closed)*

The guard was enforced at the request handler, before the job was enqueued:

```ts
// fuel_period_routes.ts — POST /fuel/periods/:id/finalize
const unapproved = await assertNoUnapprovedFuelTxInWindow(orgId, ymd(period.week_start), ymd(period.week_end));
if (unapproved) return c.json(unapproved, 422);
```

But the money commit, the period lock and `sealFuelWeek` all happened later, inside `processJobRow`, which contained no unapproved-fuel check. Two consequences: the auto-close cron bypassed the refusal entirely (it inserts a `fuel_period_job` directly), and a receipt submitted between enqueue and execution was not caught. Same class as the settlement close lesson — *evaluate every refusal immediately before the irreversible step.*

### R2 — Station holds hard-block a week nobody can unblock — **Medium** *(closed)*

`listUnapprovedFuelTxInWindow` includes station-gate-held rows as `holdReason: 'station_hold'`, making them hard Finalize blockers — but holds are not admin-resolvable, the station-hold tab had been removed, and the panel CTA pointed at Review Queue rather than Station Database.

### R3 — The service-level guard is inert — **Medium** *(closed)*

`fuelFinalizeService` refused before any settlement mutation, but was gated on `deps.transactions?.length` and neither production caller passed `transactions` — so the block never executed.

### R4 — Rejected non-`Expense` fuel rows lost their only home — **Medium** *(closed)*

`FuelExpenseLedgerPage` filtered on `isLedgerFuelExpenseRow`, which requires `type === 'expense'`. Rows typed `Reimbursement` / `Fuel_Manual_Entry` / `Manual_Entry` appeared nowhere once Approved or Rejected — losing the audit trail for refused money.

### R5 — Fuel expense rows lost their edit path — **Low** *(closed at UI level; see R8)*

The relocated page was read-only — no row click, no `onEdit`, no `onDelete` — while the tab it replaced offered Edit from its detail modal.

### R6 — Badge counted 180 days; the queue loaded only the selected week — **Medium** *(closed)*

Badge used a 180-day lookback while the queue's `transactions` prop came from `fuelFetchWindow` (selected week + pad), so an older Pending receipt made the badge read `1` over an empty queue.

### R7 — Badge total excludes station holds — **Low** *(closed via R2)*

---

# Rev 1 — Original audit (2026-09-14)

*Retained as the rationale record.*

## Question asked

> "This section has become truly redundant — the only thing I use it for is manually adding fuel. Should I move Log Fuel to Transaction Logs and delete the section, or does it serve a purpose beyond that?"

## Verdict

**Do not delete it — but the instinct is half right.** The Review Queue is the **only** approve/reject gate for fuel in the entire monorepo, and approval is the **only** event that turns a driver's receipt into a `fuel_entry`. However, three of its four tabs do not belong on a queue, the manual-entry button is on the wrong screen, and the queue's backlog is **invisible to week close** — which is why it *feels* redundant. The enterprise move is to **shrink it to a real queue, move manual entry to Transaction Logs, and make the queue block Finalize instead of relying on you to visit it.**

## 1. What the screen was

| Tab | Source predicate | Honours date picker | Purpose |
|---|---|---|---|
| **Log Review** | `isLogReviewEligible` | ❌ No | Driver submitted, AI odometer scan failed → admin must key the odometer |
| **Pending › Ready for review** | `isPendingFuelQueueRow` minus gate holds | ❌ No | Approve/reject driver fuel claims |
| **Pending › Awaiting station** | `api.getStationGateEvidence()` | ❌ No | Read-only; approve/reject deliberately disabled |
| **Expense ledger (accounting)** | `isLedgerFuelExpenseRow` | ✅ Yes | Approved/Rejected fuel `Expense` rows — a **ledger view** |
| **Closed** | `isFuelReimbursement` + Approved/Rejected | ✅ Yes | Archive — a **ledger view** |

Only the first three were queues. The last two were reports that happened to live on a queue screen.

## 2. Why it could not be deleted

### 2.1 Single approval surface in the codebase

`approveExpense` / `rejectExpense` had exactly one UI caller across `apps/`, `packages/` and `supabase/` — all three call sites were props passed **only** to `FuelReimbursementTable`. `apps/admin` and `apps/driver` define the API method but never call it.

### 2.2 Approval is the only event that creates a `fuel_entry`

```ts
// supabase/functions/_fleet-server/index.tsx:5021-5056
const approveResult = await ensureFuelEntryForApprovedTx(tx, { … decisionReason: 'ADMIN_APPROVED' });
if (approveResult.blockedNoVehicle) return 422 BLOCKED_NO_VEHICLE;
if (!approveResult.fuelEntry)       return 500 FUEL_ENTRY_MISSING;
```

No approval → no `fuel_entry` → never reaches Transaction Logs, the reconciliation wizard, the weekly statement, or reimbursement.

### 2.3 The inbound flow is live

[DriverShell.tsx:153](apps/driver/src/components/layout/DriverShell.tsx#L153) renders `DriverExpenses` in the shipped driver app, stamping `needsLogReview` on non-AI odometer submissions. **An empty queue reflected current driver behaviour, not a dead architecture.**

## 3. Rev 1 findings

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | `FuelLayout` drops `onAddTransaction`; `FuelLogModal` create mode unreachable | High | ✅ Closed |
| F2 | Admin creates Pending then self-approves; dual control only at finalize | Medium | ⬜ Accepted risk (§3.2) |
| F3 | Finalize gate blind to unapproved fuel — `pendingCount` = `entries.length`, a count of `fuel_entry` rows ([weekSnapshotEngine.ts:232](packages/fuel-core/src/weekSnapshotEngine.ts#L232)) | **High** | ✅ Closed |
| F4 | Same row renders on both Closed and Expense ledger tabs | Low | ✅ Closed |
| F5 | Gate evidence fetched 4× at limit 5000 across 4 surfaces | Medium | ✅ Closed |
| F6 | Date picker inert on 2 of 4 tabs, unlabelled | Low | ✅ Closed |
| F7 | No nav badge — queue has no pull mechanism | Medium | ✅ Closed |
| F8 | Page gated on `nav.fuel_overview`, not a review-queue capability | Low | ✅ Closed |

## 4. The principle

**A ledger records what happened. A queue records what must happen.** Collapsing an approval queue into a ledger view is how approval steps get quietly skipped. But a queue you have to *remember* to visit is not a control either — it must pull you.

## 5. What was explicitly ruled out

- ❌ Deleting the section — orphans the only fuel approval path and strands live driver submissions.
- ❌ Merging Pending rows into Transaction Logs as a status filter — Transaction Logs is a `fuel_entry` surface; Pending reimbursements have no `fuel_entry` yet. Not the same object.
- ⚠️ Moving the manual-entry button without fixing F1 first.
