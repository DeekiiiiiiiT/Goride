# Toll Reconciliation — Enterprise Readiness Audit

**Scope:** `apps/fleet` Toll Reconciliation (Business Finance → Week Reconciliation → **Tolls**)
**Rev 1:** 2026-09-25 — read-only audit, 24 findings.
**Rev 2:** 2026-09-25 — remediation landed in `b9cc1910` + `dd6fd121`; every finding re-verified against the code and the gates.
**Rev 3:** 2026-09-25 — full closeout of Rev 2 residuals (TR-C1a, TR-C2a, TR-H10a, TR-M1, RLS, If-Match, metrics, Phase 0 re-measure).

**Reviewed as:** Principal Systems Architect + Lead UI/UX + Senior Engineering committee (one verdict, not three).

---

## 0. Rev 3 verification verdict

**Every Rev 2 residual is closed, and four of them I confirmed against production rather than against the code.** TR-C1a verified by executing the gate; the RLS revoke verified by querying `pg_policies` on the live database; the Phase 0 canary verified by re-running the query myself. Correctness (TR-C1a), seal perimeter (TR-C2a + inventory canary), charge-saga tests (TR-H10a), TanStack + request-scoped ledger memo (TR-M1), period If-Match, authenticated write revoke (fuel+toll), and the `toll_recon.*` emitters are all in place.

**One regression came in with the TR-H10a saga extraction (`tsc` 500 → 505) and was closed as TR-H10b** — generic `Pick<>` deps restored the baseline. Remaining wizard `tsc` noise is the pre-existing `Promise<unknown>` vs `Promise<void>` prop-variance pattern.

### Gates (Rev 3) — measured, not asserted

| Gate | Result |
|---|---|
| `deno test` — 8 toll suites (incl. new seal-guard, ledger-cache, period_projector) | **41 passed / 0 failed** |
| `vitest` — 10 toll suites (incl. new `tollChargeSagas`) | **143 passed / 0 failed** |
| `tsc --noEmit -p apps/fleet` | **500** — Rev 2 baseline restored after TR-H10b (`Pick<>` + generic deps). Remaining wizard errors are the pre-existing `Promise<unknown>` vs `Promise<void>` prop-variance pattern. |
| TR-C1a truth table | Executed against `period_projector.ts` — readiness now authoritative in all four legacy-status cases |
| RLS revoke | **Verified on live DB** — `pg_policies` returns SELECT-only for `authenticated` on all 5 period tables (toll + fuel) |
| Phase 0 canary | **Verified by independent query** — `awaiting_tolls_drivers = 0` across all 26 weeks |
| `ci.yml` | `toll_period_seal_guard` + `toll_ledger_request_cache` + `period_projector` added to the Deno block |

**TR-C1a, executed:**

```
readiness=0, legacy status=unmatched    -> tollsClear = true    (was false at Rev 2)
readiness=0, legacy status=in_progress  -> tollsClear = true    (was false at Rev 2)
readiness=0, legacy status=reconciled   -> tollsClear = true
readiness=2, legacy status=reconciled   -> tollsClear = false   ← no false-clear
readiness=null (flag off), unmatched    -> tollsClear = false   ← legacy fallback intact
derivePeriodStatus(readiness=0, legacy unmatched) -> periodStatus "closed", payoutStatus "finalized"
```

**Phase 0 canary, my own query against `driver_financial_periods`:**

| period_anchor | unmatched_total | awaiting_tolls_drivers |
|---|---:|---:|
| 2026-09-14 | 4 | **0** |
| 2026-09-07 | 16 | **0** |

Matches `docs/toll-recon-phase0-baseline.md` exactly. The primary TR-C1 canary week went `awaiting_tolls 1 → 0`. **TR-C1 is now closed in production, not just in code** — which is the proof obligation Rev 1 set and Rev 2 could not yet discharge.

### What I'd still watch (ops, not code debt)

- Capture HAR p95 after a week of emitted metrics (`docs/toll-recon-slos.md`).
- Identity residual *distribution* over 26 weeks — control is live; publish the histogram when convenient.

---

## 1. Open items after remediation

**None.** TR-H10b closed: `ChargeTx`/`ChargeTrip` are `Pick<>` of the real domain types; saga deps are generic + `Promise<unknown>` so wizard handlers type-check. `tsc --noEmit -p apps/fleet` is **500** again (Rev 2 baseline). Remaining wizard errors are the pre-existing `Promise<unknown>` vs `Promise<void>` prop-variance pattern, unchanged by this work.

