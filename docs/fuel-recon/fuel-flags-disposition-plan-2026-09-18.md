# Fuel Flags — disposition architecture, implementation & verification

**Date:** 2026-09-18 · **Rev 12** (Rev 11 = Round 6 findings; Rev 10 = Round 5 closed)
**Status:** Phases 0–5 + Rounds 2–6 **closed.** R5-5 (server batch upsert) **deferred by choice.**
Still no feature flag — this path is live. Vendor Gate GPS fix disclosed, tested, and ops-noted
(R6-1); dead `getFuelScenarios` awaits removed from `handleSaveLog` (R6-2).
**Scope (widened at Round 5):** `Fleet Operations → Fuel Integrity` — Fill flags and
Stop-to-stop under one week-scoped home (Telematics tab **hidden** until a provider is
wired) — and its synchronisation with the fuel reconciliation wizard
(`Business Finance → Week Reconciliation → Fuel`). `Fuel Flags` is now a subtab, not a page.
**Explicitly out of scope:** all fuel money math — category costs, residual classification,
driver share, settlement. This work changes classification, disposition and gating only.

---

## 0. Verification summary (Rev 12)

Round 6 (R6-1 / R6-2) closed on top of Rev 10/11. Operator go-live brief includes the unverified
vendor queue heads-up: `docs/fuel-recon/fuel-flag-disposition-ops-golive.md`.

### What Rev 12 closed

| Item | Change |
|---|---|
| **R6-1** | `fuelUnverifiedVendorGate.ts` + tests; both `handleSaveLog` arms use `shouldCreateUnverifiedVendor`; ops + Notion disclose fewer auto-creates |
| **R6-2** | Discarded `getFuelScenarios` awaits removed from both `handleSaveLog` arms |

### Verification (measured)

| Check | Result |
|---|---|
| `fuelUnverifiedVendorGate.test.ts` | **8 pass** (coords present/absent, geofence-only regression, skip/edit) |
| `tsc` filtered | **0** in `FuelManagement.tsx` and `fuelUnverifiedVendorGate.ts` |

---

## 0-prev. Verification summary (Rev 10 — historical)

Round 5 open items R5-1…R5-4 plus the §12 `handleSaveLog` typecheck debt are **closed** in
working-tree code. Operator go-live brief:
`docs/fuel-recon/fuel-flag-disposition-ops-golive.md`. Notion notes appended on
Fuel Week-Lock SoT and Fuel Recon Calculation.

### What Rev 10 closed

| Item | Change |
|---|---|
| **R5-1** | Glossary `.filter` uses null narrowing — no optional-`checks` predicate fight |
| **R5-2** | `stepHeroResolved` explicit type with shared `actionDisabled?: boolean` |
| **R5-3** | Bulk partial failure keeps **failed** entry ids selected; note retained for retry |
| **R5-4** | Telematics removed from visible Integrity tabs; stale `telematics` subtab falls back to Fill flags; panel + `telematicsEvidence.ts` seam kept |
| **§12 handleSaveLog** | Type guard + arm order array → gas-card → `FuelEntry`; GPS “no coords” reads `locationMetadata` (not `geofenceMetadata`) |
| **R5-5** | Deferred — sequential desk-scale upserts remain fine |

### Verification (measured)

| Check | Result |
|---|---|
| `tsc` filtered by filename | **0** errors in `FuelManagement.tsx`, `fuelFlagGlossary.ts`, `FuelFlagsDesk`, `FuelIntegrityDesk`. Pre-existing `FuelPeriodWizard` `vehicleSnaps` → `FuelLeakageStep` mismatch left alone |
| Targeted vitest (`apps/fleet`) | **28 pass** — glossary, integrity desk (incl. R5-4), bulk desk (R5-3), disposition sync, fill classify |

### Scope note — driver-activity mix (unchanged policy)

Driver-activity artifacts landed in the same historical commits as fuel and remain **out of
scope** for fuel sign-off. Do not rewrite history. Standing rule: next fuel PR = fuel-only
diffs; driver workstreams separate.

---

## 0-prev. Verification summary (Rev 9 — historical)

Rounds 2–4 are **committed** (`cbd42150`, `1d6ba38b`, merge `19fa7407`, `85d0bf7d`) — the §12
closeout action is discharged. Round 5 adds new scope beyond the original plan.

### What Round 5 shipped

| Area | Change |
|---|---|
| **IA** | `fuel-flags` page → **`fuel-integrity`** desk with `Fill flags` / `Stop-to-stop` / `Telematics` subtabs. Legacy `/fuel-flags` path preserved; `pageRegistry.fuelIntegrity.test.ts` pins both directions |
| **Stop-to-stop** | New panel **reusing `BucketReconciliationView`** — no reimplementation, no duplicated money math |
| **Telematics** | Honest placeholder — *"Not connected yet"*, no fabricated figures, with a typed provider seam in `integrity/telematicsEvidence.ts` documenting that the bucket engine stays SSOT |
| **Desk** | Row selection + **bulk Accept / Escalate** with shared note, critical still requiring 8+ chars and `fuel.accept_unexplained` |
| **Guidance** | `FlagCheckGuideBlock` + `flagCheckGuideForReason` — per-flag *"concrete things to verify"*, with tests |

