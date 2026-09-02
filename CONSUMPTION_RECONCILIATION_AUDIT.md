# Consumption Reconciliation — Deep Audit

**Date:** 2026-09-02
**Scope:** The Fuel → Consumption Reconciliation surface only — landing page, week wizard, all six steps, finalize, reopen, bulk operations, and the server routes and calculation paths behind them.
**Method:** Static read of every file in the reconciliation dependency graph. **No code was changed.**
**Companion docs:** [FUEL_SYSTEM_AUDIT.md](FUEL_SYSTEM_AUDIT.md) (whole fuel domain, 2026-08-26), [TOLL_SYSTEM_AUDIT.md](TOLL_SYSTEM_AUDIT.md).

> This audit deliberately overlaps very little with the August fuel audit. That one surveyed the domain; this one pulls apart one section down to the line.

---

## 0. Executive summary

Consumption Reconciliation is a **well-designed workflow sitting on the wrong architecture**. The step model, the hard-gate machine, the exception blocker panel, and the money-clarity language ("Where the money came from" / "Who ends up paying") are genuinely good product thinking — better than most fleet software. The pure logic modules (`fuelPeriodGating`, `fuelPeriodStatus`, `fuelFinalizeGating`, `fuelWeekPeriod`) are small, well-commented, and unit-tested.

The problem is that **the entire reconciliation engine — period derivation, money calculation, and the finalize transaction — runs in the browser**, against a KV store scanned by prefix, with no server-side period entity, no idempotency, no concurrency control, and no persisted workflow state. Everything the UI shows is recomputed from scratch on every mount from an unbounded, silently-truncated client-side dataset.

That single architectural choice is the root cause of most findings below. It is not an "enterprise-level function" today, and no amount of UI polish fixes it.

### The seven findings that matter most

| # | Finding | Severity |
|---|---|---|
| **C1** | `reset-period` ("Reopen week") is **not org-scoped** — it deletes snapshots, resets fuel entries, and deletes transactions for **every tenant** that shares the same Monday. | 🔴 Critical |
| **C2** | Re-finalize reverses the prior settlement, then `continue`s without re-posting when no entries qualify — **money is reversed and never restored**, while the snapshot still claims it. | 🔴 Critical |
| **C3** | Shared-car (multi-vehicle) driver weeks are **counted once per vehicle** on the landing card and in the wizard money strip — spend, shares and Unexplained are inflated N×. | 🔴 Critical |
| **C4** | Finalize is a **non-atomic, non-resumable, non-idempotent distributed transaction driven by a browser `for` loop**. A closed tab mid-loop leaves the fleet half-settled. | 🔴 Critical |
| **C5** | Every data source is **unbounded or silently capped** — `getFinalizedReports()` full-prefix scan, `getFuelEntries({limit:1500})` over all history, `getTripsFiltered({limit:1500})` per week. Past the caps the money is simply wrong, with no error. | 🔴 Critical |
| **H1** | Completed weeks still render an amber **"Unexplained fuel — 1 to review"** chip (visible in the current UI). Locked weeks report open work forever. | 🟠 High |
| **H3** | **Bulk Finalize bypasses the open-dispute hard gate** the single-week wizard enforces. | 🟠 High |

**Counts:** 5 Critical · 10 High · 17 Medium · 12 Enhancements.

### What is genuinely good — do not rewrite