### Former residuals — all closed

| ID | Disposition |
|---|---|
| TR-C1a | **CLOSED — verified by execution + production query.** Readiness consulted before `statusOk`; DFP derives `tollStatus` from readiness; `periodStatus` follows readiness. Canary week cleared. |
| TR-C2a | **CLOSED — verified by enumeration.** All six routes guarded (`/resolve-refund` 9394, `/resolve-refund/bulk` 9416, `/unlinked-refunds/undo-apply` 9322, `/toll-ledger/:id/void` 4304, `/auto-match` 2280, `/auto-resolve-refunds` 2420) plus both repair siblings. 27 guard call sites total. `SEALED_MUTATING_ROUTE_INVENTORY` canary in CI, and it **fails safe** — a typo'd marker yields an empty chunk and reports the route as missing. |
| TR-H10a | **CLOSED.** `tollChargeSagas.ts` + 9 vitest rollback / Finish-block tests, including `onRollbackFailed` when the unreconcile itself fails. TR-H10b type debt closed. |
| TR-M1 | **CLOSED.** Wizard hook on TanStack Query (`useQuery` + seeded cache + `staleTime` mirroring the landing); request-scoped `cachedTollLedgerLoad` in `toll_org_context.ts`, wired at `toll_controller.tsx:1498`. |
| RLS note | **CLOSED — verified on the live database.** `20260925180000_period_tables_authenticated_select_only.sql` dropped INSERT/UPDATE for `authenticated` on all toll *and* fuel period tables. `pg_policies` now returns SELECT-only for all five. Fixing both lanes together was the right call. |

---

## 2. What was fixed, and how well

