# Fuel Reconciliation — Enterprise Readiness Audit

**Scope:** Roam Fleet → Business Finance → Week Reconciliation → **Fuel** lane
(landing → 6-step week wizard → Finalize → server period lock → fuel week statement).
**Rev 1:** 2026-09-15 — read-only audit.
**Rev 2–4:** 2026-09-15 — first through third verifications (§0C / §0B / §0A, superseded).
**Rev 5:** 2026-09-15 — fourth verification (§0D, superseded).
**Rev 6:** 2026-09-15 — fifth verification, working tree on `cfb6e29b`. **Read §0 first.**
**Reviewed as:** Principal Systems Architect + Lead UI/UX + senior engineering committee, one verdict.

---

## 0. Rev 6 — verification of the working tree

**Every gate is green for the first time in this audit.** And in the same pass, production was
moved from `FUEL_SERVER_ENGINE=off` straight to `enforce`, skipping the shadow soak — which has
surfaced a concrete, predictable way for week close to start refusing. That is the whole of §0.

### 0.1 Gate results — measured

| Gate | Rev 5 | Rev 6 |
|---|---|---|
| `fuel-core typecheck` | PASS | **PASS** ✅ |
| `fuel-core test` | 71/71 | **71/71** ✅ |
| `deno check` incl. both fuel edge files | ❌ 5 errors | **PASS** ✅ |
| `deno test` — fuel control suite | 14/14 | **15/15** ✅ |
| `fleet test` | ❌ 1 | **240 files / 1,397 passed** ✅ |

### 0.2 Closed this pass

- **N-14 ✅** — the `snapMoney` union is discriminated; `deno check` is green.
- **N-13 ✅** — `orderToFleetTrip` / `codBagTotal` reconciled; the fleet suite is fully green.
- **N-15 (noise) ✅ — and the fixture was fixed the right way.** `fuelFinalizeService` now stamps
  `metadata.tripCategoryAgg`, so `resolveEngineCategoryCosts` no longer falls through to the
  "bucket everything into `rideShareCost`" path. The enforce test was rewritten
  **production-shaped** — *"wallet settledEntries without usageCategory + Engine A
  tripCategoryAgg"* — with both a no-false-mismatch case and a **tampered** case that must
  produce deltas. That is the correction applied at the fixture level, which is where I flagged it.
- **P-3 ✅** — real SQL pushdown: `fromKvStore()` with `like("key", "fuel_entry:%")` plus an org
  predicate and a `gte`/`lte` date window, with the full-prefix scan kept only as a fallback.
  This was the worst server-side cost in the section.
- **P-4 ✅** — `statement_engine_probe` accepts and threads `fromRebuild`, so the rebuild map is
  hoisted instead of rebuilt per driver.
- **R-2 ✅** — the dead `overlayServerFuelPeriods` alias is gone.
- **Housekeeping** — the `fuel_period_seal_error` migration was renamed to `…120500` to clear a
  timestamp collision with the courier-remittance migration. Good catch; that class of collision
  is painful to unpick later.

### 0.3 🔴 New — production was moved to `enforce` without the soak

| # | Sev | What |
|---|---|---|
| **N-16** | **Critical (governance)** | `docs/fuel-recon/stage0-gate.json` now reads `"currentProd": "enforce"`, `"next": null`, `"shadowMinWeeks": 0`. Revs 4 and 5 both gated this explicitly — the ladder required **staging shadow → ≥ 2 full weeks with zero unexpected drift → prod shadow → enforce** — and the `waitConditions` that carried *"shadowMinWeeks met with zero unexpected `fuel_engine_diff`"* were **rewritten to remove it**, replaced with "fixtures green / deno check green / deploy live". Green fixtures are not a soak. A soak is the only thing that tells you which divergence classes exist in **your** data. |

`enforce` is not a logging mode. On any delta it returns **422 `SNAPSHOT_MISMATCH` and refuses
the finalize.** The recovery path is a header-only break-glass
(`X-Fuel-Force-Client-Money: 1` + an 8-char `forceReason`) that has **no UI affordance** — an
operator hitting it sees "Finalization failed: SNAPSHOT_MISMATCH" and cannot self-recover.

### 0.4 🔴 And here is the divergence class the soak would have found

| # | Sev | What | Evidence |
|---|---|---|---|
| **N-17** | **High** | **Personal Allowance is applied on the client and not on the server.** `freezeReportMoneyThroughAssembler` runs `assembleLeftoverWeekMoney`, then **shifts the result**: `driverShare = max(0, driverShare − earned)` and `companyShare += earned`, where `earned = personalEarnedCostAbsorbed(report)`. The server's `computeFuelWeek` has **no PA handling at all** (no `earned`, no `personalAllowance`), and the enforce block does not compensate. So for any driver-week with an active PA earned-absorb, `diffWeekCalc` reports `driverShare` and `companyShare` deltas of **exactly `earned`** → 422 → **finalize blocked**. | [fuelFinalizeWeekSnapAdapter.ts:151-157](apps/fleet/src/utils/fuelFinalizeWeekSnapAdapter.ts#L151-L157) vs [computeFuelWeek.ts](packages/fuel-core/src/computeFuelWeek.ts) |

This fires for every org with Personal Allowance enabled and any driver over the earned band —
which, per `FUEL_SYSTEM_AUDIT`, is a deliberate live feature, not an edge case. It is exactly
the kind of finding a two-week shadow soak exists to produce **as a drift row instead of as a
blocked close**.

### 0.5 🟠 The category check is still not independent

`fuelFinalizeService` sets both `categoryCosts: cats` and `metadata.tripCategoryAgg: cats` — the
**same object** — and the code comment says so outright:
`// N-15: Engine A stamp for server loader — same object as categoryCosts (not entry buckets).`

