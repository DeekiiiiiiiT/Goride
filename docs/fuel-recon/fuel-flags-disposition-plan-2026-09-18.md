# Fuel Flags — disposition architecture, implementation & verification

**Date:** 2026-09-18 · **Rev 8** (Rev 7 = Round 4 done; Rev 5 = Round 3 done; Rev 3 = Round 2 done)
**Status:** Phases 0–5 + Round 2 (R-1–R-8) + Round 3 (R3-1–R3-4) + Round 4 (R4-1–R4-4)
**Done and independently verified. No open items.** Feature is complete and shippable.
Still no feature flag — this path is live.
**The only outstanding action is to commit:** all four rounds sit uncommitted on one working tree
(26 files). See §12.
**Scope:** `Fleet Operations → Fuel Flags` desk, and its synchronisation with the fuel
reconciliation wizard (`Business Finance → Week Reconciliation → Fuel`).
**Explicitly out of scope:** all fuel money math — category costs, residual classification,
driver share, settlement. This work changes classification, disposition and gating only.

---

## 0. Verification summary (Rev 8)

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

- **Not this work's debt, but worth a ticket:** 16 pre-existing typecheck errors in
  `FuelManagement.handleSaveLog`, all one root cause — the parameter is
  `FuelEntry | FuelEntry[] | { _saveAsGasCardAnchor: true; fuelEntry: FuelEntry }` and the body
  reads `entry.metadata` / `.id` / `.amount` / `.date` without narrowing. One hoisted narrow at the
  top of each arm clears the file. R4-1 is the template.
- **No feature flag exists.** `fuelFlagDispositionEnabled` was proposed in Rev 1 and never built,
  so merging enables the behaviour immediately. Expect a one-off spike in blocked weeks the first
  time a period is closed after merge: `integrity_critical` now blocks where only
  `signalTier === 'exception'` used to. That is intended, but tell the operators first.
- **Retail-estimate price outliers remain unimplemented** (F-4 was closed by deleting the legend
  row). `buildPriceOutlierFlags` still exists, unused by the desk, if that flag is ever wanted.
- **Verification traps, both of which produced wrong conclusions in earlier revisions of this
  document:** run fleet tests from `apps/fleet` (the repo root skips
  `apps/fleet/src/test/setup.ts`), run fuel-core from the repo root (no local binary), and filter
  `tsc` output by **filename** — filtering by error text hid a real regression for two revisions.
