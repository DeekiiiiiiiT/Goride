# Stop-to-Stop Reconciliation — Architecture & Correctness Audit

**Date:** 2026-09-15
**Subject:** "Stop-to-Stop Buckets" panel in Week Reconciliation → Leakage step
**Trigger:** Vehicle 5179KZ, week of Sep 7–13 2026, showing −100.0% variance on 7 of 9 rows

| Rev | Scope | Outcome |
|---|---|---|
| 1 | Original audit, no code changed | 19 findings |
| 2 | Verification after remediation | 16/19 closed; +1 Critical (R-1), +2 High (R-2, R-3) |
| 3 | Verification after R-series | All 19 + all 9 Rev 2 closed; +2 Critical (N-1, N-2), +5 smaller |
| 4 | Closeout of N-1…N-7, H-8, Charge Gap server path | Claimed closeable; **Charge Gap re-enabled** |
| **5** | **Verification of Rev 4** | **N-1…N-7, H-8, R-6 all verified closed. CI is red. Category closure is broken. Dual control is nominal.** |

---

## 0. Rev 5 — verification summary

Every Rev 4 claim checks out in the code, and several are better-built than what I asked for. The per-vehicle conservation split keeps volume global while evaluating distance/attribution/chain per vehicle and labels each failure with its vehicle id. The approve route writes the ledger row, **reads it back**, and returns 500 if the write didn't land. The recommend route loads the vehicle server-side. `buildFuelWeekReportsForFinalize` genuinely threads ledger anchors per vehicle into `generateDriverFleetReport`, so H-8 is real rather than stamped.

| # | Rev 4 claim | Verified |
|---|---|---|
| N-1 | Per-vehicle `chainSpanKm` | **CLOSED** — `groupBucketsByVehicleId`, volume stays fleet-wide, per-vehicle messages. |
| N-2 | `bulkFinalizeExecuteGateFields(period)` | **CLOSED** — `FuelBulkFinalizeDialog.tsx:439`; `periodForGate` confined to the prepare loop. |
| N-3 | Floating/mid-bucket disjointness | **CLOSED** — `floating` is null-odo only; `floatingIds` excluded from `midBucketFuelEntries`. |
| N-4 | Approve writes the ledger | **CLOSED** — `kv.set(transaction:…)` + read-back + `ledger_write_failed` 500. Matches the house convention used by `claim_service`, `driver_toll_charge`, `fuel_posted_guarantee`. |
| N-5 | Server-side vehicle load | **PARTIAL** — history is no longer client-supplied, but the loaded vehicle is never checked against the caller's org. See P-4. |
| N-6 | TS2367 | **CLOSED**. |
| N-7 | Dead shim | **CLOSED** — file deleted. |
| H-8 | Ledger anchors into finalize | **CLOSED** — `buildFuelWeekReportsForFinalize.ts:294-337`. ⚠ the provenance stamp can still lie, see P-5. |
| R-6 residual | DB unique index | **CLOSED** — `fleet_transactions_gap_deduction_idempotency_uidx` is valid against `fleet.transactions (organization_id, payload_json→metadata→idempotencyKey)`. |

**Tests:** `packages/fuel-core` 102 passed (18 files). `apps/fleet` 1297 passed, **1 failed**, 1 skipped (221 files).

Charge Gap is now live (`STOP_TO_STOP_CHARGES_ENABLED = true`) behind real gates: `panelReconciled`, `confidenceTier === 'exact'`, org required, and server-only money writes. That is the right shape. But it went live in the same change as two blockers below, one of which means the money categories don't add up.

---

### P-1 (CRITICAL, new) — Cost categories no longer sum to spend

`apps/fleet/src/services/fuelCalculationService.driverWeek.test.ts` — unmodified, now failing:

```
FAIL  generateDriverFleetReport shared car
      > multi-vehicle Personal Allowance merge keeps bucket sum equal to total spend
AssertionError: expected 90 to be close to 200, received difference is 110
```

Measured directly against the shipped engine (two vehicles, two fills each, 70 km of trips):

```
totalGasCardCost   200
rideShareCost       14
companyUsageCost     0
deadheadCost         0
personalUsageCost    0
miscellaneousCost   76
                   ───
SUM                 90      GAP 110   (55% of spend)
windowTimingCost     0      ← not the cause
```

`computeMiscellaneousCost` is defined as `totalSpend − allocated`, so misc should be 186, not 76. Something between the per-vehicle slices and the merged report removes 110 and puts it in no category at all. The second assertion — `driverShare + companyShare == totalGasCardCost` — fails for the same reason.