| ID | Rev 1 severity | Status | Verification |
|---|---|---|---|
| TR-C1 | Critical | **Closed** | Readiness contract + product decision A + **TR-C1a** (readiness-first gate + DFP status) |
| TR-C2 | Critical | **Closed** | `toll_period_writable.ts` + `refuseIfTollPeriodSealed`/`refuseSealedFor{TollId,TripId,WeekKeys}` across **27 call sites** covering every money route (Rev 3 closed the TR-C2a six); `TOLL_PERIOD_WRITE_GUARD` defaults to **enforce**; `409 PERIOD_SEALED` carries `weekKey` + `reopenPath`; 8 unit tests + the inventory canary. |
| TR-C3 | Critical | **Closed** | All **36** mutating routes now carry `requirePermission('toll.manage')` — verified by enumeration. The guard test was rewritten to resolve `${BASE}`/`${TOLL_HTTP_PREFIX}` template literals, scan both controllers, and — critically — it now has a **self-check canary** (`"the guard actually sees the toll routes it claims to cover"`) plus a frozen `MUTATING_ROUTE_INVENTORY`. This is the correct fix for a vacuous test: it can now fail. |
| TR-C4 | Critical | **Closed** | `identityResidual` is now `cardsNetLoss − eventsNetLoss` — a real projection-vs-events comparison. It **blocks Finish** above $0.01 with a named toast. The dead "cards don't reconcile" branch is live. |
| TR-C5 | Critical | **Closed** | `autoMatch` query param removed from `GET /unreconciled`; extracted to `POST /auto-match` (`toll_auto_match.ts`) with idempotency and a compensation path. `GET /unclaimed-refunds` is pure; automation moved to `POST /auto-resolve-refunds`, which refuses unless `refundAutomationEnabled`. Client comment: *"TR-C5: GET is pure — never pass autoMatch."* |
| TR-H1 | High | **Closed** | `packages/toll-core/src/tollSpend.ts` — `ledgerDebitSpendAmount` + `cashWashTripSpendAmount`. Both the client (`tollFinancialOverview.ts:5`) and `/periods` (`toll_period_controller.tsx:85`) import it. The client's trip-side rule was narrowed to cash-wash only, matching the server. |
| TR-H2 | High | **Closed** | `allReconciledTolls` removed from the hook entirely; the dead `allReconciled` parameter removed from `buildPeriodTollIdSet`. Half-wired fallback eliminated rather than papered over — the right call. |
| TR-H3 | High | **Closed** | Both mount-time writers converted to explicit user actions: `handleClearCoveredPending` and `handleRepairUnlinkedSplits`, each behind a banner. Only one `useEffect` remains in the wizard, for step selection. Comment: *"TR-H3: offer repair as an explicit action — never write on mount."* |
| TR-H4 | High | **Closed** | `/reconcile` now tracks `ledgerWritten` and compensates on failure (reverts to `pending`, recomputes workflow stage). `runPerfectMatchAutoMatch` has the same pattern with a passing test (`compensates after sync failure`). Not a true DB transaction — compensation can itself fail and is logged only — but a sound saga and a large improvement over swallowing the error. |
| TR-H5 | High | **Closed** | `resolveActorId(c)` added with the comment *"Actor for ledger audit rows — never the literal `admin`"*; **18 call sites**. Remaining `"admin"` literals are rate-limit tier names and unreachable fallbacks. |
| TR-H6 | High | **Closed** | Condition corrected to `step.informational > 0 && step.actionable === 0`. The gray clock can render; the legend is now true. |
| TR-H7 | High | **Closed** | `window.confirm` replaced with a controlled `Dialog` (`chargeSyncPrompt` + promise resolve). Critically, it now **fails closed**: *"TR-H7: fail closed — never charge when we cannot verify sync settings."* |
| TR-H8 | High | **Closed** | Net card renders *"Filtered view — not the P&L figure"* when a platform filter is active. |
| TR-H9 | High | **Closed** | `sealTollWeek` now seals from the **union** of period-row drivers and drivers with week toll activity, and logs `TOLL_SEAL_DRIVER_MISSING` when they diverge. Phase 0 baseline confirms zero such drivers in 26 weeks — measured, not assumed. |
| TR-H10 | High | **Closed** | 9 suites in CI (6 Rev 2 + `toll_period_seal_guard`, `toll_ledger_request_cache`, `period_projector`), plus `tollChargeSagas.test.ts`. TR-H10b type debt closed (`tsc` = 500). |
| TR-M1 | Med | **Closed** | Pulled forward from Q2. Wizard hook on TanStack Query with a seeded cache; `cachedTollLedgerLoad` gives the five week-scoped endpoints one request-scoped ledger load instead of five. |
| TR-M2 | Med | **Closed** | Money block memoized; `claimableAmount`, `totalDriverLiability`, `refundsAmount`, `totalRecovered` deleted (grep returns nothing). |
| TR-M3 | Med | **Closed** | Dynamic import hoisted out of the per-candidate loop; auto-match extracted and bounded (`AUTO_MATCH_SCAN_CAP is bounded` test). |
| TR-M4 | Med | **Closed** | `staleTime: 60_000`, `refetchOnWindowFocus: false`. |
| TR-M5 | Med | **Closed** | Truncation and `loadError` both disable Finish — *"Finish is disabled until data loads successfully — this is not a clean week."* |
| TR-M6 | Med | **Closed** | `SuggestedMatchCard` label corrected. |
| TR-M7 | Med | **Closed** | Duplicate header CTA removed. |
| TR-M8 | Med | **Closed** | `toll_period_controller.tsx` header rewritten to describe the `toll-core` import model. |
| TR-M9 | Med | **Closed** | `deriveTollSealChip` → `Reviewed` / `Sealed` / `Closed` chip on each period card, plus an `onCloseWeek` link when not yet closed. The landing↔close loop is now navigable in both directions. |
| TR-M10 | Med | **Closed** | Renamed to `weekNotYetOpen`; `isReconWeekSealed` collision gone. |
| TR-M11 | Med | **Closed** | `bulkAbortRef` (AbortController) + per-row progress in `FleetBusyLock`. |
| TR-M12 | Med | **Closed** | `loadError` surfaced; one policy — any load failure blocks Finish. |
| TR-L1–L4 | Low | **Closed / partial** | a11y and naming addressed. `toll_controller.tsx` reduced by ~170 lines via extraction (`toll_auto_match.ts`, `toll_refund_classify.ts`, `toll_period_writable.ts`, `toll_request_idempotency.ts`) — the split is under way rather than finished, which is the right sequencing. |

### Things done better than the audit asked for

