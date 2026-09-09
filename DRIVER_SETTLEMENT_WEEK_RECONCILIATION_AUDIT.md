# Driver Settlement & Week Reconciliation — Section Audit

| Pass | Date | Mode | Result |
|---|---|---|---|
| 1 — original audit | 2026-09-08 | audit only | 5 Critical · 10 High · 7 Perf · 6 UX · 4 Redundancy |
| 2 — implementation | 2026-09-08 | owner implemented | Phase 0–3 largely shipped |
| 3 — verification | 2026-09-08 | audit only | All 5 Criticals closed & tested. 12 open, 7 new findings |
| 4 — implementation | 2026-09-08 | owner implemented | N-1…N-7, H-2, H-4, H-8, P-1/2/4/5/7, R-1/R-2, U-3, U-6 |
| 5 — verification | 2026-09-08 | audit only | ✅ Deploy blocker cleared. 19 more closed. 4 open, 5 new |
| 6 — implementation | 2026-09-08 | owner implemented | N-8…N-12, R-4, U-5 (commit `55361643`) |
| **7 — verification** | **2026-09-09** | **audit only** | **✅ 45 closed · 2 open (R-3, U-1) · 1 trivial new. Section is done — §0.1** |

**Scope:** The Driver Settlements hub (Cash desk · Close Week · Restatements), the settlement queue read model, the week-close engine, the period projection, and every money-write endpoint behind them.

**Surface audited**

| Layer | Files |
|---|---|
| Desk UI | `apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx` (2,392 ln), `settlements/*` (9 components), `ReconciledPeriodOverlay.tsx` |
| Close UI | `apps/fleet/src/pages/CloseWeekPage.tsx` (1,117 ln), `RestatementQueuePage.tsx`, `utils/weekCloseBlockers.ts` |
| Client data | `hooks/useSettlementQueue.ts`, `services/settlementCommandsApi.ts` |
| Read model | `supabase/functions/_fleet-server/settlement_commands_controller.tsx` (1,726 ln, `GET /queue`), `driver_financial_periods.ts` (2,888 ln) |
| Close engine | `week_close.ts` (934 ln), `week_statements.ts`, `settlement_period_freeze.ts`, `*_week_seal.ts` |
| Math | `packages/finance-core/src/` — `driverPeriodSettlement.ts`, `driverSettlementMath.ts`, `periodInvariants.ts`, `closeInvariants.ts`, `periodPersistBody.ts`, `statementEngineCompare.ts`, `period_projector.ts` |

**Related prior audits (read first, not repeated here):** `RECONCILIATION_SYSTEM_AUDIT.md` (5 passes, closed), `DRIVER_SETTLEMENTS_AUDIT.md` (7 passes), `SETTLEMENT_CALCULATION_AUDIT.md`, `docs/FINANCIAL_INTEGRITY_AUDIT.md`.

---

## 0.1 Pass 7 — verification (current status)

**Method:** every Pass-5 open finding re-checked against commit `55361643` (working tree clean). Executed: **150 finance-core + 1,321 fleet vitest**, **8 Deno freeze tests**, and both CI guards.

```
verify_service_line_filter_parity: OK (9 fixtures)
assert-ledger-view-invoker:        OK (476 migrations, 15 wrapper views)
deno test settlement_period_freeze: ok | 8 passed | 0 failed
```

### Verdict — this section is done

**Every Critical, High, Performance and Redundancy finding across seven passes is now closed.** Two cosmetic items remain (R-3, U-1), neither affecting money, correctness, or speed. One trivial new item (N-13).

Three of the five Pass-5 fixes were done *better* than specified:

- **N-8** — the actual bug (metadata destruction) was fixed at the root, and the preservation guard uses `hasOwnProperty` rather than a truthiness check, so a legitimate **`0` trip count is preserved rather than dropped**. That subtlety is what would have made a naive fix silently re-introduce the divergence. The new `verify_service_line_filter_parity.mjs` doesn't just mirror both predicates in JS — it **reads the real source** and asserts `metadata->>rushTripCount.is.null` is present in the TS filter, `COALESCE((p_metadata->>'rushTripCount')` in the migration, and both keys in `PRESERVED_PERIOD_META_KEYS`. That anchoring is what stops it becoming a mirror-of-a-mirror.
- **N-11** — I asked for *"batch the statements, or document the limitation."* You did both, plus built the recovery: `retryFreezeWeek` (`week_close.ts:993`) freezes only drivers whose statements are already sealed, wired end-to-end through `POST /retry-freeze` → `weekCloseApi.retryFreeze` → a CloseWeekPage handler that catches `ATOMIC_FREEZE_FAILED` and offers the retry. It batches its statement reads via `getLatestWeekStatementsForOrgWeek`, so the recovery path didn't reintroduce the N+1.
- **N-12** — I flagged `threshold: Number.MAX_SAFE_INTEGER` as an acceptable correctness-first trade. You replaced it with the real `FlatItem` flatten pattern instead; the code comment reads *"no MAX_SAFE_INTEGER bandage."*

### Status

| ID | Item | Status | Evidence |
|---|---|---|---|
| **N-8** | Cash sync strips service-line keys | ✅ **Closed** | `PRESERVED_PERIOD_META_KEYS` +2 keys with `hasOwnProperty` zero-safety (`periodSignedSnapshot.ts:41-55`); null-tolerant filter (`driver_financial_periods.ts:489-494`); parity guard with source anchors. |
| **N-9** | Invoker guard not in CI | ✅ **Closed** | `.github/workflows/ci.yml:39,41` — both new guards alongside the eight existing ones. |
| **N-10** | Batch freeze could write NULL | ✅ **Closed** | `COALESCE(NULLIF(r->>'close_hash',''), '')` + follow-up migration `20260908240000`. |
| **N-11** | Atomic boundary excluded statements | ✅ **Closed** | Documented at `week_close.ts:12` **plus** `retryFreezeWeek` + `/retry-freeze` route + UI recovery. |
| **N-12** | Virtualization disabled, not fixed | ✅ **Closed** | `MovementHistoryTable.tsx:117-134` — flattened, then windowed. |
| **R-4** | Redundant fallback row set | ✅ **Closed** | `outstandingAllRows` removed. |
| **U-5** | No diff of what a close did | ✅ **Closed** | Confirm dialog lists per-driver amounts to be frozen before signing (`CloseWeekPage.tsx:349, 1050-1094`). |
| **R-3** | Legacy `saveTransaction` fallbacks | ❌ **Open** | 3 sites: `DriverSettlementsPage.tsx:1280, 1364, 1424`. |
| **U-1** | Blocked reason only in `title` | ❌ **Open** | Disabled buttons still carry the reason only in `title=`; the chips (`:482-490`) name the state ("Locked") but not the action. |
| **N-13** | *(new, trivial)* | ❌ **Open** | `scripts/verify_service_line_filter_parity.mjs:12-32` — `rpcMatches` is dead code with redundant branches; only `rpcMatchesCoalesce` is used. Dead logic inside a guard is exactly what R-1 was about. Delete it. |

**Cumulative across 7 passes: 45 closed · 2 open · 1 trivial.**

### What's left — all optional

| # | Item | Effort | Why it can wait |
|---|---|---|---|
| 1 | **R-3** — remove the 3 legacy `saveTransaction` fallbacks | ~30 min | Each is a second write path that bypasses movements, CAS and the freeze — but it only fires when the commands endpoint returns *unavailable*, which hasn't happened since the cutover. Worth deleting so it can't silently become the live path. |
| 2 | **U-1** — make the blocked-row reason reachable | ~1 hr | Accessibility, not correctness. Move the reason out of `title` on a disabled control — either an `aria-describedby` chip or an enabled-and-explaining button. |
| 3 | **N-13** — delete `rpcMatches` | 2 min | Cosmetic. |

Nothing here blocks a deploy, and nothing here affects a number on screen.

---

## 0.3 Pass 5 — verification *(historical)*

