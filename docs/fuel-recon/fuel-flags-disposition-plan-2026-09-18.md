# Fuel Flags — disposition architecture & implementation plan

**Date:** 2026-09-18
**Status:** Plan — not started
**Scope:** `Fleet Operations → Fuel Flags` desk, and its synchronisation with the fuel
reconciliation wizard (`Business Finance → Week Reconciliation → Fuel`).
**Explicitly out of scope:** all fuel money math — category costs, residual classification,
driver share, settlement. This plan changes classification, disposition and gating only.

---

## 1. System as it stands

Three independent flag systems share one input (`fuel_entries.metadata`) and never talk to
each other.

| System | Where | Grain | Disposition | Blocks lock? |
|---|---|---|---|---|
| **Fuel Flags desk** | `apps/fleet/src/utils/fuelFillFlagClassify.ts:54`, `apps/fleet/src/components/fuel/flags/FuelFlagsDesk.tsx` | per **fill** | none — `cleared` is literally `weekLocked` (`fuelFillFlagClassify.ts:193`) | no |
| **Exception blockers** | `apps/fleet/src/utils/fuelFinalizeGating.ts:166` | per **fill**, only `signalTier === 'exception'` | accept/edit → writes `reconExceptionAck` (`apps/fleet/src/pages/FuelManagement.tsx:1807`) | yes, via `exception_fills` |
| **Data-quality review** (in-flight work) | `apps/fleet/src/utils/fuelDataQualityReview.ts:13`, `apps/fleet/src/components/fuel/reconciliation/FuelDataQualityStep.tsx` | per **vehicle-week** | "Mark reviewed" → `fuel_reconciliation_period.data_quality_vehicle_reviews` | **no** — Continue button only |

The desk is the only surface with a catalogue of flags. It is the only one with no action.

### The core defect

> **Nothing in the system can move a flag from Open to Resolved. `Cleared` means "the week got
> locked", not "a human looked at it".**

Lock launders unreviewed flags. Four open flags on a week read **Cleared** the moment that week
locks, with no evidence anyone opened them. Same class of problem the settlement close audit
closed with *"make invariants unrepresentable"* — this one is still representable.

---

## 2. Findings

### Critical

**F-1 — Wizard resolution does not clear desk flags.**
Accepting an exception flips `signalTier → 'observe'` and stamps `reconExceptionAck`
(`FuelManagement.tsx:1807-1853`), but leaves `integrityStatus`, `isFlagged` and `anomalyReason`
untouched. `classifyFuelFillFlags` never consults `isFuelExceptionAcknowledged`
(`fuelFinalizeGating.ts:153`). Net effect: resolve a fill in the wizard, and the desk still shows
it **Open** with `integrity_critical` + `is_flagged`. The two surfaces disagree permanently.

**F-2 — Outlier flags are silently truncated and can vanish entirely.**
`FuelManagement.tsx:478` calls `buildStationMedianOutlierFlags(logs, vehicles, weekEnd, 80)`.
That function (`apps/fleet/src/utils/fuelAnalyticsAggregates.ts:783`) sorts **all fleet entries**
by date desc and `.slice(0, 80)` *before* the desk filters to the selected week
(`fuelFillFlagClassify.ts:178`). Select any week that is not the most recent and its price
outliers can be dropped entirely — no empty state, no warning. The `80` is also an undocumented
magic number; Analytics uses `6` (`apps/fleet/src/hooks/useFuelAnalytics.ts:301`), so the two
surfaces disagree on what an outlier is.

**F-3 — Data-quality review is a client-only gate.**
`data_quality_vehicle_reviews` is written by the new route
(`supabase/functions/_fleet-server/fuel_period_routes.ts:1679`) and read by **nothing** on the
close path — not `packages/fuel-core/src/evaluateFuelWeekClosable.ts`, not
`supabase/functions/_fleet-server/fuel_week_closable_gate.ts`.
`FuelBulkFinalizeDialog.tsx:371` closes weeks straight through the closable gate, so **bulk
finalize bypasses the new Continue gate completely.** Repeat of the week-recon audit lesson: an
SQL check is only as good as the writers that maintain its input — here there is no check at all.

### High

**F-4 — The legend promises a flag the desk never produces.**
`fuelFillFlagClassify.ts:262` documents "Price outlier — vs retail estimate", but only
`buildStationMedianOutlierFlags` is wired in. `buildPriceOutlierFlags` (Petrojam / retail markup)
is not.

