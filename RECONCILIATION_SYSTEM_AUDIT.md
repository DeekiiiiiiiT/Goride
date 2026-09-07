# Reconciliation System Audit — Fuel, Tolls & Driver Settlements

**Scope:** Consumption (Fuel) Reconciliation · Toll Reconciliation · Driver Settlements, and the seams between them.
**Date:** 2026-09-07
**Mode:** Read-only audit. **No code was changed.**
**Question asked:** *"Can I close every week flawlessly and trust that the business's numbers are right?"*

---

## 0. Verdict

**Today: no.** Not because the formulas are wrong — most of them are individually careful, well-commented and unit-tested — but because **the three subsystems have no contract with each other.**

Each one independently re-derives money from raw operational data using its own date rule, its own source-preference chain and its own sign conventions. Nothing in the system ever asserts that they agree. Nothing ever declares a week finished. When they disagree — and they demonstrably do, in your own screenshots — nothing alarms, nothing blocks, and the disagreement is written straight to the driver's balance.

There are **four separate money engines** producing numbers for these three screens, **five distinct week-bucketing rules**, and **three independent answers to "how much was charged to this driver for tolls."** The remediation is not a rewrite of the math. It is the introduction of the one layer that is missing: **a signed, immutable weekly statement contract** that each subsystem publishes and settlement consumes.

### The three headline problems

| # | Problem | Consequence |
|---|---|---|
| **1** | A negative fuel share (fleet owes driver) is passed through `Math.abs()` on one path and dropped entirely on the other | The same week produces a **driver debit** or **nothing**, depending on which code path runs. Your screenshot's `−$27,898.73` week is exactly this input. |
| **2** | The four Toll Reconciliation KPI cards come from two unrelated engines and satisfy no accounting identity | Your own screenshot: `52,400 − 50,010 − 25,740 = −23,350`, displayed as **`+1,470`**. |
| **3** | No week is ever truly closed | The freeze gate exists but nothing writes it and the rebuild path never reads it. Any late import silently restates a "finished" week. |

### What is genuinely good (do not break these)

- `packages/finance-core/src/money.ts` — a single correct `round2` with half-up-away-from-zero and an IEEE guard, plus integer minor-unit types.
- `packages/finance-core/src/periodKey.ts` — one correct TZ-aware Monday week rule (ADR 0007). The problem is that not everything uses it.
- `supabase/functions/_fleet-server/settlement_commands.ts` — genuinely enterprise-grade. CAS on `row_version`, `expectedOutstanding` optimistic concurrency, pay/collect caps, mandatory idempotency keys, reversal-nets-to-zero property. This is the model the rest should follow.
- `supabase/functions/_fleet-server/period_persist.ts` — optimistic concurrency with retry and a revision trail.
- The CI gate suite (`.github/workflows/ci.yml`) — parity checks, org-scope checks, core package tests. Strong foundation.
- `packages/finance-core/src/periodInvariants.ts` + `periodLedgerRecon.ts` + the nightly `finance-recon` cron. The *idea* is right; the coverage is the gap (see H-7).

---

## 0.5 Remediation status — Pass 1 (superseded by §0.6)

> **Superseded.** Pass 2 closed most of what this section lists as open. Kept for
> history; read **§0.6** for current status.

Re-audited against working tree at `6fd0aaab` (clean, 2 commits after the audit baseline `6d718714`). **87 files changed, +9,811 / −1,438.**

**Verification run:** `finance-core` 112/112 ✅ · `fuel-core` 38/38 ✅ · `toll-core` 50/50 ✅ (200 tests) · `check-no-naive-date-slice` ✅ · `check-fuel-core-parity` ✅ · `check-toll-core-parity` ✅ (8 shims).

### Scoreboard

| ID | Finding | Status |
|---|---|---|
| **C-1** | Fuel share sign inversion | 🟡 **Partial — primary path still inverts** |
| **C-2** | Unbounded unexplained fuel | 🟡 **Partial — PA path + no hard gate** |
| **C-3** | Toll cards satisfy no identity | 🟡 **Partial — residual can never close** |
| **C-4** | Net loss floored then summed | 🟡 **Partial — headline still floored** |
| **C-5** | Dispute refund double-counted | ✅ **Closed** |
| **C-6** | No real week close | 🟡 **Built but non-functional** |
| **C-7** | Reversal clamps eat credits | 🟡 **Partial — cash-sync path still clamps** |
| **H-1** | Collect mixes settled + unfinalized | ✅ **Closed** |
| **H-2** | Blocked-week money invisible | ✅ **Closed** |
| **H-3** | Fuel reversal hard-deletes | ✅ **Closed** |
| **H-4** | Dead integrity hash | 🟡 **Partial — written, never verified** |
| **H-5** | `Fixed_Amount` → 50/50 | ✅ **Closed** |
| **H-6** | Fuel snapshot matched by range | ✅ **Closed** |
| **H-7** | No cross-system invariants | 🟡 **Built, cannot fire** |
| **H-8** | Toll events use different week rule | ✅ **Closed** |
| **H-9** | Three "charged to driver" sources | 🟡 **Partial — 2 of 3 unified** |
| **U-2** | No unified close screen | ✅ **Closed** |
| **U-4** | Tooltip makes a false promise | ✅ **Closed** |
| **P-1** | O(W×N) rebuild | 🟡 **Partial — bucketing done, ctx still optional** |
| **P-6** | Unthrottled scroll windowing | ✅ **Closed** |
| M-1…M-5, P-2…P-5 | — | ⬜ **Not started** |

**9 closed · 10 partial · 9 not started.**

### ⛔ Blocking issue — no week can close today

`checkCloseInvariants` raises `TOLL_STATEMENT_MISSING` and `EARNINGS_STATEMENT_MISSING` at `severity: 'block'` (`closeInvariants.ts:165, 210`), and `canCloseWeek` returns false on any `block`. Only **one** publisher exists — `fuel_period_routes.ts:399` (`kind: "fuel"`). There is no toll publisher and no earnings publisher.

Result: the entire close machinery — `week_close.ts`, `week_close_controller.tsx`, `CloseWeekPage.tsx`, `markPeriodFrozen`, `buildCloseHash` — is wired end-to-end and **will reject every week** with two permanent blockers. **This is the highest-priority remaining item; nothing else in Phase 5 can be validated until it lands.**

### What closed cleanly

- **C-5** `isDisputeRefundInWizardPeriod` is now exclusive (`if (matchedTollId) return has(...)`, `tollPeriodDisputeHelpers.ts:170-172`). Partitioning restored.
- **H-3** `kv.del` replaced with offsetting reversal rows carrying `reversesTransactionId` + `reversalReason` + `idempotencyKey`, and a never-reverse-a-reversal guard (`fuel_enterprise_settlement.ts:65-106`).
- **H-5** The assembler now branches Fixed_Amount to `getCategoryCoverageSplit` (`weekSnapshotEngine.ts:170`); the percentage helper is documented as unreachable for that type.
- **H-6** `if (start !== periodAnchor) continue;` (`driver_financial_periods.ts:1051`).
- **H-8** `tollEventDate` takes a `fleetTz` and routes through `fleetCalendarDay`; `scripts/check-no-naive-date-slice.mjs` is wired into CI (`ci.yml:45`) and passing.
- **H-1** `collectGateBlocked` / `canCollect` on `moneyUnlocked`, cash-held rows relabelled as custody, gate tooltip on the disabled button.
- **H-2** Gate-blind **Total exposure** KPI with a blocked-portion callout.
- **U-2** `CloseWeekPage.tsx` (437 lines) registered in `pageRegistry` and `AppSidebar` — the unified close screen exists.
- **U-4** The P&L claim is now conditional on `|identityResidual| ≤ 0.01`, otherwise the card reads *"Cards off by $X — not yet reconciled."* Honest.
- **P-6** `useWindowedRows` rAF-throttled with proper cleanup.
- **Phase 0 complete** — `docs/fixtures/periods-baseline-2026-09-07.json` (2,327 lines), `periodBaseline.golden.test.ts`, `docs/finance-recon/2026-09-07-before.md`, plus `fuel-misc-blast-radius.mjs` and `toll-card-identity-residual.mjs`.

### What is still open, precisely

**C-1 — the fix landed on the path that isn't used.** The snapshot fallback is now correctly signed (`driver_financial_periods.ts:1058-1059`, `Math.abs` removed). But the **events** path — the preferred one under `projectionReadsEventsForFuel()` — still inverts, in two places:

1. `fuel_financial_reset.ts:203-204` strips the sign *before* posting:
   ```ts
   const deduction  = Math.abs(Number(report.driverShare)  || 0);
   const fleetShare = Math.abs(Number(report.companyShare) || 0);
   ```
   The new sign-aware logic below it (`Math.abs(deduction) > MONEY_EPS`, `direction: deduction >= 0 ? "outflow" : "inflow"`) is therefore **unreachable for negative shares** — `deduction` can never be negative.
2. `driver_financial_periods.ts:1020-1029` still aggregates with `Math.abs(major)`. Since a positive deduction posts as `amountMajor: -deduction`, a *negative* share posts as positive and `Math.abs` turns it back into a driver debit.

`sumsFromActiveFuelEvents` (`fuel_financial_reset.ts:174`) also `Math.abs`es, so the staleness comparison cannot distinguish `+X` from `−X`.
→ **The original defect is still live in the primary code path.** Remove the three `Math.abs` calls and let the sign flow.

**C-2 — floored on one branch, not the other.** `assembleLeftoverWeekMoney` now floors misc and reports `overExplainedCost` / `overExplained` ✅. But `fuelCalculationService.ts:437` and `:661` call `splitAllCategoryCosts` with **raw** `miscellaneousCost` — that is the branch taken whenever Personal Allowance is active (`earnedAbsorbCompany !== 0 || personalForSplit !== personalUsageCost`). Negative misc still splits into negative shares there.
Also, the gate is **advisory only**: `FuelLeakageStep.tsx:61` renders a banner reading *"Do not accept this week"* but nothing blocks accept or finalize — `isOverExplainedFuelWeek` appears in no gating module (`fuelFinalizeGating.ts`, `FuelBulkFinalizeDialog`, `FuelPeriodWizard` all clean).

**C-3 — the residual is defined so it can never close.** `computeTollWeekNetting` is a genuine improvement: one scan, all pieces, no second engine. But `netLoss` is *defined* as `spend − reimbursed`, so
```
residual = spend − reimbursed − chargedToDrivers − netLoss  ≡  −chargedToDrivers
```
algebraically, always — the code comment concedes this. `tollWeekIdentityCloses` therefore returns true **only when `chargedToDrivers === 0`**, so every week with any driver charge shows *"Cards off by $25,740."* Honest, but permanently un-closable.
→ The unresolved question is definitional: **is `chargedToDrivers` a P&L recovery** (then `netLoss = spend − reimbursed − chargedToDrivers` and the identity closes) **or a wallet movement outside the P&L** (then it is not a fourth term of this identity and should not be presented as one)? Pick one and encode it.