**Method:** every Pass-3 open/partial/new finding re-checked against the working tree. Tests executed: **148 finance-core + 1,321 fleet, green** (finance-core dropped 151→148 because R-1's `shadowCompare` tests were removed with the dead code — expected). Invoker guard executed: `OK (475 migrations, 15 wrapper views, all latest defs invoker)`.

### ✅ The deploy blocker is cleared — and over-delivered

**N-1 was fixed better than I asked.** Not only was `WITH (security_invoker = true)` added to the offending migration, a hotfix (`20260908210000`) re-asserts it across **seven** `public.*`→`ledger.*` wrapper views, and `scripts/assert-ledger-view-invoker.mjs` now enforces the rule by scanning the *chronologically latest* recreate of every 1:1 wrapper. That last detail is the right design — it permits historical migrations that omitted the clause while catching any future regression. Wired into `deploy:edge`.

The other structural work is also genuinely good:

- **N-2** — `sum_settlement_queue_totals` RPC returns exact `COUNT(*)` + `SUM(...)` in SQL. Correct `SECURITY DEFINER` hygiene: `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO service_role`, `RAISE EXCEPTION 'ORG_REQUIRED'` on null org, pinned `search_path`. No PostgREST row cap, no JSONB transfer.
- **H-2** — `freeze_settlement_periods_batch(jsonb)` applies every freeze in one transaction, with a fail-closed `ATOMIC_FREEZE_FAILED` message that names the exact recovery, plus a count-mismatch warning.
- **P-1/P-2** — `await import(…)` hoisted out of both loops; `mapPool` bounds concurrency; drift upserts flushed once after the loop; `weekPnlTieSides` batches the statement reads that N-4 flagged.
- **H-8** — the JS `periodMetadataMatchesServiceLine` predicate was **deleted entirely** and pushed into SQL both in the RPC (`dfp_service_line_matches`) and in the list queries (`applyServiceLineSqlFilter`, before `.range()`).
- **P-5** — `SettlementQueueTable` now windows a genuinely **flattened** list (`FlatRollupItem` = header rows + expanded week rows), which is the correct fix, not a workaround.
- **N-3** — `SETTLEMENT_PNL_MISMATCH` restored to `severity: "block"` on both the preview and close paths, now that H-4 made the tie non-tautological.

### Status of everything still tracked

| ID | Item | Status | Evidence |
|---|---|---|---|
| **N-1** | Migration dropped `security_invoker` | ✅ **Closed** | Both migrations carry `WITH (security_invoker = true)`; hotfix covers 7 views; guard script passes. |
| **N-2** | Aggregates unbounded / PostgREST-capped | ✅ **Closed** | `20260908220000_settlement_queue_sql_aggregates.sql`; `rpcSettlementQueueTotals` at `driver_financial_periods.ts:495`. |
| **N-3** | P&L tie downgraded to `warn` | ✅ **Closed** | `week_close.ts:373, 686` — `severity: "block"`. |
| **N-4** | Third per-driver statement fetch | ✅ **Closed** | `weekPnlTieSides(orgId, week, driverIds)` — one batched call (`:363, :676`). |
| **N-5** | Lane metrics half-adopted | ✅ **Closed** | `settlementLaneMetrics.ts` now imported by **both** `CloseWeekPage` and `DriverSettlementsPage:778`. |
| **N-6** | `MONEY_LOCKED` unhandled client-side | ✅ **Closed** | `isMoneyLockedError` + `MoneyLockedDialog.tsx`. |
| **N-7** | Stale banner copy / page-scoped `byAge` | ✅ **Closed** | Copy fixed (`:1867`); `byAge`/`byDriver` removed. |
| **H-2** | Close not atomic | ✅ **Closed** *(residual → N-11)* | `freeze_settlement_periods_batch` RPC; `week_close.ts:923-945`. |
| **H-4** | P&L tie tautological | ✅ **Closed** | `weekPnlTieSides` in `business_week_pnl.ts`. |
| **H-8** | Service line filtered after `.range()` | ✅ **Closed** *(but see N-8)* | JS predicate deleted; `applyServiceLineSqlFilter:479`. |
| **P-1 / P-2** | Close N+1, serial | ✅ **Closed** | `mapPool:56`; import hoisted to `:30`; drifts flushed at `:948`. |
| **P-4** | 5,000 txs to browser | ✅ **Closed** | `overlayTxsQuery` scoped to driver+week (`:2327`). |
| **P-5** | Fixed row height vs expandable rows | ✅ **Closed** *(one caveat → N-12)* | `flatRollupItems` + `useWindowedRows(flatRollupItems)` (`SettlementQueueTable.tsx:240-252`). |
| **P-7** | KPI arithmetic unmemoized | ✅ **Closed** | `laneMetrics = useMemo(...)` (`:778`). |
| **R-1** | `shadowCompare…` dead weight | ✅ **Closed** | Gone from `week_statements.ts`, `index.ts`, `weekStatement.ts`. |
| **R-2** | `signed_at` read, never written | ✅ **Closed** | Both reads removed (`week_close.ts:142`). |
| **U-3** | `blockedExposure` inferred basis | ✅ **Closed** | `settlementLaneMetrics.ts:44-57` values each lane explicitly. |
| **U-6** | Restatement counts disagree | ✅ **Closed** | Server-side dedup (`week_close.ts:392`). |
| **R-3** | Legacy `saveTransaction` fallbacks | ❌ **Open** | 3 sites: `DriverSettlementsPage.tsx:1289, 1373, 1433`. |
| **R-4** | Redundant fallback row set | ⚠️ **Partial** | `collectOutstandingAll` gone; `outstandingAllRows:661` remains as a count fallback. |
| **U-1** | Blocked reason only in `title` | ❌ **Open** | No `aria-*` / visible-reason changes in `SettlementQueueTable`. |
| **U-5** | No diff of what a close did | ❌ **Open** | Still a toast + driver count (`CloseWeekPage.tsx:537, 1201`). |

**Cumulative: 38 closed · 1 partial · 3 open · 5 new.**

---

## 0.4 New findings from Pass 5

### N-8 · 🟠 **HIGH — every money movement strips the service-line keys the new SQL filter depends on**

**Files:** `packages/finance-core/src/periodSignedSnapshot.ts:41`, `periodPersistBody.ts:58-107`, `driver_financial_periods.ts:479-493, 1366-1367`

The full rebuild writes `rushTripCount` / `rideshareTripCount` at the top level of `metadata` (`driver_financial_periods.ts:1366-1367`). But `buildPeriodMetadata` reconstructs metadata from scratch on every cash sync, preserving only:

```ts
export const PRESERVED_PERIOD_META_KEYS = ['signedSnapshot'] as const;
```

Neither trip-count key is preserved, and neither is re-emitted. **So every `/collect`, `/pay`, `/write-off`, `/reverse`, `/verify` and `/approve` deletes both keys** — `syncPeriodCashFromTransactions` → `buildPeriodMetadata` → `buildCashSettlementPersistFields` → `metadata: periodMetadata`.

That was harmless while service line was a JS post-filter reading a missing key as `undefined`. **H-8 made it matter**, because the two new SQL predicates disagree about a missing key:

| Path | Expression | Row with keys stripped |
|---|---|---|
| List (`applyServiceLineSqlFilter:487`) | `metadata->>rushTripCount.eq.0` | `->>` yields **NULL**; `NULL = '0'` is NULL → **row excluded** |
| Totals (`dfp_service_line_matches`) | `COALESCE((metadata->>'rushTripCount')::numeric, 0) = 0` | coalesces to 0 → both-zero → match-all → **row included** |

**Failure scenario.** Scope the desk to Rideshare. A week you collected cash on last Tuesday had its trip-count keys stripped by that collection. The row **vanishes from the queue** while its amount **stays in the "Total exposure" total.** Footer and headline disagree, and the operator cannot find the row that explains the difference — the precise "things aren't in sync" symptom this audit exists to eliminate.

Secondary: `applyServiceLineSqlFilter` compares **text**, not numbers (`->>` returns text, so `.gt.0` is a lexicographic test). It happens to work for small integers but is fragile.

**Fix — three parts, all small:**
1. Add `'rushTripCount'` and `'rideshareTripCount'` to `PRESERVED_PERIOD_META_KEYS`. *(This is the actual bug — the data should not be destroyed by a cash sync.)*
2. Make the two predicates agree on a missing key. Simplest: have `applyServiceLineSqlFilter` also treat NULL as match-all — add `metadata->>rushTripCount.is.null` to each `or(...)` branch.
3. Add a parity test in the same spirit as the existing `verify_settlement_predicate_parity.mjs` CI guard, asserting list-filter and RPC agree on the three cases: key present-nonzero, present-zero, absent.

### N-9 · The invoker guard runs on deploy, but not in CI

`package.json:68` chains `assert-ledger-view-invoker` into `deploy:edge`. `.github/workflows/ci.yml` runs **eight** sibling guards (`check-toll-core-parity`, `verify_settlement_predicate_parity`, `check-fuel-org-scope`, …) but not this one.

So a PR that regresses `security_invoker` goes green and is only caught at deploy — after review has passed. Given N-1 was the *third* occurrence, this belongs next to the others:

```yaml
      - name: Check ledger view invoker
        run: node scripts/assert-ledger-view-invoker.mjs
```

### N-10 · The batch freeze can write NULL into a `NOT NULL` column — and now fails the whole week

**File:** `20260908230000_freeze_settlement_periods_batch.sql:25`

```sql
source_event_hash = NULLIF(r->>'close_hash', ''),
```

`source_event_hash` is `TEXT NOT NULL DEFAULT ''` (`20260717140000_driver_financial_ledger_rebuild.sql:155`). An empty or absent `close_hash` writes NULL → constraint violation → **the entire transaction rolls back and no driver closes.** Before H-2 this would have failed one driver.

The codebase already knows this rule — `reopenWeek` carries the comment *"Column is NOT NULL DEFAULT '' — never write null."* In practice `buildCloseHash` always returns a SHA-256 hex string, so this is latent, not live. But atomicity converts a one-driver failure into a whole-week failure, which is exactly the case to be defensive about.

**Fix:** `COALESCE(NULLIF(r->>'close_hash', ''), '')` — or drop the `NULLIF` entirely.

### N-11 · H-2's atomic boundary excludes statement closing

**File:** `week_close.ts:903-931`

`closeWeekStatements(orgId, driverId, week, …)` still runs **inside the per-driver loop**, before the batched freeze. Only the freeze is transactional. If the batch RPC fails, statements are already `closed` for every driver while no period is frozen.

The code handles this honestly — `ATOMIC_FREEZE_FAILED` says *"N drivers signed statements but calendar freeze did not apply; retry close"* — and retry is idempotent, so this is acceptable operationally. But the doc-level claim "close is atomic" is only true of the freeze. Either batch the statement close into the same transaction, or record here that the close is **atomic-freeze, at-least-once-statements**.

### N-12 · `MovementHistoryTable` disabled virtualization rather than fixing it

**File:** `MovementHistoryTable.tsx:116`

```ts
useWindowedRows(groups, { threshold: Number.MAX_SAFE_INTEGER })
```

This removes the correctness bug by turning windowing off permanently, so Done / Awaiting render every row. Fine at the current `pageSize: 500` movements cap, and a legitimate correctness-first trade. Worth recording as a deliberate choice rather than an oversight, since the same `FlatRollupItem` pattern that fixed `SettlementQueueTable` would work here.

---

## 0.5 Pass 3 — verification of the implementation *(historical)*

**Method:** every Pass-1 finding re-checked against the working tree, not against the changelog. Tests executed: **151 finance-core + 1,321 fleet, all green** (1 skipped). Deno freeze tests read directly.

### Verdict on the work

**All five Criticals are closed, and closed properly — with tests that can actually fail.** `settlement_period_freeze.test.ts` asserts `MONEY_LOCKED` on missing-flag and `PERIOD_FROZEN` on a frozen week; the golden tests pin `reconciliation_status` away from calendar close. This is the first pass in this codebase's audit history where the *last connection* — the one that makes a control able to fail — was wired on the first attempt for every Critical. That's the pattern breaking.

**Seven new findings, one of them Critical**, and it is a security regression introduced by the C-2/C-3 migration (**N-1**). Fix that before deploying.

**Twelve Pass-1 items remain open** — almost entirely Phase 4 (performance) and Phase 5 (consolidation), which is the correct order. The one structural item still open is **H-2** (atomic close).

### Status of every Pass-1 finding

| ID | Item | Status | Evidence |
|---|---|---|---|
| **C-1** | Freeze bypassable on 4 of 7 money routes | ✅ **Closed** | `assertMovementAllowed` in `insertMovementAndDualWrite:341` (covers `/collect` `/pay` `/write-off` `/runs`) + `/reverse:724,806`, `/verify:1006`, `/approve:1290`; `assertFrozenPeriodHashIntact` on all. Deno tests at `settlement_period_freeze.test.ts:30,46`. |
| **C-2** | `settlement_paid` clamped at persist | ✅ **Closed** | `periodPersistBody.ts:163` signed; migration drops `settlement_paid >= 0` from the nonneg CHECK. |
| **C-3** | `status`/`closed_at` two writers | ✅ **Closed** | New `reconciliation_status` column; `periodPersistBody.ts:149` no longer emits `status`/`closed_at`; rebuild upsert `driver_financial_periods.ts:1593` comments and omits them. Golden test at `periodPersistBody.characterization.golden.test.ts:44`. |
| **C-4** | Page-scoped totals | ✅ **Closed** *(2 caveats → N-2, N-3)* | `aggregateCompanyOwesPeriods` / `aggregateDriverOwesPeriods` / `aggregateCashHeldPeriods`; wired at `settlement_commands_controller.tsx:1698-1722`. UI banner re-keyed to `page.hasMore` (`DriverSettlementsPage.tsx:815`). |
| **C-5** | `moneyUnlocked` fails open | ✅ **Closed** | `settlement_period_freeze.ts:59` — `fc.moneyUnlocked === true \|\| forceRelease`; enforced server-side via `requireMoneyUnlocked: opts.kind === "collect"` (`:348`). |
| **H-1** | `previewWeekClose` writes | ✅ **Closed** | Preview is pure (`week_close.ts:307-318`); `prepareWeekClose:574` split out and wired to a UI button (`CloseWeekPage.tsx:659`). |
| **H-2** | `closeWeek` not atomic | ❌ **Open** | Still a per-driver loop with one `UPDATE` each and `throw` on error — `week_close.ts:691, 880, 888`. No transaction or RPC. |
| **H-3** | P&L tie attributed to random driver | ✅ **Closed** | `weekBlockers[]` added (`week_close.ts:207, 322, 382, 563`); per-driver attribution removed (`:513`). |
| **H-4** | P&L tie near-tautological | ⚠️ **Partial** | Earnings/fuel now read from statements (`week_close.ts:345-353`) — **but the toll term still comes from projection columns** (`:360-364`) in the statement branch too. Also introduced a new N+1 → **N-4**. |
| **H-5** | Negative `cash_still_held` ignored | ✅ **Closed** | `CASH_HELD_OVER_RETURNED` blocker at `closeInvariants.ts:566-569`. |
| **H-6** | Three input contracts, one engine | ✅ **Closed** | Clamps removed from `driverSettlementMath.ts:39` and `periodInvariants.ts` (zero `Math.max` remaining). |
| **H-7** | Cash-held post-filter after paging | ✅ **Closed** | `.not("settlement_status","in",…)` pushed into SQL — `driver_financial_periods.ts:2686` (list) and `:2355` (aggregate). |
| **H-8** | Service line filtered after `.range()` | ❌ **Open** | 9 `periodMetadataMatchesServiceLine` call sites still post-SQL. |
| **H-9** | Reopen blanks close hash | ✅ **Closed** | `prior_close_hash` in `settlement_period_freeze.ts`. |
| **H-10** | Reopen risk gate only saw payouts | ✅ **Closed** | `settlementRiskForPeriod` now includes `cash_collected`, `cash_returned`, `cash_written_off` (`week_close.ts:135-142`). |
| **P-1** | Close N+1, serial | ❌ **Open** | `await import("./toll_financial_reset.ts")` still **inside** both loops (`week_close.ts:463, 750`). No `Promise.all`/concurrency anywhere in the file. |
| **P-2** | Statements fetched twice per driver | ❌ **Open — worse** | Now fetched a **third** time by H-4's new loop. See **N-4**. |
| **P-3** | Whole driver table per queue request | ✅ **Closed** | Targeted `nameById` build (`settlement_commands_controller.tsx:1568-1580`); `getByPrefix("driver:")` gone. |
| **P-4** | 5,000 txs to browser, passed as prop | ❌ **Open** | `limit: 5000` (`DriverSettlementsPage.tsx:582`); `transactions={txsQuery.data \|\| []}` (`:2268`). |
| **P-5** | Fixed 52px row height vs expandable rows | ❌ **Open** | `useWindowedRows.ts:21` unchanged. |
| **P-6** | Refresh performs a repair mutation | ✅ **Closed** | `refreshAll` is invalidate-only; `repairOrphanMirrors` split into its own action. |
| **P-7** | KPI arithmetic unmemoized | ❌ **Open** | `settledOwesTotal:748`, `cashHeldKpiTotal:751`, `blockedExposure:764`, `awaitingPayTotal:770` still in the component body. |
| **P-8** | No debounce on search/minAmount | ✅ **Closed** | `SettlementFilters.tsx:45-49, 119, 135`. |
| **U-1** | Blocked reason only in `title` | ❌ **Open** | |
| **U-2** | "Total exposure" adds opposite signs | ✅ **Closed** | Split into Fleet owes / Drivers owe / Cash held / **Net (liability − receivable), custody separate** — `DriverSettlementsPage.tsx:1752-1780`. Good fix. |
| **U-3** | `blockedExposure` infers basis from optional field | ❌ **Open** | |
| **U-4** | Settlement lane implemented twice | ⚠️ **Partial** | `utils/settlementLaneMetrics.ts` created — but imported **only by `CloseWeekPage`**. `DriverSettlementsPage` still has its own copy. See **N-5**. |
| **U-5** | No diff of what a close did | ❌ **Open** | |
| **U-6** | Draft-restatement counts disagree | ❌ **Open** | Server still counts raw drafts (`week_close.ts` restatement count). |
| **R-1** | `shadowCompare…` dead weight | ⚠️ **Partial** | Removed from `driver_financial_periods.ts:1468` — **still live at `week_statements.ts:251`** and still exported from `index.ts:145`. |
| **R-2** | `signed_at` read, never written | ⚠️ **Partial** | Removed at `week_close.ts:120` — **still read at `:424`**. |
| **R-3** | Legacy `saveTransaction` fallbacks | ❌ **Open** | 3 sites: `DriverSettlementsPage.tsx:1260, 1339, 1394`. |
| **R-4** | `collectOutstandingAll` redundant | ❌ **Open** | |

**Tally: 19 closed · 4 partial · 12 open · 7 new.**

---

## 0.6 New findings from Pass 3

### N-1 · 🔴 **CRITICAL — the new migration silently reverts `public.driver_financial_periods` to security-definer**

**File:** `supabase/migrations/20260908200000_settlement_paid_signed_reconciliation_status.sql:33-36`

```sql
CREATE OR REPLACE VIEW public.driver_financial_periods AS
  SELECT * FROM ledger.driver_financial_periods;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
```

**No `WITH (security_invoker = true)`.** In PostgreSQL, `CREATE OR REPLACE VIEW` issues an unconditional `AT_ReplaceRelOptions` against the view — an omitted `WITH` clause **resets reloptions to empty**, dropping `security_invoker`. The view then executes as its owner and **bypasses RLS on `ledger.driver_financial_periods` for every `authenticated` role.**

This is not theoretical for this repo:

- `20260718161000_rls_wave1_view_invoker.sql` explicitly set `security_invoker = true` on this exact view (the "definer bypass fix").
- The immediately preceding migration, `20260906010000_settlement_movements_and_period_version.sql:94-97`, **respecifies `WITH (security_invoker = true)`** when replacing the same view — someone already hit this.
- The new migration sorts *after* both, so it runs last and wins.
- There is **no CI guard or test asserting invoker mode** anywhere in the repo (`scripts/`, `supabase/functions/`, `.github/` all clean).

Every driver's settlement row — earnings, cash, payouts — becomes readable cross-tenant by any authenticated session. This intersects directly with the standing Supabase RLS exposure findings.

**Fix (one line):**

```sql
CREATE OR REPLACE VIEW public.driver_financial_periods
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_financial_periods;
```

**And add the guard**, because this is now the third time: a migration test — or a startup assertion — that fails when any `public.*` wrapper view over `ledger.*` lacks `security_invoker`. Without it this recurs on the next `CREATE OR REPLACE VIEW`.

### N-2 · The C-4 aggregates are unbounded full-table reads that pull JSONB

**File:** `driver_financial_periods.ts:2290-2380`

All three aggregates do `.select("settlement_amount, metadata")` (or `cash_still_held, metadata, settlement_status`) with **no `.range()` and no `limit`**, then count and sum in JavaScript. Two consequences:

1. **PostgREST applies its own default max-rows cap** (commonly 1,000). Past that, the aggregate is silently truncated — which re-introduces C-4's understatement at exactly the scale C-4 was fixed for, with no warning. The `try/catch` at `:1715` falls back to the page window on error, but a truncated-yet-successful response isn't an error.
2. **`metadata` is a large JSONB blob**, fetched for every matching row on every queue request, purely to support the service-line filter (which is usually absent).

**Fix.** Use `count: 'exact', head: true` for the count and a Postgres RPC returning `SUM(...)` for the amount — neither transfers rows. Failing that: drop `metadata` from the select when `opts.serviceLine` is unset, and add an explicit high `.limit()` plus a `truncated: true` flag on the response so the UI can say so.

### N-3 · `SETTLEMENT_PNL_MISMATCH` was downgraded from `block` to `warn`

**File:** `week_close.ts:384`

The H-3 rework moved the P&L tie into `weekBlockers` with `severity: "warn"`. In Pass 1 it was `block` (`closeInvariants.ts` `pushIfDrift` defaults to `block`). **A week whose driver settlements don't tie to Business Finance P&L now closes.**

This may well be deliberate — the check was non-deterministically attributed and H-4 shows it is still partly tautological, so blocking on it would have been noisy. But it is a control weakening that isn't recorded anywhere, and combined with H-4 being only partial it means **the settlement↔P&L tie currently stops nothing.** Decide explicitly: either finish H-4 and restore `block`, or document the downgrade in `CLOSE_VOCABULARY` so the next reader knows the tie is advisory.

### N-4 · H-4's fix added a third per-driver statement fetch

**File:** `week_close.ts:341-378`

`settlementSumForWeek` now runs `await getLatestWeekStatements(orgId, driverId, week)` in its **own sequential loop over every driver**, before the main driver loop — which fetches the same statements again (and `ensureCloseLaneStatements` fetches them a third time on the prepare/close path).

For a *week-level* aggregate this is the wrong shape entirely: it should be one query for all drivers' statements for the week. As written it makes P-1 measurably worse in the same file the P-1 fix is supposed to land in.

### N-5 · `settlementLaneMetrics.ts` was built but only half-adopted

**Files:** `apps/fleet/src/utils/settlementLaneMetrics.ts` (new), imported only by `CloseWeekPage.tsx`

`DriverSettlementsPage.tsx:748-770` still computes `settledOwesTotal` / `cashHeldKpiTotal` / `fleetOwesTotal` / `blockedExposure` inline. U-4's whole point was that the two screens can disagree; extracting the helper and adopting it on one screen leaves the divergence in place while making it *look* solved. (Adopting it also closes P-7 for free, since the helper can be memoized once.)

### N-6 · `MONEY_LOCKED` has no client handling

**File:** `apps/fleet/src/services/settlementCommandsApi.ts:49-55`

`isPeriodFrozenError` maps `PERIOD_FROZEN` to the `PeriodFrozenDialog`. The new `MONEY_LOCKED` code from C-5 has no equivalent — a blocked collect surfaces as a raw error toast containing the server string. Since C-5 now genuinely blocks server-side (correctly), this path *will* be hit. Add `isMoneyLockedError` and a short dialog pointing at the fuel/toll lanes, mirroring the frozen-week dialog.

### N-7 · Two cosmetic leftovers from the C-4 fix

- **`byAge` / `byDriver` are still page-scoped** (`settlement_commands_controller.tsx:1622-1627`, computed over `filtered`). Nothing consumes them today, but they are now inconsistent with `totals` on the same response — a trap for the next consumer.
- **The incompleteness banner copy is stale.** The condition was correctly re-keyed to `page.hasMore` (`DriverSettlementsPage.tsx:815`), but the text still reads *"Totals may be incomplete **for All open** — narrow the week range"* (`:1819`). It now fires for any range, so the message misdirects.

---

## 0.7 Verdict (Pass 1 — retained for the record)

**Your instinct is half right, and the half that's right matters more than you think.**

**The core arithmetic is correct.** `computePeriodSettlementMinor` is integer-minor, sign-continuous across zero, and the identity `settlement = grossSettlement − settlementPaid` holds without branching. The five prior audit passes did real work: the C-1 sign inversion, the C-2 unfloored residual, the C-4 floored headline and the C-5 double-bucketed refund are genuinely fixed at the engine. I re-derived the formula and could not break it.

**What is not right is everything around the engine.** The problems I found are almost all at *boundaries* — where a correct number is written to disk, read back, paged, totalled, or gated. Specifically:

1. **The Close Week freeze — the entire point of the close program — is bypassable by four of the seven money-moving endpoints.** `/reverse`, `/verify`, `/approve` and the `/runs` batch never call `assertPeriodNotFrozen`. A signed, hash-sealed week will accept money through the batch button on your own desk.
2. **A deliberately-signed value is clamped at the persist boundary.** `settlement_paid` is written as `Math.max(0, …)` while `settlement_amount` is computed from the signed value. When reversals exceed payouts these two columns are inconsistent *on disk*, and the invariant checker then reports the healthy row as drifted.
3. **The `status` and `closed_at` columns have two writers with two different meanings.** A routine projection rebuild silently nulls `closed_at` on a week you signed.
4. **The headline "Total exposure" number is a page total, not a query total.** It is correct today only because you have four drivers.

So: the calculation is trustworthy; **the controls around it are not, and the numbers on screen are page-scoped rather than query-scoped.** That is exactly what "things aren't in sync" feels like from the operator's seat.

**Does it need a new architecture? No.** The statement-contract architecture from the last audit is the right one and is 90% built. What it needs is the *last connection* on each control — which is, verbatim, the recurring lesson recorded at the end of the previous five passes:

> the mechanism gets built correctly and the last connection — the one that makes it able to FAIL — is what gets left out.

Six of the fourteen findings below are new instances of that same pattern.

**On speed:** nothing here is slow *today* at ~4 drivers and ~36 weeks. But there are four hard scaling cliffs (§4) that turn a 300 ms page into a 30 s page somewhere between 20 and 50 drivers, and one of them — the close preview — will hit the edge-function wall-clock limit and simply start failing rather than degrading.

**Severity roll-up:** 5 Critical · 10 High · 7 Performance · 6 UX · 4 Redundancy.

---

## 1. How the section actually works today

Worth stating plainly, because the mental model is what makes the findings legible.

```
  TRIPS / FUEL / TOLL / CASH  (operational truth)
             │
             ▼
   ┌──────────────────────┐   three independent sealers
   │  sealFuelWeek        │   fuel_week_seal.ts
   │  sealTollWeek        │   toll_week_seal.ts
   │  sealEarningsWeek    │   earnings_week_seal.ts
   └──────────┬───────────┘
              ▼
      week_statements  ────────────►  signed, immutable, versioned
              │                        (status: draft | closed | restated)
              │  PROJECTION_READS_WEEK_STATEMENTS = true
              ▼
   driver_financial_periods            ← the projection / read model
     · computePeriodSettlementMinor        (the money engine)
     · derivePeriodStatus                  (the gate: moneyUnlocked)
     · buildCashSettlementPersistFields    (the write boundary)  ← 2 of 5 Criticals live here
              │
      ┌───────┴────────┐
      ▼                ▼
  GET /queue      previewWeekClose / closeWeek
  (collect/pay/    · checkCloseInvariants
   reconciled)     · compareDriverWeekStatementsToEngines
      │            · markPeriodFrozen + closeHash
      ▼                ▼
  Cash desk        Close Week screen
```

**Three gates stack on every row**, and the desk renders all three:

| Gate | Source | Meaning | Enforced server-side? |
|---|---|---|---|
| `weekActionable` | calendar (`isSettlementPeriodEnded`) | week is over | ✅ `assertPeriodEndedForSettlement` |
| `moneyUnlocked` | `derivePeriodStatus` (fuel finalized ∧ tolls clear) ∨ forceRelease | reconciliation done | ⚠️ UI-only — see **C-5** |
| `periodFrozen` | `markPeriodFrozen` metadata | week signed on Close Week | ⚠️ 3 of 7 routes — see **C-1** |

The design is sound. The enforcement is uneven.

---

## 2. Critical findings

### C-1 · The week-close freeze is bypassable on four of seven money endpoints

**Files:** `settlement_commands_controller.tsx:318-347` (shared helper), `:650` `/reverse`, `:852` `/verify`, `:1016` `/runs`, `:1208` `/approve`

Only three routes assert the freeze:

| Route | `assertPeriodNotFrozen` | `assertFrozenPeriodHashIntact` |
|---|---|---|
| `POST /collect` `:480` | ✅ | ✅ `:485` |
| `POST /pay` `:543` | ✅ | ✅ `:548` |
| `POST /write-off` `:618` | ✅ | ✅ `:623` |
| `POST /reverse` `:650` | ❌ | ❌ |
| `POST /verify` `:852` | ❌ | ❌ |
| `POST /runs` (batch) `:1016` | ❌ | ❌ |
| `POST /:movementId/approve` `:1208` | ❌ | ❌ |

The shared writer `insertMovementAndDualWrite` (`:318`) asserts only `assertPeriodEndedForSettlement` (`:339`) and claims the CAS lock (`:342`). `claimPeriodWriteLock` (`:183-219`) does a `row_version` CAS and **no freeze check**. So the batch path — the one behind your own "Pay selected (N)" button — posts money to signed weeks.

`/approve` is the worst of the four: a payout can be queued for maker-checker approval *before* close and approved *after* close, moving money out of a hash-sealed week with a full audit trail that looks legitimate.

**Corroborating evidence that this is an omission, not a decision:** the client already handles the error the server never raises. `DriverSettlementsPage.tsx:1531-1537` inspects batch row errors for `PERIOD_FROZEN` and opens `PeriodFrozenDialog`. The UI expects the guard; the server doesn't have it.

**Failure scenario.** Close week 2026-08-24 (all four drivers signed, close hash stored). A payout logged on Aug 26 sits `pending`. An operator clicks Verify on the Awaiting-clear tab. `/verify` flips it to posted, `syncPeriodCashFromTransactions` runs with `allowFrozen: true`, `settlement_paid` changes, `settlement_amount` changes — and `assertFrozenPeriodHashIntact` now fails on the *next* collect/pay against that week with `HASH_MISMATCH`, with no indication of which write caused it.

**Fix.** Move both assertions into `insertMovementAndDualWrite` and into the `/reverse`, `/verify`, `/approve` handlers, immediately after `loadPeriodDb`. Reversal-on-a-closed-week is a legitimate business need — but it must go through the Restatement path (which re-signs), never through a silent write.

---

### C-2 · `settlement_paid` is clamped at the persist boundary; `settlement_amount` is not

**File:** `packages/finance-core/src/periodPersistBody.ts:150`

```ts
settlement_paid: round2(Math.max(0, input.settled.settlementPaid)),   // ← clamped
settlement_amount: settlementAmount,                                  // ← from the SIGNED value
```

`computePeriodSettlementMinor` deliberately passes `settlementPaid` through signed — `driverPeriodSettlement.ts:52-59` names it explicitly as a C-7 sign-drift field, because a net-negative paid figure is a real over-reversal (more money reversed than was ever paid out). `settlementMinor = grossSettlementMinor − settlementPaidMinor` uses the signed value.

Then the persist boundary clamps one side of that subtraction and not the other.

**Failure scenario.** Driver is paid $5,000; two reversals totalling $6,200 are posted (double-reversal, or a reversal of a payout that was itself re-posted). `settlementPaid = −1,200`.

- `settlement_amount` is computed from `−1,200` → gross **+** 1,200. Correct: the fleet owes the driver 1,200 more.
- `settlement_paid` is persisted as **0**.

Now `checkPeriodInvariants` (`periodInvariants.ts:99`) re-reads the row, maps `settlementPaid: Number(row.settlement_paid) || 0` = **0**, recomputes `settlement` = gross, and reports a **$1,200 `settlement_amount` drift on a row that is arithmetically correct.** Worse — if any repair path "corrects" `settlement_amount` to match the clamped input, the driver silently loses $1,200.

This is the C-7 clamp, removed from the engine in Pass 2, surviving at the write boundary. Exactly the recurring pattern.

**Fix.** Drop the `Math.max(0, …)`. Persist signed. If the column has a non-negative DB constraint, that constraint is the bug — drop it too, and add an invariant asserting `settlement_amount == gross − settlement_paid` reading both columns as persisted.

---

### C-3 · `status` / `closed_at` have two writers with incompatible meanings

**Files:** `period_projector.ts:56-62`, `periodPersistBody.ts:159-161`, `week_close.ts:797-806`, `:911-921`

Two independent things write the same two columns:

| Writer | `status` means | `closed_at` |
|---|---|---|
| `closeWeek` (`week_close.ts:799`) | **calendar week signed** | `now()` |
| `reopenWeek` (`:913`) | week reopened by admin | `null` |
| `buildCashSettlementPersistFields` (`periodPersistBody.ts:159`) | **toll workflow clear ∧ fuel finalized** (`derivePeriodStatus`) | `periodStatus === 'closed' ? existingClosedAt \|\| now : null` |

Every projection rebuild and every cash sync runs the third writer.

**Failure scenario.** Week signed on Close Week → `status='closed'`, `closed_at='2026-08-31T…'`. A new toll row arrives and lands `pending`, so `tollWorkflowActionable > 0`. The next rebuild computes `periodStatus = 'open'` (`period_projector.ts:57-62`) and writes `status: 'open'`, **`closed_at: null`**. The freeze itself survives (it lives in `metadata.financeCore.periodFrozen`, untouched) — so money stays blocked and nothing visibly breaks. But the record of *when the week was closed* is gone, and any report or query keyed on `status='closed'` now under-counts closed weeks.

Note the reverse hazard too: a week that was never calendar-closed but whose toll gate is clear gets `closed_at` stamped with `now()`. **`closed_at` currently means "toll gate was clear the last time this row was rebuilt."**

**Fix.** Split the columns. `status`/`closed_at` belong to the calendar close and are written only by `closeWeek`/`reopenWeek`. Give the projector its own column (`reconciliation_status`, or read it from the existing `payout_status`, which already carries `awaiting_tolls`/`awaiting_cash`/`finalized`). Add a guard in `buildCashSettlementPersistFields` refusing to write `status`/`closed_at` when `metadata.financeCore.periodFrozen === true`.

---

### C-4 · Queue totals are page-scoped, not query-scoped — the headline exposure number understates

**File:** `settlement_commands_controller.tsx:1619, 1616, 1545-1551`

```ts
const totalMinor = filtered.reduce((s, r) => s + r.amountOwedMinor, 0);
```

`filtered` derives from `raw`, which came from SQL with `.range(offset, offset + limit − 1)` where `limit = pageSize` (or `min(pageSize*3, 300)` when a search/age filter is active — `:1327`). **`totals.amountOwedMinor` is therefore the sum of at most one page.**

The desk consumes it as the authoritative total:

- `DriverSettlementsPage.tsx:759-762` — `fleetOwesTotal` prefers `totals.amountOwedMinor`
- `:769` — `totalExposure` = the "Total exposure" headline
- `CloseWeekPage.tsx:311` — Settlement lane "Fleet owes"

`page.total` is worse — in the non-slice branch (`:1616`) it is *fabricated*:

```ts
total = offset + pageRows.length + (raw.length >= sqlLimit ? pageSize : 0);
```

That is a guess, and it drives the "showing N of M" footer (`SettlementQueueTable.tsx:249`) and the `fleetOwesWeekCount` KPI subtitle ("N weeks", `DriverSettlementsPage.tsx:765-766`).

`aggregates.byAge` / `byDriver` (`:1545-1551`) are computed over the same window.

**Why you haven't seen it:** pageSize is 200 and you have ~4 drivers × ~36 weeks. The guard `kpiTotalsPossiblyIncomplete` (`DriverSettlementsPage.tsx:821-828`) only fires when **All open** is toggled — a filtered range that still exceeds 200 rows warns about nothing.

**Fix.** Compute totals with a separate aggregate query (`SUM(…)` + `count: 'exact', head: true`) unconstrained by `.range()`. Return `totals` and `page.total` from that, and `amountDisplayedMinor` from the page. Then delete the `allOpen` condition from the incompleteness banner — it should key on `page.hasMore`.

---

### C-5 · The `moneyUnlocked` reconciliation gate fails **open**

**File:** `driver_financial_periods.ts:2574`

```ts
moneyUnlocked: fc.moneyUnlocked !== false,
```

Any period row whose `metadata.financeCore.moneyUnlocked` is absent — legacy rows, imported rows, rows written before the projector shipped, rows whose metadata was truncated — resolves to **`true`**, and the desk enables Collect (`SettlementQueueTable.tsx:42-44, 54-58`).

The comment on H-1 (`useSettlementQueue.ts:29-30`) says: *"reconciliation-close gate. When false, `collect` must be blocked."* A gate that permits when it has no information is not a gate.

Compounding it: **`moneyUnlocked` is never enforced server-side.** `/collect` checks `assertPeriodEndedForSettlement` and `assertPeriodNotFrozen` — never `moneyUnlocked`. A stale client, a replayed request, or a direct API call collects on an unreconciled week regardless.

**Fix.** Two changes. (1) Default to locked: treat a missing flag as `false` and surface an explicit "not yet reconciled" state so the operator knows the difference between *blocked* and *unknown*. (2) Enforce it in `/collect` and `/runs` server-side, with `forceRelease` as the documented override it already is (`period_projector.ts:41`).

---

## 3. High findings

### H-1 · `previewWeekClose` is documented read-only but writes on every call
**`week_close.ts:302-305, 383-410, 447-463`** — the docstring says *"Read-only dry run"*. It calls `ensureCloseLaneStatements` (which invokes `sealFuelWeek` / `sealTollWeek` / `sealEarningsWeek`, publishing statements) and `upsertFinanceReconDrifts` twice per driver. `CloseWeekPage.tsx:285-289` calls it on mount with no `staleTime` override (falls back to the 5-minute global, `App.tsx:135`) and `refetch()`s after every repair action.

Consequence: an operator scrolling the week dropdown to *look* at past weeks silently seals fuel/toll/earnings statements for each one and writes recon-drift rows. Sealing is idempotent-ish, so this isn't corrupting — but it means "I just looked at it" is indistinguishable from "I acted on it" in the audit trail, and it makes the drift table noisy enough to hide real signal.

**Fix.** Split into `previewWeekClose` (pure read; reports missing/draft lanes as blockers) and an explicit `POST /week-close/prepare` behind a "Prepare lanes" button.

### H-2 · `closeWeek` is not atomic
**`week_close.ts:605-810`** — per-driver `for` loop, one `UPDATE` per driver (`:797`), and `throw new Error(updErr.message)` at `:807` aborts the whole call. Drivers already updated stay frozen; the rest stay open. `CloseWeekResult.closed` is `false`, so the UI says "Could not close" while half the week *is* closed. Re-running is the recovery, and it mostly works because frozen drivers short-circuit at `:614-623` — but there is no transaction and no compensating action.

**Fix.** Collect all per-driver updates and apply them in one RPC/transaction, or add an explicit two-phase marker so a partial close is visible as such.

### H-3 · The settlement↔P&L tie is a week-level check attributed to a random driver
**`week_close.ts:490-496, 729-735`** — `settlementSumForWeek` and `businessWeekPnl` are org-week aggregates, but they are passed into `checkCloseInvariants` for **one arbitrary driver** — whichever the loop reaches first with `pnlWarnEmitted === false`. Since `periods` comes back unordered from PostgREST, `SETTLEMENT_PNL_MISMATCH` is attributed to a different driver run to run. Operators chasing a named driver's blocker will find nothing wrong with that driver.

**Fix.** Return week-level blockers in a separate `weekBlockers[]` array with `driverId: undefined`, and render them in their own section on Close Week.

### H-4 · The P&L tie is near-tautological post-cutover *(carried residual, still open)*
**`week_close.ts:333-341, 593-601`** — `settlementSumForWeek` is built from projection columns (`p.fleet_share`, `p.fuel_fleet_share`, `p.toll_*`) while `businessWeekPnl` comes from statements. With `PROJECTION_READS_WEEK_STATEMENTS = true` the projection *is* a copy of the statements, so this compares `x` to `x` for the fuel and earnings terms. Only the toll term (`spend − reimbursed − charged`) is a genuine cross-check. This was flagged as a residual at the end of Pass 5 and has not moved.

### H-5 · Negative `cash_still_held` is clamped, recorded, and then ignored
**`period_projector.ts:42`** — `cashStillHeld = round2(Math.max(0, settled.adjCashBalance))`. The metadata faithfully records the loss (`cashHeldClamped`, `unclampedCashHeld` — `driver_financial_periods.ts:2256-2257`), but **nothing reads either field.** `closeInvariants.ts:548-560` only blocks when `cash_still_held > eps`; the clamped-negative case (fleet has returned more cash than the driver ever held) passes close silently.

**Fix.** Emit a `CASH_HELD_OVER_RETURNED` blocker when `metadata.financeCore.cashHeldClamped === true`. The mechanism is already built — it just isn't wired to anything that can fail.

### H-6 · One settlement engine, three incompatible input contracts
`computePeriodSettlement` has three callers that map inputs differently:

| Caller | `driverShare` | `fuelDeduction` | Clamps applied |
|---|---|---|---|
| Rebuild (`driver_financial_periods.ts:2209-2222`) | `driver_share` | `fuel_deduction` | none — signed, per C-7 |
| Invariant checker (`periodInvariants.ts:43-64`) | `driver_share` | `fuel_deduction` | `tollPersonal`, `tipsPaidToDriver` |
| Desk/driver views (`driverSettlementMath.ts:32-51`) | `netPayout` | **`0`** | `cashTollWash`, `tollPersonal`, `fuelCredits`, `cashWrittenOff`, `settlementPaid` — **five** |

The third decomposes the week differently (fuel already netted into `driverShare`) *and* re-applies every clamp the engine deliberately removed. It backs `DriverPayoutHistory`, `PayoutPeriodDetail`, `SettlementSummaryView` and `walletCallOutstanding` — so the driver-facing wallet and the fleet desk can legitimately disagree on the same week whenever any of those five inputs is negative.

*(Verified not a problem: the `apps/fleet` and `apps/driver` copies of `driverSettlementMath.ts` are pure re-export shims of `@roam/finance-core` — no source drift.)*

**Fix.** One mapper, `mapPersistedRowToSettlementInput`, used by all three. Delete the clamps. If a view genuinely needs the netPayout decomposition, derive it from the canonical result rather than re-entering the engine with different inputs.

### H-7 · `listCashHeldPeriods` post-filters after SQL paging — the collect queue can silently show empty
**`driver_financial_periods.ts:2617-2650`** — SQL selects `cash_still_held > eps AND (settlement_status = 'pending' OR fuel_finalized = false)`, applies `.range(offset, offset+limit−1)`, and *then* JavaScript discards every row whose status is `company_owes`/`driver_owes`/`settled` (`:2640-2642`). Because `fuel_finalized = false` admits rows of any status, a page can be entirely discarded.

Combined with the queue's `hasMore` logic (`settlement_commands_controller.tsx:1612-1613`, `raw.length >= sqlLimit`), the endpoint can return `rows: []` with `hasMore: false` while cash-held weeks exist beyond the discarded window — the desk renders *"No outstanding collections in this range."*

**Fix.** Move the exclusion into SQL: `.not('settlement_status', 'in', '("company_owes","driver_owes","settled")')`.

### H-8 · Service-line filtering is applied after SQL paging
**`driver_financial_periods.ts:2354-2357, 2412-2415, 2483-2486, 2651-2659`** — every list query runs `.range()` first, then filters the mapped array by `periodMetadataMatchesServiceLine`. Under a Rush/rideshare scope, page sizes shrink unpredictably, `hasMore` lies, and the C-4 totals are computed over a twice-reduced set. `listCashHeldPeriods`'s variant (`:2652-2658`) is additionally O(n²) via `.find()` inside `.filter()`.

**Fix.** Push service line into the SQL predicate (a metadata GIN index or a materialized `service_line` column).

### H-9 · `reopenWeek` blanks the close hash
**`week_close.ts:919`** — `source_event_hash: ""`. `clearPeriodFreeze` already archives the prior hash into `financeCore.reopenHistory` (`settlement_period_freeze.ts:190-205`), so the value isn't lost — but `assertFrozenPeriodHashIntact` early-returns when no stored hash is present (`:70-74`). For the whole reopen window there is no tamper detection, and if the week is closed again the new hash is computed over whatever the row says at that moment.

**Fix.** Keep the hash in a `prior_close_hash` column and compare the recomputed pre-reopen hash on re-close, so an unexplained change between reopen and re-close is a blocker.

### H-10 · The reopen risk gate only looks at payouts
**`week_close.ts:131-140`** — `risk = Math.abs(settlementPaid) > eps`. Cash *collected* from the driver, cash written off, and posted-but-unverified movements are all invisible to the gate. Reopening a week where you collected $8,000 but paid $0 requires no acknowledgement.

**Fix.** Include `cash_collected`, `cash_written_off`, and any `settlement_movements` rows with `status='posted'` for the week; show the operator the actual movement list, not just a count.

---

## 4. Performance — the four scaling cliffs

Nothing here is slow at your current scale (~4 drivers × ~36 weeks). All four are latent and all four are structural, so they arrive suddenly.

### P-1 · `previewWeekClose` / `closeWeek` are O(drivers × 5) **serial** round trips — will hit the wall clock
**`week_close.ts:346-516` and `:605-810`.** Per driver, inside a sequential `for` loop:

1. `getLatestWeekStatements` (`:352`)
2. `compareDriverWeekStatementsToEngines` (`:383`) — itself re-runs three engines
3. `upsertFinanceReconDrifts` (`:390` or `:403`)
4. **`await import("./toll_financial_reset.ts")` inside the loop** (`:424`, `:664`) — dynamic import per driver per call
5. `summarizeTollUsageOrphansForWeek` (`:425`)
6. sometimes a second `upsertFinanceReconDrifts` (`:447`)

Plus `ensureCloseLaneStatements` (`:305`) which already did its own `getLatestWeekStatements` per driver — **statements are fetched twice per driver per preview** (P-2).

At 4 drivers ≈ 40 round trips. At 50 drivers ≈ 500 serial round trips *plus* 150 engine recomputes. Supabase edge functions have a wall-clock limit; this doesn't get slow, it starts **timing out**, and a timeout mid-`closeWeek` produces exactly the partial close of H-2.

**Fix.** Hoist the dynamic import to module scope. Batch (1) into one query for all drivers. Run (2)–(6) with a bounded `Promise.all` (concurrency 5–10). Accumulate drift rows and issue one `upsert`. Expect 10–20×.

### P-3 · Every queue request loads the entire driver table
**`settlement_commands_controller.tsx:1497`** — `await kv.getByPrefix("driver:")` to attach names, unbounded, on every call. The desk fires this **three times per page load** (collect + pay + reconciled) plus health. Replace with a targeted fetch for the ≤`pageSize` driver ids actually in the page, and cache for the request.

### P-4 · 5,000 transactions to the browser, then passed whole into a modal
**`DriverSettlementsPage.tsx:577-597`** fetches `limit: 5000`; **`:2252`** passes `transactions={txsQuery.data || []}` into `ReconciledPeriodOverlay`, which filters client-side per driver (`ReconciledPeriodOverlay.tsx:223-237`). This is the `P-3` residual carried from the last audit ("dual-truth fixed, whole-dataset-in-React-props remains"). Fetch the overlay's transactions on open, scoped to driver + week.

### P-5 · The virtualizer's fixed row height is wrong for both tables that use it
**`useWindowedRows.ts:46-51`** assumes every row is `WINDOW_ROW_H = 52`px. Both consumers render **variable-height expandable groups**:

- `SettlementQueueTable.tsx:412-519` — windows over `rollups` (drivers), then renders N child week rows inside an expanded driver
- `MovementHistoryTable.tsx:116` — same pattern over `groups`

`padTop = start × 52` and `padBottom = (len − end) × 52` do not account for the expanded children, so past the 40-row threshold with any group open, `scrollTop → index` is wrong: rows jump, duplicate, or vanish mid-scroll. (Secondary: `viewHeight` defaults to 560px while the container is `max-h-[70vh]` — under-fills tall screens.)

**Fix.** Measure rows (`ResizeObserver` + offset cache) or window the *flattened* row list rather than the group list. `@tanstack/react-virtual` is already a transitive dependency and handles both.

### P-6 · "Refresh" performs a server-side repair mutation
**`DriverSettlementsPage.tsx:944-966`** — `refreshAll()` calls `api.repairOrphanSettlementMirrors(...)` **before** invalidating. It is also the retry handler on the error banner (`:1820`) and runs after every collect/pay/write-off/reverse/verify/approve/batch. A refresh button that repairs data is surprising, makes "did the number change because I refreshed or because it was repaired?" unanswerable, and turns an idempotent read into a write on every error retry. Separate into `Refresh` (invalidate only) and an explicit `Repair mirrors` action.

### P-7 · KPI arithmetic runs unmemoized on every keystroke
**`DriverSettlementsPage.tsx:752-818`** — `settledOwesTotal`, `cashHeldKpiTotal`, `fleetOwesTotal`, four `.filter().reduce()` count pairs, `awaitingPayTotal`, `awaitingCollectTotal`, `clearedPayThisWeek`, `clearedCollectThisWeek`, `blockedExposure` — roughly 15 full array passes in the component body, none in `useMemo`, over arrays up to 5,000 elements (`doneMovementRows` derives from the tx query). Every character typed in the search box re-runs all of them. Wrap in `useMemo`.

### P-8 · No debouncing on the two highest-frequency filters
**`SettlementFilters.tsx:92, 103`** — `minAmount` and `search` call `onChange` per keystroke; both land directly in `queueParamsBase` (`DriverSettlementsPage.tsx:513-521`) and therefore in the React Query key (`useSettlementQueue.ts:104-120`). Typing "Kenny" fires **five** `/queue` requests per active view — ten in flight, each triggering P-3's full driver-table load. A 300 ms debounce is the single highest-value perf change on the client.

---

## 5. UX findings

### U-1 · Blocked rows explain themselves only in a `title` tooltip
`SettlementQueueTable.tsx:388-392, 425, 484, 495, 615` — every reason a row can't be actioned (`GATE_TITLE`, `FROZEN_TITLE`, `weekOpenTitle`) lives in a native `title` attribute on a **disabled** control. Disabled buttons are not focusable, so the reason is unreachable by keyboard and invisible on touch. The inline chips ("Still open" / "Closed" / "Locked", `:433-445`) are the right idea but say *what*, not *what to do*. Promote the reason to visible helper text on the row, or make the button enabled-and-explaining rather than disabled-and-silent.

### U-2 · "Total exposure" adds three different kinds of money into one number
`DriverSettlementsPage.tsx:769` — `fleetOwes + driversOwe + cashHeld`, labelled *"fleet owes + drivers owe + cash held"*. These have opposite signs economically (a liability, a receivable, and custody). The sum has no accounting meaning and can't be reconciled against anything. Show it as three figures with a net position, or label it "gross exposure" and make it expandable.

### U-3 · `blockedExposure` picks its valuation formula from a field that may be absent
`DriverSettlementsPage.tsx:775` — `queueOwedMajor(r, r.collectKind ? 'collect' : 'pay')`. A collect row that arrives without `collectKind` is valued with `resolvePayQueueOwed` — a different formula (`:277`). Today `collectKind` is always set by the endpoint (`settlement_commands_controller.tsx:1465, 1487`), so this is latent, but it is inferring a row's queue from an optional field when the code already knows which array it came from.

### U-4 · The settlement lane is implemented twice
`DriverSettlementsPage.tsx:752-775` and `CloseWeekPage.tsx:298-318` compute `driversOwe` / `cashHeld` / `fleetOwes` / `totalExposure` / `blockedExposure` independently, with subtly different owed-resolution (`CloseWeekPage` ignores the pay-side `resolvePayQueueOwed` special case). Two screens the operator will compare side by side can show different numbers for the same week. Extract one `useSettlementLaneMetrics(rows)` hook.

### U-5 · Nothing shows what a close actually did
`CloseWeekPage.tsx:515-540` — after `doClose`, the operator gets a toast and a driver count. There is no diff of what was signed, no per-driver amounts, no link to the statements produced. Reopen (`:542-573`) is the only way back, and it requires a typed reason and a risk acknowledgement. For an irreversible-by-design action, the confirmation step should show the money being frozen, per driver, before the button is pressed.

### U-6 · Draft-restatement counts disagree between the two surfaces
`week_close.ts:355-358` counts **every** draft statement row with `supersedes` set. The Restatement queue de-duplicates to the latest version per driver/week/kind (`latestRestatementDrafts.ts:13-30`, applied inside the shared fetcher). So Close Week can say *"3 restatement drafts await sign-off"* while the Restatements tab lists 1. Apply the same dedupe server-side.

*(Verified not a problem: the Restatements tab badge on `DriverSettlementsPage.tsx:405-407` uses the same deduped fetcher, so badge and list agree.)*

---

## 6. Redundancy & dead code

- **R-1 · `shadowCompareStatementsVsProjection` is still live in two call sites** — `driver_financial_periods.ts:1480`, `week_statements.ts:251`. Warn-only, superseded by `statementEngineCompare`. The previous audit's closing note says to delete it because *"it will read as a live control to the next person."* It still does.
- **R-2 · `period.signed_at` is read but never written** — `week_close.ts:124-127` and `:367-368` read a `signed_at` column; a repo-wide search finds **no writer**. Harmless today (the freeze is found via metadata) but it makes `periodIsFrozen` and `mapPeriodListRow` *look* like they disagree when they don't.
- **R-3 · Cutover scaffolding is still on the hot path** — `DriverSettlementsPage.tsx:695-726` (legacy tx fallback for `awaitingRows`), `:1266-1271`, `:1347-1358`, `:1412-1417` (legacy `saveTransaction` fallbacks behind `isSettlementCommandUnavailable`). The commands endpoint has been deployed for two audit cycles. Each fallback is a second write path that bypasses movements, CAS, and the freeze.
- **R-4 · `collectOutstandingAll` / `outstandingAllRows`** (`DriverSettlementsPage.tsx:616-632`) map and sort the full row set only to serve as a fallback total at `:653-657` that C-4's fix makes unnecessary.

---

## 7. Does this need a new architecture?

**No — and I'd argue against one.** The statement-contract design is correct and mostly built:

- ✅ Independent sealers per lane, publishing versioned immutable statements
- ✅ Projection as a derived read model (`PROJECTION_READS_WEEK_STATEMENTS`)
- ✅ Close as a precondition-checked, hash-sealed, signed event
- ✅ Statement↔engine comparison that can genuinely fail, persisted to `finance_recon_drift`
- ✅ Command endpoints with idempotency keys, CAS on `row_version`, maker-checker approval

A rewrite would rebuild all of that and reintroduce the same class of boundary bug. What's missing is **four structural corrections**, none of which is a redesign:

1. **One freeze checkpoint, not seven.** Today each route decides. Make `insertMovementAndDualWrite` — plus a matching `assertMovementAllowed` on reverse/verify/approve — the single chokepoint that asserts *ended ∧ unlocked ∧ not-frozen ∧ hash-intact*. Then a new endpoint can't forget. (C-1, C-5)
2. **One write boundary that doesn't editorialize.** `buildCashSettlementPersistFields` must persist what the engine returned, sign and all, and must not touch columns it doesn't own. (C-2, C-3)
3. **Aggregates computed as aggregates.** Totals and counts come from SQL over the whole predicate, never from summing a page. (C-4, H-8)
4. **Week-level facts modelled as week-level.** The P&L tie, the toll identity and the lane statuses are properties of the *week*, not of an arbitrary driver in it. (H-3)

Everything else in this document is a bug or a tuning item within that architecture.

---

## 8. Remediation plan

> **Pass 7 — superseded.** Everything in the Pass 5 list below is now closed except **R-3** and **U-1**, plus trivial **N-13**. See §0.1 for the live list. The plan below is retained as the record of how the work was sequenced.
>
> **Pass 5 update — what's left.** Every Critical and every High is closed. No deploy blockers remain. The list below is all that is outstanding, in order.
>
> ### 🟠 Correctness — do these first
> | # | Item | Work |
> |---|---|---|
> | 1 | **N-8** | Add `rushTripCount` / `rideshareTripCount` to `PRESERVED_PERIOD_META_KEYS`; make `applyServiceLineSqlFilter` treat a NULL key as match-all so it agrees with `dfp_service_line_matches`; add a list-vs-RPC parity guard. **Three small edits; without them the queue list and its own total disagree under a service-line scope.** |
> | 2 | **N-10** | `COALESCE(NULLIF(r->>'close_hash',''), '')` in the batch freeze — `source_event_hash` is `NOT NULL`, and a violation now fails the whole week. |
>
> ### 🟡 Guardrails — cheap, and this class of bug has recurred
> | # | Item | Work |
> |---|---|---|
> | 3 | **N-9** | Add `assert-ledger-view-invoker` to `.github/workflows/ci.yml` beside the eight sibling guards. Currently deploy-only. |
> | 4 | **N-11** | Either batch `closeWeekStatements` into the freeze transaction, or document the close as *atomic-freeze, at-least-once-statements*. |
>
> ### 🟢 Cleanup — no correctness impact
> | # | Item | Work |
> |---|---|---|
> | 5 | **R-3** | Remove the three legacy `saveTransaction` fallbacks (`DriverSettlementsPage.tsx:1289, 1373, 1433`). Each is a second write path that bypasses movements, CAS and the freeze. |
> | 6 | **U-1** | Make the blocked-row reason reachable by keyboard/touch — it currently lives only in a `title` on a disabled control. |
> | 7 | **U-5** | Show what a close will freeze (per-driver amounts) before the button, and what it did after. |
> | 8 | **R-4** | Drop `outstandingAllRows` now that `page.total` is exact. |
> | 9 | **N-12** | Optional: apply the `FlatRollupItem` pattern to `MovementHistoryTable` to re-enable its virtualization. |

---

### Original plan (Pass 1) — retained for context

Ordered by risk-adjusted value. **Phase 0 is not optional** — every later phase changes numbers, and without goldens an intended change is indistinguishable from a regression. This is the same sequencing that worked for the previous two audits.

### Phase 0 — Characterization goldens *(before any code changes)* ✅ done
- Snapshot every `driver_financial_periods` row for all ~36 weeks to fixtures.
- Golden-test `computePeriodSettlementMinor` + `buildCashSettlementPersistFields` against those rows, **capturing current output including the bugs.**
- Golden-test `GET /queue` responses for collect/pay/reconciled at pageSize 200 and pageSize 5 (the small page exposes C-4).
- Snapshot `previewWeekClose` output for one closed week and one blocked week.

### Phase 1 — Stop the bleeding *(Criticals; small, surgical)*
| Item | Change |
|---|---|
| **C-1** | Move `assertPeriodNotFrozen` + `assertFrozenPeriodHashIntact` into `insertMovementAndDualWrite`; add to `/reverse`, `/verify`, `/approve`. **Test: a posted movement on a frozen week must 409.** |
| **C-5** | Default `moneyUnlocked` to `false` when absent; enforce server-side in `/collect` + `/runs`. |
| **C-2** | Remove `Math.max(0, …)` from `settlement_paid`; add invariant `settlement_amount == gross − settlement_paid` reading persisted columns. |
| **C-3** | Guard `status`/`closed_at` writes behind `!periodFrozen`; move projector state to its own column. |

### Phase 2 — Make the numbers true
- **C-4** — aggregate query for totals + exact count; re-key the incompleteness banner on `page.hasMore`.
- **H-7** — push the status exclusion into SQL.
- **H-8** — push service line into SQL.
- **H-3** — week-level blockers array; render separately on Close Week.
- **U-4** — one shared `useSettlementLaneMetrics` hook.

### Phase 3 — Close the controls that can't currently fail
- **H-5** — `CASH_HELD_OVER_RETURNED` blocker from the already-recorded `cashHeldClamped`.
- **H-4** — build `settlementSumForWeek` from the engines, not the projection.
- **H-9** — `prior_close_hash` + compare on re-close.
- **H-10** — widen the reopen risk gate to collections, write-offs and posted movements.
- **H-1** — split preview (pure) from prepare (writes).
- **H-2** — one transaction, or an explicit partial-close marker.

> **The test to write for each:** *"what input would make this control fail, and have I tested that input?"* The existing `'deliberately mismatched statement amounts block close (non-tautological)'` test is the model to copy. Six findings in this audit exist because that question wasn't asked.

### Phase 4 — Speed
- **P-8** 300 ms debounce *(do this first — one line, biggest felt improvement)*
- **P-7** memoize KPI block
- **P-3** targeted driver-name fetch
- **P-1/P-2** hoist the dynamic import; batch statement reads; bounded-concurrency driver loop; single drift upsert
- **P-4** fetch overlay transactions on open
- **P-5** measured virtualization or flatten-then-window
- **P-6** split Refresh from Repair

### Phase 5 — Consolidate
- **H-6** one input mapper; delete the clamps in `driverSettlementMath.ts`
- **R-1** delete `shadowCompareStatementsVsProjection`
- **R-2** delete the `signed_at` reads
- **R-3** remove the legacy `saveTransaction` fallbacks
- **R-4** delete `collectOutstandingAll`
- **U-1/U-2/U-3/U-5/U-6** UX pass

---

## 9. Do **not** change these

Recorded so a future pass doesn't "fix" a deliberate decision:

1. **The `unclaimed` (backend) vs "Unlinked Refunds" (UI) naming split** is intentional.
2. **Zero-charge on unpriceable fuel weeks, and the absence of a Fuel Brain toggle**, are deliberate positions, not bugs.
3. **`chargedToDrivers` folded into `netLoss`** (toll four-card identity) was decided and locked in Pass 2. The residual is ≈0 *by construction*; any drift is a real self-inconsistency signal, not a display bug.
4. **`syncPeriodCashFromTransactions` running with `allowFrozen: true`** (`driver_financial_periods.ts:2277-2281`) is correct — it prevents a posted movement from being orphaned if Close Week races the insert. Fix C-1 at the *gate*, not here.
5. **Tips-withheld-unless-quota-met** (ADR 0008) is owner-ratified.
6. **The engine formula itself.** `computePeriodSettlementMinor` is right. Every finding in this document is about what happens to its output, never about the arithmetic.

---

## 10. Verification checklist

Each item is a test that must be *able to fail*. **Pass 3 status marked.**

- [x] Posted movement via `/reverse`, `/verify`, `/approve`, `/runs` on a frozen week → **409 PERIOD_FROZEN** — `settlement_period_freeze.test.ts:46`
- [x] Period row with no `metadata.financeCore` → Collect **disabled**, `/collect` returns 4xx — `settlement_period_freeze.test.ts:30` (`MONEY_LOCKED`)
- [x] `settlementPaid = −1200` → `settlement_paid` persists as `−1200`; `checkPeriodInvariants` returns **no** drift — `periodPersistBody.characterization.golden.test.ts`
- [x] Rebuild a frozen week with an unmatched toll → calendar `status` / `closed_at` untouched — `periodPersistBody.characterization.golden.test.ts:44`
- [x] Cash-held week beyond a fully-discarded SQL page → still appears in the collect queue — SQL exclusion at `driver_financial_periods.ts:2686`
- [x] Week with `cashHeldClamped = true` → close **blocked** — `closeInvariants.ts:566`
- [x] `previewWeekClose` on a week with no statements → publishes **nothing** — preview is pure (`week_close.ts:307`)
- [x] Type 6 characters in search → exactly **one** `/queue` request per view — `SettlementFilters.tsx:45`
- [ ] 250 open pay weeks at pageSize 200 → `totals.amountOwedMinor` equals the sum of all 250 — **aggregates exist but are PostgREST-capped (N-2); untested above the cap**
- [ ] 50-driver week → `previewWeekClose` completes under 5 s — **N-4/P-1 open**

### Checks added by Pass 3 — Pass 5 status

- [x] Latest recreate of every `public.*`→`ledger.*` wrapper view carries `security_invoker` **(N-1)** — `scripts/assert-ledger-view-invoker.mjs`, passing: *OK (475 migrations, 15 wrapper views)*
- [x] 1,500 matching pay weeks → exact `totals.amountOwedMinor` **(N-2)** — `sum_settlement_queue_totals` RPC, no row cap
- [x] `MONEY_LOCKED` renders a guidance dialog **(N-6)** — `MoneyLockedDialog.tsx`
- [x] Desk and Close Week report identical lane figures **(N-5)** — both consume `settlementLaneMetrics.ts`
- [x] Settlements not tying to week P&L block the close **(N-3)** — `severity: "block"` restored
- [ ] **Live check still worth running once after deploy:** a second authenticated tenant cannot `SELECT` another org's row from `public.driver_financial_periods` **(N-1 — the static guard proves the migration text, not the deployed state)**

### New checks required by Pass 5

- [ ] Period metadata retains `rushTripCount` / `rideshareTripCount` after a `/collect` **(N-8)**
- [ ] With a service-line scope active: `Σ rows.amountOwedMinor` over all pages **equals** `totals.amountOwedMinor`, including rows whose trip-count keys are absent **(N-8 — this is the test that fails today)**
- [x] `freeze_settlement_periods_batch` with an empty `close_hash` → does **not** abort the batch **(N-10)** — `COALESCE(NULLIF(…), '')`
- [x] CI fails on a PR that recreates a wrapper view without `security_invoker` **(N-9)** — `ci.yml:41`

### Checks added by Pass 5 — Pass 7 status

- [x] Period metadata retains `rushTripCount` / `rideshareTripCount` after a `/collect` **(N-8)** — `PRESERVED_PERIOD_META_KEYS`, `periodSignedSnapshot.test.ts`
- [x] List filter and totals RPC agree on absent / zero / nonzero trip counts **(N-8)** — `verify_service_line_filter_parity.mjs`, 9 fixtures + source anchors, in CI
- [ ] **Live check still worth running once after deploy:** a second authenticated tenant cannot `SELECT` another org's row from `public.driver_financial_periods` **(N-1 — the static guard proves the migration text, not the deployed state)**

---

*Passes 1, 3, 5 and 7 produced without modifying any source file. Pass 7 line references are against commit `55361643` (working tree clean).*

*Test state at Pass 7 verification: **150 finance-core + 1,321 fleet passing (1 skipped)**, **8 Deno freeze tests passing**, `verify_service_line_filter_parity` OK (9 fixtures), `assert-ledger-view-invoker` OK (476 migrations / 15 wrapper views).*

---

### Closing note

Across seven passes this section went from **5 Critical / 10 High** to **zero of either, zero Performance, zero Redundancy** — 45 findings closed, 2 cosmetic open. Every control is backed by a test or CI guard that can actually fail, and the two highest-risk mechanisms (the freeze chokepoint and the atomic close) now have explicit, wired recovery paths rather than just error messages.

The failure mode this codebase kept repeating — *"the mechanism gets built correctly, and the last connection, the one that makes it able to fail, is what gets left out"* — **did not recur in Passes 4 or 6.** In Pass 6 the work went past the spec three times: the `hasOwnProperty` guard that preserves a legitimate `0`, the parity script that reads real source strings instead of mirroring logic in JS, and `retryFreezeWeek` where documenting the limitation would have sufficed.

**Two lessons worth carrying to the next section audit:**

1. **When you move a check into SQL, verify the data it reads is durably maintained by every writer — not just the one that created it.** N-8 was the old pattern inverted: H-8's predicate was correct, but an unrelated write path destroyed its input. A correct check over destroyed data is worse than no check, because it reports confidently.
2. **A guard that re-implements the thing it guards is a mirror, not a test.** `verify_service_line_filter_parity.mjs` avoids this by asserting against the actual TS filter string and the actual migration text. Copy that shape — fixtures *plus* source anchors — for the next parity guard.