**F-5 — Duplicate reason badges.**
Dedupe is by `code`, not by rendered label (`fuelFillFlagClassify.ts:118-123`).
`integrity_warning` and `is_flagged` both label with `anomalyReason`, so a fill flagged
"Odometer Regression" renders that badge twice.

**F-6 — `primarySeverity` is computed and thrown away.**
Rows sort by date only (`fuelFillFlagClassify.ts:197`). A critical exception sorts below a stale
info flag.

**F-7 — Two glossaries drifting apart.**
`FUEL_FLAG_CATEGORY_LEGEND` (`fuelFillFlagClassify.ts:216`) vs `FUEL_FLAG_GLOSSARY`
(`apps/fleet/src/components/fuel/analytics/fuelFlagGlossary.ts`). The resolve dialog's
`plainEnglishForReason` (`FuelExceptionResolveDialog.tsx:26`) does substring matching against the
*other* list.

### Medium

**F-8 — Selecting a period on the desk silently moves the wizard's week.**
`onSelectWeekStart` calls `handleReconciliationPeriodSelect` (`FuelManagement.tsx:1911`).

**F-9 — New DQ review route has no optimistic concurrency.**
Unlike its neighbours it does a blind read-modify-write with no `version` check or bump
(`fuel_period_routes.ts:1707`). Two admins marking reviews concurrently → one review silently
lost.

**F-10 — "Review details" shows the wrong fills.**
`pendingFuelLogsForVehicle` returns *pending* fills, falling back to *all* fills
(`FuelPendingLogsSheet.tsx:25`) — never the *flagged* ones. The operator is asked to mark a
vehicle reviewed after being shown evidence unrelated to why it was flagged.

**F-11 — IA split.**
Flags lives under Fleet Operations (`apps/fleet/src/components/layout/fleetNavModel.ts:184`);
the wizard lives under Business Finance. Same work, two departments.

**F-12 — Locked week + default filter = empty screen.**
Default filter is `open`; on a locked week every row is `cleared`, so the desk renders
"No open flags — try Cleared or All".

---

## 3. Target architecture

One principle:

> **A flag is a claim. A disposition is a durable, attributed record that answers it. The lock
> gate reads dispositions, not the week's lock status.**

```
fuel_entries.metadata ──► classifyFuelFillFlags() ──► FuelFlagClaim[]
                                                          │  (pure, no persistence)
                        fuel_flag_disposition ────────────┤
                        (entry_id, flag_code, action,     │
                         actor, at, note, period_id)      ▼
                                              resolveFuelFlagState()
                                          Open │ Resolved │ Accepted-with-note
                                                          │
                     ┌────────────────────────────────────┼──────────────────────┐
                     ▼                                    ▼                      ▼
              Fuel Flags desk                    Wizard: Data quality      evaluateFuelWeekClosable
              (triage view)                      (blocking subset)         + 'undisposed_flags'
```

Three rules that make the desync unrepresentable:

1. **One classifier.** `classifyFuelFillFlags` becomes the only producer of fill-level flags.
   `listExceptionTierFillBlockers` stops re-deriving from `signalTier` and instead filters
   `classify()` output to `severity === 'critical'`. One vocabulary, one dedupe, one severity
   ladder.
2. **Disposition is data, not a tier mutation.** Stop flipping `signalTier` to `'observe'` on
   accept — it is destructive (the original signal is lost) and it is the direct cause of F-1.
   Write a disposition row; the classifier subtracts dispositions.
3. **The closable gate is the single arbiter.** Add `undisposedCriticalFlags` to
   `EvaluateFuelWeekClosableInput` so wizard Continue, bulk finalize, HTTP finalize and
   auto-close all obey the same predicate. Closes F-3 by construction.

---

## 4. Phased implementation

### Phase 0 — Stop the bleeding (~½ day, no schema)

Correctness fixes to code that is not committed yet. Ship regardless of the rest of the plan.

- [ ] **F-2** Build outlier IDs per week. Filter `logs` to the week window *before* calling
      `buildStationMedianOutlierFlags`, and remove the truncation. Preferred: add
      `buildStationMedianOutlierIdSet(entries, vehicles, weekEndYmd, pct)` to
      `fuelAnalyticsAggregates.ts` with no `.slice()` and no display formatting, and have both the
      desk and Analytics derive from it.