**C-4 — the signed value is computed but not used.** `rawNet` and `clipped` are now returned ✅ and surfaced as `netTollLossSigned` / `netTollLossClipped` (`toll_period_controller.tsx:563-565`). But the headline `netTollLoss` still takes the **floored** `computeTollFleetLossFromEvents(weekEvents).net` (`:560`), and the fleet total still sums floored per-week values (`:582`). The upward bias is unchanged in the number the user reads.

**C-6 — see the blocking issue above.** Everything else in this lane landed: `markPeriodFrozen` writes `periodFrozen` / `signedWeek` / `signedAt` / `closeHash` / `closedBy` / `closeReason` (`settlement_period_freeze.ts:56-64`), called from `week_close.ts:276`; `period_persist.ts` enforces `assertPeriodNotFrozen` on **both** persist paths (`:37, :93`); and there are **no `allowFrozen: true` callers** anywhere — the escape hatch exists but is unused. Good discipline.

**C-7 — one clamp survived.** The formula is signed (`driverPeriodSettlement.ts:76`) and the rebuild passes `tollPersonal: tollChargedToDriver` unclamped (`:1129`) ✅. But `syncPeriodCashFromTransactions` still clamps: `tollPersonal: Math.max(0, Number(existing.toll_charged_to_driver) || 0)` (`:1882`). The Log-cash / Collect / Reverse path therefore recomputes settlement from a clamped input while the full rebuild uses the signed one — the same two-paths-two-answers shape as C-1, at smaller scale.
Related: `sumTollChargedToDriversFromEvents` ends with `round2(Math.max(0, total))` (`tollFleetLossNetting.ts:104`) — over-reversal clamped again.

**H-4 — written, never read.** `buildCloseHash` now hashes the complete row plus input ids (`closeHash.ts`), and `week_close.ts:287` stores it in `source_event_hash`. But grep finds **no verifier** — nothing recomputes and compares it when reading a closed week. The audit asked for verification on read; that half is missing.

**H-7 — the right checks, unreachable.** `closeInvariants.ts` implements exactly the cross-system checks §6.4 called for (fuel driver/fleet share, toll spend/charged, earnings identity). They only run inside `closeWeek`, which cannot succeed (blocking issue). The nightly `finance-recon` was **not** extended to call them, so today nothing cross-checks the three subsystems in production.

**H-9 — two of three sources unified.** The toll cards now read canonical `toll_charged_to_driver` / `toll_charge_reversed` events ✅. But the settlement projection still derives its own figure from KV: `driverTxAll.filter(t => t.category === "Toll Charge")` (`driver_financial_periods.ts:631-632`). Two read models remain.

**P-1 — bucketing done, amplification not.** Per-week pre-bucketing is implemented (`tollsByWeek`, `allTollsByWeek`, `chargeTxByWeek`, `fuelReportsByWeek` — `driver_financial_periods.ts:228-234, 700-701`), which is the O(W×N) → O(N+W) win ✅. But `ctx` is **still optional** (`ctx?: RebuildContext`, `:749`) and there remain 7+ ctx-less callers that each trigger a full-dataset reload — including both calls inside the dispute-match loop (`dispute_refund_controller.tsx:536, 901`) and `fuel_financial_reset.ts:220, 357`. The bulk-match amplification described in §4.1 is unchanged.

### Not started

Phase 4 statement publishers for **toll** and **earnings**; the projection reading statements instead of raw operational data; M-1 (`cashSourceMismatch` blocking), M-2 (account keys / trial balance), M-3 (server-side pagination), M-4 (org fail-closed), M-5 (deep-link step gating); P-2 (KV prefix scans → indexed queries), P-3 (whole dataset in React state + `mergeServerFirstLandingPeriods` dual truth), P-4/P-5 (bundle splitting, virtualizing the toll and fuel tables).

### Recommended order for the next pass

1. **Toll + earnings statement publishers** — unblocks close, `closeInvariants`, `markPeriodFrozen` and the whole Phase 5 lane. Nothing else can be validated first.
2. **C-1 events path** — three `Math.abs` removals; still a live money defect on the preferred path.
3. **C-7 cash-sync clamp** (`:1882`) and the `sumTollChargedToDriversFromEvents` floor — same class, cheap.
4. **C-2 Personal-Allowance branch** + promote the misc gate from banner to finalize blocker.
5. **C-4** — make the headline and the total use the signed net.
6. **C-3** — decide whether `chargedToDrivers` is a P&L term, then make the identity provable.
7. **H-4** verify-on-read; **H-7** call `closeInvariants` from nightly `finance-recon` as a safety net.
8. **P-1** make `ctx` required; then Phase 6 proper.

---

## 0.6 Remediation status — Pass 2, verified 2026-09-07 (superseded by §0.7)

> **Superseded.** Pass 3 closed H-7 independence, H-4 verify alignment, and M-4.
> Read **§0.7** for current status.

Re-audited against working tree at `c1db22ab` (clean). **52 files changed since Pass 1, +2,513 / −299.**

**Verification run:** `finance-core` 118/118 ✅ · `fuel-core` 38/38 ✅ · `toll-core` 53/53 ✅ (209 tests) · 5/5 CI guards pass (`check-no-naive-date-slice`, `check-fuel-core-parity`, `check-toll-core-parity`, `check-projection-flags-wired`, `verify_settlement_predicate_parity`).

### Scoreboard

| ID | Finding | Pass 1 | Pass 2 |
|---|---|---|---|
| **C-1** | Fuel share sign inversion | 🟡 | ✅ **Closed** |
| **C-2** | Unbounded unexplained fuel | 🟡 | ✅ **Closed** |
| **C-3** | Toll cards satisfy no identity | 🟡 | ✅ **Closed** (decision made) |
| **C-4** | Net loss floored then summed | 🟡 | ✅ **Closed** |
| **C-5** | Dispute refund double-counted | ✅ | ✅ |
| **C-6** | No real week close | 🟡 | 🟡 **Unblocked, but see below** |
| **C-7** | Reversal clamps eat credits | 🟡 | ✅ **Closed** |
| **H-1** | Collect mixes settled + unfinalized | ✅ | ✅ |
| **H-2** | Blocked-week money invisible | ✅ | ✅ |
| **H-3** | Fuel reversal hard-deletes | ✅ | ✅ |
| **H-4** | Dead integrity hash | 🟡 | ✅ **Closed** |
| **H-5** | `Fixed_Amount` → 50/50 | ✅ | ✅ |
| **H-6** | Fuel snapshot matched by range | ✅ | ✅ |
| **H-7** | No cross-system invariants | 🟡 | 🟡 **Wired, but tautological** |
| **H-8** | Toll events week rule | ✅ | ✅ |
| **H-9** | Three "charged to driver" sources | 🟡 | ✅ **Closed** |
| **M-1** | `cashSourceMismatch` never blocks | ⬜ | ✅ **Closed** |
| **M-2** | Partial double-entry | ⬜ | ✅ **Closed** |
| **M-3** | List-then-filter-in-memory | ⬜ | ✅ **Closed** |
| **M-4** | Cross-tenant org fallback | ⬜ | ⬜ Open |
| **M-5** | Deep-linked step bypass | ⬜ | ⬜ Open |
| **P-1** | O(W×N) rebuild + ctx amplification | 🟡 | ✅ **Closed** |
| **P-2** | KV prefix scans | ⬜ | 🟡 Partial |
| **P-3** | Whole dataset in React state | ⬜ | ⬜ Open |
| **P-4/P-5** | Bundle splitting / virtualization | ⬜ | ⬜ Open |
| **P-6** | Unthrottled scroll | ✅ | ✅ |
| **U-2 / U-4** | Close screen / honest tooltip | ✅ | ✅ |

**21 closed · 3 partial · 5 open.** Every Critical and every High is now closed except the one structural issue below.

### ⚠️ The one thing that still needs work: the invariants can't fail

Pass 1's blocker is gone — all three statement publishers now exist (`fuel_period_routes.ts:399`, `toll_week_seal.ts:95`, `driver_financial_periods.ts:1598`), plus `scripts/backfill-week-statements.mjs` for history. Weeks close. But **three of the four lanes now publish statements derived from the projection they are supposed to check.**

| Lane | Publisher | Source | Independent? |
|---|---|---|---|
| Fuel (finalize ran) | `fuel_period_routes.ts:399` | fuel snapshot `snap.driverShare` / `snap.companyShare` | ✅ **Yes** |
| Fuel (auto-seal) | `week_close.ts:161` | `p.fuel_deduction` / `p.fuel_fleet_share` | ❌ projection |
| Earnings | `driver_financial_periods.ts:1598` | computed inside the rebuild, `closedBy: "dfp_rebuild"` | ❌ projection |
| Toll (default close) | `toll_week_seal.ts:95` via `week_close.ts:208` | `p.toll_charged_to_driver`, `p.toll_reimbursed`, `p.toll_cash_spend`, `p.toll_tag_spend` | ❌ projection |

The consequence is precise. `closeInvariants` asks:

```
period.fuel_deduction  ≟  fuelStatement.driverShare
period.driver_share    ≟  earningsStatement.driverShare
period.toll_spend      ≟  tollStatement.totalSpend
```

When the statement was published *from* those same columns, each check reduces to `x ≟ x` and **can never fail**. `toll_week_seal.ts:66-70` goes further and computes `netLoss = tollSpend − reimbursed − chargedToDriver` — a plug that balances the identity by construction, exactly what §6.4 was written to prevent.

`sealTollWeek` does accept `nettingByDriver` / `chargedAmountsMajor` overrides, and `toll_period_controller.tsx:679` exposes them on an endpoint — so a genuinely independent toll statement is *possible*. But nothing computes canonical-ledger netting and passes it in, and `week_close.ts:208` calls the seal with no overrides.

**Why this matters more than an ordinary open item:** the Close Week screen now shows green and signs weeks. Before Pass 2 it was honestly blocked. A tautological check that reports "all lanes tie" is worse than a check that refuses to run, because it manufactures confidence. This is the same class of defect as the original H-4 dead hash — an integrity control that reads as a guarantee and provides none.

