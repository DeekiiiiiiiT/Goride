# Stop-to-Stop Reconciliation — Architecture & Correctness Audit

**Subject:** "Stop-to-Stop Buckets" panel in Week Reconciliation → Leakage step
**Trigger:** Vehicle 5179KZ, week of Sep 7–13 2026, showing −100.0% variance on 7 of 9 rows

| Rev | Date | Scope | Outcome |
|---|---|---|---|
| 1 | 09-15 | Original audit, no code changed | 19 findings |
| 2 | 09-15 | Verification after remediation | 16/19 closed; +1 Critical (R-1), +2 High |
| 3 | 09-15 | Verification after R-series | All prior closed; +2 Critical (N-1, N-2), +5 smaller |
| 4 | 09-16 | Closeout of N-series, H-8, Charge Gap server path | Charge Gap re-enabled |
| 5 | 09-16 | Verification of Rev 4 | N-series + H-8 + R-6 closed; +P-1…P-5 |
| 6 | 09-17 | Closeout of P-1…P-5 | Dual control, org check, honest stamp |
| 7 | 09-17 | Verification of Rev 6 | P-1…P-5 closed; +Q-1…Q-3 on live charge path |
| **8** | **09-17** | **Closeout of Q-1…Q-3** | **Period freeze, fail-closed identity, operable list + solo post path** |
| 9 | 09-17 | Product deferral: multi-user dual control | Same-actor approve allowed; Notion future-test checklist parked |

---

## 0. Rev 8/9 — Q-series closeout + solo ops

| # | Finding | Status |
|---|---|---|
| Q-1 | Gap charges on locked week | **CLOSED** — both recommend and approve call `loadPeriod` + `assertPeriodNotLockedForGapCharge` → `period_locked` 409 |
| Q-2 | Dual control fails open | **CLOSED (identity)** — recommend/approve require actor + `recommendedBy`. **Same-actor approve allowed** for solo fleet owners (`requireDistinctActor` defaults false). Re-enable when multi-user ships. |
| Q-3 | Dual control not operable | **CLOSED (infra)** — `GET …/gap-charges` + hydrate. Solo UX: one-click **Post charge (Pending)** (`autoApprove: true`). Multi-user Recommend→Approve checklist parked in Notion. |

**Open (deferred by design):** M-1 circular expected fuel; `FUEL_SERVER_ENGINE` shadow; **multi-user distinct-actor dual control** (Notion: Future Features → Gap charge dual control).

---

## 0b. Rev 7 — verification summary (retained)

All five P-findings are genuinely closed, and P-1 was fixed at the right level rather than papered over.

| # | Rev 6 claim | Verified |
|---|---|---|
| P-1 | Multi-vehicle category sum | **CLOSED** — `windowTimingCost` is now a first-class report field (`fuelCalculationService.ts:465,613,921,962`), summed across slices in the merge, and **misc is recomputed from merged totals after the merge** (`:986`) rather than summed from slices. The closure identity now includes it, and the driverWeek test asserts the full six-term identity. |
| P-2 | `windowTimingCost` metadata type | **CLOSED** — `pnpm --filter @roam/fuel-core typecheck` clean; `--filter @roam/fleet typecheck:money` reports `0 money-spine errors`. |
| P-3 | Dual control nominal | **CLOSED (enforcement)** — `recommendedBy: actorId(c)` stamped on recommend (`:1676`); approve returns `same_actor_forbidden` 403 (`:1722`); client defaults to recommend-only (`autoApprove !== true`); separate `approveGapCharge` for the second person. ⚠ see Q-2, Q-3. |
| P-4 | Cross-org vehicle read | **CLOSED** — `belongsToOrgStrict(vehicleRaw, c)` before resolve, 404 on mismatch (correctly not leaking existence), `stampOrg` overwrite removed. |
| P-5 | Anchor stamp can lie | **CLOSED** — derived per report from the anchors actually loaded, with a `mixed` case for multi-vehicle drivers (`buildFuelWeekReportsForFinalize.ts:340-360`); finalize reads it rather than hardcoding. |

