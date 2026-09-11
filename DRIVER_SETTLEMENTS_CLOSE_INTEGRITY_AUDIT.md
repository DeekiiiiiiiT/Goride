# Driver Settlements — Close Integrity Audit

| Pass | Date | Mode | Result |
|---|---|---|---|
| 1 — audit | 2026-09-11 | audit only | 4 Critical · 6 High · 4 Medium · 5 Perf · 5 UX |
| 2 — implementation | 2026-09-11 | owner implemented | Phases 0–6 |
| 3 — verification | 2026-09-11 | audit only | ✅ All 4 Criticals + all 6 High closed. 2 new gaps in the custody carry |
| 4 — implementation | 2026-09-11 | owner implemented | N-1, N-2, M-3, M-4 |
| 5 — verification | 2026-09-11 | audit only | ✅ 26 of 26 closed. 1 new ordering flaw (N-3) |
| 6 — implementation | 2026-09-11 | owner implemented | N-3 |
| **7 — verification** | **2026-09-11** | **audit only** | **✅ AUDIT CLOSED — 27 of 27. One minor perf note (P-6) — §0.00** |
| **8 — polish** | **2026-09-11** | **owner implemented** | **P-6 ranged custody target + checklist close-out — §0.00a** |

**Trigger:** *"I really need to be able to ensure when I close a week/period, then it does it to perfection."*

**Scope:** The Driver Settlements desk and everything that decides whether a week is closed correctly — the close engine, the seal/statement pipeline, the period projection, the freeze, and every path that can write to a week after it closes.

**Baseline:** commit `b74d755e`, one uncommitted 3-line change in `CloseWeekPage.tsx`.
**Test state at audit:** 169 finance-core tests passing.

**Relationship to prior audits:** `DRIVER_SETTLEMENT_WEEK_RECONCILIATION_AUDIT.md` closed on 2026-09-09 after 7 passes. Since then `week_close.ts` grew **+773 lines** and four new modules appeared (`week_close_force_opts.ts`, `heal_week_close_sync.ts`, `toll_close_amounts.ts`, `week_statements_guard.ts`). **This audit covers that new surface and is not a re-run of the closed one.** Findings there are not repeated unless they regressed.

---

## 0.00 Pass 7 — verification · **AUDIT CLOSED**

**Method:** N-3 re-checked against the working tree. Executed: **189 finance-core tests** (169 → 175 → 184 → 189), `assert-ledger-view-invoker` (478 migrations / 17 wrapper views), `verify_service_line_filter_parity` (9 fixtures) — all green.

### Verdict — the guarantee holds on the happy path *and* the failure path

**All 27 findings are closed.** N-3 is fixed the right way, and the fix goes past what I specified in two respects:

| ID | Item | Status | Evidence |
|---|---|---|---|
| **N-3** | `CUSTODY_NO_OPEN_TARGET` raised after the freeze commits | ✅ **Closed** | Preflight `custodyNoOpenTargetHeld:265` → `custodyNoOpenTargetBlocker:283` pushed as `severity:"block"` inside the **pooled verification** (`:1962`) and the preview (`:1260`). A driver with nowhere to park custody never reaches `freezeBatch`, so the freeze RPC never runs. |

**Two things done better than asked:**

1. **The preflight fails closed.** If the preflight itself throws (a DB hiccup during the 52-week walk), the catch pushes a `NO_OPEN_TARGET` **block** rather than letting the close proceed (`:1971-1975`). An unknown custody position is treated as an unsafe one — the correct default for an irreversible step.
2. **The recovery path is derived from the database, not from memory.** `runCustodyCarryForWeek:304` rebuilds the carry batch by scanning **already-frozen** period rows for residual custody, rather than reusing the in-memory `freezeBatch`. That is what makes it able to *heal* — it picks up custody stranded by any earlier failure, not just the one in the current request. It is wired into `closeWeek` (`:2167`) **and** `retryFreezeWeek` (`:2339`, `:2398`), so the belt-and-braces recovery I suggested exists on both paths.

Plus `scripts/inventory-stranded-custody.sql` — a detection query for custody already stranded by the N-3 window before it was closed. That is the operational half I didn't ask for.

### The guarantee checklist — final

| # | Guarantee | Pass 1 | Now |
|---|---|---|---|
| 1–5 | Lanes tie · P&L tie · named blockers · no partial state · money frozen | ✅ | ✅ |
| 6 | Sealed numbers cannot change after close | ❌ | ✅ |
| 7 | Close hash survives normal operation | ❌ | ✅ |
| 8 | Obligations outliving the week carry forward | ❌ | ✅ |
| 9 | Two closes cannot race | ❌ | ✅ |
| 10 | What you preview is what you close | ⚠️ | ✅ |
| 11 | Late data for a closed week is detected | ⚠️ | ✅ |
| 12 | Reopen is safe and auditable | ⚠️ | ✅ |
| 13 | A failed close leaves nothing stranded | ❌ | ✅ **N-3** |

**Thirteen of thirteen.** You asked whether closing a week could be made to work *to perfection*. On the evidence in the code: **yes, and it now does.**

### P-6 · 🟢 One minor perf note — not a defect

**File:** `week_close.ts:109-137`

`findFirstOpenCustodyTarget` probes candidate weeks with **one `maybeSingle()` query per week**, sequentially, up to the 52-week horizon. It is now called up to three times per driver-with-custody: preview preflight (`:1260`), close preflight (`:1962`), and the carry itself (`:171`).

- **Typical case: 3 queries.** The next week usually exists and is open, so the loop returns on its first probe.
- **Worst case: ~156 sequential queries** for one driver — when every following week is frozen.

The expensive path is the one that then *blocks the close*, which is the least harmful place for it, and correctness is unaffected. Two easy improvements when convenient:

1. Replace the walk with one ranged query — `.gt("period_anchor", week).order("period_anchor").limit(52)` — and scan in memory.
2. Have the carry reuse the target the preflight already resolved, instead of recomputing it.

---

## 0.00a Pass 8 — P-6 polish · checklist close-out

**Shipped:** `findFirstOpenCustodyTarget` now loads one ranged query (`.gt` / `.lte` / `order` / `limit 52`) and walks Mondays in memory via `pickFirstOpenCustodyTargetFromMap` (stub semantics unchanged). Close preflight stashes `resolvedCustodyTarget`; carry reuses it. `console.info("[week_close] close_phase_timing", …)` logs verify / freeze / carry ms for future scale evidence.

**Ops (Pass 6 already run — checklist truth-up):** stranded custody **0**; closed-week hashes **9** column seals / **22** legacy closed without seal (not projection-bricked). No destructive hash repair on the 22.

**50-driver under 10s:** **deferred until fleet ≥ 50 drivers** — phase timings now emit on every close; no fake scale run.

---

## 0.0 Pass 5 — verification *(historical)*

**Method:** every Pass-3 open finding re-checked against the working tree. Executed: **184 finance-core tests** (up from 175), `assert-ledger-view-invoker` (478 migrations / 17 wrapper views), `verify_service_line_filter_parity` (9 fixtures) — all green.

### Verdict — the close is now correct, durable, and recoverable

**All 26 findings from this audit are closed.** Both custody gaps are fixed properly, and two of the four went past what I specified:

| ID | Item | Status | Evidence |
|---|---|---|---|
| **N-1** | Reopen doesn't reverse custody carry | ✅ **Closed** | `reverseCustodyCarryOnReopen:255` pulls the carry back, clears the marks, rebuilds the successor — and **pre-validates every driver before mutating any** (`:2370-2393`), so a reopen cannot half-apply. Refuses with `REOPEN_CUSTODY_SUCCESSOR_FROZEN` when the successor is itself closed, rather than silently double-counting. |
| **N-2** | Custody write bypasses the C-1 guard | ✅ **Closed** | `findFirstOpenCustodyTarget:105` walks forward skipping frozen weeks (52-week horizon) instead of assuming `+7`; all writes go through `persistPeriodRowWithVersion`; source mark uses `allowFrozen: true` where `stripCloseSealFields` protects the seal. |
| **M-3** | `closeWeekStatements` throws mid-loop | ✅ **Closed** | Now a single batched `.in("id", ids).eq("status","draft")` update (`week_statements.ts:241-251`) — a driver's lanes can no longer end up mixed draft/closed. |
| **M-4** | Restatement bypasses desk-clear gate | ✅ **Closed — beyond spec** | I asked you to *document* it. You **removed** it: `closeInvariants.ts:595-596` voids the flag, so `SETTLEMENT_FLEET_OWES` / `SETTLEMENT_DRIVER_OWES` now run on restatement re-sign too. Recorded in `docs/CLOSE_VOCABULARY.md`. |

Two details worth calling out as good judgement:

- **The N-2 idempotency guard was made self-healing.** Rather than skipping whenever `custodyTransferredTo` exists, it now verifies the successor *actually holds* the opening custody and falls through to heal if not (`:161-174`). A stale mark from a failed write can no longer orphan cash — a failure mode I hadn't flagged.
- **`docs/CLOSE_VOCABULARY.md`** now carries the error-code contracts (`CUSTODY_NO_OPEN_TARGET`, `REOPEN_CUSTODY_SUCCESSOR_FROZEN`) so clients and future passes have a stable reference.

**One new finding (N-3), and it is the same shape as the one reopen already solves.**

### N-3 · 🟠 `CUSTODY_NO_OPEN_TARGET` is raised *after* the freeze commits — with no recovery path

**File:** `week_close.ts:1965-1986`

The close sequence is:

```
1. freeze_settlement_periods_batch(...)      ← atomic, COMMITS
2. carryForwardCashCustodyAfterFreeze(...)   ← per-driver, CAN THROW
3. throw WeekCloseError(CUSTODY_NO_OPEN_TARGET, …, 409)
```

Step 2 runs only inside `if (freezeBatch.length > 0)`, i.e. **after the week is already frozen**. When it throws, the state left behind is:

- the week **is** closed and frozen — the RPC committed
- some drivers' custody carried, the throwing driver's did not
- the operator receives a **409** and reasonably concludes the close failed

And there is no way back. Re-running Close skips every frozen driver (`if (frozen && !pendingDrafts) continue`), so `freezeBatch` is empty, so `carryForwardCashCustodyAfterFreeze` — which is called from **exactly one place** — never runs again. `retryFreezeWeek` does not carry custody either. **The stranded custody is unreachable without a manual reopen**, which is precisely the orphaned-obligation failure C-2 was created to eliminate.

**How likely?** Low but not negligible. `findFirstOpenCustodyTarget` treats a *missing* week row as a valid target (it creates a stub), so the throw fires only when all 52 following weeks have existing **frozen** rows. That is the "catching up on back weeks, newest already closed" scenario — exactly the workflow your January-2026-open / September-2026-today screenshot implies.

**The asymmetry is the tell.** `reopenWeek` already does this correctly — it validates every driver's successor in a dedicated pre-flight loop (`:2361-2393`) and throws **before** touching anything. `closeWeek` applies the identical class of check *after* the irreversible step. The pattern for the fix already exists in the same file, twelve hundred lines further down.

**Fix.** Resolve custody targets for all drivers during verification — `mapPool` at `:1591` is the natural place — and emit `CUSTODY_NO_OPEN_TARGET` as a **close blocker** alongside `SETTLEMENT_PNL_MISMATCH`, which the file already handles correctly with the comment *"block before any freeze — never partial-close past a P&L fail."* Same rule, one more check.

**Belt and braces:** have `retryFreezeWeek` also run the custody carry, so any future post-freeze gap has a recovery path rather than requiring a reopen.

### The guarantee checklist, re-scored

| # | Guarantee | Pass 1 | Pass 3 | Now |
|---|---|---|---|---|
| 1–5 | Lanes tie · P&L tie · named blockers · no partial state · money frozen | ✅ | ✅ | ✅ |
| 6 | Sealed numbers cannot change after close | ❌ | ✅ | ✅ |
| 7 | Close hash survives normal operation | ❌ | ✅ | ✅ |
| 8 | **Obligations outliving the week carry forward** | ❌ | ⚠️ | ✅ **N-1/N-2** |
| 9 | Two closes cannot race | ❌ | ✅ | ✅ |
| 10 | What you preview is what you close | ⚠️ | ✅ | ✅ |
| 11 | Late data for a closed week is detected | ⚠️ | ✅ | ✅ |
| 12 | **Reopen is safe and auditable** | ⚠️ | ⚠️ | ✅ **N-1 + pre-flight** |
| 13 | *(new)* **A failed close leaves nothing stranded** | — | — | ⚠️ **N-3** |

**Twelve of thirteen.** The one gap is a failure-path ordering issue, not a correctness defect in the happy path.

---

## 0. Pass 3 — verification *(historical)*

**Method:** every Pass-1 finding re-checked against the working tree. Executed: **175 finance-core tests** (up from 169), `assert-ledger-view-invoker` (478 migrations / 17 wrapper views), `verify_service_line_filter_parity` (9 fixtures) — all green.

### Verdict

**The guarantee you asked for now exists.** C-1 — the finding that made closing non-durable — is closed with **four independent layers**, which is more defence than I specified:

1. **Early-skip inside both rebuild helpers** (`rebuildOneDriverPeriod:1763-1779`, `rebuildPeriodsForAnchors:2197-2211`) — frozen weeks return the existing row instead of recomputing. No throw, so the ~20 callers needed no edits.
2. **Freeze guard at the write boundary** (`period_persist.ts:49-54, 107-112`) — `assertPeriodNotFrozen` on both persist paths.
3. **`stripCloseSealFields`** (`period_persist.ts:19-26`) — even the deliberate `allowFrozen: true` cash-sync path cannot write `source_event_hash` / `close_hash`. *This one I did not ask for, and it is the right instinct: it makes the seal unwritable rather than merely guarded.*
4. **Dedicated `close_hash` column** + precedence flip to `close_hash → metadata.financeCore.closeHash → source_event_hash`, so a projection hash can never impersonate a close hash even if a path is missed.

Plus a **Phase 0 inventory** (`docs/close-integrity-phase0-rebuild-call-sites.md`) giving every one of the ~20 call sites a stated disposition, and **repair scripts** for weeks already bricked (`inventory-closed-week-hashes.sql`, `repair-close-hashes.sql`).

C-3's lock went further than a `pg_try_advisory_xact_lock`: a real `week_close_locks` / `week_close_runs` pair with a TTL and idempotent result replay, wired into close, prepare **and** reopen. Correct `SECURITY DEFINER` hygiene throughout, and `security_invoker` correctly respecified on the view — the N-1 lesson from the prior audit was applied without being asked.

**Two new gaps, both in C-2's custody carry-forward** (§0.2). The mechanism works; its interaction with *reopen* and with *out-of-order closes* was not followed through. Neither is a regression — both are new surface created by the fix.

### Status of every Pass-1 finding