**Fix (small, well-scoped):**
1. Toll lane — have `week_close.ts` compute `computeTollWeekNetting(canonicalEvents)` per driver and pass it as `nettingByDriver`. The function already exists and is tested; it just is not called on the close path.
2. Earnings lane — publish from `computeWeekCommissionShare` + `computeWeekCashBase` outputs *before* they are folded into the row, not from the persisted row.
3. Fuel auto-seal — publish `status: 'draft'` (not `'closed'`) when reconstructing from the projection, and make `closeInvariants` treat a draft lane as `FUEL_STATEMENT_UNVERIFIED` (severity `warn`, surfaced on the Close screen) rather than a silent pass.
4. Add a `closeInvariants` test asserting that a statement whose amounts differ from the period **does** block — today the suite would pass even if the comparison were `x ≟ x`.

### What Pass 2 closed

- **C-1** ✅ Signs preserved end-to-end. `fuel_financial_reset.ts:207-208` no longer strips the sign (`const deduction = Number(report.driverShare) || 0`), and the projection's events path negates instead of `Math.abs`-ing (`driver_financial_periods.ts:1057-1065`), with a comment explaining why spend fields legitimately stay magnitude-only. The two paths now agree on sign.
- **C-2** ✅ Both `splitAllCategoryCosts` call sites use `floorMiscForSplit(...).miscForSplit` (`fuelCalculationService.ts:446, 671`), closing the Personal-Allowance leak; and the gate is now a real blocker — `fuelFinalizeGating.ts:74, 234-250` produces `overExplainedBlockers` from `isOverExplainedFuelWeek`.
- **C-3** ✅ **The business decision was made and locked**: `chargedToDrivers` is a P&L recovery, so `netLoss = tagSpend + cashWashSpend − platformReimbursed − disputeRecovered − chargedToDrivers` (`tollWeekNetting.ts:105-108`). `residual` is now ≈ 0 by construction, and a non-zero value genuinely means the event scan disagrees with itself. This is the right resolution and it is documented as LOCKED in the code.
- **C-4** ✅ `netTollLoss` is now the signed `weekNet.netLoss` (`toll_period_controller.tsx:563`), and the fleet total sums signed values. The upward bias is gone.
- **C-7** ✅ Last clamp removed — `syncPeriodCashFromTransactions` passes `tollPersonal: Number(existing.toll_charged_to_driver) || 0` (`:2140`).
- **H-4** ✅ `verifyPeriodCloseHash` exists and is **called on read** for frozen weeks (`driver_financial_periods.ts:1856-1885`). The hash is now a live control.
- **H-9** ✅ Canonical `toll_charged_to_driver` / `toll_charge_reversed` events are preferred; KV `Toll Charge` rows are fallback only, with a `tollChargedSource: "events" | "kv"` provenance tag.
- **M-1** ✅ `cashSourceMismatch > ε` now blocks close (`closeInvariants.ts:268-273`).
- **M-2** ✅ All four fuel events carry `debitAccountKey` / `creditAccountKey` (`fuel_financial_reset.ts:288-357`) — a trial balance is now possible.
- **M-3** ✅ Real server-side pagination (`pageSize`, `offset`, `sqlLimit`); the `limit: 2000` in-memory pattern is gone.
- **P-1** ✅ `ctx` is now **required** (`ctx: RebuildContext`, `:756`) and no ctx-less callers remain. Combined with Pass 1's per-week bucketing, both the O(W×N) re-scan and the bulk-match full-reload amplification are resolved.
- New: `RestatementQueuePage` registered in nav — the restatement flow from §6.1 now has a surface.

### Still open

| ID | Item | Note |
|---|---|---|
| H-7 | Make the three lanes independently sourced | See above — highest value remaining |
| M-4 | Org fail-closed | `if (opts?.organizationId)` is still conditional; an unresolved org silently queries fleet-wide |
| M-5 | Deep-link step gating | `?week=&step=` still jumps past prior steps |
| P-2 | KV prefix scans | `fuel_controller.tsx` still holds 16 `fuel_entry:` scans |
| P-3 | Whole dataset in React state | `mergeServerFirstLandingPeriods` dual truth still present (`FuelManagement.tsx:352-363`) |
| P-4/P-5 | Bundle splitting, virtualizing toll + fuel tables | Unstarted |

### Recommended order

1. **H-7 independence** (the four sub-items above) — restores the meaning of every close-time check.
2. **M-4** org fail-closed — one-line change, tenant-isolation risk.
3. **P-3 / P-2** — the remaining lag work; user-visible.
4. **M-5, P-4, P-5** — polish.

---

## 1. How the system actually works today

### 1.1 The pipeline

```
                   ┌──────────────────────── OPERATIONAL SSOT ────────────────────────┐
                   │  KV: toll_ledger:*  trip:*  fuel_entry:*  transaction:*           │
                   │      claim:*  finalized_report:*  dispute_refund records          │
                   └──────┬──────────────────┬──────────────────┬─────────────────────┘
                          │                  │                  │
        ┌─────────────────▼───┐   ┌──────────▼─────────┐   ┌────▼──────────────────┐
        │ FUEL RECON          │   │ TOLL RECON         │   │ LEDGER / EVENTS       │
        │ 6-step wizard       │   │ wizard + buckets   │   │ financial_events      │
        │ fuelCalculation-    │   │ toll_period_       │   │ ledger.entries        │
        │ Service (browser)   │   │ controller (edge)  │   │ (canonical)           │
        │ + weekSnapshot-     │   │                    │   │                       │
        │   Engine (Deno)     │   │                    │   │                       │
        └─────────┬───────────┘   └────────┬───────────┘   └───────────┬───────────┘
                  │                        │                           │
                  │ finalized_report:*     │ claims / dispute matches  │ fuel_deduction
                  │ + financial_events     │ + transaction:* rows      │ toll_charged_to_driver
                  │                        │                           │ fare_earning …
                  └────────────┬───────────┴───────────────────────────┘
                               ▼
              ┌────────────────────────────────────────────┐
              │ rebuildDriverFinancialPeriod()             │
              │ driver_financial_periods.ts (2,452 lines)  │
              │ → ledger.driver_financial_periods          │
              └────────────────┬───────────────────────────┘
                               ▼
              ┌────────────────────────────────────────────┐
              │ DRIVER SETTLEMENTS                         │
              │ listCompanyOwes / listDriverOwes /          │
              │ listCashHeld / listReconciled → queue       │
              │ settlement_commands (collect / pay / …)     │
              └────────────────────────────────────────────┘
```

### 1.2 The settlement formula (this part is correct)

`packages/finance-core/src/driverPeriodSettlement.ts` — integer minor units, single source:

```
netPayout        = driverShare − fuelDeduction + tipsPaidToDriver
cashOwed         = baseCashOwed + tollPersonal
cashPaid         = baseCashPaid + tollCashWash
cashBalance      = cashOwed − cashPaid
adjCashBalance   = cashBalance − fuelCredits − cashWrittenOff
grossSettlement  = netPayout − adjCashBalance
settlement       = grossSettlement − settlementPaid      ← the residual
```

The formula is sound. **Every problem in this audit is about the inputs to this formula, not the formula.**

### 1.3 The gating rule

`supabase/functions/_fleet-server/period_projector.ts`:

```
tollsClear    = tollStatus ∈ {reconciled, n/a} ∧ actionable = 0 ∧ unmatched = 0
moneyUnlocked = (fuelFinalized ∧ tollsClear) ∨ forceRelease
```

`fuelFinalized` comes from the **org-wide** `fuel_reconciliation_period` lock for that Monday (`driver_financial_periods.ts:620-634`), not from anything driver-specific. So one driver's settlement release is gated on the whole fleet's fuel week being locked. That is a defensible product decision, but it is undocumented and it means a single unreconciled vehicle freezes every driver's payout.

---

## 2. Findings register

Severity: **C** = Critical (money is wrong or unprovable) · **H** = High · **M** = Medium · **P** = Performance · **U** = UX

---

### C-1 — Negative fuel share is sign-inverted on one path and discarded on the other

**Where**
- `supabase/functions/_fleet-server/driver_financial_periods.ts:983-991` (snapshot fallback)
- `supabase/functions/_fleet-server/fuel_financial_reset.ts:265, 289` (events path)

**What**

Snapshot fallback:
```ts
fuelDeduction  = round2(fuelDeduction  + Math.abs(Number(r.driverShare)  || 0));
fuelFleetShare = round2(fuelFleetShare + Math.abs(Number(r.companyShare) || 0));
```

Events path:
```ts
if (deduction  > 0) { await postFinancialEvent({ eventType: "fuel_deduction",  … }); }
if (fleetShare > 0) { await postFinancialEvent({ eventType: "fuel_fleet_share", … }); }
```

`driverShare` and `companyShare` **can legitimately be negative** — see C-2. When they are:

- **Snapshot path:** `Math.abs(−4,200)` → `fuelDeduction = 4,200`. The driver is **debited** for a week in which the fleet owes them. `netPayout = driverShare − 4,200`.
- **Events path:** `if (deduction > 0)` is false → **no event is posted at all**. The week records `fuelDeduction = 0`.

The same week therefore settles at three different numbers (`−4,200`, `0`, `+4,200`) depending on which flag is on (`projectionReadsEventsForFuel()` / `projectionAllowsFuelSnapshotFallback()`, `driver_financial_periods.ts:971-974`). `metadata.financeCore.projectionSources.fuel` records which path ran — so the divergence is *observable after the fact* but never *prevented*.

**Impact** Direct, silent, signed error in `settlement_amount`. Magnitude equals the full negative share. This is the single most dangerous defect found.

**Fix** Remove `Math.abs()` from both aggregations. Post `fuel_deduction` and `fuel_fleet_share` events unconditionally when `|amount| > MONEY_EPS`, with the true sign. Add a `checkPeriodVsLedgerEvents` case that fails when the projection and the ledger disagree on sign, not just magnitude.

---

### C-2 — Unexplained fuel is unbounded, unfloored, and splits into negative shares

**Where**
- `packages/fuel-core/src/fuelCoverageSplit.ts` → `computeMiscellaneousCost`, `splitAllCategoryCosts`, `assembleLeftoverWeekMoney`
- `apps/fleet/src/services/fuelCalculationService.ts:280-370`

**What**

Category costs are **modelled**, not observed:

```ts
rideShareCost = (totalTripDistance / observedEfficiency) * actualPricePerLiter;
```

`observedEfficiency` requires ≥ 3 odometer entries; otherwise it falls back to `vehicle.fuelSettings.efficiencyCity`, and failing that to `FALLBACK_EFFICIENCY_KM_L` (10 km/L). Then:

```ts
miscellaneousCost = totalSpend − (rideShare + companyUsage + deadhead + personal);
```

There is **no floor, no cap, and no ratio sanity gate**. If the efficiency estimate is too low or trip distance too high, modelled cost exceeds actual spend without limit and `miscellaneousCost` goes deeply negative. That negative value is then passed **straight into the coverage split** (`splitAllCategoryCosts`, Percentage branch):