**Deploy note verified:** both routes are present in `supabase/functions/fleet-fuel/routes.generated.json:106-107`, so the manifest was regenerated alongside the source.

```
packages/fuel-core                         109 passed (18 files)
apps/fleet (full suite)                   1406 passed, 1 skipped (243 files), 0 failures
pnpm --filter @roam/fuel-core typecheck    PASS
pnpm --filter @roam/fleet typecheck:money  PASS
```

The engine, the conservation controls, and the close gate are in good shape. The three findings below are all on the money path that went live in Rev 4 — none of them affect the reconciliation arithmetic.

---

### Q-1 (HIGH, new) — Gap charges can be posted to a locked week

Neither gap-charge route loads the period or checks its status. `fuel_period_routes.ts` calls `loadPeriod` at seven other places for exactly this purpose (`:355, 818, 829, 1098, 1178, 1195, …`); the recommend route (`:1638-1694`) and the approve route (`:1696-1790`) call it at neither.

The client hides both buttons behind `!periodLocked`, so this is invisible in the UI — but the server accepts the call regardless of period state. A direct API call, a stale tab, or any future caller can post a Pending `Gap_Deduction` into an already-finalized week, moving driver money after close.

This is the one finding here that contradicts an invariant the rest of this codebase works hard to hold. Load the period and refuse when it is Locked/Finalized, on both routes.

### Q-2 (HIGH, new) — Dual control fails open in two ways

`fuel_period_routes.ts:1722`

```ts
const actor = actorId(c);
if (actor && rec.recommendedBy && String(actor) === String(rec.recommendedBy)) {
  return c.json({ error: "same_actor_forbidden", … }, 403);
}
```

Both operands are guarded with `&&`, so the check is **skipped** — and the charge approved — whenever either is absent:

1. **`actorId` returns `string | null`** (`:78-89` — it falls through `rbacUser.userId` → `rbacUser.id` → `user.id` → `return null`). A context where none resolves disables dual control silently.
2. **`rec.recommendedBy` is absent** on any recommendation written before Rev 6. Those KV records are still live and still approvable by whoever created them.

A control that degrades to permissive when its input is missing is the same shape as the lesson already recorded from the settlement close integrity audit: *evaluate every refusal before the irreversible step*. Refuse when `actor` is null (`actor_required`, 401) and refuse when `recommendedBy` is missing (`recommendation_missing_actor`, 409) rather than falling through to approve.

### Q-3 (MEDIUM, new) — Dual control is enforceable but not operable

`BucketReconciliationView.tsx:112-115`

```ts
/** Bucket ids recommended this session awaiting a different approver (P-3). */
const [recommendedBucketIds, setRecommendedBucketIds] = React.useState<Set<string>>(() => new Set());
```

The comment is accurate — the "Recommended" badge is React state, scoped to one browser session. There is **no GET route for gap-charge recommendations** (only `recommend` and `approve` exist), so nothing loads that state on mount.

Consequences for the second approver, who by definition is a different person in a different session:

- They see no "Recommended" badge and have no queue or list of what is awaiting approval.
- Both buttons render for them regardless, so the flow is reachable — but only if they already know which row to act on.
- If they click **Recommend charge** instead of **Approve**, the server overwrites `recommendedBy` with *their* id, and they then lock themselves out of approving it (403), while the original recommender can now approve it alone. The two-person control silently inverts to a one-person control on the wrong person.

Dual control that no one can find is dual control no one will use. A "pending gap charges" list for the period — one GET route plus a panel — would make it real.

Minor, same area: `handleApproveDeduction` (`:334-343`) gates on `STOP_TO_STOP_CHARGES_ENABLED` and `panelReconciled` but not on `confidenceTier === 'exact'`, unlike `handlePostDeduction`. The server enforces it (`confidence_not_exact`, 422), so this is only missing defense-in-depth.

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
  └─→ buildFuelWeekReportsForFinalize    (H-8)        │ same ledger anchors,
        └─→ generateDriverFleetReport                 │ provenance stamped
              └─→ calculateReconciliation            ─┘ per report (P-5)
                    └─→ odometerBucketEngine.calculateOdometerBuckets
                          fill-only boundaries · referenceId join · half-open windows
                          proportional trip split · evidenced personal · confidence tiers

