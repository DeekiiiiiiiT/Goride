# Transaction Logs & Full Tanks — Enterprise Audit

**Surface:** `/fuel-logs` → Fleet Operations → Fuel Management → Transaction Logs (tabs: *Transactions*, *Full Tanks*)
**Round 1 audited:** 2026-09-05 · baseline `94d9ebd8`
**Round 2 verified:** 2026-09-05 · head `1f5a774b`
**Round 3 verified:** 2026-09-05 · head `d4fcd90f` + 13 uncommitted files
**Mode:** Audit only. **No code was changed by this audit.**

---

# ⬛ ROUND 3 — FINAL VERIFICATION

> **Every Round 2 finding is resolved. The surface passes.**
> 12 of 12 R2 items closed, 0 regressions, 0 type errors on this surface.
> What remains is 6 minor items, none of which affect correctness, security, or money.

## Verification method

| Check | Result |
|---|---|
| Full Fleet test suite | ✅ **203 files, 1,229 passed, 1 skipped, 0 failed** (+7 vs R2) |
| `tsc --noEmit` across the whole logs surface | ✅ **0 errors** — `FuelLogTable`, `FuelTransactionsTable`, `FuelCyclesPanel`, `FuelLogToolbar`, `FuelLogKpiRow`, `FuelEntryDetailSheet`, `fuelLogKpiMetrics`, `fuelCycleEngine`, `useFuelCycles`, `useFuelLogQuery`, `useFuelLogSummary` |
| Every module checked for a real import | ✅ **13 of 13 wired** (was 5 of 11) |
| Server routes confirmed to exist for every client call | ✅ `/fuel/log-summary` (`fuel_controller.tsx:2473`), `/fuel-entries/:id/corrections` (`:2653`) |
| Doc ↔ code ↔ server default parity | ✅ verified on all three |

## Round 2 findings — final status

| ID | Finding | Status | Evidence |
|---|---|:---:|---|
| **R2-1** | 6 modules never imported | ✅ **Fixed** | All wired. Plus a real component split: `FuelTransactionsTable` (662), `FuelCyclesPanel` (487), `FuelLogToolbar` (328), `FuelEntryDetailSheet` (201), `FuelExceptionQueue` (190), `FuelLogKpiRow` (142), `fuelLogDisplay` (127) |
| **R2-2** | Correction history unreachable | ✅ **Fixed** | `getFuelEntryCorrections` called at `FuelLogTable.tsx:168`, rendered in `FuelEntryDetailSheet` |
| **R2-3** | Transactions unpaged → false Orphaned | ✅ **Fixed** | `api.getAllTransactionsInRange` (`FuelManagement.tsx:472`) — matches the entries paging |
| **R2-4** | Sorting had no UI | ✅ **Fixed** | `toggleSort` (`:277`) → `onToggleSort` on the table headers (`:964`) |
| **R2-5** | `activeFilterCount` never rendered | ✅ **Fixed** | Badge on the Filters button (`FuelLogToolbar.tsx:148-150`) |
| **R2-6** | KPI cards not clickable | ✅ **Fixed** | `onTileClick` (`FuelLogKpiRow.tsx:42`); imbalanced + exceptions tiles filter the list, with a clearable chip (`FuelLogToolbar.tsx:261`) |
| **R2-7** | Audit ledger write non-fatal | ✅ **Fixed** | Fail-closed: pre-update snapshot, rollback on insert error, `500 CORRECTION_LEDGER_FAILED` (`fuel_controller.tsx:4546-4578`) |
| **R2-8** | RLS let clients forge audit rows | ✅ **Fixed** | New migration `…_fuel_entry_corrections_service_role_writes.sql` drops the INSERT policy; SELECT kept org-scoped |
| **R2-9** | Table clipped horizontally | ✅ **Fixed** | `overflow-x-auto` (`FuelLogTable.tsx:950`) + sticky header (`FuelTransactionsTable.tsx:182`) |
| **R2-10** | Client silently overrode server | ✅ **Addressed as advised** | Bridge retained by design, but now time-boxed in the JSDoc ("Remove after edge snapshot soak is trusted") and **every branch logs which source won and why** (`useFuelCycles.ts:66-100`). Documented in the spine doc |
| **R2-11** | Close-mode default contradicted doc | ✅ **Fixed correctly** | Resolved by making all three agree on `cumulative_98`: client (`fuelCycleEngine.ts:86`), server (`fuel_cycle_snapshot.ts:96`), doc (`fuel-brain-spine.md:8,30,59`). `rideshare` is now explicit opt-in |
| **R2-12** | Residuals | ✅ **Mostly fixed** | 2 type errors → **0**; currency now `defaultCurrency \|\| 'JMD'`; `bypassSignatureCheck: true` removed from `jaaFuelStatementMatcher.ts:365`; `FuelLogTable` 1,855 → **1,046** lines; sticky header added; exception assignments now persist |

**Score: 12 fixed · 0 partial · 0 outstanding.**

## Cumulative scorecard

| Dimension | R1 | R2 | **R3** | Note |
|---|:---:|:---:|:---:|---|
| Domain model / business logic | B+ | A− | **A** | Close mode aligned across client, server and doc |
| Architecture & separation | D | C | **A−** | God component split into 7 focused modules; server summary + snapshot spine live |
| Correctness of displayed numbers | D− | A− | **A** | All three number defects fixed; transaction paging closed the last false-positive path |
| Type safety | F | A− | **A** | 20 → 2 → **0** on this surface |
| Security / RBAC | D | A− | **A** | Gated both sides; audit ledger fail-closed and service-role-only |
| Scale & performance | D | B− | **A−** | Both fetches paged; O(n) integrity; pagination + sticky header |
| Accessibility | F | B+ | **A−** | Radix Dialog, sticky header, keyboard-reachable sort and filters |
| UX / information design | C− | C+ | **A−** | Clickable KPIs, filter chips, all 7 filters, cycle cross-nav, row selection, exception queue |
| Test coverage | F | B | **B+** | 1,229 passing; KPI≡list invariant enforced; still no RTL component tests |
| Observability | F | D+ | **B** | Cycle-source decisions logged; loading/error states; no product telemetry yet |

## What remains — 6 minor items, none blocking

| # | Item | Anchor | Why it's minor |
|---|---|---|---|
| 1 | **13 files are uncommitted** | working tree | Your verified work is not on a commit yet. Commit before it drifts. |
| 2 | `avgEfficiency` computed, never rendered | `fuelLogKpiMetrics.ts:186-196` | Last surviving dead field. Render it or delete it — one line either way. |
| 3 | `bypassSignatureCheck?: boolean` type field still declared | `packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts:28` | Vestigial: never set anywhere now. Delete the field so it cannot come back. |
| 4 | Exception assignments persist to `localStorage` only | `FuelLogTable.tsx:755-767` | Correct for a first pass, but an exception assigned by one manager is invisible to another and lost on browser reset. Server-side when the queue becomes a real workflow (Phase 5). |
| 5 | No React Testing Library component tests | — | 1,229 unit tests cover the logic well; nothing yet asserts that a click on the imbalanced tile actually filters the rendered table. |
| 6 | `FuelLogTable` 1,046 lines; `FuelTransactionsTable` 662 | — | Phase 3.5's "no file > 300" not fully met, but it is now a coordinator plus focused children rather than a god component. Diminishing returns. |

**None of these are bugs.** #1 is the only one worth doing today.

## Acceptance criteria — final

**Phase 0–1** ✅ all 8 met
- [x] Search changes rows and KPIs consistently — never zero while rows remain
- [x] Both tabs report the same canonical distance, with carried-in km disclosed
- [x] `tsc --noEmit` reports **0** errors in `FuelLogTable`, `fuelLogKpiMetrics`, `fuelCycleEngine`, `useFuelCycles`
- [x] `fleet_accountant` cannot invoke Delete or Recalculate
- [x] Loading, empty and error states are visually distinct
- [x] Logs tab shows a truncation banner
- [x] Every KPI card is clickable and applies a removable filter
- [x] Currency renders with separators and an explicit code

