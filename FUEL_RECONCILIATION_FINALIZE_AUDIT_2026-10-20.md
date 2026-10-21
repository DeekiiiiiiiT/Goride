# Fuel Reconciliation — Finalize Path Audit

**Date:** 2026-10-20 · **Scope:** Business Finance → Week Reconciliation → Fuel step (rideshare), from opening the wizard through `POST /fuel/periods/:id/finalize` to the ledger and sealed statement.
**Method:** read-only. Code reading, production edge/function logs, and read-only SQL against project `csfllzzastacofsvcdsc`. **No code, config or data was changed.**
**Related prior work:** `FUEL_RECONCILIATION_ENTERPRISE_AUDIT.md` (Revs 1–7, who may publish which number) and `FUEL_RECONCILIATION_CALCULATION_AUDIT_2026-09-15.md` (Rev 8.x, the arithmetic). Both are closed. This audit covers what they did not: **the operational path that gets a week closed, and whether the operator can tell that it closed.**

---

## 0. Verdict (read this first)

**You have bugs and an architecture problem. The bugs are why you are blocked today. The architecture is why they keep coming back.**

1. **Week 2026-10-12 did finalize, with correct numbers.** At 23:48:08–23:48:20 UTC the server locked the period, posted the ledger and sealed a closed fuel statement:

   | Line | Posted | Check |
   |---|---|---|
   | Total spend | 19,000.00 | 15,000 gas card + 4,000 cash ✔ |
   | Rideshare cost (distance-based) | 18,081.21 | |
   | Window-timing (first fill, company-held) | 918.79 | 18,081.21 + 918.79 = 19,000.00 ✔ |
   | Driver share (`fuel_deduction`) | 1,808.12 | 10 % of rideshare ✔ |
   | Company share (`fuel_fleet_share`) | 17,191.88 | 90 % of rideshare + timing ✔ |
   | Unexplained | 0.00 | |
   | Statement `fuel/closed` v1 | 1,900,000 minor = 180,812 + 1,719,188 | ties to the cent ✔ |

2. **You were told it failed, and then the screen kept saying OPEN.** Four defects chain together:
   - The finalize request did too much work in one edge invocation. It **committed the money, then died with HTTP 546** (worker resource limit).
   - The browser **automatically re-sent** the money POST, got **409 version_conflict**, and treated that as a failure.
   - The wizard holds a **stale copy of the period** captured when it opened, so it never learned the week was locked. It kept showing **OPEN**, kept recomputing the week, and offered Finalize again. A second finalize job was created on the locked week at 23:52.
   - The recompute depends on a **deadhead endpoint that reads the entire fleet history**. It takes 3–28 s for 2 vehicles, against a **15 s** client deadline. When it misses, Finalize is hard-blocked with "money-bearing inputs incomplete or timed out", and Retry hits the same slow call again.

3. **A worse, silent problem sits under the visible one.** When a fleet-table read errors or times out, the server **returns an empty list instead of failing**. Production logs show deadhead computed with **0 trips** and **0 fuel entries** and returned **200 OK**. The client gate cannot catch this, because the request "succeeded".

4. **The server's shadow money check is wrong, not your numbers.** Its "independent" category check summed every `ride`-tagged fuel row: **35,500.00** against a real spend of 19,000.00. It double-counted the Manual_Entry + Card_Transaction pair that exists for every gas-card fill. If `FUEL_SERVER_ENGINE` is ever switched to `enforce`, correct weeks will be refused (`SNAPSHOT_MISMATCH`).

5. **Architecture:** the browser is still the money authority. It downloads trips, deadhead, Personal Allowance, brain classification and odometer ledgers, runs the money engine, then sends finished snapshots to the server to post. Every network hiccup in that fan-out becomes either a hard block or a silent wrong number. The enterprise fix is to **move the week computation server-side into a resumable close job**, so the wizard becomes a review-and-approve screen over a persisted, versioned week. ~80 % of the parts already exist (fuel-core is shared, `fuel_period_job` exists, the closable predicate is shared).

**Immediate unblock, no code needed:** week 2026-10-12 is done. Reload the page (full browser refresh) and it will show Locked. Do **not** reopen it.

---

## 1. What this section does today (system map)

### 1.1 Surfaces