I did not isolate which term drops it; the failing test is a precise reproduction and is the right place to start.

**This almost certainly predates Rev 4.** The evidence-only-personal change (Rev 2, §5.3) removed the residual that used to absorb exactly this money, and nothing replaced it — there is no `unexplainedCost` field anywhere in the codebase (`grep` returns nothing). **I missed it in Rev 2 and Rev 3 because I ran `src/components/fuel` and named util tests, never `src/services`.** That's my error, and it is the reason to widen the test command going forward.

Why it matters now rather than then: Charge Gap is live, weeks close on these snapshots, and `deductionRecommendation` is derived from `totalCost / bucketDistance` on the same engine. A category breakdown that loses 55% of spend is not a safe basis for charging a driver.

### P-2 (CRITICAL, new) — CI is red on its own new gates

```
pnpm --filter @roam/fuel-core typecheck        → FAIL
pnpm --filter @roam/fleet typecheck:money      → FAIL

packages/fuel-core/src/weekSnapshotEngine.ts(306,9): error TS2353:
  Object literal may only specify known properties, and 'windowTimingCost'
  does not exist in type '{ builtBy; settledEntries; blendedRatio; appliedFuelRule?; brain? }'.
```

Both are wired into `.github/workflows/ci.yml` (lines 164 and 167). The money typecheck gate added this round is doing exactly its job — it caught a real type error that `vitest` cannot see — and it is currently failing, so the pipeline is blocked.

`windowTimingCost` is being written into snapshot metadata without being added to the metadata type. Either widen the type or drop the field.

### P-3 (HIGH, new) — Dual control is structural only, not enforced

The two-route design implies a second human. In practice one click does both:

- `stopToStopGapChargeService.ts:61` — `if (input.autoApprove === false)`. **No caller anywhere passes `autoApprove`** (`grep` finds only the declaration and this check), so it defaults to true and the client always chains `recommend` → `approve`.
- The recommendation record has no `recommendedBy` field — `buildRecommendPayload` never records the actor.
- The approve route (`fuel_period_routes.ts:1658-1741`) makes no distinct-actor check. It reads `actorId(c)` only to stamp `approvedBy` and the audit row.

So any operator holding both `fuel.edit_entry` and `fuel.second_approve` — which an admin will — posts a charge to a driver's ledger in a single click, with both the recommend and approve audit rows naming the same person.

The codebase already knows this pattern: the adjacent `/second-approve` route carries the comment *"Distinct identity is enforced at finalize time vs job created_by."* Gap charges don't do it.

**Fix:** record `recommendedBy` on the recommendation; reject approve when `actorId(c) === rec.recommendedBy`; and have the UI call with `autoApprove: false` so the Pending charge genuinely waits for a second person.

### P-4 (HIGH, new) — Cross-org vehicle read on the charge path

`fuel_period_routes.ts:1622-1626`

```ts
const vehicleRaw = await kv.get(`vehicle:${vehicleId}`);
if (!vehicleRaw || typeof vehicleRaw !== "object") {
  return c.json({ error: "vehicle_not_found" }, 404);
}
const vehicle = stampOrg(vehicleRaw as Record<string, unknown>, c);
```

`vehicleId` comes from the request body and is looked up in a global key namespace. `stampOrg` then **overwrites** `organizationId` with the caller's org (`org_scope.ts:88-103`) rather than verifying it. The driver resolved from that vehicle's assignment history is then charged.

So an operator in org A can pass a vehicle id belonging to org B, have a driver from org B resolved, and post a charge — stamped as org A's transaction.

The codebase has the right helper and uses it on exactly this shape elsewhere (`belongsToOrg` / `belongsToOrgStrict`, used in `ledger_driver_overview_routes.ts:53`, `org_billing_routes.ts:149,186,295,334`). The gap-charge routes don't. Add `belongsToOrgStrict(vehicleRaw, c)` before resolving, and 404 on mismatch.

### P-5 (MEDIUM, new) — The anchor-provenance stamp can lie

`fuelFinalizeService.ts:335` stamps `stopToStopAnchorMode: 'ledger'` unconditionally, but the anchor load in `buildFuelWeekReportsForFinalize.ts:294-316` is best-effort:

```ts
try { … if (anchors.length >= 2) anchorsByVehicle.set(vehicleId, anchors); }
catch (e) { console.warn('[buildFuelWeekReports] ledger anchors failed for', vehicleId, e); }
…
anchorsByVehicle.size > 0 ? anchorsByVehicle : undefined,
```