```ts
companyPay = amount * (pct / 100);          // amount = −27,898.73
return { company: companyPay, driver: amount − companyPay };   // both negative
```

`sumCategoryShare` adds them, producing negative `companyShare` and `driverShare` — which is exactly the input C-1 then mangles.

**Evidence from your own screenshot** (Consumption Reconciliation, Aug 31 – Sep 6):
`1 vehicle · Spend $8,000.00 · Accepted unexplained −$27,898.73`.
The modelled categories summed to **$35,898.73 against $8,000 of actual spend — 4.5×**. This week was *accepted* and carried into settlement.

`assembleWeekSnapshotsFromCalcInput` (`packages/fuel-core/src/weekSnapshotEngine.ts:145-160`) floors `companyShare` at 0 **only on the non-category branch**; the category branch (the one that runs in production) has no floor at all.

**Impact** Arbitrarily large wrong driver balances. Also destroys the meaning of the "unexplained" metric — a number that can be 4.5× spend is not a leakage signal, it is a modelling artefact.

**Fix**
1. Gate at source: block finalize when `|miscellaneousCost| > max(0.25 × totalSpend, floorAmount)` — treat it as a data-quality blocker, not an "accept" button.
2. Floor `miscellaneousCost` at 0 for **splitting purposes** and carry the over-explained amount as a separate signed `overExplainedCost` field that never enters the driver split.
3. Refuse to model category costs at all when `observedEfficiency` came from the 10 km/L constant fallback — mark the week `estimateUnavailable`, the same way `resolvePricePerLiter` already marks `priceUnavailable`. (That pattern is already established and correct; extend it.)
4. Add a finance-core property test: `driverShare ≥ 0 ∧ companyShare ≥ 0 ∧ driverShare + companyShare ≤ totalSpend + ε`.

---

### C-3 — The four Toll Reconciliation cards satisfy no accounting identity

**Where** `supabase/functions/_fleet-server/toll_period_controller.tsx:460-568`

**What** Three cards are computed from operational KV data; the fourth is computed from canonical ledger events by a completely separate function:

```ts
// operational
acc.financials.tollSpend             += amt;                      // :465  toll_ledger debits
acc.financials.reimbursedFromTrips   += tc;                       // :485  trip.tollCharges
acc.financials.chargedToDrivers      += |claim.amount|;           // :496  Resolved + 'Charge Driver' claims

// canonical ledger — unrelated inputs, unrelated arithmetic
netTollLoss: computeTollFleetLossFromEvents(weekEvents).net       // :539
```

Nothing asserts `Spend − Reimbursed − ChargedToDrivers ≈ NetLoss`.

**Evidence from your own screenshot** (Toll Reconciliation, all periods):
```
Toll spend           $52,400.00
Reimbursed           $50,010.00
Charged to drivers   $25,740.00
Net toll loss         $1,470.00     ← "Same as Business Finance P&L"
```
`52,400 − 50,010 − 25,740 = −23,350`. Recovery is shown as **145% of spend**. The four numbers cannot all be true.

Compounding it: the totals are a `reduce` over `periodsOut` **after** the filter `p.startDate >= fromYmd || p.actionableTotal > 0` (`:545`), so the "fleet-wide" cards are actually *lookback-window totals plus older stragglers that still have open work* — a scope no user can reason about.

The `TollFinancialOverviewCards` tooltip promises "Same as Business Finance P&L" (`TollFinancialOverviewCards.tsx:27`). The code cannot keep that promise.

**Fix** Make the identity the definition. Compute one netting from one source and *derive* the display cards from it:
```
netLoss = tagSpend + cashWashSpend − platformReimbursed − disputeRecovered − chargedToDrivers
```
Render a residual/unexplained line when the identity does not close, rather than showing four independently-sourced numbers side by side.

---

### C-4 — Net Toll Loss is floored per-week, then summed — over-recovery is discarded

**Where** `packages/toll-core/src/tollFleetLossNetting.ts:computeTollFleetLossNetting`, consumed at `toll_period_controller.tsx:539, 549-568`

**What**
```ts
const rawNet  = gross − recovered + reinstated;
const net     = round2(Math.max(0, rawNet));
const clipped = rawNet < -0.005;
```

`clipped` is computed, returned — and then **dropped on the floor** by every caller. The per-period `financials.netTollLoss` is the floored value, and the fleet total is `Σ floored(week)`.

A week that over-recovers by $3,000 contributes `0`, not `−3,000`. Across ~30 weeks this biases the total upward without bound and makes the number un-tieable to any ledger.

**Impact** Toll P&L is systematically overstated. The bias is invisible and grows with history.

**Fix** Return the signed `rawNet`. Floor at the *presentation* layer only, and when `clipped` is true surface it explicitly ("over-recovered by $X this week") — over-recovery is a real, actionable finance signal (double reimbursement, duplicate dispute credit), not noise to suppress.

---

### C-5 — Three dispute-refund week rules, one of which double-counts

**Where**
1. `packages/toll-core/src/tollPeriodDisputeHelpers.ts:isDisputeRefundInWizardPeriod`
2. `apps/fleet/src/utils/tollWeekPeriod.ts:computeDisputeRefundCounts`
3. `supabase/functions/_fleet-server/driver_financial_periods.ts:838-847`

**What**

| Rule | Anchor | Partitioning? |
|---|---|---|
| `isDisputeRefundInWizardPeriod` | matched toll's week **OR** refund's own week | **No — returns `true` for both** |
| `computeDisputeRefundCounts` | refund's own `date` only — comment explicitly says *"never its matched toll's date"* | Yes |
| Server projection | matched toll's week if linked, else refund's date | Yes |

```ts
// tollPeriodDisputeHelpers.ts
export function isDisputeRefundInWizardPeriod(refund, periodWeekKey, fleetTz, periodTollIds, periodClaimIds) {
  if (refund.matchedTollId  && periodTollIds?.has(refund.matchedTollId))   return true;
  if (refund.matchedClaimId && periodClaimIds?.has(refund.matchedClaimId)) return true;
  return disputeRefundPeriodWeekKey(refund, fleetTz) === periodWeekKey;   // ← OR, not ELSE
}
```

A refund matched to a toll in week A and dated in week B is **in both weeks**. That is the *normal* case — disputes are filed and refunded weeks after the crossing.

Meanwhile rules 2 and 3 disagree with each other about which single week it belongs to. So the toll wizard, the toll counts helper and the settlement projection give three different answers for the same refund.

**Impact** Dispute recoveries double-counted in wizard totals; period counts that never reconcile between the toll screen and the settlement screen; `tollWorkflowActionable` (which **gates money release**, `period_projector.ts:32-36`) computed from a different population than the screen the operator is looking at.

**Fix** One `disputeRefundPeriodKey(refund, tollDateById, fleetTz)` in `toll-core`, toll-anchor-first with refund-date fallback, returning exactly one key. Delete the other two. Add a property test asserting `Σ over all weeks (count in week) === total refund count`.

---

### C-6 — No week is ever actually closed

**Where**
- `supabase/functions/_fleet-server/settlement_period_freeze.ts` (the gate)
- `supabase/functions/_fleet-server/settlement_commands_controller.tsx:479, 541, 615` (the only three callers)
- `supabase/functions/_fleet-server/driver_financial_periods.ts:1590-1610, 1683-1695` (the de-facto lock)

**What** Three separate problems stacked:

1. **The freeze flag is never written.** `isPeriodFrozen` reads `signedAt`, `metadata.periodFrozen`, `metadata.signedWeek`, `metadata.financeCore.signedAt`. A repo-wide search finds **no writer for any of them**. The gate is dead code — it always returns `false`.

2. **The gate is only checked on money movements**, never on the projection. `assertPeriodNotFrozen` is called from collect / pay / write-off only. `rebuildDriverFinancialPeriod` → `persistPeriodRowWithVersion` has **no freeze check**. A late toll import, a late fuel entry, or an earnings-policy edit silently restates a week you already settled.

3. **The de-facto lock is derived, not declared:**
```ts
function isSignedWeekRow(r) {
  const payoutDone = String(r.payout_status || "").toLowerCase() === "finalized";
  if (payoutDone) return true;
  …
}
```
`payout_status = 'finalized'` is set automatically when `moneyUnlocked && cashStillHeld ≤ $0.50` (`period_projector.ts:48-52`). So a week "locks itself" the moment cash held drops below fifty cents. **No actor, no timestamp, no reason, no approval, no hash.** And that lock is honoured only inside `rebuildAllPeriodsForDriver` — every *direct* call to `rebuildDriverFinancialPeriod` bypasses it: `dispute_refund_controller.tsx:536, 901`, `fuel_financial_reset.ts:217, 346`, `driver_financial_period_controller.tsx:476, 490`.

**Impact** This is the root of *"can I trust that the week is done?"* — **structurally, no.** There is no artefact anywhere in the system that says "this week was closed, by this person, at this time, at these numbers, and here is the hash." `resolveSignedSnapshot` (`periodSignedSnapshot.ts`) comes close but only fires when `settlement_paid` increases, and it is a metadata blob, not a gate.

**Fix** This is the central architectural change — see §6.

---

### C-7 — Reversals beyond the original amount are silently absorbed

**Where**
- `packages/finance-core/src/driverPeriodSettlement.ts:52-63` (`toMinorNonNeg`)
- `supabase/functions/_fleet-server/driver_financial_periods.ts:1052, 1191`

**What**
```ts
function toMinorNonNeg(n: number): MoneyMinor { return toMoneyMinor(Math.max(0, n)); }
// applied to: tipsPaidToDriver, tollPersonal, tollCashWash, fuelCredits, cashWrittenOff, settlementPaid
```
and
```ts
tollPersonal: Math.max(0, tollChargedToDriver),     // :1052
toll_charged_to_driver: round2(Math.max(0, tollChargedToDriver)),  // :1191
```

`tollChargedToDriver` is accumulated at `:819-834` as `Σ (−amount)` over `Toll Charge` transactions. Reversals post as **positive** rows (`driver_toll_charge.ts` documents this: *"an OFFSETTING positive `Toll Charge` row dated identically to the original so the period nets to zero"*). If reversals exceed charges — a genuine over-reversal, a duplicate reversal, or a reversal landing in a week whose original charge sits in a different week — the net is negative and gets **clamped to zero**. The credit owed to the driver vanishes.

Same clamp on `settlementPaid` in `computePeriodSettlementMinor` — a negative correction to settlement paid is absorbed.

**Impact** Silent, one-directional loss of driver credits. Always in the fleet's favour, which makes it an audit-defence problem as well as a correctness problem.