- [ ] **F-5** Dedupe reasons by `` `${code}|${label}` ``, and drop `is_flagged` when a more
      specific `integrity_*` reason with the same label already fired.
- [ ] **F-6** Sort desk rows `severity desc, date desc`.
- [ ] **F-4** Either wire `buildPriceOutlierFlags` in, or delete the retail-estimate row from the
      legend. Do not document a flag that is never emitted.
- [ ] **F-12** When the selected week is locked, default the status filter to `all`.
- [ ] **F-9** Add version compare + bump to the DQ review route, matching its neighbours in
      `fuel_period_routes.ts`.

**Acceptance:** a unit test that picks a non-latest week containing a known station-median
outlier and asserts it appears on the desk. That test fails today.

---

### Phase 1 — The disposition record (~2–3 days)

**Migration** — `supabase/migrations/<ts>_fuel_flag_disposition.sql`:

```sql
create table public.fuel_flag_disposition (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  entry_id   uuid not null,
  flag_code  text not null,
  action     text not null check (action in ('accepted','corrected','escalated','void')),
  note       text,
  period_id  uuid references public.fuel_reconciliation_period(id),
  actor_id   uuid not null,
  at         timestamptz not null default now(),
  unique (org_id, entry_id, flag_code)
);
```

Rules:

- `action = 'corrected'` is written by the **edit fill** path, not by a button — the edit re-runs
  the classifier and the flag disappears on its own.
- `note` required (≥ 8 chars) for `accepted` on `severity === 'critical'`. Same shape as the
  existing leakage / unattributed reviews, so the evidence pack already knows how to render it.
- RLS: org-scoped, mirroring `fuel_reconciliation_period`.

**Backfill:** every entry with `reconExceptionAck` or `exceptionResolvedAt` gets a
`('signal_exception','accepted')` row carrying `exceptionResolveNote` and the original timestamp.
Keep `reconExceptionAck` readable for one release, then retire it.

**Client:**

- `classifyFuelFillFlags` gains `opts.dispositions: Map<entryId, Set<flagCode>>`. Disposed reasons
  are marked **resolved**, not dropped — the desk shows *"Accepted by X on Y — note"*, which is
  what an auditor needs.
- `listExceptionTierFillBlockers` (`fuelFinalizeGating.ts:166`) is rewritten as a filter over
  `classifyFuelFillFlags` output. Delete the parallel `signalTier` check.
- Remove the `signalTier: 'observe'` mutation from `FuelManagement.tsx:1820` and its local-merge
  workaround at `:1831-1844`.

**Acceptance:** accept a flag on the desk → the wizard's exception blocker for that fill
disappears, and vice versa, with no page reload and no `signalTier` mutation. Write it as one
test over shared state, not two per-surface tests.

---

### Phase 2 — Make the gate real (~2 days)

- [ ] Add `undisposedCriticalFlags?: boolean` → blocker code `undisposed_flags` in
      `packages/fuel-core/src/evaluateFuelWeekClosable.ts`, message
      *"Critical fill flags not dispositioned."*
- [ ] Mirror it in `supabase/functions/_fleet-server/fuel_week_closable_gate.ts` and add it to the
      Deno drift test, per the existing edge shared-code mirror pattern.
- [ ] Feed `dataQualityReviewedVehicleIds` into the same gate so bulk finalize can no longer skip
      it (`FuelBulkFinalizeDialog.tsx:371`).
- [ ] Add the user-visible message to `fuelWeekClosableBlockerMessage`
      (`apps/fleet/src/utils/fuelWeekClosableGate.ts:141`).

**Blocking subset — decide explicitly.** Recommendation:

| Severity | Behaviour |
|---|---|
| `critical` | Hard-blocks close until dispositioned |
| `warning` | Requires acknowledgement **only** if it carries money impact; otherwise counted, not gated |
| `info` | Never blocks |

Rationale: `Approaching Capacity` and `Fragmented Purchase` are warnings. If warnings block, every
week blocks and operators learn to rubber-stamp — the exact failure mode noted in the Fuel Review
Queue disposition.