| ID | Item | Status | Evidence |
|---|---|---|---|
| **C-1** | Rebuild destroys close hash → week bricked | ✅ **Closed** | 4 layers above + `closeIntegrity.characterization.test.ts` + repair SQL |
| **C-2** | Cash custody orphaned by close | ⚠️ **Closed with 2 gaps** | `carryForwardCashCustodyAfterFreeze:88`; `openingCashCustody` in `computePeriodSettlementMinor:91-93`. See **N-1**, **N-2** |
| **C-3** | No concurrency control on close | ✅ **Closed** | `week_close_lock.ts`; `CLOSE_IN_PROGRESS` at `:1236, :1424, :1899`; idempotency replay via `week_close_runs` |
| **C-4** | Table conflates custody with receivable | ✅ **Closed** | Separate "Driver owes" / "Cash held" columns (`SettlementQueueTable.tsx:426-427`) |
| **H-1** | Close mutates before verifying | ✅ **Closed** | `skipPrepare` flag (`:1404, :1451`); confirm re-renders post-sync |
| **H-2** | Heal script with hardcoded prod ids | ✅ **Closed** | `scripts/heal-week-close-sync.mjs` — *"No hardcoded org / weeks / actor"*, `process.argv` |
| **H-3** | Reopen blanks the close hash | ✅ **Closed** | `financeCore.priorCloseHash` retained (`settlement_period_freeze.ts:285-286`); `source_event_hash` now nullable |
| **H-4** | `HASH_MISMATCH` has no diagnosis | ✅ **Closed** | `driftedMoneyFieldsVsSignedSnapshot` → `driftedFields` in the 409 payload (`:151-159`) |
| **H-5** | Invariant inputs not in signed snapshot | ✅ **Closed** | `cashSourceMismatch`, `tollUnknownPmCount`, `cashHeldClamped`, `unclampedCashHeld` now in `periodSignedSnapshot.ts` |
| **H-6** | Three lanes seal with no shared instant | ✅ **Closed** | Single `asOf` threaded to all three sealers (`week_close.ts:551-552, 626, 646, 661`) |
| **M-1** | Redundant reopen-risk clause | ✅ **Closed** | `Math.abs(cashCollected) > EPS` is now a standalone clause — collected-without-returned is flagged |
| **M-2** | P&L-unavailable not surfaced on confirm | ✅ **Closed** | `pnlUnavailable` threaded to `CloseWeekDialogs.tsx:195` |
| **M-3** | `closeWeekStatements` throws mid-loop | ❌ **Open** | `week_close.ts:1794` — recoverable mixed lane state; low severity |
| **M-4** | Restatement bypasses desk-clear gate | ❌ **Open** | `skipSettlementDeskClear: acceptRestatementDrafts` (`:1030, :1674`) — by design, but undocumented |
| **P-1** | Close verification loop sequential | ✅ **Closed** | `mapPool(periodRows, 6, …)` (`:1591`); remaining `for` loops are freeze-batch assembly and reopen, correctly ordered |
| **P-2** | Close redoes prepare's work | ✅ **Closed** | `prepared.weekBlockers` reused; `skipPrepare` skips the whole pass |
| **P-3** | Toll orphan summary per driver | ✅ **Closed** | `summarizeTollUsageOrphansByDriverForWeek(week)` once, indexed by driver (`:907`) |
| **P-4** | `select("*")` on every preview | ✅ **Closed** | Explicit column list (`:233`) |
| **P-5** | `CloseWeekPage` 1,903 lines | ✅ **Closed** | 1,903 → **1,586**; `CloseWeekLaneCard.tsx` + `CloseWeekDialogs.tsx` extracted |
| **U-1** | Table/KPI contradiction | ✅ **Closed** | Same as C-4 |
| **U-2** | Rollup hides the two-problem split | ✅ **Closed** | Both columns on the parent row |
| **U-3** | No sign a closed week is broken | ✅ **Closed** | `sealHealthBadge` on parent and child rows (`:113, :471, :661, :811`) |
| **U-4** | Confirm dialog silent on custody | ✅ **Closed** | *"$X of passenger cash will remain in driver custody after…"* (`CloseWeekDialogs.tsx:190`) |
| **U-5** | Blocked reason `title`-only | ✅ **Closed** | `aria-describedby` wired throughout (`:518, :584, :606, :630, :672`) |

**Tally: 22 closed · 1 closed-with-gaps · 2 open (both Medium) · 2 new.**

### The guarantee checklist, re-scored

| # | Guarantee | Pass 1 | Now |
|---|---|---|---|
| 1–5 | Lanes tie · P&L tie · named blockers · no partial state · money frozen | ✅ | ✅ |
| 6 | **Sealed numbers cannot change after close** | ❌ | ✅ **C-1** |
| 7 | **Close hash survives normal operation** | ❌ | ✅ **C-1** |
| 8 | **Obligations outliving the week carry forward** | ❌ | ⚠️ **works forward; breaks on reopen / out-of-order — N-1, N-2** |
| 9 | **Two closes cannot race** | ❌ | ✅ **C-3** |
| 10 | What you preview is what you close | ⚠️ | ✅ **H-1** |
| 11 | Late data for a closed week is detected | ⚠️ | ✅ **H-4** — now named fields, not a bare hash |
| 12 | Reopen is safe and auditable | ⚠️ | ⚠️ **hash preserved (H-3); custody not reversed (N-1)** |

**Ten of twelve solid. The two remaining are the same finding: custody and reopen don't know about each other.**

---

## 0.2 New findings

### N-1 · 🟠 Reopen does not reverse the custody carry-forward — the same cash counts twice

**Files:** `week_close.ts:88-200` (carry), `settlement_period_freeze.ts:268-295` (`clearPeriodFreeze`)

Closing week *N* with residual custody does three things: marks the source week `custodyTransferredTo` / `custodyTransferredAmount`, adds `openingCashCustody` to week *N+1*, and rebuilds *N+1* so `cash_still_held` reflects it.

`clearPeriodFreeze` deletes `signedAt`, `closeHash`, `closedBy`, `closeReason`, `closeSourceRowIds`, `closeEngineVersion` — and **nothing removes `custodyTransferredTo` from week *N* or `openingCashCustody` from week *N+1***.

**Failure scenario.** Close Jan 5 holding $61,154.30; it carries to Jan 12. Two days later you reopen Jan 5 to fix a toll. Now:

- Jan 5 is open again with `cash_still_held = $61,154.30`
- Jan 12 still carries `openingCashCustody = $61,154.30`
- **The Collect queue shows the same $61,154.30 on both weeks.** Total exposure overstates by exactly the carried amount.

Re-closing Jan 5 does *not* double-add — the `if (srcFc.custodyTransferredTo) continue` guard at `:109` correctly skips. But that guard now works against you: if the custody changed while the week was open (a partial collection), week *N+1*'s opening balance is **stale and never corrected**.

**Fix.** In `clearPeriodFreeze` (or in `reopenWeek` around it): when `custodyTransferredTo` is set, subtract `custodyTransferredAmount` from that week's `openingCashCustody`, clear both marks on the source, and rebuild the successor. Then a re-close re-carries the *current* amount.

### N-2 · 🟠 The custody write to the next week bypasses the C-1 guard, and silently drops custody when that week is already closed

**File:** `week_close.ts:147-151`

```ts
const { error: nextUpdErr } = await sb()
  .from("driver_financial_periods")
  .update({ metadata: nextMeta })
  .eq("id", nextRow.id);
```

This is a **direct table write** — not through `persistPeriodRowWithVersion`. Two consequences:

1. **It bypasses the freeze guard C-1 just installed** and the `projection_version` optimistic concurrency. Metadata-only, so it cannot corrupt money columns — but it is the one write path in the settlement domain that answers to neither control, which is exactly the shape of the bug this audit opened with.
2. **When week *N+1* is already closed, the custody is silently lost.** The metadata write succeeds on the frozen row, then the follow-up `rebuildOneDriverPeriod(nextWeek)` at `:192-197` **early-skips** (Phase 1D, correctly) because *N+1* is frozen — so `cash_still_held` never picks it up. Week *N* is marked "transferred," week *N+1* records the amount in metadata that nothing reads, and the obligation disappears from every queue and total. The `console.warn` paths don't fire because nothing errored.

**This is reachable today.** Your screenshot shows eight open weeks from **January 2026** while the calendar reads September — closing back weeks after later ones is a normal recovery workflow, and it is precisely the case that loses money here.

**Fix.** Route the write through `persistPeriodRowWithVersion`, and resolve the target by *walking forward to the first non-frozen week* rather than assuming `weekKey + 7`. If every later week is closed, that is a genuine blocker — surface it (`CUSTODY_NO_OPEN_TARGET`) rather than writing into a frozen row. The stub-insert branch (`:157-188`) should use the same helper.