**Fix** Allow signed values through the formula. If a negative `tollPersonal` is genuinely impossible, make it a **hard error** with a drift record, not a clamp. A clamp turns a data bug into a money bug.

---

### H-1 — The Collect queue mixes finalized debt with unfinalized cash

**Where** `supabase/functions/_fleet-server/settlement_commands_controller.tsx:1415-1461`

**What** The `collect` view merges two populations into one list:

```ts
const [owes, held] = await Promise.all([
  listDriverOwesPeriods(opts),   // settlement_status = 'driver_owes'  (money unlocked, settled)
  listCashHeldPeriods(opts),     // settlement_status = 'pending' OR fuel_finalized = false
]);
```
tagged `collectKind: 'cash_held' | 'driver_owes'`.

**Evidence from your screenshot** (Driver Settlements):
```
Driver owes (settled)          $58,432.84   6 weeks
Cash held (not finalized)      $56,134.45   3 weeks
…
Outstanding tab: Kenny Gregory Rattray · 9 weeks · Driver owes $114,567.29   [Collect]
```
`58,432.84 + 56,134.45 = 114,567.29`. The table's single "Driver owes" column is the sum of both. Pressing **Collect** on that rollup collects against three weeks whose fuel and toll reconciliation is **still open** — weeks whose residual will move after the money is taken.

**Impact** Collecting on a moving number. After the fuel/toll week closes, the residual changes and the collection is either short or over — with no linkage back to the collection event.

**Fix** Cash-held weeks are a **custody** position, not a **receivable**. Split them into their own tab with a distinct action ("Log cash returned"), and block `collect` on any period where `moneyUnlocked === false`. The `assertPeriodEndedForSettlement` gate already exists for calendar-close; extend the same pattern to reconciliation-close.

---

### H-2 — Money in `pending` weeks is invisible in every total

**Where** `driver_financial_periods.ts:1873-1895` (`listCompanyOwesPeriods`), `:2123-2145` (`listDriverOwesPeriods`), `period_projector.ts:44-55`

**What** `settlement_status` is only ever set to `company_owes` / `driver_owes` / `settled` when `moneyUnlocked` is true. Otherwise it stays `pending`. Both queue queries filter on the status:

```ts
.eq("settlement_status", "company_owes").gt("settlement_amount", 0.005)
.eq("settlement_status", "driver_owes").lt("settlement_amount", -0.005)
```

So a week with a real $40,000 fleet-owes position that is blocked on one unmatched toll appears in **neither queue**, and the KPI tiles — which are computed client-side from the queue rows (`DriverSettlementsPage.tsx:706-719`) — exclude it entirely.

**Impact** "Fleet owes $105,035.54" is *"fleet owes, among weeks that happen to be unblocked."* There is **no number anywhere in the product** for total fleet exposure. You cannot answer "what do we actually owe?" from this screen.

**Fix** Add a `blocked` tab and a **Total exposure** KPI that sums *all* weeks regardless of gate status, with the blocked portion called out. The gate should control *whether you can act*, never *whether you can see*.

---

### H-3 — Fuel settlement reversal hard-deletes posted money rows

**Where** `supabase/functions/_fleet-server/fuel_enterprise_settlement.ts:83-93`

**What**
```ts
for (const id of toDelete) {
  try { await kv.del(`transaction:fuel-credit-${id}`); } catch {}
  try { await kv.del(`transaction:${id}`); }            catch {}
}
```

Reversing a fuel finalize **deletes** the posted wallet credit and payout deduction rows. The toll module documents the opposite rule for itself, explicitly (`driver_toll_charge.ts:12-14`): *"append-only, double-entry style — never deletes/mutates a prior financial record for a business-state change."* Fuel violates it.

Two further problems in the same function:
- The entry-reset match is `entry.reconciliationStatus === "Verified" && entry.driverId === driverId` **for any entry in the week** (`:117-121`) — it will reset entries finalized by a *different* report.
- There is no transaction boundary. A failure between the credit write and the deduction write (`:224-232`) leaves the week half-posted with no rollback and no marker.

**Impact** Audit trail destroyed. A reversed-and-refinalized week has no record that the first finalize ever happened, which makes any dispute with a driver unanswerable.

**Fix** Post offsetting reversal rows with `reverses_transaction_id` and a `reversalReason`. Never `kv.del` a money row. Scope the entry reset to `metadata.finalizedByReport === reportId`. Wrap credit + deduction in a single idempotent unit keyed on the pair.

---

### H-4 — `sourceEventHash` is a change-detector that detects nothing

**Where** `driver_financial_periods.ts:1094-1108, 1223, 1321`

**What**
```ts
const hashPayload = JSON.stringify({
  tollSpend, tollUnmatchedCount, tollChargedToDriver, fuelDeduction, fuelFinalized,
  disputeRefundUnmatched, driverShare, cashCollected, cashReturned, cashWrittenOff,
  settlementPaid, lineCount: lines.length,
});
const sourceEventHash = await sha256Hex(hashPayload);
```

It is written to `source_event_hash` and read back into the API response — and **never compared to anything**, anywhere. Grep confirms: no verification call site exists.

Worse, the payload **omits** `tollReimbursed`, `fuelFleetShare`, `earningsGross`, `tipsPaidToDriver`, `tollCashSpend`, `disputeRefundMatched`, `cashStillHeld`, `settlementAmount`. A change in reimbursement, fleet share, tips or the settled amount itself produces an *identical* hash.

**Impact** The one artefact that looks like an integrity control provides none. It is worse than absent, because it reads as a guarantee.

**Fix** Either delete it, or make it the real thing: hash the **complete** computed row plus the **input** source-row ids and versions, store it on close, and verify it on every read of a closed week. That is the hash the signed statement in §6 needs.

---

### H-5 — `Fixed_Amount` fuel coverage becomes 50/50 on the server

**Where** `packages/fuel-core/src/weekSnapshotEngine.ts:companyCoveragePercentFromFuelRule` vs `packages/fuel-core/src/fuelCoverageSplit.ts:getCategoryCoverageSplit`

**What**
```ts
// weekSnapshotEngine.ts — the Deno / build-snapshots path
if (rule.coverageType === 'Full')         return 100;
if (rule.coverageType === 'Fixed_Amount') return 50;      // ← coverageValue ignored entirely
```
```ts
// fuelCoverageSplit.ts — the browser path
if (rule.coverageType === 'Fixed_Amount') {
  const companyPay = Math.min(amount, rule.coverageValue || 0);
  return { company: companyPay, driver: amount − companyPay };
}
```

`assembleWeekSnapshotsFromRawEntries` (the Deno path used by `fuel_period_build_snapshots`) never populates `ctx.categoryCosts`, so it always takes the ratio branch — which for a `Fixed_Amount` policy applies a flat 50% split instead of the fixed allowance.

**Impact** Every driver on a fixed-allowance fuel policy is split wrong whenever the server builds the snapshot instead of the browser. `check-fuel-core-parity.mjs` exists but does not cover this divergence.

**Fix** Delete `companyCoveragePercentFromFuelRule`'s coverage-type branching and route the ratio path through `getCategoryCoverageSplit` with a single-bucket cost. Extend the parity script to assert browser-vs-Deno equality across all four `coverageType` values.

Related, same file: `splitAllCategoryCosts`'s Fixed_Amount branch assigns `company.companyUsage = costs.companyUsage` and `company.deadhead = costs.deadhead` in full, then applies the allowance **only** to `rideShare + misc` — so the "fixed amount" is not actually a cap on company spend. That may be intentional; it is undocumented either way.

---

### H-6 — Fuel snapshots are matched to weeks by range, not by anchor

**Where** `driver_financial_periods.ts:977-993`

```ts
for (const r of context.fuelReports) {
  const start = String(r.weekStart || r.periodStart || r.startDate || "").slice(0, 10);
  if (!(start >= periodAnchor && start <= periodEnd)) continue;   // ← range, not equality
```

A fuel report is absorbed into a settlement week if its `weekStart` falls **anywhere inside** the Mon–Sun window. A report anchored on a Wednesday (from a legacy import, a reopened period, or a different week convention) is silently pulled into that week's deduction.

Note `.slice(0, 10)` on `weekStart` — no timezone normalisation (see H-8).

**Fix** `if (start !== periodAnchor) continue;` and emit a drift record for any fuel report whose `weekStart` is not a Monday in fleet tz.

---

### H-7 — Nothing reconciles the three subsystems against each other

**Where** `packages/finance-core/src/periodInvariants.ts`, `packages/finance-core/src/periodLedgerRecon.ts`, `supabase/functions/finance-recon/index.ts`

**What** The nightly recon does two things, both valuable, neither sufficient:

- `checkPeriodInvariants` — **re-runs the same formula on the persisted row and compares.** It proves the row is internally consistent with `computePeriodSettlement`. It cannot detect that `fuel_deduction` or `toll_charged_to_driver` was wrong on the way in. Every defect in C-1, C-2, C-5, C-7 passes this check cleanly.
- `checkPeriodVsLedgerEvents` — compares projection columns to `financial_events` sums. Only covers domains that post events, and only when the projection flags are on.

**Nothing compares:**

| Should be equal | Is checked? |
|---|---|
| `period.fuel_deduction` ↔ fuel week's `driverShare` for that driver-week | **No** |
| `period.toll_spend` ↔ toll recon period's `tollSpend` for that week | **No** |
| `period.toll_charged_to_driver` ↔ toll recon's `chargedToDrivers` | **No** |
| `period.cash_collected` ↔ trip cash + payout_cash for the week | Only as an unblocking `cashSourceMismatch` memo |
| `Σ per-driver settlement` ↔ Business Finance P&L | **No** |

**Impact** This is the direct answer to *"I don't think they're in sync."* There is no mechanism by which they *could* be known to be in sync. Every finding above went undetected because nothing looks for it.

**Fix** §6.4 — cross-system invariants enforced **at close time**, not overnight.

---

### H-8 — Toll ledger events use a different week rule from everything else

**Where** `packages/toll-core/src/tollFleetLossNetting.ts:tollEventDate`, consumed by `toll_period_controller.tsx:259-277`

```ts
export function tollEventDate(e) {
  return String(e.date || e.postingAt || e.createdAt || '').slice(0, 10);
}
```

Raw string slice — **no timezone conversion**. Every other toll surface uses `fleetCalendarDay` / `weekKeyFor` with `America/Jamaica`. Jamaica is UTC−5, so any event that only carries `postingAt` or `createdAt` as a UTC ISO timestamp, occurring after 19:00 local, slices to the **next UTC day** — and if that is a Sunday→Monday crossing, the **next week**.

The same file's `filterTollEventsInDateRange` then does string comparison on that mis-derived day.