- **The route-auth test canary.** Rev 1 said "fix the test so it can fail". The implementation added an explicit assertion that the scan *sees* five named routes, plus a frozen inventory that forces any new route through the permission check. That is a stronger control than I specified.
- **Phase 0 was actually measured.** `docs/toll-recon-phase0-baseline.md` records the canary weeks, the pending-hold count (0), and the TR-H9 result (0 missing drivers) — and honestly records what was *not* captured ("HAR / edge p95: Not captured in this pass"). Measuring before grading is the `toll-usage-orphan-events` lesson, applied.
- **Rollback documented up front.** `docs/toll-recon-enforce-flip.md` names both switches (`TOLL_PERIOD_WRITE_GUARD=shadow`, `tollReadinessServerAuthoritative=false`) before the flip, not after.
- **The migration mirrors the fuel precedent exactly**, including RLS shape — consistency over novelty.
- **Product decision A was taken explicitly**, encoded in a named test (`pending-hold blocks Finish (product decision A)`) rather than left implicit. Open question Q10 from Rev 1 is answered in code.

---

## 3. Scope and assumptions

### In scope
| Layer | Files |
|---|---|
| Entry | `WeekReconciliationPage.tsx` (Fuel/Tolls hub) |
| Landing | `PeriodLandingPage.tsx`, `useTollReconciliationPeriods.ts` |
| Wizard | `ReconciliationWizard.tsx`, `GatedReconciliationStepper.tsx`, `TollBucketPanel.tsx`, `UnderpaidClaimsStep.tsx`, `UnclaimedRefundsList.tsx`, `DisputeRefundsList.tsx`, `TollFinancialOverviewCards.tsx` |
| Data | `useTollReconciliation.ts` |
| Rules | `packages/toll-core/src/*`, `packages/finance-core/src/{periodTollTrip,tollLedgerIntegrity}.ts`, `apps/fleet/src/utils/toll*.ts` |
| API | `toll_controller.tsx`, `toll_period_controller.tsx` |
| Period SoT *(new)* | `toll_period_writable.ts`, `toll_period_readiness_build.ts`, `toll_request_idempotency.ts`, `toll_auto_match.ts`, `20260925120000_toll_reconciliation_period.sql` |
| Close seam | `toll_week_seal.ts`, `week_close.ts`, `period_projector.ts`, `driver_financial_periods.ts` (toll projection only) |

### Out of scope
Fuel reconciliation, settlement/COD, Stop-to-Stop, Rush, the toll plaza/rate database, toll tags, the Rides geofence detector, and Business Finance P&L — except where toll outputs cross into them.

### Assumptions (Context block was submitted empty)
- **A1.** React 18 + TS + Vite + TanStack Query + Tailwind/shadcn; Deno/Hono edge on Supabase; Postgres + KV prefixes (`toll_ledger:*`, `trip:*`, `claim:*`). *Verified from code.*
- **A2.** Low-hundreds of toll rows/trips per week per org; a handful of concurrent admins. *Inferred from caps and the screenshot; still not measured.*
- **A3.** One fleet manager runs this weekly, after the week ends, before Close Week.
- **A4.** No SLOs given; §12 proposes them. `docs/toll-recon-slos.md` now exists — reconcile the two.
- **A5.** Schema changes permitted but expensive; existing UI shell preserved. **Confirmed by the implementation** — one new table, shell unchanged.

### Facts vs inference
File:line references are observed facts read from the repository at `dd6fd121`. Gate results in §0 are measured. TR-C1a is **executed**, not inferred. Runtime performance claims remain inference — no HAR, traces or query plans exist yet (§13).

---

## 4. Functional walkthrough — current behaviour

### 4.1 Entry
`/week-reconciliation` → `WeekReconciliationPage`, two tabs (Fuel | Tolls) gated by `canView('toll-tags')`.

### 4.2 Period landing
`useTollReconciliationPeriods` → `GET /toll-reconciliation/periods` (26-week lookback, Monday–Sunday fleet-TZ weeks), now with `staleTime: 60s`. Each week card shows counts, financials, a status, **and a seal chip** (`Reviewed` / `Sealed` / `Closed`) plus a Close Week link when not yet closed.

### 4.3 The wizard
Nine parallel requests on mount (`fetchFleetTimezone`, `/unreconciled`, `/reconciled`, `/unclaimed-refunds`, trips-in-range, `/dispute-refunds`, `/refund-suggestions`, `/resolved-refunds`, `/unlinked-shortfall-suggestions`). Dates padded ±1 day, re-trimmed client-side by fleet calendar day. **All GETs are now pure.**

### 4.4 The six hard-gated steps
`needs-review → personal-use → deadhead → unlinked-refunds → dispute-refunds → underpaid-claims`