---

## 1. Verdict *(Pass 1 — retained for the record)*

**The close is well-engineered and still cannot be trusted to be permanent.**

The verification side is genuinely strong — arguably stronger than most commercial systems. Before a week freezes it checks fuel, toll and earnings statements against fresh engine recomputes, ties the week to Business Finance P&L, validates the toll four-card identity, reconciles toll events against the live ledger, and blocks on any of ~25 named invariants. When it says "this week ties," it ties.

**The problem is what happens after.** Closing writes a cryptographic close hash into `driver_financial_periods.source_event_hash` and a freeze flag into metadata. The freeze holds — money movements are correctly blocked on all seven endpoints. But **the projection itself is not frozen**, and roughly twenty code paths rewrite it, each of which overwrites `source_event_hash` with an unrelated projection hash. The close hash is destroyed, and every subsequent money operation on that week fails `HASH_MISMATCH`.

So the honest characterisation is:

> **Closing a week is correct at the moment it happens, and is not durable afterwards.** A single toll dispute resolution, fuel reset, or period repair on a closed week silently converts "closed and verifiable" into "closed and permanently failing verification" — a state indistinguishable, to the system's own tamper detection, from someone having altered the books.

That is **C-1**, and it is the single thing standing between you and the guarantee you asked for.

Second: your screenshot shows a **$61,154.30 custody obligation that the close will orphan** (**C-2**), and a **table column that reports $117,338.75 as "Driver owes" when the driver owes $56,184.45** (**C-4**).

**Does this need a new architecture? No.** It needs one new concept — *a closed period is immutable until reopened* — enforced at the single write boundary that already exists (`persistPeriodRowWithVersion`), plus a carry-forward for cash custody. Everything else is refinement.

**Severity roll-up:** 4 Critical · 6 High · 4 Medium · 5 Performance · 5 UX.

---

## 2. What your screenshot already tells us

Reading the numbers on the Cash desk against the code:

| Surface | Shows | Actually means |
|---|---|---|
| EXPOSURE strip | Drivers owe **$56,184.45** · Cash held **$61,154.30** | Correct. Two different obligations, correctly separated. |
| KPI cards | DRIVER OWES (AFTER SHARE) $56,184.45 · 6 weeks<br>CASH HELD (BEFORE SHARE) $61,154.30 · 2 weeks | Correct, and the "(after share)" / "(before share)" labels are a genuine improvement. |
| **Queue table** | Kenny Gregory Rattray · 8 weeks · **"Driver owes" $117,338.75** | **Wrong label.** $117,338.75 = $56,184.45 owed **+** $61,154.30 held. Two obligations summed under one heading — see **C-4**. |
| Blocked badge | $61,154.30 blocked / not finalized | All of the cash-held exposure sits in unfinalized weeks. |
| Aging | Oldest week Jan 5 – Jan 11, 2026 · **90+** | Eight months outstanding, one driver, eight weeks. |

The table and the KPI cards are reading the same API response and disagreeing about what it means. An operator working from the table concludes Kenny owes $117k and needs collecting; the truth is he owes $56k and is holding $61k of fleet cash — **different remedies, different accounting, different urgency.**

Note also **Fleet owes $0.00 · 0 weeks** under a Rideshare scope. Worth an explicit check against your restated weeks — a service-line scope is active here, and that is exactly the filter path that was fixed last pass. *(Verified in code: list filter and totals RPC now agree on absent/zero/nonzero trip counts. The $56,184.45 + $61,154.30 = $117,338.75 reconciliation across KPI and table confirms the parity fix is holding in production data.)*

---

## 3. How closing a week actually works today

```
 POST /week-close
   │
   ├─ assertPeriodEndedForReconciliation(week)          calendar gate
   │
   ├─ prepareWeekClose(...)            ⚠️ THIS WRITES
   │    ├─ assessCloseWeekSyncNeed          which lanes are stale?
   │    ├─ sealFuelWeek / sealTollWeek / sealEarningsWeek
   │    │     → publishes week_statements (draft)
   │    └─ syncOpenPeriodsToStatementsAfterSeal
   │          → rebuilds OPEN driver periods only  ✅ correctly filtered
   │
   ├─ weekPnlTieSides(org, week, driverIds)      ← batched, one call
   │    └─ Σ statements  ≟  engine week P&L      → block before any freeze ✅
   │
   ├─ for each driver (SEQUENTIAL — see P-1)
   │    ├─ compareDriverWeekStatementsToEngines   statement ≟ fresh engine
   │    ├─ summarizeTollUsageOrphansForWeek       events ≟ live toll ledger
   │    ├─ checkCloseInvariants(...)              ~25 named invariants
   │    ├─ closeWeekStatements(...)               draft → closed  (idempotent ✅)
   │    └─ push → freezeBatch
   │
   └─ freeze_settlement_periods_batch(jsonb)      ONE transaction ✅
        → status='closed', closed_at, source_event_hash = closeHash,
          metadata.financeCore.periodFrozen = true
```

**What the freeze protects:** all seven money endpoints (`/collect`, `/pay`, `/write-off`, `/reverse`, `/verify`, `/approve`, `/runs`) call `assertMovementAllowed` → `assertPeriodNotFrozen` → `assertFrozenPeriodHashIntact`. That is solid.

**What the freeze does not protect:** the `driver_financial_periods` row itself. Nothing between a closed week and `rebuildDriverFinancialPeriod` — which recomputes every money column and overwrites `source_event_hash`.

---

## 4. Critical findings

### C-1 · 🔴 Any period rebuild destroys the close hash and bricks the week

**Files:** `driver_financial_periods.ts:806` (rebuild), `:1688` (upsert body), `packages/finance-core/src/closeHash.ts:148-159`

`rebuildDriverFinancialPeriod` writes its own projection hash into the same column the close hash lives in:

```ts
// driver_financial_periods.ts — upsertBody
source_event_hash: sourceEventHash,     // ← projection hash
// C-3: calendar closed_at / status only via closeWeek/reopenWeek.
metadata: cashPersist.metadata,
```

The C-3 fix from the last audit correctly stopped the rebuild writing `status` / `closed_at`. **`source_event_hash` was not included in that protection** — and it is where `closeWeek` stores the close hash.

Now trace the read side:

```ts
// closeHash.ts:148
export function storedCloseHashFromPeriod(period) {
  const col = String(period.source_event_hash || period.sourceEventHash || '').trim();
  if (col) return col;                        // ← column WINS
  const fc = (period.metadata?.financeCore) || {};
  return String(fc.closeHash || '').trim() || null;
}
```

The column takes precedence over `metadata.financeCore.closeHash`. So after a rebuild of a closed week:

| Field | After rebuild | Effect |
|---|---|---|
| `metadata.financeCore.periodFrozen` | `true` — survives via `...priorFc` spread | Week still frozen ✅ |
| `metadata.financeCore.closeHash` | original close hash — survives | **but unreachable** (column wins) |
| `source_event_hash` | **projection hash** | Verify compares against the wrong hash |
| money columns | recomputed, possibly different | Seal no longer reflects what was signed |

`assertFrozenPeriodHashIntact` then throws **`HASH_MISMATCH` (409)** on every `/collect`, `/pay` and `/write-off` for that week — permanently. The only escape is Reopen, which requires a typed reason and a settlement-risk acknowledgement, and which itself blanks `source_event_hash` (`week_close.ts:1865`).

**The exposure is wide.** Two of the five rebuild entry points guard against signed weeks; the other two do not, and ~20 call sites reach them:

| Entry point | Signed-week guard | Reached from |
|---|---|---|
| outbox job drain (`:1835`) | ✅ `signedAnchors.has(anchor) && !forceJob` | projection refresh queue |
| bulk anchors (`:2143`) | ✅ `isSignedWeekRow` | multi-week repair |
| `syncOpenPeriodsToStatementsAfterSeal` | ✅ filters to `openDriverIds` | close/prepare |
| **`rebuildOneDriverPeriod` (`:1755`)** | ❌ **none** | `dispute_refund_controller:541,916` · `driver_financial_period_controller:525,539` · `fuel_financial_reset:224,364` |
| **`rebuildPeriodsForAnchors` (`:2166`)** | ❌ **none** | `toll_controller:4516,4599` · `toll_period_controller:752,818,835` · `toll_financial_reset:933` · `fuel_financial_reset:136` · `fuel_period_routes:99` · `period_reset:514` · `settlement_audit_repair:29,59` · `heal_feb16_reimport_recovery:34` |

**Failure scenario — entirely routine.** You close the week of Aug 24. Three days later a toll dispute for Kenny in that week resolves. `dispute_refund_controller.tsx:541` calls `rebuildOneDriverPeriod(driverId, '2026-08-24')`. No guard fires. `source_event_hash` becomes a projection hash. Nobody is told. Two weeks later someone tries to record a correction on that week and gets `HASH_MISMATCH` — a message that means *"the books were altered after signing,"* which is technically true and completely misleading about the cause.

**Fix — one guard at the one boundary:**

1. In `persistPeriodRowWithVersion` (the single write path both rebuild and cash-sync use), refuse the write when `metadata.financeCore.periodFrozen === true` unless an explicit `allowFrozen` flag is passed — mirroring the pattern `syncPeriodCashFromTransactions` already uses deliberately.
2. Never let a rebuild write `source_event_hash` on a frozen row. Better still: **stop overloading the column.** Give the close hash its own `close_hash` column so a projection hash can never impersonate it.
3. Make `storedCloseHashFromPeriod` prefer `metadata.financeCore.closeHash` over the column, so the authoritative value survives even if the column is clobbered.
4. Add the test that would have caught this: *rebuild a frozen period → `assertFrozenPeriodHashIntact` still passes.*

---

### C-2 · 🔴 Cash custody is orphaned by the close

**Evidence in your screenshot:** $61,154.30 cash held across 2 weeks, 90+ days old.

`cash_still_held` is passenger cash physically in the driver's pocket. At close it is:

- **read** — folded into the close hash (`week_close.ts:215`)
- **not zeroed**
- **not carried forward** — there is no opening-balance, rollover, or driver-level custody ledger anywhere in the settlement domain *(searched: `carryForward`, `rollover`, `openingBalance`, `cashOnHand`, `custodyBalance` — no hits in the fleet settlement path)*
- **not dischargeable after close** — the freeze blocks `/collect`, so when the driver finally hands the cash over there is no week to book it against

Last pass deliberately removed `SETTLEMENT_CASH_HELD` as a close blocker, adopting driver-share-first:

```ts
// closeInvariants.ts:602-605
// Driver-share-first: cash_still_held after residual≈0 is passenger cash already
// applied to the driver's share — not fleet Collect.
// (Intentionally no SETTLEMENT_CASH_HELD here.)
```

**That reasoning is sound and I am not asking you to reverse it.** The consequence was not followed through: removing the blocker means weeks *can* now close holding custody, which makes a discharge path mandatory — and there isn't one.

**Failure scenario.** Close Jan 5 and Jan 12 with $61,154.30 held. In November the driver returns $20,000. There is no correct place to record it: the weeks are frozen, no later week carries the obligation, and the driver's balance across the app still shows the original custody. The only mechanism available is Reopen — on a week closed ten months earlier, which re-runs every invariant against data that has since moved.

**Fix — pick one and commit to it:**

- **(a) Carry-forward (recommended).** At close, transfer residual `cash_still_held` to the next open week as an opening custody balance. Custody becomes a rolling driver-level obligation; the close discharges the *week* without discharging the *debt*.
- **(b) Custody sub-ledger.** Move cash custody out of the weekly projection entirely into a driver-level `cash_custody` account that weeks post into and out of. Cleaner accounting, larger change.
- **(c) Force settlement at close.** Require collect-or-write-off before close — reinstating the blocker you deliberately removed. Simplest, but it would deadlock the eight 90+ weeks in your screenshot.

Whichever you choose, the Close confirm dialog must state the custody being carried, and the driver's balance must reflect it after close.

---

### C-3 · 🔴 No concurrency control on close

**File:** `week_close_controller.tsx:160-180`

```ts
app.post(BASE, requirePermission("transactions.edit"), async (c) => {
  ...
  const result = await closeWeek(org, weekKey, user.userId, reason);
```

No advisory lock, no idempotency key, no in-flight guard. `closeWeek` first calls `prepareWeekClose` — which **writes**: it seals fuel, toll and earnings statements and rebuilds open periods.

Two concurrent closes of the same week (double-click on a slow response, two operators, or a client retry) both run the full seal-and-rebuild, then both call the freeze RPC. The freeze RPC is idempotent and `closeWeekStatements` correctly guards on `.eq("status","draft")`, so the *outcome* is probably fine — but "probably fine by downstream idempotency" is not the standard you asked for, and the intermediate state has two writers racing on the same statements and period rows.

The Cash desk already solved this: every money command takes an `idempotencyKey` and CASes on `row_version`. **Close — the single most consequential operation in the system — has neither.**

**Fix:** `SELECT pg_try_advisory_xact_lock(hashtext(org || week))` at the top of `closeWeek`, returning `409 CLOSE_IN_PROGRESS` when not acquired. Accept and store an `idempotencyKey` as the money paths do.

---

### C-4 · 🔴 The queue table reports custody as receivable

**File:** `SettlementQueueTable.tsx:320`

```tsx
<TableHead className="text-right">
  {mode === 'collect' ? 'Driver owes' : 'Fleet owes'}
</TableHead>
```

In grouped mode the parent row shows `g.owed` — the sum of `owedMajor(r, 'collect')` across every child week, **including `collectKind === 'cash_held'` rows**. Your screenshot: $117,338.75 under "Driver owes" when $61,154.30 of it is custody.

The child rows do carry `collectKindLabel` ("Cash held (before share)" / "Driver owes (after share)", `:108-109`) — but only when expanded. The **collapsed parent row, the footer total, and the "showing 8 of 8 · $117,338.75" line** all conflate the two. The KPI cards directly above split them correctly, so the same screen states both.

**Fix:** split the rollup into two columns ("Driver owes" / "Cash held") with the parent showing both, or label the combined column "Total exposure" and show the split in a sub-line. The CSV export has the same defect — `exportCsv` emits one `amount_owed` column for both kinds, with `collect_kind` only present on the collect header.

---

## 5. "Close to perfection" — the guarantee checklist

What a close *must* guarantee, and where you stand:

| # | Guarantee | Status | Gap |
|---|---|---|---|
| 1 | Every lane ties to an independent engine before freezing | ✅ **Yes** | `compareDriverWeekStatementsToEngines` vs fresh recompute — genuinely non-tautological |
| 2 | The week ties to Business Finance P&L | ✅ **Yes** | `weekPnlTieSides`, blocks before any freeze |
| 3 | Blockers are named and actionable | ✅ **Yes** | ~25 codes with plain-English labels + deep links |
| 4 | A failed close leaves no partial state | ✅ **Yes** | `freeze_settlement_periods_batch` is one transaction; `retryFreezeWeek` recovers the seal/freeze gap |
| 5 | Money cannot move after close | ✅ **Yes** | All 7 endpoints gated |
| 6 | **The sealed numbers cannot change after close** | ❌ **No** | **C-1** — ~20 paths rewrite them |
| 7 | **The close hash survives normal operation** | ❌ **No** | **C-1** — overwritten by any rebuild |
| 8 | **Obligations outliving the week are carried forward** | ❌ **No** | **C-2** — custody orphaned |
| 9 | **Two closes cannot race** | ❌ **No** | **C-3** |
| 10 | What you preview is what you close | ⚠️ **Partial** | **H-1** — `closeWeek` re-seals via `prepareWeekClose` first |
| 11 | Late-arriving data for a closed week is detected | ⚠️ **Partial** | Detected as `HASH_MISMATCH`, but indistinguishable from tampering, and only on the next money attempt |
| 12 | Reopen is safe and auditable | ⚠️ **Partial** | **H-3** — reopen blanks `source_event_hash` |

