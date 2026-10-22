# Week Reconciliation — Implementation Plan

**Rev 16 · 2026-10-22 · verification of working tree on `5e70257d` (37 files uncommitted) + prod (`fleet-core` v111)**
Open items only. Earlier revisions are in git history.

## Working in prod

- `pgmq`, the recompute queue, `projection_state`, `week_blockers`, `close_workflows` and all 7 fact-table triggers are live.
- The worker calculated **13 units** (12 driver-weeks, 1 vehicle-week), with **0 failures**. Kenny's Oct 12 row is now correct (`cashHeldClamped: false`, +13,970.65).
- Page reads use stored results in code; Close runs as a workflow in code; the no-engine guard is in CI.

---

## R16-01 · The web app won't build · Critical

`apps/fleet/src/services/reconApi.ts:320/336` (`completeRunStep`): `body` is both the parameter and a new `const` in the same function. That's a JavaScript syntax error, so the bundle fails or the module throws on load, and the wizard, toll import, fuel upload and Uber register all break. Rename the inner one (e.g. `payload`). This is 5 of the new `tsc` errors.

## R16-02 · No worker is actually running · Critical

`scripts/recon-worker.ts` is a loop someone starts with `deno run` on a computer, and nothing deploys it. The 13 units were computed by that script being run by hand. The queue only drains, and the nightly check only runs, while someone's machine is running it.
- **Host:** one unit takes 2–4 s of CPU, over the 1 s rule, so it's a **container**. Package `scripts/recon-worker.ts` with a Dockerfile, deploy it as an always-on service (Cloud Run min-instances 1, or a Cloud Run Job on a 1-minute schedule), and store DB credentials as secrets.
- **Remove the edge trap:** `POST /recon/worker/tick` and `POST /recon/worker/nightly` (`recon_routes.ts:1107/1122`) run engines **inside an edge request**, the exact CPU problem this design removes. Delete them, or make them only signal the container.
- **Fix the guard:** `assert-no-engine-on-edge-read.mjs` misses dynamic `await import("./recon_worker.ts")`. Make it check dynamic imports too.

## R16-03 · Two different "can this week close?" checks · High

The worker (`recon_worker.ts:155`) calls `checkCloseInvariants` with only `period` + the three statements. Close Week (`week_close.ts:1547/2308`) also passes `...cashInvariantFields(meta)` (which includes **`cashSourceAck`**), `engineDrifts`, `tollEventLedger`, `tollUnknownPmCount/Amount` and `skipSettlementDeskClear`.
- **It blocks wrongly:** Oct 12 shows `CASH_SOURCE_MISMATCH` even though Kenny's acceptance (2026-10-21) is still saved.
- **It can also let a week through wrongly:** toll-event and engine-drift blockers are never written.

**Fix:** one shared `buildCloseInvariantInput(...)` used by both paths, plus a test that the worker's blockers equal Close's blockers for the same week.

## R16-04 · The shadow check was skipped · High

Phases 1–2 said "run in shadow for 7 days with 0 mismatches" before the worker writes real results. The worker is already writing **real** projections (Kenny's period was rewritten at 2026-10-22 19:24). Before trusting any close, run the nightly integrity comparison, in the container, over open weeks plus the last 4 closed weeks, and get **0 mismatches**. Keep it running daily.

## R16-05 · CI is red, and prod history drifted · Medium

- `assert-public-fn-revoke-anon` fails on `20261022150000_recon_background_compute.sql`: `recon_enqueue_unit`, `recon_mark_week_pending`, `recon_queue_health`, `recon_read_recompute_batch` lack an explicit `REVOKE … FROM anon, authenticated`. **Prod is safe** (none are callable by anon); add the lines so CI passes.
- Prod history has `20261022192018`, `…192049`, `…192135`, `…192549`, which aren't in the repo (applied by hand). Add the matching files or repair the history.

## R16-06 · Commit, then verify page speed on the new version · Medium

- 37 files are uncommitted but deployed (v111). Commit them.
- Every slow page load today was on v110 or earlier (avg 71 s, five 150 s timeouts). v111 hasn't served a wizard page yet. Open Oct 12 and confirm the Phase 0 check: **page load p95 < 1 s**, 0 `CPUTime` shutdowns.

---

## Then: close Oct 12–18

After R16-01 to R16-04: the false `CASH_SOURCE_MISMATCH` clears → **Pay** Kenny $17,183.53 in the Settlement step → **Close** (workflow) → confirm the run shows closed.

## Still to come

- Phase 5 cleanup (delete the old on-request recompute paths once closes run through the workflow).
- Phase 6 Delivery (`courierWeekMoney.ts` is started). Q2, Q3 and Q5 wait for it.
- After two closes through the wizard: `SOURCE_ENFORCE=enforce`.