categories: rideShare + companyUsage + deadhead + personal + windowTiming + misc
            ≡ totalGasCardCost   (misc recomputed from merged totals — P-1)

conservation (stopToStopConservation.ts)
  volume   → fleet-wide     distance / attribution / chain → per vehicle  (N-1)
      ↓  server close gate (fuel_week_closable_gate.ts) — authoritative
      ↓  client echo (stopToStopClosableFlags.ts) — 3 call sites

money (Charge Gap ON, served by fleet-fuel):
  List       GET  …/gap-charges              fuel.view · hydrate pending (Q-3)
  Recommend  POST …/gap-charges/recommend   period lock ✓  actor_required ✓  belongsToOrgStrict ✓
                                            already_recommended overwrite guard ✓
  Approve    POST …/gap-charges/approve     period lock ✓  dual-control fail-closed ✓  exact-tier 422 ✓
             └─ kv.set(transaction:…) Pending + read-back + 500 on failure
             └─ unique index on (org, metadata.idempotencyKey)
```

---

## 4. Open findings

| # | Severity | Finding |
|---|---|---|
| M-1 | Medium | Expected fuel still circular — mitigated by disclosure ("Actual vs Modeled", km/L note, legend pointing at the reconciling totals). Unchanged by design. |

Everything else raised in Revs 1–8 is closed.

---

## 5. Remaining work

**Longer-lived**
1. **M-1** — a non-circular expected-burn model, if per-bucket variance is ever meant to be a finding rather than a display.
2. Move the bucket engine server-side behind `FUEL_SERVER_ENGINE` shadow rollout and diff until clean.
3. **Multi-user dual control** — when fleet owners invite second team logins: turn on `requireDistinctActor`, restore Recommend→Approve UX, run Notion checklist under Future Features.

**Solo ops (current)**
- Open week + exact tier + reconciled panel → **Post charge (Pending)** (recommend + approve in one step).
- Locked week still refuses money mutations.
- Audit closed for production solo use.

---

## Appendix — primary source locations

| Concern | File |
|---|---|
| Bucket engine | `packages/fuel-core/src/odometerBucketEngine.ts` |
| Conservation (per-vehicle) | `packages/fuel-core/src/stopToStopConservation.ts:154-240` |
| P-1 category closure | `packages/fuel-core/src/fuelCalculationService.ts:921,962,986` |
| P-1 test | `apps/fleet/src/services/fuelCalculationService.driverWeek.test.ts:285-295` |
| Recommend route | `supabase/functions/_fleet-server/fuel_period_routes.ts` (gap-charges/recommend) |
| Approve route | `supabase/functions/_fleet-server/fuel_period_routes.ts` (gap-charges/approve) |
| List route (Q-3) | `GET …/gap-charges` in `fuel_period_routes.ts` |
| Q-1 / Q-2 guards | `packages/fuel-core/src/stopToStopGapCharge.ts` (`assertPeriodNotLockedForGapCharge`, `assertGapChargeDualControl`, `assertGapChargeRecommendOverwrite`) |
| Q-3 (hydrate + CTAs) | `apps/fleet/src/components/fuel/BucketReconciliationView.tsx` |
| Client charge service | `apps/fleet/src/services/stopToStopGapChargeService.ts` |
| P-4 org guard | `fuel_period_routes.ts` recommend; `org_scope.ts:390` |
| P-5 anchor mode | `apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts:340-360` |
| Route manifest | `supabase/functions/fleet-fuel/routes.generated.json` |
| Unique index | `supabase/migrations/20260915200000_gap_deduction_idempotency_unique.sql` |
| Charge kill switch | `apps/fleet/src/components/fuel/BucketReconciliationView.tsx` (`STOP_TO_STOP_CHARGES_ENABLED`) |