| Surface | File | Lines | Role |
|---|---|---|---|
| Week Reconciliation hub (left rail: Upload → Tolls → Fuel → Trips → Settlement → Close) | `apps/fleet/src/components/fleet-financials/recon/ReconRunPage.tsx` | — | Hosts Fuel as one step; lazy-mounts FuelManagement embedded |
| Fuel page host | `apps/fleet/src/pages/FuelManagement.tsx` | 2,714 | Owns data loading **and** the finalize orchestration (`handleFinalize` L1894–2108) |
| Dashboard / router | `components/fuel/reconciliation/FuelReconciliationDashboard.tsx` | 469 | Landing ↔ wizard; holds `view.period` |
| 6-step wizard | `components/fuel/reconciliation/FuelPeriodWizard.tsx` | 1,550 | Data quality → Disputes → Policy → Fuel gaps → Settlement → Finalize |
| Week money build (browser) | `apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts` | 398 | Fans out to trips / deadhead / PA / brain / odometer ledger, then runs Engine A |
| Money engine | `packages/fuel-core/src/fuelCalculationService.ts` | 1,013 | Engine A (shared package) |
| Closable predicate | `packages/fuel-core/src/evaluateFuelWeekClosable.ts` | 223 | 20 blocker codes, shared |
| Client gate inputs | `apps/fleet/src/utils/fuelWeekClosableGate.ts` + `fuelFinalizeGating.ts` | 190 + 307 | |
| Server routes | `supabase/functions/_fleet-server/fuel_period_routes.ts` | 2,653 | ensure / materialize / step / finalize / reopen / recompute / jobs |
| Server gate inputs | `_fleet-server/fuel_week_closable_gate.ts` | 677 | |
| Deadhead | `_fleet-server/fuel_controller.tsx` L7561–7689 | (7,165-line file) | `GET /fuel-audit/deadhead/fleet` |

### 1.2 Data flow on Finalize (as built)

```
Browser (wizard open / Retry / any parent refresh)
 ├─ GET trips for week (paged)            20 s soft timeout ─┐
 ├─ GET /fuel-audit/deadhead/fleet        15 s soft timeout ─┤  timeout ⇒ degraded ⇒ HARD BLOCK
 ├─ PA context                            20 s soft timeout ─┤  error   ⇒ silently empty (deadhead)
 ├─ brain classify per vehicle            25 s soft timeout ─┘
 ├─ odometer ledger per vehicle (limit 5000)
 └─ Engine A ⇒ WeeklyFuelReport[]  ⇒ gates (3 client layers) ⇒ POST /materialize (degraded flag, counts)

Click Finalize
 ├─ ensure period, prefs, evidence pack, prior reports
 ├─ finalizeFuelWeekReports (client builds snapshots)
 └─ POST /finalize  (If-Match: version, Idempotency-Key: finalize:<id>:v<version>)
      ├─ server closable gate (5+ KV/SQL loads)
      ├─ FUEL_SERVER_ENGINE shadow recompute + audit row
      ├─ insert fuel_period_job ⇒ processJobRow (same request)
      │    ├─ persist snapshot per driver
      │    ├─ commit wallet + ledger per driver
      │    ├─ lock period (version+1)
      │    ├─ sealFuelWeek ⇒ week_statements closed
      │    └─ post-lock rebuilds
      └─ 202  … or 546 if the worker runs out of budget after committing
```

**Key property:** every number posted to the ledger was computed in the browser and shipped in `body.snapshots`. The server re-gates, shadow-compares, and posts. It does not compute.

---

## 2. Incident reconstruction — 2026-10-20 (UTC), week 2026-10-12, org `8cfa606a…`

| Time | Event | Source |
|---|---|---|
| 21:43 → 22:46 | 13× `deadhead/fleet` calls, 3.2–22.3 s each; 2 calls returned **0 trips** (`WARN odo>0 but tripKm=0`) after `fleetReadThru prefix trip: canceling statement due to statement timeout` | function_logs |
| 23:08 → 23:13 | All fuel endpoints 500: `invalid value for parameter "work_mem": "8mb"` (lowercased role GUC, the same class as the earlier 26-min outage). Cleared since (verified `pg_roles` has no `work_mem`). | function_logs |
| 23:29 → 23:44 | Wizard rebuilds the week repeatedly; `/recompute` runs on every load | edge logs |
| **23:48:04** | `fuel_engine_diff` (shadow): server says rideshare −17,418.79 vs client, misc +17,418.79 | `fuel_period_audit` |
| **23:48:05** | Job `e16f191b` (`finalize:…:v2`) → **period locked**, version 3 | `fuel_period_job`, period row |
| **23:48:08–09** | Ledger: `fuel_finalized`, `fuel_deduction −180,812`, `fuel_fleet_share −1,719,188`, `fuel_driver_spend −400,000`, `fuel_gas_card_spend −1,500,000` | `financial_events` |
| **23:48:20** | `fuel/closed` statement v1 written; audit `finalize` `moneyCommittedOnLock: true` | `week_statements`, audit |
| **23:48:21** | Client receives **HTTP 546** for that same request | edge logs |
| **23:48:23** | `fetchWithRetry` auto-resends the POST with stale `If-Match: 2` → **409** | edge + function logs |
| 23:48:25 | Client `recoverIfAlreadyLocked` sees the lock → toast "Week locked" | `FuelManagement.tsx:2019-2030` |
| 23:50 → 23:57 | Wizard still mounted with `period.locked=false`: `PATCH /step` ×4 accepted on locked period, `/materialize` ×5, deadhead ×6 (2.9–28.5 s) | edge + audit |
| **23:52:36** | Second `POST /finalize` → new job `f5a175a3` (`v3`) inserted on the **locked** week → `alreadyLocked` no-op → 202 | `fuel_period_job` |
| 23:57:33 | Deadhead completes in 15.5 s; client already gave up at 15 s → **"Deadhead: timed out — incomplete"**, the state in the screenshot | function_logs + screenshot |