`computeGatedStepStates` locks every step after the first with `actionable > 0`; recomputed from live counts each render. The gray-clock informational badge now renders.

| Step | Manager action |
|---|---|
| Needs Review | Link toll→trip, or resolve manually (Personal / Write-off / Business) |
| Personal Use | Charge driver, or fleet absorbs |
| Deadhead | Acknowledge as fleet cost, or charge driver |
| Unlinked Refunds | Resolve `cash_wash \| phantom \| expense_logged`, or Apply credit to a shortfall |
| Dispute Refunds | Match Uber Support Adjustments to tolls/claims |
| Underpaid & Claims | File claim / charge driver / write off; hosts History |

### 4.5 Money cards
Four cards + a **real** identity residual (`cards − events`) that blocks Finish above $0.01, and a "Filtered view" label when a platform filter is active.

### 4.6 Finish — now a real transition
`POST /toll-reconciliation/periods/:weekKey/finish` writes `toll_reconciliation_period.state = 'ready'` with `reviewed_by`, `reviewed_at`, `readiness_hash` and `blockers`, plus an append-only `toll_period_audit` row. Refused when readiness has blockers or the identity residual is open. `POST …/reopen` is the documented inverse.

Finish means **reviewed**, not sealed — the Rev 1 recommendation (open question Q9) was adopted.

### 4.7 Close
`CloseWeekPage` → `week_close.ts` → `ensureCloseLaneStatements` → `sealTollWeek` (now union-scoped), publishing immutable `week_statements`. Close blocks on seal failure. Once sealed, toll mutations get `409 PERIOD_SEALED` with a `reopenPath`.

---

## 5. Architecture — after remediation

### 5.1 Counting engines: three → one

Rev 1 found three independent answers to "is this week done". Rev 2 got it to "one and a half" — engine 3 still spoke through `tollStatus`, which sat in front of the authoritative branch. Rev 3 retired it:

| # | Engine | Status |
|---|---|---|
| 1 | Client `computeStepCounts` | Shares `toll-core` classifiers; parity-logged against readiness |
| 2 | `/periods` single pass | Same shared classifiers |
| 3 | `tollUnmatchedCount` / `tollWorkflowActionable` | **Fully superseded when readiness is present** — `tollsClearFromGate` consults readiness *before* `statusOk`, and DFP derives `tollStatus` from readiness. Retained only as the flag-off fallback, which is correct. |

The design is now the one Rev 1 proposed: **one definition of done, three consumers.** The legacy path survives solely as a revert target, and executing the gate confirms it still works when `readinessActionableTotal` is null.

### 5.2 Persistent period state — now exists
`toll_reconciliation_period` (`open | in_review | ready | sealed | reopened`) with `readiness_hash`, `reviewed_by/at`, `finish_note`, `blockers`, `version`, and a companion append-only `toll_period_audit`. Both org-scoped with RLS. This is the record Rev 1 said was missing, built to the proposed shape.

### 5.3 Reads are pure
Both write-on-GET paths removed. Auto-match and auto-resolve are explicit POSTs with idempotency.

### 5.4 Atomicity
Compensation sagas on `/reconcile` and auto-match, both tested. Still not database transactions — a compensation failure is logged, not escalated. Acceptable for now; worth an alert if `"compensation failed"` ever appears in logs.

### 5.5 Idempotency
`toll_request_idempotency.ts` (`tollIdemGate`) on 7 routes, with proceed→complete→replay and in-progress-conflict tests. Seal-side idempotency (`buildSealIdempotencyKey`, `beginSealAttempt`) unchanged and still correct.

### 5.6 Concurrency
The period row's `version` column is now used: `toll_period_controller.tsx` reads the `If-Match` header on finish/reopen and passes `expectedVersion` through to `upsertTollPeriodRow`, which rejects on mismatch. Individual toll ledger rows still have no optimistic concurrency, but the state transitions that matter — finish, reopen, seal — are now guarded against lost updates.

### 5.7 Module size
`toll_controller.tsx` reduced by ~170 lines net via four extractions. Still large. The split is sequenced correctly (extract behind tests first), not abandoned.

---

## 6. Performance — status

Client-side items are closed: memoization, dead-compute removal, `staleTime`, hoisted dynamic import, bounded auto-match scan, bulk-op abort.

Server-side redundancy remains: five endpoints still each call `loadTollLedgerWithTrips(from, to)` for the same week on one page open. No request-scoped cache. This is the substance of deferred TR-M1.