**This closes the last item from the Rev 1 UX spec** (bulk-accept for a vehicle's flagged week) and
completes **F-11**, the IA split, more fully than Rev 2 did — the desk and the wizard are now one
week-scoped surface with an explicit *Reconcile this week →* edge.

**Bulk partial-failure handling is correct:** per-item `try`/`catch`, `ok`/`failed` counters, and a
distinct *"Saved N, failed M"* toast — the R4-2 lesson applied. The `quiet` option suppresses
per-row toasts during bulk and is honoured on **both** the success and error paths in
`FuelManagement`.

**Tests:** `cd apps/fleet && VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npx vitest run`
(the **whole** app, not a subset) → **1469 pass, 1 skipped, 256 files.**

### Typecheck regressed — 3 new errors (closed in Rev 10)

`cd apps/fleet && npx tsc --noEmit -p tsconfig.json`, filtered by filename. `FuelManagement.tsx`
held at **16** (the pre-existing `handleSaveLog` class), and Round 5 added three. Closed in
Rev 10 — see §0 and §14.

### Scope note — unrelated work on the same branch

The same commits carry a **driver-activity workstream**: `DRIVER_ACTIVITY_SECTION_SPEC.md`,
`DriverActivityTab`, `driverActivityModel`, an `OfflineProvider` refactor, a desktop-shell contract
test and `20260918170000_fleet_driver_activity_cron.sql`. None of it is reviewed in this document
and none of it is fuel-flag related. Worth separating before the next review, so a fuel review does
not implicitly bless driver work.

---

## 0-prev. Verification summary (Rev 8 — historical)

Verified independently against the working-tree code, with the full suites and a typecheck — not
by self-report. Round 2 + Round 3 + Round 4 remain **uncommitted** at time of closeout.

**Round 4 acceptance**

| Item | Acceptance | Status |
|---|---|---|
| R4-1 | Hoist narrowed `src` in the desk `corrected` note block | **Done** — typecheck delta confirms it, see below |
| R4-2 | Disposition list reject → skip with retry copy, not `undisposed_flags` | **Done** — `loadWeekFlagDispositions` + `FUEL_BULK_DISPOSITIONS_LOAD_SKIP` |
| R4-3 | `truncated === true` → same skip sentinel | **Done** |
| R4-4 | Remove dead `dispositions` prop from bulk dialog | **Done** — prop and dashboard pass both gone; the dashboard's remaining `dispositions` passes go to the **wizard**, which still needs them |

**Full suites (not just the touched files):**

| Suite | Command | Result |
|---|---|---|
| fleet fuel | `cd apps/fleet && VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npx vitest run src/utils src/components/fuel` | **1291 pass**, 1 skipped, 219 files (+3 vs Rev 6) |
| fuel-core | `npx vitest run packages/fuel-core/src` **from the repo root** | **119 pass**, 18 files |

`packages/fuel-core` has no local vitest binary, so `npx vitest` fails there with
`MODULE_NOT_FOUND` — run it from the repo root. (Unlike `apps/fleet`, it needs no jest-dom setup.)

**Typecheck — R4-1 confirmed by delta.** `cd apps/fleet && npx tsc --noEmit -p tsconfig.json`,
filtered by **filename**:

| Rev | Errors in `FuelManagement.tsx` |
|---|---|
| Rev 6 (before R4-1) | 17 |
| Rev 8 (after R4-1) | **16** |

Exactly one error removed — the self-introduced `entry.metadata?.editReason` in the R-3 block. The
remaining 16 are the pre-existing `handleSaveLog` union-narrowing class, identical at HEAD. **This
work now contributes zero typecheck errors.** No errors in any flags/disposition/bulk file.

**R4 test quality:** the two integration tests render the dialog and assert both the operator copy
*and* `expect(finalizeFuelWeekReports).not.toHaveBeenCalled()` — they prove the week is actually
refused, not merely that a string rendered. The truncated case seeds a real disposition row, so it
cannot pass accidentally on an empty list. The third test pins the helper's discriminated union
directly via injected `listFn`.

---

## 0a. Verification summary (Rev 6 — historical)

Verified by reading the working-tree code, running the suites and typechecking — not by
self-report. Round 2 + Round 3 work remains **uncommitted** at time of review.

**Tests:** `cd apps/fleet && VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npx vitest run src/utils
src/components/fuel` → **1288 pass, 1 skipped, 219 files** (up from 1286 — the two new R3 tests).
`packages/fuel-core` clean. See §0b for why this must run from `apps/fleet`.

| Item | Acceptance | Status |
|---|---|---|
| R3-1 | Widen `dispositionMapFromRows` to `action?: string` via `Omit<…,'action'>` | **Done** — `FuelManagement:591` cleared |
| R3-2 | Per-week `listFuelFlagDispositions({ entryIds })` in bulk prepare + execute | **Done** — `PreparedWeek.dispositions` carries it; gate at `FuelBulkFinalizeDialog:400` consumes the per-week `gateResult` |
| R3-3 | Drop the `period_id` AND in the `entryIds` branch | **Done** — clause removed, rationale comment left in place |
| R3-4 | Client `signalTier` `.toLowerCase()` + case test | **Done** |

**R3-2 test quality:** `hydrates dispositions per week so week B dispositioned criticals finalize
(R3-2)` mocks `getAllFuelEntriesInRange` and `listFuelFlagDispositions` per week, asserts
`finalizeFuelWeekReports` is called twice, and inspects the per-call `entryIds`. It proves the
plumbing (each week fetches its own map). It does not prove a *missing* disposition would block
week B, because `buildFuelWeekReportsWithGating` is mocked to return no blockers — acceptable, as
that path is covered by `fuelFlagDisposition.sync.test.ts`.

### Typecheck status — read this before trusting a clean bill

`cd apps/fleet && npx tsc --noEmit -p tsconfig.json` reports **17 errors in `FuelManagement.tsx`**
at Rev 6. Sixteen are a pre-existing union-narrowing problem in `handleSaveLog`. R4-1 removes the
self-introduced error in the R-3 `corrected` block; remaining errors in that file are inherited
`handleSaveLog` noise. Filter by filename, not by error text, when checking this file.

*Method note:* parity was established by comparing the `handleSaveLog` signature and access
patterns against `git show HEAD:…`, not by running `tsc` on a pristine checkout.

---

## 0b. Verification summary (Rev 4 — historical)

Verified by reading the working-tree code, running the suites, and typechecking — not by
self-report. **Round 2 work is uncommitted at time of review.**

### How to run these tests

Run from **`apps/fleet`**, not the repo root:

```bash
cd apps/fleet
VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test npx vitest run src/utils src/components/fuel
```

The repo root has no vitest config for this app. Running from the root skips
`apps/fleet/src/test/setup.ts` (wired at `apps/fleet/vite.config.ts:205`), which loads the
`jest-dom` matchers — producing ~5 spurious failures (`Invalid Chai property: toBeDisabled`,
ambiguous `getByRole` lookups). Those are an invocation artefact, not defects.

**Result:** 1286 pass, 1 skipped, across 219 files in `apps/fleet`; `packages/fuel-core` clean.

**Typecheck:** `cd apps/fleet && npx tsc --noEmit -p tsconfig.json` — **one new error introduced by
Round 2**, see §8 R3-1 (closed in Rev 5). `ReconciliationTable.tsx:374` (×2) is pre-existing (it was `:370` before
the +6-line prop diff).

New wiring tests:

| Item | Acceptance test | File |
|---|---|---|
| R-1 | `wizard gate assembly clears integrity_critical when desk disposition is threaded` | `fuelFlagDisposition.sync.test.ts` |
| R-1 | `wrong-code signal_exception disposition does not clear integrity_critical` | `fuelFlagDisposition.sync.test.ts` |
| R-8 | `normalizes integrityStatus case (R-8)` | `fuelFillFlagClassify.test.ts` |

**Round 2 findings**

| # | Finding | Status |
|---|---|---|
| R-1 | Dispositions never reached client finalize gate | **Fixed** — `assembleFuelClientFinalizeGate` + map threaded through wizard, table, bulk, finalize; wizard accept uses `resolveOpenFlagCodeForAccept` |
| R-2 | Dispositions list truncated org-wide at 2000 | **Fixed** — `GET` scoped by `entryIds` (chunked); returns `truncated`; desk banner |
| R-3 | `'corrected'` unreachable | **Fixed** — desk-originated edit-save upserts `corrected` for open codes |
| R-4 | Desk accepts one flag code at a time | **Fixed** — per-reason Accept / Escalate in detail sheet |
| R-5 | Landing chip counted vehicles only | **Fixed** — `openFlaggedFillCount` + chip copy `N flagged fills · M vehicles` |
| R-6 | Stale “Clears when you lock the week” copy | **Fixed** |
| R-7 | Double `classifyFuelFillFlags` in blockers | **Fixed** — single-pass loop |
| R-8 | `integrityStatus` case drift client vs edge | **Fixed** — client `.toLowerCase()`; case tests |

**R-1 wiring, verified by reading the chain:** `FuelManagement.flagDispositions` →
`FuelReconciliationDashboard` → `FuelReconciliationWizardView` → `FuelPeriodWizard` →
`useFuelWizardDerived` (gate) **and** `useFuelWeekReports` (with `dispositionMapContentSig` so the
report cache invalidates when a disposition changes) **and** `FuelBulkFinalizeDialog` →
`buildFuelWeekReportsWithGating` + `finalizeFuelWeekReports`. `ReconciliationTable` takes the prop
directly. `assembleFuelClientFinalizeGate` declares `dispositions` as a **required** key (value may
be `undefined`), so TypeScript forces every call site to make the choice explicit.

Caveat: the two R-1 tests still hand-construct the map via `dispositionMapFromRows` and assert on
`assembleFuelClientFinalizeGate`. They prove the helper honours dispositions; they do **not** prove
`FuelManagement` feeds a non-empty map. That guarantee currently rests on the required-key type
plus manual review.

---

## 0c. Verification summary (Rev 2 — historical)

Verified by reading the committed code, not by self-report.

**Tests:** 53 pass — 40 in `apps/fleet` (`fuelFillFlagClassify`, `fuelFlagDisposition.sync`,
`fuelDataQualityReview`, `fuelPeriodGating`, `fuelFinalizeGating`) + 13 in
`packages/fuel-core/src/evaluateFuelWeekClosable.test.ts`. Fleet suites require
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to be set or collection fails on
`packages/api-client/src/supabaseInfo.ts` — dummy values are sufficient.

All three acceptance tests named in Rev 1 exist and pass:

| Phase | Acceptance test | File |
|---|---|---|
| 0 | `includes an older-week outlier that fleet-wide slice(80) would drop` | `fuelFillFlagClassify.test.ts:194` |
| 1 | `accept disposition clears exception blocker without signalTier mutation` | `fuelFlagDisposition.sync.test.ts:23` |
| 2 | `bulk finalize closable input refuses when DQ vehicles unreviewed` | `fuelFlagDisposition.sync.test.ts:44` |

**Typecheck:** `tsc -p apps/fleet/tsconfig.json --noEmit` reports no new errors in any file this
work touched. Pre-existing unrelated errors remain (leaflet types in `platform-ops-ui`,
`platform-settings` module maps, recharts formatter signatures, `FuelPeriodWizard.tsx:1194`
`vehicleSnaps` → `FuelLeakageStep` prop mismatch — all predate this work).

### Findings status

| # | Finding | Status |
|---|---|---|
| F-1 | Wizard resolution does not clear desk flags | **Fixed** — one classifier; `signalTier` no longer mutated |
| F-2 | Outlier flags truncated fleet-wide before week filter | **Fixed** — `buildStationMedianOutlierIdSet`, untruncated + week-scoped |
| F-3 | Data-quality review is a client-only gate | **Fixed** — read by server close path and `evaluateFuelWeekClosable` |
| F-4 | Legend promises a flag never produced | **Fixed** — retail-estimate row deleted |
| F-5 | Duplicate reason badges | **Fixed** — dedupe by `code\|label` + `is_flagged` suppression |
| F-6 | `primarySeverity` computed and discarded | **Fixed** — sort is severity desc, then date desc |
| F-7 | Two glossaries drifting apart | **Fixed** — single `FUEL_FLAG_BY_CODE`, keyed by code |
| F-8 | Desk dropdown silently moved the wizard's week | **Fixed** — own `flagsWeekStart` + explicit *Reconcile this week* |
| F-9 | DQ review route had no optimistic concurrency | **Fixed** — `If-Match` **and** conditional `.eq("version", …)` update |
| F-10 | "Review details" showed the wrong fills | **Fixed** — `FuelVehicleEvidenceSheet`, flagged fills first |
| F-11 | IA split across two departments | **Addressed** — desk is a fills view beside Transaction Logs; both linked |
| F-12 | Locked week + default filter = empty screen | **Fixed** — defaults to `all` when the selected week is locked |

### What shipped, by phase

- **Phase 0** — all six items.
- **Phase 1** — `fuel_flag_disposition` created with correct key types (`entry_id text` matches
  `fleet.fuel_entries.id`; `period_id text` matches the period PK), SELECT-only RLS for
  `authenticated`, writes reserved to service role / edge. Backfill from
  `reconExceptionAck` / `exceptionResolvedAt` with `ON CONFLICT DO NOTHING`. The classifier marks
  disposed reasons `resolved` rather than dropping them, preserving the audit trail.
- **Phase 2** — `undisposed_flags` and `data_quality_unreviewed` added to
  `evaluateFuelWeekClosable`; `undisposedCriticalFlags` takes precedence over the legacy
  `exception_fills` branch. Server mirror reads `fuel_flag_disposition` in 200-id chunks and
  evaluates DQ vehicle reviews in `buildFuelWeekClosableInputForPeriod`. Deno drift tests added.
- **Phase 3** — evidence sheet shows flagged fills first; *Mark reviewed* is disabled with
  *"N flagged fills need a decision first."*
- **Phase 4** — tri-state status (`open` / `resolved` / `cleared_by_lock`), header counter with
  at-risk total, group-by-vehicle, detail sheet with Accept / Edit / Escalate.
- **Phase 5** — accepting a `critical` flag additionally requires `fuel.accept_unexplained`;
  dispositions land in `fuel_period_audit` and the evidence pack.

### Deviations from the Rev 1 plan (accepted)

- **`'void'` dropped** from the action enum; shipped set is `accepted | corrected | escalated`.
- **Backfill actor sentinel** — rows with no `exceptionResolvedBy` get
  `00000000-0000-0000-0000-000000000000`. Audit queries counting actors must exclude it.
- **F-4 resolved by deletion**, not by wiring `buildPriceOutlierFlags` in. Retail-estimate
  outliers remain unimplemented; the legend no longer claims otherwise.

---

## 1. System before this work (Rev 1 record)

Three independent flag systems shared one input (`fuel_entries.metadata`) and never talked to
each other.

| System | Where | Grain | Disposition | Blocked lock? |
|---|---|---|---|---|
| **Fuel Flags desk** | `fuelFillFlagClassify.ts`, `FuelFlagsDesk.tsx` | per **fill** | none — `cleared` was literally `weekLocked` | no |
| **Exception blockers** | `fuelFinalizeGating.ts` | per **fill**, only `signalTier === 'exception'` | accept/edit → `reconExceptionAck` | yes, via `exception_fills` |
| **Data-quality review** | `fuelDataQualityReview.ts`, `FuelDataQualityStep.tsx` | per **vehicle-week** | "Mark reviewed" → `data_quality_vehicle_reviews` | no — Continue button only |

### The core defect

> **Nothing in the system could move a flag from Open to Resolved. `Cleared` meant "the week got
> locked", not "a human looked at it".**

Lock laundered unreviewed flags. Same class of problem the settlement close audit closed with
*"make invariants unrepresentable."*

---

## 2. Target architecture (implemented)

> **A flag is a claim. A disposition is a durable, attributed record that answers it. The lock
> gate reads dispositions, not the week's lock status.**

```
fuel_entries.metadata ──► classifyFuelFillFlags() ──► FuelFlagClaim[]
                                                          │  (pure, no persistence)
                        fuel_flag_disposition ────────────┤
                        (entry_id, flag_code, action,     │
                         actor, at, note, period_id)      ▼
                                              resolveDeskRowStatus()
                                          Open │ Resolved │ Cleared-by-lock
                                                          │
                     ┌────────────────────────────────────┼──────────────────────┐
                     ▼                                    ▼                      ▼
              Fuel Flags desk                    Wizard: Data quality      evaluateFuelWeekClosable
              (triage view)                      (blocking subset)         + 'undisposed_flags'
```

Three rules that make the desync unrepresentable:

1. **One classifier.** `classifyFuelFillFlags` is the only producer of fill-level flags.
   `listExceptionTierFillBlockers` filters `classify()` output on `hasOpenCritical`.
   ✅ Implemented — note this **widens** the blocker: `integrity_critical` now blocks where
   previously only `signalTier === 'exception'` did.
2. **Disposition is data, not a tier mutation.** ✅ Implemented — `signalTier` is preserved.
3. **The closable gate is the single arbiter.** ✅ Implemented server-side and client-side
   (`assembleFuelClientFinalizeGate` threads dispositions — Rev 3 / R-1).

---

## 3. Severity → blocking policy (implemented as planned)

| Severity | Behaviour |
|---|---|
| `critical` | Hard-blocks close until dispositioned (`signal_exception`, `integrity_critical`) |
| `warning` | Counted, not gated (`integrity_warning`, `is_flagged`, `location_anomaly`, `price_outlier`) |
| `info` | Never blocks |

Rationale: if warnings block, every week blocks and operators learn to rubber-stamp — the failure
mode noted in the Fuel Review Queue disposition.

---

## 4. Where things live now

| Concern | File |
|---|---|
| Classifier + legend + desk rows | `apps/fleet/src/utils/fuelFillFlagClassify.ts` |
| Disposition map, dual-read helpers | `apps/fleet/src/utils/fuelFlagDisposition.ts` |
| Finalize blockers (filters classifier) | `apps/fleet/src/utils/fuelFinalizeGating.ts` |
| Client closable input | `apps/fleet/src/utils/fuelWeekClosableGate.ts` |
| Shared predicate (client + edge) | `packages/fuel-core/src/evaluateFuelWeekClosable.ts` |
| Server mirror + DQ review evaluation | `supabase/functions/_fleet-server/fuel_week_closable_gate.ts` |
| Routes (`/fuel/flags/disposition`, `…/dispositions`, DQ review) | `supabase/functions/_fleet-server/fuel_period_routes.ts` |
| Desk UI | `apps/fleet/src/components/fuel/flags/FuelFlagsDesk.tsx` |
| Wizard DQ step + evidence sheet | `.../reconciliation/FuelDataQualityStep.tsx`, `FuelPendingLogsSheet.tsx` |
| Glossary (single, keyed by code) | `apps/fleet/src/components/fuel/analytics/fuelFlagGlossary.ts` |
| Schema | `supabase/migrations/20260918140000_fuel_flag_disposition.sql`, `…120000_fuel_period_data_quality_vehicle_reviews.sql` |

---

## 5. Non-goals (unchanged)

- **Do not make every flag blocking.** See §3.
- **Do not touch the money math.** No category cost, no residual, no driver share changes.
- **Do not merge the two surfaces.** Standing monitor vs. week close gate; connect, don't merge.

---

## 6. Round 2 — closed (Rev 3)

All items below were open in Rev 2 and are **Done** as of Rev 3. Summary lives in §0.

| # | Was | Resolution |
|---|---|---|
| R-1 | Critical — client gate ignored dispositions; wizard hardcoded `signal_exception` | `assembleFuelClientFinalizeGate` + map threaded; `resolveOpenFlagCodeForAccept`; wiring tests |
| R-2 | High — org-wide `limit(2000)` silent clip | `entryIds` chunked list + `truncated` + desk banner |
| R-3 | Medium — `corrected` never written | Desk edit-save upserts `corrected` for open codes |
| R-4 | Medium — single Accept hit first open reason | Per-reason Accept / Escalate buttons |
| R-5 | Low — chip said vehicles only | `openFlaggedFillCount` + `N flagged fills · M vehicles` |
| R-6 | Low — stale lock copy | Page description updated |
| R-7 | Low — double classify | Single-pass in `listExceptionTierFillBlockers` |
| R-8 | Hardening — case drift | Client `.trim().toLowerCase()` + tests |

No remaining Round 2 blockers. Confirmed: `fuelFlagDispositionEnabled` does not exist anywhere in
the codebase — **the path is live**, so §8 items reach production without a flag to hold them back.

---

## 7. Round 2 sequencing (historical)

| Item | Effort | Priority |
|---|---|---|
| R-1 — thread dispositions into all four gate call sites + correct flag code + wiring test | ~1 day | **Done** |
| R-2 — scope/paginate the dispositions read | ~½ day | **Done** |
| R-3, R-4 | ~½ day | **Done** |
| R-5, R-6, R-7, R-8 | ~½ day | **Done** |

---

## 8. Round 3 — closed (Rev 5)

Found verifying Rev 3; all closed in Rev 5.

| # | Was | Resolution |
|---|---|---|
| R3-1 | Build-breaking — `action: string` vs union in `dispositionMapFromRows` | Widened helper to `action?: string`; runtime allow-list unchanged |
| R3-2 | High — bulk reused selected-week dispositions map | Per-week `listFuelFlagDispositions({ entryIds })` in prepare+execute; test asserts two-week finalize |
| R3-3 | Low — `periodId` AND in entryIds branch dropped null `period_id` | Clause removed from entryIds branch |
| R3-4 | Low — `signalTier` case drift | Client `.toLowerCase()` + `normalizes signalTier case (R3-4)` test |

---

## 9. Round 3 sequencing (historical)

| Item | Effort | Priority |
|---|---|---|
| R3-1 — typecheck fix | minutes | **Done** |
| R3-2 — per-week disposition hydrate in bulk finalize | ~½ day | **Done** |
| R3-3, R3-4 | ~1 hour | **Done** |

---

## 10. Round 4 — closed (Rev 7)

Found verifying Rev 5; all closed in Rev 7. Nothing here blocked shipping — polish only.
Theme: **a failure to load dispositions must not read as "there are none."**

| # | Was | Resolution |
|---|---|---|
| R4-1 | Self-introduced typecheck in desk `corrected` note | Hoisted `const src = entry as FuelEntry & { correctionReason?: string }` |
| R4-2 | Bulk `.catch(() => empty)` → false `undisposed_flags` | `loadWeekFlagDispositions`; skip with `FUEL_BULK_DISPOSITIONS_LOAD_SKIP` |
| R4-3 | Per-week `truncated` ignored | Same skip sentinel when `truncated === true` |
| R4-4 | Dead `dispositions` prop on bulk dialog | Prop + dashboard pass removed |

---

## 11. Round 4 sequencing (historical)

| Item | Effort | Priority |
|---|---|---|
| R4-1 — narrow the union once in the R-3 block | minutes | **Done** |
| R4-2 + R4-3 — distinct "could not load dispositions" skip reason | ~1 hour | **Done** |
| R4-4 — remove dead prop | minutes | **Done** |

Round 2 / Round 3 / Round 4 were implemented on the same working tree; prefer landing Round 2+3
first, then Round 4, so each review stays readable.

---

## 12. Closeout — the only remaining action

**No open findings.** Four review rounds are closed; the feature is verified and shippable.

**Commit it.** All four rounds live on one uncommitted working tree of 26 files. That is now the
largest risk to this work — larger than anything left in the code. Nothing here depends on further
review.

Suggested split, so the history stays reviewable:

1. **Phases 0–5 + Round 2** — the disposition architecture and the client-gate wiring.
2. **Round 3** — per-week bulk hydration, route scoping, case normalisation, the `action` widening.
3. **Round 4** — load-failure sentinel, the union narrow, dead-prop removal.

### Standing notes for whoever picks this up next

- **`FuelManagement.handleSaveLog` typecheck debt — cleared in Rev 10.** Zero `tsc` errors in
  that file after the type-guard hoist + `locationMetadata` GPS check. Template for similar unions.
- **No feature flag exists.** `fuelFlagDispositionEnabled` was proposed in Rev 1 and never built,
  so merging enables the behaviour immediately. Expect a one-off spike in blocked weeks the first
  time a period is closed after merge: `integrity_critical` now blocks where only
  `signalTier === 'exception'` used to. That is intended — ops brief:
  `docs/fuel-recon/fuel-flag-disposition-ops-golive.md`.
- **Retail-estimate price outliers remain unimplemented** (F-4 was closed by deleting the legend
  row). `buildPriceOutlierFlags` still exists, unused by the desk, if that flag is ever wanted.
- **Telematics Integrity tab is hidden** until a provider is wired (R5-4). Seam:
  `integrity/telematicsEvidence.ts` + `FuelTelematicsPanel.tsx`.
- **Verification traps, both of which produced wrong conclusions in earlier revisions of this
  document:** run fleet tests from `apps/fleet` (the repo root skips
  `apps/fleet/src/test/setup.ts`), run fuel-core from the repo root (no local binary), and filter
  `tsc` output by **filename** — filtering by error text hid a real regression for two revisions.

---

## 13. Round 5 — built and verified (Rev 9)

New scope beyond the original plan: the Fuel Integrity desk, bulk disposition, and the flag-check
guide. Summary and evidence in §0. Nothing here regressed the Rounds 2–4 invariants — the
disposition record, the shared closable predicate and the per-week bulk hydration are all
untouched, and the whole fleet suite passes.

Two design calls worth recording, both correct:

- **Stop-to-stop reuses `BucketReconciliationView`.** It would have been easy to reimplement tank
  and odometer windows inside the new panel. Reusing the existing view keeps one engine for the
  money math and honours the standing non-goal in §5.
- **Telematics ships empty rather than simulated.** Rev 9 shipped an honest placeholder. Rev 10
  **hides the tab** until a provider is wired (R5-4); `integrity/telematicsEvidence.ts` and
  `FuelTelematicsPanel.tsx` remain for the future seam.

---

## 14. Round 5 — closed (Rev 10)

Found verifying Rev 9; closed in Rev 10. Summary and evidence in §0.

| # | Was | Resolution |
|---|---|---|
| R5-1 | Glossary type predicate vs optional `checks?` | Null narrow `.filter((x): x is NonNullable<typeof x> => x != null)` |
| R5-2 | `stepHeroResolved` missing `actionDisabled` on one arm | Explicit `StepHeroResolved` type with `actionDisabled?: boolean` |
| R5-3 | Bulk partial failure cleared all selection | Keep `failedEntryIds` selected; retain `bulkNote`; test in `FuelFlagsDesk.test.tsx` |
| R5-4 | Telematics visible dead-end tab | Hidden from nav; stale subtab → Fill flags; seam/panel kept |
| §12 | 16 `handleSaveLog` typecheck errors | Type guard + arm order; `locationMetadata` for GPS; `odometer ?? undefined` |
| R5-5 | Sequential bulk upserts | **Deferred** — desk scale is fine |

Also corrected a real logic bug exposed by clearing types: “no GPS” was reading
`geofenceMetadata.lat/lng` (which do not exist). Coords live on `locationMetadata`.

---

## 15. Round 5 sequencing

| Item | Effort | Priority |
|---|---|---|
| R5-1 + R5-2 + handleSaveLog | ~30 min | **Done** (Rev 10) |
| R5-3 — keep failed rows selected | minutes | **Done** |
| R5-4 — hide Telematics | minutes | **Done** |
| R5-5 | judgement | When bulk volume is real |

**Recurring lesson (closed for this workstream).** Rounds 3–5 each shipped green tests while
introducing typecheck debt. Rev 10 clears `FuelManagement.tsx` to **0** `tsc` errors so a non-zero
count in that file is a signal again. Full-app CI `typecheck` remains a separate milestone (CI today
runs filtered money/driver spines only).

---
---

## 16. Round 6 — independent verification of Rev 10 (Rev 11)

Verified against the working tree, with the whole fleet suite and a typecheck.

### Confirmed done

| Item | Evidence |
|---|---|
| R5-1 | `.filter((x): x is NonNullable<typeof x> => x != null)` — both glossary errors gone; comment records *why* the `FuelFlagGlossaryItem` predicate failed (optional `checks?`) |
| R5-2 | Explicit `StepHeroResolved` type shared by both arms — `FuelPeriodWizard:1143` gone |
| R5-3 | Failed entry IDs retained in `selectedIds` **and** `bulkNote` preserved for retry — better than specified. Covered by `FuelFlagsDesk.test.tsx` |
| R5-4 | Telematics tab hidden, `telematicsEvidence.ts` seam kept, plus a `useEffect` redirecting a stale `telematics` subtab to `fill-flags`. Two tests |
| R5-5 | Not done — correctly deferred; it was a "when bulk volume is real" judgement call |
| §12 standing note | **Operator go-live brief written** — `docs/fuel-recon/fuel-flag-disposition-ops-golive.md`, addressed to operators, names the one-time spike in blocked weeks |

### The number is a signal again

`cd apps/fleet && npx tsc --noEmit -p tsconfig.json`, filtered by filename:

| File | Rev 9 | Rev 11 |
|---|---|---|
| `FuelManagement.tsx` | 16 | **0** |
| `fuelFlagGlossary.ts` | 2 | **0** |
| `FuelPeriodWizard.tsx` (`actionDisabled`) | 1 | **0** |

The `isGasCardAnchorSave` type guard plus an explicit narrowing order — array → gas-card anchor →
single `FuelEntry` — cleared the entire pre-existing `handleSaveLog` class that §12 flagged. **The
whole flag-disposition / integrity surface now contributes exactly one typecheck error**, and it is
the genuinely pre-existing `FuelPeriodWizard:1244` `vehicleSnaps` → `FuelLeakageStep` prop mismatch
(`:1194` at Rev 2). The remaining 502 project-wide errors are unrelated areas — `admin-core`
`ProductLineSettingsPage` (106), `platform-ops-ui` maps, `csvHelpers`, `ExportCenter`, fuel
*stations*, driver-portal.

**Tests:** whole fleet app → **1471 pass, 1 skipped, 257 files.**

### 🟠 R6-1 (Medium) — a live behaviour change shipped inside the typecheck cleanup — **closed (Rev 12)**

The `handleSaveLog` cleanup also changed the **Vendor Gate**, in both the array and single-entry
arms:

```diff
- const hasNoGPS = !log.geofenceMetadata || !log.geofenceMetadata.lat || !log.geofenceMetadata.lng;
+ const hasNoGPS = !log.locationMetadata?.lat || !log.locationMetadata?.lng;
```

`geofenceMetadata` is `{ isInside, distanceMeters, timestamp, radiusAtTrigger }`
(`types/fuel.ts:131`) — it has **never** carried `lat`/`lng`. So `hasNoGPS` evaluated to `true`
unconditionally, and the gate called `api.createUnverifiedVendor` for *every* transaction-linked log
with a vendor name and no verified station. After the fix it fires only when coordinates are
genuinely absent. `locationMetadata` (`types/fuel.ts:125`) is the field that holds them.

**Rev 12 resolution:**

1. Predicate extracted to `fuelUnverifiedVendorGate.ts` (`shouldCreateUnverifiedVendor` /
   `hasFuelEntryGpsCoords`); both save arms call it.
2. Unit tests cover coords present → skip, absent → create, geofence-only → still no GPS, edit skip.
3. Ops brief + Notion Week-Lock SoT warn the unverified-vendor queue owner of fewer auto-creates.
4. Commit message names the Vendor Gate behaviour change.

### 🟢 R6-2 (Low) — a call kept only for its side effect — **closed (Rev 12)**

Discarded `await fuelService.getFuelScenarios()` removed from both `handleSaveLog` arms. It was not
warming React Query (`useFuelScenarios`); Phase 6 comment left in place.

---

## 17. Round 6 sequencing

| Item | Effort | Priority |
|---|---|---|
| R6-1 — disclose Vendor Gate; queue owner note; helper + tests | ~1 hour | **Done** (Rev 12) |
| R6-2 — drop scenarios call | minutes | **Done** |
| Commit | — | **Done** with this closeout |

**Lesson, and it is the good kind.** Rev 9 argued that clearing the 16 pre-existing errors mattered
so a non-zero count would mean something again. It was done, and the very first thing the clean
count surfaced was a real latent bug — a GPS check that had never once evaluated correctly. That is
the argument for the cleanup, made better than the cleanup's advocate made it.