So within a single response, `financials.tollSpend` (fleet-tz Monday key) and `financials.netTollLoss` (UTC-sliced key) can bucket the same crossing into different weeks.

**The full week-rule inventory:**

| # | Rule | Location | TZ-correct? |
|---|---|---|---|
| 1 | `periodKeyFor` — Intl → `America/Jamaica` → Monday | `finance-core/periodKey.ts` | ✅ canonical |
| 2 | `tollEventDate` — `.slice(0,10)` on first available timestamp | `toll-core/tollFleetLossNetting.ts` | ❌ |
| 3 | `fuelSettlementEntryYmd` / `ymd()` — `split('T')[0]` | `fuel-core/settlementShared.ts`, `fuel_enterprise_settlement.ts` | ❌ |
| 4 | `parseTollDate` — `new Date(y, m−1, d, …)` in **browser-local** tz | `toll-core/tollDate.ts` | ⚠️ viewer-dependent |
| 5 | `weekBucketForDate` — bare-ymd passthrough, else fleet-tz reprojection | `apps/fleet/utils/tollWeekPeriod.ts` | ✅ (with caveats) |

Rule 4 is the subtle one: `parseTollDate` builds a `Date` in the **browser's** timezone. A fleet manager working from a non-Jamaica timezone gets different week grouping in the toll tables than the server computed. The code comments show awareness of this class of bug ("UTC midnight shifts Mon→Sun in Jamaica") but the fix was applied unevenly.

**Fix** One rule. `periodKeyFor` / `fleetCalendarDay` everywhere. Add a CI guard (`scripts/check-no-naive-date-slice.mjs`) banning `.slice(0, 10)` and `.split('T')[0]` on any identifier matching `/date|at$|At$|time/i` inside the money packages and the fleet server. You already ban a magic constant with `check-fuel-core-parity.mjs`; this is the same technique.

---

### H-9 — "Charged to driver" has three independent sources

| Consumer | Source | Where |
|---|---|---|
| Toll Reconciliation card | `claim.status === 'Resolved' && claim.resolutionReason === 'Charge Driver'` | `toll_period_controller.tsx:492-497` |
| Settlement projection | `transaction:*` rows with `category === 'Toll Charge'` | `driver_financial_periods.ts:596-598, 815-834` |
| Business Finance / P&L | canonical `toll_charged_to_driver` events | `driver_toll_charge.ts` |

The canonical emitter writes the event **unconditionally** but only writes the `transaction:` projection when `driverTollChargeSyncEnabled === true` (default **OFF**, `driver_toll_charge.ts:45-48`). So with the flag off, the ledger knows about the charge and the settlement does not.

A personal-use toll charged directly (without a claim) never reaches the toll card at all — which is why `SuggestedMatchCard.tsx:138` carries the workaround comment *"Cash personal: Charge Driver (not bare reject) so Charged to Drivers updates."* A UI comment compensating for a data-model gap is a reliable signal of exactly this problem.

**Fix** One emitter, one read model. The toll card, the settlement projection and the P&L must all read the canonical `toll_charged_to_driver` event stream. Retire the claim-derived and transaction-derived counts.

---

### M-1 — `cashSourceMismatch` is recorded but never blocks

`periodShareCash.ts:computeWeekCashBase` detects when Uber's ledger `payout_cash` disagrees with the sum of trip cash, prefers the ledger, and records the delta in `metadata.financeCore.cashSourceMismatch`. It is surfaced on the reconciled table but never gates finalize. A week where the two cash sources disagree by any amount can still be settled and signed.

### M-2 — Partial double-entry

`postFinancialEvent` carries `debitAccountKey` / `creditAccountKey` on `fuel_deduction` and `fuel_gas_card_spend`, but **not** on `fuel_fleet_share` or `fuel_driver_spend` (`fuel_financial_reset.ts:289-325`). The event stream is therefore not a balanced book — you cannot run a trial balance against it, which is why every reconciliation in this codebase is a bespoke pairwise comparison instead of a single "does the ledger balance" check.

### M-3 — Server queue does list-then-filter-in-memory

`settlement_commands_controller.tsx:1319-1520`: fetch up to 2,000 rows, then apply search, age-bucket filter, sort, aggregate and page **in JS**. Correct today at your data volume; it does not survive growth, and the `page.truncated` flag means totals can silently be partial.

### M-4 — Cross-tenant fallback

`applyPeriodRangeFilters` applies `organization_id` **only when `opts.organizationId` is truthy**, and the controller passes `orgId || undefined`. If org resolution fails, the queue query runs unscoped across all organisations. Fail-closed would be correct here — `requirePeriodOrganizationId` already models the right pattern for writes (`driver_financial_periods.ts:486-500`); reads should match.

### M-5 — Deep-linked wizard steps bypass gating

`FuelReconciliationDashboard.tsx:107-122` reads `?week=&step=` and jumps straight into the wizard at an arbitrary step without evaluating whether prior steps are satisfied. `FUEL_STEP_ORDER` is used only to validate the step *name*.

---

## 3. Redundancy inventory

Four engines answer "how much toll money moved this week," and none of them defers to another:

| Engine | Input | Output | Consumer |
|---|---|---|---|
| `toll_period_controller` financials | KV `toll_ledger:*`, `trip:*`, `claim:*` | Spend / Reimbursed / ChargedToDrivers | Toll Recon cards |
| `computeTollFleetLossNetting` | canonical `ledger.entries` | Net Toll Loss | Toll Recon card 4 + Business Finance |
| `driver_financial_periods` toll block | KV + `financial_events` | `toll_spend`, `toll_charged_to_driver`, `toll_cash_spend` | Settlement |
| `tollFinancialOverview.ts` (client) | props | Spend / Reimbursed by platform | Wizard cards |

Fuel has two:

| Engine | Where | Notes |
|---|---|---|
| `fuelCalculationService` | browser | category-cost path, personal-allowance aware |
| `weekSnapshotEngine` | Deno | ratio path, **diverges on `Fixed_Amount`** (H-5) |

Plus a **dual-truth merge on the fuel landing page**: `FuelManagement.tsx:334-360` computes `deriveFuelReconciliationPeriods(...)` in the browser from the full entry set and merges it with the server's SQL periods via `mergeServerFirstLandingPeriods`. Two independently-derived truths reconciled by precedence rather than by agreement — the landing page can show numbers the wizard will not reproduce.

**Duplicated helper modules** (mirror + re-export, kept in sync by CI parity scripts): `tollPeriodBucket`, `tollSettlement`, `tollPeriodDisputeHelpers`, `orphanTollClassifier`, `officialTollRate`, `periodShareCash`, `driverPeriodSettlement`. The mirror pattern is a deliberate and correct response to the Deno/Node import constraint (see `docs/` — edge cannot import `roam-shared`). **Keep it.** But the parity scripts must cover *behaviour*, not just existence — H-5 is a parity script that passed while the two implementations disagreed.

---

## 4. Performance audit

You said you don't want the app to lag. Here is where the lag is and why.

### 4.1 Server — full-table scans in the hot path

`loadRebuildContext` (`driver_financial_periods.ts:562-682`) issues, **per driver**:

```ts
loadAllTollLedgerWithTrips()        // every toll + every trip, org-wide, unbounded
loadDisputeRefundRecords()          // every dispute refund
loadAllByPrefix("finalized_report:") // every fuel report ever
loadAllByPrefix("claim:")           // every claim ever
kv.getByPrefix("transaction:")      // every transaction ever  (:558)
kv.getByPrefix("earnings_policy:")  // every policy
```

Then filters in memory. `kv_store.tsx` pages at 1,000 rows per request, so a 40,000-row transaction table is **40 sequential round trips** before any work begins.

Fleet-server-wide prefix-scan counts:

| Prefix | Scan sites |
|---|---|
| `fuel_entry:` | **21** |
| `transaction:` | **17** |
| `finalized_report:` | 10 |
| `toll_ledger:` | 4 |
| `trip:` | 3 |

**The amplification:** `rebuildDriverFinancialPeriod(driverId, anchor)` called **without** a shared `ctx` re-runs the entire load. That happens at:
- `dispute_refund_controller.tsx:536` and `:901` — inside loops over matched refunds
- `fuel_financial_reset.ts:217, 346`
- `driver_financial_period_controller.tsx:476, 490`

A bulk dispute match across 20 refunds spanning 12 weeks = **12 full-dataset loads**.

`rebuildAllPeriodsForDriver` does it correctly (one `ctx`, reused) — but then re-filters all arrays inside `rebuildDriverFinancialPeriod` for every anchor: **O(weeks × rows)**. With 4 drivers × 36 weeks, `weekTolls`/`allWeekTolls`/`chargeTx`/trip loops each rescan the full array 144 times.

**Fix**
1. Pre-bucket once per context: `Map<weekKey, Row[]>` for tolls, trips, transactions, fares, tips, claims, disputes. Turns O(W×N) into O(N + W).
2. Never call `rebuildDriverFinancialPeriod` without a `ctx`. Make `ctx` a required parameter and expose `rebuildOne(driverId, anchor)` as the only ctx-loading entry point.
3. Move the six prefix scans to indexed queries on the mapped `fleet.*` tables with `driver_id` + date-range predicates. The read-through layer (`fleet_table_read_thru.ts`) already exists; the scans just have not been migrated.
4. Cache `getFleetTimezone()` and `resolveDriverOrganizationId` per request — both are re-fetched per rebuild.

### 4.2 Server — queue endpoint

`settlement_commands_controller.tsx`: `limit: 2000` per view, `kv.getByPrefix("driver:")` on **every** request just to attach names, then in-memory search/sort/bucket/aggregate/page. Push predicates and pagination into SQL; join names from `fleet.drivers`.

### 4.3 Client — whole dataset in React state

`FuelManagement.tsx` holds `logs`, `transactions`, `trips`, `vehicles`, `drivers`, `adjustments`, `disputes`, `scenarios`, `finalizedReports`, `cards` in `useState` and passes them **whole** into `FuelReconciliationDashboard` → `FuelPeriodWizard` / `FuelBulkFinalizeDialog` / `FuelPeriodResetDialog`. `dataTruncated` exists precisely because this does not scale.

Every prop is a new array identity on each fetch, so every `useMemo` downstream invalidates and every derived period recomputes.

**Fix** Fetch **per active week**. The wizard operates on one week; it should request one week. React Query is already in the project (`useFuelPeriods`, `useSettlementQueue`) — extend that pattern rather than lifting state to the page.

### 4.4 Client — bundle and render weight