**Six of twelve are solid. Four gaps, and they cluster on one theme: the close is an event, not a state.** Everything that makes closing *happen* correctly is built. What is missing is the enforcement that keeps a closed week closed.

---

## 6. High findings

### H-1 · `POST /week-close` mutates before it verifies — preview ≠ close
`week_close.ts:1201` — `closeWeek` calls `prepareWeekClose(...)`, which seals statements and rebuilds open periods. So the numbers you approved in the confirm dialog are not necessarily the numbers that get frozen: between preview and close, the seal may have moved. The dialog says *"This will freeze N driver-periods"* using `preview.driversReady` — a value computed before the re-seal.
**Fix:** have Close verify-and-freeze only, and require an explicit Prepare/Sync first (the button already exists). If Close must sync, re-render the confirm from the post-sync preview and make the operator confirm *that*.

### H-2 · A one-off heal script is committed with hardcoded production identifiers
`heal_week_close_sync.ts` — hardcoded `orgId = "8cfa606a-…"`, 33 hardcoded week keys, and an actor id of `"00000000-0000-0000-0000-0000000000he"` which **is not valid hex and will fail any `::uuid` cast**. It calls `prepareWeekClose(..., { forceAllLaneReseals: true })` — the exact flag the codebase elsewhere warns against (`week_close_force_opts.ts:26-28`: *"Never pass this from Close … that path caused WORKER_RESOURCE_LIMIT / CPU 546"*).
**Fix:** move to `scripts/`, take org/weeks as arguments, use a real service actor id, or delete it now that the heal has run.

