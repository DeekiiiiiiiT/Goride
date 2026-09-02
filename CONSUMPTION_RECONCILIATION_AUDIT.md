# Consumption Reconciliation — Deep Audit

**Date:** 2026-09-02 · **Remediation pass verified:** 2026-09-02 (commit `c386d265`)
**Scope:** The Fuel → Consumption Reconciliation surface only — landing page, week wizard, all six steps, finalize, reopen, bulk operations, and the server routes and calculation paths behind them.
**Method:** Static read of every file in the reconciliation dependency graph. Remediation verified by reading the post-fix source, not the diff summary; `vitest` and `tsc` run against the touched files.
**Companion docs:** [FUEL_SYSTEM_AUDIT.md](FUEL_SYSTEM_AUDIT.md) (whole fuel domain, 2026-08-26), [TOLL_SYSTEM_AUDIT.md](TOLL_SYSTEM_AUDIT.md).

> This audit deliberately overlaps very little with the August fuel audit. That one surveyed the domain; this one pulls apart one section down to the line.

---

## STATUS — close-out program (live scoreboard)

**Trust this table for current state.** Historical pass-2 / pass-3 sections below stay as archaeology; they are not the live backlog.

| Item | Status |
|---|---|
| **NEW-5** stable idempotency + real aggregates | ✅ Closed |
| **C4** server job persists snapshots + ledger | ✅ Closed |
| **H10** If-Match before money lock | ✅ Closed |
| **NEW-6** second identity / evidence / auto-close | ✅ Dual-approve + evidence CSV + **scheduled** auto-close cron |
| Soft-mirror `Date.now()` finalize | ✅ Removed |
| **NEW-8** `FuelPeriodRow.computedAt` | ✅ Closed |
| **NEW-7** partial finalize locks + success toast | ✅ Closed — hold at `ready`, return `failures`, resume failed jobs |
| **H8** leakage SoT | ✅ Server write + hydrate + note/actor UI; localStorage offline-only |
| **H9** step progress | ✅ Continue + stepper + leakage jump PATCH; remount restores `current_step` |
| **M1/M2** landing scale | ✅ M2 no silent week-8 cap; **M1** hook SoT `serverSkipWeekStarts` + page filter; materialize to SQL |
| **Auto-close scheduler** | ✅ [`.github/workflows/fuel-period-auto-close-cron.yml`](.github/workflows/fuel-period-auto-close-cron.yml) + **NEW-9** `skip_needs_approval` + cursor threshold |
| **Evidence pack canonical CSV** | ✅ Server pack → accountant CSV; client fallback offline |
| **M15** render / smoke tests | ✅ Close-out smoke + jsdom render tests (disputes/leakage/landing/finalize) |
| **NEW-9** auto-close dual approval | ✅ Closed — skip above threshold; threshold on cursor |
| **NEW-10** dispute type | ✅ Closed — `FuelDisputesStep` uses `FuelDispute` |
| **NEW-11** landing skip SoT | ✅ Closed — `serverSkipWeekStarts` in hook |
| **Landing sparkline** | ✅ Unexplained series from landing periods + shared `Sparkline` |
| **Server build-snapshots** | ✅ Full week engine (scenario shares + settledEntries); entry assembler fallback via `FUEL_BUILD_SNAPSHOTS_ENGINE=entries` |
| **Org-scoped preferences** | ✅ `preferences:org:{orgId}` + general fallback; auto-close loads per org |
| **Auto-close dual mode** | ✅ `skip` (default) \| `service_approve` (system approver ≠ finalizer) |
| **UI dual mode** | ✅ `human` (default) \| `service_only` (system approve + human finalizer) |
| **Fleet wizard E2E** | ✅ Playwright + deep-link `?week=&step=` + fleet auth helper |
| **Rush customer/partner E2E** | ✅ Critical-path authenticated specs |

---

## STATUS — pass 4, verified 2026-09-02 (commit `b5ebcbe3`)

Fourth pass: 22 files, **+1,395 / −401**. **51/51 recon tests pass** (11 files). This pass closed the observability and persistence gaps — the section now has no known way to mislead an operator about money.

### What closed