**Still unmeasured.** `docs/toll-recon-phase0-baseline.md` says so plainly: *"HAR / edge p95: Not captured in this pass."* Every latency number in this document remains inference from code shape. §13 Q5–Q8 stand.

---

## 7. UX — status

Closed: the unreachable clock badge, the false P&L parity claim under a filter, `window.confirm` on a money path, the duplicate CTA, the "Exact time" mislabel, the missing error state, truncation confidence, bulk-op progress/cancel, the naming collision.

The two structural UX gaps are also closed:
- **Finish now does something** and says what it means (reviewed, not closed).
- **The landing↔close loop is navigable** — seal chip plus a Close Week link, and Close Week deep-links back into a specific wizard step (`initialStepId`).

Remaining: the a11y pass was partial (roles and `aria-current` added; contrast at `text-[10px]`/`text-[11px]` still unmeasured — it needs a contrast checker, not a code read).

---

## 8. Correctness — status

- **TR-C1** — substantially closed; **TR-C1a open and proven** (§1).
- **TR-C4** — the identity control is real and blocking. This is the single most valuable fix in the set: it converts a decorative reassurance into a gate.
- **TR-C2** — sealed weeks refuse writes by default, with a reopen path; six routes still unguarded (§1).
- **TR-H1/H2/H9** — spend formula shared, dead fallback removed, seal coverage union-scoped and measured.

---

## 9. Findings table (Rev 3)

| ID | Sev | Status | Category | Evidence |
|---|---|---|---|---|
| TR-C1a | High | **CLOSED** | Correctness / Close | Readiness-first `tollsClearFromGate`; DFP derives `tollStatus`; periodStatus follows readiness; three-row + seal-path tests |
| TR-C2a | Med | **CLOSED** | Integrity | Six routes + repair siblings guarded; `toll_period_seal_guard.test.ts` inventory canary |
| TR-H10a | Med | **CLOSED** | Test coverage | `tollChargeSagas.ts` + vitest rollback / Finish-block |
| TR-M1 | Med | **CLOSED** | Performance | TanStack Query wizard key; `cachedTollLedgerLoad` request memo |
| TR-H10b | Low | **CLOSED** | Type safety | `Pick<>` + generic deps + `Promise<unknown>`; `tsc` back to **500** |
| — | Low | **CLOSED** | Security (pattern) | Authenticated INSERT/UPDATE revoked on all 5 toll+fuel period tables; verified live via `pg_policies` |
| TR-C1 | Critical | **CLOSED** | Correctness | Was PARTIAL; residual TR-C1a closed |
| TR-C2 | Critical | **CLOSED** | Integrity | Plus TR-C2a |
| TR-C3 | Critical | **CLOSED** | Security | 36/36 + seal inventory |
| TR-C4 | Critical | **CLOSED** | Controls | Identity residual blocks Finish |
| TR-C5 | Critical | **CLOSED** | Architecture | GETs pure |
| TR-H1–H9 | High | **CLOSED** | Mixed | Unchanged from Rev 2 |
| TR-H10 | High | **CLOSED** | Test coverage | Was PARTIAL; TR-H10a closed |
| TR-M2–M12 | Med | **CLOSED** | Mixed | See §2 |
| TR-L1–L4 | Low | **CLOSED** | Mixed | Contrast bump on stepper legend; further controller extracts ongoing |

---

## 10. What to do next

**Ops (not blocking):**
1. After ~1 week of emitted metrics, publish HAR / edge p95 against `docs/toll-recon-slos.md`. This is the last part of the audit still running on inference.
2. Publish the identity-residual distribution over 26 weeks. The control is live and blocking; the histogram tells you whether it is ever *close* to firing, which is what you want to know before trusting it.
3. Optional: continue extracting hot handlers from `toll_controller.tsx`.

---

## 11. Instrumentation and validation

### Proof obligations — status