---

## 3. Findings

Severity: **P0** = blocks closing a week or posts/hides wrong money. **P1** = enterprise-grade correctness/safety gap. **P2** = architecture/scale. **UX** = operator experience.
Each finding has an **Acceptance test**: the input that must make the fixed system behave correctly. Per the lesson from prior audits, ship every control together with the failing input that proves it works.

### P0-1 · Deadhead endpoint scans the whole fleet history for a one-week answer

- **Where:** `supabase/functions/_fleet-server/fuel_controller.tsx:7569-7635`
- **What:** `Promise.all([kv.getByPrefix("fuel_entry:"), kv.getByPrefix("vehicle:"), kv.getByPrefix("trip:"), …])` loads **every** row, then filters per vehicle in JS. Per vehicle it runs `allTrips.filter(...)` and then a second `allTrips.filter(t => … && !vTrips.some(...))`, which is O(trips × vTrips).
- **Evidence:** loads 3,805 trips to use 51 (75×) and 548 fuel entries to use 10. Production timings for **2 vehicles** run 2.9 s → 28.5 s. Each `trip:` page also runs under the 8 s `statement_timeout`, which it hit at 22:34 and 22:43.
- **Client side:** `buildFuelWeekReportsForFinalize.ts:238` gives it 15 s. A miss sets `degraded.deadhead` (L268), and `FuelPeriodWizard.tsx:1098` hard-blocks Finalize. Cost grows with total history, so this will get **worse every week**.
- **Fix:**
  1. Query only the week: `fleet.trips` where `vehicle_id IN (week vehicles) OR driver_id IN (their drivers)` and `date BETWEEN start-1d AND end+1d`, plus `fleet.fuel_entries` for the same window (plus the one prior anchor fill per vehicle that the chain needs).
  2. Accept `vehicleIds[]` from the caller (the wizard already knows the week's vehicles).
  3. Replace the nested `.some` with a `Set` of trip ids.
  4. Medium term: **persist** deadhead per (vehicle, week) when trips/fills are imported, and have the endpoint read it. Recompute on write, not on view.
- **Acceptance test:** an org with 50,000 historical trips and a 2-vehicle week returns in < 1 s, and the result equals the current algorithm on the golden week 2026-10-12.

### P0-2 · Silent empty reads: a failed fleet-table read returns `[]` and the request succeeds

- **Where:** `_fleet-server/fleet_table_read_thru.ts:94-97` (`catch → return []`), reached via `kv_store.tsx:231-258` `getByPrefix`. A second, separate swallow sits client-side at `buildFuelWeekReportsForFinalize.ts:135-137` (`fetchDeadheadMap` catches **errors** and returns an empty map **without** setting `degraded`).
- **Evidence:** function logs: `[fleetReadThru] prefix trip: Error: canceling statement due to statement timeout`, immediately followed by `[deadhead/fleet] Completed … 548 entries, 0 trips | WARN 1 vehicle(s) odo>0 but tripKm=0` and HTTP 200. Also `0 entries, 3805 trips` at 23:56:43.
- **Why it's P0:** the C-5 control ("silent empty data must not change charges", `FuelPeriodWizard.tsx:1081`) only catches **slow**, not **failed**. A failed read now looks like a truthful "this vehicle drove 0 rideshare km", which moves km into deadhead/personal and changes the driver charge.
- **Blast radius:** every caller of `kv.getByPrefix` for a mapped domain (trips, fuel entries, vehicles, drivers, tolls, …), not just fuel.
- **Fix:**
  - `readMappedKvPrefix` must **throw** (or return a typed `{ ok:false }`) on error. Never `[]`.
  - `getByPrefix` must not fall back to the legacy KV table for a domain whose legacy rows were cut over (`fuel_entry:` has 0 rows in `kv_store_37f42386`; the fallback is guaranteed-empty).
  - Deadhead (and any money endpoint) returns 503 with `{ degraded: ["trips"] }`.
  - Client `fetchDeadheadMap` sets `degraded.deadhead = true` on **any** error, not just timeout.
- **Acceptance test:** inject a `statement timeout` into `queryFleet` for `trip:`. Expected: deadhead → 503, wizard shows "Trips could not be loaded", Finalize blocked. Today: 200 with 0 trips.

### P0-3 · Finalize commits money then dies (546); the client replays a non-idempotent POST

- **Where:** `fuel_period_routes.ts:1218-1563` (everything in one request). `apps/fleet/src/services/api.ts:98-115` (`fetchWithRetry` retries **any** 5xx, including POST). `api.ts:5107-5132` (`enqueueFuelPeriodFinalize` uses it).
- **Evidence:** 23:48:20 audit `finalize … moneyCommittedOnLock: true` → 23:48:21 edge **546** → 23:48:23 **409** (`If-Match: 2` vs version 3).
- **What happens in one request today:** org prefs, closable gate (≥5 data loads), shadow engine (2 more week loads + per-driver recompute + audit insert), job insert, per-driver persist, per-driver money commit, lock, `sealFuelWeek`, post-lock rebuilds. Any of them can push the worker over budget **after** the irreversible step.
- **Fix:**
  1. **Make finalize asynchronous.** `POST /finalize` validates, inserts `fuel_period_job` (queued) and returns `202 { jobId }` immediately. A worker (pg_cron → edge, or a queue) runs `processJobRow`. The client polls `GET /fuel/jobs/:jobId` (the route already exists, L2386).
  2. Never auto-retry non-idempotent methods. `fetchWithRetry` should retry only `GET/HEAD`, or POSTs that carry an `Idempotency-Key` **and** no `If-Match`.
  3. Order the post-lock work so seal + rebuilds are their own resumable job steps (cursor already exists).
- **Acceptance test:** kill the worker right after `commitFinalizedSnapshotMoney`. Expected: job stays `running` → resumes → `succeeded`; UI shows "Locking… (step 4/6)" then "Locked". No error toast at any point.

### P0-4 · The wizard never learns the week locked (stale `view.period`)

- **Where:** `FuelReconciliationDashboard.tsx:315` and `:337` (`setView({ kind:'wizard', period })` copies the object once); `:363` renders from that copy; `:386-388` (`onBack` is a no-op when `hideLanding`, i.e. embedded in Week Reconciliation). Deep-link effect `:292-317` is gated by `deepLinkConsumed`, so it never re-selects.
- **Evidence:** after the 23:48 lock the period list refetched (`GET /fuel/periods` 23:48:26, 23:50:15, 23:53:55, 23:56:05 — all return `locked`). The wizard still sent `PATCH /step` and `POST /finalize` until 23:56, and the screenshot shows **OPEN**.
- **Effect:** the operator sees "Finalize is blocked" on a week that is already closed. If they "fix" it by **reopening** the week, they will reverse correctly posted ledger lines.
- **Fix:** store only `view.periodId` (week start) and derive `period` from `allPeriods` on every render. Seed the wizard's `periodLocked` from the **server period bundle** it already loads (`getFuelWeekBundle`, `FuelPeriodWizard.tsx:443`). When locked, unmount the week engine entirely and show a **Locked receipt** (see UX-4).
- **Acceptance test:** open wizard → finalize succeeds → without navigating, the header shows Locked within one refetch, and no further `/materialize`, `/step` or `deadhead` calls are made.

### P1-1 · Locked periods still accept writes and new finalize jobs

- **Where:** `fuel_period_routes.ts:1218-1251` (finalize has no locked check before the gate and job insert; the idempotency key is `finalize:<id>:v<version>`, so after the lock bumps the version a **new** job is created). `:2361-2384` (`PATCH /step` has no locked check). `/materialize` is correct (`:1200`, skips locked).
- **Evidence:** job `f5a175a3` (`v3`) created 23:52:36 on a locked week. Audit `step` rows at 23:50 and 23:56 on a locked week. No money moved, because `processJobRow:400` short-circuits.
- **Fix:** at the top of `/finalize` and `/step`: `if (status === 'locked') return 409 { error:'period_locked', lockedAt, version }`. The client maps `period_locked` to "Already locked" with a success state, not an error.
- **Acceptance test:** POST finalize on a locked period → 409 `period_locked`, no `fuel_period_job` row inserted.

### P1-2 · Server shadow engine counts duplicate fill rows, so `enforce` would refuse correct weeks

- **Where:** `_fleet-server/fuel_week_category_loader.ts:133-140` (any `usageCategory`-tagged entry makes `server_entries` the authority); `:48-53` sums **raw `amount`** per row; `:174-209` loads every week row with no dedup and no `countsInFuelLogSpend` filter; `:26-31` maps anything unrecognised (`"ride"`) to rideshare.
- **Evidence:** this week's `fleet.fuel_entries` has, for each gas-card fill, both a `Manual_Entry` (Anchor) and a `Card_Transaction` (Anchor) with identical amount and odometer (6,000/191,441 · 5,000/191,759 · 4,000/192,213), plus a floating 4,000 card row and a `ride`-tagged cash row. Sum of `ride` rows = **35,500.00**. Client rideshare = 18,081.21. Delta logged = −17,418.79 = 18,081.21 − 35,500.00 exactly.
- **Also a category error (known since N-15):** entry **spend** is not comparable to Engine A's **distance-derived cost**. Even after dedup, a week with real deadhead or personal km would mismatch.
- **Fix:**
  1. Load server entries through the **same** ops-fill filter and pair-dedup the client uses (`filterFuelOpsLogEntries` + statement-link dedup in fuel-core), never raw rows.
  2. Compare like with like. Either the server recomputes **distance** categories from trips (the server-authoritative job in §4 does exactly this), or the server_entries tier is limited to checking `Σ spend` and the payment split, not categories.
  3. Keep `FUEL_SERVER_ENGINE=shadow` until the soak shows zero unexpected diffs. Today's only shadow data point is a false positive.
- **Acceptance test:** golden week 2026-10-12 (with the duplicate pairs) → zero category delta. A tampered snapshot with rideshare +1,000 → delta.

### P1-3 · Cross-tenant attribution in `/fuel/periods/recompute`

- **Where:** `fuel_period_routes.ts:1075-1079`: `kv.getByPrefix("finalized_report:")` (every org), then `if (snapOrg && snapOrg !== orgId) continue;`. A snapshot with **no** org stamp is accepted by **every** caller.
- **Evidence:** period `d99d4f11-…:2026-08-24` (another org) was created 2026-10-08 with `computed_from_hash: finalized:1` and spend **34,996.60**, identical to this org's locked 2026-08-24. Today all 32 `finalized_report:` rows carry an org stamp, so new leaks need an unstamped write, but the filter still fails open.
- **Fix:** `if (snapOrg !== orgId) continue;` (fail closed), plus an org-scoped SQL read instead of a global prefix scan. Delete or quarantine the foreign 2026-08-24 row after confirming that org has no fuel activity that week. Add the route to `scripts/check-fuel-org-scope.mjs`.
- **Acceptance test:** an unstamped snapshot, recompute called as org B → no row for org B.

### P1-4 · Retry and refresh amplify load against the slow endpoints

- **Where:** `FuelPeriodWizard.tsx:836-839` (`handleRetryWeek` calls **both** `weekReports.refresh()` and `onRefresh()`; the parent refresh changes `fuelEntries`/`finalizedReports`, which changes the content key in `useFuelWeekReports.ts:21-41` and starts a **second** full build). Also `/fuel/periods/recompute` runs on every Fuel page load (edge logs 23:29, 23:37, 23:50, 23:54, 23:56) and scans all finalized reports.
- **Evidence:** deadhead ×3 within 21 s at 23:57:12–33. Concurrent heavy reads slow each other on the same Disk-IO-constrained database (see `docs/` Disk IO plan).
- **Fix:** Retry refetches only the inputs that failed, once, with a visible per-input status. Dedupe concurrent builds per week (single-flight). Remove `/recompute` from page load; run it only after a finalize/reopen or on demand.
- **Acceptance test:** one Retry click → exactly one deadhead request.

### P1-5 · Client and server gates share a predicate but not their inputs

- **Where:** client `apps/fleet/src/utils/fuelWeekClosableGate.ts:72-144` vs server `_fleet-server/fuel_week_closable_gate.ts:440-624`.
- **Divergences found:**
  - `card_statement_drift` is evaluated **server-only** (`:556-571`). The client can show "Ready to lock" and the server returns 422.
  - `degraded_inputs` on the server is a **sticky column** written by the last `/materialize` from a **client-asserted** `body.degradedInputs` (`fuel_period_routes.ts:1168`). A stale `true` blocks a now-healthy finalize until materialize reruns, and a client can simply send `false`.
  - The server derives `odometerChainUnusable` from entries **and** stamps; the client uses stamps only.
- **Also:** the wizard decides "Finalize disabled" from **four** overlapping sources: `hasDegradedInputs`, `closableBlockers`, `gateResult.*`, and ad-hoc checks (`FuelPeriodWizard.tsx:1094-1110`). Several duplicate each other (over-explained is checked twice).
- **Fix:** one server endpoint, `GET /fuel/periods/:id/closable` → `{ blockers[], inputsVersion }`, computed by the same function finalize uses. The wizard renders exactly that list. Delete the client-side re-derivation of server facts. Keep only purely local UI checks such as the "I reviewed" checkbox.
- **Acceptance test:** for every one of the 20 blocker codes there is a fixture where `/closable` and `/finalize` return the same blocker.

### P2-1 · Architecture: the browser is the money authority

This is the root of the recurring pattern across all 9 fuel audit revisions: soft timeouts, `degraded` flags, client stamps the server has to distrust, shadow engines and break-glass headers all exist **because** the numbers are made in the browser.

**Target (enterprise) design: server-authoritative week close**

```
Imports / fills / trips (write path)
   └─▶ per-(vehicle, week) derived facts persisted:
         deadhead km, rideshare km, odometer chain, PA usage   ← computed on write, versioned

fuel_week_compute job (server, resumable, idempotent)
   inputs: week id + inputs_hash(all source rows)
   ├─ load ONLY week-scoped rows (SQL, org-scoped, no prefix scans)
   ├─ run fuel-core Engine A (same package the UI uses)
   ├─ write fuel_week_snapshot(version, inputs_hash, per-driver money, provenance)
   └─ evaluate closable ⇒ blockers[] persisted with the snapshot

Wizard (browser) = review & approve
   ├─ GET snapshot + blockers (instant, no fan-out)
   ├─ operator actions (acks, dispositions) ⇒ POST ⇒ re-run compute job
   └─ Finalize ⇒ POST /finalize { snapshotVersion } ⇒ 202 jobId ⇒ poll
          server refuses if snapshotVersion ≠ latest or inputs_hash changed
```

What this removes: soft timeouts, the `degraded` concept (a job either has its inputs or fails loudly and retries), client snapshot trust, SNAPSHOT_MISMATCH and the break-glass header, the shadow engine (there is one engine, run once, on the server), and per-view recomputation.

What it reuses: `@roam/fuel-core` (already imported by the Deno server: `computeFuelWeek`, `deriveWindowMoneyFromEntries`), `fuel_period_job` + cursor, `evaluateFuelWeekClosable`, `sealFuelWeek`, `processJobRow` money commit with C-8 compensation.

### P2-2 · Duplicate rows per gas-card fill are a standing trap

Every gas-card fill exists as `Manual_Entry` + `Card_Transaction` (plus sometimes a floating card row). The client dedupes correctly, but every **new** consumer must re-implement that dedup, and P1-2 is the second consumer to get it wrong.
**Fix:** a single SQL view / fuel-core function `weekFuelFills(org, week)` that returns one row per physical fill with `{cardTxId, manualEntryId, payment_source, amount, litres, odometer}`. All engines, gates, loaders and the deadhead calc read only that.

### P2-3 · Deadhead belongs to the trip/fill write path, not the close path

Deadhead is a property of a vehicle-week, derivable as soon as trips and fills for that week are imported. Persist it (`fleet.vehicle_week_distance` or similar) with a `computed_from_hash`. Recompute on trip/fill import and on adjustment edits. The close reads it in O(1).

### P2-4 · Recon coverage and hygiene (data findings, not code)

| Item | Evidence | Action |
|---|---|---|
| Weeks **2026-09-21** and **2026-09-28** have **no** period row | `fuel_reconciliation_period` | Confirm whether these had fuel; if yes they were never reconciled |
| 2026-09-14 open, spend 0 (hollow shell) | period row | Harmless; hidden by `isHollowOpenFuelPeriodRow` |
| 2026-09-07 `reopened`, spend 30,300 | period row | Unfinished reopen; close or document |
| 2026-08-31 **locked** with unexplained **−11,777.25** (98 % over-explained) | period row | Pre-gate legacy close; review whether driver share was right |
| 2026-08-10 / 08-17 locked with unexplained 29,144 / 22,055 | period rows | Pre-F-1 arithmetic era; already known, listed for completeness |
| Foreign-org 2026-08-24 row | P1-3 | Quarantine |

---

## 4. UX findings (from the screenshot and flows)

**UX-1 · Contradictory status.** The left rail says **Fuel: Complete**, the panel badge says **OPEN**, the stepper says **83 % complete** with all five prior steps ticked, and the footer says **Finalize blocked**. That is four status signals for one week, and three of them disagree. **Fix:** one status chip sourced from the server period row (`Open · Ready · Blocked (n) · Locking… · Locked · Reopened`). The rail, badge, stepper and footer all read it.

**UX-2 · The same blocker is shown four times.** "What to do now" card, red "Finalize is blocked" box, "Data provenance (signature)" list and the footer line all repeat it. Two different progress widgets (the "STEP 6 OF 6" bar and the circle stepper) show the same six steps. **Fix:** one blockers panel on the Finalize step. Each blocker names the cause, who can fix it, and the single action that fixes it. Remove the circle stepper or the bar; keep one.

**UX-3 · Engineering language in an operator screen.** "money-bearing inputs", "brain data", "provenance (signature)", "Deadhead: timed out — incomplete", "Updating week figures…" with no progress. **Fix:** plain copy, e.g. *"We couldn't load trip distances for this week (the server took too long). Your numbers haven't changed. [Try again]"*, with a per-input status row (Trips ✓ 51 · Distances ⟳ loading 12 s · Allowance ✓ · Cards ✓ 1).

**UX-4 · No terminal "Locked" state with a receipt.** After a successful close the operator should see a read-only receipt: locked at / by, version, posted lines (driver share, company share, cash, gas card) with ledger event ids, statement id, and a **Reopen (requires reason)** action. Today the wizard keeps the editable flow on screen.

**UX-5 · Errors after a successful commit.** 546/409 on finalize were shown as failure, then a success toast, then the week still read OPEN. **Fix:** finalize shows a progress state driven by job polling ("Posting driver charges 1/1 · Sealing statement · Done"). A 409 `period_locked` / `version_conflict` triggers a status refetch, never an error toast.

**UX-6 · "Reconciliation can be reopened at any time until closed"** sits at the bottom of the Finalize step and is ambiguous: closed = finalized? or Week Close? State exactly what reopening does to posted lines.

**UX-7 · Money Check panel is good — keep it.** "Total fuel bought / Driver charge / Company keeps / Payment sources / Ledger balanced" is the clearest part of the screen. Keep it and make it the hero of the Locked receipt.

---

## 5. What is redundant (remove or merge)

| Item | Why redundant | Recommendation |
|---|---|---|
| `withSoftTimeout` + `FuelWeekDegradedInputs` + `degraded_inputs` column + materialize `degradedInputs` body field | Exist only because the browser computes money | Delete once compute is server-side (§P2-1). Interim: keep, but make failures loud (P0-2) |
| FUEL_SERVER_ENGINE shadow/enforce, `fuel_engine_diff`, `X-Fuel-Force-Client-Money`, `useFuelForceClientMoneyDialog`, `fuel_week_category_loader.ts` | Second engine to police the first | Retire when the server is the only engine. Until then, fix P1-2 so the soak isn't noise |
| Client gate re-derivation (`fuelWeekClosableGate.ts` server-fact parts, `fuelFinalizeGating` overlap, ad-hoc checks in `finalizeDisabled`) | Same facts evaluated 3–4 times | One `GET /closable` (P1-5) |
| `/fuel/periods/recompute` on every page load | Global scan + upsert per load | On-demand or post-finalize only |
| `FuelManagement.handleFinalize` orchestration (ensure → prefs → evidence pack → prior reports → build → enqueue) | Server should own sequencing | Thin client: `POST /finalize { snapshotVersion }` |
| Two progress widgets on the Finalize step | Same information | Keep one |
| Legacy `getByPrefix` fallback to `kv_store_37f42386` for cut-over domains | Guaranteed-empty, masks errors | Remove per domain once cut over (P0-2) |
| `fuel_controller.tsx` (7,165 lines) hosting deadhead, parent companies, audits, etc. | God file | Move deadhead into a `fuel_distance` module during P0-1 |

**Not redundant: keep these.** Review Queue (sole fuel approval gate; see prior disposition), the Money Check panel, the C-8 compensating reversal in `processJobRow`, the `alreadyLocked` idempotent short-circuit, the nightly statement↔ledger assertion (`fuel_nightly_statement_ledger.ts`), the shared fuel-core predicate.

---

## 6. Implementation plan (ordered)

Each phase is shippable alone. Do them in order. Arm each control with its failing fixture in the **same** commit.

### Phase 0 — Unblock + stop the harm (small, ~1–2 days)
1. **P0-4** stale period: derive wizard `period` from `allPeriods` by id; seed `periodLocked` from the server bundle; locked ⇒ stop week engine + show receipt.
2. **P1-1** `period_locked` 409 guard on `/finalize` and `/step`; client maps it to success.
3. **P0-3 (part)** `fetchWithRetry`: no auto-retry for non-GET without explicit opt-in.
4. **P0-2 (part)** client `fetchDeadheadMap` sets `degraded.deadhead` on error, not just timeout.
5. **P1-3** fail-closed org filter in `/recompute`; quarantine the foreign 08-24 row.
6. **P1-4** Retry = one targeted refetch; drop `onRefresh()` from it.

### Phase 1 — Make the slow path fast and honest (~3–5 days)
7. **P0-1** week-scoped deadhead (SQL window + vehicleIds + Set dedup). Raise the client deadline only after measuring the new p95.
8. **P0-2** `readMappedKvPrefix` throws; remove the legacy fallback for cut-over domains; money endpoints return 503 + `degraded[]`.
9. **P0-3** async finalize: 202 + job poll; worker runs `processJobRow`; post-lock seal/rebuild as resumable steps.
10. **P1-2** dedup + ops-filter in the server category loader; keep `shadow`.

### Phase 2 — One gate, one status (~1 week)
11. **P1-5** `GET /fuel/periods/:id/closable`; wizard renders only that list.
12. **UX-1 … UX-6**: single status chip, one blockers panel, plain copy, Locked receipt, job-progress finalize.

### Phase 3 — Server-authoritative close (~2–3 weeks)
13. **P2-2** `weekFuelFills` canonical fill view.
14. **P2-3** persisted vehicle-week distance (deadhead) on the write path.
15. **P2-1** `fuel_week_compute` job + `fuel_week_snapshot(version, inputs_hash)`; finalize takes `snapshotVersion`.
16. Retire shadow engine, break-glass, degraded plumbing, client orchestration (§5).

---

## 7. Verification queries (read-only)

```sql
-- A. Did a week actually close? (period ↔ ledger ↔ statement)
select status, version, locked_at, driver_share, company_share, total_spend
from public.fuel_reconciliation_period where id = '<org>:<week>';

select event_type, direction, amount_minor, reversed_at
from public.financial_events
where domain ilike '%fuel%' and period_anchor between '<week>' and '<week>'::date + 6;

select kind, status, version, amounts_minor from public.week_statements
where week_key = '<week>' and kind = 'fuel';

-- B. Finalize jobs on locked periods (should be 0 after P1-1)
select j.id, j.idempotency_key, j.created_at
from public.fuel_period_job j join public.fuel_reconciliation_period p on p.id = j.period_id
where j.kind = 'finalize' and j.created_at > p.locked_at;

-- C. Writes on locked periods (should be 0 after P1-1)
select a.action, a.at from public.fuel_period_audit a
join public.fuel_reconciliation_period p on p.id = a.period_id
where p.locked_at is not null and a.at > p.locked_at and a.action in ('step','materialize');

-- D. Period rows whose org has no finalized snapshot of its own (P1-3)
select id, org_id, week_start, total_spend, computed_from_hash
from public.fuel_reconciliation_period where computed_from_hash like 'finalized:%';

-- E. Weeks with fuel but no period row (coverage gap)
select date_trunc('week', date)::date wk, count(*), sum(amount)
from fleet.fuel_entries
where date_trunc('week', date)::date not in (select week_start from public.fuel_reconciliation_period)
group by 1 order by 1 desc;
```

Logs (Supabase unified logs):
```sql
-- Deadhead latency (p95 should be < 1 s after P0-1)
select timestamp, event_message from logs
where source='function_logs' and event_message like '%[deadhead/fleet] Completed%' order by timestamp desc;

-- Silent empty reads (should be 0 after P0-2)
select timestamp, event_message from logs
where source='function_logs' and event_message like '%fleetReadThru%' order by timestamp desc;
```

---

## 8. Do not "fix" these (deliberate, verified correct)

- Fill-to-fill efficiency (drops first fill's litres) and the `windowTimingCost` carve: correct since Rev 8.2; it is the 918.79 line above.
- `floorMiscForSplit` refusing negative residual to a driver; misc → company 100 %.
- Personal Allowance identity `earnedCost + overageCost === personalUsageCost`.
- Two-tier `resolvePricePerLiter`; no Fuel Brain kill switch.
- `processJobRow` `alreadyLocked` short-circuit (`fuel_period_routes.ts:400`): it is what prevented a double post at 23:52.
- Review Queue stays.

---

## Appendix A — File/line index

| Finding | Location |
|---|---|
| P0-1 | `supabase/functions/_fleet-server/fuel_controller.tsx:7561-7689`; `apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts:116-139, 238, 268` |
| P0-2 | `_fleet-server/fleet_table_read_thru.ts:44-98`; `_fleet-server/kv_store.tsx:231-258`; `buildFuelWeekReportsForFinalize.ts:135-137` |
| P0-3 | `_fleet-server/fuel_period_routes.ts:1218-1563`; `apps/fleet/src/services/api.ts:98-115, 5093-5150`; `apps/fleet/src/pages/FuelManagement.tsx:2019-2071` |
| P0-4 | `components/fuel/reconciliation/FuelReconciliationDashboard.tsx:292-317, 328-338, 360-398`; `FuelPeriodWizard.tsx:238` |
| P1-1 | `fuel_period_routes.ts:1218-1251, 1455-1457, 2361-2384` (vs correct `:1200`) |
| P1-2 | `_fleet-server/fuel_week_category_loader.ts:26-55, 107-171, 174-209` |
| P1-3 | `fuel_period_routes.ts:1065-1115` |
| P1-4 | `FuelPeriodWizard.tsx:836-839`; `apps/fleet/src/hooks/useFuelWeekReports.ts:21-50` |
| P1-5 | `apps/fleet/src/utils/fuelWeekClosableGate.ts:72-144`; `_fleet-server/fuel_week_closable_gate.ts:440-624`; `FuelPeriodWizard.tsx:1094-1148`; `fuel_period_routes.ts:1168` |

## Appendix B — Production evidence (2026-10-20)

- Deadhead `Completed in` (ms), 2 vehicles: 2,926 · 3,231 · 3,770 · 3,911 · 4,528 · 5,247 · 5,260 · 5,472 · 5,536 · 5,685 · 6,634 · 6,876 · 7,165 · 7,350 · 8,550 · 8,586 · 9,364 (0 trips) · 9,841 · 11,147 · 12,908 · 13,195 · 13,460 · **15,519 · 15,775 · 18,574 (0 trips) · 19,325 · 22,288 · 23,369 · 28,543 (0 entries)**. 8 of 29 exceed the 15 s client deadline; 3 returned empty inputs as success.
- `fuel_period_job`: `e16f191b` v2 succeeded 23:48:05 (1 driver); `f5a175a3` v3 created 23:52:36 on locked period, 0 drivers.
- `fuel_period_audit` `fuel_engine_diff` (shadow) ×2: companyShare +15,676.91, driverShare +1,741.88, misc −17,418.79, category.rideShareCost −17,418.79 (client − server), authoritySource `server_entries`.
- `finalized_report:2026-10-12:73e5b1dc…`: categoryCosts.rideShareCost 18,081.21; windowTimingCost 918.79; efficiencySource `odometer`; misc 0.
- `pg_roles`: `authenticator` / `authenticated` `statement_timeout=8s`; no `work_mem` override (the 23:08 `"8mb"` incident is cleared).