- [`fuelPeriodGating.ts`](apps/fleet/src/utils/fuelPeriodGating.ts) — the actionable/informational split and `computeFuelGatedStepStates` are the right model. Keep verbatim.
- [`FuelExceptionBlockersPanel.tsx`](apps/fleet/src/components/fuel/reconciliation/FuelExceptionBlockersPanel.tsx) — names the exact fill, date, amount, station, and reason, and resolves in place. This is the pattern every other step should copy.
- [`fuelWeekPeriod.ts`](apps/fleet/src/utils/fuelWeekPeriod.ts) — `YYYY-MM-DD` string comparison throughout, no UTC-parsing traps. Correct.
- The Stitch money-strip vocabulary. "Cash from earnings (credit)" / "Driver's fuel share (charge)" is plain-English accounting that a fleet manager can actually act on.
- `withSoftTimeout` in [`buildFuelWeekReportsForFinalize.ts:64`](apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts#L64) — a pragmatic guard against one slow dependency hanging the wizard.

---

## 1. System map

### 1.1 Component tree

```
FuelManagement.tsx  (page — owns ALL state: vehicles, drivers, logs, adjustments,
│                    disputes, scenarios, cards, finalizedReports, trips)
│
├── useFuelLandingLiveReports  ─── runs the FULL money engine for up to 8 open weeks,
│                                  sequentially, on mount
├── deriveFuelReconciliationPeriods  ─── pure; builds the period cards
│
└── FuelReconciliationDashboard   (view router: landing | wizard | archive)
    ├── FuelPeriodLandingPage         Outstanding / In Progress / Completed tabs
    │   └── PeriodCard → StepStatusCell ×6
    ├── FuelPeriodWizard              1,110 lines — the whole 6-step walkthrough
    │   ├── useFuelWeekReports        runs the money engine AGAIN for this week
    │   ├── FuelWeekMoneyStrip        6 money cards
    │   ├── FuelPeriodStepper
    │   ├── FuelExceptionBlockersPanel → FuelExceptionResolveDialog
    │   ├── FuelDataQualityStep
    │   ├── FuelCoverageMatrix         (policy-check step)
    │   ├── BucketReconciliationView   (leakage step, stop-to-stop detail)
    │   └── inline <table> ×2          (settlement-preview + finalize — near duplicates)
    ├── FuelPeriodResetDialog         "Reopen week"
    ├── FuelBulkFinalizeDialog → BulkWeekActionDialog
    └── FinalizedReportsTab           archive
```

### 1.2 The six steps

| # | Step id | UI label | Blocks advance when | Source of the count |
|---|---|---|---|---|
| 1 | `data-quality` | Data quality | unacknowledged exception-tier fills > 0 | `fuelPeriodStatus.ts:249` (landing only) / `evaluateFuelFinalizeGating` (wizard) |
| 2 | `adjustments-disputes` | Disputes | any open dispute in week | `buildFuelStepCounts:85` |
| 3 | `policy-check` | Policy check | **never** (informational only) | `buildFuelStepCounts:89` |
| 4 | `leakage-gap` | Unexplained fuel | `misc > EPS` and not marked reviewed | `buildFuelStepCounts:93` |
| 5 | `settlement-preview` | Settlement | **never** — no counts are ever written | *(nothing)* |
| 6 | `finalize` | Finalize | vehicle has spend and isn't finalized | `buildFuelStepCounts:101` |

Two of six steps can never block. Step 5 is a read-only table with no gate at all.

### 1.3 Where the money actually comes from

```
FuelCalculationService.generateDriverFleetReport()   ← runs IN THE BROWSER
    ↑ trips (api.getTripsFiltered, limit 1500)
    ↑ deadhead map (api.getFleetDeadhead)
    ↑ personal-allowance context (buildPersonalAllowanceReconContext)
    ↑ fuel-brain classification (per vehicle, edge function, concurrency 3)
    ↑ scenarios / policy versions
    ↓
WeeklyFuelReport[]  →  finalizeFuelWeekReports()  ← ALSO runs in the browser
    → settlementService.reverseEnterpriseFuelSyncForReport()   (per driver)
    → api.closeFuelWeekCycles()                                (per vehicle)
    → settlementService.commitWeeklyStatement()                (per driver)
    → api.saveFinalizedReports([snapshot])                     (per driver)
    → tierService.setPersonalAllowanceBonusKm()                (per driver)
```

**There is no server-side period record.** "Completed" is inferred client-side from the presence of `finalized_report:*` KV rows. There is no `fuel_reconciliation_period` table, no status column, no `locked_at`, no `locked_by`, no version.

---

## 2. Critical findings

### C1 🔴 — `reset-period` destroys other tenants' data

[`fuel_controller.tsx:1481-1740`](supabase/functions/_fleet-server/fuel_controller.tsx#L1481)

"Reopen week" calls `api.resetFuelPeriod(weekKey)` → `POST /finalized-reports/reset-period`. That route:

```ts
const snapshots = ((await kv.getByPrefix("finalized_report:")) || []).filter(
  (s: any) => s?.weekStart && String(s.weekStart).split("T")[0] === weekKey,   // ← week only
);
...
const allFuelEntries = (await kv.getByPrefix("fuel_entry:")) || [];            // ← all tenants
...
const allTransactions = (await kv.getByPrefix("transaction:")) || [];          // ← all tenants
```

`filterByOrg` / `belongsToOrg` / `narrowPlatformOrg` **appear nowhere in the route body** (verified: zero matches in lines 1481–1740). It then:

- `kv.del`s every `finalized_report:<week>:<driverId|vehicleId>` for that week,
- rewrites every settled `fuel_entry` in that date range back to `Pending`,
- `kv.del`s every matching `transaction:` row,
- calls `deleteCanonicalLedgerBySource` on those transaction ids,
- reverses financial events for every collected `driverId`.

A fleet admin at Org A reopening *their* week silently wipes Org B's and Org C's finalized settlements for the same Monday.

**The contrast is damning.** The sibling `DELETE /finalized-reports/:weekStart/:identityId` route at [line 1206](supabase/functions/_fleet-server/fuel_controller.tsx#L1206) is carefully scoped, with the comment *"Org-scoped fallback only — never scan all tenants"* and a `belongsToOrg` 403. `reset-period` is the primary path and has none of it — the scoped DELETE only runs as the client-side fallback when `resetFuelPeriod` throws ([`FuelPeriodResetDialog.tsx:75-106`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodResetDialog.tsx#L75)).

**Fix:** apply `filterByOrg` to all three prefix scans, add a `belongsToOrg` assertion per record before every `kv.del`/`kv.set`, and reject when the caller's org resolves to null. This is a same-day fix and should not wait for any redesign.

---

### C2 🔴 — Re-finalize reverses money it never re-posts

[`fuelFinalizeService.ts:96-118`](apps/fleet/src/services/fuelFinalizeService.ts#L96)

```ts
if (prior) {
  await settlementService.reverseEnterpriseFuelSyncForReport(report);   // ← money reversed
}

const weekEntries = entriesBelongingToDriverWeekReport(fuelEntries, report, attrCtx);
const relevantEntries = prior
  ? weekEntries.filter(e =>
      e.reconciliationStatus === 'Pending' ||
      e.reconciliationStatus === 'Verified' ||
      e.metadata?.finalizedByReport)
    .map(e => ({ ...e, reconciliationStatus: 'Pending' as const }))
  : weekEntries.filter(e => e.reconciliationStatus === 'Pending');

if (relevantEntries.length === 0 && prior) {
  continue;                                                            // ← leaves the loop
}
```

When a week is re-finalized and its entries carry any status outside `Pending | Verified` **and** lack `metadata.finalizedByReport` — `Archived` and `Disputed` both qualify, and the reset path itself strips `finalizedByReport` — the reversal has already fired and `continue` skips both the re-commit **and** the snapshot re-save.

Net result: the settlement is reversed, the prior `finalized_report:` KV row is untouched and still asserts the driver was charged, and the function reports `snapshotCount: 0` → the UI shows `toast.info('No pending items found to finalize.')`. **The operator is told nothing happened while money moved.**

**Fix:** move the reversal to *after* `relevantEntries` is computed, or make the empty case re-post the prior settlement before `continue`. Better: make reverse+repost a single server-side transaction (see §6).

---

### C3 🔴 — Shared-car weeks are counted once per vehicle

Three files, one bug.

**Landing** — [`useFuelLandingLiveReports.ts:132-150`](apps/fleet/src/hooks/useFuelLandingLiveReports.ts#L132) fans one driver-week report out to every vehicle it touched, copying the **full week totals** into each slice:

```ts
for (const vehicleId of vehicleIds) {          // vehicleIds = r.vehicleIds (multi-car)
  slices.push({
    vehicleId,
    totalGasCardCost: Number(r.totalGasCardCost) || 0,   // ← full week total, per vehicle
    companyShare:     Number(r.companyShare) || 0,
    driverShare:      Number(r.driverShare) || 0,
    miscellaneousCost: Number(r.miscellaneousCost) || 0,
  });
}
```

[`fuelPeriodStatus.ts:268-271`](apps/fleet/src/utils/fuelPeriodStatus.ts#L268) then sums those slices **per vehicle**:

```ts
const totalSpend  = withSpend.reduce((s, v) => s + v.totalSpend, 0);
const netLeakage  = withSpend.reduce((s, v) => s + v.misc, 0);
```

**Wizard** — the same shape appears in the money strip. [`FuelPeriodWizard.tsx:286-288`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L286) matches a report to a vehicle by `r.vehicleId === vehicle.id || (r.vehicleIds || []).includes(vehicle.id)`, so both vehicles of a two-car driver bind to the same report; [`:411-428`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L411) then sums `vehicleSnaps`:

```ts
company: active.reduce((s, v) => s + v.companyShare, 0),
driver:  active.reduce((s, v) => s + v.driverShare, 0),
leakage: active.reduce((s, v) => s + v.misc, 0),
```

**Confirmed multi-vehicle reports are real:** [`fuelCalculationService.ts:702-830`](apps/fleet/src/services/fuelCalculationService.ts#L702) builds `vehicleIds` from the week's entries and emits one report per driver.

Meanwhile `settlementRows` at [`:335-355`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L335) iterates `liveReports` directly and is **correct**. So on any shared-car week:

> the money strip at the top of the wizard disagrees with the settlement table three steps below it, and the landing card disagrees with both.

`strip.gasCard` and `strip.cashFromEarnings` (lines 416–419) are also computed from `liveReports` and are correct — meaning **within the same six-card strip, the top row is right and the bottom row is inflated.**

**Fix:** derive all week aggregates from `liveReports` (one row per driver-week), and use `vehicleSnaps` only for per-vehicle presentation. Never sum a driver-week figure across vehicles.

---

### C4 🔴 — Finalize is a browser-driven distributed transaction

[`fuelFinalizeService.ts:65-263`](apps/fleet/src/services/fuelFinalizeService.ts#L65)

Per driver-week, in a `for` loop in the tab: reverse → close cycles → commit settlement → save snapshot → (later) write PA bonus. Five network round-trips per driver, N drivers per week, and in bulk mode up to 8 weeks back to back.

What is missing:

| Property | Present? | Consequence |
|---|---|---|
| Atomicity | ❌ | Tab closed / laptop sleeps / wifi drops mid-loop → half the fleet settled, half not, and nothing records where it stopped. |
| Idempotency key | ❌ | Retry after a timeout that actually succeeded double-posts. |
| Resumability | ❌ | No job row, no cursor. Recovery is manual reconciliation. |
| Optimistic concurrency | ❌ | Two admins finalizing the same week both succeed. `FleetBusyLock` is per-browser-tab only. |
| Server-side gate re-check | ❌ | The client decides whether gates pass. `POST /finalized-reports` accepts whatever snapshot it is handed. |
| Actor attribution | ❌ | `finalizedByUser: 'admin'` is a hardcoded string ([`:157`](apps/fleet/src/services/fuelFinalizeService.ts#L157)). |

The compensating-transaction logic at [`:197-236`](apps/fleet/src/services/fuelFinalizeService.ts#L197) is a good instinct, but the compensation can itself fail — and when it does the only record is a `failures[]` entry rendered in a toast that disappears in four seconds. There is no dead-letter queue, no retry, no alert.

**This is the finding that most disqualifies the section from "enterprise-level."**

---

### C5 🔴 — Every data source is unbounded or silently capped

| Source | Call site | Cap | What happens past it |
|---|---|---|---|
| Finalized snapshots | [`FuelManagement.tsx:403`](apps/fleet/src/pages/FuelManagement.tsx#L403) `api.getFinalizedReports()` — **no arguments** | none — server does `kv.getByPrefix("finalized_report:")` ([`fuel_controller.tsx:843`](supabase/functions/_fleet-server/fuel_controller.tsx#L843)) | Full scan of every snapshot ever written, all orgs, filtered in memory, shipped whole to the browser. Each snapshot embeds `settledEntries[]` and `fuelCycles[]`. At 52 weeks × 50 drivers this is a multi-MB payload on **every page load**. |
| Fuel entries | [`FuelManagement.tsx:346`](apps/fleet/src/pages/FuelManagement.tsx#L346) `getFuelEntries({ startDate, endDate, limit: 1500 })` over `fuelFetchWindow` | 1500 | `fuelFetchWindow` ([`:122-149`](apps/fleet/src/pages/FuelManagement.tsx#L122)) spans **first activity → today** by design. 50 vehicles × 3 fills/week × 52 weeks = 7,800 entries. Past 1,500, weeks silently lose spend, exceptions vanish from the gate, and cards misclassify. No indicator. |
| Trips (per week) | [`buildFuelWeekReportsForFinalize.ts:53-61`](apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts#L53) `limit: 1500, offset: 0` | 1500 | No pagination. Past 1,500 trips/week, ride-share km is under-counted → km falls into personal/deadhead → **driver is over-charged**. |
| Trips (page-level) | [`FuelManagement.tsx:334-340`](apps/fleet/src/pages/FuelManagement.tsx#L334) | 1500 | Comment says *"Cap at 1500 to prevent browser lag"* — an acknowledged truncation of a money input. |

Truncation that silently changes money is worse than an error. **Every one of these needs either real pagination or a hard failure with a visible banner.**

---

## 3. High findings

### H1 🟠 — Completed weeks show permanent amber "1 to review"

Visible in the current UI: `Aug 17 – Aug 23` is **Completed**, every other chip is green "Done", and the *Unexplained fuel* chip is amber **"1 to review"**. Same on Aug 10, Jul 27, Jul 20, Jul 13.

[`fuelPeriodStatus.ts:245-247`](apps/fleet/src/utils/fuelPeriodStatus.ts#L245):

```ts
const counts = buildFuelStepCounts({
  vehicles: active.length ? active : vehicleSnaps.filter(v => v.totalSpend > 0),
});   // ← leakageReviewed is never passed → defaults to false
```

The wizard passes `leakageReviewed: leakageReviewed || periodLocked` ([`FuelPeriodWizard.tsx:363`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L363)). The landing does not. So any locked week with `misc > 0` renders an actionable amber chip forever, and `actionableTotal` stays non-zero on a week that is provably closed.

`status` is still forced to `'completed'` by the early return at [`:129`](apps/fleet/src/utils/fuelPeriodStatus.ts#L129), so the card lands on the right tab — the chip is pure noise. But it is *daily* noise on 29 completed weeks, and it trains the operator to ignore amber, which is exactly what the gate model depends on them not doing.

**Fix:** pass `leakageReviewed: locked` (needs a two-pass derive since `locked` is computed after `counts`), or zero all `actionable` counts once `locked` is known.

---

### H2 🟠 — Negative Unexplained fuel is invisible and unreviewable

Visible in the current UI: `Aug 3 – Aug 9` shows **Unexplained −$3,294.72** and the Unexplained chip is green "Done".

Every gate uses `misc > FUEL_SPEND_EPS`:

- [`fuelPeriodStatus.ts:93`](apps/fleet/src/utils/fuelPeriodStatus.ts#L93) — no count raised
- [`FuelPeriodWizard.tsx:474`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L474) — `leakageRows` excludes it, so the vehicle never appears on the Unexplained step
- [`FuelWeekMoneyStrip.tsx:95`](apps/fleet/src/components/fuel/reconciliation/FuelWeekMoneyStrip.tsx#L95) — card renders neutral, not warn
- [`FuelDataQualityStep.tsx:121`](apps/fleet/src/components/fuel/reconciliation/FuelDataQualityStep.tsx#L121) — hidden from the flagged card

A −$3,294 residual means the categorised km **exceeded** the fuel purchased by a third of the week's spend. That is a *bigger* data-quality signal than a positive gap: bad odometer, double-counted trips, a missing fill, or a mis-set policy. The system treats it as clean.

The landing card does colour it — `className={period.netLeakage > 0 ? 'text-rose-600' : ''}` ([`FuelPeriodLandingPage.tsx:93`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodLandingPage.tsx#L93)) — meaning negative renders in default grey, so a −$3,294 anomaly is styled as if it were $0.

**Fix:** gate on `Math.abs(misc) > EPS`, split the presentation into *Unexplained* (positive) and *Over-explained* (negative) with distinct copy, and make over-explained a data-quality actionable rather than a leakage one.

---

### H3 🟠 — Bulk Finalize bypasses the dispute hard gate

Single-week: an open dispute puts `actionable: 1` on step 2 → `computeFuelGatedStepStates` locks steps 3–6 → the Finalize step is **unreachable**.

Bulk: [`FuelBulkFinalizeDialog.tsx:127-145`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L127) checks only `gateResult.hasExceptionBlockers`. Open disputes surface as `hasBlockingWarnings`, which bulk never reads — they are covered only by a single blanket checkbox ([`:79`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L79)):

> *"I reviewed data-quality, disputes, and re-finalize warnings. Exception-tier weeks will still be blocked."*

So a week the wizard refuses to let you walk past can be locked by ticking one box and selecting it in a list of eight. **The gate is not a gate if a second entry point ignores it.**

**Fix:** run the same `buildFuelStepCounts` + `computeFuelGatedStepStates` in bulk prepare and mark any week with `actionable > 0` on steps 1–4 as `status: 'failed'` with the reason, exactly as exception blockers are handled.

---

### H4 🟠 — Currency is hardcoded USD in a JMD business

19 occurrences of `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` across `components/fuel` and `utils`, including every money surface in this section: [`FuelPeriodLandingPage.tsx:19`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodLandingPage.tsx#L19), [`FuelPeriodWizard.tsx:70`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L70), [`FuelWeekMoneyStrip.tsx:3`](apps/fleet/src/components/fuel/reconciliation/FuelWeekMoneyStrip.tsx#L3), [`FuelDataQualityStep.tsx:8`](apps/fleet/src/components/fuel/reconciliation/FuelDataQualityStep.tsx#L8), [`FuelExceptionBlockersPanel.tsx:8`](apps/fleet/src/components/fuel/reconciliation/FuelExceptionBlockersPanel.tsx#L8), [`FuelBulkFinalizeDialog.tsx:20`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L20) (plus a raw `$${amount.toFixed(2)}` at [`:134`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L134)).

The repo already has [`utils/formatJMD.ts`](apps/fleet/src/utils/formatJMD.ts), and `JMD` appears across Business Finance, Driver Analytics, Expense Hub, and signup. The screenshot's `Spend $36,500.00` for **one vehicle in one week** is JMD rendered with a USD glyph — an order-of-magnitude misread waiting to happen for anyone who doesn't already know.

**Fix:** one shared `formatFuelMoney` sourced from the org's currency setting; delete all 19 local copies.

---

### H5 🟠 — No actor attribution on the money-locking action

[`fuelFinalizeService.ts:157`](apps/fleet/src/services/fuelFinalizeService.ts#L157): `finalizedByUser: 'admin'`.

`FinalizedFuelReport.finalizedByUser` exists in the type ([`types/fuel.ts:257`](apps/fleet/src/types/fuel.ts#L257)) and is the only "who" on the record. Every snapshot in the system says `admin`. There is no reviewer, no approver, no reopen actor, and no reason-for-reopen captured anywhere — `FuelPeriodResetDialog` asks the operator to type the week label but never asks *why*.

For a workflow whose whole purpose is charging drivers money, this fails basic audit expectations. Compare the care taken elsewhere: `auditLogic.generateRecordHash` is applied to individual fuel entries in ~18 places in `fuel_controller.tsx`. The *period lock* — the higher-value event — has none.

**Fix:** stamp `finalizedByUserId` / `finalizedByName` from the session on the server side (never trust the client body), add `reopenedBy` + `reopenReason`, and write both to an append-only `fuel_period_audit` log.

---

### H6 🟠 — `classifyFuelReconPeriodStatus` has dead branches and doesn't do what it says

[`fuelPeriodStatus.ts:136-141`](apps/fleet/src/utils/fuelPeriodStatus.ts#L136):

```ts
const earlyOpen = opts.exceptionCount + opts.openDisputeCount + opts.leakageActionable;
if (earlyOpen > 0) return 'outstanding';
if (opts.finalizeActionable > 0 || opts.actionableTotal > 0) return 'in_progress';
return 'in_progress';
```

The last two lines are identical — `actionableTotal` and `finalizeActionable` are computed and passed but change nothing. And because `leakageActionable` is part of `earlyOpen`, **every week with `misc > 0` is Outstanding** until someone opens the wizard and ticks "Mark reviewed" — which (H8) isn't persisted, so it reverts on the next load.

That explains the current tab distribution: Outstanding `1`, In Progress `0`, Completed `29`. In Progress is effectively an unreachable state. The three-tab information architecture promises a triage funnel and delivers a binary.

**Fix:** decide what In Progress *means* (persisted step progress > 0 and not locked is the honest definition), persist it, and delete the dead branch.

---

### H7 🟠 — Landing figures go stale on policy, adjustment, and dispute edits

[`useFuelLandingLiveReports.ts:164`](apps/fleet/src/hooks/useFuelLandingLiveReports.ts#L164):

```ts
}, [weekKey, entrySig]);
// entrySig = `${fuelEntries.length}:${finalizedReports.length}:${vehicles.length}`
```

`scenarios`, `adjustments`, `disputes`, `drivers`, and `fuelCards` are all read inside the effect and all excluded from the deps (with an eslint-disable). So:

- change a fuel policy → landing shares and Unexplained do not move
- add a mileage adjustment → same
- resolve a dispute → same
- **edit a fill's amount** → `fuelEntries.length` is unchanged → same

Only adding/removing a record refreshes the numbers. "Refresh Data" re-fetches but produces an identical signature, so the effect doesn't re-run.

**Fix:** hash the meaningful content (ids + amounts + updatedAt), or move this to `useQuery` with a proper key — the same structural fix as M8.

---

### H8 🟠 — "Mark reviewed" is throwaway component state

[`FuelPeriodWizard.tsx:244`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L244): `const [leakageReviewed, setLeakageReviewed] = useState(false);`, reset to `false` on every `period.id`/`sessionKey` change ([`:372`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L372)).

Reviewing unexplained fuel is an accounting judgement — the operator has decided a gap is acceptable and the company will absorb it. That decision is stored nowhere: not on the period, not on the snapshot, not in an audit log. Navigate away and back and you must do it again. There is no record of who accepted a $2,055 gap, when, or why.

The exception-resolve path gets this right — it writes `reconExceptionAck`, `exceptionResolvedAt`, `exceptionResolveAction`, `exceptionResolveNote` to the entry ([`FuelManagement.tsx:1212+`](apps/fleet/src/pages/FuelManagement.tsx#L1212)). Leakage review should use the same pattern.

**Fix:** persist `leakageReviewedAt` / `leakageReviewedBy` / `leakageReviewNote` on the period record, and require a note when the gap exceeds a configurable threshold.

---

### H9 🟠 — Wizard progress is ephemeral

`progressIndex` and `activeStepId` are component state, reset on mount ([`:371-388`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L371)). The landing card's step chips are derived from *counts*, not from where the operator actually got to.

So a half-closed week looks identical to an untouched one, two operators can't hand a week off, and there is no answer to "who is working this week right now."

Compounding it: `pickInitialFuelStep` returns the *first non-complete* step. Since the Unexplained step is almost always non-complete (H2/H6), the wizard reliably drops you at step 4 rather than at step 1 or where you left off.

---

### H10 🟠 — No cross-user concurrency control

`FuelReconBusyProvider` ([`fuelReconBusyLock.tsx`](apps/fleet/src/components/fuel/reconciliation/fuelReconBusyLock.tsx)) re-exports the shared `FleetBusyLock` — a React context. It serialises actions *within one browser tab*.

Two admins on two machines can finalize the same week simultaneously. Both read the same `priorReports`, both reverse, both post, both save. `POST /finalized-reports` does a last-write-wins `kv.set` with no version check. The settlement side double-posts.

The same applies to Finalize-vs-Reopen racing each other.

**Fix:** a period-level lease/version on the server (`If-Match` on a period `version`), returning `409` so the second actor is told the week moved under them.

---

## 4. Medium findings

### M1 — Landing runs up to 8 full week engines, sequentially, on mount
[`useFuelLandingLiveReports.ts:112-157`](apps/fleet/src/hooks/useFuelLandingLiveReports.ts#L112) — a plain `for … of` with `await` inside. Each iteration costs a trips fetch + a deadhead fetch + a PA-context build + one fuel-brain edge call per vehicle (concurrency 3). Cold landing = dozens of sequential round-trips before the first accurate card renders. Nothing is cached across mounts (`useState`, not `useQuery`), so every tab switch back to Reconciliation pays it again.

### M2 — `FUEL_LANDING_LIVE_WEEK_CAP = 8` silently degrades week 9+
[`:37`](apps/fleet/src/hooks/useFuelLandingLiveReports.ts#L37). Beyond eight open weeks, `deriveFuelReconciliationPeriods` falls back to `vEntries.reduce(fuelOpsSpendAmount)` ([`fuelPeriodStatus.ts:208-211`](apps/fleet/src/utils/fuelPeriodStatus.ts#L208)) — raw spend with `companyShare: 0`, `driverShare: 0`, `misc: 0`. Those weeks show **Unexplained $0.00 · Done** regardless of reality, indistinguishable from a genuinely clean week.

### M3 — The whole six-cell step grid is one `<button>`
[`FuelPeriodLandingPage.tsx:128-137`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodLandingPage.tsx#L128). Six labelled, individually-meaningful status cells that all fire the same `onSelect`. Clicking "Unexplained fuel — 1 to review" does not take you to the Unexplained step. The most obvious affordance on the card is inert.

### M4 — The default tab never moves
`<Tabs defaultValue={defaultTab}>` ([`:251`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodLandingPage.tsx#L251)) is uncontrolled — `defaultValue` is read once. Finalize the last Outstanding week and the tab stays on a now-empty Outstanding showing *"No outstanding periods — check In Progress or Completed."* The user has to find and click the right tab themselves.

### M5 — Accessibility gaps on the status chips
`StepStatusCell` ([`:29-55`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodLandingPage.tsx#L29)) conveys state through colour (emerald/amber) plus a `title` attribute — `title` is not announced reliably by screen readers and is unreachable on touch. The icon is `aria-hidden`. Text sizes are `text-[10px]`/`text-[11px]`, below the 12px practical floor. No `aria-label` on the grid button, and `aria-live` is absent on counts that change after async loads.

### M6 — Landing and wizard maintain two divergent copies of the same derivation
| | Landing (`fuelPeriodStatus.ts`) | Wizard (`FuelPeriodWizard.tsx`) |
|---|---|---|
| Finalized match | `weekStart === start && (vehicleId match ‖ currentDriverId match)` ([`:201`](apps/fleet/src/utils/fuelPeriodStatus.ts#L201)) | `isSameFuelStatement(f, report)` — driver + week, never vehicle ([`:297`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L297)) |
| Dispute match | `disputeOpenInWeek` — raw `weekStart` split, `createdAt` fallback ([`:169`](apps/fleet/src/utils/fuelPeriodStatus.ts#L169)) | `reportWeekYmdBounds({...})` normalisation ([`:302`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L302)) |
| Scenario match | + `finalizedSnap.metadata.scenarioId` | live report only |
| `leakageReviewed` | never passed | `leakageReviewed ‖ periodLocked` |

`isSameFuelStatement` explicitly documents *"Never match on vehicleId alone (shared-car safe)"* — and the landing does exactly that. A card can therefore read Completed while the wizard reads Draft, or vice versa. **This should be one function used by both.**

### M7 — `disputeOpenInWeek` mishandles legacy week formats
[`fuelPeriodStatus.ts:169-176`](apps/fleet/src/utils/fuelPeriodStatus.ts#L169) compares `String(d.weekStart).split('T')[0] === start` and falls back to `createdAt` when `weekStart` is empty. The rest of the codebase routes every such comparison through `toEntryYmd`/`reportWeekYmdBounds` for exactly this reason. A dispute created mid-week against a legacy record can be attributed to the wrong week, silently un-gating step 2.

### M8 — Query cache key is a set of array lengths
[`useFuelWeekReports.ts:14-24`](apps/fleet/src/hooks/useFuelWeekReports.ts#L14) keys on `vehicles.length`, `fuelEntries.length`, `adjustments.length`, `trips.length`, `drivers.length`, `scenarios.length`. Edit a fill's amount and the key is unchanged for 30s of `staleTime`. The wizard already works around this at [`FuelPeriodWizard.tsx:536`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L536):

> *"Always re-gate from live fuelEntries. Preferring weekReports.gateResult left exception blockers stuck after Accept (query cache / same entry count key)."*

The gate was patched; the **money** still comes from the stale cache. A workaround for a known-bad cache key is a strong signal the key should be fixed.

### M9 — Reset fallback double-deletes and partially swallows errors
[`FuelPeriodResetDialog.tsx:100-106`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodResetDialog.tsx#L100) iterates `[...driverIds, ...vehicleIds]` and calls `deleteFinalizedReport(weekKey, id)` for both identities of the same snapshot — two DELETEs per record, the second necessarily a 404. Non-404 errors `throw` out of the loop, abandoning the remaining ids mid-way with no record of how far it got.

### M10 — Reopen has no dry-run and previews the wrong inventory
The "Will reverse" panel ([`:188-206`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodResetDialog.tsx#L188)) is built by `buildFuelPeriodResetInventory` from the **client's windowed** `fuelEntries` and `finalizedReports`. The server reverses from its own unbounded scan. The two sets can differ substantially — worst case the dialog promises "3 snapshots" and the server removes 300 (C1). For a destructive, explicitly-irreversible action, the preview must come from the server that will perform it.

### M11 — Empty state renders *alongside* the wizard, not instead of it
[`FuelPeriodWizard.tsx:754-758`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L754) — *"No fuel spend for this week yet"* renders above a fully-drawn money strip of zeros, a six-step stepper, a hero, and an empty table. Same for the error state at [`:735`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L735): *"Couldn't load this week's reconciliation"* appears above a wizard confidently displaying `$0.00` across every card. **Showing zeros next to a load-failure banner is the single most dangerous pattern in a money UI.**

### M12 — Sticky footer layout
[`:1081-1103`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L1081) — `fixed` on mobile, `static` at `sm+`, but `pb-20` on the root ([`:717`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L717)) is unconditional, leaving 5rem of dead space on desktop. The footer also vanishes entirely on the Finalize step (`{!isLast && …}`), so the primary action moves from bottom-right to the hero at top-right on the one step where getting it wrong costs the most.

### M13 — The money strip shows six numbers and proves none of them
Two rows of three, with no stated identity. A fleet manager cannot tell from the UI whether `gasCard + cashFromEarnings` should equal `totalSpend`, or whether `company + driver + leakage` should. (Per C3 they currently *don't* on shared-car weeks — and nothing surfaces that.) A reconciliation screen should always show its balance check.

### M14 — Export is buried and week-scoped only
`downloadCSV` exists only inside the Data Quality step ([`FuelDataQualityStep.tsx:55-70`](apps/fleet/src/components/fuel/reconciliation/FuelDataQualityStep.tsx#L55)). No export from the landing, no multi-week export, nothing from the Settlement or Finalize tables — the two views an accountant actually wants.

### M15 — No integration test covers the workflow
Well covered: `fuelPeriodGating`, `fuelPeriodStatus`, `fuelFinalizeGating`, `fuelFinalizeGolden`, `fuelFinalizeSettlementImpact`, `buildFuelWeekReportsForFinalize`, `fuelWeekPeriod`.
Not covered at all: `FuelPeriodWizard`, `FuelPeriodLandingPage`, `FuelReconciliationDashboard`, `FuelBulkFinalizeDialog`, `FuelPeriodResetDialog`, `useFuelLandingLiveReports`, `useFuelWeekReports`. Every Critical and High finding above lives in the untested half.

### M16 — `drivers: any[]` threaded through the entire chain
[`FuelReconciliationDashboard.tsx:62`](apps/fleet/src/components/fuel/reconciliation/FuelReconciliationDashboard.tsx#L62), [`FuelPeriodWizard.tsx:191`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L191), and `resolveDriverDisplayName` ([`:74-90`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L74)) probes `d.id ‖ d.driverId`, `d.name`, `d.firstName`, `d.lastName` at runtime because the shape is unknown. Four `as any` casts in `fuelPeriodStatus.ts` alone (lines 198, 223, 224).

### M17 — One concept, four names
`leakage-gap` (step id) · "Unexplained fuel" (label) · `miscellaneousCost` / `misc` (report field) · `netLeakage` (period field) · "Stop-to-Stop gap" (detail view) · "Misc" (comment in `buildFuelStepCounts`). Grep-hostile, and the UI copy and the data model disagree.

---

## 5. Redundancies to collapse

| Duplicate | Where | Note |
|---|---|---|
| `formatMoney` | 6 copies in this section, 19 repo-wide | Identical bodies. → single `formatFuelMoney` (H4) |
| `STEP_ICONS` | [`FuelPeriodLandingPage.tsx:9`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodLandingPage.tsx#L9) + [`FuelPeriodWizard.tsx:61`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L61) | Byte-identical. → move next to `FUEL_STEP_LABELS` |
| Settlement table | [`FuelPeriodWizard.tsx:980-1008`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L980) and [`:1041-1075`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L1041) | Same four columns, same rows; Finalize adds a Status column. → one component, `showStatus` prop |
| `FuelExceptionBlockersPanel` mount | rendered twice with identical props ([`:831`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L831), [`:1014`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L1014)) | Fine functionally, but the identical 16-line prop block should be a local `const`. |
| Vehicle-snapshot derivation | `deriveFuelReconciliationPeriods` vs `vehicleSnaps` | M6 — and they disagree. |
| Money engine invocation | `useFuelLandingLiveReports` (landing) + `useFuelWeekReports` (wizard) | Same week is computed twice when you open it. |
| `disputeOpenInWeek` vs `findDisputeForReport` vs the wizard's inline filter | 3 implementations of "is this dispute in this week" | M7 |
| Reset path | `resetFuelPeriod` **and** an entire fallback re-implementation client-side | [`FuelPeriodResetDialog.tsx:75-113`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodResetDialog.tsx#L75) |

**`FuelPeriodWizard.tsx` is 1,110 lines** holding six step bodies, all data derivation, all handlers, and two tables. It should be a ~150-line shell plus six step components.

---

## 6. Target architecture

The current model is *derive-everything-client-side-every-time*. The target is *server-owned period entity, client renders it*.

### 6.1 Introduce a first-class period record

```sql
create table fuel_reconciliation_period (
  id                text primary key,          -- '<org_id>:<monday_ymd>'
  org_id            uuid not null,
  week_start        date not null,
  week_end          date not null,
  status            text not null,             -- open|in_review|ready|locked|reopened
  current_step      text,                      -- data-quality … finalize
  version           bigint not null default 1, -- optimistic concurrency (H10)

  -- materialized aggregates (C3/C5 — computed once, server-side, from driver-week rows)
  vehicle_count     int, driver_count int,
  total_spend       numeric(14,2),
  gas_card_spend    numeric(14,2),
  cash_from_earnings numeric(14,2),
  company_share     numeric(14,2),
  driver_share      numeric(14,2),
  unexplained       numeric(14,2),             -- signed (H2)
  counts            jsonb,                     -- per-step actionable/informational

  leakage_reviewed_at   timestamptz,           -- H8
  leakage_reviewed_by   uuid,
  leakage_review_note   text,
  locked_at timestamptz, locked_by uuid,       -- H5
  reopened_at timestamptz, reopened_by uuid, reopen_reason text,
  computed_at timestamptz, computed_from_hash text,
  unique (org_id, week_start)
);

create table fuel_period_audit (   -- append-only
  id bigserial primary key, period_id text not null, org_id uuid not null,
  at timestamptz not null default now(), actor_id uuid not null,
  action text not null,                        -- step_advanced|leakage_reviewed|finalized|reopened|…
  payload jsonb
);
```

The landing then becomes **one indexed query**, not 8 sequential engine runs over an unbounded client dataset. C5, M1, M2, H7 all dissolve.

### 6.2 Move the money engine server-side

`buildFuelWeekReportsForFinalize` becomes an edge function, `POST /fuel/periods/:id/recompute`, that returns `WeeklyFuelReport[]` **and** writes the materialized aggregates. Recompute is triggered by fuel-entry / adjustment / policy / dispute mutations (or a debounced dirty flag), not by component mount.

Keep `FuelCalculationService` as the shared implementation and run it in Deno — it is already pure enough to move. This also kills the 1,500-trip truncation, because the server can page.

### 6.3 Make Finalize a job, not a loop

```
POST /fuel/periods/:id/finalize
  Idempotency-Key: <uuid>
  If-Match: <period.version>
  → 202 { jobId }

GET /fuel/jobs/:jobId → { state, progress: {done, total}, failures[] }
```

Server side: re-run the gates (never trust the client), then per driver-week inside one transaction — reverse → post → snapshot. Persist a cursor so it is resumable; return `409` on version mismatch. C2, C4, H3, H5, H10 all resolve here, and the browser stops being a transaction coordinator.

Reopen gets the same treatment — plus `filterByOrg` on every scan (C1) and a server-computed dry-run preview (M10).

### 6.4 Reshape the client

```
useFuelPeriods()        → GET /fuel/periods?from&to      (landing — one call)
useFuelPeriod(id)       → GET /fuel/periods/:id          (wizard header + strip)
useFuelPeriodStep(id,s) → GET /fuel/periods/:id/steps/:s (lazy per-step rows)
useFuelPeriodMutations() → advanceStep / reviewLeakage / finalize / reopen
```

Split `FuelPeriodWizard` into `FuelPeriodWizardShell` + six step components, each fetching only its own rows. Step 6's table stops being rendered while you're on step 1.

---

## 7. Product & UX enhancements

**Landing**
1. **Lead with variance, not status.** A fleet manager's first question is "where did money go missing this week." Sort Outstanding by `|unexplained|` descending and show a week-over-week delta sparkline per card.
2. **Make each step chip a link** to its step (M3). Six labelled targets currently do one thing.
3. **Portfolio header** above the tabs: open weeks, total unexplained across them, oldest unclosed week, and a *days-open* age on each card. Weeks aging past N days should escalate visually — 29 completed weeks with no aging signal means a stuck week is invisible.
4. **Bulk Reopen** exists (`FuelBulkResetDialog`) but is not wired into the landing the way Bulk Finalize is.

**Wizard**
5. **Explain the gap.** The Unexplained step lists a plate and an amount and offers a stop-to-stop drilldown. It should *attribute*: `X L unaccounted ≈ Y km at this vehicle's rolling efficiency; nearest candidates: 3 trips with missing odometer, 1 fill with no station match`. Turn a number into a next action.
6. **Balance proof in the strip** (M13): `Gas card + Cash = Total ✓` and `Company + Driver + Unexplained = Total ✓`, rendered red when they don't tie.
7. **Comparison column.** Every money figure should show a delta vs the trailing 4-week median for that driver. Anomaly detection at zero modelling cost.
8. **Notes at every step**, not just on exception accept. Reconciliation decisions are judgement calls and need a paper trail (H8).
9. **Keyboard-first queue.** `j/k` between vehicles, `a` accept, `e` edit, `Enter` continue. Closing 30 weeks with a mouse is the actual daily cost of this screen.
10. **Segregation of duties.** For weeks above a value threshold, require a second approver before lock. Ties into §6.1's audit table.
11. **Per-week evidence pack.** One-click PDF/CSV bundling the money strip, per-driver settlement, policy applied, exceptions accepted with notes, and the actor timeline. This is what auditors ask for and what the section is one small step from being able to produce.
12. **Scheduled auto-close.** Weeks with zero actionables and unexplained under a threshold should be able to close on a schedule with a notification, rather than requiring 29 manual passes.

---

## 8. Remediation plan

### Phase 0 — Stop the bleeding (days, no redesign)
| | Finding | Change |
|---|---|---|
| 1 | **C1** | Add `filterByOrg` + per-record `belongsToOrg` to `reset-period`'s three prefix scans. **Ship first.** |
| 2 | **C2** | Move the reversal after `relevantEntries`; re-post before `continue`. Add a regression test. |
| 3 | **C3** | Aggregate from `liveReports`, never sum driver-week figures across vehicles. Golden test with a two-car driver. |
| 4 | **H3** | Run the full gate in bulk prepare; fail disputed weeks. |
| 5 | **H1 / H2** | `leakageReviewed: locked` on the landing; switch every leakage gate to `Math.abs(misc) > EPS`. |
| 6 | **H4** | One `formatFuelMoney`; delete 19 copies. |
| 7 | **C5(a)** | `getFinalizedReports({ weekStartFrom, weekStartTo })` — stop shipping all history. |
| 8 | **M11** | Error and empty states must *replace* the wizard, never sit above `$0.00`. |

### Phase 1 — Correctness & consistency (1–2 sprints)
9. One shared period-derivation module for landing + wizard (**M6, M7**).
10. Content-hash query keys; delete the `entrySig` workaround (**H7, M8**).
11. Real pagination on entries and trips, with a visible banner if a cap is ever hit (**C5b/c**).
12. Server-stamped `finalizedByUser` + `fuel_period_audit` writes (**H5**).
13. Server-side dry-run preview for Reopen; delete the client fallback (**M10, M9**).
14. Split `FuelPeriodWizard` into shell + six steps; collapse the duplicate tables (**§5**).
15. Component/integration tests for landing, wizard, bulk, reset (**M15**).

### Phase 2 — Architecture (1–2 months)
16. `fuel_reconciliation_period` + `fuel_period_audit` tables; backfill from existing snapshots.
17. Server-side recompute endpoint; retire `useFuelLandingLiveReports` (**M1, M2**).
18. Idempotent, resumable, version-checked finalize/reopen jobs (**C4, H10**).
19. Persist workflow state: current step, leakage review, notes (**H8, H9, H6**).
20. Rewire the client to the four hooks in §6.4.

### Phase 3 — Product
21. Variance-first landing, aging, portfolio header.
22. Gap attribution on the Unexplained step.
23. Balance proof, deltas vs trailing median.
24. Keyboard queue, approvals, evidence pack, scheduled auto-close.

---

## 9. Verification checklist

Before calling this remediated:

- [ ] Two orgs, same Monday. Org A reopens. Org B's snapshots, entries, and transactions are **byte-identical** afterwards.
- [ ] Re-finalize a week whose entries are all `Archived`. Ledger net movement is **zero**; snapshot and settlement agree.
- [ ] One driver, two vehicles, one week. Landing `totalSpend` == strip `Total fuel bought` == Σ settlement rows.
- [ ] Kill the browser mid-finalize. Resume. No driver is settled twice; no driver is left unsettled.
- [ ] Two admins finalize the same week concurrently. One succeeds, one gets `409`.
- [ ] A locked week shows **zero** amber chips.
- [ ] A week with −$3,294 unexplained raises an actionable.
- [ ] A week with an open dispute is rejected by Bulk Finalize with a named reason.
- [ ] 10,000 fuel entries / 5,000 trips in a week. Figures are correct, or a visible banner says they can't be trusted. Never silently wrong.
- [ ] Every money figure renders in the org's currency.
- [ ] `fuel_period_audit` answers "who locked this week, when, and who accepted the $2,055 gap" for every closed week.