**Phase 2–3** ✅ 4 of 5 met
- [x] Editing a locked entry is rejected by the server without a correction reason
- [x] Every correction produces an immutable history row, visible in the detail sheet
- [x] `GET /fuel/cycles` is the production cycle source; client engine flag-gated and logged
- [x] A 10,000-row history pages without truncation (both entries and transactions)
- [ ] No file > 300 lines — `FuelLogTable` is 1,046 (item #6 above)

---
---

# ROUND 2 — VERIFICATION (superseded by Round 3 above)

---

# ⬛ ROUND 2 — VERIFICATION OF YOUR IMPLEMENTATION

> You asked whether everything was completed properly with no bugs or issues.
> **Short answer: the hard part is done and done well. It is not 100% complete.**
> All five Criticals are resolved. 4 items are partially done, 9 items were never wired up,
> and the work introduced 6 new dead modules. Details below, all independently verified.

## Verification method

| Check | Result |
|---|---|
| Full Fleet test suite (`npx vitest run`) | ✅ **203 files, 1,222 passed, 1 skipped, 0 failed** |
| New fuel suites (period totals, KPI, cycle engine, trust, UAT, hook) | ✅ **32 tests passing** |
| `tsc --noEmit` on `FuelLogTable.tsx` | ⚠️ **20 errors → 2 errors** |
| `tsc --noEmit` on `fuelLogKpiMetrics` / `fuelCycleEngine` / `useFuelCycles` | ✅ **0 errors** |
| Server enforcement path read end-to-end | ✅ verified in `fuel_controller.tsx` |
| Every new module checked for a real import | ⚠️ **6 of 11 are unreferenced** |

## Round 1 findings — final status

| ID | Finding | Status | Evidence |
|---|---|:---:|---|
| **F-C1** | Tabs contradict on distance | ✅ **Fixed** | `fuelPeriodTotals.ts` clips per cycle; both tabs disclose "N km before this period excluded" (`FuelLogTable.tsx:850-855`, `:890-893`); 7 tests |
| **F-C2** | Search zeroes KPI cards | ✅ **Fixed** | All filter args deleted from `TransactionKpiOptions` (`:42-46`) and `buildCycleKpis`; one search predicate at `:401-409` |
| **F-C3** | Immutability seal decorative | ✅ **Fixed** | Server strips `bypassSignatureCheck` (`fuel_controller.tsx:3992`), requires `fuel.edit_entry` + reason + real diff (`:4034-4053`), writes append-only row (`:4547`); migration `20260905120000` |
| **F-C4** | Delete ungated | ✅ **Fixed** | `fuel.delete_entry` (`:1343`); Recalculate gated on `data.backfill` + fleet-scope confirm (`:993`, `:590-596`) |
| **F-C5** | 20 type errors | ⚠️ **Partial** | 2 remain: `:679` and `:1283` |
| **F-H1** | Docs ≠ code; server cycles dead | ✅ **Fixed** | `useFuelCycles` fetches `GET /fuel/cycles`, env flag honoured, close policy wired (`fuelCycleEngine.ts:82-86`), doc updated — *see R2-10, R2-11* |
| **F-H2** | Recalculate no refetch | ✅ **Fixed** | Confirm dialog for fleet scope |
| **F-H3** | 1,500-row ceiling | ⚠️ **Partial** | Entries now paged via `getAllFuelEntriesInRange`; truncation banner on Logs tab (`:749`). **Transactions still `limit: 1500` unpaged** — *see R2-3* |
| **F-H4** | Cycle-engine gaps | ✅ **Fixed** | Regression double-count fixed; spillover preserved at chain origin; `isChainOrigin` marker; 40 L fallback removed |
| **F-H5** | Integrity for minority of rows | ✅ **Fixed** | All rows classified with explicit `'N/A'` (`:332-365`); `txBySourceId` index makes it O(n); deps corrected |
| **F-H6** | Inconsistent denominators | ✅ **Fixed** | `populationNote` shipped; imbalanced = Partial/Orphaned only |
| **F-H7** | Toolbar tab-blind | ⚠️ **Partial** | Recalculate now cycles-only. **Export still exports transactions on the Full Tanks tab** (`:945`) |
| **F-H8** | Weak export | ✅ **Fixed** | 15 columns, resolved names, currency, cycle id, audit score, locked, UTF-8 BOM |
| **F-M1** | 4 filters unreachable | ❌ **Not fixed** | Popover still only Vehicle + Entry Source (`:954`, `:959`) |
| **F-M2** | `Δ Fuel` mislabelled | ✅ **Fixed** | Now `Δ Odo` (`:1030`) |
| **F-M3** | Currency formatting | ✅ **Fixed** | `formatFuelMoney`, JMD |
| **F-M4** | No loading/error state | ✅ **Fixed** | `isLoading` / `loadError` props (`:129-130`, `:733`, `:760`) |
| **F-M5** | Dead code | ⚠️ **Mixed** | Round-1 items removed (`onVerifyLog`, `anchorFailures`, unused imports). **6 new dead modules added** — *see R2-1* |
| **F-M6** | Divergent page permission | ✅ **Fixed** | `pageRegistry.ts:30` now `nav.fuel_logs` |
| **A11y** | Hand-rolled modal | ✅ **Fixed** | Radix `Dialog` + `aria-describedby` (`:1612`) |

**Score: 14 fixed · 4 partial · 1 not fixed.**

## Round 2 — new findings

### 🔴 R2-1 · Six new modules were written but never imported

Verified by checking every new file for a real reference outside itself:

| Module | Lines | Referenced by |
|---|---:|---|
| `components/fuel/logs/FuelEntryDetailSheet.tsx` | 135 | **nothing** |
| `components/fuel/logs/FuelLogKpiRow.tsx` | 80 | **nothing** |
| `hooks/useFuelLogQuery.ts` | 77 | **nothing** |
| `utils/fuelAnomalyExplain.ts` | 38 | **nothing** |
| `utils/fuelScheduledExport.ts` | 31 | **nothing** |
| `utils/fuelMobileReview.ts` | 28 | **nothing** |

`FuelExceptionQueue` and `FuelEfficiencyTrend` **are** wired. The other six are not.

This matters beyond tidiness: the detail-sheet and URL-state features **were** delivered — but re-implemented inline inside `FuelLogTable.tsx` (Dialog at `:1612`, URL sync at `:214-245`) instead of using the extracted components. You now have **two implementations of the same view**, one of which is unreachable and will drift. That is the exact redundancy class the audit was written to remove.

**Action:** delete all six, or wire them and delete the inline duplicates. Do not leave both.

---

### 🔴 R2-2 · Correction history is written but can never be read by a user

The full chain exists — table, server write (`:4547`), `GET /fuel-entries/:id/corrections` (`:2653`), `fuelService.getFuelEntryCorrections` (`fuelService.ts:161`), `FuelEntryCorrection` type, and a rendering component.

**`getFuelEntryCorrections` has zero callers.** The inline detail dialog in `FuelLogTable.tsx` contains no correction UI (the component that does is the dead `FuelEntryDetailSheet`).

So corrections accumulate in an audit table that nothing in the product surfaces. Phase 2.3 is not delivered. This is the single highest-value remaining gap — it is the payoff for all of the F-C3 work.

---

### 🔴 R2-3 · Transactions are still unpaged, and that now creates *false* "Orphaned" rows

`FuelManagement.tsx:444` correctly switched entries to the paged `getAllFuelEntriesInRange`.
`FuelManagement.tsx:455` still does `api.getTransactions(…, { limit: 1500 })` with no paging.

Because F-H5 was fixed — integrity is now computed for **all** rows instead of a subset — a truncated transaction set makes `ledgerIntegrity` fall through to `'Orphaned'` (`:362`) for entries whose transactions simply were not loaded. Those roll straight into `imbalancedCount` and the red "N imbalanced" KPI.

**Net effect: the F-H5 fix made this failure mode worse, not better.** Page the transactions the same way, or mark integrity `'Unknown'` when the transaction window is truncated.

---

### 🟠 R2-4 · Column sorting is implemented but has no UI

`sortField` / `sortDir` state exists (`:165-166`) and is fully honoured in the sort comparator (`:411-420`). **`setSortField` and `setSortDir` are never called** — each appears exactly once, in its own `useState` declaration. No table header is clickable.

This is the same defect shape as Round 1's `activeFilterCount`: logic shipped, control missing.

---

### 🟠 R2-5 · `activeFilterCount` *still* never rendered

Round 1, F-M5. Still computed, still no badge on the Filters button. Combined with F-M1 (four filters with no popover control), a user can hold an active filter set they cannot see or clear.

---

### 🟠 R2-6 · KPI cards are still not clickable

Acceptance criterion *"Every KPI card is clickable and applies a visible, removable filter"* is unmet. `filterIntegrity` exists and works, and is even URL-addressable — but the only way to set it is by hand-editing the query string. `setFilterIntegrity` is called only from URL hydration (`:225`) and `clearFilters` (`:286`).

The "N imbalanced" number is still a dead end for anyone using a mouse.

---

### 🟠 R2-7 · The audit-ledger write is non-fatal

```ts
} catch (corrErr) {
  console.error("[FuelEntry] Correction ledger insert failed (non-fatal):", corrErr);
}
```
`fuel_controller.tsx:4556-4558` — the entry is persisted at `:4541` **before** the correction row is attempted, and a failed audit write only logs.

For an append-only audit ledger this is the wrong failure mode: a sealed row can be silently mutated with no corresponding audit record. Write the correction first (or in a transaction) and fail the request if it cannot be recorded.

---

### 🟠 R2-8 · `fuel_entry_corrections` accepts client-authored rows

The migration's RLS `INSERT` policy (`20260905120000…sql:36-43`) allows any `authenticated` user in the org to insert. `UPDATE`/`DELETE` are correctly denied by omission, so it is append-only — but an authenticated client can POST **fabricated** corrections directly through PostgREST, including for entries they never edited.

Audit ledgers should be service-role write only. Drop the insert policy; the edge function uses the service role and bypasses RLS anyway.

---

### 🟠 R2-9 · Table still clips horizontally

`:1017` is unchanged: `className="rounded-md border bg-white overflow-hidden"`. With 11 columns (now 12, with the new Cycle column) and no `overflow-x-auto`, narrow viewports still clip the rightmost columns rather than scrolling.

---

### 🟡 R2-10 · The client engine can still silently override the server

`pickFuelCyclesSource` (`useFuelCycles.ts:66-86`) returns the **client** result whenever `clientComplete > serverComplete`. So both engines still run on the Full Tanks tab, and the displayed number is decided by a disagreement heuristic rather than a contract.

The consequence is subtle and worth stating plainly: **a correct server-side fix that legitimately reports fewer completed tanks — for example one that properly applies `rideshare` close mode — will be silently discarded in favour of the client's 98% math.** The escape hatch outlives the bug it was built for.

The updated doc (`fuel-brain-spine.md:22-26`) says the client engine runs "only … when the server fetch fails" — which is now inaccurate. Same doc-drift class as F-H1, one layer down.

Defensible as a transitional bridge. Time-box it, log every override, and delete it once the server snapshot is trusted.

---

### 🟡 R2-11 · Legacy close mode defaults to `cumulative_98`, doc still says `rideshare`

`fuelCycleEngine.ts:82-86` — when a vehicle has no explicit `fuelSettings.cycleCloseMode`, the legacy path uses `'cumulative_98'`, deliberately ("keeps its historical 98% cumulative spine"). `fuel-brain-spine.md:42` still states the org-wide default is `rideshare`.

The wiring is real progress and the intent is documented in code. But the contract file and the code still disagree on the default. Pick one and make both say it.

---

### 🟡 R2-12 · Residual smaller items

| Item | Anchor |
|---|---|
| 2 type errors remain | `FuelLogTable.tsx:679` (`resolvePaymentLabel` default branch is `never`), `:1283` (`entry.odometer` possibly null) |
| `cycleKpis.totalDistance` / `.totalSpend` / `.avgEfficiency` computed, never rendered | `fuelLogKpiMetrics.ts:162-196` — cycles tab uses `trustedPeriodTotals` instead |
| `bypassSignatureCheck` still exists and is set `true` in shared code | `packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts:25,362` |
| Exception queue `onAssign` is a `toast.message` stub | `FuelLogTable.tsx:1583-1584` |
| Currency hardcoded `'JMD'` rather than org config | `FuelLogTable.tsx:607` |
| `FuelLogTable.tsx` grew 1,440 → **1,855** lines | Phase 3.5 ("no file > 300 lines") not started |
| No sticky table header | — |

---

## Updated scorecard

| Dimension | R1 | R2 | Note |
|---|:---:|:---:|---|
| Domain model / business logic | B+ | **A−** | Close policy wired; engine bugs fixed; period clipping is genuinely well designed |
| Architecture & separation | D | **C** | Server spine restored; god component still 1,855 lines with 6 orphaned modules |
| Correctness of displayed numbers | D− | **A−** | All three number defects fixed and tested; R2-3 is the one remaining risk |
| Type safety | F | **A−** | 20 → 2 errors |
| Security / RBAC | D | **A−** | Gated both sides; R2-8 is the residual |
| Scale & performance | D | **B−** | Paging + O(n) integrity; transactions still unpaged |
| Accessibility | F | **B+** | Real Radix Dialog; hover-only content and 8px type remain |
| UX / information design | C− | **C+** | Cycle cross-nav, disclosure, exception queue landed; KPIs/sort/filters still not clickable |
| Test coverage | F | **B** | +32 fuel tests incl. the KPI≡list invariant; still no component tests |
| Observability | F | **D+** | Error/loading states added; still no telemetry |

## What to do next, in order

1. **R2-2** — surface correction history. Everything else exists; this is one `useEffect` + render. Highest value per hour of any item on this list.
2. **R2-3** — page the transactions fetch. Prevents false "imbalanced" alarms in production.
3. **R2-1** — delete the six orphaned modules (or wire them and delete the inline duplicates).
4. **R2-4, R2-5, R2-6, F-M1** — one afternoon of wiring: clickable headers, filter badge, clickable KPIs, full Filters popover. All the logic already exists.
5. **R2-7, R2-8** — make the audit ledger fail-closed and service-role-only.
6. **R2-9** — one CSS class.
7. **R2-10, R2-11** — decide the cycle-source contract and make the doc match.

Items 1–6 are roughly two days. None require new architecture.

---
---

# ROUND 1 — ORIGINAL AUDIT (2026-09-05, baseline `94d9ebd8`)

> Retained in full for traceability. Statuses above supersede the severity labels below.

---

## 0. How to read this document

| Severity | Meaning |
|---|---|
| **C — Critical** | Wrong money/audit numbers shown to a user, or a control that does not control anything. Fix before this ships to a paying fleet. |
| **H — High** | Reproducible incorrect behaviour, security/RBAC hole, or a wall the product hits at real fleet scale. |
| **M — Medium** | Design debt, contract drift, dead code, or UX that will generate support tickets. |
| **L — Low** | Polish, consistency, hygiene. |

Every finding carries a `file:line` anchor and the evidence I verified. Where I could not verify runtime behaviour without running the app, I say so explicitly.

---

## 1. Executive summary

### Verdict

This section is **a well-intentioned prototype carrying enterprise-grade responsibilities.** The domain modelling underneath it (capacity-close cycles, spillover/SPLIT, three-lane card/cash separation, JAA statement isolation, audit-confidence scoring) is genuinely sophisticated — better than most fleet products. The **presentation and orchestration layer above it is not**, and it is actively corrupting the good work below it.

The core structural problem: **`FuelLogTable.tsx` is a 1,440-line component that is simultaneously the view, the filter engine, the KPI engine, the ledger-integrity engine, the anchor engine host, the CSV exporter, the detail modal, and a mutation trigger.** There is no container/presenter split, no data layer, no state machine, and no tests. Every defect below traces back to that one decision.

### The five things that matter most

1. **The two tabs contradict each other on screen, right now.** Your own screenshots show Transactions reporting **1,356 km** and Full Tanks reporting **1,413 km** for the identical week and vehicle. Both are labelled as distance. Neither is wrong by its own definition; the product never reconciles them. (§3.1, F-C1)
2. **Typing in the search box silently zeroes every KPI card.** The table filters rows by vehicle/driver *name*; the KPI builder re-filters by vehicle/driver *UUID*. Search "Roomy" → 4 rows visible, all four KPI cards read 0. This is a confirmed logic defect, not a theory. (F-C2)
3. **The "LOCKED & IMMUTABLE" seal is decorative.** `FuelLogModal` deletes `signature`, `signedAt`, `isLocked`, `lockedAt` before save and sends `bypassSignatureCheck: true`, which disables the server guardrail at `fuel_controller.tsx:3954`. Corrections are destructive overwrites with no append-only history. (F-C3)
4. **Delete is not permission-gated.** Edit checks `fuel.edit_entry`; Delete checks only the lock flag. `fuel.delete_entry` exists in the RBAC catalog and is deliberately withheld from `fleet_accountant` — who can nonetheless delete fuel logs from this screen. (F-C4)
5. **The documented architecture is not the shipped architecture.** `docs/fuel-brain-spine.md:48` states the client reads server cycle snapshots via `GET /fuel/cycles`, with the client engine as a flag-gated legacy fallback. In reality the client engine *always* runs, the server endpoint has **zero callers**, and the close-policy mirror (`fuelCycleClosePolicy.ts`) is never consulted — so every fleet gets `cumulative_98` semantics regardless of the documented `rideshare` default. (F-C5, F-H1)

### Health scorecard

| Dimension | Grade | One-line justification |
|---|:---:|---|
| Domain model / business logic | **B+** | Capacity-close, spillover, lane separation are thoughtfully specified. |
| Architecture & separation of concerns | **D** | One 1,440-line god component; no data layer; documented contract unimplemented. |
| Correctness of displayed numbers | **D−** | Tabs disagree; search zeroes KPIs; denominators inconsistent across cards. |
| Type safety | **F** | 20 type errors in this one file, including on the immutability seal. |
| Security / RBAC | **D** | Delete and Recalculate ungated; divergent page-permission declarations. |
| Scale & performance | **D** | Unpaginated 1,500-row ceiling, no virtualization, KPI memos that never hit. |
| Accessibility | **F** | Hand-rolled modal: no dialog role, no focus trap, no Escape. |
| UX / information design | **C−** | Dead-end KPIs, mislabelled columns, tab-blind toolbar, no drill-down. |
| Test coverage | **F** | Zero component tests on a financial-audit surface. |
| Observability | **F** | No telemetry, no error boundary, no loading state. |

---

## 2. System map (as-built)

```
                    apps/fleet/src/pages/FuelManagement.tsx
                                    │
       fuelService.getFuelEntries({ startDate, endDate, limit: 1500 })   ← NO PAGINATION
       api.getTransactions({ startDate, endDate, limit: 1500 })
                                    │
       window = fuelListWindow(activityMinDate … max(selectedEnd, currentWeekEnd))
                                  − 14d lookback          ← FUEL_LIST_LOOKBACK_DAYS
                                    │
                                    ▼
              ┌──────── FuelLogTable.tsx (1,440 lines) ────────┐
              │                                                │
              │  filteredEntries  ← plain .filter().sort()     │  ← NOT memoized (:232)
              │        │              (7 filters, 4 unreachable)│
              │        ├──► useFuelCycles ──► calculateFuelCycles()
              │        │        (client engine ALWAYS — doc says server)
              │        ├──► useFuelAnchors ──► validAnchorIds / anchorFailures(unused)
              │        ├──► ledgerIntegrity  (manual-entry rows only)
              │        ├──► prevOdometerMap  (per-vehicle Δ odo)
              │        ├──► buildTransactionKpis()  ← RE-FILTERS by UUID  ← divergence
              │        └──► buildCycleKpis()        ← RE-FILTERS by UUID  ← divergence
              │                                                │
              │  Tab A: <Table> 11 cols, all rows, no virtual  │
              │  Tab B: <Accordion> cycles + nested <Table>     │
              │  Overlay: hand-rolled modal (no a11y)          │
              └────────────────────────────────────────────────┘

  DEAD / ORPHANED
    api.getFuelCycles()                — 0 callers (server snapshot never read)
    utils/fuelCycleClosePolicy.ts      — 0 production callers (tests only)
    utils/slimFuelCycles.hydrate…()    — tests only
    useFuelCycles opts.legacyClient    — accepted, ignored
    VITE_FUEL_CYCLE_LEGACY_CLIENT      — referenced in docs, exists nowhere in code
    FLEET_PAGE_REGISTRY['fuel-logs'].permission — dead field, and divergent
```

### Ownership boundaries (what the code actually believes)

| Concern | Doc says owner | Actual owner | Drift |
|---|---|---|---|
| Cycle grouping | Server snapshot `GET /fuel/cycles` | `utils/fuelCycleEngine.ts` (client) | **Total** |
| Close policy | `fuel_cycle_close_policy.ts` (default `rideshare`) | `fuelAnchorLogic.classifyAnchor` @ 98% | **Total** |
| Cycle IDs | Server `stampEntryCycleMetadata` | Client mints `cycle_${id}_${i}` on fallback | Partial |
| Ledger integrity | (unspecified) | Inline `useMemo` in the view component | Unowned |
| KPI math | (unspecified) | Split across view + `fuelLogKpiMetrics.ts`, filters applied twice | Duplicated |

---

## 3. Critical findings

### 3.1 F-C1 — The two tabs report contradictory totals for the same period

**Evidence (your screenshots, Aug 24–30 2026, vehicle 5179KZ):**

| Card | Transactions tab | Full Tanks tab |
|---|---|---|
| Distance | **TOTAL KM 1,356** | **TOTAL DISTANCE 1,413 km** |
| Fuel | **TOTAL VOLUME 153.4 L** | **TOTAL FUEL 144 L** |
| Count | 9 fills | 4 cycles |

**Cause.** Two independent definitions, neither disclosed:

- `sumOdometerDeltasBetweenFills` (`fuelLogKpiMetrics.ts:84-120`) sums odometer deltas **strictly between fills that fall inside the selected window**. The first fill in the window has no in-window predecessor, so the leg that led into it is dropped.
- `buildCycleKpis` (`:213`) sums `cycle.distance`, and a cycle's `startOdometer` is the **previous cycle's closing anchor** — which frequently sits *before* the window (`useFuelCycles.ts:26-32` filters cycles by overlap *after* full-history tank math runs).

Volume diverges for a different reason: transaction volume uses `spendScope` (post-`countsInFuelLogSpend`, excluding awaiting/fee/declined rows at `fuelOpsEligibility.ts:10-18`), cycle volume uses `volumeContributed` after SPLIT capping plus `carryoverVolume`.

**Impact.** A fleet manager comparing tabs concludes the system is broken — and cannot tell which number to put in a report. Any efficiency figure derived by dividing across tabs (1,356 ÷ 153.4 = 8.84 vs 1,413 ÷ 144 = 9.81, an 11% spread) is unusable.

**Fix.** Both numbers are defensible; the product must pick one canonical *"distance attributed to this period"* definition, compute it once in a single `fuelPeriodTotals` module, and render the other only as a labelled secondary ("incl. 57 km carried in from prior cycle"). Never show two unqualified distance figures one tab apart.

---

### 3.2 F-C2 — Search silently zeroes every KPI card (confirmed defect)

**Anchors:** `FuelLogTable.tsx:259-264` (list filter) vs `fuelLogKpiMetrics.ts:148` and `:202` and `:92` (KPI filter).

The list filters on resolved **names**:
```ts
getVehicleName(entry.vehicleId).toLowerCase().includes(searchTerm) ||
getDriverName(entry.driverId).toLowerCase().includes(searchTerm) || ...
```
The KPI builder re-filters the *already-filtered* array on raw **IDs**:
```ts
matchesSearch([e.location, e.vendor, e.driverId, e.vehicleId].join(' '), searchTerm)   // :148
```
and on the Full Tanks tab, purely on the vehicle UUID:
```ts
if (!String(c.vehicleId).toLowerCase().includes(term)) return false;                    // :202
```

**Reproduction.** Full Tanks tab → type `Roomy` in Search. Four cycle rows remain rendered; **Total Cycles, Total Distance, Total Fuel and Exceptions all drop to 0.** Same class of failure on the Transactions tab when searching a driver name.

`sumOdometerDeltasBetweenFills` has the identical bug at `:92` — `matchesSearch(e.vehicleId || '', opts?.searchTerm)` — so Total KM independently collapses to 0.

**Root cause (architectural).** Filters are applied **twice** with **two different predicates**. The KPI builders receive `filteredEntries` / `filteredCycles` (already filtered) *and* the filter criteria, then re-apply them.

**Fix.** One filter predicate, one place. KPI builders should accept a pre-scoped collection and nothing else — delete every filter parameter from `TransactionKpiOptions` / `buildCycleKpis`.

---

### 3.3 F-C3 — The immutability seal is decorative; corrections are destructive

**Anchors:** `FuelLogModal.tsx:385-414`, `fuel_controller.tsx:3954`, `FuelLogTable.tsx:988-993`.

The audit tooltip renders a lock badge reading **"LOCKED & IMMUTABLE"**. The edit path does this:

```ts
bypassSignatureCheck: !!initialData,        // :387 — disables the server guardrail
...
if (initialData) {
    delete entry.signature;                 // :410
    delete entry.signedAt;                  // :411
    delete entry.isLocked;                  // :412
    delete entry.lockedAt;                  // :413
}
```

The server guardrail it defeats:
```ts
if ((entry.status === 'Finalized' || entry.isLocked) && !entry.bypassSignatureCheck) { … }
```

**Consequences, in order of seriousness:**

1. **No immutability.** Any user reaching the Edit action can rewrite a sealed, signed, finalized fuel entry. The lock is a display state, not a control.
2. **Silent confidence decay.** Stripping `signature` removes the SHA-256 component (25 pts, `FuelLogTable.tsx:983`) from the audit score on the next recompute. An admin correcting a typo silently downgrades the row's trust score with no indication.
3. **No audit trail.** The only record of a correction is `metadata.editReason` — a **single scalar, overwritten on every subsequent edit**. There is no `corrections[]`, no before/after snapshot, no actor, no timestamp chain. For a surface branded around cryptographic audit confidence, this is the central gap.

**Fix (this is the architectural one).** Fuel entries must become **append-only**. An edit writes a `fuel_entry_correction` row (actor, timestamp, field-level before/after, reason, re-sign) and supersedes rather than mutates. The row keeps its original signature; the correction carries its own. `bypassSignatureCheck` should be deleted from the client entirely — a client must never be able to ask a server to skip an integrity check.

---

### 3.4 F-C4 — Delete is not permission-gated

**Anchor:** `FuelLogTable.tsx:1019`

```tsx
<DropdownMenuItem onClick={() => onDelete(entry.id)} disabled={isLocked} …>
```

Compare the line directly above it (`:1014`), which correctly checks `!can('fuel.edit_entry')`.

`fuel.delete_entry` **exists** in the catalog (`packages/auth-client/src/permissions.ts:287`) and is deliberately excluded from `FLEET_ACCOUNTANT_PERMISSIONS` (`:386-406`, which grants only `fuel.view` + `fuel.export`). The withholding is intentional; the UI ignores it.

**Related, same class:** the **Recalculate** button (`:681-708`) has **no permission check at all**. It calls `api.recalculateAllIntegrity()` which rewrites integrity metadata across the entire fleet. A read-only accountant can trigger a fleet-wide mutation.

**Fix.** Gate delete on `fuel.delete_entry`, gate Recalculate on a new `fuel.recalculate` (or `data.backfill`), and add a server-side assertion — client gating is UX, not security.

---

### 3.5 F-C5 — 20 type errors in this file, several on safety-critical paths

`npx tsc --noEmit` (629 errors repo-wide; **20 in `FuelLogTable.tsx` alone**):

| Line | Error | Why it matters |
|---|---|---|
| 742, 1182-1183, 1376, 1392-1393 | `Property 'isLocked' \| 'status' does not exist on type 'FuelEntry'` | **The lock gate is untyped.** It works at runtime only because the server stamps `isLocked` (`fuel_posted_guarantee.ts:446`) — a field the client type does not know exists. Any refactor that trusts the type silently unlocks every finalized entry. |
| 810, 813, 958 | `Property 'signature' does not exist` | The audit "signed" indicator dot and the signature tooltip read a field absent from the type. |
| 263, 781, 1276 | `Property 'vendor' does not exist` | The Station column's primary fallback and the detail modal's station name. |
| 1363, 1369 | `Property 'notes' does not exist` | The detail modal's Notes block may never render. |
| 1264 | `Property 'fuelType' does not exist` | The "Fuel type" tile in the detail modal. |
| 357, 378 | `'dateRange' does not exist in type 'TransactionKpiOptions'` | **The period filter is passed as an excess property.** It works today only because the builder destructures a property its own type denies. A type-driven cleanup would delete it and silently un-scope every KPI to all-time. |
| 422 | `Property 'replace' does not exist on type 'never'` | `resolvePaymentLabel`'s default branch is provably unreachable — unknown payment types render nothing. |
| 959 | `'entry.odometer' is possibly 'null'` | Audit indicator dot. |
| 1099 | `types '"Manual" \| undefined' and '"Capacity"' have no overlap` | **Dead branch.** `cycle.trustTier === 'Capacity'` can never be true — the CAPACITY FULL badge reaches the screen only via the `'Soft'` / `resetType === 'Auto_Soft'` legs. |

**Fix.** `FuelEntry` is missing its persistence-layer fields (`isLocked`, `lockedAt`, `signature`, `signedAt`, `status`, `vendor`, `notes`, `fuelType`, `isVerified`). Add them, then fix the 20 errors — several will turn out to be real behavioural bugs, not annotations.

---

## 4. High-severity findings

### F-H1 — Documented architecture is not implemented; server cycle snapshots are dead

`docs/fuel-brain-spine.md:48` — *"Client `useFuelCycles` reads `GET /fuel/cycles`; fallback `fuelCycleEngine` only when `VITE_FUEL_CYCLE_LEGACY_CLIENT=1`."*

Reality (`hooks/useFuelCycles.ts:22-33`): the client engine runs unconditionally. `api.getFuelCycles` (`services/api.ts:623-637`) has **zero callers**. `VITE_FUEL_CYCLE_LEGACY_CLIENT` appears nowhere in the codebase. `opts.legacyClient` is declared, documented as *"Kept for callers; client engine is the Full Tanks source of truth"*, and ignored.

**Consequence 1 — close-policy violation.** The same doc (`:8`) lists *"Client-only 98% stacking unless org opts into `cumulative_98`"* under **Must not invent**, with `rideshare` (close at a single fill ≥ 90% tank) as the org-wide default. `fuelCycleEngine.ts:107` falls back to `classifyAnchor`, which is hard-wired to `CAPACITY_CLOSE_THRESHOLD = 0.98` (`fuelAnchorLogic.ts:11-12`). `utils/fuelCycleClosePolicy.ts` — the mirror built for exactly this — has **no production callers**. Every fleet therefore gets `cumulative_98` behaviour, and the Recalculate tooltip proudly announces "capacity full @ 98%".

**Consequence 2 — server and client can disagree.** The server stamps cycle metadata; the client re-derives cycles from that metadata plus its own fallback math. Two engines, one screen, no reconciliation check.

---

### F-H2 — Recalculate mutates the fleet, then asks the user to refresh

**Anchor:** `FuelLogTable.tsx:686-704`

```ts
toast.success(…, { description: `Re-scored ${…} entries … Refresh to see cycles.` });
```

The button fires a fleet-wide (or vehicle-scoped) mutation and then **does not refetch**. The user is told to refresh manually. The parent already exposes `refreshLogs` (`FuelManagement.tsx:550`) — it simply isn't threaded through.

Compounding: the scope is silently derived from `filterVehicle` (`:689`), a filter buried in a popover. Same button, same label, same tooltip — but "recalculate this vehicle" vs **"recalculate the entire fleet"** depending on invisible state. No confirmation dialog for the fleet-wide path.

---

### F-H3 — Hard 1,500-row ceiling with silent truncation on this tab

**Anchors:** `FuelManagement.tsx:437,442,448` · `:1355`

```ts
fuelService.getFuelEntries({ startDate, endDate, limit: 1500 })
setFuelDataTruncated(Array.isArray(logsData) && logsData.length >= 1500);
```

- No pagination. `fuelService.getAllFuelEntriesInRange` — a **paged** variant with a 60k ceiling — exists at `fuelService.ts:117` and is not used here.
- `fuelDataTruncated` is passed only to the **Reconciliation** component (`:1355`). The Logs tab never renders it.
- The fetch window starts at `activityMinDate` (`FuelManagement.tsx:153`), i.e. **the fleet's first-ever fuel record**. This grows without bound.

**Failure mode at scale.** A fleet crossing 1,500 lifetime fuel rows starts silently losing the *oldest* records — which is precisely where the cycle anchor chain begins. Every cycle boundary, every Δ Prev, and Total KM shift, with **no indication on screen**. Cycles depend on complete history in a way row lists do not; truncation here is not a display limit, it is a correctness limit.

---

### F-H4 — Cycle-engine correctness gaps

**Anchor:** `utils/fuelCycleEngine.ts`

1. **The first cycle in any window is always discarded.** `:215-220` — the first capacity-close with a valid odometer only *opens* the chain (`lastAnchorOdometer = entryOdo`) and emits nothing. Correct given no predecessor, but nothing tells the user a cycle was consumed as the origin.
2. **Odometer regression double-counts liters.** `:212-214` pushes the anchor entry into `currentCycleEntries`, then `:227-230` unconditionally re-stamps `lastAnchorOdometer` from that same entry. The fill's liters are counted in the *next* cycle while its odometer defines that cycle's *start* — inflating volume and deflating efficiency. This is a plausible driver of the **12.86 vs 6.86 km/L swing on the same vehicle in adjacent cycles** visible in your screenshot.
3. **Spillover is discarded at chain start.** `:219` sets `carryoverVolume = 0` on the opening anchor.
4. **The 40 L default is a silent guess.** `:37` `resolveTankCapacity(vehicle) || 40`. `resolveTankCapacity` deliberately returns `0` with the comment *"No silent 40 on server paths"* (`fuelAnchorLogic.ts:65`) — and the client immediately reinstates it. A vehicle with no configured tank capacity gets plausible-looking but fabricated cycles. Same fallback repeats at `FuelLogTable.tsx:872` and `:1037` and `:1207`.
5. **Anomaly criteria are tooltip-only.** `:1087-1088` shows *"Efficiency below target baseline"* (`efficiency < 8`) and *"Incomplete distance data"* as reasons — but neither participates in the `status` computation at `:151-158`. Your screenshot shows two cycles at 7.08 and 6.86 km/L with **Exceptions = 0** and a green CAPACITY FULL badge. The tooltip describes rules the engine does not enforce.

---

### F-H5 — Ledger integrity is computed for a minority of rows, and the KPI can't be trusted

**Anchor:** `FuelLogTable.tsx:272-295`

```ts
entries.forEach(entry => {
    if (!isManualEntry(entry)) return;      // :275 — everything else gets NO status
```

`isManualEntry` (`:204-216`) *also* excludes anything in `validAnchorIds` (`:205`). So the integrity map skips card transactions, most portal reimbursements, **and every valid capacity anchor.** `imbalancedCount` (`fuelLogKpiMetrics.ts:168-174`) counts only ids present in that map — meaning the "**6 imbalanced**" in your screenshot is 6 out of a *subset*, presented as 6 out of 9.

Additional problems on the same block:
- **Stale-closure risk.** `useMemo(..., [entries, transactions])` at `:295`, but the body calls `isManualEntry`, which closes over `validAnchorIds` and `getLinkedTransaction`. When anchors change without entries changing, integrity does not recompute.
- **O(n·m) scan.** `:286` runs `transactions.filter(...)` *inside* a loop over entries — 1,500 × 1,500 in the worst case, on every entries/transactions change. A prebuilt `Map<sourceId, tx[]>` makes this linear.
- **Dead end.** "6 imbalanced" is not clickable, is not a filter, and there is no view that lists the six. The user is told there is a problem and given no route to it.

---

### F-H6 — KPI cards use inconsistent denominators

| Card | Population |
|---|---|
| Total fills | **all** period entries, incl. fee/declined/awaiting rows (`fuelLogKpiMetrics.ts:177`) |
| Total spend | `spendScope` — fees/declines/awaiting **excluded** (`:163-164`) |
| Total volume | `spendScope` — same exclusions (`:165`) |
| Total km | **all** period entries again (`:166`) |
| Imbalanced | only manual-entry, non-anchor rows (§F-H5) |

Four cards, four different populations, one row of visual equals. Any cross-card arithmetic a user performs — spend ÷ fills, km ÷ volume — is wrong, and nothing on screen warns them.

---

### F-H7 — Toolbar is tab-blind

The search box, Export, Filters popover, period picker and Recalculate sit **above** the tab content and apply to whichever tab is not asking for them:

- **Export** (`:627`) always serialises `filteredEntries`. On the **Full Tanks** tab, clicking Export downloads *transaction rows*, filename `fuel_logs_*.csv`. There is no way to export a cycle.
- **Filters → Entry Source** has no effect on cycles (`filteredCycles`, `:337-350`, ignores `filterSource`).
- **Recalculate** is labelled "Recalculate Capacity Cycles" and is equally prominent on the Transactions tab, where it recalculates something the user cannot see.

---

### F-H8 — Export is materially weaker than the screen

**Anchor:** `types/csv-schemas.ts:8-19`

```
date, vehicleId, driverId, odometer, liters, amount, type, location, entryMode, paymentSource
```

Exports raw **UUIDs** for vehicle and driver — the two fields an accountant most needs as names. Omits: station verification status, audit confidence score and its five-part breakdown, entry source, Δ odometer, price/litre, cycle id, lock/seal state, notes, time-of-day. No currency column. No UTF-8 BOM (Excel will mangle non-ASCII station names).

For `fleet_accountant` — a role whose *entire* action set is `view` + `export` — this export is the product. It currently ships the least useful ten columns.

---

## 5. Medium-severity findings

### F-M1 — Four filters exist in state and are unreachable from the UI

`filterType`, `filterDriver`, `filterAnchor`, `filterStatus` are declared (`:129-133`), fully wired into `filteredEntries` (`:235-253`) and `filteredCycles` (`:340-342`) — and the Filters popover (`:638-657`) exposes **only Vehicle and Entry Source**. Anchor-validity and reconciliation-status filtering are implemented and invisible.

`activeFilterCount` (`:186-193`) is computed and **never rendered** — the Filters button carries no badge, so the user cannot tell filters are active. Combined with the popover omissions, a filter set outside the popover can never be discovered or cleared. `clearFilters` (`:195-202`) resets all six, including the four with no UI.

---

### F-M2 — `Δ Fuel` column is mislabelled

`:730` — header text `Δ Fuel`, `title` attribute *"Pump-to-pump odometer change only"*, content = odometer delta, page subtitle = *"Δ Prev shows change from last fill."* Three names, one column, none of them "fuel". Visible in both screenshots. Rename to **Δ Odo**.

---

### F-M3 — Currency and number formatting

- `:523` `${transactionKpis.totalSpend.toFixed(0)}` → renders **`$34997`** in your screenshot: no thousands separator, no locale, no currency code. Every other number on the page uses `toLocaleString()`.
- The fleet is plainly Jamaican (RUBIS Old Harbour Road, FESCO Beechwood, Jampet). A bare `$` on JMD amounts alongside USD-shaped figures is a genuine finance-UI hazard.
- Litres are `.toFixed(1)`, cost `.toFixed(2)`, price/L `.toFixed(3)` in cycles but `.toFixed(2)` in the detail modal (`:1131` vs `:1258`). No shared formatter module.

---

### F-M4 — No loading, error, or empty-state discipline

`FuelLogTable` receives no `isLoading` and no `error` prop. During the initial fetch it renders **"No transactions found"** (`:737`) — a false empty state indistinguishable from a genuinely empty week. There is no skeleton, no error boundary, and a failed fetch resolves to `[]` with only a toast (`FuelManagement.tsx:437-441`), so a network failure also renders as "no data".

`"No fuel cycles identified"` (`:1033`) offers no explanation and no next action — even though the likely causes (no capacity close yet, missing tank capacity, odometer gaps) are all knowable.

---

### F-M5 — Dead code inventory

| Item | Anchor | Status |
|---|---|---|
| `onVerifyLog` prop | `:108`, passed at `FuelManagement.tsx:1485` | Declared, wired, **never called** — `handleVerifyLog` (a full optimistic-update handler) is unreachable |
| `anchorFailures` | `:174` | Destructured, never used — the reasons an anchor was rejected are computed and thrown away |
| `activeFilterCount` | `:186` | Computed, never rendered |
| `cycleKpis.totalSpend` | `fuelLogKpiMetrics.ts:215` | Computed, never rendered — Full Tanks has no cost KPI |
| `cycleKpis.avgEfficiency` | `:220-231` | Liters-weighted average, computed, never rendered |
| `api.getFuelCycles` | `api.ts:623` | Zero callers |
| `fuelCycleClosePolicy.ts` | whole module | Zero production callers |
| `slimFuelCycles.hydrateFuelCyclesFromEntries` | `:60` | Tests only |
| `useFuelCycles` `legacyClient` | `useFuelCycles.ts:10` | Accepted, ignored |
| `FLEET_PAGE_REGISTRY['fuel-logs'].permission` | `pageRegistry.ts:30` | Dead field, **and wrong** (see F-M6) |
| Unused imports | `:48,50-53` | `projectId`, `publicAnonKey`, `FuelCard`, `FuelCycle`, `Calculator`, `Calendar`, `ArrowRight`, `ChevronRight` |
| `trustTier === 'Capacity'` | `:1099` | Provably unreachable branch |

---

### F-M6 — Divergent page-permission declarations

- `App.tsx:616` gates on `PAGE_PERMISSION_MAP[currentPage]` → **`nav.fuel_logs`** ✔ (matches `fleet_accountant`)
- `pageRegistry.ts:30` declares **`nav.fuel_overview`** ✘ (which `fleet_accountant` does **not** hold)

The registry field is currently unused, so there is no live bug — but it is a trap. Any future router that honours `FleetPageDef.permission` locks `fleet_accountant` out of the page the RBAC catalog explicitly grants them. Two declarations of the same truth, one of them wrong, neither authoritative.

---

### F-M7 — Nested Radix Tooltip providers

`components/ui/tooltip.tsx:22-28` — the `Tooltip` wrapper self-mounts a `TooltipProvider` on **every instance**. Each transaction row contains ~5 tooltips (station badge, volume bar, audit tile, and more). At 200 rows that is ~1,000 providers and ~1,000 portals. The explicit `<TooltipProvider>` at `:678` around Recalculate is redundant and nests a provider inside a provider.

---

### F-M8 — Highlight-on-navigate uses `sessionStorage` with an effect that leaks

`:141-162` — reads `fuel_logs_focus_entry` from `sessionStorage` inside a `useEffect` keyed on `[entries]`. The 8-second cleanup timer is only returned on the JSON-parse branch; the plain-id branch (`:155`) returns nothing, so its timer is never cleared on unmount. Because the effect re-runs on every `entries` change, and the key is deleted on first read, a re-render before the timeout can also drop the highlight early.

This is also a fragile cross-component contract — an untyped string key with two shapes (raw id, or `{date, vehicleId}` JSON) and no shared constant.

---

## 6. UX / UI critique

Read against your two screenshots.

### 6.1 The KPI row is a dead end

Four cards. None clickable. "6 imbalanced" — where are they? "5 portal · 4 admin · 0 anchors" — can I see just the admin ones? "Exceptions 0" — no affordance either way. Every number in an enterprise ops console should be a **filter**. Clicking "6 imbalanced" should apply that filter to the table below and show a removable chip.

**"0 anchors" is itself a red flag.** `sourceAnchors` counts `validAnchorIds` members in the period. Zero valid anchors alongside four completed Full Tank cycles means the anchor validator and the cycle engine disagree about what closed those cycles — worth investigating as a possible additional defect.

### 6.2 Information hierarchy inverts importance

The Transactions table gives equal visual weight to Date, Paid By, Station, Vehicle, Driver, Vol, Odo, Δ, Cost, Audit, Actions. But **Vehicle and Driver are identical on every visible row** — 100% redundant ink for a single-vehicle week. Meanwhile the two things that carry risk — the audit score and the odometer delta — are rendered in 10px type.

Recommended: a **grouped** presentation (by vehicle, then by day) with a sticky vehicle header, promoting exception state to a leading status rail and demoting constant columns into the group header.

### 6.3 Density and typography

`text-[8px]`, `text-[9px]`, `text-[10px]` appear ~60 times. 8px is below the readable floor on a standard 1080p monitor and fails WCAG in practice. The "Admin Entry" badge, the source labels, and the audit breakdown are all in this band. This reads as Figma-export density rather than a considered scale.

### 6.4 The Audit tile is clever but illegible

The 40×40 tile with a numeric score and three status dots (`:944-961`) encodes station-match / signature / odometer presence in three 4px dots with **no legend anywhere**. Your screenshot shows some rows with a shield and some with "95" — the difference (locked vs scored) is undiscoverable without hovering. A score chip with an explicit `95 · GPS ✓ Sig ✓ Odo ✓` micro-row would carry the same information without a hover dependency.

### 6.5 No sort, no pagination, no column control, no bulk actions

For an enterprise ledger table this is the shortest list of missing table primitives I can write:
- No column sorting (fixed newest-first, `:265-270`)
- No pagination or virtualization — every matching row renders
- No column show/hide, no width persistence, no density toggle
- No row selection → no bulk verify, bulk re-assign vehicle, bulk export-selected
- No saved views / filter presets
- No sticky header; the 11-column header scrolls away
- No URL state — filters, tab and period are lost on refresh and cannot be shared. A manager cannot send a colleague a link to what they are looking at.

### 6.6 Horizontal overflow is clipped, not scrolled

`:718` — `className="rounded-md border bg-white overflow-hidden"`. With 11 columns and no `overflow-x-auto`, narrow viewports **clip** the Audit and Actions columns rather than allowing a scroll. There is no responsive strategy for this table at all (no card-stack breakpoint, no priority-column collapse).

### 6.7 Full Tanks accordion has the same rigidity

`:1043` — `flex items-center gap-6` with six fixed-width blocks and no wrapping. Below roughly 1200px the status badge is pushed off. The row also omits the two things a manager wants at a glance: **cost** and **driver**.

### 6.8 The two tabs are not connected

A fill in Transactions cannot be traced to the cycle it belongs to. A cycle in Full Tanks cannot deep-link back to its constituent fills in the main table. `metadata.cycleId` exists and is used internally (`fuelCycleEngine.ts:180-183`) but is never surfaced. This is the single highest-value UX addition available: a `Cycle` column with a chip that cross-navigates.

### 6.9 Copy and terminology drift

- Tab says **"Full Tanks"**; the badge says **"CAPACITY FULL"**; the engine calls it a *capacity close*; the reset mode says **`Auto_Soft`** (exposed raw to the user at `:1134`); the docs say *soft anchor*. Five names for one concept, at least two of them leaked to the UI.
- **"Δ Fuel"** vs **"Δ Prev"** vs odometer delta (F-M2).
- `"+0 same odo"` (`:924`) is engineering shorthand in a customer-facing cell.
- Raw enum values reach the screen: `entry.type` in the detail modal (`:1314`, e.g. `Fuel_Manual_Entry`), `cycle.resetType` (`:1134`, e.g. `Auto_Soft`).

---

## 7. Accessibility

**Grade: F.** This surface would not pass a WCAG 2.1 AA review.

| Issue | Anchor | Detail |
|---|---|---|
| Hand-rolled modal | `:1218-1219` | A raw `<div className="fixed inset-0">`. No `role="dialog"`, no `aria-modal`, no `aria-labelledby`. |
| No focus trap | same | Tab moves focus to the page behind the overlay. |
| No Escape handler | same | Closes only on backdrop click or the X button. |
| No focus restore | same | Focus is lost on close; keyboard users are dumped at document start. |
| No scroll lock | same | The page scrolls behind the overlay. |
| Hover-only information | `:783-860`, `:942-996`, `:1069-1123` | Verification method, GPS offset, match confidence, audit breakdown, exception reasons and close semantics are **only** available on hover. Unreachable by touch, and only partly by keyboard. |
| 8px type | ~60 sites | Below any reasonable minimum. |
| Colour-only status | `:918-926`, `:944-950` | Green/amber/red for odometer delta and confidence bands. The `▲ ▼` glyphs help; the confidence tile is pure colour. |
| Non-semantic table decorations | `:879-890`, `:1054-1063` | Progress bars are unlabelled divs — no `role="progressbar"`, no `aria-valuenow`. |
| No live region | KPI row | Filter changes silently rewrite four numbers with no announcement. |
| Icon-only trigger | `:1003` | `MoreHorizontal` button has `title` but no `aria-label`. |

The project already uses Radix `Dialog` elsewhere — the detail overlay should simply be one.

---

## 8. Performance & scale

| Issue | Anchor | Impact |
|---|---|---|
| `filteredEntries` not memoized | `:232` | Full `.filter().sort()` over all entries on **every render**, including every search keystroke. |
| KPI memo never hits | `:353-374` | `filteredEntries` is a dependency and gets a new identity every render, so `buildTransactionKpis` — which itself re-filters and does per-vehicle sorting — runs on every render too. |
| O(n·m) ledger scan | `:286` | `transactions.filter()` inside an entries loop. |
| Full cycle recompute | `useFuelCycles.ts:24` | `calculateFuelCycles` re-groups, re-sorts and re-walks **all** entries for **all** vehicles whenever `entries` or `vehicles` change. `vehicles` is `useState<any[]>` in the parent — a new array on every load. |
| No virtualization | `:736-1029` | Every matching row mounts. At the 1,500-row ceiling that is ~1,500 rows × ~5 tooltip providers ≈ 7,500 portals. |
| ~5 Radix providers per row | `ui/tooltip.tsx:22` | See F-M7. |
| Unbounded fetch window | `FuelManagement.tsx:153` | Window starts at the fleet's first-ever fuel record and grows forever. |
| Two 1,500-row fetches per period change | `:436-446` | Entries + transactions, no cache, no `staleTime`. React Query is already in the file (`useQueryClient` at `:100`) but this path uses raw `useState` + `useEffect`. |

---

## 9. Testing & observability

**Component tests for this surface: zero.** `apps/fleet/src/components/fuel/` contains exactly one test file (`ScenarioEditor.test.ts`).

Unit coverage exists and is decent for the pure layers — `fuelCycleEngine.test.ts`, `fuelLogKpiMetrics.test.ts`, `fuelSpineGolden5179KZ.test.ts`, `fuelCycleClosePolicy.test.ts`, `slimFuelCycles.test.ts`. Note that two of those exercise modules with **no production callers** (F-M5) — the tests are passing on dead code, which inflates the apparent safety of the system.

Untested and load-bearing:
- Every filter predicate in `FuelLogTable`
- `prevOdometerMap` (`:300-335`) — the Δ Odo column
- `ledgerIntegrity` (`:272-295`)
- `isManualEntry` / `resolvePaymentLabel` / `resolveEntrySource` label resolution
- `fuelEntrySortMs` (`:75-100`) — three date formats, silent `0` fallback
- The KPI ↔ list agreement invariant (which would have caught F-C2 on day one)

**Observability:** no telemetry on filter use, export, recalculate or delete; no error boundary; failures reduce to `console.error` + a toast. There is no way to know from production whether users ever open Full Tanks.

---

## 10. Proposed target architecture

### 10.1 Principle

> **The client renders cycles. It does not compute them.**

Tank-cycle math is accounting. It belongs on the server, computed once, versioned, auditable, and identical for every reader — the UI, the weekly finalize, the exports, and the analytics dashboards. Today four different consumers can derive four different answers.

### 10.2 Layering

```
┌─ Server ────────────────────────────────────────────────────────┐
│  fuel_cycle_stamp.ts        canonical cycleId, one write path   │
│  fuel_cycle_close_policy.ts rideshare | cumulative_98 per org   │
│  fuel_cycle_snapshot.ts     materialized cycles + totals        │
│  GET /fuel/cycles           SlimFuelCycle[] + period totals     │
│  GET /fuel/log-summary      KPI aggregates, server-computed     │  ← NEW
│  GET /fuel/entries          keyset-paginated, filter+sort       │  ← EXTEND
└─────────────────────────────────────────────────────────────────┘
                                  │
┌─ Data layer (React Query) ──────▼──────────────────────────────┐
│  useFuelLogEntries(params)   paginated, cached, keyed on params│
│  useFuelCycleSnapshots(params)                                 │
│  useFuelLogSummary(params)   KPIs — server truth, never local  │
│  All keyed on ONE FuelLogQuery object ⇒ list and KPIs cannot   │
│  diverge, because they are the same query.                     │
└────────────────────────────────────────────────────────────────┘
                                  │
┌─ Domain (pure, shared, tested) ─▼──────────────────────────────┐
│  packages/fuel-core/  ← already exists; move logic HERE        │
│    · formatters (currency, volume, distance, dates)            │
│    · labels (payment source, entry source, cycle status)       │
│    · integrity classifier                                      │
└────────────────────────────────────────────────────────────────┘
                                  │
┌─ Presentation ──────────────────▼──────────────────────────────┐
│  FuelLogPage            URL state ⇄ FuelLogQuery                │
│   ├─ FuelLogToolbar     per-tab config, filter chips            │
│   ├─ FuelLogKpiRow      clickable → mutates FuelLogQuery        │
│   ├─ TransactionsTab → DataTable (virtualized, sortable)        │
│   ├─ FullTanksTab    → CycleList (virtualized)                  │
│   └─ FuelEntryDetailSheet (Radix Dialog/Sheet)                  │
└────────────────────────────────────────────────────────────────┘
```

### 10.3 The five invariants to encode as tests

1. **KPI ≡ list.** For any `FuelLogQuery`, the KPI card population equals the rendered row population. *(kills F-C2, F-H6)*
2. **One filter predicate.** A filter is expressed exactly once. If the KPI builder accepts filter arguments, the design is wrong.
3. **One distance definition per period,** shared by both tabs; any second figure must be explicitly labelled as a different measure. *(kills F-C1)*
4. **Entries are append-only.** No UI path mutates a signed or locked row; corrections supersede. *(kills F-C3)*
5. **Every mutation is permission-gated on both client and server.** *(kills F-C4)*

### 10.4 State: URL as the source of truth

```ts
type FuelLogQuery = {
  tab: 'transactions' | 'cycles';
  period: { start: string; end: string };
  vehicleId?: string; driverId?: string;
  source?: FuelEntrySource; status?: ReconciliationStatus;
  anchor?: 'valid' | 'invalid'; integrity?: 'imbalanced';
  q?: string;
  sort: { field: string; dir: 'asc' | 'desc' };
  page: { cursor?: string; size: number };
};
```
Serialized to the query string. Delivers shareable links, back-button support, refresh survival, and — because both the list and the summary hooks key off the same object — makes F-C2 structurally impossible to reintroduce.

---

## 11. Phased implementation plan

Ordered so that each phase is independently shippable and each one leaves the system better than it found it.

### Phase 0 — Stop the bleeding *(≈1 day, no architecture change)*

| # | Task | Fixes |
|---|---|---|
| 0.1 | Delete every filter argument from `buildTransactionKpis` / `buildCycleKpis`; they receive pre-filtered collections only | **F-C2** |
| 0.2 | Gate Delete on `fuel.delete_entry`; gate Recalculate on `fuel.recalculate` + add a fleet-scope confirm dialog | **F-C4**, F-H2 |
| 0.3 | Add missing fields to `FuelEntry` (`isLocked`, `lockedAt`, `signature`, `signedAt`, `status`, `vendor`, `notes`, `fuelType`, `isVerified`); fix the resulting 20 errors | **F-C5** |
| 0.4 | Wrap `filteredEntries` in `useMemo`; add `validAnchorIds` to the `ledgerIntegrity` deps; prebuild the transaction index | F-H5, perf |
| 0.5 | Rename `Δ Fuel` → `Δ Odo`; format currency via a shared `formatMoney(amount, currency)` | F-M2, F-M3 |
| 0.6 | Surface `dataTruncated` on the Logs tab as a blocking banner | F-H3 |
| 0.7 | Pass `isLoading` / `error`; render a skeleton and a distinct error state | F-M4 |
| 0.8 | Delete the dead-code inventory in F-M5; align `pageRegistry` to `nav.fuel_logs` | F-M5, F-M6 |

### Phase 1 — Correctness *(≈3–4 days)*

| # | Task | Fixes |
|---|---|---|
| 1.1 | Pick and implement one canonical period-distance definition; label any secondary figure | **F-C1** |
| 1.2 | Normalize KPI populations; add a "counting rules" info popover to the KPI row | F-H6 |
| 1.3 | Fix the odometer-regression double-count; stop discarding spillover at chain start; surface a "chain origin" marker for the consumed first cycle | F-H4.1-3 |
| 1.4 | Remove the silent `\|\| 40` tank fallback; render "Tank capacity not configured" and exclude the vehicle from cycle math | F-H4.4 |
| 1.5 | Move the tooltip's anomaly criteria into the actual `status` computation, or delete them from the tooltip | F-H4.5 |
| 1.6 | Compute integrity for **all** rows, with an explicit `Not applicable` state; make "N imbalanced" a filter | F-H5 |
| 1.7 | Add the KPI ≡ list invariant test and a golden-dataset cycle test | §10.3 |

### Phase 2 — Integrity & governance *(≈1 week)*

| # | Task | Fixes |
|---|---|---|
| 2.1 | Append-only corrections: `fuel_entry_correction` table, field-level before/after, actor, reason, re-sign | **F-C3** |
| 2.2 | Delete `bypassSignatureCheck` from the client; server-enforce the seal unconditionally | **F-C3** |
| 2.3 | "Correction history" panel in the detail sheet | F-C3 |
| 2.4 | Server-side permission assertions on delete / recalculate / edit | F-C4 |
| 2.5 | Audit-log every mutation from this surface | observability |

### Phase 3 — Architecture *(≈2 weeks)*

| # | Task | Fixes |
|---|---|---|
| 3.1 | Implement `GET /fuel/log-summary`; move KPI math server-side | F-H6, scale |
| 3.2 | Wire `useFuelCycles` to `GET /fuel/cycles`; client engine behind `VITE_FUEL_CYCLE_LEGACY_CLIENT` **as documented** | **F-H1** |
| 3.3 | Honour `fuelCycleClosePolicy` — or delete it and correct the doc | **F-H1** |
| 3.4 | Keyset pagination + server-side filter/sort on `/fuel/entries`; retire the 1,500 ceiling | **F-H3** |
| 3.5 | Split `FuelLogTable.tsx` per §10.2 (target: no file > 300 lines) | structural |
| 3.6 | `FuelLogQuery` in the URL | F-M1, UX |
| 3.7 | Virtualize both lists | perf |

### Phase 4 — Enterprise UX *(≈2 weeks)*

| # | Task |
|---|---|
| 4.1 | Full `DataTable`: sort, column visibility + persistence, density, sticky header, `overflow-x-auto`, responsive card-stack |
| 4.2 | Clickable KPI cards → filter chips |
| 4.3 | Complete Filters panel (all 7 filters) + active-count badge + saved views |
| 4.4 | Row selection → bulk verify / re-assign / export-selected |
| 4.5 | Cycle ↔ transaction cross-navigation via `metadata.cycleId` |
| 4.6 | Replace the overlay with Radix `Dialog`/`Sheet`; move hover-only content into the sheet |
| 4.7 | Per-tab export with full column set, resolved names, currency, UTF-8 BOM; async job for large exports |
| 4.8 | Typography floor of 11px; audit-tile legend; colour + glyph for every status |
| 4.9 | Terminology pass — one name per concept; no raw enums on screen |

### Phase 5 — Differentiation *(backlog)*

- **Exception queue** as a first-class view (odo regressions, unverified stations, imbalanced ledger, efficiency outliers) with assignment and resolution workflow.
- **Efficiency trend** sparkline per vehicle with statistical outlier detection — the 6.86 vs 12.86 km/L swing should raise itself.
- **Anomaly explanations** — "this cycle is 47% below this vehicle's 90-day median" instead of a bare badge.
- **Scheduled exports** to an accountant's inbox.
- **Mobile-responsive** review flow for approvals on the road.

---

## 12. Acceptance criteria

Phase 0–1 are complete when:

- [ ] Typing in Search changes row count and KPI values **consistently** — never to zero while rows remain.
- [ ] Transactions and Full Tanks report the same canonical distance for the same period, or the difference is labelled on screen.
- [ ] `npx tsc --noEmit` reports **0** errors in `FuelLogTable.tsx`, `fuelLogKpiMetrics.ts`, `fuelCycleEngine.ts`, `useFuelCycles.ts`.
- [ ] A `fleet_accountant` session cannot see or invoke Delete or Recalculate.
- [ ] Loading, empty and error states are visually distinct.
- [ ] The Logs tab shows a truncation banner when the row cap is hit.
- [ ] Every KPI card is clickable and applies a visible, removable filter.
- [ ] Currency renders with locale separators and an explicit code.

Phase 2–3 are complete when:

- [ ] Editing a locked entry is impossible from the UI **and** rejected by the server.
- [ ] Every correction produces an immutable history row visible in the detail sheet.
- [ ] `GET /fuel/cycles` is the production cycle source; the client engine is flag-gated.
- [ ] A 10,000-row fuel history renders and paginates without truncation.
- [ ] No file in the fuel-logs surface exceeds 300 lines.

---

## 13. Appendix — file inventory

| File | Lines | Role | Verdict |
|---|---:|---|---|
| `components/fuel/FuelLogTable.tsx` | 1,440 | Everything | **Split** |
| `pages/FuelManagement.tsx` | 1,682 | Data + 5 tabs | **Split** — extract the logs container |
| `utils/fuelCycleEngine.ts` | 274 | Client cycle math | Should be server-side (F-H1); fix F-H4 meanwhile |
| `utils/fuelLogKpiMetrics.ts` | 254 | KPI builders | Strip filter args (F-C2); move server-side |
| `utils/fuelAnchorLogic.ts` | 147 | Capacity classify | Sound; must consult close policy |
| `utils/fuelCycleClosePolicy.ts` | ~40 | Close-mode helper | **Dead** — wire it or delete it |
| `hooks/useFuelCycles.ts` | 34 | Cycle hook | Rewrite against the server endpoint |
| `hooks/useFuelAnchors.ts` | 91 | Anchor validation | Sound; `anchorFailures` should surface in the UI |
| `utils/fuelEntrySource.ts` | 94 | Authorship resolution | Good — well-commented, correctly separates authorship from payment |
| `utils/fuelOpsEligibility.ts` | 38 | Spend eligibility | Good |
| `utils/fuelLedgerIntegrity.ts` | 16 | Gas-card integrity | Good |
| `components/fuel/FuelLogModal.tsx` | 977 | Create/edit | **Seal-stripping must go** (F-C3) |
| `services/api.ts` | — | `getFuelCycles` | Dead — wire it |
| `types/fuel.ts` | 458 | Types | Missing persistence fields (F-C5) |
| `types/csv-schemas.ts` | — | Export columns | Insufficient (F-H8) |
| `docs/fuel-brain-spine.md` | 60 | Contract | Describes an unimplemented system |

---

## 14. Closing note

The instinct behind this feature is right. Capacity-close cycles with spillover, three-lane ledger separation, and a weighted audit-confidence score are not things most fleet products attempt — and the domain modules that implement them (`fuelAnchorLogic`, `fuelEntrySource`, `fuelOpsEligibility`) are clean, commented and correct.

What is missing is **discipline at the boundaries**: one place where a filter is defined, one place where a total is computed, one owner for cycle math, one contract between the doc and the code, and one gate on every mutation. Phase 0 and Phase 1 buy back most of the credibility for about a week of work. Phase 3 is what turns it into a system you can put in front of an enterprise buyer.

*Round 1 audit performed against the working tree at `main` (`94d9ebd8`). No files were modified.*

---

## 15. Round 2 closing note

You cleared every Critical. That is the part that was genuinely hard, and the quality is high — `fuelPeriodTotals.ts` is a properly reasoned piece of accounting code, the correction ledger is designed correctly end-to-end, and stripping `bypassSignatureCheck` server-side rather than trusting the client is exactly the right instinct. 1,222 tests pass and the type errors on the safety-critical paths are gone.

The gap that remains has one shape, and it is worth naming because it repeats: **logic shipped without its control surface.** Sorting works but no header is clickable. Integrity filtering works but no KPI is clickable. The filter count is computed but never drawn. The correction ledger is written but never displayed. Six modules were built and never imported. In each case the difficult half is done and the last 5% — the wire — is missing.

Two consequences follow. First, a reviewer reading the code concludes these features exist; a user clicking the screen finds they do not. Second, R2-3 shows how this bites: fixing F-H5 properly made a *different* unfixed item (unpaged transactions) produce visibly wrong output. Half-wired changes interact.

None of it is architectural, and none of it is more than about two days. Finish the wires before starting Phase 4.

*Round 2 verification performed against `1f5a774b`. No files were modified.*

---

## 16. Round 3 closing note

**This is done.** Three rounds in, the surface I described as "a well-intentioned prototype carrying enterprise-grade responsibilities" is now a defensible enterprise module.

The Round 2 note called out a repeating pattern — *logic shipped without its control surface*. That pattern is gone. Every orphaned module is wired, every computed value has a control or a render, and the two places where a judgment call was genuinely required were handled the way an experienced engineer handles them rather than by picking whichever was easier:

- **R2-10** — you kept the client-override bridge, which was the right call, but made it honest: time-boxed in the docstring with a stated removal condition, and every branch logs which engine won and why. A bridge you can see is a bridge you can retire.
- **R2-11** — rather than bending the code to the doc or quietly leaving them apart, you picked `cumulative_98` and moved the client, the server snapshot and the contract doc onto it together. That is the harder fix and the correct one.

Two things are worth saying plainly about what this now buys you. The audit trail is real: a sealed entry cannot be edited without a reason, the reason is recorded append-only, the write fails closed with a rollback if the ledger insert fails, and the history is visible to the person doing the correcting. That is a defensible chain for an auditor. And the numbers reconcile: both tabs derive distance from one clipped definition, KPIs and rows cannot disagree by construction, and both fetches page rather than silently truncating.

The six remaining items are housekeeping. Commit your work — that is the only one worth doing today.

*Round 3 verification performed against `d4fcd90f` plus 13 uncommitted files. No files were modified.*