| File | Lines |
|---|---|
| `TollInfoPage.tsx` | 2,608 |
| `DriverSettlementsPage.tsx` | 2,207 |
| `FuelAuditDashboard.tsx` | 2,169 |
| `FuelReimbursementTable.tsx` | 1,735 |
| `ReconciliationWizard.tsx` | 1,644 |
| `ReconciliationTable.tsx` | 1,291 |
| `UnderpaidClaimsStep.tsx` | 1,137 |
| `TollBucketPanel.tsx` | 1,014 |

Virtualization exists **only** in `fleet-financials/settlements` (`useWindowedRows`). The toll wizard, all toll bucket panels and the fuel reconciliation table render every row.

`useWindowedRows` itself calls `setScrollTop` on **every** scroll event with no rAF or throttle — a full table-body re-render per scroll frame.

**Fix** Route-level code splitting for the three sections; `React.lazy` the wizard and each bucket panel; extract the step bodies out of `ReconciliationWizard`; adopt `useWindowedRows` (rAF-throttled) in the toll and fuel tables.

---

## 5. UI / UX findings

**U-1 — Three different mental models for one job.** Fuel uses a 6-step stepper over a tabbed landing. Tolls use a wizard over buckets over a tabbed landing. Settlements use queue tabs over a KPI bar. Same weekly close, three vocabularies, three navigation patterns, three definitions of "done."

**U-2 — There is no "close the week" screen.** To know whether Aug 31 – Sep 6 is finished, an operator must visit Fuel Reconciliation, then Toll Reconciliation, then Driver Settlements, and mentally join them. Nothing in the product shows one week's fuel + toll + settlement state together. This is the single highest-leverage UX change available.

**U-3 — KPIs and the table beneath them use different denominators.** Screenshot 3: the tiles split $58,432.84 / $56,134.45 while the table shows the $114,567.29 sum in one column with one Collect button. Nothing on screen explains the relationship.

**U-4 — A tooltip makes a promise the code cannot keep.** "Net Toll Loss · Same as Business Finance P&L" (`TollFinancialOverviewCards.tsx:27`). Given C-3 and C-4, this is not true, and it is the kind of claim an operator will rely on.

**U-5 — "Accept" is offered for values that should block.** `−$27,898.73` unexplained on `$8,000` of spend is presented as an acceptable outcome with an accept button. There is no magnitude gate. `FuelLeakageStep.tsx:89` even reassures the user that "the unexplained amount stays on the week (not zeroed)" — which is correct behaviour described as if it were a comfort, when the real answer is that this week's data is not fit to settle.

**U-6 — Sparkline with no scale.** The unexplained trend sparkline (`FuelPeriodLandingPage.tsx:162-166`) renders without axis, baseline or magnitude. At `−$27,898.73` it reads as a gentle wiggle.

**U-7 — Naming split (informational, not a defect).** Backend `unclaimed*` vs UI "Unlinked Refunds" is a deliberate API-compatibility decision. Leave it; document it in the glossary.

---

## 6. Target architecture

The fix is not more reconciliation. It is **a contract**, so that reconciliation becomes unnecessary.

### 6.1 The core idea — Weekly Statements

Each subsystem stops being a *view over raw data* and becomes a **publisher of an immutable statement**:

```ts
type WeekStatement = {
  kind: 'fuel' | 'toll' | 'earnings';
  orgId: string;
  driverId: string;
  weekKey: WeekKey;            // periodKeyFor — the ONLY week rule
  version: number;             // monotonic; restatements increment
  status: 'draft' | 'closed' | 'restated';

  amounts: Record<string, MoneyMinor>;   // signed. no Math.abs. anywhere.

  sourceRowIds: string[];      // exactly which rows produced this
  sourceHash: string;          // sha256 over sorted (id, version, amount_minor)
  engineVersion: string;       // which code produced it

  closedAt?: string;
  closedBy?: string;           // a real actor
  closeReason?: string;
  supersedes?: string;         // prior statement id when restating
};
```

Rules:
1. **Settlement reads statements only.** `rebuildDriverFinancialPeriod` never touches `toll_ledger:*`, `fuel_entry:*` or `claim:*` again.
2. **A closed statement is immutable.** New facts produce a *restatement* — a new version that supersedes, with a visible delta. They never mutate history.
3. **A week cannot settle until all three statements are `closed`.** This replaces the current derived `moneyUnlocked` heuristic with an explicit precondition.
4. **Every amount is signed.** Negative fuel share means the fleet owes the driver, and it flows through as a negative. Clamping is banned.

This directly kills C-1, C-6, C-7, H-6, H-7 and most of H-9.

### 6.2 One week rule

`periodKeyFor` from `finance-core` becomes the only week derivation in the codebase. Add a CI guard banning naive date slicing in money paths (mirroring the existing `check-fuel-core-parity.mjs` technique). This kills H-8 and the rule-4 browser-timezone hazard.

### 6.3 One netting per domain

Delete the parallel engines. `toll-core` exports exactly one `computeTollWeekNetting(events) → { tagSpend, cashWashSpend, platformReimbursed, disputeRecovered, chargedToDrivers, netLoss, residual }` where `residual` is whatever does not close, and the UI **renders the residual** rather than hiding it. Same shape for fuel. This kills C-3 and C-4.

### 6.4 Invariants at close time, not overnight

Move `checkPeriodInvariants` from a nightly job to a **precondition of closing**. Add the cross-system checks that do not exist today:

```
close(week) requires, for every driver:
  |period.fuel_deduction        − fuelStatement.driverShare|      ≤ ε
  |period.fuel_fleet_share      − fuelStatement.companyShare|     ≤ ε
  |period.toll_spend            − tollStatement.totalSpend|       ≤ ε
  |period.toll_charged_to_driver− tollStatement.chargedToDriver|  ≤ ε
  |period.cash_collected        − earningsStatement.passengerCash|≤ ε
  earnings_gross = driver_share + fleet_share + tips_paid          (already checked)
  Σ statement amounts by account  = 0                              (true double-entry)
  Σ driver settlements for week   = BusinessFinance week P&L
```

Any failure **blocks the close** and produces a named, actionable drift record. Keep `finance-recon` nightly as a safety net for drift introduced outside the close path — but the close is the enforcement point.

### 6.5 One "Close the Week" surface

A single screen, one week, three lanes:

```
┌───────────────────────────────────────────────────────────────────────┐
│  Week of Aug 31 – Sep 6, 2026                       [ Close week ]    │
├──────────────────┬──────────────────┬─────────────────────────────────┤
│ FUEL             │ TOLLS            │ SETTLEMENT                      │
│ ● 2 blockers     │ ✓ clear          │ ⏸ blocked on fuel               │
│ Spend    $8,000  │ Spend   $5,920   │ Fleet owes      $11,109.21      │
│ Unexplained      │ Reimbursed       │ Drivers owe      $2,340.00      │
│  −$27,898 ⚠ 349% │  $3,975          │ Cash held        $1,204.55      │
│ [ Review → ]     │ [ View → ]       │ [ Blocked ]                     │
├──────────────────┴──────────────────┴─────────────────────────────────┤
│  Identity check                                                       │
│  Spend − Reimbursed − ChargedToDrivers − NetLoss = $0.00  ✓           │
│  Σ driver settlements  ↔  Business Finance P&L      = $0.00  ✓        │
└───────────────────────────────────────────────────────────────────────┘
```

The close button is enabled only when every identity closes. That is what "flawless every week" means in practice: **the system will not let you close a week that does not tie.**

---

## 7. Remediation plan

Phase 0 is not optional. Every later phase changes numbers; without goldens you cannot tell an intended change from a regression.

### Phase 0 — Characterization (before touching anything)

- [ ] Snapshot every `driver_financial_periods` row to a fixture file: `docs/fixtures/periods-baseline-2026-09-07.json`
- [ ] Golden test per driver-week: given fixed inputs, assert the exact current outputs. **Including the wrong ones.** Every subsequent phase either preserves a golden or explicitly restates it with a written reason.
- [ ] Run `finance-recon` manually and archive the drift report as the "before" state.
- [ ] Add an ad-hoc script computing the four toll-card identity residuals per week — quantify C-3's real magnitude across all history.
- [ ] Query every week where `|miscellaneousCost| > 0.25 × totalSpend` — quantify C-2's blast radius and identify every settlement already affected by C-1.

### Phase 1 — Stop the bleeding (money-correctness, no architecture change)

- [ ] **C-1** Remove `Math.abs()` from fuel aggregation in `driver_financial_periods.ts:983-991`; post fuel events on `|amount| > ε` with true sign.
- [ ] **C-2** Add the `|misc| > 25% of spend` finalize blocker; mark `estimateUnavailable` when efficiency came from the 10 km/L fallback; floor `misc` at 0 for splitting and carry over-explained separately.
- [ ] **C-7** Replace the `Math.max(0, …)` clamps with signed pass-through + a drift record on negative `tollPersonal`.
- [ ] **H-5** Route the Deno ratio path through `getCategoryCoverageSplit`; extend `check-fuel-core-parity.mjs` to cover all four coverage types.
- [ ] **H-6** `start !== periodAnchor → continue`.
- [ ] **H-3** Replace `kv.del` with offsetting reversal rows; scope entry reset to `finalizedByReport`.
- [ ] Re-run goldens. Every diff must be explained in writing.

### Phase 2 — One week rule

- [ ] Replace `tollEventDate`, `fuelSettlementEntryYmd` and `ymd()` with `fleetCalendarDay`.
- [ ] Make `parseTollDate` fleet-tz explicit rather than browser-local.
- [ ] Add `scripts/check-no-naive-date-slice.mjs` to CI.
- [ ] Backfill: re-bucket historical toll events; report every row that moves week.

### Phase 3 — One netting per domain

- [ ] **C-5** Single `disputeRefundPeriodKey` in `toll-core`; delete the other two; add the partition property test.
- [ ] **C-3/C-4** One `computeTollWeekNetting` with a signed net and an explicit `residual`. Derive all four cards from it. Surface `clipped` / over-recovery in the UI.
- [ ] **H-9** All three "charged to driver" consumers read the canonical event stream. Retire the claim-derived and transaction-derived counts.
- [ ] **U-4** Rewrite the tooltip to state what the number actually is.

### Phase 4 — Weekly Statements

- [ ] `ledger.week_statements` table + `WeekStatement` type in `finance-core`.
- [ ] Fuel finalize publishes a `fuel` statement; toll finish publishes a `toll` statement; the earnings/cash block publishes an `earnings` statement.
- [ ] `rebuildDriverFinancialPeriod` reads statements only. Behind a flag, shadow-compared against the current path until zero drift over a full week.
- [ ] Restatement flow: a new fact on a closed week creates version n+1 with a visible delta and an audit row, never an in-place update.

### Phase 5 — Real close, real invariants