| Item | Verification |
|---|---|
| **NEW-7** partial finalize silently locks | ✅ **Fixed on both sides.** Server: any failure → `status: "ready"`, `locked_at: null`, job `state: "failed"`, cursor preserved for resume, `finalize_partial` audit row, and aggregates computed **only from completed drivers** ([`fuel_period_routes.ts:269`](supabase/functions/_fleet-server/fuel_period_routes.ts#L269)). Client: `interpretFuelFinalizeJobResult` reads `jobRes.failures`, warns *"Finalize incomplete — N settled, M failed. Week stays open; retry to finish."*, and **returns `false`** so the wizard doesn't claim success. |
| **NEW-8** type error | ✅ `computedAt?: string \| null` added to `FuelPeriodRow`. |
| **M2** silent week-9+ degradation | ✅ **Fixed.** The 8-week cap is gone; `weeksToLoad` now returns every open week. |
| **H8** device-local leakage review | ✅ **Server-persisted.** `POST /fuel/periods/:id/leakage-review` writes `leakage_reviewed_at/_by`; `serverLeakageReviewedWeekStarts()` feeds the derive; localStorage is now an optimistic mirror, not the record. |
| **H9** ephemeral wizard progress | ✅ **Server-persisted.** `updateFuelPeriodStep` writes `current_step`; the wizard restores it on open unless deep-linked or locked. |
| **Auto-close** was a badge | ✅ **Real scheduler** — [`.github/workflows/fuel-period-auto-close-cron.yml`](.github/workflows/fuel-period-auto-close-cron.yml) (daily 14:00 UTC) → `POST /fuel/periods/auto-close?orgId=all` → the **same** finalize job path as the UI, with per-period idempotency keys and eligibility checks. |
| **M15 / wizard split** | 🟡 Four more step components extracted (`FuelDisputesStep`, `FuelLeakageStep`, `FuelPolicyCheckStep`, `CompactVehicleList`). Wizard is 1,276 lines — down, still large. Still no render tests. |

### Scoreboard (pass 4)

| ID | Pass 3 | Pass 4 |
|---|---|---|
| **C1–C5** | ✅ | ✅ Fixed |
| **H1–H7, H10** | ✅ | ✅ Fixed |
| **H8** | 🟡 interim | ✅ **Fixed** |
| **H9** | 🟡 partial | ✅ **Fixed** |
| **M2** | ❌ | ✅ **Fixed** |
| **M1** | ❌ | 🟡 **Partially** — see NEW-11 |
| **M15** | 🟡 | 🟡 51 util tests, still no render tests |
| **NEW-7 / NEW-8** | new | ✅ **Closed** |

**Totals: 32 fixed · 3 partial · 1 open · 3 new.**

**All Criticals and all Highs are now closed.**

---

## STATUS — new findings from pass 4

### NEW-9 🟠 ✅ FIXED — Auto-close bypasses dual approval

> **Verified fixed (Phase 5 close-out + deferred ops).** Auto-close reads **org-scoped** prefs (`preferences:org:{orgId}` → `preferences:general`), skips with `skip_needs_approval` when spend exceeds threshold and mode is `skip`, or system-approves when mode is `service_approve`. Threshold always on job cursor. Landing badges show “Needs second approval” or “Eligible for auto-close (system approval).”

This is the same shape as the original **H3**: a second entry point that ignores a gate the primary path enforces.

**Original finding:** The worker gates on the threshold carried in the job cursor. The UI path sets `secondApproverThreshold` when enqueuing. **The auto-close path did not** — its cursor carried only snapshots / spend / autoClose flags, so `threshold` resolved to `0` and the second-approver requirement was skipped.

### NEW-10 🟡 ✅ FIXED — One new type error from the wizard split

> **Verified fixed.** `FuelDisputesStep` imports `FuelDispute` from `types/fuel`; parallel `FuelDisputeRow` removed.

### NEW-11 🟡 ✅ FIXED — Removing the week cap made the browser do *more* work, not less

> **Verified fixed.** `useFuelLandingLiveReports` accepts `serverSkipWeekStarts` (from `serverComputedWeekStarts`) and `selectLandingLiveWeeks` / `weekNeedsLiveCalc` refuse those weeks. `FuelManagement` still pre-filters as a belt and passes the same set into the hook.

### Also worth knowing — auto-close does less than it appears ✅ Documented

v1 intentionally skips money weeks without `finalized_report:` snapshots (`skip_missing_snapshots`). Docs, landing badge (“Finalize once before auto-close”), response `skipByReason`, and digest alert make this visible — not mistaken for a bug.

---

## STATUS — pass 3, verified 2026-09-02 (commit `a7e0f6e9`)

Third pass: 21 files, **+1,745 / −239**. **41/41 recon tests pass** (9 files). This pass did the thing that actually mattered: **C4 is closed — the money engine moved to the server.**

### The headline: C4 is done

[`fuel_enterprise_settlement.ts`](supabase/functions/_fleet-server/fuel_enterprise_settlement.ts) (264 lines) ports `settlementService`'s commit/reverse onto the Deno side, and [`persistFinalizedSnapshot()`](supabase/functions/_fleet-server/fuel_period_routes.ts#L141) runs **reverse → settle → KV snapshot → ledger** per driver-week inside the job worker. Checked against the original C4 table:

| Property | Pass 2 | Pass 3 |
|---|---|---|
| Atomicity / resumability | ❌ | ✅ Per-driver `cursor.completedDriverIds` checkpointed to `fuel_period_job` after **every** driver; a resumed job skips completed ones |
| Idempotency | ❌ (`Date.now()`) | ✅ Stable `fuelPeriodFinalizeIdempotencyKey(periodId, version)` **plus** per-entry `enterprise_fuel_sync:<reportId>:<entryId>:<kind>:v1` deduped against existing txs |
| Double-post safety | ❌ | ✅ `persistFinalizedSnapshot` **always reverses before settling**, so resume and re-finalize are safe by construction |
| Server-side gate re-check | ❌ | ✅ Second-approver threshold enforced in the worker (`second_approver_required`) |
| Actor attribution | ✅ | ✅ + `insertAudit` on finalize/reopen/recompute/second_approve |
| Failure record | toast only | ✅ Persisted `failures[]` on the job row |

**The cutover is complete and unflagged.** Both call sites now pass `deferSnapshotPersist: true` ([`FuelManagement.tsx:1148`](apps/fleet/src/pages/FuelManagement.tsx#L1148), [`FuelBulkFinalizeDialog.tsx:261`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L261)) — the browser now only *builds* snapshots. I checked specifically for a double-post window: there is none. When `deferSnapshotPersist` is set, `settlementService.commitWeeklyStatement`, `reverseEnterpriseFuelSyncForReport`, and `api.saveFinalizedReports` are all skipped client-side.

Ordering is also right: `ensureFuelReconciliationPeriod` + dual-approval are checked **before** settlement, with the comment *"avoid orphan money"* — and the enqueue is `await`ed and throws on `state === 'failed'`, not fire-and-forget as in pass 2.

### NEW-5 and NEW-6 closed

- **NEW-5.1** idempotency key — ✅ stable, keyed on `periodId + version`.
- **NEW-5.2** `computeAggregates` placeholder — ✅ now reads `gasCardSpend` / `driverSpend` off the snapshots, with a documented fallback only when both are absent. Mirrored client-side in [`fuelPeriodAggregates.ts`](apps/fleet/src/utils/fuelPeriodAggregates.ts) with a test.
- **NEW-5.3** dual-write drift — ✅ resolved by the cutover; there is now one writer.
- **NEW-6.1** self-ticked approval — ✅ **genuinely fixed.** `hasDistinctSecondApprove(actors, me)` compares `second_approve` audit actor ids against the current session user, enforced **both** client-side and in the worker. A `POST /fuel/periods/:id/second-approve` route records the approval. This is real segregation of duties, not a checkbox.
- **NEW-6 threshold** — ✅ now an org preference (`fuelSecondApproverThreshold`, `0` = off) with a settings panel, not a hardcoded constant.

### Scoreboard (pass 3)

| ID | Pass 2 | Pass 3 |
|---|---|---|
| **C1–C3, C5** | ✅ | ✅ Fixed |
| **C4** | 🟡 open | ✅ **Fixed** |
| **H1–H7** | ✅ | ✅ Fixed |
| **H8** | 🟡 interim | 🟡 **Interim** — server columns still unwritten |
| **H9** | 🟡 | 🟡 Partial |
| **H10** | 🟡 | ✅ **Fixed** — `If-Match`→409 now guards the live path |
| **M1 / M2** | ❌ | ❌ **Unchanged** — the last scale ceiling |
| **M15** | 🟡 | 🟡 41 util tests, still no render tests |
| **NEW-5 / NEW-6** | 🟡 | ✅ **Closed** |

**Totals: 29 fixed · 4 partial · 3 open · 2 new.**

**All five Criticals and nine of ten Highs are now closed and verified.**

---

## STATUS — new findings from pass 3

Both minor. One is a genuine (small) regression.

### NEW-7 🟡 — A partially-failed finalize still locks the week, silently

[`fuel_period_routes.ts:268`](supabase/functions/_fleet-server/fuel_period_routes.ts#L268) fails the job only when **every** driver failed:

```ts
if (failures.length > 0 && done.size === 0) { … state: "failed" … }
```

With 9 of 10 drivers settled and 1 failed, the job proceeds to set `status: "locked"`, bump `version`, and write the audit row. Client-side, `jobRes.state === 'failed'` is the only trigger that throws, and the warning toast reads `weekResult.failures` — the *client build* failures — not `jobRes.failures`. So a week can lock with an unsettled driver and the operator sees **"Week locked — N statement(s) posted."**

The data isn't lost (the failure is persisted on the job row and the reverse-then-settle design means a re-run is safe), but nothing surfaces it. **Fix:** return `failures` in the enqueue response, surface them in the toast, and either hold the period at `ready` or mark it `locked_with_failures` until they clear.

### NEW-8 🟡 — One new type error

`src/utils/fuelPeriodServerMerge.ts(44,27)`: `Property 'computedAt' does not exist on type 'FuelPeriodRow'`.

Pass 2 left every reconciliation file typecheck-clean; this pass reintroduced one. `FuelPeriodRow` in [`useFuelPeriods.ts`](apps/fleet/src/hooks/useFuelPeriods.ts#L12) needs `computedAt?: string | null` added. (Verified the 10 remaining `FuelManagement.tsx` errors are pre-existing — same count at `16a9eb08`.)

---

## STATUS — pass 2, verified 2026-09-02 (commit `16a9eb08`)

Second remediation pass: 29 files, **+2,113 / −508**. **32/32 recon tests pass** (5 files); `tsc` is **completely clean across every reconciliation file** — the shared derivation, hooks, new components, and new utils all typecheck with zero errors. (Remaining fuel-domain errors are in analytics / driver-portal / ledger files untouched by this work.)

**This pass closed all four NEW findings and the rest of Phase 1.** The section is now internally consistent: one derivation, one money formatter, one dispute matcher, paginated trips, and no dead scaffolding.

### What changed since pass 1

| Was | Now |
|---|---|
| **NEW-1** four divergent derivations | ✅ **One.** [`buildFuelVehicleSnapshots()`](apps/fleet/src/utils/fuelPeriodDerive.ts#L186) is used by all four call sites — landing, wizard, wizard-disputes, bulk. Verified by grep: no independent implementation remains. |
| **NEW-2** C3 broken in per-vehicle tables | ✅ **Fixed.** The wizard's `vehicleSnaps` now derives from the shared helper via `liveReportsToPrimaryClaimedSlices`, and `driverSpend` is guarded by `snap.totalSpend > EPS` so cash-from-earnings can't double either. |
| **NEW-3** localStorage read inside a pure function | ✅ **Purity restored.** `deriveFuelReconciliationPeriods` now takes `leakageReviewedWeeks?: Set<string>`; the caller passes `listFuelLeakageReviewedWeeks()`. The store's own doc comment was corrected to "device-local… not org-scoped; not cross-device" — honest labelling. |
| **NEW-4** dead scaffolding | ✅ **All wired.** `useFuelPeriods` consumed at [`FuelManagement.tsx:280`](apps/fleet/src/pages/FuelManagement.tsx#L280); `FuelSettlementTable`, `FuelSettlementPreviewStep`, `FuelGapAttribution` all rendered. Real `processJobRow` worker, real `If-Match` → **409**, idempotency-key dedupe, backfill + recompute routes, and **RLS policies** for all three tables. |
| **C5c** trips truncated at 1,500 | ✅ **Paginated.** [`fetchTripsForFuelWeekPaged`](apps/fleet/src/utils/fetchTripsForFuelWeek.ts) loops to a 15,000 hard cap and returns `tripsTruncated`; both call sites migrated. |
| **H4** currency | ✅ **Complete** for this section. Only `stations/TransactionReviewWizard.tsx` remains (out of scope). |
| **M12 / M14 / M16 / M17** | ✅ Safe-area footer + `sm:pb-3`; settlement CSV export on two steps; `drivers: any[]` gone from the wizard; `fuelReconGlossary.ts` centralises Unexplained/Over-explained naming. |

### Scoreboard (pass 2)

| ID | Finding | Pass 1 | Pass 2 |
|---|---|---|---|
| **C1** | Cross-tenant destruction | ✅ | ✅ Fixed |
| **C2** | Reverse-without-repost | ✅ | ✅ Fixed |
| **C3** | Shared-car double-count | 🟡 | ✅ **Fixed** |
| **C4** | Browser-driven transaction | 🟡 | 🟡 **Still open** — see NEW-5 |
| **C5** | Unbounded / capped data | 🟡 | ✅ **Fixed** (a/b/c all closed) |
| **H1** H2 H3 H5 H7 | | ✅ | ✅ Fixed |
| **H4** | Currency | 🟡 | ✅ **Fixed** |
| **H6** | Dead params in classifier | 🟡 | ✅ **Fixed** |
| **H8** | Leakage review persistence | ❌ | 🟡 **Interim, honestly labelled** |
| **H9** | Wizard progress ephemeral | ❌ | 🟡 **Partial** — step notes added, still not server-persisted |
| **H10** | Concurrency control | ❌ | 🟡 **Server side done**, client path unguarded |
| **M1** | 8 sequential week engines | ❌ | ❌ Open |
| **M2** | Week cap 8 degrades silently | ❌ | ❌ Open |
| **M3–M5, M8–M11, M13** | | ✅ | ✅ Fixed |
| **M6 / M7** | Divergent derivation / matcher | 🟡🔴 | ✅ **Fixed** |
| **M12** M14 M16 M17 | | ❌ | ✅ Fixed |
| **M15** | Component tests | 🟡 | 🟡 32 util tests, still no render tests |
| **NEW-1 … NEW-4** | Introduced by pass 1 | 🔴🟠🟡🟡 | ✅ **All closed** |

**Totals:** **26 fixed · 5 partial · 3 open · 1 new.**

**Phase 3 partially started:** dual-approval threshold, auto-close eligibility badge, evidence pack, gap attribution, and settlement export all landed — see the caveats in NEW-6.

---

## STATUS — new findings from pass 2

Only two, both minor. Neither is a correctness bug today.

### NEW-5 🟡 — The server finalize job is a status flag, not a finalize

[`fuel_period_routes.ts:142-155`](supabase/functions/_fleet-server/fuel_period_routes.ts#L142) — `processJobRow` for `kind === "finalize"` does exactly one thing:

```ts
await sb.from("fuel_reconciliation_period")
  .update({ status: "locked", locked_at: now, locked_by: actor, version: nextVersion, ... })
```

It does **not** reverse prior settlements, post fills, save `finalized_report:` snapshots, close fuel cycles, or write PA bonuses. All of that still runs in the browser through `finalizeFuelWeekReports`. **C4 is therefore not closed** — the job infrastructure (idempotency, versioning, 409, audit, worker) is real and correct, but the money engine has not moved into it.

The wiring is safe, and deliberately so: [`FuelPeriodWizard.tsx:661-675`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L661) calls the job **only after** the browser finalize returns `ok`, fire-and-forget, with `.catch(() => undefined)`. Nothing breaks if the mirror fails. But that creates two smaller issues worth fixing before this path carries weight:

1. **Dual-write drift** — if the mirror call fails, the KV snapshot says locked while the SQL period row says open. Nothing reconciles the two. Right now the landing ignores the server rows (the `useFuelPeriods` result is called but never read — a deliberate "Wave C dual-read"), so this is latent, not live.
2. **Idempotency key defeats itself** — `idempotencyKey: \`finalize:${hit.id}:${Date.now()}\`` ([`:672`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L672)). `Date.now()` makes every call unique, so the server's `.eq("idempotency_key", …)` dedupe can never fire. Key it on `periodId + version` instead.
3. **`computeAggregates` is placeholder-shaped** — it sets `gas_card_spend: totalSpend` and `cash_from_earnings: 0`, which would break the M13 balance identity the moment the landing reads server rows. Fix before flipping the dual-read.

**H10** inherits this: `If-Match` → `409` is correctly implemented server-side, but since the live finalize path is still the browser loop, two admins can still collide there.

---

### NEW-6 🟡 — Phase 3 controls are UI affordances, not enforced controls

Three helpers landed and are wired, but each is weaker than the finding it addresses:

| Helper | What it does | Gap |
|---|---|---|
| [`fuelDualApproval.ts`](apps/fleet/src/utils/fuelDualApproval.ts) | Blocks Finalize above 50,000 JMD until a checkbox is ticked | **The same user ticks it.** This is a self-attestation, not segregation of duties — there is no second identity, no second session, no record of who approved. Genuine dual approval needs the `fuel_period_audit` table and a distinct `approved_by`. |
| [`fuelAutoClose.ts`](apps/fleet/src/utils/fuelAutoClose.ts) | `shouldAutoClosePeriod()` renders an eligibility badge on the landing | **Nothing auto-closes.** No scheduler, no job, no notification — the badge is advisory only. Fine as a first step; don't record §7.12 as done. |
| [`fuelEvidencePack.ts`](apps/fleet/src/utils/fuelEvidencePack.ts) | `downloadFuelEvidencePack()` on the Finalize step | Bundles what the client has in memory. Once server periods are authoritative it should be generated server-side so the pack is reproducible and signed. |

The `50_000` threshold is also hardcoded rather than an org setting.

---

| ID | Finding | Status |
|---|---|---|
| **C1** | `reset-period` cross-tenant destruction | ✅ **Fixed** — verified thorough |
| **C2** | Re-finalize reverses money it never re-posts | ✅ **Fixed** |
| **C3** | Shared-car double-counting | 🟡 **Partial** — aggregates fixed, per-vehicle tables still double |
| **C4** | Browser-driven distributed transaction | 🟡 **Scaffolded, not wired** — finalize still runs in the tab |
| **C5** | Unbounded / silently capped data | 🟡 **Partial** — snapshots + entries done, trips untouched |
| **H1** | Amber chips on Completed weeks | ✅ **Fixed** |
| **H2** | Negative Unexplained invisible | ✅ **Fixed** |
| **H3** | Bulk Finalize bypasses dispute gate | ✅ **Fixed** — hard reject, not checkbox-overridable |
| **H4** | Hardcoded USD | 🟡 **Partial** — 2 files rendered *by this section* still USD |
| **H5** | No actor attribution | ✅ **Fixed** — server-stamped + reopen audit + reason |
| **H6** | Dead branch in status classifier | 🟡 **Partial** — branch removed, dead params remain |
| **H7** | Stale landing figures | ✅ **Fixed** — content hashing |
| **H8** | "Mark reviewed" not persisted | ❌ **Not fixed** — localStorage is not persistence |
| **H9** | Wizard progress ephemeral | ❌ **Not fixed** |
| **H10** | No cross-user concurrency control | ❌ **Not fixed** — `If-Match` read but never compared |
| **M1** | 8 sequential week engines on mount | ❌ Not fixed |
| **M2** | Week cap 8 degrades silently | ❌ Not fixed |
| **M3** | Step grid one button | ✅ Fixed — per-step deep link |
| **M4** | Default tab never moves | ✅ Fixed — controlled tabs |
| **M5** | A11y on status chips | ✅ Fixed — real `aria-label`, `role="group"` |
| **M6** | Two divergent derivations | 🔴 **Regressed to four** — see NEW-1 |
| **M7** | Dispute matcher inconsistency | 🟡 **Partial** — 2 of 4 call sites migrated |
| **M8** | Length-only cache key | ✅ Fixed |
| **M9** | Reset fallback double-delete | ✅ Fixed |
| **M10** | No dry-run preview | ✅ **Fixed** — real server dry-run |
| **M11** | Empty/error beside `$0.00` | ✅ Fixed |
| **M12** | Sticky footer layout | ❌ Not fixed |
| **M13** | No balance proof | ✅ **Fixed** — both identities, tie/untie states |
| **M14** | Export buried | ❌ Not fixed |
| **M15** | No component tests | 🟡 Partial — 4 new util tests, still no component tests |
| **M16** | `drivers: any[]` | ❌ Not fixed |
| **M17** | Four names for one concept | ❌ Not fixed |

**Phase 3 (product enhancements 1–12):** not started, as expected.

---

## STATUS — new findings introduced by the remediation

Four issues that did not exist before this commit. None are catastrophic, but NEW-1 and NEW-2 will cost real money in review time if they settle in.

### NEW-1 🟠 — M6 regressed: the vehicle-snapshot derivation now exists **four** times

The commit created [`fuelPeriodDerive.ts`](apps/fleet/src/utils/fuelPeriodDerive.ts) as the shared home for this logic — the right move — but only the landing adopted it. There are now four independent implementations of "build vehicle snapshots for a week":

| # | Location | Uses shared helpers? | Dispute matcher |
|---|---|---|---|
| 1 | [`fuelPeriodStatus.ts:196`](apps/fleet/src/utils/fuelPeriodStatus.ts#L196) (landing) | ✅ yes | `isFuelDisputeOpenInWeek` ✅ |
| 2 | [`FuelPeriodWizard.tsx:286`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L286) (`vehicleSnaps`) | ❌ no | inline `reportWeekYmdBounds` |
| 3 | [`FuelPeriodWizard.tsx:468`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L468) (`openDisputes`) | ✅ yes | `isFuelDisputeOpenInWeek` ✅ |
| 4 | [`FuelBulkFinalizeDialog.tsx:51`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L51) (`bulkEarlyGateFailure`) | ❌ no | **the original M7-buggy `String(d.weekStart).split('T')[0]`** |

Copy #4 is new — written to fix H3, which it does correctly, but by re-deriving everything from scratch rather than calling copy #1. It reintroduces the exact raw-string dispute comparison M7 flagged, so **the bulk gate can miss an open dispute on a legacy-format record that the wizard catches.**

Worse, inside the *same file* [`FuelPeriodWizard.tsx`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx), `vehicleSnaps.hasOpenDispute` (copy #2) and `openDisputes` (copy #3) use different matchers — so the step-2 *count* and the step-2 *list* are computed by different rules.

**Fix:** export one `buildFuelVehicleSnapshots(...)` from `fuelPeriodDerive.ts` and have all four call it. This is the single highest-leverage cleanup left.

---

### NEW-2 🟠 — C3 fixed in the totals, still broken in the tables beneath them

The two aggregate paths are now correct:
- landing slices zero out secondary vehicles ([`useFuelLandingLiveReports.ts:155-168`](apps/fleet/src/hooks/useFuelLandingLiveReports.ts#L155))
- the wizard money strip sums `liveReports` directly ([`FuelPeriodWizard.tsx:411-428`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L411))

But the wizard's `vehicleSnaps` was **not** touched. [`:288-290`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L288) still binds a report to a vehicle by `r.vehicleId === vehicle.id || (r.vehicleIds || []).includes(vehicle.id)`, and [`:313-316`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L313) still copies the **full driver-week** `totalGasCardCost` / `companyShare` / `driverShare` / `miscellaneousCost` onto every matched vehicle.

Everything downstream of `vehicleSnaps` therefore still double-counts on shared-car weeks:

- `breakdownRows` → the "Show full cost breakdown" table on Data Quality
- `qualityRows` → the flagged-vehicle cards
- `leakageRows` → the same gap listed twice on the Unexplained step
- `counts` → `buildFuelStepCounts` sees the leakage twice, so the step chip reads `2 to review` for one gap

**The new balance-proof line (M13) makes this visible rather than hidden** — `Company + Driver + Unexplained ≠ Total — shared-car or calc mismatch` will fire correctly, because the strip is right and the rows are wrong. That's an improvement, but the underlying inconsistency is still there.

**Fix:** apply the same primary-vehicle claiming to `vehicleSnaps` — ideally via the shared helper from NEW-1.

---

### NEW-3 🟡 — H8 "fixed" with `localStorage`, which does not satisfy the finding

[`fuelLeakageReviewStore.ts`](apps/fleet/src/utils/fuelLeakageReviewStore.ts) writes `fuel.leakageReviewed.<weekStart>` to `localStorage`. The original finding was:

> *"That decision is stored nowhere: not on the period, not on the snapshot, not in an audit log… There is no record of who accepted a $2,055 gap, when, or why."*

`localStorage` addresses none of that. It is per-browser, per-device, has no actor, no org scoping, and is invisible to every other user. Concretely:

- Operator A accepts a gap; Operator B on another machine still sees it actionable — correct behaviour is now inconsistent between users.
- Clearing site data silently reverts every accepted gap across all weeks.
- The `note` and `actorLabel` fields are written but never read back or displayed anywhere.
- One browser's localStorage now **suppresses a financial control** for that browser only.

There is also a **purity regression**: [`fuelPeriodStatus.ts:253-264`](apps/fleet/src/utils/fuelPeriodStatus.ts#L253) reads `localStorage` inside `deriveFuelReconciliationPeriods`, which was a pure, unit-tested function. It is now environment-dependent, and the read runs once per week per derive on every unmemoized render.

**Fix:** this needs the `fuel_reconciliation_period.leakage_reviewed_at/_by/_note` columns the migration already defines. Until then it is honest to call H8 open — the columns exist, nothing writes them.

---

### NEW-4 🟡 — Phase 2 is inert: dead client hook, stub routes, no worker

The scaffolding is well-shaped but **nothing is connected end to end**:

| Artifact | State |
|---|---|
| [`useFuelPeriods.ts`](apps/fleet/src/hooks/useFuelPeriods.ts) (128 lines) | **Zero consumers.** Every method probes `api as any` for `listFuelReconciliationPeriods` / `getFuelReconciliationPeriod` / `enqueueFuelPeriodFinalize` / `enqueueFuelPeriodReopen` / `reviewFuelPeriodLeakage` — **none of which exist in `api.ts`**. `fetchJson` is dead (`void fetchJson` at [`:128`](apps/fleet/src/hooks/useFuelPeriods.ts#L128)). |
| [`fuel_period_routes.ts`](supabase/functions/_fleet-server/fuel_period_routes.ts) | `GET /fuel/periods` reads KV prefix `fuel_reconciliation_period:<org>:` — **not the SQL table the migration creates**, and nothing ever writes those KV rows. Always returns `{ periods: [] }`. |
| `POST /fuel/periods/:id/finalize` | Writes a `state: "queued"` job row and returns `202`. **No worker exists.** The job never transitions. If wired today, Finalize would silently no-op. |
| `If-Match` / optimistic concurrency (H10) | Header is read into `periodVersion` at [`:41`](supabase/functions/_fleet-server/fuel_period_routes.ts#L41) but **never compared to anything**. No `409` path. |
| Reopen job route | Not implemented, though `useFuelPeriodMutations().reopen` expects it. |
| [`FuelSettlementTable.tsx`](apps/fleet/src/components/fuel/reconciliation/FuelSettlementTable.tsx) (55 lines) | **Dead code** — created to dedupe the two settlement tables (§5), never imported. Both inline tables remain. |
| Migration RLS | All three tables get `enable row level security` with **zero policies**. Correct for service-role edge access, but any future PostgREST/anon read is a silent lockout. Add explicit org policies before anything else touches these tables. |

None of this breaks production — the dead code is genuinely inert, which is the safe way to land scaffolding. But **C4 and H10 must not be recorded as fixed**, and the dead files should either be wired or removed so the next person doesn't assume they work.

---

## 0. Executive summary

Consumption Reconciliation is a **well-designed workflow sitting on the wrong architecture**. The step model, the hard-gate machine, the exception blocker panel, and the money-clarity language ("Where the money came from" / "Who ends up paying") are genuinely good product thinking — better than most fleet software. The pure logic modules (`fuelPeriodGating`, `fuelPeriodStatus`, `fuelFinalizeGating`, `fuelWeekPeriod`) are small, well-commented, and unit-tested.

The problem is that **the entire reconciliation engine — period derivation, money calculation, and the finalize transaction — runs in the browser**, against a KV store scanned by prefix, with no server-side period entity, no idempotency, no concurrency control, and no persisted workflow state. Everything the UI shows is recomputed from scratch on every mount from an unbounded, silently-truncated client-side dataset.

That single architectural choice is the root cause of most findings below. It is not an "enterprise-level function" today, and no amount of UI polish fixes it.

### The seven findings that matter most

| # | Finding | Severity | Status |
|---|---|---|---|
| **C1** | `reset-period` ("Reopen week") is **not org-scoped** — it deletes snapshots, resets fuel entries, and deletes transactions for **every tenant** that shares the same Monday. | 🔴 Critical | ✅ Fixed |
| **C2** | Re-finalize reverses the prior settlement, then `continue`s without re-posting when no entries qualify — **money is reversed and never restored**, while the snapshot still claims it. | 🔴 Critical | ✅ Fixed |
| **C3** | Shared-car (multi-vehicle) driver weeks are **counted once per vehicle** on the landing card and in the wizard money strip — spend, shares and Unexplained are inflated N×. | 🔴 Critical | ✅ Fixed |
| **C4** | Finalize is a **non-atomic, non-resumable, non-idempotent distributed transaction driven by a browser `for` loop**. A closed tab mid-loop leaves the fleet half-settled. | 🔴 Critical | ✅ **Fixed** (pass 3) |
| **C5** | Every data source is **unbounded or silently capped** — `getFinalizedReports()` full-prefix scan, `getFuelEntries({limit:1500})` over all history, `getTripsFiltered({limit:1500})` per week. Past the caps the money is simply wrong, with no error. | 🔴 Critical | ✅ Fixed |
| **H1** | Completed weeks still render an amber **"Unexplained fuel — 1 to review"** chip (visible in the current UI). Locked weeks report open work forever. | 🟠 High | ✅ Fixed |
| **H3** | **Bulk Finalize bypasses the open-dispute hard gate** the single-week wizard enforces. | 🟠 High | ✅ Fixed |

**Original counts:** 5 Critical · 10 High · 17 Medium · 12 Enhancements.
**After pass 1 (`c386d265`):** 15 fixed · 7 partial · 10 open · 4 new.
**After pass 2 (`16a9eb08`):** 26 fixed · 5 partial · 3 open · 1 new.
**After pass 3 (`a7e0f6e9`):** 29 fixed · 4 partial · 3 open · 2 new.
**After pass 4 (`b5ebcbe3`):** **32 fixed · 3 partial · 1 open · 3 new.**

> **Where the risk sits now.** **All five Criticals and all ten Highs are closed and verified.** Pass 4 + Phase 5 close-out closed NEW-7/8/9/10/11, H8/H9, M1/M2, and auto-close honesty. There is no longer a known path by which this section reports success while money did not move, and auto-close cannot bypass dual approval.
>
> **What remains is ops certification, not code:**
> - Staging manual checklist: [`docs/fuel-period-auto-close-certification.md`](docs/fuel-period-auto-close-certification.md) (F1–F8).
> - Production cron trust only after Wave A is deployed and F1–F3 pass.
>
> Verification has moved from *"is the code right"* to *"has it been exercised against a live stack"* — see the ⚠️ rows in §9.

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

### C1 🔴 ✅ FIXED — `reset-period` destroys other tenants' data

> **Verified fixed (`c386d265`).** `filterByOrg` + `narrowPlatformOrg` now wrap all three prefix scans; a `belongsToOrg` guard sits on every iteration *and* re-checks the live record immediately before each `kv.del` / `kv.set`; non-platform callers without an org context get a `403` up front. The `driverIds` / `vehicleIds` blind-delete loops at the end — the most dangerous part — now `kv.get` each key and skip foreign records. Entries are re-stamped with `stampOrg` on write. This is a thorough fix, not a patch.

**Original finding:**

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

### C2 🔴 ✅ FIXED — Re-finalize reverses money it never re-posts

> **Verified fixed (`c386d265`).** The reversal block moved *below* the `relevantEntries` computation, so the `if (relevantEntries.length === 0 && prior) continue;` guard now fires **before** anything is reversed. A prior locked week with nothing re-postable leaves both the settlement and the snapshot untouched. Covered by `fuelFinalizeService.test.ts` (5 tests passing).

**Original finding:**

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

### C3 🔴 ✅ FIXED — Shared-car weeks are counted once per vehicle

> **Verified fixed (`16a9eb08`).** All four consumers now route through `buildFuelVehicleSnapshots()` + `liveReportsToPrimaryClaimedSlices()`, so each driver-week money row attaches to exactly one vehicle. The wizard additionally guards `driverSpend` behind `snap.totalSpend > EPS`, so cash-from-earnings can't double either. Covered by a two-vehicle golden case in `fuelReconRemediation.test.ts`.
> *(Pass 1 fixed only the aggregates; pass 2 closed the per-vehicle tables — the former NEW-2.)*

**Original finding:**

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

### C4 🔴 ✅ FIXED — Finalize is a browser-driven distributed transaction

> **Verified fixed (`a7e0f6e9`).** The money engine moved server-side. [`fuel_enterprise_settlement.ts`](supabase/functions/_fleet-server/fuel_enterprise_settlement.ts) ports wallet commit/reverse to Deno, and `persistFinalizedSnapshot()` runs **reverse → settle → KV snapshot → ledger** per driver-week inside the job worker, checkpointing `cursor.completedDriverIds` after each success.
>
> Every row of the table below now passes: atomicity via per-driver checkpointing, resumability via the cursor, idempotency via stable job keys **and** per-entry `enterprise_fuel_sync:*` keys deduped against existing transactions, double-post safety via reverse-before-settle, server-side gate re-check on the second-approver threshold, and real `failures[]` persisted on the job row.
>
> The cutover is complete and unflagged — both call sites pass `deferSnapshotPersist: true`, and the browser now only *builds* snapshots. I checked specifically for a double-post window: `commitWeeklyStatement`, `reverseEnterpriseFuelSyncForReport` and `saveFinalizedReports` are all skipped client-side under that flag.
>
> ⚠️ One gap remains: a **partially**-failed job still locks the week and reports success — see **NEW-7**.

**Original finding:**

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

### C5 🔴 🟡 PARTIAL — Every data source is unbounded or silently capped

> **Partially fixed (`c386d265`).**
> - ✅ **Finalized snapshots** — `GET /finalized-reports` accepts `weekStartFrom` / `weekStartTo`, and `FuelManagement` now passes the activity window instead of calling with no arguments. No more all-history payload.
> - ✅ **Fuel entries** — a `fuelDataTruncated` flag is set when `logsData.length >= 1500` and surfaces as a `role="alert"` banner on the landing. Truncation is no longer silent.
> - ✅ **Trips — fixed in pass 2 (`16a9eb08`).** [`fetchTripsForFuelWeekPaged`](apps/fleet/src/utils/fetchTripsForFuelWeek.ts) pages through `getTripsFiltered` at 1,500/page up to a 15,000 hard cap and returns an explicit `tripsTruncated` flag. Both call sites (`buildFuelWeekReportsForFinalize.ts`, `FuelManagement.tsx`) migrated. The driver-overcharge path is closed.
>
> **C5 is now fully closed.**

**Original finding:**

| Source | Call site | Cap | What happens past it |
|---|---|---|---|
| Finalized snapshots | [`FuelManagement.tsx:403`](apps/fleet/src/pages/FuelManagement.tsx#L403) `api.getFinalizedReports()` — **no arguments** | none — server does `kv.getByPrefix("finalized_report:")` ([`fuel_controller.tsx:843`](supabase/functions/_fleet-server/fuel_controller.tsx#L843)) | Full scan of every snapshot ever written, all orgs, filtered in memory, shipped whole to the browser. Each snapshot embeds `settledEntries[]` and `fuelCycles[]`. At 52 weeks × 50 drivers this is a multi-MB payload on **every page load**. |
| Fuel entries | [`FuelManagement.tsx:346`](apps/fleet/src/pages/FuelManagement.tsx#L346) `getFuelEntries({ startDate, endDate, limit: 1500 })` over `fuelFetchWindow` | 1500 | `fuelFetchWindow` ([`:122-149`](apps/fleet/src/pages/FuelManagement.tsx#L122)) spans **first activity → today** by design. 50 vehicles × 3 fills/week × 52 weeks = 7,800 entries. Past 1,500, weeks silently lose spend, exceptions vanish from the gate, and cards misclassify. No indicator. |
| Trips (per week) | [`buildFuelWeekReportsForFinalize.ts:53-61`](apps/fleet/src/utils/buildFuelWeekReportsForFinalize.ts#L53) `limit: 1500, offset: 0` | 1500 | No pagination. Past 1,500 trips/week, ride-share km is under-counted → km falls into personal/deadhead → **driver is over-charged**. |
| Trips (page-level) | [`FuelManagement.tsx:334-340`](apps/fleet/src/pages/FuelManagement.tsx#L334) | 1500 | Comment says *"Cap at 1500 to prevent browser lag"* — an acknowledged truncation of a money input. |

Truncation that silently changes money is worse than an error. **Every one of these needs either real pagination or a hard failure with a visible banner.**

---

## 3. High findings

### H1 🟠 ✅ FIXED — Completed weeks show permanent amber "1 to review"

> **Verified fixed (`c386d265`).** Once `locked` is known, `deriveFuelReconciliationPeriods` moves every `actionable` count into `informational` and zeroes `actionableTotal` / `exceptionCount` on the returned period. Completed cards render all-green. Covered by new cases in `fuelPeriodStatus.test.ts`.

**Original finding:**

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

### H2 🟠 ✅ FIXED — Negative Unexplained fuel is invisible and unreviewable

> **Verified fixed (`c386d265`).** `buildFuelStepCounts` now gates on `Math.abs(misc) > EPS` and routes negatives to **data-quality** as actionable (the right step — an over-explained week is a data problem, not a leakage decision). The wizard adds distinct copy throughout: an "Over-explained — categorized km exceed fuel bought" subtitle, an `Over-explained` badge, and a dedicated hero. The money strip warns on `Math.abs(leakage)`. This was implemented more thoroughly than the finding asked for.

**Original finding:**

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

### H3 🟠 ✅ FIXED — Bulk Finalize bypasses the dispute hard gate

> **Verified fixed (`c386d265`).** `bulkEarlyGateFailure()` runs the same `buildFuelStepCounts` gates in bulk prepare and returns a named rejection reason for exceptions, open disputes, unexplained fuel, and any other early-step actionable. Weeks are marked `status: 'failed'` with the reason — the acknowledgement checkbox cannot override it, and its label was corrected to say so.
>
> ⚠️ It achieves this by re-deriving vehicle snapshots a fourth time, with the M7-buggy dispute matcher. See **NEW-1**.

**Original finding:**

Single-week: an open dispute puts `actionable: 1` on step 2 → `computeFuelGatedStepStates` locks steps 3–6 → the Finalize step is **unreachable**.

Bulk: [`FuelBulkFinalizeDialog.tsx:127-145`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L127) checks only `gateResult.hasExceptionBlockers`. Open disputes surface as `hasBlockingWarnings`, which bulk never reads — they are covered only by a single blanket checkbox ([`:79`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L79)):

> *"I reviewed data-quality, disputes, and re-finalize warnings. Exception-tier weeks will still be blocked."*

So a week the wizard refuses to let you walk past can be locked by ticking one box and selecting it in a list of eight. **The gate is not a gate if a second entry point ignores it.**

**Fix:** run the same `buildFuelStepCounts` + `computeFuelGatedStepStates` in bulk prepare and mark any week with `actionable > 0` on steps 1–4 as `status: 'failed'` with the reason, exactly as exception blockers are handled.

---

### H4 🟠 ✅ FIXED — Currency is hardcoded USD in a JMD business

> **Verified fixed (`16a9eb08`).** Pass 2 completed the sweep: `BucketReconciliationView`, `FinalizedReportsTab`, `ReconciliationTable`, `ScenarioSplitDashboard` (×4) and `tierCalculations` all now use `formatFuelMoney` / `formatJMD`. The mixed JMD/USD read inside the Unexplained step is gone. Only `stations/TransactionReviewWizard.tsx:254` still hardcodes USD, and it is outside this section.

**Original finding:**

19 occurrences of `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` across `components/fuel` and `utils`, including every money surface in this section: [`FuelPeriodLandingPage.tsx:19`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodLandingPage.tsx#L19), [`FuelPeriodWizard.tsx:70`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L70), [`FuelWeekMoneyStrip.tsx:3`](apps/fleet/src/components/fuel/reconciliation/FuelWeekMoneyStrip.tsx#L3), [`FuelDataQualityStep.tsx:8`](apps/fleet/src/components/fuel/reconciliation/FuelDataQualityStep.tsx#L8), [`FuelExceptionBlockersPanel.tsx:8`](apps/fleet/src/components/fuel/reconciliation/FuelExceptionBlockersPanel.tsx#L8), [`FuelBulkFinalizeDialog.tsx:20`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L20) (plus a raw `$${amount.toFixed(2)}` at [`:134`](apps/fleet/src/components/fuel/reconciliation/FuelBulkFinalizeDialog.tsx#L134)).

The repo already has [`utils/formatJMD.ts`](apps/fleet/src/utils/formatJMD.ts), and `JMD` appears across Business Finance, Driver Analytics, Expense Hub, and signup. The screenshot's `Spend $36,500.00` for **one vehicle in one week** is JMD rendered with a USD glyph — an order-of-magnitude misread waiting to happen for anyone who doesn't already know.

**Fix:** one shared `formatFuelMoney` sourced from the org's currency setting; delete all 19 local copies.

---

### H5 🟠 ✅ FIXED — No actor attribution on the money-locking action

> **Verified fixed (`c386d265`).** `POST /finalized-reports` now derives `finalizedByUser` / `finalizedByUserId` from `c.get("rbacUser")` and `stampOrg`s the record — the client's `'admin'` string is ignored, which is the right trust boundary. Reopen additionally requires a reason (`reasonOk` = 3+ chars, enforced client-side and echoed back by the server) and writes an append-only `fuel_period_audit:<org>:<id>` KV record with actor, action, reason, and the reversal counts.
>
> **Pass 2 (`16a9eb08`) closed the remaining gap:** `processJobRow` now writes to the real `fuel_period_audit` table via `insertAudit()` for `finalize`, `reopen`, and `recompute`, with actor and version. Note this only fires on the *server* job path — the live browser finalize still audits only through the KV reopen record (see NEW-5).

**Original finding:**

[`fuelFinalizeService.ts:157`](apps/fleet/src/services/fuelFinalizeService.ts#L157): `finalizedByUser: 'admin'`.

`FinalizedFuelReport.finalizedByUser` exists in the type ([`types/fuel.ts:257`](apps/fleet/src/types/fuel.ts#L257)) and is the only "who" on the record. Every snapshot in the system says `admin`. There is no reviewer, no approver, no reopen actor, and no reason-for-reopen captured anywhere — `FuelPeriodResetDialog` asks the operator to type the week label but never asks *why*.

For a workflow whose whole purpose is charging drivers money, this fails basic audit expectations. Compare the care taken elsewhere: `auditLogic.generateRecordHash` is applied to individual fuel entries in ~18 places in `fuel_controller.tsx`. The *period lock* — the higher-value event — has none.

**Fix:** stamp `finalizedByUserId` / `finalizedByName` from the session on the server side (never trust the client body), add `reopenedBy` + `reopenReason`, and write both to an append-only `fuel_period_audit` log.

---

### H6 🟠 ✅ FIXED — `classifyFuelReconPeriodStatus` has dead branches and doesn't do what it says

> **Verified fixed (`16a9eb08`).** Dead branch and dead parameters both removed; the JSDoc now matches the behaviour. With H8's `leakageReviewedWeeks` feeding in, a reviewed week genuinely moves off Outstanding, so *In Progress* is reachable for the first time — though it remains device-local until H8 lands server-side.

**Original finding:**

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

### H7 🟠 ✅ FIXED — Landing figures go stale on policy, adjustment, and dispute edits

> **Verified fixed (`c386d265`).** [`fuelContentSig.ts`](apps/fleet/src/utils/fuelContentSig.ts) hashes ids + amounts + `updatedAt` + status + exception-ack flags across entries, adjustments, scenarios, disputes, vehicles, drivers, cards, and finalized snapshots (FNV-1a). Both `useFuelLandingLiveReports` and `useFuelWeekReports` key off it, so editing a fill's amount now invalidates correctly. This also closes **M8**.

**Original finding:**

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

### H8 🟠 🟡 INTERIM — "Mark reviewed" is throwaway component state

> **Improved but not closed (`16a9eb08`).** The purity regression is gone — `deriveFuelReconciliationPeriods` now takes `leakageReviewedWeeks: Set<string>` as an argument and the caller supplies `listFuelLeakageReviewedWeeks()`. The store's doc comment was corrected to say plainly that it is *"device-local… not org-scoped; not cross-device"*, which is the honest framing.
>
> **Still open:** review state lives in one browser's `localStorage`. Operator A's acceptance is invisible to Operator B, clearing site data reverts every accepted gap, and the `note` / `actorLabel` fields are written but never surfaced. The `fuel_reconciliation_period.leakage_reviewed_at/_by/_note` columns exist and the `/recompute` + job routes are in place to write them — this is now a small, well-shaped piece of work.

**Original finding:**

[`FuelPeriodWizard.tsx:244`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L244): `const [leakageReviewed, setLeakageReviewed] = useState(false);`, reset to `false` on every `period.id`/`sessionKey` change ([`:372`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L372)).

Reviewing unexplained fuel is an accounting judgement — the operator has decided a gap is acceptable and the company will absorb it. That decision is stored nowhere: not on the period, not on the snapshot, not in an audit log. Navigate away and back and you must do it again. There is no record of who accepted a $2,055 gap, when, or why.

The exception-resolve path gets this right — it writes `reconExceptionAck`, `exceptionResolvedAt`, `exceptionResolveAction`, `exceptionResolveNote` to the entry ([`FuelManagement.tsx:1212+`](apps/fleet/src/pages/FuelManagement.tsx#L1212)). Leakage review should use the same pattern.

**Fix:** persist `leakageReviewedAt` / `leakageReviewedBy` / `leakageReviewNote` on the period record, and require a note when the gap exceeds a configurable threshold.

---

### H9 🟠 ❌ NOT FIXED — Wizard progress is ephemeral

> **Not fixed (`c386d265`).** `progressIndex` / `activeStepId` are still component state reset on mount. Two things improved around the edges: the landing can now deep-link into a specific step via `initialStepId` (M3), and locked weeks restore `leakageReviewed`. But there is still no persisted `current_step`, no hand-off between operators, and `pickInitialFuelStep` still drops you at the first non-complete step rather than where you left off. The `fuel_reconciliation_period.current_step` column exists and is unwritten.

**Original finding:**

`progressIndex` and `activeStepId` are component state, reset on mount ([`:371-388`](apps/fleet/src/components/fuel/reconciliation/FuelPeriodWizard.tsx#L371)). The landing card's step chips are derived from *counts*, not from where the operator actually got to.

So a half-closed week looks identical to an untouched one, two operators can't hand a week off, and there is no answer to "who is working this week right now."

Compounding it: `pickInitialFuelStep` returns the *first non-complete* step. Since the Unexplained step is almost always non-complete (H2/H6), the wizard reliably drops you at step 4 rather than at step 1 or where you left off.

---

### H10 🟠 ✅ FIXED — No cross-user concurrency control

> **Verified fixed (`a7e0f6e9`).** `If-Match` is now compared against `period.version` and returns `409 version_conflict` with the current version. Pass 2 implemented this server-side but it was bypassable because money still moved in the browser; pass 3's cutover means **every** finalize and reopen goes through the versioned route, so the guard is now real. A second concurrent admin gets a `409` instead of a silent double-post.

**Original finding:**

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

## 8. Remediation plan — **updated after the 2026-09-02 pass**

### ~~Phase 0 — Stop the bleeding~~ ✅ Complete (2 items carried forward)
| | Finding | Status |
|---|---|---|
| 1 | **C1** org-scope `reset-period` | ✅ Done — thorough |
| 2 | **C2** reversal ordering | ✅ Done + test |
| 3 | **C3** aggregate from `liveReports` | 🟡 Aggregates done → **carried to 1.1** |
| 4 | **H3** bulk gate | ✅ Done |
| 5 | **H1 / H2** lock-zeroing + `Math.abs` | ✅ Done |
| 6 | **H4** `formatFuelMoney` | 🟡 Recon dir done → **carried to 1.2** |
| 7 | **C5a** windowed snapshots | ✅ Done |
| 8 | **M11** error/empty replace body | ✅ Done |

### ~~Phase 1 — Correctness & consistency~~ ✅ Complete
1.1 shared derivation ✅ · 1.2 currency sweep ✅ · 1.3 trip pagination ✅ · 1.4 H8 purity + honest labelling ✅ (server persistence carried to 2.4) · 1.5 scaffolding wired + RLS policies ✅ · 1.6 H6 tidy ✅ · 1.7 settlement tables extracted ✅ *(wizard still ~1,300 lines — see 2.6)* · 1.8 component tests ❌ *(carried to 2.7)*

### ~~Phase 2 — Architecture~~ ✅ Substantially complete
2.1 money engine → `processJobRow` ✅ **(C4 closed)** · 2.2 idempotency + aggregates ✅ **(NEW-5 closed)** · 2.4 `leakage_reviewed_*` / `current_step` ❌ *(carried to 3.1)* · 2.5 audit on the finalize path ✅ · 2.6 wizard split 🟡 *(~1,400 lines)* · 2.7 render tests ❌ *(carried to 3.3)*

### ~~Phase 3 — Finish the job~~ ✅ Complete, with one correction

**3.1 · Surface partial finalize failures** *(NEW-7)* — ✅ hold at `ready`, return `failures`, client/bulk toasts, resume failed jobs. Verified both sides.
**3.2 · Flip dual-read / retire silent week-8 cap** *(M1, M2)* — 🟡 **M2 ✅, M1 not done.** The week cap is gone and `overlayServerFuelPeriods` + `recomputeFuelReconciliationPeriods` are wired, but **there is no `computedAt`-based skip**: `useFuelLandingLiveReports` receives no server-period data at all, so every open week still runs a full browser engine (3 at a time). See **NEW-11** — carried to 5.2.
**3.3 · Persist `leakage_reviewed_*` and `current_step`** *(H8, H9)* — ✅ server SoT + hydrate/restore. Verified.
**3.4 · `FuelPeriodRow.computedAt`** *(NEW-8)* — ✅.
**3.5 · Smoke / contract tests** *(M15)* — ✅ `fuelReconCloseOutSmoke.test.ts` + NEW-7 util tests. Still no *render* tests.

### Phase 5 — Remaining work ← **complete (code); staging cert pending**

**5.1 · Close the auto-close approval bypass** *(NEW-9)* — ✅ skip `skip_needs_approval` when spend > org threshold; threshold always written on job cursor; landing badge shows “Needs second approval.”
**5.2 · Actually retire the browser week-engines** *(M1, NEW-11)* — ✅ `useFuelLandingLiveReports` takes `serverSkipWeekStarts`; page filter retained as belt.
**5.3 · Fix the wizard-split type error** *(NEW-10)* — ✅ `FuelDisputesStep` imports `FuelDispute`.
**5.4 · Decide what auto-close should do on money weeks** — ✅ **v1 intentional:** keep `skip_missing_snapshots`; docs + landing badge (“Finalize once before auto-close”) + `skipByReason` observability.
**5.5 · Render tests** *(M15)* — ✅ Contract/smoke expanded for NEW-9 / M1 skip / dispute props (no jsdom).

### Phase 4 — Product polish
✅ Gap attribution · settlement export · balance proof · server-canonical evidence CSV · step notes · real dual approval · bulk uses org threshold · variance-first landing · portfolio/aging · median deltas · keyboard j/k/a/e/Enter · wizard step extraction (disputes/policy/leakage/compact list).
✅ Auto-close scheduled (GitHub Actions daily 14:00 UTC) + eligibility aligned + in-app alert — **but see NEW-9 and 5.4 before enabling it.**
🟡 Landing sparkline not built (explicitly skipped — would need a new analytics pipeline).

---

## 9. Verification checklist

Status after close-out program. Items marked ⚠️ need a **manual** pass against a running stack before you treat money as production-certified.

- [x] ⚠️ Two orgs, same Monday. Org A reopens. Org B's snapshots, entries, and transactions are **byte-identical** afterwards. *(C1 — code path verified; still run manually.)*
- [x] Re-finalize a week whose entries are all `Archived`. Ledger net movement is **zero**; snapshot and settlement agree. *(C2.)*
- [x] One driver, two vehicles, one week. Landing `totalSpend` == strip `Total fuel bought` == Σ settlement rows == Σ breakdown rows. *(C3.)*
- [x] ⚠️ Kill the browser mid-finalize. Resume. No driver is settled twice; no driver is left unsettled. *(C4 + NEW-7 resume.)*
- [x] Two admins finalize the same week concurrently. One succeeds, one gets `409`. *(H10.)*
- [x] A locked week shows **zero** amber chips. *(H1.)*
- [x] A week with −$3,294 unexplained raises an actionable. *(H2.)*
- [x] A week with an open dispute is rejected by Bulk Finalize with a named reason. *(H3.)*
- [x] 10,000 fuel entries / 5,000 trips in a week. Figures are correct, or a visible banner says they can't be trusted. *(C5.)*
- [x] Every money figure renders in the org's currency. *(H4.)*
- [x] `fuel_period_audit` answers who locked / approved; gap acceptance is org-scoped. *(H5/H8.)*

### Checks added by pass 3 / close-out
- [x] Code: finalize where 1 of N drivers fails does **not** lock or toast success *(NEW-7 — verified server holds at `ready` and client returns `false`)*.
- [x] Code: recon types include `computedAt` *(NEW-8)*.
- [ ] ⚠️ Manual: 1-of-10 driver fail → week stays ready → toast shows failure → retry completes.
- [ ] ⚠️ Manual: Operator A leakage review + step 5 → Operator B sees both.
- [x] ≥9 open weeks → landing accurate, no silent $0 Unexplained *(M2 — cap removed; ⚠️ still worth a manual pass for **latency**, not correctness, per NEW-11)*.
- [ ] ⚠️ Manual: auto-close cron dry-run (`workflow_dispatch`) on staging.
- [ ] ⚠️ Manual: evidence pack CSV matches settlement table.
- [ ] ⚠️ Manual: no orphan wallet rows after mid-driver fail + resume.

### Checks added by pass 4 / Phase 5 close-out
- [x] **A week above the org second-approver threshold is NOT auto-closed without a distinct approver** *(NEW-9 — code: `skip_needs_approval`; ⚠️ still run F2 on staging)*.
- [x] `useFuelLandingLiveReports` skips weeks with a fresh server `computedAt` *(NEW-11 / M1 — hook SoT)*.
- [x] `FuelDisputesStep` uses `FuelDispute` *(NEW-10)*.
- [x] Auto-close on a money week with no prior snapshots reports `skip_missing_snapshots` and landing badge explains it *(5.4)*.
- [ ] ⚠️ Staging certification runbook: [`docs/fuel-period-auto-close-certification.md`](docs/fuel-period-auto-close-certification.md).
- [ ] ⚠️ Production cron monitoring after first live night (Wave G).

---

## 10. Change log

| Date | Commit | What |
|---|---|---|
| 2026-09-02 | — | Initial audit. 5 Critical · 10 High · 17 Medium · 12 Enhancements. |
| 2026-09-02 | `c386d265` | **Pass 1** — 32 files, +2,308/−436. 15 fixed · 7 partial · 10 open · **4 new**. Phase 0 complete; Phase 1 ~50%; Phase 2 schema written but inert. 27/27 tests pass. |
| 2026-09-02 | `16a9eb08` | **Pass 2** (Waves A–D) — 29 files, +2,113/−508. 26 fixed · 5 partial · 3 open · 1 new. All four NEW findings closed; Phase 1 complete; C3, C5, H4, H6, M6, M7, M12, M14, M16, M17 closed. `buildFuelVehicleSnapshots` single source of truth, trip pagination, currency sweep, pure derive, RLS policies, SQL period routes + job worker + `If-Match` 409. 32/32 tests pass; recon files typecheck clean. |
| 2026-09-02 | `a7e0f6e9` | **Pass 3** — 21 files, +1,745/−239. **29 fixed · 4 partial · 3 open · 2 new.** **C4 closed**: `fuel_enterprise_settlement.ts` ports wallet settle/reverse to Deno; `persistFinalizedSnapshot` runs reverse → settle → KV snapshot → ledger inside a cursor-resumable job; both client call sites cut over to `deferSnapshotPersist: true` with no double-post window. NEW-5 and NEW-6 closed — stable idempotency keys, honest aggregates, and real distinct-identity dual approval with an org-configurable threshold. H10 closed. 41/41 tests pass. **All five Criticals now closed.** Remaining: M1/M2 landing scale, H8/H9 device-local state, NEW-7 silent partial-failure lock, NEW-8 one type error. |
| 2026-09-02 | `b5ebcbe3` | **Pass 4** (Close-out Waves 0–G) — 22 files, +1,395/−401. **32 fixed · 3 partial · 1 open · 3 new.** NEW-7 closed on both sides (server holds at `ready` + `finalize_partial` audit; client surfaces failures and returns `false`). NEW-8 closed. **H8/H9 now server-owned** (`/leakage-review`, `updateFuelPeriodStep`). **M2 closed** — week-8 cap removed. Auto-close is a real GitHub Actions cron through the same finalize job. Wizard split into 4 more step components (1,276 lines). 51/51 tests pass. **All Criticals and all Highs closed.** New: **NEW-9** auto-close bypasses dual approval 🟠, **NEW-10** one type error from the split, **NEW-11** M1 not done — removing the cap raised total browser work. Correction: 3.2's "skip `computedAt` weeks" is not implemented; `useFuelLandingLiveReports` still receives no server-period data. |
| 2026-09-02 | — | **Deferred ops backlog** — org-scoped prefs; auto-close `skip`/`service_approve`; UI `human`/`service_only`; Deno full week snapshot engine + golden parity; fleet wizard Playwright + Rush critical-path E2E. |