**Acceptance:** each new blocker needs an input that makes `evaluateFuelWeekClosable` return
non-empty (the file's own header rule), plus one test proving bulk finalize refuses a week the
wizard would refuse.

---

### Phase 3 — Wire Data quality to the flags (~1–2 days)

This is the sync the user-facing experience actually needs.

- [ ] **F-10** `FuelPendingLogsSheet` becomes `FuelVehicleEvidenceSheet`: flagged fills first with
      their reasons, then pending fills. Reuse `buildFuelFlagDeskRows` filtered to one vehicle —
      the same rows the desk shows.
- [ ] "Mark reviewed" on a vehicle with undisposed critical flags is **disabled**, with inline
      copy: *"3 flagged fills need a decision first."* A vehicle-level ack must not outrank a
      fill-level blocker.
- [ ] The Data quality chip counts flagged fills, not just vehicle health, so the landing card
      reads *"4 flagged fills · 1 vehicle"* instead of *"Not evaluated"*.

---

### Phase 4 — IA and the desk's real job (~1–2 days)

Keep both surfaces; give them distinct jobs and connect them.

- **Fuel Flags = the standing monitor.** Cross-week, "what is going wrong in the fleet right now",
  triage and disposition. Move it next to Transaction Logs — it is a *fills* view.
- **Wizard Data quality = the week close gate.** Shows only the current week's undisposed
  blockers, and links out.
- [ ] Add the missing edges: desk row → *Open in week reconciliation*, and → *Edit fill*; wizard
      blocker → *See all flags for this vehicle*.
- [ ] **F-8** Give the desk its own `flagsWeekStart` state; replace the side-effecting dropdown
      with an explicit *"Reconcile this week →"* button.
- [ ] **F-7** One glossary keyed by `flag_code`; fold `FUEL_FLAG_CATEGORY_LEGEND` and
      `FUEL_FLAG_GLOSSARY` together and delete `plainEnglishForReason`'s substring matching.

---

### Phase 5 — Permissions and evidence (~1 day)

- [ ] `fuel-flags` nav uses `nav.fuel_logs` (`apps/fleet/src/navigation/pageRegistry.ts:63`).
      Viewing is fine; **dispositioning must require `fuel.edit_entry`**, and accepting a
      `critical` flag should require the same tier as `fuel.accept_unexplained`. Read access must
      not imply disposition access.
- [ ] Dispositions join the evidence pack and the period audit trail, so a locked week can answer
      *"who cleared this and why"* — which today it cannot.

---

## 5. UX specification for the desk

The table is currently a report; it needs to be a queue.

- **Every row needs a primary action.** Row → detail sheet with: what the flag means, the fill's
  numbers, the vehicle's recent fills for context, and three buttons —
  *Accept with note* / *Edit fill* / *Escalate to dispute*.
- **Group by vehicle, not by date.** Four separate decisions for one vehicle's bad week is four
  times the work. One card — *"5179KZ — 4 flags, $14,500"* — with bulk-accept matches the real
  workflow.
- **Status must be tri-state**: `Open` / `Resolved` / `Cleared by lock`. Collapsing the last two
  into "Cleared" is the audit hole.
- **Header counter**: *"4 open · 0 resolved · $14,500 at risk"*. The desk shows per-row amounts but
  never totals them, so nobody knows the exposure.
- Keep the legend — it is genuinely good. Collapse it by default once a user has opened it once.

---

## 6. Deliberate non-goals

- **Do not make every flag blocking.** See the severity table in Phase 2.
- **Do not touch the money math.** Everything here is classification, disposition and gating. No
  category cost, no residual, no driver share changes. Per the financial-integrity audit rule,
  that stays out of scope unless explicitly requested.
- **Do not delete the Fuel Flags desk in favour of the wizard.** They serve different jobs
  (standing monitor vs. week close gate); the fix is to connect them, not to merge them.

---

## 7. Sequencing summary

| Phase | Effort | Ship as |
|---|---|---|
| 0 — Stop the bleeding | ½ day | Straight to `main` — fixes uncommitted code |
| 1 — Disposition record | 2–3 days | One PR with Phase 2, behind `fuelFlagDispositionEnabled` |
| 2 — Make the gate real | 2 days | Same PR as Phase 1 — a disposition nothing reads is another F-3 |
| 3 — Data quality wiring | 1–2 days | Follow-up PR |
| 4 — IA and desk queue | 1–2 days | Follow-up PR |
| 5 — Permissions + evidence | 1 day | Follow-up PR |

**Total ≈ 8–10 working days.**

Phases 1 and 2 must ship together. Phase 0 is independent and should not wait.