- [ ] **C-6** `closeWeek(orgId, weekKey, actorId, reason)` — writes `closedAt` / `closedBy` / `closeHash`.
- [ ] `assertPeriodNotFrozen` enforced in `persistPeriodRowWithVersion`, not just in the three command handlers.
- [ ] **H-4** `sourceEventHash` becomes the close hash: full row + input ids/versions, verified on every read of a closed week.
- [ ] All §6.4 cross-system invariants run as close preconditions.
- [ ] **M-2** Account keys on every posted event; add a trial-balance check.
- [ ] **M-1** `cashSourceMismatch > ε` blocks close.

### Phase 6 — Performance

- [ ] Pre-bucket `RebuildContext` by week key (O(W×N) → O(N+W)).
- [ ] Make `ctx` required on `rebuildDriverFinancialPeriod`; one ctx-loading entry point.
- [ ] Migrate the 6 KV prefix scans to indexed `fleet.*` queries with driver + date predicates.
- [ ] Server-side pagination and aggregation for the settlement queue; join driver names in SQL.
- [ ] Per-week fetching in the fuel wizard; delete `mergeServerFirstLandingPeriods` dual truth.
- [ ] Route-level code splitting; virtualize toll and fuel tables; rAF-throttle `useWindowedRows`.

### Phase 7 — The unified close experience

- [ ] Build the "Close the Week" screen (§6.5).
- [ ] One shared step/blocker vocabulary across all three sections.
- [ ] **H-1** Split cash-held into its own custody tab; block `collect` when `moneyUnlocked === false`.
- [ ] **H-2** Total-exposure KPI including blocked weeks.
- [ ] **U-5/U-6** Magnitude gates and scaled sparklines.

---

## 8. Invariants to encode as tests

```
MONEY
  M1  round2 is the only rounding function in any money path
  M2  no Math.abs() in any aggregation of a signed quantity
  M3  every persisted money field has a *_minor integer twin that agrees within 0

WEEK
  W1  periodKeyFor is the only week derivation
  W2  every event belongs to exactly one week
  W3  Σ over weeks (count in week) === total count          ← catches C-5
  W4  bucketing is stable under viewer timezone change      ← catches rule 4

FUEL
  F1  driverShare ≥ 0 ∧ companyShare ≥ 0
  F2  driverShare + companyShare ≤ totalSpend + ε
  F3  browser and Deno engines agree for all 4 coverage types  ← catches H-5
  F4  |miscellaneousCost| ≤ 0.25 × totalSpend, else week is not finalizable

TOLL
  T1  tagSpend + cashWashSpend − platformReimbursed − disputeRecovered
        − chargedToDrivers − netLoss = 0                       ← catches C-3
  T2  netLoss is signed; clipping is surfaced, never silent    ← catches C-4
  T3  one dispute refund → exactly one week

SETTLEMENT
  S1  settlement = grossSettlement − settlementPaid            (exists)
  S2  earnings_gross = driver_share + fleet_share + tips_paid  (exists)
  S3  period.fuel_deduction        = fuelStatement.driverShare       ← NEW
  S4  period.toll_charged_to_driver= tollStatement.chargedToDriver   ← NEW
  S5  Σ driver settlements(week)   = BusinessFinance P&L(week)       ← NEW
  S6  a closed week's hash verifies on read                          ← NEW
  S7  posted movement + its reversal net to zero              (exists)
```

---

## 9. Priority summary

*Original ranking, annotated with verified status after Pass 2 (2026-09-07). See §0.6 for detail.*

| Rank | ID | Finding | Effort | Status |
|---|---|---|---|---|
| 1 | C-1 | Fuel share sign inversion / silent drop | S | ✅ closed |
| 2 | C-2 | Unbounded unexplained fuel → negative shares | M | ✅ closed |
| 3 | C-6 | No real week close | L | ✅ closes with honest independent blockers |
| 4 | C-3 | Toll cards satisfy no identity | M | ✅ closed (decision locked) |
| 5 | C-5 | Dispute refund double-counted across weeks | S | ✅ closed |
| 6 | C-7 | Reversal clamps eat driver credits | S | ✅ closed |
| 7 | C-4 | Net loss floored then summed | S | ✅ closed |
| 8 | H-7 | No cross-system invariants | M | ✅ independent lanes; draft blocks |
| 9 | H-1 | Collect queue mixes settled + unfinalized | S | ✅ closed |
| 10 | H-3 | Fuel reversal hard-deletes money rows | S | ✅ closed |
| 11 | H-8 | Toll events use a different week rule | S | ✅ closed (+ CI guard) |
| 12 | H-2 | Blocked-week money invisible | S | ✅ closed |
| 13 | H-5 | Fixed_Amount → 50/50 on server | S | ✅ closed |
| 14 | H-9 | Three sources for "charged to driver" | M | ✅ closed |
| 15 | H-6 | Fuel snapshot matched by range | XS | ✅ closed |
| 16 | H-4 | Dead integrity hash | S | ✅ closed (verify-on-read aligned) |
| 17 | P-1 | Full-table scans per rebuild | M | ✅ closed |
| 18 | P-3 | Whole dataset in React state | L | ✅ server-only landing when SQL covers |
| 19 | U-2 | No unified week-close screen | M | ✅ closed |

---

## 10. Closing note

The engineering in the individual modules is better than the outcome suggests. `settlement_commands.ts`, `money.ts`, `periodKey.ts` and the CI parity suite are the work of someone building carefully. The failure is at the **seams** — three subsystems that were each built to be correct on their own, wired together by implicit convention rather than explicit contract, with no mechanism that could ever tell you they had drifted apart.

Fixing the seven Criticals will make the numbers right. Adding the statement contract and the close-time invariants is what makes them **provably** right — which is the actual thing being asked for.

The order matters: **Phase 0 first.** Without the goldens, Phase 1 will change numbers you cannot distinguish from the numbers that were already wrong.

---

## 12. Pass 2 close-out — 2026-09-07

Every Critical and every High from the original audit is now closed except one, and three of the five Mediums went with them. The money defects are gone: signs survive end-to-end, the unexplained residual can no longer become a driver debt, the toll cards reconcile to a stated definition, the clamps are removed, the close hash is verified on read, and the rebuild no longer re-scans the world.

Two decisions in this pass deserve to be called out as good ones. **C-3** was settled the right way — `chargedToDrivers` was declared a P&L recovery and folded into `netLoss`, so the residual is now a genuine self-consistency signal instead of a constant. And the fuel gate was promoted from a banner to a real `overExplainedBlockers` list, which is what made C-2 actually safe rather than merely documented.

What remains is one structural issue, and it is the mirror image of Pass 1's. Pass 1 built the close machinery and could not run it. Pass 2 made it run — by having the close path publish the statements it then checks. That unblocked the flow, but it means **the cross-system invariants compare each value to itself and cannot fail.** The fuel lane is genuinely independent when fuel finalize actually ran; the earnings lane never is; the toll lane is not on the default close path.

This is worth fixing before the next reconciliation cycle, not because anything is currently miscalculated, but because the Close Week screen now certifies weeks on the strength of checks that cannot detect a disagreement. `computeTollWeekNetting` already does the independent computation and is tested — it simply is not called from `week_close.ts`. The four sub-items in §0.6 are small and well-bounded.

After that: `M-4` (org fail-closed) is a one-line tenant-isolation fix, and the remaining lag work (`P-2`, `P-3`) is the last of the original performance findings.

---

## 0.7 Remediation status — Pass 3, verified 2026-09-07 (current)

**Goal:** Close Week checks can fail (H-7). Draft statements cannot greenwash a close.

### Scoreboard (delta from Pass 2)

| ID | Finding | Pass 2 | Pass 3 |
|---|---|---|---|
| **H-7** | Cross-system invariants tautological | 🟡 | ✅ **Closed** — independent publishers; draft unverified blocks |
| **H-4** | Close hash verify payload skew | ✅ (write) / 🟡 (verify) | ✅ **Closed** — verify uses stored sourceRowIds + engineVersion |
| **M-4** | Org fail-closed | ⬜ | ✅ **Closed** |
| **M-5** | Deep-link step gating | ⬜ | ✅ **Closed** (wizard clamp + e2e + unit) |
| **P-2** | KV prefix scans | 🟡 | 🟡 Partial — periods-health migrated to SQL |
| **P-3** | Dual-truth fuel landing | ⬜ | ✅ **Closed** — server-only when SQL covers range |
| **P-4/P-5** | Virtualize toll/fuel | ⬜ | 🟡 Partial — FuelSettlementTable windowed |
| **C-6** | Real week close | 🟡 | ✅ **Closes with honest blockers** |

**Still open / follow-on:** flip `PROJECTION_READS_WEEK_STATEMENTS` after shadow drift (Pass 4 cutover); Business Finance P&L feed for settlement↔P&L block; remaining `fuel_entry:` admin scans; TollBucketPanel virtualization.

### Docs

- `docs/finance-recon/2026-09-07-pass3-independence.md`
- `docs/finance-recon/2026-09-07-close-week-runbook.md`

---

## 11. Post-remediation note — Pass 1, 2026-09-07

Phase 0 was done properly (baseline fixture, goldens, blast-radius scripts, a "before" report), which is what made this re-audit possible at all. Nine findings are genuinely closed, including all four of the pure week-rule and data-integrity defects, and the two structural UX gaps.

The pattern in what remains is worth naming: **the hard thinking landed, the last wiring step didn't.** In five separate cases the correct mechanism was built and then not connected to the path that actually runs —

- C-1: signs fixed on the snapshot path; the *events* path (the preferred one) still calls `Math.abs`.
- C-2: floored split shipped; the Personal-Allowance branch still passes raw misc, and the gate renders a warning instead of blocking.
- C-4: `rawNet` and `clipped` computed and exposed; the headline card still reads the floored value.
- C-6/H-7: close, freeze, hash and invariants all built and wired; two missing publishers make every close fail.
- H-4: the hash is now real; nothing verifies it.

None of these are design problems — they are one-line-to-one-function connections. The next pass is mostly short work, and the ordering in §0.5 matters: **the toll and earnings statement publishers come first**, because until they exist the close path cannot succeed and none of the Phase 5 work can be proven end-to-end.

One item does still need a decision rather than code: **C-3.** Whether `chargedToDrivers` reduces fleet toll loss or sits outside the P&L as a wallet movement is a business question, not an engineering one. Until it is answered the four cards will keep reporting an unexplained gap exactly equal to the amount charged to drivers.

---

*Original audit: read-only, no source files modified. §0.5 / §11 (Pass 1), §0.6 / §12 (Pass 2), and §0.7 (Pass 3) added 2026-09-07 after verifying each remediation against the working tree. §0.7 is the current status.*
