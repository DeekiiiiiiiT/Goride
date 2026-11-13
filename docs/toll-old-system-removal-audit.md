# Old toll system — removal audit

**Rev 1 · 13 Nov 2026.** Separate from `docs/toll-phase3-screens-audit.md` (the new system's screens) and `docs/toll-architecture.md` (the design; this replaces its Phase 4 "side by side" and Phase 5 "retire").

## Goal (one sentence)
Delete the old toll system completely (screens, server code, switches, stored data) so Roam Fleet runs on the new toll system only, without losing any money already in the books.

## Why now, and why skipping "side by side" is safe
- The owner's fleet is the **only** company on Roam Fleet, and it has been on the new system since 13 Nov 2026 (`toll.switch_state`, run by the owner). Nobody is left on the old system.
- Driver pay: a **closed** driver week is frozen and never recalculated (`rebuildOneDriverPeriod` returns the stored row when `isPeriodFrozen`, `driver_financial_periods.ts` ~2004). From the switch on, every week that is **not** closed takes its tolls from the new system (`resolveTollInputs`, `toll_v2_settlement_inputs.ts`). So the old toll numbers are no longer read for anything that can still change.
- Posted money lives in `ledger.*` and `ledger.week_statements`. Neither is part of the old toll system, and both stay.

## What stays (not old system; the new one uses it)
| Piece | Where | Why it stays |
|---|---|---|
| Toll tags, plazas, rates | `toll_inventory_controller.tsx` (18 routes: `/toll-tags*`, `/toll-plazas*`, `/toll-info*`), `fleet.toll_tags`, `fleet.toll_tag_assignments`, `fleet.toll_plazas`; Fleet **Toll Tags** page; Admin plazas | The new imports find the car from the tag and the plaza from its name (`toll_v2_import_lookups.ts`) |
| Roam ride toll detection | `toll-brain` function, `rides/fare/tollGeofence.ts`, `rides.ride_toll_crossings`, `_shared/tollPlazaLoader.ts` | Feeds the new system's Roam ride hooks |
| `fleet-toll-cron` | `supabase/functions/fleet-toll-cron` | The new matcher's timer door |
| Everything `toll_v2_*`, `toll.*`, `toll_system.*`, `toll_write.*`, `toll_read.*`, `tolls-v2/` screens, Toll Health | | The new system |
| `toll_seal_before_pay.ts` | | Driver pay waits for the sealed toll week (new system) |
| Claims for **Wait_Time** and **Cleaning_Fee** | `claim_service.ts`, `claims_controller.tsx`, `fleet.claims` | Not tolls (`types/data.ts:1166`); only the `Toll` / `Toll_Refund` parts go |
| `ledger.*`, `ledger.week_statements` | | The books |

## What goes (the old system)
| Layer | Pieces |
|---|---|
| **Server** | `toll_controller.tsx` (66 routes, ~10.5k lines: matching, refunds, unlinked refunds, rematch, 25+ backfill/repair/backup routes), `toll_period_controller.tsx` (10), `dispute_refund_controller.tsx` (8) and ~40 helper files (`toll_auto_match`, `toll_match_index`, `toll_period_*`, `toll_pnl_offset`, `toll_refund_classify`, `dispute_match_*`, `claim_toll_sync`, `driver_toll_charge*`, `driver_toll_disposition`, `fleet_trip_toll_replay`, `heal_personal_toll_pnl_events`, `orphanTollClassifier`, `toll_financial_reset`, `toll_settlement`, `toll_week_seal`, `toll_finish_seal_side_effects`, `toll_workflow_stage`, `toll_recon_metrics`, `toll_charged_from_financial_events`, `toll_close_amounts`, `toll_platform_reimbursed`, `toll_period_inputs`, `fleet_toll_statement_snapshot`, `toll_brain_policy` (fleet side only), …) — exact list fixed in round S1 by import tracing |
| **Fleet screens** | Toll Logs, Toll Analytics, Rate Drift, Low Balance pages; old Toll Reconciliation (`pages/TollReconciliation.tsx`, `ReconciliationWizard.tsx`, `components/toll-tags/reconciliation/` 21 files, `components/toll/` 17 files); `useTollReconciliation.ts`, `tollChargeSagas.ts`, `refundClassifier.ts` and ~80 toll utils; toll parts of Claimable Loss; the old step-3 screen inside Week Reconciliation |
| **Driver app / Admin** | 7 driver files and 7 admin files that call old toll routes (checked in round A1) |
| **Switches** | KV `toll_reconciliation:settings` (≈12 switches), `fleetUsesTollBrain`, `projectionReadsEventsForTolls`, `isUnifiedTollSettlementEnabled`; the "company not on v2" branches in the new code (e.g. `tollsV2WeekState` → `null`, the old toll period in `computeLiveStepCounts`) |
| **Data** | KV `toll_ledger:`, `dispute-refund:`, `dispute-refund-dedup:`, `toll_bridge:crossing:`, `toll_pnl_offset_marker:`, `toll_charge_reversal:`, `toll_idempotency:` and the other helper prefixes; SQL `fleet.toll_ledger`, `public.toll_reconciliation_period`, `toll_period_audit`, `public.toll_settlement_allocations` |
| **Tests / CI** | Old toll tests, `pnpm test:e2e:toll`, CI checks that name removed files |

## Findings (one fix each)
| # | Finding | Fix |
|---|---|---|
| OR-01 | A past week that is **not** closed now reads tolls from the new system, which has nothing for weeks before the switch → that week's tolls show as zero if it is rebuilt. | Owner redoes those weeks' tolls in Week Reconciliation (upload the week's toll files again, then seal). Round D0 lists them first. |
| OR-02 | New code still borrows from old files: `recon_import_routes.ts` imports `toll_controller.tsx` and `toll_period_writable.ts`; `toll_seal_before_pay.ts` imports `toll_period_writable.ts`; `recon_week_blockers.ts` imports `toll_financial_reset.ts`; `driver_financial_periods.ts` imports `toll_period_inputs.ts` and `toll_platform_reimbursed.ts`; `fleet-pay/src/main.ts` mounts an old toll controller. | Round S1 moves each borrowed helper the new code really needs into a `toll_v2_*` file, or deletes the call when it only served the old path; then the old files have no users. |
| OR-03 | "Company not on v2" branches stay in the new code (Week Recon step 3 old period, legacy settlement inputs, Uber import's old path). | Removed in S2: v2 is the only path; a failed switch read becomes a plain error. |
| OR-04 | Old toll data would linger in KV and SQL. | Round D1 moves the old SQL tables into an `archive` schema and copies the old KV rows into `archive.kv_toll_old`, then deletes them from the live KV table. Nothing in the app reads `archive`. |
| OR-05 | Old switches would linger. | Deleted with their code (S2) and their KV row (D1). |
| OR-06 | Claimable Loss mixes toll and non-toll claims. | Keep the page; remove the `Toll` / `Toll_Refund` parts (C1). |
| OR-07 | Found in S1: week close auto-ran the **old** toll seal (`sealTollWeek` / `sealTollWeekViaHttp`) for any driver whose toll statement wasn't closed, with no v2 check → after the switch it could write toll statements from old data, bypassing the new system. | Fixed in S1: close refuses with `TOLL_WEEK_NOT_SEALED` until the week is sealed in step 3. |

## Rounds (in order; each = build → tests → `/code-review` → push)
1. **D0 — weeks to redo (read-only):** ✅ owner ran `old_toll_weeks_to_redo_LIVE_look.sql` 13 Nov. Result: one driver, Kenny Gregory Rattray. Weeks **21 Sep, 28 Sep and 5 Oct 2026** are open, with old toll rows (12 / 6 / 12 rows; net J$-595.00 / J$3,245.00 / J$-4,060.00) → **owner redoes these three weeks in Week Reconciliation** (upload the week's toll files, decide, seal, then close the driver week). Also one stray old row dated **10 Nov 2025** (J$2,500.00, no driver week, nothing depends on it) → just archived in D1. Weeks from 12 Oct on are closed or have no old tolls.
2. **S1 — cut the ties (OR-02):** ✅ 13 Nov (money paths). Week Recon import commit answers `TOLLS_MOVED` 410 for toll files (no old toll ledger writes); **week close never runs the old toll seal** — an unsealed toll statement refuses close with `TOLL_WEEK_NOT_SEALED` "seal in step 3" (OR-07); period/statement toll drift no longer forces a re-seal (the rebuild fixes it); driver close blockers drop the old toll-event check. Server tests 1094 pass (2 unrelated failures: old dispute test needs env; parts CSV fixture). Left for S2 (only reached by a company not on v2): `toll_seal_before_pay` old branch, legacy settlement toll inputs, `recon_routes` old toll period, `reopenSealedTollPeriod` in week reopen. **S1 review (10 findings) fixed:** toll readiness counts only open drivers and is checked **before** any lane is sealed; a toll re-seal request is a no-op (step 3 re-seals); no toll second pass; an old `zero_activity_na` statement counts as sealed; preview + close dropped the old orphan scan too; toll files refused at create (before review) and commit; a non-toll file at commit gets `INVALID_SOURCE`; dead `loadStagingRows` removed. Accepted: S1 tests read the source (no DB behaviour test). Parse route's toll mode is now unreachable → deleted in S2. **C1 note:** Data Center (`ImportsPage`) and the old Step 1 path still open `BulkImportTollTransactionsModal`, whose commit now answers `TOLLS_MOVED` → C1 points both to the new toll upload.
3. **C1 — Fleet screens:** delete the old pages, nav items, wizard, components, hooks and utils listed above; keep Toll Tags and Toll Health. Fleet typecheck count must not go up.
4. **A1 — Driver app + Admin:** remove calls to old toll routes (driver toll receipt goes to the new driver-cash path if it doesn't already).
5. **S2 — server:** delete `toll_controller.tsx`, `toll_period_controller.tsx`, `dispute_refund_controller.tsx` and helpers; strip old branches (OR-03); rebuild fleet-toll / fleet-pay / fleet-claims bundles; route-list check green.
6. **D1 — data (OR-04, OR-05):** archive SQL file, proven on the local copy, owner runs it.
7. **T1 — tests / CI:** remove old tests and checks; full `pnpm check` + `pnpm test:toll` green.

## Done-tests
- Every Fleet page in the nav opens; Toll Tags, Toll Health and Week Reconciliation step 3 work on live.
- A driver week can be settled end to end on the new system.
- No file outside `archive` / git history mentions `toll_ledger:`, `toll-reconciliation`, `dispute-refund` or `toll_reconciliation_period`.
- `pnpm test:toll`, Fleet vitest, Deno server tests and CI all green.