If the ledger fetch throws, or a vehicle has fewer than two verified anchors, that vehicle silently falls back to ops-fill anchors — and the snapshot still claims `'ledger'`. Since the whole point of H-8 was that the frozen snapshot should be traceable to what the admin saw, a stamp that can misreport provenance is worse than no stamp. Derive it from what was actually used, per vehicle.

---

## 1. Rev 1 verdict (retained — this is what was wrong)

The −100% readings were not a data problem and not a display problem. They were the arithmetic working exactly as written. The table divided distance from one measurement system by fuel from a second, joined on a key that could not match, over windows cut by a third.

1. **Bucket boundaries were drawn at every verified odometer reading**, not at fuel fills. A check-in between two fills split one fill-to-fill interval into "all the distance, no fuel" (−100%) and "all the fuel, little distance" (+141%).
2. **The join that attaches litres could not succeed** on the code path the UI used. Anchor ID was `fuel_<entryId>`; the fuel entry ID was `<entryId>`. The date fallback compared `YYYY-MM-DD` against `YYYY-MM-DDTHH:mm:ss`. Both were `===`. Both always failed.
3. **The panel was not a control.** `expectedFuelLiters` was derived from the same fuel data it was validating.

Plus a live money button posting approved, reconciled driver charges from a client-computed number, with no idempotency, no driver-at-the-time resolution, and no duplicate detection on that screen.

---

## 2. Rev 1 reconstruction (retained — the evidence)

Derived from source, then checked against the screenshot. Exact agreement is what made the diagnosis certain.

### 2.1 Distance numbers disagreed on the same screen

| Quantity | Value | Source |
|---|---|---|
| Header card "This week's distance" | **1,429 km** | odo span of **ops fill entries** in the week |
| Sum of the 9 table rows | **1,830 km** | span across **all verified ledger anchors** |
| Difference | **401 km** | |

Explained by rows 1–2: `182,971 → 183,262` (291 km, opens Sep 6, previous week) and `183,262 → 183,372` (110 km, 0 trips, 0.0 L). And `184,801 − 183,372 = 1,429` — exact match to the header. So `183,372` was the week's first ops fill, and the two anchors below it were **not fuel fills**. That was the proof that non-fill readings were being used as boundaries.

### 2.2 Fuel numbers disagreed by ~79%

| Quantity | Value |
|---|---|
| Header card | **134.7 L** / $30,300 |
| Sum of "Actual" across 9 rows | **28.7 L** |
| Unattributed | **106.0 L ≈ $23,840** |

### 2.3 Two efficiencies live on one screen

Card: **10.61 km/L** (week span ÷ all week litres). Table `Exp:` cells: **9.82 km/L** (all-time span ÷ litres excluding first fill). `1,429 ÷ 10.61 = 134.7` ✓ and `1,830 ÷ 9.82 = 186.4` ✓.

### 2.4 "GAP" meant the opposite of the legend

Legend said "distance traveled that was NOT logged". Code computed `max(0, categoryEvidence − bucketDistance)` — distance logged **in excess of** odometer movement. Row 5: `187.18 − 130 = 57.18`. Row 3: `161.42 − 160 = 1.42` (0.9% — GPS noise rendered as a red badge).

### 2.5 "FLAGGED" and "No Leakage" on the same row

Row 5 was FLAGGED but the Deduction column read "No Leakage", because `totalCost` was 0 from the same broken join.

---

## 3. Architecture as built

```
odometer_ledger → odometerService.getLedger() → verified anchor points
  │
  ├─→ BucketReconciliationView          (panel)      ─┐
  └─→ buildFuelWeekReportsForFinalize    (H-8)        │ same ledger anchors
        └─→ generateDriverFleetReport                 │ both paths
              └─→ calculateReconciliation            ─┘
                    └─→ odometerBucketEngine.calculateOdometerBuckets
                          fill-only boundaries · referenceId join · half-open windows
                          proportional trip split · evidenced personal · confidence tiers

conservation (stopToStopConservation.ts)
  volume   → fleet-wide  (bucket litres vs week ops litres)
  distance → per vehicle (sum of bucket km vs per-vehicle chainSpanKm)     [N-1]
  attribution / chain → per vehicle
      ↓
  server close gate (fuel_week_closable_gate.ts) — authoritative, hasFrozenBuckets-guarded
  client echo (stopToStopClosableFlags.ts) — 3 call sites

money (Charge Gap ON):
  UI → recommendGapCharge → POST …/gap-charges/recommend   ⚠ P-4 no org check on vehicle
                          → POST …/gap-charges/approve     ⚠ P-3 same actor can do both
                             └─ kv.set(transaction:…) Pending + read-back
                             └─ unique index on (org, metadata.idempotencyKey)
```

---

## 4. Open findings