So `materialCategoryCostDeltas(snapCats, loaderCats)` compares a value to itself in production.
It is not strictly a tautology — it will fire if a payload is altered selectively in transit,
and the tampered test proves that — but it **cannot** catch the failure that actually matters:
a client that computed its categories *wrongly but self-consistently*, which is precisely what a
timed-out trip fetch produces (C-5's degraded path). Phase 3 independence — the server deriving
categories from entries, trips and odometer itself — is still not achieved.

That was an acceptable, honestly-labelled gap while prod was `off`. With prod on `enforce`, the
posture inverts: the system now **refuses** closes on the strength of a check that is partly
self-referential, while still not verifying the input class it was built for.

### 0.6 Still open

**Performance:** `P-1` (the dashboard still takes `trips: Trip[]` / `fuelEntries: FuelEntry[]`
as whole-dataset props) · `P-9` (mount waterfall).
**Cleanup:** `U-10` (step notes still component state) · `U-13` · `U-14` (partial — `FuelLeakageStep`
now has 2 a11y attributes; focus-on-step-change still missing) · `R-3` · `R-4`
(`generateFleetReport` still exported).

### 0.7 Verdict

**The engineering is done and it is good.** Every gate is green, every Rev 1 Critical is closed,
the production money damage is repaired, P-3 and P-4 — the two real performance debts on the
close path — are fixed properly, and the N-15 fixture was corrected at exactly the level I
flagged rather than patched around.

**The rollout decision is the problem, not the code.** Moving `off → enforce` in one step
removed the only mechanism that converts unknown divergence into a drift row instead of a
refused close, and N-17 is a concrete instance sitting in the codebase right now. Nothing here
can post a *wrong* number — the failure mode is refusal, which is the safe direction — but a
finance team that cannot close a week is an outage, and the break-glass for it is a curl command.

### 0.8 Next actions, in order

1. **Set `FUEL_SERVER_ENGINE=shadow` in prod today.** Same code path, same drift rows, no
   refusals. Restore `shadowMinWeeks: 2` and the removed wait condition in `stage0-gate.json`.
   If a week has already failed to close since the flip, that is N-17 and step 2 is the fix.
2. **N-17** — mirror the PA absorb server-side. Cleanest: move the shift into `computeFuelWeek`
   behind an optional `personalAllowanceEarnedCost` input, and stamp `earned` onto the snapshot
   so the server has it. Test: a PA week must produce **zero** deltas, and a PA week with a
   tampered `earned` must produce deltas.
3. **Re-derive the soak exit criteria from data**, not from fixtures: zero unexpected
   `fuel_engine_diff` rows across two full close cycles, with every diff class either fixed or
   signed off in `finance_recon_drift`.
4. **Expose the break-glass** as an admin-only confirm in the Finalize step, with the reason
   captured — so a refused close is recoverable by the person standing in front of it.
5. **Phase 3 independence** — derive `tripCategoryAgg` server-side from entries/trips/odometer
   rather than accepting the client's stamp. This is what makes `enforce` mean what it says.
6. **P-1 / P-9**, then **U-10 / U-13 / U-14 / R-3 / R-4**. None of it touches money.

---

## 0D. Rev 5 — verification of the working tree (superseded by §0)

The headline is operational, not code: **the production C-2 damage is corrected.** Two new
code defects arrived with this pass, one of which is the familiar pattern in a new disguise.

### 0.1 Gate results — measured

| Gate | Rev 4 | Rev 5 |
|---|---|---|
| `fuel-core typecheck` | PASS | **PASS** ✅ |
| `fuel-core test` | 71/71 | **71/71** ✅ |
| `deno test` — fuel control suite | 10/10 | **14/14** ✅ (6 files, all in CI) |
| `deno check` incl. both fuel edge files | PASS | ❌ **5 errors — regressed** |
| `fleet test` | ❌ 1 (not fuel) | ❌ **1 (still not fuel)** |

### 0.2 🟢 The production defect is fixed

`docs/fuel-recon/stage0-gate.json` now reads:

```json
"reopenReseal20260824": "done",
"measuredDelta20260824": {
  "statementDriverShareMinor": 578498,
  "ledgerFuelDeductionMinor": 578498
}
```

Week `2026-08-24` / driver `73e5b1dc…` was **1,735,494** minor in the ledger against a
**578,498** minor statement in Rev 4 — a ~3× discrepancy on a closed week, and the one piece of
real C-2 damage Stage 0 had found in production. It now ties exactly. The reseal was done, the
gate file records it honestly, and `FUEL_SERVER_ENGINE` is still held at `off` pending the
shadow soak. That closes the last live money defect this audit found.

### 0.3 Also closed this pass

- **N-12 ✅ — closed properly, with the failing input written.** `closableKvCache` now carries a
  60 s TTL enforced on read ([:101](supabase/functions/_fleet-server/fuel_week_closable_gate.ts#L101)),
  and `invalidateFuelWeekClosableKvCache` is **called** at the top of
  `buildFuelWeekClosableInputForPeriod` ([:273](supabase/functions/_fleet-server/fuel_week_closable_gate.ts#L273)).
  Two tests seed a stale empty bundle and assert the exception fill **does** surface afterwards.
  That is the "write the input that makes it fail" discipline, applied.
- **R-2 (first half) ✅** — `deriveFuelReconciliationPeriods` no longer hardcodes
  `const locked = false`; it now takes `lockedWeekStarts` from the server merge, so gap-filled
  weeks respect Completed.
- **U-14 (partial)** — `FuelPeriodStepper` picked up a11y attributes.
- **Phase 3 loaders wired into the enforce path** — `resolveEngineCategoryCosts` and
  `materialCategoryCostDeltas` are now called inside the `FUEL_SERVER_ENGINE` block, and
  `category.*` deltas join the money deltas. The *shape* is right. See N-15 for the problem.
- **H-5 money half attempted** — `/materialize` now prefers `aggregateMaterializeMoneyFromSnaps`
  over the request body, stamping `computed_from_hash: server:materialize:snaps:N`. Right idea.
  See N-14 for the problem.

### 0.4 🔴 New — blocking CI

| # | Sev | What | Evidence |
|---|---|---|---|
| **N-14** | **Blocking CI** | `deno check` regressed from green to **5 errors**. `aggregateMaterializeMoneyFromSnaps` returns `{ ok: boolean; snapCount; totalSpend; … }` on success and the bare literal `{ ok: false, snapCount: 0 }` on the `else` branch. Because `ok` is widened to `boolean` rather than the literals `true`/`false`, TS cannot discriminate the union, so all five `snapMoney.ok ? snapMoney.totalSpend : …` reads fail. Fix: type the return as `{ ok: true; … } \| { ok: false; snapCount: number }` (or give the fallback the full field set). | [fuel_period_routes.ts:1054-1067](supabase/functions/_fleet-server/fuel_period_routes.ts#L1054-L1067) |

### 0.5 🟠 New — the pattern, in a new disguise

| # | Sev | What |
|---|---|---|
| **N-15** | **High** | **The Phase 3 loader is wired to inputs production never sends.** `resolveEngineCategoryCosts` derives its "authority" categories from `snap.metadata.settledEntries[].usageCategory` or `snap.metadata.tripCategoryAgg`. Neither exists in a real payload: `fuelFinalizeService` emits `settledEntries` as `{id, amount, date, driverId, vehicleId}` — **no `usageCategory`** — and nothing in `apps/fleet` ever emits `tripCategoryAgg` / `tripCategoryTotals` / `categoryCostsFromTrips` (grep returns only unrelated vehicle-fitness hits). At runtime `bucketForUsage(null)` returns `"rideShareCost"`, so **the entire week's spend buckets into `rideShareCost`** and becomes the authority — `personalUsageCost` 0, misc 0. Under `shadow` that produces large `category.*` and money deltas on essentially every week; under `enforce`, **every finalize would 422 with `SNAPSHOT_MISMATCH`.** |

Two things make this worth stating plainly:

1. **The enforce test passes only because its fixture supplies a shape production does not
   produce** — `{ amount: 400, usageCategory: "ride" }` and friends
   ([fuel_week_category_loader_enforce.test.ts:11-14](supabase/functions/_fleet-server/fuel_week_category_loader_enforce.test.ts#L11)).
   A green test over an impossible input is the same failure mode this audit has flagged four
   times, just relocated from the code into the fixture.
2. **Even with `usageCategory` present the two sides are not comparable.** The loader buckets
   *entry spend* (JMD paid at the pump, by tag); Engine A's category costs are
   *distance-derived* (`km ÷ efficiency × price`). Those are different quantities and will not
   agree except by coincidence.

Nothing breaks today — prod is `off` and the ladder mandates a staging shadow soak first, which
is exactly the control that should catch this. But as wired, the soak will be **all noise**, and
noise is how a drift signal gets learned-and-ignored. Resolve before turning `shadow` on:
either have the client emit a real `tripCategoryAgg` (the Engine A per-category costs it already
computes), or have the server load trips + odometer itself and derive categories the same way
Engine A does. The second is the actual Phase 3 goal.

### 0.6 Still open

- **N-13** — `orderToFleetTrip.test.ts` still fails: `trip.codBagTotal` is `undefined`, expected
  `5000`. Both the test and `supabase/functions/_shared/orderToFleetTrip.ts` were edited this
  pass and they still disagree. **This is courier-remittance work, not fuel** — but it is the
  only thing keeping `pnpm --filter @roam/fleet test` red, so it blocks the fuel branch's CI.
- **Performance:** `P-1` · `P-3` (the three `getByPrefix` full-prefix scans remain; the TTL cache
  bounds how often, not how much) · `P-4` (probe still rebuilds per driver) · `P-9`.
- **Cleanup:** `U-10` (step notes still component state) · `U-13` · `U-14` (partial — the
  `FuelLeakageStep` vehicle `<select>` is still unlabelled) · `R-2` (the dead
  `overlayServerFuelPeriods` alias) · `R-3` · `R-4` (`generateFleetReport` still exported).

### 0.7 Verdict

**The close itself remains enterprise-grade, and it is now also clean in production.** No Rev 1
Critical is open, the one piece of real money damage is repaired and tied to the cent, and the
control that would have caught it independently runs nightly.

The two new items are of different weight. N-14 is a ten-minute type fix. N-15 is not a bug in
what ships today — it is a **readiness** problem for the next flag flip, and it is the reason to
run the staging shadow soak before anything else: the soak would have surfaced it. Catch it at
the design level now rather than reading a drift table full of artefacts later.

### 0.8 Next actions, in order

1. **N-14** — discriminate the `snapMoney` union. `deno check` back to green.
2. **N-15** — decide the Phase 3 authority *before* enabling `shadow`. Preferred: emit
   `tripCategoryAgg` from `fuelFinalizeService` using the Engine A category costs already on the
   report, and make `categoryCostsFromEntriesAndTrips` refuse (rather than silently bucket to
   `rideShareCost`) when neither a trip aggregate nor a tagged entry set is present. Then rewrite
   the enforce test around a **production-shaped** snapshot, plus one deliberately tampered case.
3. **N-13** — route to the remittance owner; get the fleet suite green.
4. **`FUEL_SERVER_ENGINE=shadow` on staging** once 1–2 are done, per
   `docs/fuel-recon/server-engine-rollout.md`. Soak ≥ 2 weeks on `fuel_engine_diff` and
   `finance_recon_drift`.
5. **P-3 / P-4 / P-1 / P-9** — the performance pass.
6. **U-10 / U-13 / U-14 / R-2 / R-3 / R-4** — cosmetic tail. None of it touches money.

---

## 0A. Rev 4 — verification of the working tree (superseded by §0)

Every Rev 3 action was taken, and two of them were taken the *harder, better* way than I
advised. **The fuel reconciliation close is now enterprise-grade.** One new defect, one
out-of-scope CI break, and a short tail of performance and cosmetic debt remain.

### 0.1 Gate results — measured

| Gate | Rev 3 | Rev 4 |
|---|---|---|
| `fuel-core typecheck` | PASS | **PASS** ✅ |
| `fuel-core test` | 71/71 | **71/71** ✅ |
| `deno check` incl. both fuel edge files | ❌ 68 errors | **PASS** ✅ |
| `deno test` — new fuel control suite | (did not exist) | **10/10** ✅, now a CI step |
| `fleet test` | ❌ 1 (fuel golden) | ❌ **1 — `orderToFleetTrip.test.ts`, not fuel** |

### 0.2 Closed this pass

- **N-9 ✅ — done better than advised.** I suggested narrowing the CI scope. Instead the
  **underlying errors were fixed at source** across `toll_controller.tsx`, `fuel_logic.ts`,
  `fuel_cycle_stamp.ts`, `driver_financial_periods.ts`, `unifiedLedger/queries.ts` and
  `periodPersistBody.ts`, so both fuel edge files stay in CI *and* `deno check` is green. That
  is the right call — it paid down the strictness backlog instead of routing around it.
- **N-10 ✅** — `fuelFinalizeGolden.test.ts` updated; no fuel test fails.
- **Stage 5 #31 ✅ — fully wired, the highest-value item is done.**
  `fuel_nightly_statement_ledger.ts` compares finalized snapshot vs fuel `week_statements` vs
  active `fuel_*` ledger events for every locked period, upserts to `finance_recon_drift`
  (`source=nightly`), and is invoked from the `finance-recon` cron
  ([index.ts:436](supabase/functions/finance-recon/index.ts#L436)). Three tests, including two
  that assert drift **is** detected. This is the control that would have caught C-2 alone.
- **H-7 ✅** — `unionFuelSealDriverIds` is wired into the seal loop
  ([fuel_week_seal.ts:216](supabase/functions/_fleet-server/fuel_week_seal.ts#L216)), with a
  synthesised period row for snapshot-only drivers. Two tests. A driver with fuel spend but no
  `driver_financial_periods` row can no longer be silently skipped.
- **H-5 ✅ — the dangerous half is closed.** `/materialize` is now `fuel.edit_entry`, and
  **`counts` is computed server-side** by `serverFuelStepCountsForPeriod` rather than accepted
  from the browser, with `computed_from_hash` changed from `client:…` to
  `server:materialize:…`. The client can no longer author the gate state that governs close.
  *(Residual: the money fields — `total_spend`, `unexplained`, shares — are still read from the
  request body. Lower risk now that the gate is server-derived, but not zero.)*
- **P-7 ✅** — `handleFinalize` fetches and passes week-scoped `priorReports`.
- **P-8 ✅** — the wizard remount key no longer includes `initialStepId`.
- **N-11 partially ✅** — the gate's KV work is now a cached bundle: 3 scans per week per
  isolate instead of 3 per period per sweep. But see N-12.
- **Stage 0 ops tracking ✅ — and handled with real discipline.** `stage0-gate.json` now
  carries `playbookStatus`, a `measuredDelta20260824`, an `opsChecklistBeforeShadow`, and a
  `fuelServerEngineRollout` ladder with explicit `waitConditions`; `docs/fuel-recon/server-engine-rollout.md`
  documents the staged soak. Production is held at `FUEL_SERVER_ENGINE=off`. Nothing was
  declared done that is not done.

### 0.3 🔴 New defect

| # | Sev | What | Evidence |
|---|---|---|---|
| **N-12** | **High** | **The new closable gate caches with no invalidation.** `closableKvCache` is a module-level `Map` with no TTL, and `clearFuelWeekClosableKvCache()` has **zero callers**. In a warm Deno isolate the gate can serve a stale bundle, so an **exception-tier fill or an open dispute created after the cache was populated will not block finalize**. Blast radius is bounded: `assertNoUnapprovedFuelTxInWindow` inside `processJobRow` does its own **uncached** scan, so the unapproved-receipt blocker stays fresh at the last mile — but exception fills and disputes flow only through the cached bundle. Fix: a short TTL (30–60 s), or clear the key at the start of every finalize/auto-close evaluation. | [fuel_week_closable_gate.ts:21-26](supabase/functions/_fleet-server/fuel_week_closable_gate.ts#L21-L26) |

### 0.4 🟠 Breaks CI, outside this audit's scope

| # | Sev | What |
|---|---|---|
| **N-13** | Medium | `apps/fleet/src/components/rush/__tests__/orderToFleetTrip.test.ts` fails — *"maps COD cashCollected to order total, not courier earning"*. This comes from the concurrent **courier-remittance** work in the same tree (`supabase/functions/delivery/remittance/`, `courierCashLedger.ts`, `orderToFleetTrip.ts`), not from anything in the fuel lane. Flagging it because it is the only thing keeping `pnpm --filter @roam/fleet test` red. |

### 0.5 Still open

**One structural item, honestly labelled:**
- **Phase 3 loaders.** `fuel_week_category_loader.ts` is written and Deno-tested but has **zero
  production call sites** — HTTP finalize still recomputes from the snapshot's own
  `categoryCosts`. So `FUEL_SERVER_ENGINE` verifies the *split*, not the *categories*: a wrong
  `rideShareCost` from a degraded trip fetch would still pass. This is disclosed in
  `server-engine-rollout.md` under "Phase 3 loaders (partial)" rather than being passed off as
  complete, which is the right way to carry it — but it is the last gap between "the server
  checks the arithmetic" and "the server is the authority".

**Performance:** `P-1` (whole-dataset props) · `P-3` (the three `getByPrefix` scans still read
whole prefixes before filtering in JS) · `P-4` (probe still rebuilds per driver) · `P-9` (mount
waterfall).

**UX / cleanup:** `U-10` (step notes still component state) · `U-13` (copy pass) ·
`U-14` (partial — three components now carry `sr-only`/`aria-live`; the select label and
focus-on-step-change are still missing) · `R-2` (`const locked = false` at
[fuelPeriodStatus.ts:230](apps/fleet/src/utils/fuelPeriodStatus.ts#L230) and the dead
`overlayServerFuelPeriods` alias) · `R-3` · `R-4` (`generateFleetReport` still exported).

**Operational — the one that matters:** week `2026-08-24` is still drifted and still
`pending_ops`. The gate file now records the measured numbers:

| | minor units |
|---|---|
| `week_statements` driverShare (v13, closed) | **578,498** |
| active `fuel_deduction` ledger | **1,735,494** |

That is a live ~3× discrepancy on a closed week for driver `73e5b1dc…`. The code that caused it
is fixed and the nightly job will now surface it, but **the existing bad statement is still
standing.** Reopen and reseal that week before moving `FUEL_SERVER_ENGINE` off `off`.

### 0.6 Verdict

**Yes — this is enterprise-grade now.** Against the bar you set ("when I close fuel
reconciliation, it must do it to perfection"):

- Every Rev 1 Critical is closed or fail-closed.
- Every Rev 2 regression is gone; the Rev 3 blockers are gone.
- One gate governs the wizard, HTTP finalize and auto-close, and it is fed real inputs.
- A close cannot post a flat-ratio snapshot, an unresolved coverage rule, an untied category
  set, a degraded-input week, an over-explained residual, or an unreviewed under-explained one.
- A partial money commit compensates itself and files an audit row.
- A nightly job re-derives every locked week against both the statement and the ledger and
  persists drift where a human will see it.
- The rollout to server authority is staged, documented, gated on measured conditions, and
  currently held **off** — with the one known production defect tracked rather than buried.

The failure pattern that ran through every previous audit of this system — *the mechanism gets
built and the last connection, the one that lets the control fail, gets left out* — did not
recur in Rev 3 and did not recur here. N-12 is a cache-invalidation bug, which is a different
and more ordinary class of mistake.

What is left is a short, well-understood tail: one cache fix, one out-of-scope test, the Phase 3
loaders, a performance pass, and an ops task on one historical week.

### 0.7 Next actions, in order

1. **N-12** — give `closableKvCache` a TTL or clear it per evaluation. Test: populate the
   cache, insert an unacknowledged exception fill, re-evaluate, assert `exception_fills` blocks.
   *(Write the input that makes it fail.)*
2. **Ops** — reopen and reseal week `2026-08-24` for driver `73e5b1dc…`, then confirm
   `finance_recon_drift` clears. Follow `opsChecklistBeforeShadow` exactly.
3. **N-13** — fix or re-baseline `orderToFleetTrip.test.ts` so the fleet suite is green again.
   (Courier work, not fuel — route it to whoever owns the remittance branch.)
4. **`FUEL_SERVER_ENGINE=shadow` on staging**, per the ladder in `server-engine-rollout.md`.
   Soak ≥ 2 weeks, watch `fuel_engine_diff` and `finance_recon_drift`.
5. **Phase 3 loaders** — wire `fuel_week_category_loader.ts` into the finalize recompute so the
   server derives categories from entries/trips instead of trusting the snapshot's. This is what
   turns `enforce` into genuine authority.
6. **P-3 / P-4 / P-1 / P-9** — the performance pass. P-3 first: push org + date into SQL for
   `fuel_entry:`, `fuel_dispute:` and `transaction:`.
7. **U-10 / U-13 / U-14 / R-2 / R-3 / R-4** — the cosmetic and cleanup tail. None of it affects
   money.

---

## 0B. Rev 3 — verification of commit `22f51d0f` (superseded by §0)

Every Rev 2 blocker was addressed and the seven unwired controls were wired. I re-read each
changed path and re-ran the gates. **The money path is now in good shape. Two things are red,
and neither is a money bug.**

### 0.1 Gate results — measured

| Gate | Rev 2 | Rev 3 |
|---|---|---|
| `pnpm --filter @roam/fuel-core typecheck` | ❌ 2 errors | **PASS** ✅ |
| `pnpm --filter @roam/fuel-core test` | 68/68 | **71/71** ✅ (new `fuelGapSemantics.test.ts`) |
| `pnpm --filter @roam/fleet test` | ❌ 2 failed | ❌ **1 failed** / 1,395 passed |
| `deno check` on the two newly-CI'd fuel files | ❌ broken import | ❌ **68 errors** — see N-9 |

### 0.2 Closed and verified this pass

**All five Rev 2 regressions are gone:**

- **N-1** ✅ Both `|| … === UNASSIGNED_FUEL_DRIVER_ID` clauses removed from
  `entryBelongsToDriverWeekReport`. The double-posting bug is dead.
- **N-2** ✅ `fuel_week_engine.ts` now reports **zero** deno errors of its own.
- **N-3** ✅ fuel-core typechecks clean.
- **N-4** ✅ The money-strip tie is now **sign-based**, exactly as specified:
  `leakage < -ε ? company+driver+leakage : company+driver`, with a matching label.
- **N-5b / N-6** ✅ `fuelSpineGolden5179KZ` passes again and a new `fuelGapSemantics.test.ts`
  pins the gap semantics — the H-1 re-baseline was made deliberately rather than by suppression.
- **N-7 / H-8** ✅ Done properly: a real `fuel_seal_error` column
  (`20260915120000_fuel_period_seal_error.sql`), cleared on a successful seal, surfaced through
  `mapPeriod` → `FuelPeriodRow` → `serverRowsToLandingPeriods` → a **"Statement missing — retry
  seal"** badge on the locked period card. `computed_from_hash` is no longer hijacked.
- **N-8** ✅ The bulk dialog no longer sends `allowServiceSecondApprove`.

**And all seven "cannot fail" controls from Rev 2 §0.5 are now wired:**

| ID | Now |
|---|---|
| **C-1** | `fuelFinalizeService` attaches `categoryCosts` **and** `fuelRule` to the emitted snapshot (both top-level and in `metadata`), so `FUEL_SERVER_ENGINE=shadow\|enforce` actually compares. Drift is persisted via `upsertFinanceReconDrifts`, not just logged. The remaining depth limit — the recompute is fed the snapshot's own categories — is now an **explicit `TODO(Phase 3 loaders)` in the code**. Honest, and the right call for this stage. |
| **C-3** | A real shared gate: `fuel_week_closable_gate.ts` (236 lines) with `weekHasOpenFuelDisputes`, `weekHasUnackedExceptionFills`, unapproved-tx, residual kind, counts, categoryCosts and coverage rule — called from **both** `POST /finalize` (:1068) and auto-close. `evaluateFuelWeekClosableClient` mirrors it in the browser. That is the "one gate, four call sites" the audit asked for. |
| **C-3 / H-4** | `counts` finally has a writer: `/materialize` accepts a `counts` patch and the wizard pushes step counts + money on every recompute (`materializeWizardPeriodCounts`). `counts_unevaluated` is now a gate that can pass *and* fail. |
| **C-4** | **Closed.** The freeze runs against full-week entries (`weekEntriesForFreeze`) while the settle pool stays Pending-only for `settledEntries`, and `assertCategoryCostsTieSpend` throws `freeze_spend_tie_violation` if the identity breaks. The partial-week denominator bug is gone. |
| **H-6** | Enforced, not just stamped: the finalize check now selects `payload`, requires `payload.periodVersion === period.version`, and has a defined legacy-row fallback. |
| **H-10** | `coverageRuleIsResolved` is wired in three places — it throws `unresolved_coverage_rule` per report in `fuelFinalizeService`, and feeds `unresolvedCoverageRule` on both the client and server gates. |
| **H-11** | Fail-closed: the `entries` mode refuses with `missing_category_costs`, and the shared gate refuses any snapshot set without category costs. A flat-ratio week can no longer publish. |
| **P-2** | `precomputeFuelFillDrivers` is built once per finalize and passed as `driverByEntryId`, collapsing the per-entry attribution rescan. |
| **U-7** | Real dispositions: `validateDisposition` runs client-side (wizard) **and** server-side (`/leakage-review` 422s on an invalid code or a short note), the chosen code is persisted into the `leakage_review` audit payload, and `FuelGapAttribution` now receives `estimateLiters` so the km estimate renders. |

`P-7` is half done — the bulk dialog now passes `priorReports`; `handleFinalize` still does not.

### 0.3 🔴 Red — but neither is a money defect

| # | Sev | What | Evidence |
|---|---|---|---|
| **N-9** | **Blocking CI** | Adding `fuel_week_engine.ts` **and `fuel_period_routes.ts`** to the CI `deno check` step turns that step red. `fuel_week_engine.ts` is clean, but `fuel_period_routes.ts` carries **14 pre-existing** strictness errors (every `c.req.param("id")` is `string \| undefined` passed to `loadPeriod(orgId: string, periodId: string)` — routes that predate this work), and its transitive graph adds ~54 more: `toll_controller.tsx` 25, `fuel_logic.ts` 13, `fuel_cycle_stamp.ts` 8, `driver_financial_periods.ts` 4, `periodPersistBody.ts` 3. **Verified pre-existing** — `deno check toll_match_index.ts` alone fails with 2. The coverage instinct was right; the scope was too wide in one step. | [ci.yml:116](.github/workflows/ci.yml#L116) |
| **N-10** | Medium | `fuelFinalizeGolden.test.ts:92` fails. The fixture is a `spend = 80 / misc = 40` week (50% residual) with `scenarios: []` and no `leakageReviewed` — so it now correctly trips **both** `under_explained_unreviewed` and `unresolved_coverage_rule`. **The code is right and the fixture is stale**, but a red golden on the finalize path is not something to leave sitting. | test output |

### 0.4 🟠 One thing got worse

| # | Sev | What | Evidence |
|---|---|---|---|
| **N-11** | High (perf) | The new shared gate adds **five more unbounded `kv.getByPrefix` scans** — `fuel_dispute:`, `fuel_entry:`, `transaction:` — and they run on **every HTTP finalize and every period in every auto-close sweep**, on top of the `transaction:` scan that was already there. P-3 was already the worst server-side cost in the section; correctness was bought with roughly a 2× increase in it. Correct trade for now, but it makes P-3 urgent rather than deferrable. | [fuel_week_closable_gate.ts](supabase/functions/_fleet-server/fuel_week_closable_gate.ts) |

### 0.5 Still open

**High:**
- **H-5** — `/materialize` is still `requirePermission("transactions.edit")`, still stamps
  `computed_from_hash: "client:…"`, and the surface **widened**: it now also accepts a
  client-supplied `counts` jsonb, which is the input to a close gate. Client-written money plus
  client-written gate state on one unprivileged route.
- **H-7** — `sealFuelWeek` still iterates `driver_financial_periods` only. A driver with fuel
  spend but no DFP row for the anchor still gets no statement, silently.
- **P-3 / N-11** — see above.

**Medium / Low:** `P-1` (whole-dataset props) · `P-4` (probe still rebuilds per driver) ·
`P-7` (handleFinalize half) · `P-8` (remount key unchanged) · `P-9` (mount waterfall) ·
`U-10` (step notes still component state) · `U-13` · `U-14` (only the money strip got a live
region) · `R-2` · `R-3` · `R-4`.

**Strategic:** Stage 5 #30 (`evaluateFuelWeekClosable` is shared but the browser and server
still run two different *engines*; only the gate is unified) and **#31 — the nightly
`statement.driverShare ≈ Σ active fuel_deduction` assertion still does not exist.** That is the
one control that would have caught C-2 in production on its own, and Stage 0 proved C-2 had
already happened. It is now the highest-value remaining item.

### 0.6 Verdict

**The fuel reconciliation money path is now defensible.** Every Critical from Rev 1 is closed
or fail-closed, every Rev 2 regression is gone, and — the part that matters most — the pattern
that has recurred through every audit of this system **did not recur this time**. Seven controls
that could not fail were made able to fail, with real inputs feeding them, and the one place
where the authority is still shallow (server recompute using the client's own categories) is
labelled in the code as a TODO instead of being passed off as done.

Remaining work is operational, not structural: a CI step scoped too wide, one stale fixture, a
known performance debt that the correctness fixes made larger, and two route-level governance
gaps. None of them can produce a wrong number at close.

### 0.7 Next actions, in order

1. **N-9** — revert `fuel_period_routes.ts` out of the CI `deno check` list and keep
   `fuel_week_engine.ts` in (it is clean and it is the file that broke). Open a separate task to
   fix the 14 `c.req.param` narrowings, then add it back. Do not let a pre-existing strictness
   backlog block the fuel work.
2. **N-10** — update the golden fixture: give it a resolved `Percentage` scenario and either
   `leakageReviewed: true` or a residual inside the 25% band. Add a second case asserting the
   week **is** refused without those, so the fixture proves the gate rather than dodging it.
3. **Stage 5 #31** — the nightly statement↔ledger assertion. Highest value left; §12.1 C-2 and
   §13.2 Q3 already contain the query.
4. **H-5** — move `/materialize` to `fuel.edit_entry` at minimum, and compute `counts`
   server-side from the gate you already built rather than accepting them from the browser.
5. **P-3 / N-11** — push org + date into SQL for `fuel_entry:`, `fuel_dispute:` and
   `transaction:`. The gate made this urgent.
6. **H-7** — seal from the union of DFP rows and snapshot driver ids.
7. Then the Rev 1 §14 order from Stage 6 (performance) onward.

One thing to confirm operationally before flipping `FUEL_SERVER_ENGINE=enforce`: the Stage 0
gate file still instructs you to reopen and reseal week `2026-08-24` for driver `73e5b1dc…`.
I saw no evidence in this commit that it has been done.

---

## 0C. Rev 2 — first implementation verification (superseded by §0)

A remediation pass was implemented against Rev 1 (115 changed paths, ~1,033 insertions across
the fuel graph, uncommitted). I re-read every changed file and ran the suites. **This is not
signed off.** Three items block the merge outright, one of them is a new Critical money bug.

### 0.1 Build and test state — measured, not assumed

| Gate | Result |
|---|---|
| `pnpm --filter @roam/fuel-core test` | **68/68 pass** ✅ |
| `pnpm --filter @roam/fuel-core typecheck` | **FAIL — 2 errors** ❌ (CI step "Typecheck fuel-core" breaks) |
| `pnpm --filter @roam/fleet test` | **FAIL — 2 files / 2 tests** ❌ (1,388 pass) |
| `deno check supabase/functions/_fleet-server/fuel_week_engine.ts` | **FAIL — unresolved identifier** ❌ |
| `check-fuel-core-parity` / `check-fuel-org-scope` / `assert-fuel-entries-unwrap` | pass ✅ |

### 0.2 Credit where it is due

Real, correct, verified work — do not undo any of this:

- **Stage 0 was actually done.** `packages/fuel-core/fixtures/fuel-week-char/` +
  `docs/fuel-recon/stage0-gate.json`. It answers the Rev 1 open questions and records the
  verdict: **C-2 was live in production** — one statement↔ledger delta on week `2026-08-24`
  for driver `73e5b1dc…` — and **no `auto_close` audit rows exist**, so C-3 was latent, not
  realised. That is exactly the §13.2 Q3 evidence Rev 1 asked for, and the gate file
  correctly requires that week be reopened and resealed before `FUEL_SERVER_ENGINE=enforce`.
- **C-2 is genuinely closed.** The trailing rebuild-preference rule is deleted
  (`fuel_close_amounts.ts`) and `fuel_week_rebuild` is removed from `verifiedSources`, so a
  rebuild-only week now publishes `draft` and blocks Close Week instead of silently
  substituting Engine B money.
- **C-7 is properly closed at the root.** `classifyFuelMiscResidual` replaces the abs gate
  with a signed three-way classification, `isOverExplainedResidual` / `isUnderExplainedResidual`
  split the two conditions, `evaluateFuelFinalizeGating` grew a separate
  `underExplainedBlockers` list, and the wizard now has distinct hero copy and distinct gate
  behaviour (over = hard block, under = reviewable after a typed acceptance).
- **H-1 is closed at the root.** `unaccountedDistance` is now evidence-based
  (`personalEvidenceDistance` from logged `Personal` adjustments) instead of being the
  residual, so it can finally be non-zero. **And the revived `deductionRecommendation` is
  safe** — I traced `processGapDeduction` and it has **zero callers**, so no money auto-posts.
- **C-8, H-13, C-5, C-6, H-2, H-4, H-9, H-12, U-1, U-8, U-9, U-11, U-12, P-5, P-6** all verified
  closed (details in §0.4).
- **R-1 is closed properly.** `fuelWeekChar.test.ts` carries an `expectDivergence` fixture, so
  the parity harness can fail — it is not a mirror of a mirror. It runs inside the fuel-core
  suite, which is already in CI.

### 0.3 🔴 Blocking — fix before this branch merges

| # | Sev | What | Evidence |
|---|---|---|---|
| **N-1** | **Critical** | **Every unassigned fill is now attributed to every driver-week.** `entryBelongsToDriverWeekReport` gained `|| resolved.driverId === UNASSIGNED_FUEL_DRIVER_ID` on both the precomputed-map branch and the resolve branch. The `=== report.driverId` clause already covered the unassigned *sentinel* report, so the `||` adds nothing there and breaks every real driver. Consequence: `sumGasCardSpendForReport` / `sumPaidByDriverForReport` count each unassigned fill once **per driver report** (money strip totals multiply, `sourcesTie` breaks), and in `finalizeFuelWeekReports` the same fill lands in `weekEntries` → `relevantEntries` for **every driver**, so it is settled and posted to the ledger once per driver. | [fuelPaidByDriver.ts:79-95](apps/fleet/src/utils/fuelPaidByDriver.ts#L79-L95) |
| **N-2** | **Blocking build** | `assembleSnapshotsFromEntries` was deleted from the import block but is still called at two sites. `deno check` fails. The `catch` fallback at :235 would throw a `ReferenceError` — i.e. the recovery path itself is broken. **CI would not catch this**: the `deno check` step names 7 files and `fuel_week_engine.ts` is not one of them. | [fuel_week_engine.ts:211,235](supabase/functions/_fleet-server/fuel_week_engine.ts#L211) |
| **N-3** | **Blocking CI** | `'Personal_Use'` and `'Driver_Personal'` are not members of `MileageAdjustment['type']` (`'Company_Misc' \| 'Personal' \| 'Maintenance'`). `tsc` reports both as provably-dead comparisons; `pnpm --filter @roam/fuel-core typecheck` exits 2. Only `'Personal'` actually matches, so the intent still works — but the build is red. | [fuelCalculationService.ts:1142](packages/fuel-core/src/fuelCalculationService.ts#L1142); [fuelTypes.ts:92](packages/fuel-core/src/fuelTypes.ts#L92) |

### 0.4 🟠 Regressions and over-corrections introduced by the pass

| # | Sev | What | Evidence |
|---|---|---|---|
| **N-4** | High | **H-3 was fixed, then inverted.** The new tie keys off *materiality* instead of *sign*. When `misc ≥ 0` the split already folds `miscForSplit` into company+driver, so `company + driver = total` and adding `leakage` breaks it. Result: every week with any positive unexplained now shows a **red ✗ "Company + Driver + Unexplained ≠ Total — shared-car or calc mismatch"**. Rev 1's bug was always-green; this is always-red. Correct rule is sign-based: `leakage < 0 ? company+driver+leakage : company+driver`. | [FuelWeekMoneyStrip.tsx:62-70](apps/fleet/src/components/fuel/reconciliation/FuelWeekMoneyStrip.tsx#L62-L70) |
| **N-5** | High | **Two fleet tests fail.** (a) `fuelFinalizeGating.test.ts:173` still asserts `hasOverExplainedBlockers` for `misc = +60` on `spend = 100` — stale abs semantics; it should now assert `hasUnderExplainedBlockers`. (b) `fuelSpineGolden5179KZ.test.ts:90` expects `0` variance anomalies, gets `13` — the direct consequence of H-1. **(b) is a deliberate-change-vs-regression decision**, which is precisely what Stage 0 goldens exist to settle. | test output |
| **N-6** | Medium | **H-1 over-corrects.** `personalEvidenceDistance` counts only logged `Personal` adjustments, which most weeks have none of — so `unaccounted ≈ bucketDistance − rideShare − companyMisc`, i.e. nearly the whole personal residual is now "unaccounted". That flips most buckets to `Anomaly` (>10%) and trips `severeGap` (>30%) → `healthStatus = 'Red'` → `dataQualityWarnings` → `hasBlockingWarnings` → the finance-warning ack becomes mandatory on almost every week. Needs a calibrated middle: inferred-personal is not the same as unaccounted. | [fuelCalculationService.ts:1139-1149](packages/fuel-core/src/fuelCalculationService.ts#L1139-L1149) |
| **N-7** | Medium | Seal failure is written into **`computed_from_hash`** as `seal_error:…`. That column is real provenance, set by `/recompute` and `/backfill` to `finalized:N`. Overwriting it corrupts the field and the error is still not surfaced anywhere in the UI (grep for `seal_error` in `apps/fleet` returns nothing), so H-8's operator-visibility half is unmet. | [fuel_period_routes.ts:551-566](supabase/functions/_fleet-server/fuel_period_routes.ts#L551-L566) |
| **N-8** | Low | `FuelBulkFinalizeDialog` still sends `allowServiceSecondApprove: true`, which the server now correctly ignores. High-spend bulk weeks will therefore start failing with `second_approver_required` while the dialog copy still implies the ack is sufficient. | [FuelBulkFinalizeDialog.tsx:421](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L421) |

### 0.5 ⚠️ Partial — the mechanism shipped, the last connection did not

**This is the Rev 1 lesson recurring inside the fix for it.** Four new controls were built and
cannot currently fail:

| ID | Built | Missing connection |
|---|---|---|
| **C-1** | `FUEL_SERVER_ENGINE=off\|shadow\|enforce`, `computeFuelWeek`, `diffWeekCalc`, `SNAPSHOT_MISMATCH` 422, break-glass header, `fuel_engine_diff` audit | **No snapshot ever carries `categoryCosts`.** The route does `const cats = snap.categoryCosts ?? snap.metadata?.categoryCosts; if (!cats) continue;` — and `categoryCostsFromReport` is used only *inside* `freezeReportMoneyThroughAssembler`, never attached to the emitted `FinalizedFuelReport`. **Zero comparisons run, even in `enforce`.** Separately: the recompute is fed the snapshot's *own* categories, so it verifies the split arithmetic but not the categories — a wrong `rideShareCost` from a bad trip fetch still passes. |
| **C-3** | `evaluateFuelWeekClosable` (9 blocker codes, tested), wired into auto-close, `counts_unevaluated` now blocks | Only **3 of 9** inputs are supplied at the call site. `hasUnacknowledgedExceptionFills` and `hasOpenDisputes` are still never passed, so auto-close still does not check them. And since `counts` **still has no writer anywhere**, `countsUnevaluated` is permanently true — auto-close is now globally disabled. Fail-closed and therefore safe, but it masks the two missing gates rather than closing them. `evaluateFuelWeekClosable` has **one** production call site, not the four Rev 1 asked for. |
| **H-6** | Client-settable `allowServiceSecondApprove` removed ✅; `periodVersion` now stamped into the approval payload ✅ | The **finalize check is unchanged** — it still reads the last 5 `second_approve` rows with no version filter and never selects `payload`. A stale approval from a prior version still satisfies every later finalize. |
| **H-10** | `isKnownCoverageType`, `coverageRuleIsResolved` written, tested, exported | **Zero production call sites.** `splitAllCategoryCosts` still routes an unknown `coverageType` into the `Fixed_Amount` allowance branch, and a missing rule still fails open to 100% company. |
| **C-4** | `assertCategoryCostsTieSpend` + `spendTieDelta` added to `assembleLeftoverWeekMoney` | **Never consumed.** `settleForSnap` and `freezeReportMoneyThroughAssembler` are byte-identical to Rev 1 — the partial-week denominator bug is fully intact. |
| **P-2** | `driverByEntryId` accepted by the attribution context; `precomputeFuelFillDrivers` written and exported | **No caller supplies the map**, so the O(reports × entries × trips) path is unchanged — and the scaffolding is what introduced **N-1**. |
| **H-11** | `FUEL_BUILD_SNAPSHOTS_ENGINE=entries` now refuses with `missing_category_costs` ✅ | The **default `full` path still emits `miscellaneousCost = 0`** — `assembleSnapshotsWithScenarios` passes no `categoryCosts`, and its new `requireCategoryCosts` parameter is declared but never destructured or read. |
| **U-7** | Disposition taxonomy module (`fuelResidualDisposition.ts`) written, validated, tested; a help panel lists the six codes | **Zero production call sites.** Nothing records a disposition; `FuelGapAttribution`'s `estimateLiters`/`estimateKmPerLiter` are still not passed, so the km-estimate branch stays dead. Operators are asked to *type* a taxonomy code into a free-text note. |

### 0.6 Not started

`H-5` (`/materialize` still `transactions.edit`, still client-written money) ·
`H-7` (seal still iterates `driver_financial_periods` only) ·
`P-1` · `P-3` (all KV prefix scans intact, including `transaction:` on every finalize) ·
`P-4` (probe still calls `resolveFuelCloseAmounts` per driver with `fromRebuild` undefined) ·
`P-7` (unbounded `getFinalizedReports()` still the default) · `P-8` · `P-9` ·
`U-10` (step notes still ephemeral) · `U-13` · `U-14` (only the money strip got an `sr-only` line) ·
`R-2` · `R-3` · `R-4` · Stage 5 items 27/30/31 (nightly statement↔ledger assertion) ·
Stage 6 items 32–37.

The `GET /fuel/weeks/:weekStart/bundle` endpoint was added but is a shell — it returns the
period row, counts and a snapshot count, and its own `provenance.note` says reports and
blockers remain client-computed. It is not yet the Stage 6 bundle and nothing consumes it.

### 0.7 Verdict on the pass

**Roughly half the audit is genuinely closed, and the half that is closed is closed well.**
C-2, C-7 and H-1 were the hardest root-cause items and all three were fixed at the root rather
than patched at the surface. Stage 0 was executed properly and found a real production defect.

But the section is **not shippable in this state**: the build is red in two places, and N-1 is a
live double-posting bug on the money path — strictly worse than anything Rev 1 found, because
Rev 1's defects were mostly latent while N-1 fires on any week containing an unassigned fill.

And the Rev 1 closing line applies to the remediation itself. Seven new controls were built and
seven cannot currently fail: the engine diff (no `categoryCosts` emitted), the auto-close gate
(3 of 9 inputs), the version-scoped approval (stamped, never read), the coverage-rule guard
(no call sites), the freeze invariant (never consumed), the attribution precompute (no
supplier), and the disposition taxonomy (no writer). **Before marking any of them done, write
the input that makes it fail and watch it fail.**

### 0.8 Ordered next actions

**Immediately (blocks merge):**
1. **N-1** — delete both `|| … === UNASSIGNED_FUEL_DRIVER_ID` clauses in
   `entryBelongsToDriverWeekReport`. Add a test: one unassigned fill + two driver reports must
   be counted **once**, not twice.
2. **N-2** — restore the `assembleSnapshotsFromEntries` import (or remove both call sites and
   let the `catch` return `ok:false`). **Add `fuel_week_engine.ts` and `fuel_period_routes.ts`
   to the CI `deno check` list** — a break this obvious surviving to review is the real finding.
3. **N-3** — drop `'Personal_Use'` / `'Driver_Personal'`, or widen `MileageAdjustment['type']`.
4. **N-5a** — update `fuelFinalizeGating.test.ts:173` to the new signed semantics.

**Then, to make the new controls able to fail:**
5. **C-1** — attach `categoryCosts` (and the applied `fuelRule`) to the emitted
   `FinalizedFuelReport` in `fuelFinalizeService.ts`. Until then `FUEL_SERVER_ENGINE=enforce`
   is a no-op. Add the tampered-snapshot test from §12.1.
6. **C-4** — fix `settleForSnap` and call `assertCategoryCostsTieSpend` in the freeze. This is
   still an open Critical and it is the one most likely to be producing wrong money today.
7. **N-4** — make the money-strip tie sign-based.
8. **C-3** — pass `hasUnacknowledgedExceptionFills` and `hasOpenDisputes` at the auto-close call
   site, and either write `counts` server-side or accept that auto-close stays off and say so.
9. **H-6** — select `payload` and require `payload.periodVersion === period.version`.
10. **H-10 / H-11 / U-7 / P-2** — wire the four modules that currently have no call sites, or
    delete them. Unwired scaffolding reads as done and is worse than absent.

**Then decide, deliberately:**
11. **N-5b / N-6** — re-baseline `fuelSpineGolden5179KZ` **only after** deciding what
    `unaccountedDistance` should mean. Recommendation: treat inferred-personal as accounted but
    *low-confidence*, and reserve `unaccounted` for distance with no plausible attribution, so
    Red health stays a signal rather than the default.

**Then resume the Rev 1 order (§14) from Stage 3 onward.**

---

## 1. Executive summary

**Is this enterprise-grade today? No — not for the bar you set ("when I close fuel
reconciliation, it must do it to perfection").**

This is not a "needs polish" verdict. The section is *sophisticated* — there is a real
job model, cursor resume, idempotent ledger posting, dual approval, an evidence pack,
period versioning with `If-Match`, and a week-statement contract. Several of those are
genuinely well built and I call them out by name in §4. The problem is narrower and
worse than sloppiness:

> **The number the operator reviews and approves is not the number the system closes with,
> and nothing in the pipeline is able to notice.**

There are **two different fuel money engines** in this codebase:

| | Engine A — what you see | Engine B — what closes |
|---|---|---|
| Where | `packages/fuel-core/src/fuelCalculationService.ts` (browser) | `supabase/functions/_fleet-server/fuel_week_engine.ts` (Deno) |
| Method | km per category × ÷ efficiency × JMD/L, coverage split per category, Personal Allowance, misc = residual | flat per-entry ratio × spend |
| Inputs | trips, odometer buckets, fuel cycles, policy **versions**, PA tiers, deadhead API, brain | fuel entry rows only |
| `miscellaneousCost` | the real residual | **hardcoded 0** |

Engine B is what `sealFuelWeek` calls "`fuel_week_rebuild`" and treats as a *verified,
independent* source good enough to publish a **closed** week statement
(`fuel_week_seal.ts:229-235`). And `pickFuelCloseAmounts` will silently **prefer Engine B
over the snapshot you just approved** whenever the approved driver share rounds to zero
(`fuel_close_amounts.ts:67-74`). There is no test, guard, or alert comparing the two.
The three "parity" tests that exist compare Engine B to Engine B.

On top of that, five independent paths can move money or lock a week **without** the gates
the wizard enforces:

1. `POST /fuel/periods/:id/finalize` persists **client-supplied `snapshots`** verbatim — no
   server recompute, no server-side over-explained check, no exception-fill check.
2. `POST /fuel/periods/auto-close` skips every UI blocker; its one real gate
   (`counts.actionable`) reads a column **that has no writer anywhere in the repo**.
3. `POST /fuel/periods/:id/materialize` lets the browser write the SQL read-model money
   (`total_spend`, `unexplained`, shares) directly — that is where your `$28,800`
   hub KPI comes from, tagged `computed_from_hash: "client:…"`.
4. `POST /fuel/periods/backfill` commits wallet + ledger money for staged snapshots.
5. A partial money commit inside `processJobRow` leaves drivers 1..k-1 **posted** and the
   week **unlocked**, with no compensating reversal and no alert.

And the screenshot you attached is itself a symptom, not a coincidence. `$28,800 spend /
$28,800 unexplained` on one vehicle is the exact signature of `priceUnavailable` — no
litres recorded, so every category cost is forced to `0` and the entire spend falls into
the residual (`fuelCalculationService.ts:365-385`). The product then tells you the week is
**"over-explained — categorized costs exceed gas-card spend"**, which is the precise
opposite of what happened, and hard-blocks Finalize with **no remediation path in the UI**.

**The good news:** the architecture is ~80% right and the rewrite you may be bracing for is
not needed. What is missing is the same thing that was missing in the settlement audit —
*the last connection, the one that lets a control fail*. §11 proposes a targeted
re-architecture ("one engine, server-authoritative, statement-first") that reuses almost
everything already built.

**Severity tally: 8 Critical · 12 High · 8 Performance · 9 UX · 4 Redundancy.**

---

## 2. Scope and assumptions

### 2.1 In scope (exclusively)

| Layer | Files |
|---|---|
| Hub | `apps/fleet/src/components/fleet-financials/WeekReconciliationPage.tsx` |
| Page shell / data owner | `apps/fleet/src/pages/FuelManagement.tsx` (1,898 lines) |
| Landing + wizard | `apps/fleet/src/components/fuel/reconciliation/**` (39 files, 6,411 lines) |
| Derivation / gating | `apps/fleet/src/utils/fuelPeriod*.ts`, `fuelFinalizeGating.ts`, `fuelPaidByDriver.ts`, `buildFuelWeekReportsForFinalize.ts`, `fuelFinalizeWeekSnapAdapter.ts` |
| Client finalize | `apps/fleet/src/services/fuelFinalizeService.ts` |
| Shared money core | `packages/fuel-core/src/**` (5,462 lines) |
| Server | `supabase/functions/_fleet-server/fuel_period_routes.ts`, `fuel_week_engine.ts`, `fuel_period_build_snapshots.ts`, `fuel_week_seal.ts`, `fuel_close_amounts.ts`, `fuel_financial_reset.ts` |
| Schema | `supabase/migrations/20260902210000_fuel_reconciliation_period.sql` |

### 2.2 Explicitly out of scope

Tolls, driver settlements, week close (`week_close.ts`) beyond where fuel hands off,
Review Queue (`/fuel-reimbursements` — audited 2026-09-14, verdict *keep*), Card Inventory,
Station Database, Fuel Analytics, Transaction Logs, Business Finance P&L.
I touch these only where fuel crosses the boundary.

### 2.3 Assumptions (you left the Context block blank — correct me on any of these)

| # | Assumption | Basis | If wrong |
|---|---|---|---|
| A1 | Stack is React 18 + Vite + TanStack Query, Supabase Postgres + Deno edge functions (Hono), pnpm monorepo | `package.json`, `vercel.json`, `supabase/functions` | §5 infra findings shift |
| A2 | Currency is JMD; Jamaica single-timezone fleet | `fuelCalculationService.ts` comments, `FALLBACK_EFFICIENCY_KM_L` "plausible for Jamaica" | none material |
| A3 | Scale is tens of vehicles, low hundreds of fills/week, thousands of trips/week | 1 vehicle / $28,800 in your screenshot; `FUEL_TRIPS_HARD_MAX = 15_000` | §5 severities rise sharply with scale |
| A4 | A small number of finance admins use this weekly, one week at a time | wizard is single-week, `runExclusive` mutex | concurrency findings rise |
| A5 | No SLO is written down today | nothing in repo | §12 proposes targets |
| A6 | The screenshot is a real production-shaped week, not a fixture | `$28,800`, 31 completed weeks | C-7 evidence weakens but the code defect stands |
| A7 | You want to keep the current UI shape (hub → landing → 6-step wizard) | your "must keep existing UI" prompt line was blank; the wizard is heavily invested in | §11 offers a no-UI-change migration path |

### 2.4 Method

Static read of every file listed in §2.1, plus cross-checks: grepping for writers of every
column a control reads, tracing each money value from entry row → report → snapshot →
KV → `financial_events` → `week_statements`, and checking each guard for an input that
would make it fail. I did **not** run the app, query the database, or execute the test
suite. Findings marked **[observed]** are read directly from code; **[inferred]** means I
reasoned from code to a runtime consequence and you should confirm with the data in §13.

---

## 3. Full functional walkthrough — what this section does today

### 3.1 Entry

`Business Finance → Week Reconciliation` renders `WeekReconciliationPage`, a two-tab shell
(Fuel / Tolls) gated on `canView('fuel-reconciliation')` / `canView('toll-tags')`. The Fuel
tab lazy-loads the **entire `FuelManagement` page** in `embedded` mode with
`defaultTab="reconciliation"` (`WeekReconciliationPage.tsx:122-128`).

That is worth naming: the Week Reconciliation hub does not own the fuel lane. It mounts a
1,898-line multi-desk page (Card Inventory, Transaction Logs, Review Queue, Configuration,
Reconciliation) and hides five sixths of it. Everything downstream inherits that page's
data-loading decisions — including the one in **C-6**.

### 3.2 Data load (`FuelManagement.tsx:499-730`)

Load is tab-scoped into three scopes:

- `core` — vehicles + drivers
- `recon` — vehicles, drivers, scenarios, adjustments, disputes **(no fuel cards)**
- `full` — the above plus cards + JAA programs

Opening the hub lands on `recon`. Separately:
`loadLogsAndTransactions()` pages fuel entries and transactions for the window;
a deferred effect (900 ms after periods arm) fetches activity bounds then finalized
reports; another effect pages trips for `reconciliationDateRange`.

All of it lands in `useState` on `FuelManagement` and is handed down as props:
`vehicles, trips, fuelEntries, adjustments, disputes, scenarios, drivers, fuelCards,
finalizedReports, transactions` → `FuelReconciliationDashboard` → `FuelPeriodWizard` →
`useFuelWizardDerived`. **The whole dataset travels as React props** (P-1).

### 3.3 Landing (`FuelPeriodLandingPage`)

Cards are built by `mergeServerFirstLandingPeriods` (`fuelPeriodServerMerge.ts:146`):

1. SQL `fuel_reconciliation_period` rows → `serverRowsToLandingPeriods` — **authoritative**
   for any week SQL knows about.
2. `deriveFuelReconciliationPeriods` (client, `fuelPeriodStatus.ts:176`) — **gap-fill only**,
   used for weeks with no SQL row. Note line 228: `const locked = false;` — the client
   derivation can never produce a locked week, by construction.

Each card shows week label, days open, vehicle count, spend, unexplained (+ sparkline vs
prior weeks), an auto-close badge, and six step chips
(Data quality · Disputes · Policy check · Unexplained fuel · Settlement · Finalize), each
reading `counts[stepId].actionable` and rendering `Done` or `N to review`.

Above the tabs: a three-KPI strip — **Open weeks / Unexplained (open) / Oldest unclosed** —
plus *Finalize weeks* (bulk), *Reopen weeks* (bulk), *Finalized archive*.

`isReconWeekSealed` blocks opening a week before the Monday after it ends.

### 3.4 The wizard (`FuelPeriodWizard`, 908 lines)

On open:

- `useFuelWeekReports` (TanStack Query, 30 s stale, content-hash key) calls
  `buildFuelWeekReportsWithGating` → `buildFuelWeekReportsForFinalize` →
  **Engine A** (`FuelCalculationService.generateDriverFleetReport`).
- In parallel it hydrates server state: org prefs (second-approver threshold, dual-approval
  UI mode), the SQL period row (`serverPeriodId`, `leakageReviewedAt`, `currentStep`), and
  the `second_approve` actor list from the evidence pack.
- `useFuelWizardDerived` computes eight derived collections: `vehicleSnaps`,
  `settlementRows`, `counts`, `gatedStates`, `strip`, `qualityRows`, `breakdownRows`,
  `leakageRows`, `policyRows`, `priorMedian`, `gateResult`.

**Engine A per driver-week** (`fuelCalculationService.ts:217-639`):

```
spend      = Σ ops fills in week
litres     = Σ ops litres
price/L    = spend ÷ litres      → if litres = 0 ⇒ priceUnavailable, price = 0
efficiency = odometer-derived (≥3 anchored fills) → vehicle setting → 10 km/L
rideShareCost   = tripKm       ÷ eff × price     (0 when priceUnavailable)
companyUsageCost= adjustmentKm ÷ eff × price     (0 when priceUnavailable)
deadheadCost    = deadheadKm   ÷ eff × price     (0 when priceUnavailable)
personalUsageCost = residualKm ÷ eff × price     (0 when priceUnavailable)
misc = spend − (rideShare + companyUsage + deadhead + personal)
→ Personal Allowance: company absorbs earned km, overage splits
→ coverage split per category (misc floored at 0 for the split)
companyShare / driverShare = Σ per-category sides
healthStatus = Emerald | Amber | Red from fuel cycles + gaps + price/efficiency source
```

**Money strip** (`FuelWeekMoneyStrip`) then shows two rows —
*Where the money came from* (gas card / cash from earnings / total) and
*Who ends up paying* (company / driver / unexplained) — each with a tie check.

**The six steps:**

| Step | Blocks Continue when | Panel |
|---|---|---|
| Data quality | unacknowledged exception-tier fills, or a **negative** misc | exception blockers, unapproved-tx blockers, vehicle quality rows, cost breakdown |
| Disputes | any open dispute | dispute list + add-adjustment |
| Policy check | never (informational) | per-vehicle scenario + fuel rule + effective-from |
| Unexplained fuel | **positive** misc until `leakageReviewed` | leakage rows, per-vehicle gap attribution, stop-to-stop bucket view |
| Settlement | never | per-driver cash-from-earnings / driver share / net pay + CSV export |
| Finalize | see below | blocker panels, finance-warning ack, second approver, evidence pack, Finalize button |

Gating is `computeFuelGatedStepStates`: any step with `actionable > 0` locks every later
step. `clampFuelStepToGates` stops a deep link from jumping a gate. `j`/`k`/`a`/`e`/`Enter`
keyboard queue. A free-text "step note" box feeds the evidence pack.

**Finalize gate** (`evaluateFuelFinalizeGating` + `handleFinalizeClick`):

- `exceptionBlockers` — hard block
- `unapprovedFuelTxBlockers` — hard block (Pending fuel receipts in Review Queue)
- `overExplainedBlockers` — **hard block, no override** (this is C-7)
- `hasBlockingWarnings` — soft, requires a checkbox ack
- `needsHumanSecondApprover(spend > threshold)` — requires a *distinct* second admin

### 3.5 Finalize, client side (`FuelManagement.handleFinalize` → `finalizeFuelWeekReports`)

1. `confirmSettlementReopen(reports)` — warns if driver payouts already exist.
2. `runExclusive` mutex.
3. `ensureFuelReconciliationPeriod({weekStart, weekEnd})` → SQL row.
4. Re-fetch prefs; if spend > threshold, verify a **distinct** `second_approve` actor from
   the evidence pack, else throw.
5. `finalizeFuelWeekReports(reports, {vehicles, drivers, fuelCards: cards, fuelEntries: logs,
   scenarios, trips, transactions}, {deferSnapshotPersist: true})`:
   - re-checks unapproved fuel txs client-side;
   - per report: pick `relevantEntries` (Pending, or Pending+Verified+already-finalized when
     re-finalizing), close open tank cycles, compute `driverSpend` / `gasCardSpend`,
     resolve the active policy **version**, then **re-freeze the money** through
     `freezeReportMoneyThroughAssembler` and build a `FinalizedFuelReport` snapshot;
   - writes next-week Personal Allowance bonus km for drivers who hit the top band.
6. `POST /fuel/periods/:id/finalize` with `{snapshots, totalSpend, secondApproverThreshold}`,
   `Idempotency-Key`, `If-Match: version`.
7. On `version_conflict` / worker OOM, `recoverIfAlreadyLocked()` re-reads the period and
   treats `status === 'locked'` as success.
8. Invalidate `finalizedReports`, `driverFinancialPeriods`, `fuelReconciliationPeriods`.

### 3.6 Finalize, server side (`processJobRow`, `fuel_period_routes.ts:261-623`)

```
job → running
if period already locked        → succeed (idempotent resume)
if spend > threshold            → require a distinct second_approve audit row
assertNoUnapprovedFuelTxInWindow → hard refuse
for each snapshot:  stageFinalizedSnapshot  → kv `finalized_report:{week}:{driver}`
   (cursor-resumable; any failure ⇒ period back to `ready`, job `failed`, STOP)
for each snapshot:  commitFinalizedSnapshotMoney
   reverseEnterpriseFuelSyncForSnapshot
   settleEnterpriseFuelFromSnapshot
   postFuelFinalizedEventsFromReport   → financial_events (fuel_finalized,
       fuel_deduction, fuel_fleet_share, fuel_driver_spend, fuel_gas_card_spend)
   kv.set(..., moneyCommitted: true)
period → status 'locked', locked_at, version+1, aggregated money
sealFuelWeek(...)                → week_statements kind='fuel'   [failure = non-fatal]
insertAudit('finalize', ...)
job → succeeded
rebuildExpensesForFuelWeek(...)  → driver_financial_periods      [failure = non-fatal]
```

### 3.7 Reopen

`POST /:id/reopen` (reason required) → per staged snapshot: reverse enterprise sync,
reverse fuel `financial_events` (compensating rows, keyed
`fuel_reset:{driver}:{week}:{eventId}`), delete the KV snapshot → period `reopened`,
`leakage_reviewed_at` cleared, `counts = {}`, `current_step = 'data-quality'`, version+1 →
rebuild expenses.

### 3.8 Auto-close (cron)

`POST /fuel/periods/auto-close` with `X-Fleet-Cron-Secret`. Per org, per open period:
skip if unexplained > ε and not leakage-reviewed → skip if `counts.actionable > 0` → skip
if unapproved fuel txs → skip if the calendar week has not ended → build snapshots
server-side if none staged (**Engine B**) → dual approval via distinct service actors →
`processJobRow`. Writes per-week and per-run alerts to KV.

---

## 4. Architecture findings

### 4.1 What is genuinely well built — keep it

State this plainly so the remediation does not damage it:

- **Ledger idempotency is correct.** `postFuelFinalizedEventsFromReport`
  (`fuel_financial_reset.ts:197-367`) loads active events, compares all four amounts to the
  cents, no-ops on a match, and otherwise reverses and posts a *new generation* with a
  suffixed idempotency key. A crash between money commit and the lock row is safe to retry.
  This is the single best-engineered thing in the section.
- **Signed shares end-to-end.** No `Math.abs` on `driverShare`; the C-1 finding from the
  2026-09-07 system audit is genuinely closed on this path.
- **Negative-misc flooring is real and consistent.** `floorMiscForSplit` is applied at both
  split sites (`fuelCalculationService.ts:457` and `:682`) and inside
  `assembleLeftoverWeekMoney`. An over-explained residual never becomes driver debt.
- **Cursor-resumable staging with a fail-closed hold.** `NEW-7` — any staging failure puts
  the period back to `ready` rather than silently locking.
- **Optimistic concurrency.** `If-Match: version` + `Idempotency-Key` + a job table.
- **Policy versioning exists.** `resolveDriverVersionForWeek` resolves the rule that was
  effective *for that week*, and the applied version is stamped into snapshot metadata.
- **Price is two-tier by design.** `resolvePricePerLiter` never invents a fallback — this is
  a deliberate position and I am **not** recommending you change it (see `FUEL_SYSTEM_AUDIT`
  §M2). The defect in C-7 is what the product *does* with `priceUnavailable`, not the
  refusal itself.
- **`freezeReportMoneyThroughAssembler` passes real `categoryCosts`** — so the freeze
  *does* use Engine A's category math, not a flat ratio. Credit where due; the bug in C-4
  is the spend denominator, not the method.

### 4.2 The structural problem: two engines, no contract between them

This is the root cause of C-1, C-2, C-3, H-11 and R-1.

```
                      ┌───────────────────────────────────────┐
  operator reviews →  │  ENGINE A  FuelCalculationService     │  (browser)
                      │  categories · odometer · PA · policy  │
                      └────────────────┬──────────────────────┘
                                       │ snapshots (JSON, over the wire)
                                       ▼
                      ┌───────────────────────────────────────┐
                      │  POST /fuel/periods/:id/finalize      │  trusts the payload
                      └────────────────┬──────────────────────┘
                                       ├──► kv finalized_report
                                       ├──► financial_events  (the driver's real money)
                                       └──► sealFuelWeek
                                                 │
            ┌────────────────────────────────────┴───────────────┐
            │  pickFuelCloseAmounts: override → consumption →     │
            │  kv → REBUILD → period columns                      │
            │  …and a trailing rule that prefers REBUILD          │
            └────────────────────────────────────┬───────────────┘
                                                 ▼
                      ┌───────────────────────────────────────┐
                      │  ENGINE B  fuel_week_engine (Deno)    │  ratio × spend, misc = 0
                      │  no trips · no odometer · no PA       │
                      └────────────────┬──────────────────────┘
                                       ▼
                              week_statements (kind='fuel', status='closed')
                                       ▼
                              Close Week invariants · Business Finance P&L
```

`sealFuelWeek` labels `fuel_week_rebuild` an **independent verified source** authorised to
publish a `closed` statement. It is independent — but of a *different physical model*. The
statement contract that Pass 4/5 of the system audit built is therefore satisfied by a
number that was never reviewed, never reconciled to the ledger events, and never compared
to Engine A by any test.

### 4.3 Controls that cannot fail

The recurring lesson from your last two audits recurs here, four more times:

| Control | Why it cannot fail |
|---|---|
| Auto-close `counts.actionable > 0` | **`counts` has no writer.** Only reads (`:100`), only clears (`:594`). Column default `'{}'`. Grep across `supabase/`, `apps/`, `packages/` confirms it. Always `0`. |
| Money-strip `Company + Driver + Unexplained = Total` | `splitTie` is an `||` of two identities that are **each true in their own regime** and jointly exhaustive (`FuelWeekMoneyStrip.tsx:64-66`). Cannot print ✗. |
| Bucket gap → `unaccountedDistance` | `personalDistance` is defined as the residual, so `accounted ≡ bucketDistance`. Always `0` (`fuelCalculationService.ts:1141-1144`). |
| Golden test `b.unaccountedDistance <= dist*0.1` | asserts a bound on a value that is always `0` (`fuelSpineGolden5179KZ.test.ts:71`). A mirror of a mirror. |

### 4.4 Coupling

- **Hub → whole page.** `WeekReconciliationPage` mounts `FuelManagement`; the fuel lane is
  not independently addressable, testable, or loadable.
- **Props as the data bus.** No store, no server-state boundary below `FuelManagement`.
  `FuelReconciliationDashboard` takes 26 props; `FuelPeriodWizard` takes 24.
- **Three policy resolvers** used inconsistently: `pickScenarioForDriverMembership`,
  `pickScenarioForDriverWeek`, `resolveDriverVersionForWeek` (client) versus
  `resolveScenarioForDriver` (server, ignores versions entirely).
- **KV and SQL both hold the truth.** Snapshots live in `kv_store_37f42386` under
  `finalized_report:*`; the period read-model lives in SQL; the statement lives in
  `week_statements`; the driver's money lives in `financial_events` and is projected to
  `driver_financial_periods`. Four stores, three write paths, no single transaction.

### 4.5 Idempotency and failure modes

| Path | Idempotent? | On partial failure |
|---|---|---|
| Snapshot staging | yes (cursor + `done` set) | period → `ready`, job `failed`, **safe** ✅ |
| Money commit | yes per driver (generation keys) | **drivers 1..k-1 stay posted, week unlocks, no reversal, no alert** ❌ (C-8) |
| Period lock | yes (`already locked` short-circuit) | safe ✅ |
| `sealFuelWeek` | yes (`force: true`) | **swallowed — locked week with no statement** ⚠️ (H-8) |
| Expenses rebuild | yes | swallowed, logged; job already `succeeded` — acceptable ✅ |
| Reopen | partially | reverse failures are `console.warn`-ed and the KV snapshot is deleted anyway ⚠️ |

The reopen case deserves a line: `fuel_period_routes.ts:565-579` wraps the reversal in
`try/catch → console.warn`, then **unconditionally** deletes the KV snapshot. If the
reversal failed, the compensating evidence is gone and the week now looks reopened while
the ledger still carries the charge.

---

## 5. Performance findings

### P-1 — Whole-dataset-in-React-props  *(High)*
`FuelManagement` holds ten collections in `useState` and passes all of them down. Any
single state change re-renders the dashboard, the wizard and every derived `useMemo` whose
dependency array includes that array identity. **[observed]**
*(This is the unresolved half of P-3 in `RECONCILIATION_SYSTEM_AUDIT` — it was never closed.)*

### P-2 — Attribution is O(reports × entries × trips)  *(Critical for perf)*
`sumPaidByDriverForReport` / `sumGasCardSpendForReport` →
`entriesBelongingToDriverWeekReport` → `resolveFuelFillDriver` → `tripNearFill`, which
**filters the entire trip array per entry**. Called:

- once per report in `buildMoneyStrip` (×2 — gas card and cash)
- once per report in `buildSettlementRows`
- once per vehicle snapshot in `useFuelWizardDerived`
- twice per report again in `finalizeFuelWeekReports`

With `FUEL_TRIPS_HARD_MAX = 15_000`, 200 fills and 20 driver-weeks that is on the order of
**10⁸ comparisons per wizard render**, re-run on every dependency identity change. This is
the single largest client cost in the section. **[observed]**

### P-3 — Unbounded KV prefix scans on the close path  *(High)*
`kv.getByPrefix` (`kv_store.tsx:176-201`) pages 1,000 rows at a time over `key LIKE
'prefix%'` with **no org predicate and no date predicate**. The fuel close path issues:

| Call | Prefix | Growth |
|---|---|---|
| `assertNoUnapprovedFuelTxInWindow` | `transaction:` | **every transaction ever, on every finalize** |
| `loadWeekFuelEntries` | `fuel_entry:` | every fill ever, per snapshot build |
| `loadOrgScenarios` / `loadOrgDrivers` / `loadOrgVehicles` | `fuel_scenario:` / `driver:` / `vehicle:` | whole tables |
| `/backfill`, `/recompute`, evidence pack | `finalized_report:` | whole table |

Filtering happens in JS **after** the scan. **[observed]**

### P-4 — Seal probe rebuilds the whole week per driver  *(High)*
`resolveFuelCloseAmounts` with `fromRebuild === undefined` calls `amountsFromRebuild`,
which rebuilds the entire week, then takes one driver out of the map
(`fuel_week_seal.ts:150-157`). `sealFuelWeek` correctly hoists this; the
`statement_engine_probe.ts` caller does not. **O(drivers × all fuel entries).** **[observed]**

### P-5 — `loadOrgVehicles` scanned and discarded  *(Low)*
`fuel_week_engine.ts:195-220` loads all vehicles and passes them into
`assembleSnapshotsWithScenarios`, which never reads `vehicles`. A whole-table scan for
nothing. **[observed]**

### P-6 — `attachBrainHints` is a no-op that costs a loop and pollutes the record  *(Medium)*
`fuel_week_engine.ts:153-173` calls `classifyFuelWeek({totalOdometerKm: 0,
tripRideshareKm: 0, companyOpsKm: 0})` — **all zeros, for every driver** — and stamps the
result into `metadata.brain` on the closed snapshot. That is fabricated classification
metadata in a permanent audit record. **[observed]**

### P-7 — `getFinalizedReports()` with no range  *(Medium)*
`fuelFinalizeService.ts:82` defaults `priorReports` to `api.getFinalizedReports()` with no
arguments — every finalized report ever, on every finalize that doesn't pass
`opts.priorReports`. `FuelManagement` does not pass it. **[observed]**

### P-8 — Wizard remounts and recomputes wholesale  *(Medium)*
`key={`${period.id}-${wizardSession}-${view.initialStepId || ''}`}` forces a full remount
on step deep-link change, discarding `stepNotes`, `financeWarningAcknowledged` and
`secondApproveActors`, and re-firing the server hydrate effect. Separately,
`useFuelWizardDerived` recomputes eleven collections whenever any of ten array identities
change — and P-1 guarantees they change often. **[observed]**

### P-9 — Mount waterfall  *(Medium)*
Recon mount fires, in sequence with deliberate delays: `loadData(recon)` → periods query →
`periodsQueryReady` → 900 ms timer → activity bounds → finalized reports; and in parallel
trips paging (up to 10 requests at 1,500/page) and logs+transactions paging. Then opening a
week fires trips again, deadhead, PA context and a brain classify per vehicle (pool of 3).
The comment `ROAM-FLEET-10` shows this was already tuned once for an HTTP/1.1 connection
storm — it is sequenced, not reduced. **[observed]**

---

## 6. UX findings

### U-1 — The KPI that headlines the section is signed-summed  *(High)*
`portfolio.totalUnexplained = open.reduce((s,p) => s + p.netLeakage, 0)`
(`FuelPeriodLandingPage.tsx:401`). A portfolio with +$50k on one week and −$50k on another
displays **$0.00 — nothing to see**. For a leakage metric the correct aggregate is gross
(Σ|x|) with signed sub-totals beside it. **[observed]**

### U-2 — The step chips on the landing card are fiction  *(High)*
Because `counts` is never written (§4.3), `coerceStepCounts`
(`fuelPeriodServerMerge.ts:66-69`) fabricates exactly the pattern in your screenshot:

```
if (!locked && |unexplained| > ε && !leakageReviewed) {
  counts['leakage-gap'].actionable = 1;
  counts.finalize.actionable      = 1;
}
```

Everything else renders **"Done"** — including *Data quality* on a week that may hold
unacknowledged exception-tier fills, and *Disputes* on a week with open disputes. The card
asserts clearance it has not checked. **[observed]**

### U-3 — The card promises work the wizard will refuse  *(High)*
Your screenshot's card says **"2 to review"** and **"Finalize — 1 to review"**. Open it and
the Finalize hero reads *"Can't finalize — over-explained week"* with `actionDisabled` and
**no action at all**. There is no "blocked" state on the landing card, no reason, no route
to resolution. **[observed + inferred]**

### U-4 — Over-explained / under-explained are conflated in the copy  *(Critical — see C-7)*
`isOverExplainedFuelWeek` is `|misc| > 0.25 × spend`. Both a positive residual
("we bought fuel we can't account for") and a negative one ("our model says we burned more
than we bought") land in the same bucket, and the Finalize hero prints, for both:

> *"The residual is a modelling artefact, not real cash — fix odometer / efficiency /
> distance inputs first."*

For your week — $28,800 of **genuinely unaccounted spend** — that message is wrong in
direction and wrong in advice. **[observed]**

### U-5 — The Unexplained step contradicts itself on screen  *(High — see H-2)*
`FuelLeakageStep` declares `totalSpend?: number` defaulting to `0`
(`FuelLeakageStep.tsx:44`) and **`FuelPeriodWizard` never passes it** (render at
`FuelPeriodWizard.tsx:828-848`). So `isOverExplainedFuelWeek(0, leakage)` takes the
`spend <= 0 ⇒ misc !== 0` branch and fires for **any** non-zero residual, with
`overPct === null`, producing:

> *"Unexplained is **beyond** of spend — this week is not fit to finalize"*
> *"**Do not accept this week** — the residual is a modelling artefact"*

…directly above a live *"Mark reviewed & continue"* button, on a week the real gate
considers fine. Broken grammar, false alarm, and two verdicts in one viewport. **[observed]**

### U-6 — The tie check prints an identity that is false  *(High — see H-3)*
For your screenshot week (company $28,800, driver $0, unexplained $28,800, total $28,800)
the strip renders a **green ✓** next to
*"Company + Driver + Unexplained = Total"*. 28,800 + 0 + 28,800 = **57,600**. The check
passed on the *other* branch of the `||`. A green tick on a false statement, in the
money-clarity strip, is worse than no tick. **[observed]**

### U-7 — Unexplained fuel has no remediation, only acceptance  *(High)*
The only outcome of the Unexplained step is *accept*. `FuelGapAttribution`'s one actionable
output — *"≈ N km at rolling efficiency"* — is behind `estimateLiters && estimateKmPerLiter`
props that `FuelLeakageStep` **never passes** (`FuelLeakageStep.tsx:92-100`), so every row
degrades to the generic *"Review stop-to-stop gaps or accept on this device"*. The
stop-to-stop bucket view is one collapse away, but its gap column is structurally zero
(H-1). There is no "charge this gap to the driver", no "attribute to company ops", no
"mark as fuel-card fraud", no link to fix the missing odometer. **[observed]**

### U-8 — Accepting unexplained fuel is a single-actor, unthresholded, instantly-consequential act  *(High)*
`POST /:id/leakage-review` (`fuel_period_routes.ts:1093-1120`) requires only
`transactions.edit`, takes an optional free-text note, checks **nothing** — not the period
status, not the amount, not a second approver — and writes `leakage_reviewed_at`. That
single field is the *only* real gate auto-close honours (§3.8). One click on
*"Mark reviewed & continue"* makes a $28,800 discrepancy eligible for automated lock by cron.
Meanwhile a $200,001 week needs two named humans to finalize. The control strength is
inverted relative to the risk. **[observed]**

### U-9 — Degraded data is invisible at the moment of decision  *(High)*
Trips can time out to `[]`, deadhead to `{}`, PA to `undefined` (C-5); trips can truncate at
15,000; fuel entries can truncate. The `dataTruncated` banner exists — **on the landing
page** (`FuelPeriodLandingPage.tsx:443-447`). Inside the wizard, on the Finalize screen,
where the operator signs, there is no provenance line at all. Nothing says
*"computed from 0 trips (fetch timed out)"*. **[observed]**

### U-10 — Step notes are ephemeral  *(Medium)*
`stepNotes` is component state. It reaches the server only when a note happens to be in the
textarea at the moment you press Continue (`persistStep(next, noteForStep)`) or accept
leakage. Otherwise it exists only in the downloaded evidence pack, and any remount (P-8),
navigation, or refresh discards it. For an audit artefact this is not durable. **[observed]**

### U-11 — "Days open" counts from the wrong end of the week  *(Low)*
`daysOpen(startDate)` measures from the week **start** (`:82-86`), but the week cannot be
worked until it ends (`isReconWeekSealed`). Every age is overstated by 6–7 days and the
`aging = age >= 14` amber border fires a week early. Your screenshot: *"7d open"* for a week
that became workable 2 days ago. **[observed]**

### U-12 — Tab selection is force-reset  *(Low)*
`useEffect(() => setTab(preferredTab), [preferredTab])` — if you are reading **Completed**
and a refresh changes which tab is "preferred", you are yanked away. **[observed]**

### U-13 — Stale and inconsistent copy  *(Low)*
*"accept on this device"* (it persists to the org now), *"Over-explained"* used for positive
residuals, *"beyond of spend"*, *"Locked / Pending / Draft"* status on settlement rows that
does not match the period's actual `status` enum (`open | in_review | ready | locked |
reopened`). **[observed]**

### U-14 — Accessibility  *(Medium)*
Reasonable baseline — `role="status"` / `role="alert"` on banners, `aria-label` on step
cells, `min-h-11` touch targets, `role="group"` on the chip row, `aria-hidden` on decorative
icons. Gaps: the money strip's tie lines are `role="status"` but the numbers themselves are
not in a live region, so a screen reader hears the verdict without the figures; the
`Sparkline` carries its label on the parent `<span>` rather than the graphic; the vehicle
`<select>` in the bucket view has no `<label>`; focus is not moved to the step heading on
step change (keyboard users using `j/k` lose their place); and there is no visible
focus-within treatment on `StepStatusCell`. **[observed]**

---

## 7. Correctness findings — can the close produce wrong results or fail partway?

**Yes, in eight distinct ways.** Each is stated as: mechanism → concrete failure → evidence.

### C-1 · The server persists client-computed money without recomputing or re-gating it
`POST /fuel/periods/:id/finalize` (`fuel_period_routes.ts:903-1043`) reads
`body.snapshots`, puts it straight into `cursor.snapshots`, and `processJobRow` stages each
one to KV and posts it to `financial_events` verbatim. Server-side checks before the money
moves are: period ended, no unapproved fuel txs, second approver if spend > threshold,
`If-Match` version. **Not checked server-side:** exception-tier fills, over-explained
residual, data-quality warnings, whether `driverShare + companyShare` even relates to
`totalGasCardCost`, whether the snapshot's entries exist, or whether the snapshot's week
matches the period's week.

> Any principal holding `transactions.edit` can `POST` a snapshot with an arbitrary
> `driverShare` and the ledger will accept it. And more likely in practice: a browser with
> stale, truncated or timed-out data (C-5, C-6) produces wrong numbers and the server has
> no way to tell. **[observed]**

### C-2 · The week statement can be published from a different engine than the one that was approved
`buildFuelSealAmountsByDriver(snapshots)` passes the approved numbers as `override`, and
`pickFuelCloseAmounts` maps `override` to `source: "consumption_strip"`. Then, at
`fuel_close_amounts.ts:67-74`:

```ts
if (amounts.source !== "fuel_week_rebuild" &&
    Math.abs(amounts.driverShare) < 0.005 &&
    input.fromRebuild &&
    Math.abs(input.fromRebuild.driverShare) > 0.005) {
  amounts = input.fromRebuild;          // ← Engine B silently wins
}
```

A **correct** `driverShare` of `0` — which Engine A produces routinely: company-covered
policy, `priceUnavailable`, floored negative misc, or a `Full` coverage rule — is treated as
a defect and replaced by Engine B's ratio answer.

> **Worked example, your screenshot week.** Engine A: spend $28,800, all unexplained, no
> resolved rule ⇒ `companyShare = 28,800`, `driverShare = 0`. Ledger posts
> `fuel_fleet_share = 28,800` and **no** `fuel_deduction`. At seal, the override has
> `driverShare = 0`, so the trailing rule swaps in Engine B, which with the default 50%
> company rule publishes `driverShare = 14,400` as a **`closed`** statement.
> The driver's ledger says they owe $0. The week statement Close Week and the P&L read says
> they owe $14,400. Neither the close invariants nor `statementEngineCompare` can catch it,
> because the "fresh engine recompute" they compare against **is Engine B**. **[observed code; inferred runtime figures — confirm via §13 Q3]**

`isSuspiciousFuelRebuild` guards the mirror-image case (rebuild zeroing a real driver share)
and was clearly written after someone hit exactly this class of bug. The other direction
was left open.

### C-3 · Auto-close bypasses every hard block the UI enforces
`POST /fuel/periods/auto-close` gates on, in order: `|unexplained| <= ε || leakage_reviewed_at`
→ `Σ counts[*].actionable === 0` → no unapproved fuel txs → calendar week ended.

- Gate 2 is **inert**: `counts` has no writer (§4.3). Always `0`.
- Exception-tier fills: **not checked**.
- Over-explained residual: **not checked**.
- Open disputes: **not checked**.

So the exact week the wizard refuses to finalize — *"Can't finalize — over-explained week"*,
no override possible — becomes auto-close-eligible the instant an operator clicks
*"Mark reviewed & continue"* on the Unexplained step, which the UI offers with no warning
and no permission distinction. The C-2 hard block from the previous audit is bypassable by
design through the cron path. **[observed]**

Worse, when auto-close finds no staged snapshots it builds them with **Engine B**, whose
`miscellaneousCost` is `0` unless `categoryCosts` is supplied — and
`assembleSnapshotsWithScenarios` never supplies it (`weekSnapshotEngine.ts:205-206`). So the
$28,800 discrepancy is recorded, permanently, as **$0.00 unexplained** in the closed
period, the KV snapshot, and the week statement (H-11). **[observed]**

### C-4 · Freeze mixes a partial-week spend denominator with full-week category costs
`fuelFinalizeService.ts:188`:
```ts
const settleForSnap = relevantEntries.length ? relevantEntries : weekEntries;
```
`relevantEntries` is the **settle pool** — `reconciliationStatus === 'Pending'` only (when
there is no prior snapshot). `freezeReportMoneyThroughAssembler` then computes
`totalGasCardCost = Σ(settleForSnap.amount)` (`weekSnapshotEngine.ts:147-153`) while taking
`categoryCosts` from the **full-week** report (`fuelFinalizeWeekSnapAdapter.ts:44-57`).

`assembleLeftoverWeekMoney` computes
`misc = totalSpend_partial − categories_fullWeek`.

> **Failure:** a week with $10,000 of fills, of which $6,000 were already Verified by the
> Review Queue and $4,000 are Pending. Engine A says rideShare $7,000 / personal $2,500 /
> misc $500. The freeze computes `misc = 4,000 − 9,500 = −5,500`, floors it to 0 for the
> split, reports `miscellaneousCost = −5,500`, and derives `companyShare`/`driverShare` from
> a $4,000 base. The snapshot that hits the ledger and the statement carries a **$5,500
> phantom over-explained residual** and shares computed off 40% of the week's spend. The
> operator approved none of those numbers. **[observed code; inferred arithmetic]**
>
> Secondary effect: `aggregateFinalizedForWeek` sums `miscellaneousCost` into the period's
> `unexplained` column, so the landing KPI inherits the phantom.

### C-5 · Soft timeouts silently change the money
`buildFuelWeekReportsForFinalize` (`:190-235`) wraps three money-bearing dependencies in
`withSoftTimeout`, each resolving to an **empty fallback** with only a `console.warn`:

| Dependency | Timeout | Fallback | Consequence |
|---|---|---|---|
| trips | 20 s | `[]` | `totalTripDistance = 0` ⇒ `rideShareCost = 0` ⇒ all km become personal/residual ⇒ driver share and unexplained both wrong |
| deadhead map | 15 s | `new Map()` | deadhead km collapse into personal |
| Personal Allowance ctx | 20 s | `undefined` | the driver's earned allowance is not applied — they are charged for personal km the policy says the company absorbs |
| brain classify | 25 s | `undefined` | falls back to legacy residual attribution |

The file *already knows* this is dangerous — line 185:
`"[] from a parent still loading must not skip fetch — that zeros ride-share and dumps km
into personal/deadhead."` That guard covers the *props* case. The *timeout* case produces
the identical corruption and is unguarded. A slow network is enough. **[observed]**

### C-6 · Fuel-card context is absent in the exact scope the hub uses
`loadData(scope: 'recon')` returns at `FuelManagement.tsx:604-623` **before** fuel cards are
fetched. Cards load only under `scope: 'full'` (the *Card Inventory* tab). Opening
`Week Reconciliation → Fuel` uses `recon`.

`resolveFuelFillDriver` (`resolveFuelFillDriver.ts:86-92`) resolves a fill's driver in
priority order: explicit → **gas-card holder at fill time** → trip proximity → vehicle
assignment history → `currentDriverId` → unassigned. With `fuelCards = []` the second tier
is skipped entirely.

> **Failure:** on a shared car, fills that belong to the card-holder get re-attributed by
> *nearest same-day trip*. Driver-week grouping changes → which policy applies changes →
> `driverShare` changes → who is charged changes. **The same week produces different money
> depending on whether you visited the Card Inventory tab first.** And `handleFinalize`
> passes the same empty `cards` into `finalizeFuelWeekReports`
> (`FuelManagement.tsx:1313`), so the wrong attribution is what gets locked. **[observed]**

### C-7 · An under-explained week is hard-blocked with the wrong diagnosis and no exit
`isOverExplainedFuelWeek(spend, misc)` = `|misc| > 0.25 × spend`
(`fuelFinalizeGate.ts:29-38`) → `listOverExplainedBlockers`
(`fuelFinalizeGating.ts:80-96`) → `hasOverExplainedBlockers` → `handleFinalizeClick`
returns early, **and the ack checkbox explicitly cannot override it**
(`FuelPeriodWizard.tsx:494-500`).

The abs makes no distinction between the two residual signs, which are opposite problems:

| misc | Meaning | Correct response |
|---|---|---|
| **negative** | modelled category costs exceed spend — an *artefact*, fleet-owes | fix efficiency/odometer inputs; never charge it. **Hard block is right.** |
| **positive** | fuel was bought that no category explains — *possibly real cash loss* | investigate, attribute, charge, or accept with reason. **Hard block is wrong.** |

For a `priceUnavailable` week — no litres recorded — every category cost is forced to `0`
(`fuelCalculationService.ts:365-377`), so `misc ≡ spend`, so `|misc| = spend > 0.25 × spend`
**always**. Every litres-less week is permanently unfinalizable through the UI, with a
message that says the opposite of the truth, and with nothing in the section that lets an
operator enter the missing litres and clear it.

> Your screenshot is this case. Spend $28,800, unexplained $28,800, one vehicle, `2 to
> review`, and a Finalize step that will not finalize. **[observed code; screenshot consistent]**

### C-8 · Partial money commit is never compensated
`processJobRow` (`fuel_period_routes.ts:449-482`) commits money **one driver at a time**.
On a failure at driver *k* it sets the period back to `ready`, fails the job, and returns —
leaving drivers `1..k-1` with live `financial_events`, live enterprise wallet sync, and a
rebuilt `driver_financial_periods` row **for a week that is not closed**.

No compensating reversal. No alert. No `finalize_partial` audit row (that path exists for
*staging* failures at `:417-427`, but not for money-commit failures). The operator sees
`money_commit_failure` in a toast and the week back in Outstanding.

> Recovery is possible — a re-run is idempotent, and Reopen reverses — but *only if someone
> knows to do it*. Until then, those drivers' balances reflect a charge for an open week,
> and the Expenses screen shows it as posted. **[observed]**

---

## 8. Findings table

Sortable by Severity (Critical → High → Medium → Low). Effort: **S** ≤ 1 day · **M** 2–5 days · **L** 1–3 weeks · **XL** > 3 weeks.

| ID | Sev | Category | Evidence (file:line) | Impact | Recommendation | Effort |
|---|---|---|---|---|---|---|
| **C-1** | Critical | Architecture / Trust | `fuel_period_routes.ts:903-1043`, `:359-482` | Ledger accepts unverified client money; every client-side defect becomes a permanent posting | Recompute snapshots server-side from canonical data; accept client snapshots only as a *proposal* to diff against, and refuse on mismatch > ε | L |
| **C-2** | Critical | Correctness | `fuel_close_amounts.ts:67-74`; `fuel_week_seal.ts:229-235`; `fuel_week_engine.ts:117-151` | Fuel week statement can differ from the approved week and from the ledger; Close Week and P&L consume the wrong number | Delete the trailing rebuild-preference rule. Make `fuel_week_rebuild` a **draft-only** source until Engine B can reproduce Engine A. Add a seal-time assertion `statement.driverShare ≈ Σ active fuel_deduction` | M |
| **C-3** | Critical | Governance | `fuel_period_routes.ts:1319-1345`; `counts` has no writer (grep) | Cron locks weeks the UI refuses; over-explained/exception/dispute blocks bypassed; residual recorded as $0 | Move the full gate set into one shared server predicate called by **both** HTTP finalize and auto-close. Either write `counts` server-side or delete the check — an inert gate is worse than none | M |
| **C-4** | Critical | Correctness | `fuelFinalizeService.ts:188`; `fuelFinalizeWeekSnapAdapter.ts:44-57`; `weekSnapshotEngine.ts:147-153` | Mixed-status weeks freeze shares against a partial spend base and emit a phantom negative residual | Scale category costs to the settle pool, or freeze against full-week spend and post only the settle-pool proportion. Add a freeze invariant: `|Σ categories + misc − totalSpend| ≤ ε` | M |
| **C-5** | Critical | Correctness | `buildFuelWeekReportsForFinalize.ts:69-84, 190-235` | Network slowness silently changes driver charges; no operator signal | Make every fallback **poison the result**: return `degraded: {trips, deadhead, pa}` and hard-block Finalize while any flag is set; surface it on the Finalize screen | S |
| **C-6** | Critical | Correctness | `FuelManagement.tsx:604-623, 1313`; `resolveFuelFillDriver.ts:86-92` | Fill→driver attribution and gas-card/cash split change with navigation order; wrong driver charged | Add `fuelCards` to the `recon` scope (they are small), and assert non-empty before finalize when any entry carries a `cardId` | S |
| **C-7** | Critical | Correctness / UX | `fuelFinalizeGate.ts:29-38`; `fuelFinalizeGating.ts:80-96`; `fuelCalculationService.ts:365-377` | Every litres-less week is permanently unfinalizable, diagnosed backwards, with no remedy | Split the gate: `overExplained` (misc < 0) stays a hard block; `underExplained` (misc > 0) becomes a **reviewable** blocker requiring a typed reason + optionally a second approver. Add a "missing litres" data-fix path | M |
| **C-8** | Critical | Failure mode | `fuel_period_routes.ts:449-482` | Half-posted ledger on an open week, no reversal, no alert | Wrap the money loop in a compensating transaction: on any failure, reverse every already-committed driver in this run, then hold at `ready` with a `finalize_money_partial` audit row and an alert | M |
| **H-1** | High | Dead control | `fuelCalculationService.ts:1141-1144`; `settlementService.ts:438`; `fuelSpineGolden5179KZ.test.ts:71` | `unaccountedDistance ≡ 0` ⇒ gap anomalies, severe-gap Red health, and the entire mileage-leakage deduction feature never fire; the golden test asserts a trivial bound | Define `personalDistance` from evidence (adjustments / brain), not as the residual, so the residual can be non-zero — or delete the gap feature and its test honestly | M |
| **H-2** | High | Bug | `FuelLeakageStep.tsx:44,61`; `FuelPeriodWizard.tsx:828-848` | Over-explained alarm on every non-zero residual; broken copy; contradicts the real gate on the same screen | Pass `totalSpend={strip.totalSpend}`; make the prop required | S |
| **H-3** | High | Dead control | `FuelWeekMoneyStrip.tsx:64-66` | Green ✓ next to an identity that is arithmetically false | Pick the correct identity per regime and show it; never `||` two mutually exclusive assertions behind one label | S |
| **H-4** | High | Integrity | `fuelPeriodServerMerge.ts:47-79`; `fuel_period_routes.ts:100,594` | Landing chips are fabricated; "Data quality: Done" on a week with exception fills | Compute and persist `counts` server-side at `materialize`/`recompute`, or render "not evaluated" instead of "Done" | M |
| **H-5** | High | Trust | `fuel_period_routes.ts:841-901` | Client writes the SQL read-model money; the hub KPI is client-authored (`computed_from_hash: "client:…"`) | Make `/materialize` server-computed, or restrict it to non-money fields and derive money from snapshots only | M |
| **H-6** | High | Governance | `fuel_period_routes.ts:310-333, 946-972` | A single historic `second_approve` row satisfies all later finalizes of that period; `allowServiceSecondApprove` in the request body lets bulk finalize self-approve high-spend weeks | Scope approvals to `(period_id, version, spend bucket)`; require them to post-date the current version; remove the client-settable service-approve flag | S |
| **H-7** | High | Silent omission | `fuel_week_seal.ts:193-208` | A driver with fuel spend but no `driver_financial_periods` row for the anchor gets **no** fuel statement | Drive the seal from the union of DFP rows and snapshot driver ids; assert coverage before returning `published` | S |
| **H-8** | High | Failure mode | `fuel_period_routes.ts:501-514` | Seal failure is swallowed; a locked fuel week can exist with no statement, blocking Close Week later with no obvious cause | Keep it non-fatal, but raise an alert and expose `fuelSealError` on the period row so the landing card can show "statement missing — retry seal" | S |
| **H-9** | High | Silent omission | `fuelFinalizeService.ts:145-148` | `continue` drops a driver from `snapshots`; period money under-reports and the seal loses that driver's override, falling through to Engine B | Emit an explicit "no-op, unchanged" snapshot or record the skip; never silently shrink the batch | S |
| **H-10** | High | Correctness | `fuelCoverageSplit.ts:59-138`; `fuel_week_engine.ts:64-74` | No rule ⇒ 100% company (fail-open). Unknown `coverageType` is treated as `Fixed_Amount` in `splitAllCategoryCosts` but as "all company" in `getCategoryCoverageSplit`. Server picks `scenarios[0]` when no default and ignores policy **versions** | Make an unresolved or unknown rule a **blocker**, not a default. Unify on `resolveDriverVersionForWeek` on both sides | M |
| **H-11** | High | Correctness | `weekSnapshotEngine.ts:196,205-206`; `fuel_period_routes.ts:164-200` | Auto-closed and rebuild-sourced weeks record `unexplained = 0` regardless of the real residual | Never publish a snapshot without `categoryCosts`; if the server cannot compute them, refuse to auto-close | M |
| **H-12** | High | Security / RBAC | `fuel_period_routes.ts:904, 1047, 1095, 1172` | Week lock, reopen, and unexplained-acceptance are all gated on `transactions.edit`; `PATCH /step` (a write) is gated on `fuel.view` (a read) | Introduce `fuel.finalize`, `fuel.reopen`, `fuel.accept_unexplained`; gate `/step` on an edit permission | S |
| **H-13** | High | Failure mode | `fuel_period_routes.ts:565-579` | Reopen deletes the KV snapshot even when the ledger reversal threw | Only delete after a confirmed reversal; otherwise fail the job and keep the evidence | S |
| **P-2** | High | Performance | `fuelPaidByDriver.ts:114-154`; `resolveFuelFillDriver.ts:35-70` | O(reports × entries × trips) per render; the dominant client cost | Precompute attribution **once** per week into `Map<entryId, driverId>` and index trips by `(vehicleId, ymd)` | M |
| **P-3** | High | Performance / Scale | `kv_store.tsx:176-201`; `fuel_period_routes.ts:44`; `fuel_period_build_snapshots.ts:51` | Whole-prefix scans of `transaction:` and `fuel_entry:` on the close path; grows without bound | Push org + date into SQL (the `fleet.*` tables already exist per the KV header comment); index `(org_id, date)` | M |
| **P-1** | High | Performance | `FuelManagement.tsx:248-338`; `FuelReconciliationDashboard.tsx:48-119` | Whole dataset in props; every change re-renders the tree | Move week data to a scoped query hook owned by the wizard; pass ids, not arrays | L |
| **P-4** | High | Performance | `fuel_week_seal.ts:150-157`; `statement_engine_probe.ts:27` | Probe rebuilds the whole week per driver | Hoist the rebuild map into the probe caller, as `sealFuelWeek` already does | S |
| **U-1** | High | UX | `FuelPeriodLandingPage.tsx:401` | The headline leakage KPI can read $0 while two weeks are ±$50k | Show gross Σ\|x\| as the headline with signed under/over beneath | S |
| **U-3** | High | UX | `FuelPeriodLandingPage.tsx:147-157` | Card promises "N to review" for a week the wizard refuses | Add a `blocked` card state with the reason and the fix route | S |
| **U-7** | High | UX | `FuelLeakageStep.tsx:92-100`; `FuelGapAttribution.tsx:55-64` | Unexplained fuel can only be accepted, never resolved; the km-estimate branch is dead | Pass `estimateLiters`/`estimateKmPerLiter`; add explicit dispositions (charge driver / company ops / fraud / data fix) | M |
| **U-8** | High | Governance | `fuel_period_routes.ts:1093-1120` | One actor, no threshold, no checks — and it is the only gate auto-close honours | Require a typed reason, a magnitude threshold with a second approver, and a period-status check | S |
| **U-9** | High | UX / Trust | `FuelPeriodLandingPage.tsx:443`; `buildFuelWeekReportsForFinalize.ts:190` | Data degradation invisible at the point of signature | Add a provenance block to the Finalize step: trips N (complete/truncated/timed-out), deadhead, PA, cards, price source per vehicle | S |
| **P-6** | Medium | Performance / Integrity | `fuel_week_engine.ts:153-173` | All-zero classify per driver; fabricated `metadata.brain` in a permanent record | Delete it, or feed it real inputs | S |
| **P-7** | Medium | Performance | `fuelFinalizeService.ts:82` | Unbounded `getFinalizedReports()` per finalize | Always pass a week-scoped `priorReports` | S |
| **P-8** | Medium | Performance | `FuelReconciliationDashboard.tsx:215`; `useFuelWizardDerived.ts` | Remount discards approval state and re-fires hydrate; 11 collections recompute on identity change | Drop `initialStepId` from the remount key; stabilise inputs | M |
| **P-9** | Medium | Performance | `FuelManagement.tsx:478-730` | Sequenced-but-not-reduced mount waterfall | One `GET /fuel/weeks/:weekStart/bundle` returning everything the wizard needs | L |
| **U-10** | Medium | UX / Audit | `FuelPeriodWizard.tsx:170-171, 384-397` | Step notes lost on remount/refresh; audit artefact not durable | Persist every note to `fuel_period_audit` on blur | S |
| **U-14** | Medium | Accessibility | `FuelWeekMoneyStrip.tsx:94-99`; `FuelLeakageStep.tsx:122-134` | Tie verdicts announced without figures; unlabelled select; no focus move on step change | Wrap the strip figures in the live region; label the select; move focus to the step heading | S |
| **P-5** | Low | Performance | `fuel_week_engine.ts:195-199` | Whole-table vehicle scan, result unused | Remove | S |
| **U-11** | Low | UX | `FuelPeriodLandingPage.tsx:82-86` | Age and aging badge overstated by a week | Measure from `endDate` | S |
| **U-12** | Low | UX | `FuelPeriodLandingPage.tsx:395-397` | Tab selection force-reset | Only auto-switch before first user interaction | S |
| **U-13** | Low | UX | multiple | Stale/incorrect copy | Copy pass | S |
| **R-1** | High | Redundancy | `fuelWeekSnapshotParity.test.ts`, `fuelPeriodBuildSnapshots.parity.test.ts` | Both "parity" tests compare fuel-core assemblers to each other — Engine B vs Engine B. The real divergence is unguarded | Add an A↔B golden fixture test with a real `tsconfig`-checked comparison; wire into CI | M |
| **R-2** | Medium | Redundancy | `fuelPeriodStatus.ts:176-268`; `fuelPeriodServerMerge.ts:163-169` | A full client period model whose `locked` is hardcoded `false` and which is discarded for any week SQL knows about; `overlayServerFuelPeriods` is a dead alias | Reduce derive to "weeks with no server row"; delete the alias | S |
| **R-3** | Medium | Redundancy | `fuel_period_build_snapshots.ts:65`, `fuel_week_engine.ts:117`, `fuelFinalizeWeekSnapAdapter.ts:81` | Three entry points into the same assembler with different context completeness — the money differs by entry point | One constructor that **requires** `categoryCosts` | M |
| **R-4** | Low | Redundancy | `fuelCalculationService.ts:992-1006`; three policy resolvers | Deprecated `generateFleetReport` still exported; inconsistent policy resolution | Delete the deprecated export; one resolver | S |

---

## 9. Quick wins (1–3 days)

Ordered so that each one makes the next safer. Nothing here changes the money model.

| # | Fix | ID | Why first |
|---|---|---|---|
| 1 | Pass `totalSpend={strip.totalSpend}` to `FuelLeakageStep`; make the prop required | H-2 | One line. Removes a false alarm your operators see every week. |
| 2 | Add `fuelCards` to `loadData(scope: 'recon')` | C-6 | One line. Stops navigation order from changing the money. |
| 3 | Make `withSoftTimeout` fallbacks poison the result; hard-block Finalize while `degraded` is set | C-5 | Small. Closes the "slow network silently changed the charge" hole. |
| 4 | Fix the money-strip tie assertion | H-3 | Small. A green ✓ on a false identity is the worst failure mode a money-clarity strip has. |
| 5 | Delete the trailing rebuild-preference rule in `pickFuelCloseAmounts` | C-2 (partial) | ~6 lines. Immediately stops Engine B from overwriting an approved zero. |
| 6 | Make `fuel_week_rebuild` publish `status: 'draft'`, not `'closed'` | C-2 (partial) | One line. Turns a silent substitution into a visible close blocker. |
| 7 | Gate auto-close on exception fills + over-explained, reusing `evaluateFuelFinalizeGating`'s server twin | C-3 (partial) | Medium-small. Closes the cron bypass before anything else changes. |
| 8 | Delete or fix the inert `counts.actionable` gate | C-3, H-4 | Small. An inert gate manufactures confidence — worse than none. |
| 9 | Hoist the rebuild map in `statement_engine_probe` | P-4 | 3 lines, removes an O(n²) server call. |
| 10 | Delete `attachBrainHints` and `loadOrgVehicles` | P-5, P-6 | Removes a whole-table scan and fabricated audit metadata. |
| 11 | Pass week-scoped `priorReports` from `handleFinalize` | P-7 | 1 line, removes an unbounded fetch from the close path. |
| 12 | Add `fuelSealError` to the period row + a landing badge | H-8 | Small. Makes "locked but unstatemented" visible instead of log-only. |
| 13 | Switch the "Unexplained (open)" KPI to gross with signed sub-totals | U-1 | Small. Your headline number currently hides offsetting weeks. |
| 14 | Measure `daysOpen` from `endDate` | U-11 | 1 line. |

---

## 10. Strategic improvements (1–2 quarters)

### Q1 — Make the close server-authoritative

1. **One engine.** Port Engine A into `packages/fuel-core` as a pure, isomorphic function
   with an explicit input contract (`entries, trips, odometer anchors, adjustments, policy
   version, PA config, deadhead, price`) and no I/O. Delete Engine B's money math; keep its
   loaders as the server's input adapter.
2. **Server recompute at finalize.** `POST /:id/finalize` recomputes the week from canonical
   data, diffs against the client's proposed snapshots, and **refuses** on any delta > ε with
   a per-driver, per-field explanation. The client snapshot becomes a signed statement of
   what the operator saw, not the source of the money. (C-1, C-2, C-4)
3. **One gate function.** `evaluateFuelWeekClosable(weekContext) → Blocker[]` in fuel-core,
   called by: the wizard, the HTTP finalize route, the auto-close cron, and the bulk dialog.
   Four call sites, one definition. (C-3)
4. **Compensating money commit.** Wrap the per-driver commit loop in a saga with explicit
   reversal on failure, a `finalize_money_partial` audit row, and an alert. (C-8)
5. **Non-tautological parity test in CI.** A golden fixture week exercised through Engine A
   and through the server path, asserting equality on `totalSpend`, `companyShare`,
   `driverShare`, `miscellaneousCost` — plus a **deliberately divergent** fixture proving the
   test can fail. Copy the shape of the settlement audit's
   `'deliberately mismatched statement amounts block close (non-tautological)'` test. (R-1)

### Q2 — Make unexplained fuel a workflow, not a number

6. **Residual taxonomy.** Replace the single `misc` with typed dispositions persisted per
   vehicle-week: `missing_odometer`, `missing_litres`, `untracked_company_ops`,
   `driver_personal_unlogged`, `suspected_card_misuse`, `accepted_variance`. The Unexplained
   step becomes a queue where each row must be dispositioned; "accept" is one option with a
   reason, not the only one. (C-7, U-7, U-8)
7. **Data-fix affordances inline.** Missing litres, missing odometer, unassigned fill,
   missing trip — each resolvable without leaving the wizard.
8. **Real gap detection.** Redefine `personalDistance` from evidence so `unaccountedDistance`
   can be non-zero, which revives gap anomalies, severe-gap health, and the deduction
   recommendation the settlement service already knows how to consume. (H-1)
9. **Provenance on the signature screen.** Trips complete/truncated/timed-out, deadhead
   source, PA applied, cards loaded, price source per vehicle, policy version per driver —
   displayed where the operator signs and frozen into the evidence pack. (U-9)

### Q3 — Scale and performance

10. **Week bundle endpoint.** `GET /fuel/weeks/:weekStart/bundle` returning the derived week
    (reports, blockers, counts, provenance) computed server-side. The wizard becomes a
    renderer. Kills P-1, P-2, P-9 and makes the mount cost one request. (L)
11. **Retire KV prefix scans on the money path.** The `kv_store.tsx` header already declares
    the fleet-table cutover; finish it for `fuel_entry:` and `transaction:` with
    `(org_id, date)` indexes. (P-3)
12. **Persist `counts` server-side** at `materialize`/`recompute` so landing chips and the
    auto-close gate read the same computed truth. (H-4, C-3)

### Q4 — Governance

13. **Fuel-specific permissions** with separation of duties: `fuel.finalize`, `fuel.reopen`,
    `fuel.accept_unexplained`, `fuel.second_approve`. (H-12)
14. **Version-scoped approvals.** (H-6)
15. **Continuous reconciliation.** A nightly job asserting, for every closed fuel week:
    `statement.driverShare ≈ Σ active fuel_deduction` and
    `statement.companyShare ≈ Σ active fuel_fleet_share`, persisting drift to
    `ledger.finance_recon_drift` — the mechanism `statementEngineCompare` already
    established for the other lanes, applied to the fuel↔ledger axis that is currently
    unchecked.

---

## 11. Proposed architecture

**Verdict: do not rewrite. Re-anchor.** The pieces are built; they are anchored to the wrong
authority. Three changes move the anchor without touching the UI shape.

### 11.1 Target

```
                    ┌──────────────────────────────────────────────┐
                    │  fuel-core: computeFuelWeek(input) → WeekCalc │  ONE engine, pure
                    │  fuel-core: evaluateFuelWeekClosable(WeekCalc)│  ONE gate
                    └───────┬──────────────────────────┬───────────┘
        browser (display)   │                          │   server (authority)
                            ▼                          ▼
        ┌────────────────────────────┐   ┌──────────────────────────────────┐
        │ GET /fuel/weeks/:ws/bundle │◄──┤ canonical loaders (SQL, indexed) │
        │  reports · blockers ·      │   └──────────────┬───────────────────┘
        │  counts · provenance       │                  │
        └──────────┬─────────────────┘                  │
                   │ operator reviews, dispositions,    │
                   │ approves → POST /finalize          │
                   │   { reviewedHash, dispositions }   │
                   ▼                                    ▼
        ┌──────────────────────────────────────────────────────────┐
        │ finalize: recompute → diff vs reviewedHash → refuse on Δ  │
        │ → saga: stage all → commit all (compensating on failure)  │
        │ → lock → seal (from the SAME WeekCalc) → assert vs ledger │
        └──────────────────────────────────────────────────────────┘
```

**Key inversion:** the client sends a **hash of what was reviewed plus the operator's
dispositions**, not the money. The server recomputes, proves the operator reviewed *this*
week state, and only then posts. That single change resolves C-1, C-2, C-4, and the C-5/C-6
class (degraded client data can no longer reach the ledger — it can only cause a refusal).

### 11.2 Trade-offs

| Benefit | Cost |
|---|---|
| Money has one definition and one authority | `computeFuelWeek` must be genuinely isomorphic — no `import.meta.env`, no DOM, no `date-fns` drift between Node and Deno. The `_shared/fuelCore.ts` mirror pattern already in this repo handles this; the Deno drift test must cover the new surface. |
| Close becomes provable (recompute + diff + ledger assertion) | Finalize gets slower — server recompute plus ledger assertions. Budget ~2–4 s for a typical week; keep it in the existing job model so it stays async. |
| Client becomes a renderer; P-1/P-2/P-9 largely evaporate | The wizard's optimistic local recompute goes away; every "what if" needs a round trip. Mitigate with a `POST /fuel/weeks/:ws/preview` that recomputes with proposed dispositions applied. |
| Auto-close and UI can no longer diverge | Weeks currently auto-closing will start refusing. **This is the point**, but it will look like a regression on day one — hence Phase 0 below. |
| `counts`, statements and chips all derive from one `WeekCalc` | One more persisted artefact per week. Small. |

### 11.3 Migration path (no UI rewrite, no big bang)

**Phase 0 — Characterisation (1 week, non-negotiable).**
Snapshot `WeekCalc` for the last 26 weeks × every driver, from Engine A *and* Engine B, into
a golden fixture file. Every later phase changes numbers; without this baseline you cannot
tell an intended change from a regression. This is the same Phase 0 that made the last two
audits tractable — do not skip it because the fixes look small.

**Phase 1 — Quick wins (§9), flag-free.** No money-model change. Ship.

**Phase 2 — Engine unification behind `FUEL_SERVER_ENGINE=shadow`.**
Server computes `WeekCalc` on every finalize and **logs the diff vs the client snapshot**
without acting on it. Persist diffs to `ledger.finance_recon_drift` with
`domain: 'fuel_engine'`. Run for four weeks. Expect noise; the diff distribution is your
real test plan.

**Phase 3 — `FUEL_SERVER_ENGINE=enforce`.**
Server refuses on diff > ε. Keep a break-glass `X-Fuel-Force-Client-Money` header requiring
`fuel.finalize` + an audit reason, for the first two weeks only, then remove it.

**Phase 4 — One gate.** Replace the four gate implementations with
`evaluateFuelWeekClosable`. Auto-close inherits the full gate set. Expect auto-close volume
to drop — that is the fix, not a regression.

**Phase 5 — Residual taxonomy + dispositions.** The only phase that changes the UI, and it
changes one step (Unexplained) plus one card state.

**Phase 6 — Bundle endpoint + KV retirement.** Performance, no behaviour change.

**Rollback:** every phase is a flag or a route-level switch. Phase 3 is the only
irreversible-feeling one, and `reopen` already reverses a close cleanly.

---

## 12. Instrumentation and validation plan

### 12.1 Prove each fix

| ID | Proof it worked | Where |
|---|---|---|
| C-1 | Golden fixture: POST a snapshot with `driverShare` tampered by +$1,000 → expect `422 SNAPSHOT_MISMATCH`, zero `financial_events` written | Deno integration test |
| C-2 | Fixture week where Engine A yields `driverShare = 0` → assert the published statement is `0` and `status` reflects the real source. Plus a nightly assertion `statement.driverShare ≈ Σ fuel_deduction` for every closed week | Deno test + cron |
| C-3 | Fixture: week with one unacknowledged exception fill + `leakage_reviewed_at` set → auto-close must return `skip_exception_fills`. **Assert the skip, not the lock** | Deno test |
| C-4 | Fixture: 60% Verified / 40% Pending week → assert `Σ categories + misc == totalSpend` on the frozen snapshot and that `misc` matches the full-week residual | vitest |
| C-5 | Mock a trip fetch that never resolves → assert `degraded.trips === true` and that Finalize is disabled | vitest + RTL |
| C-6 | Mount the hub directly, assert `fuelCards.length > 0` before the wizard's first report build | RTL |
| C-7 | Fixture: `misc > 0` at 100% of spend → assert blocker `kind: 'under_explained'`, `reviewable: true`; `misc < 0` → `kind: 'over_explained'`, `reviewable: false` | vitest |
| C-8 | Fixture: 3 drivers, driver 2's money commit throws → assert **zero** active fuel events for all three afterwards, period `ready`, `finalize_money_partial` audit row present | Deno test |
| H-1 | Fixture with a real 50 km gap → assert `unaccountedDistance ≈ 50` and a non-zero `deductionRecommendation`. Replace the trivial `<= dist*0.1` assertion | vitest |
| H-2/H-3 | Snapshot tests asserting the exact rendered strings | RTL |
| H-4 | After `materialize`, assert `counts` is non-empty and matches `evaluateFuelWeekClosable` | Deno test |
| R-1 | A↔B parity fixture **plus** a deliberately divergent fixture that must fail | CI |

**The rule from your last two audits, restated:** before calling any of these done, ask
*"what input would make this control fail, and have I written that input as a test?"*
Four controls in this section currently have no such input (§4.3).

### 12.2 Runtime telemetry to add

| Metric | Target | Alert |
|---|---|---|
| `fuel.finalize.duration_ms` p95 | < 30 s | > 60 s |
| `fuel.finalize.engine_diff_abs` p99 | $0 | any > $1 after Phase 3 |
| `fuel.finalize.outcome` | `locked` / `refused_gate` / `refused_diff` / `partial_money` | any `partial_money` pages |
| `fuel.statement.ledger_delta` nightly | $0 | any > $1 |
| `fuel.week.degraded_inputs` | 0 | any at finalize time |
| `fuel.autoclose.skip_reason` histogram | — | `skip_actionables` staying at 0 after Phase 4 means the gate is still inert |
| `fuel.wizard.time_to_interactive` p95 | < 2.5 s | > 5 s |
| `fuel.wizard.INP` p95 | < 200 ms | > 500 ms |
| `fuel.kv.prefix_scan_rows` per finalize | < 5,000 | > 50,000 |

### 12.3 Proposed SLOs (none exist today — A5)

| Surface | Target |
|---|---|
| Landing first paint (server rows) | p95 < 1.2 s |
| Wizard open → money strip rendered | p95 < 2.5 s |
| Step change INP | p95 < 200 ms |
| Finalize enqueue → `locked` | p95 < 30 s, p99 < 90 s |
| Auto-close run, 50 periods | p95 < 5 min |
| **Close correctness** | **100% — zero engine diff, zero statement/ledger delta, zero partial commits.** This is the one with no error budget. |

---

## 13. Open questions and what to collect next

### 13.1 Questions only you can answer

1. **Is the screenshot week real?** One vehicle, $28,800 spend, $28,800 unexplained. If yes,
   it is a `priceUnavailable` week and C-7 is blocking you right now.
2. **How do fills normally get their litres?** Driver app, JAA statement import, or manual?
   If litres are routinely absent, C-7 is not an edge case — it is the common path, and the
   remediation priority changes.
3. **Has auto-close ever locked a week?** Check `fuel_period_audit` for `action='auto_close'`
   with `payload.ok = true`. If yes, C-3 and H-11 have already produced closed weeks with
   `unexplained = 0` and Engine B money.
4. **Do you run the cron at all?** If `FLEET_CRON_SECRET` is unset in production, C-3's
   blast radius is zero today and the fix drops from Critical to High.
5. **What is `fuelSecondApproverThreshold` set to, and `fuelDualApprovalUiMode`?**
   `service_only` means H-6 is live today.
6. **Is `FUEL_BUILD_SNAPSHOTS_ENGINE` set?** `entries` forces the flat-50% path for every
   server build.
7. **Is `PROJECTION_READS_WEEK_STATEMENTS` still true?** If so, C-2's wrong statement
   propagates into the projection and the P&L.
8. **How many drivers and vehicles are in a typical week?** Drives every §5 severity.
9. **Do you want the current UI kept?** §11 assumes yes and changes only the Unexplained step.

### 13.2 Data to collect (concrete queries)

```sql
-- Q1 How many closed fuel weeks carry unexplained = 0 while the snapshot says otherwise?
select p.week_start, p.unexplained, p.computed_from_hash, p.status
from fuel_reconciliation_period p
where p.status = 'locked' and p.org_id = :org
order by p.week_start desc limit 52;

-- Q2 Which closed weeks were auto-closed, and with what result?
select a.period_id, a.at, a.payload
from fuel_period_audit a
where a.action in ('auto_close','finalize_partial','second_approve')
  and a.org_id = :org
order by a.at desc limit 200;

-- Q3 THE BIG ONE — does the fuel statement agree with the ledger? (C-2 proof)
with stmt as (
  select driver_id, week_key,
         (amounts_minor->>'driverShare')::bigint  as stmt_driver_minor,
         (amounts_minor->>'companyShare')::bigint as stmt_company_minor,
         close_reason
  from week_statements
  where kind = 'fuel' and organization_id = :org and status = 'closed'
), led as (
  select driver_id, period_anchor as week_key,
         sum(case when event_type = 'fuel_deduction'   then -amount_minor else 0 end) as led_driver_minor,
         sum(case when event_type = 'fuel_fleet_share' then -amount_minor else 0 end) as led_company_minor
  from financial_events
  where domain = 'fuel' and reverses_event_id is null and reversed_at is null
  group by 1,2
)
select s.week_key, s.driver_id, s.close_reason,
       s.stmt_driver_minor, l.led_driver_minor,
       s.stmt_driver_minor - coalesce(l.led_driver_minor,0) as driver_delta_minor
from stmt s left join led l using (driver_id, week_key)
where abs(s.stmt_driver_minor - coalesce(l.led_driver_minor,0)) > 1
order by abs(s.stmt_driver_minor - coalesce(l.led_driver_minor,0)) desc;
-- Any row here is C-2 in production. `close_reason` tells you which engine won.

-- Q4 Weeks with spend but no fuel statement (H-7)
select p.week_start, p.driver_count, p.total_spend
from fuel_reconciliation_period p
where p.status='locked' and p.org_id=:org
  and not exists (select 1 from week_statements w
                  where w.kind='fuel' and w.organization_id=p.org_id
                    and w.week_key = p.week_start::text);

-- Q5 Scale check for §5
select count(*) filter (where key like 'fuel_entry:%')  as fuel_entries,
       count(*) filter (where key like 'transaction:%') as transactions,
       count(*) filter (where key like 'finalized_report:%') as snapshots
from kv_store_37f42386;

-- Q6 How often is price unavailable? (C-7 frequency)
-- from finalized_report KV, or: fills in a week with liters is null / 0
```

### 13.3 Artefacts to capture

- A **HAR** of: hub open → Fuel tab → open the Sep 7 week → step through to Finalize.
  Confirms P-9's waterfall and gives real timings.
- A **React Profiler** trace of one step change in the wizard. Confirms P-2's magnitude.
- `explain (analyze, buffers)` on one `kv_store_37f42386 ... like 'transaction:%'` scan.
- The `fuel_period_job` rows for your last 20 finalizes: `state`, `failures`, `cursor`.
  Any `money_commit_failure` is C-8 in production.
- Your `.env` / Supabase secrets for the six flags in §13.1 Q4–Q7.

---

## 14. Prioritised implementation order

Follow this order. Each step is safe to stop at, and each makes the next one provable.

### Stage 0 — Before touching anything (1 week)
1. **Phase 0 characterisation goldens** — 26 weeks × both engines, committed as a fixture.
2. Run §13.2 Q1–Q6. Q3 tells you whether C-2 has already corrupted closed weeks.
3. Answer §13.1 Q3/Q4/Q7 — they decide whether C-3 is theoretical or live.

### Stage 1 — Stop the bleeding (3 days, no money-model change)
4. H-2 · pass `totalSpend`
5. C-6 · load `fuelCards` in `recon` scope
6. C-5 · degrade-poisons-result + Finalize block
7. H-3 · fix the tie assertion
8. U-9 · provenance block on the Finalize step
9. U-1, U-11, U-13 · KPI, age, copy

### Stage 2 — Close the bypasses (1 week)
10. C-2a · delete the trailing rebuild-preference rule
11. C-2b · `fuel_week_rebuild` publishes `draft`
12. C-3a · auto-close honours exception + over-explained + dispute gates
13. C-3b · delete or implement the inert `counts` gate
14. H-6 · version-scope approvals; remove client-settable service approve
15. H-12 · fuel-specific permissions; fix `/step`'s read-permission-on-write
16. U-8 · leakage-review requires reason + threshold + status check

### Stage 3 — Make failure safe (1 week)
17. C-8 · compensating saga around the money loop + alert + audit row
18. H-13 · reopen must not delete evidence after a failed reversal
19. H-8 · surface `fuelSealError` on the period + landing badge
20. H-9 · never silently shrink the snapshot batch
21. H-7 · seal from the union of DFP rows and snapshot drivers

### Stage 4 — Fix the money (2 weeks)
22. C-4 · align the freeze spend denominator with its category costs + add the invariant
23. C-7 · split over- vs under-explained; make under-explained reviewable with a reason
24. H-10 · unresolved/unknown coverage rule becomes a blocker, not a default; one policy resolver
25. H-11 · never publish a snapshot without `categoryCosts`
26. R-1 · the non-tautological A↔B parity test, in CI, with a fixture that must fail

### Stage 5 — Re-anchor authority (4–6 weeks)
27. Extract `computeFuelWeek` + `evaluateFuelFinalizeClosable` into fuel-core
28. `FUEL_SERVER_ENGINE=shadow` — log diffs for 4 weeks
29. `FUEL_SERVER_ENGINE=enforce` — C-1 closed
30. One gate, four call sites
31. Nightly statement↔ledger assertion into `finance_recon_drift`

### Stage 6 — Workflow and performance (4–6 weeks)
32. Residual taxonomy + dispositions (C-7 fully, U-7)
33. H-1 · real gap detection; revive the deduction path
34. P-2 · precomputed attribution map + trip index
35. P-3 · retire KV prefix scans on the money path
36. `GET /fuel/weeks/:ws/bundle`; wizard becomes a renderer (P-1, P-9)
37. U-14 accessibility pass; U-10 durable step notes; R-2/R-3/R-4 cleanup

---

### One line to carry into the work

Every Critical in this report is the same shape as the six instances recorded in your
reconciliation audit: **the mechanism was built correctly and the last connection — the one
that lets the control fail — was left out.** Two engines with no comparison. A gate reading a
column with no writer. A tie check that cannot print ✗. A banner whose input is never passed.
Before you mark any item here done, write the input that makes it fail, and watch it fail.