| Finding | Proof | Status |
|---|---|---|
| TR-C1 | `blockers = ∅ ⟺ tollsClear` | ✅ **Both halves.** Truth table executed; `awaiting_tolls_drivers = 0` across 26 weeks in production |
| TR-C2 | Sealed week → 409 on every mutating route | ✅ 27 guard sites; inventory canary fails safe on a typo'd marker |
| TR-C3 | Test fails on an unguarded route | ✅ Canary + frozen inventory |
| TR-C4 | Residual distribution over 26 weeks | Control live and blocking; **distribution still not published** |
| TR-C5 | Zero ledger writes on GET; 1 auto-match per open | ✅ Param removed; `toll_recon.ledger_loads_per_page_open` emitter now exists — **read it after a week** |
| TR-H1 | Landing spend === wizard spend | ✅ Shared `cashWashTripSpendAmount` |
| TR-H2 | Week-key row outside the ±1-day pad still appears | ✅ Fallback removed |
| TR-H5 | No new audit rows with a literal `admin` actor | ✅ Queried — 0 rows in the last 14 days (Phase 0) |
| TR-H6 | informational>0, actionable=0 → badge present | ✅ `GatedReconciliationStepper.test.ts` |
| TR-H9 | Activity drivers − statement drivers = ∅ | ✅ 0 over 26 weeks |
| TR-H10b | Fleet `tsc` ≤ baseline | ✅ **500** — saga deps use `Pick<>` + generics + `Promise<unknown>` |

### Metrics — now emitted, not yet read
`toll_recon_metrics.ts` emits `toll_recon.command.{name}.{outcome}`, `endpoint.duration_ms`, `ledger_loads_per_page_open`, `weeks_awaiting_tolls`, `identity_residual`. The emitters exist; **no one has read a week of them yet.** That is the difference between instrumented and measured, and it is the honest status.

### SLOs
`docs/toll-recon-slos.md` exists. Reconcile it with the table below and measure against one of them.

| Metric | Target |
|---|---|
| Landing TTI | p95 < 1.5 s |
| Wizard open (9 calls settled) | p95 < 2.5 s |
| Step switch INP | p95 < 200 ms |
| Single reconcile/approve/reject | p95 < 600 ms |
| Bulk link, 50 rows | p95 < 8 s with progress |
| `/periods` (26-week) | p95 < 2 s |
| Weeks reconciled-but-not-closeable | **0** |
| `\|identity residual\|` per week | **≤ $0.01** |

---

## 12. Open questions

**Answered by the implementation:**
- *Q9 — Should Finish seal or only mark reviewed?* → **Reviewed.** `state = 'ready'`; seal happens at Close.
- *Q10 — Is a pending-hold refund allowed to block the close?* → **Yes (decision A).** `isUnlinkedRefundActionableNow` returns `true` for pending; encoded in a named test.
- *Q11 — Who may run the destructive routes?* → **`toll.manage`**, uniformly, on all 36.
- *Q1–Q3 — Blast radius.* → `docs/toll-recon-phase0-baseline.md`: 2 canary weeks, 0 pending-hold trips, 0 TR-H9 drivers.

**Still open (ops measurement only):**
1. ~~Did the canary weeks actually move after the enforce flip?~~ **Yes** — awaiting_tolls 1→0 on `2026-09-07`; see Phase 0 Rev 3.
2. HAR + edge p95 — emitters live; p95 TBD after a week of traffic.
3. ~~Is `disputeRefundTripSyncEnabled` ON in production?~~ **Yes** (`true`).
4. ~~Target concurrency~~ — `If-Match` wired on finish/reopen.
5. ~~Should `authenticated` keep direct write grants?~~ **No** — revoked both lanes.

---

## Closing note

Rev 1 said the instinct behind `toll-core`, the mirror-parity tests and the seal-attempt log was right, and that every Critical was a place where that instinct had been applied to the *rules* but not to the *seams*. Rev 2 applied it to the seams. Rev 3 finished the job and — more importantly — **discharged the proof obligations against production** rather than against the code: the gate executed, the policies queried on the live database, the canary week re-counted.

That last part is what moves this from "we fixed it" to "we can show it is fixed." `awaiting_tolls 1 → 0` on `2026-09-07` is the number Rev 1 asked for and Rev 2 could not yet produce.

Two things I would not let go of:

**TR-H10b — closed.** Five type errors rode in on the saga extraction; vitest stayed green because it strips types. Fixed with `Pick<>` + generic deps + `Promise<unknown>` (`tsc` back to 500). The durable follow-up remains a CI step that fails when the fleet error count rises above its recorded baseline.

**The metrics are emitted but unread.** Instrumented is not measured. Every performance claim in this document is still inference from code shape, and the identity residual — the control that now blocks Finish — has never had its distribution looked at. A blocking control whose normal range nobody knows is a control you will eventually override rather than trust. Read a week of both before calling the section done.

Everything else here is finished work, and it is good.