| # | Severity | Finding |
|---|---|---|
| P-1 | **Critical** | Cost categories sum to 90 against 200 spend — 55% in no category. Unmodified test failing. No `unexplainedCost` bucket exists. |
| P-2 | **Critical** | CI red: `@roam/fuel-core typecheck` and `@roam/fleet typecheck:money` both fail on `weekSnapshotEngine.ts:306`. |
| P-3 | High | Dual control nominal — `autoApprove` defaults true and no caller opts out; no `recommendedBy`; no distinct-actor check on approve. |
| P-4 | High | Cross-org vehicle read in recommend; `stampOrg` overwrites rather than verifies. `belongsToOrgStrict` exists and is used elsewhere. |
| P-5 | Medium | `stopToStopAnchorMode: 'ledger'` stamped unconditionally while anchor loading is best-effort. |
| M-1 | Medium | Expected fuel still circular — mitigated by disclosure ("Actual vs Modeled", km/L note, legend pointing at the reconciling totals). Unchanged by design. |

Everything else raised in Revs 1–4 is closed.

---

## 5. Test status

```
packages/fuel-core                         102 passed (18 files)
apps/fleet (full)                         1297 passed, 1 FAILED, 1 skipped (221 files)
  └ fuelCalculationService.driverWeek.test.ts   ← P-1

pnpm --filter @roam/fuel-core typecheck    FAIL   ← P-2
pnpm --filter @roam/fleet typecheck:money  FAIL   ← P-2
```

**Process note.** In Revs 2 and 3 I ran `src/components/fuel` plus named util tests and reported "all green". P-1 was failing in `src/services` the whole time and I did not look there. Run the whole `apps/fleet` suite — it takes 14 seconds — rather than a curated subset. The money typecheck gate added this round is the other half of that lesson and is already earning its place.

---

## 6. Remaining work

**Blocking**
1. **P-1** — restore category closure. The money has to land somewhere: either an explicit `unexplainedCost` field carried to the snapshot and the ledger, or misc absorbing it as before. Use the failing test as the spec.
2. **P-2** — add `windowTimingCost` to the snapshot metadata type (or drop the write). Get CI green.

**Before Charge Gap stays on**
3. **P-3** — `recommendedBy` + distinct-actor rejection on approve + `autoApprove: false` from the UI.
4. **P-4** — `belongsToOrgStrict(vehicleRaw, c)` in the recommend route; 404 on mismatch.

Given P-1 and P-3, I would turn `STOP_TO_STOP_CHARGES_ENABLED` back off until at least those two are closed. The engine and the gates are sound; the accounting the charge sits on is not currently closing, and one person can post a charge alone.

**Medium**
5. **P-5** — derive the anchor-mode stamp per vehicle from what was actually used.

**Longer-lived**
6. **M-1** — a non-circular expected-burn model, if per-bucket variance is ever meant to be a finding rather than a display.
7. Move the bucket engine server-side behind `FUEL_SERVER_ENGINE` shadow rollout and diff until clean.

---

## Appendix — primary source locations

| Concern | File |
|---|---|
| Bucket engine | `packages/fuel-core/src/odometerBucketEngine.ts` |
| Conservation (N-1 per-vehicle) | `packages/fuel-core/src/stopToStopConservation.ts:154-240` |
| P-1 failing test | `apps/fleet/src/services/fuelCalculationService.driverWeek.test.ts` |
| P-1 merge path | `packages/fuel-core/src/fuelCalculationService.ts:900-960` |
| P-1 misc formula | `packages/fuel-core/src/fuelCoverageSplit.ts:174-192` |
| P-2 type error | `packages/fuel-core/src/weekSnapshotEngine.ts:306` |
| CI gates | `.github/workflows/ci.yml:164,167` |
| P-3 auto-approve | `apps/fleet/src/services/stopToStopGapChargeService.ts:61` |
| P-3 approve route | `supabase/functions/_fleet-server/fuel_period_routes.ts:1658-1741` |
| P-4 vehicle load | `supabase/functions/_fleet-server/fuel_period_routes.ts:1622-1626` |
| `stampOrg` vs `belongsToOrgStrict` | `supabase/functions/_fleet-server/org_scope.ts:88,261,390` |
| P-5 stamp / anchor load | `apps/fleet/src/services/fuelFinalizeService.ts:335`, `apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts:294-337` |
| Unique index | `supabase/migrations/20260915200000_gap_deduction_idempotency_unique.sql` |
| Charge kill switch | `apps/fleet/src/components/fuel/BucketReconciliationView.tsx:59` |
| N-2 fix | `apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx:73,439` |