### H-3 · Reopen still blanks the close hash
`week_close.ts:1865` — `source_event_hash: ""`. `clearPeriodFreeze` archives the prior seal into `financeCore.reopenHistory`, so the value is recoverable, but `assertFrozenPeriodHashIntact` early-returns when no stored hash exists. Between reopen and re-close there is no tamper detection, and the re-close computes a fresh hash over whatever the row says by then — so an unexplained change during the reopen window is invisible. *(Carried from the prior audit's H-9; the archive shipped, the comparison did not.)*

### H-4 · `HASH_MISMATCH` has no diagnosis and no repair path
When verification fails, the operator gets *"Closed week hash no longer matches stored close hash — refuse money movement"* with `stored` and `expected` hashes. That tells them nothing about **which field changed** or **what wrote it**. Given C-1 makes this reachable by routine operation, it will be hit.
**Fix:** on mismatch, diff the current row against `metadata.financeCore` / the sealed statements and name the drifted fields; offer a "re-seal and re-sign" action instead of forcing a full Reopen.

### H-5 · Close-time invariants read `metadata.financeCore` values a rebuild can silently change
`checkCloseInvariants` consumes `cashSourceMismatch`, `tollUnknownPmCount`, `cashHeldClamped`, `unclampedCashHeld` from metadata. These are written by the projector. A rebuild after close refreshes them — so the values that justified a close are not preserved alongside the close hash. The signed snapshot (`signedSnapshot`) exists and is preserved, but the invariant inputs are not part of it.
**Fix:** fold the invariant inputs into `signedSnapshot` at close so the close is self-describing and auditable without re-deriving.

### H-6 · Three lanes seal independently with no cross-lane ordering guarantee
`ensureCloseLaneStatements` seals fuel, toll and earnings. Toll sealing depends on toll events; earnings depends on trips; fuel on the fuel snapshot. If toll data changes *between* the toll seal and the earnings seal within the same prepare run, the two statements describe different states of the world and the P&L tie may pass or fail nondeterministically.
**Fix:** snapshot a single `as_of` timestamp at the start of prepare and have all three sealers filter to it, so the three statements describe one instant.

---

## 7. Medium findings

- **M-1 · `settlementRiskForPeriod` has a redundant clause.** `week_close.ts:186-190` — the fourth condition `(|cashCollected| > ε && |cashReturned| > ε)` can never add anything, because `|cashReturned| > ε` alone already triggers the second condition. Harmless, but it reads as though collected-without-returned is covered when it is not: **a week where you collected $50,000 and returned nothing is not flagged as reopen risk.**
- **M-2 · `BUSINESS_WEEK_PNL_UNAVAILABLE` is a `warn`,** so a week closes when the P&L feed is down — the tie silently does not run. Acceptable, but it should be surfaced on the confirm dialog, not just in the blocker list.
- **M-3 · `closeWeekStatements` throws mid-loop** (`week_statements.ts:249,257`) leaving some lanes closed and others draft for that driver. The outer `freezeBatch` then never receives the driver, so the week stays open — recoverable, but the driver's statements are left in a mixed state that the next prepare must clean up.
- **M-4 · Restatement drafts bypass the desk-clear gate** via `skipSettlementDeskClear` when `frozen && pendingDrafts`. Correct for re-signing, but it means a restatement can re-sign a week whose settlement position has changed since the original close without re-checking `SETTLEMENT_FLEET_OWES` / `SETTLEMENT_DRIVER_OWES`.

---

## 8. Performance

Current scale (~4 drivers, ~36 weeks) hides all of these. The code comment at `week_close_force_opts.ts:26-28` records that you **already hit `WORKER_RESOURCE_LIMIT` / CPU 546** on this path — so the ceiling is real and has been touched.

### P-1 · `closeWeek`'s verification loop is sequential while `prepareWeekClose`'s is pooled
`week_close.ts:1282` — `for (const period of periodRows)` with two awaits per driver (`compareDriverWeekStatementsToEngines`, `summarizeTollUsageOrphansForWeek`). Meanwhile `mapPool` is used at `:614` (concurrency 4) and `:1102` (concurrency 8) in the prepare path. The helper exists and is used elsewhere in the same file — the close loop just wasn't converted.
**Impact:** 4 drivers ≈ 8 serial round trips; 50 drivers ≈ 100, plus 50 engine recomputes, inside an edge function with a wall clock. **Fix:** `mapPool(periodRows, 6, …)` for the read-only verification, keeping the freeze batch collection ordered.

### P-2 · Close does the full prepare work twice
`closeWeek` → `prepareWeekClose` (seals + rebuilds + computes blockers) → then re-reads all periods and re-runs `weekPnlTieSides` and the per-driver engine compares. The preview the operator just looked at did the same work moments earlier. Three full passes over the same week per close.
**Fix:** have `prepareWeekClose` return its computed per-driver statement map and blockers, and let `closeWeek` consume them rather than recomputing.

### P-3 · `summarizeTollUsageOrphansForWeek` is called per driver
It is invoked inside the per-driver loop in both preview and close. Unless it is already week-scoped internally, this is N identical-shaped queries per week. **Fix:** compute once per week, index by driver.

### P-4 · `previewWeekClose` selects `*` on every driver period
`week_close.ts:1216` and the preview equivalent — `select("*")` pulls the full JSONB `metadata` blob for every driver on every preview render. **Fix:** project only the columns the invariants read.

### P-5 · `CloseWeekPage.tsx` is 1,903 lines
Up from 1,117 at the last audit. It now owns week/year pickers, three lane cards, five repair dialogs, the close confirm, reopen, retry-freeze, restatement sign-off and orphan/ineligible review. **Fix:** extract the repair dialogs and the lane cards; the page should orchestrate, not implement.

---

## 9. UX findings

- **U-1 · The table/KPI contradiction (C-4)** is the highest-value UX fix on the page. Same screen, two answers.
- **U-2 · "8 weeks" on one row hides that they are two different problems** — 6 weeks needing collection and 2 weeks needing reconciliation. The rollup should badge the split.
- **U-3 · Nothing on the Cash desk says a week is closed-and-broken.** A week bricked by C-1 looks identical to a healthy closed week until someone clicks Pay and gets a 409. Surface hash-verification state in the queue row.
- **U-4 · The close confirm dialog does not mention custody.** Given C-2, it must say *"$61,154.30 of cash will remain in driver custody after this close"* and where it goes.
- **U-5 · Blocked-row reasons are still `title`-only on disabled controls** *(carried: U-1 from the prior audit, still open)* — unreachable by keyboard and touch.

---

## 10. Target architecture — one new rule

No rewrite. Add one invariant and one concept:

**Rule: a closed period is immutable until reopened.**

```
        ┌──────────────── ONE WRITE BOUNDARY ────────────────┐
        │  persistPeriodRowWithVersion(driverId, week, body) │
        │    if (periodFrozen && !opts.allowFrozen)          │
        │        throw PERIOD_FROZEN                         │
        └────────────────────────────────────────────────────┘
             ▲                    ▲                    ▲
   rebuildDriverFinancialPeriod   syncPeriodCash…   closeWeek/reopenWeek
        (never allowFrozen)      (allowFrozen: true,   (owns status,
                                  already deliberate)   closed_at, close_hash)
```

Three supporting changes:

1. **`close_hash` becomes its own column.** A projection hash can then never impersonate a close hash, and C-1's failure mode becomes structurally impossible rather than guarded against.
2. **`signedSnapshot` becomes complete** — money columns *plus* the invariant inputs that justified the close (H-5). A closed week is then auditable without re-deriving anything.
3. **Custody carries forward** (C-2) — `cash_still_held` at close transfers to the next open week as an opening balance, so closing a week never strands an obligation.

That is the whole change. Everything else in this document is a refinement of machinery that already works.

---

## 11. Remediation plan

> **Pass 8 — P-6 shipped.** One ranged custody-target query + preflight target reuse; `close_phase_timing` logs; ops inventory checkboxes truth-up (stranded = 0; 9 seals / 22 legacy). 50-driver timing **deferred until fleet ≥ 50**. Audit remains **Closed**.

---

> **Pass 6 — shipped.** N-3: custody targets resolved in verify before freeze; whole-week abort on `CUSTODY_NO_OPEN_TARGET`; `runCustodyCarryForWeek` recovers stranded freezes via Close / Retry freeze; `PRIOR_CLOSE_HASH_CHANGED` warn on re-close.

---

> **Pass 7 — AUDIT CLOSED.** All 27 findings are closed. Nothing is outstanding that affects correctness, durability, recoverability or money.
>
> **Two optional items, neither blocking:**
>
> | # | Item | Type | Note |
> |---|---|---|---|
> | 1 | **P-6** | 🟢 Perf | ✅ **Pass 8 shipped** — ranged query + preflight target reuse + `close_phase_timing`. |
> | 2 | **Operational** | — | ✅ Inventories already run (Pass 6): stranded = 0; 9 seals / 22 legacy. Do **not** run destructive repair on the 22. |
>
> ---
>
> **Pass 5 — what was left** *(now closed)*. 26 of 26 from Passes 1 and 3; one item outstanding at the time:
>
> | # | Item | Severity | Work |
> |---|---|---|---|
> | 1 | **N-3** | 🟠 High | Resolve custody targets during the pooled verification (`week_close.ts:1591`) and emit `CUSTODY_NO_OPEN_TARGET` as a **close blocker**, the way `SETTLEMENT_PNL_MISMATCH` already is — *"block before any freeze."* Then have `retryFreezeWeek` also run the custody carry so any future post-freeze gap is recoverable. |
>
> Nothing else is open. The fix pattern already exists twice in the same file (the P&L pre-check, and `reopenWeek`'s custody pre-flight at `:2361-2393`).

---

> **Pass 3 — what was left** *(all now closed)*. Phases 0–6 below are shipped.
>
> | # | Item | Severity | Work |
> |---|---|---|---|
> | 1 | **N-2** | 🟠 High | Route the custody write through `persistPeriodRowWithVersion`; walk forward to the first **non-frozen** week instead of assuming `+7 days`; emit `CUSTODY_NO_OPEN_TARGET` when every later week is closed. Apply to the stub-insert branch too. **This one loses money today on out-of-order closes.** |
> | 2 | **N-1** | 🟠 High | On reopen, reverse the carry: subtract `custodyTransferredAmount` from the successor's `openingCashCustody`, clear `custodyTransferredTo` / `custodyTransferredAmount`, rebuild the successor. |
> | 3 | **M-3** | 🟡 Med | `closeWeekStatements` (`:1794`) can throw mid-loop leaving one driver's lanes mixed draft/closed. Recoverable on the next prepare — worth making explicit. |
> | 4 | **M-4** | 🟡 Med | `skipSettlementDeskClear` on restatement re-sign is deliberate; record it in §12 or in `CLOSE_VOCABULARY` so it isn't "fixed" later. |
>
> Nothing else is outstanding. Items 3–4 do not block a deploy; items 1–2 should land before the next back-week close.

---

### Original plan (Pass 1) — retained for context

**Phase 0 — prove the bug before fixing it** *(half a day, non-negotiable)*
- Test: close a week → call `rebuildOneDriverPeriod` on it → assert `assertFrozenPeriodHashIntact` still passes. **This fails today.**
- Test: close a week holding `cash_still_held > 0` → assert the obligation is still reachable afterwards. **This fails today.**
- Snapshot the current `source_event_hash` and money columns for all closed weeks, so you can detect which weeks are *already* bricked.

**Phase 1 — make the close durable (C-1)**
1. Freeze guard in `persistPeriodRowWithVersion`, `allowFrozen` opt-in.
2. Audit the ~20 call sites: which legitimately need `allowFrozen`? (Almost none — most should skip frozen weeks the way the outbox drain already does.)
3. Add `close_hash` column; write it in the freeze RPC; stop letting rebuild touch it.
4. Flip `storedCloseHashFromPeriod` precedence to prefer the metadata/dedicated column.
5. **Repair pass:** find closed weeks whose `source_event_hash` is a projection hash, restore from `metadata.financeCore.closeHash`, re-verify.

**Phase 2 — close the custody gap (C-2)**
6. Decide (a) carry-forward / (b) sub-ledger / (c) force-settle. Recommend (a).
7. Implement, surface in the close confirm dialog, reflect in the driver balance.

**Phase 3 — make close safe to click twice (C-3)**
8. Advisory lock + `409 CLOSE_IN_PROGRESS`; accept an idempotency key.
9. Split verify-and-freeze from prepare (H-1); re-render the confirm after any sync.

**Phase 4 — truth on screen (C-4, UX)**
10. Split the queue rollup into Driver owes / Cash held; fix the CSV export.
11. Surface hash-verification state per row (U-3); custody in the confirm dialog (U-4).

**Phase 5 — speed**
12. `mapPool` the close verification loop (P-1); thread prepare's results into close (P-2); hoist the toll orphan summary to week scope (P-3); narrow the `select("*")` (P-4).

**Phase 6 — hygiene**
13. H-2 heal script; H-3 reopen hash; H-4 mismatch diagnosis; H-5 snapshot completeness; H-6 single `as_of`; M-1…M-4; P-5 component split.

---

## 12. Do **not** change these

Deliberate decisions, recorded so a later pass doesn't "fix" them:

1. **Driver-share-first — no `SETTLEMENT_CASH_HELD` blocker.** `closeInvariants.ts:602-605`. C-2 asks you to add a *discharge path*, not to restore the blocker.
2. **`syncPeriodCashFromTransactions` runs with `allowFrozen: true`.** Deliberate — it prevents a posted movement being orphaned when Close races the insert. It is the model for how the C-1 guard should be opted out of, not a bug.
3. **`closeWeekLaneForceOpts()` returns empty.** Close must not blind-reseal all lanes; that caused `WORKER_RESOURCE_LIMIT`. Keep it.
4. **`chargedToDrivers` folded into `netLoss`** in the toll identity — decided and locked in a prior audit.
5. **The settlement engine formula.** `computePeriodSettlementMinor` is correct. Nothing in this document disputes the arithmetic.
6. **`skipSettlementDeskClear` is a legacy no-op (M-4).** Desk owes (`SETTLEMENT_FLEET_OWES` / `SETTLEMENT_DRIVER_OWES`) always run on restatement re-sign. See `docs/CLOSE_VOCABULARY.md`.
7. **Custody source transfer marks use `allowFrozen: true` metadata-only** after a successful successor write (Pass 4). Seals remain stripped. Successor writes never use `allowFrozen`.

---

## 13. Verification checklist

Each is a test that must be *able to fail*:

- [x] Close a week → `rebuildOneDriverPeriod` on it → `assertFrozenPeriodHashIntact` **passes** *(C-1 — early-skip at `:1763`)*
- [x] Close a week → resolve a toll dispute in it → `/pay` does **not** return `HASH_MISMATCH` *(C-1)*
- [x] Every one of the ~20 rebuild call sites skips frozen weeks *(C-1 — `docs/close-integrity-phase0-rebuild-call-sites.md`, all **skip**)*
- [x] Close a week with `cash_still_held = 61154.30` → obligation appears on the next open week *(C-2 — `carryForwardCashCustodyAfterFreeze`)*
- [x] Two simultaneous `POST /week-close` → one succeeds, one returns `409 CLOSE_IN_PROGRESS` *(C-3 — `week_close_lock.ts`)*
- [x] Collect queue: "Driver owes" **excludes** `cash_held` children *(C-4 — separate columns)*
- [x] Preview says N ready → Close freezes exactly those N, or re-confirms *(H-1 — `skipPrepare`)*
- [x] `HASH_MISMATCH` response names the drifted fields *(H-4 — `driftedFields`)*
- [x] A closed week with a projection hash in `source_event_hash` is detected *(`scripts/inventory-closed-week-hashes.sql`)*
- [x] Reopen → alter a money column → re-close → the change is **blocked or reported** *(H-3 — `PRIOR_CLOSE_HASH_CHANGED` warn)*
- [x] 50-driver week → `closeWeek` completes under 10 s — **deferred until fleet ≥ 50 drivers** *(P-1/P-2/P-6 shipped; `close_phase_timing` logs on each close)*

### Checks added by Pass 3 — Pass 5 status

- [x] Close week *N* with custody → **reopen** *N* → the carried amount appears **once** **(N-1 — `reverseCustodyCarryOnReopen:255`)**
- [x] Close week *N* with custody → partially collect on the reopened *N* → re-close → successor reflects the **new** amount **(N-1 — marks cleared on reverse)**
- [x] Close week *N* when *N+1* is already closed → custody lands on the first open week, or the close reports `CUSTODY_NO_OPEN_TARGET` **(N-2 — `findFirstOpenCustodyTarget:105`)**
- [x] The custody write goes through `persistPeriodRowWithVersion` **(N-2 — `:199, :204, :226, :310`)**
- [x] Run `scripts/inventory-closed-week-hashes.sql` against production once — **Pass 6 ops: 9 sealed column · 22 legacy closed no seal (not projection-bricked)**
- [x] Run `scripts/inventory-stranded-custody.sql` — **Pass 6 ops: stranded = 0**

### Checks added by Pass 5 — Pass 6 status

- [x] Multi-driver week where one driver has no open successor → the close is **blocked before the freeze RPC runs**; no driver is frozen and no custody is stranded **(N-3 — preflight in mapPool + whole-week abort)**
- [x] After a `CUSTODY_NO_OPEN_TARGET` failure, re-running Close (or `retryFreezeWeek`) **completes the custody carry** rather than skipping it **(N-3 — `runCustodyCarryForWeek`)**
- [x] `carryForwardCashCustodyAfterFreeze` has more than one caller, or its pre-check is unreachable-by-construction **(N-3 — via `runCustodyCarryForWeek` from close + retryFreeze)**
- [x] Reopen → alter a money column → re-close → the change is **reported** *(H-3 — `PRIOR_CLOSE_HASH_CHANGED` warn blocker)*
- [x] 50-driver week → `closeWeek` completes under 10 s — **deferred until fleet ≥ 50 drivers** *(timing log shipped Pass 8)*

---

### Checks added by Pass 7

- [x] Driver with held cash and no open successor → close is **refused before the freeze RPC runs**; no driver frozen, no custody stranded **(N-3 — `:1962`)**
- [x] Preflight itself errors → close is **blocked**, not allowed through **(N-3 — fail-closed at `:1971-1975`)**
- [x] After any earlier stranding, re-running Close or `retryFreezeWeek` **completes the carry** **(N-3 — `runCustodyCarryForWeek` scans frozen rows from the DB)**
- [x] `carryForwardCashCustodyAfterFreeze` has more than one caller **(3: close + retryFreezeWeek ×2)**
- [x] *(operational)* inventories run once against production — **stranded = 0**; **9 column seals / 22 legacy closed no seal** (no destructive repair on the 22)

### Checks added by Pass 8

- [x] `findFirstOpenCustodyTarget` uses one ranged query + in-memory Monday walk **(P-6)**
- [x] Close carry reuses preflight `resolvedCustodyTarget` when present **(P-6)**
- [x] `close_phase_timing` logs verify/freeze/carry ms **(P-6 / 50-driver evidence path)**

---

*Passes 1, 3, 5 and 7 produced without modifying any source file. Pass 7 line references are against the working tree as of 2026-09-11 (44 modified files + 15 new, incl. `custodyCarry.ts`, `week_close_lock.ts`, `docs/CLOSE_VOCABULARY.md`, three inventory/repair SQL scripts, and migrations `20260911120000_driver_financial_periods_close_hash.sql` / `20260911130000_week_close_locks_and_runs.sql`).*

*Test state at Pass 7: **189 finance-core passing** (169 → 175 → 184 → 189); `assert-ledger-view-invoker` OK (478 migrations / 17 wrapper views); `verify_service_line_filter_parity` OK (9 fixtures).*
*Pass 8: custodyCarry tests **14** (incl. P-6 ranged/stub characterization).*

### The one-line version

**Pass 1:** *your close verifies beautifully and then doesn't stick.*
**Pass 3:** *it sticks now — but custody carry-forward and reopen don't know about each other.*
**Pass 5:** *they do now — but a close that fails on custody fails after the freeze, and nothing picks up the pieces.*
**Pass 7:** **it picks up the pieces.** 27 of 27 closed, 13 of 13 guarantees met. Closing a week is now correct, durable, recoverable, and safe to fail.

### What this audit is worth carrying forward

Four variations on one theme — **the control was right, the path around it was new**:

| | The control | The path that escaped it |
|---|---|---|
| **C-1** | close hash + freeze | `rebuildDriverFinancialPeriod` wrote the column the close owned |
| **N-2** | C-1's four-layer seal guard | custody carry used a direct `sb().update()` |
| **N-3** | "block before any freeze" (P&L) | custody check ran *after* the freeze RPC |

Two rules came out of it, and both generalise beyond this section:

1. **Don't guard an invariant — make violating it unrepresentable.** C-1 wasn't fixed by adding a check; it was fixed by early-skip *plus* a persist guard *plus* field-stripping *plus* a dedicated column, so four independent mistakes must line up before the bug returns. That is why C-1 never came back while its neighbours did.
2. **Every condition that can refuse an irreversible step must be evaluable before it.** If a check can only run after the commit, the sequencing is the defect — not the check. The fix for N-3 was to move the same logic earlier, not to write new logic.

The reviewer's habit that would have caught all three: for each new guard, ask *"what is the earliest point at which this could fail, and is anything irreversible already done by then?"* — and for each new write path, *"which existing control does this answer to?"*
