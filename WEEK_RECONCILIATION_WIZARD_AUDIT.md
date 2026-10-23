# Week Reconciliation — Implementation Plan

**Rev 18 · 2026-10-23 · verification of working tree on `9788c91c` (24 files uncommitted) + prod**
Open items only. Earlier revisions are in git history.

## Status

**The calculator now runs by itself.** The `recon-worker-wake` cron runs every minute and only wakes the worker when there's queued work, a close is running, or the nightly check is due. It has an emergency-off flag and a secret header, and it scales to zero when idle. 385 wake calls succeeded; the only failures were 3 × 403 during setup (01:11–01:13) and a few cold-start timeouts that the next minute covered. The nightly comparison runs on its own (latest 01:22, **0 mismatches** over 11 weeks).

Gates: fleet `tsc` 484, web build passes, finance-core 281/281, Deno 21/21, all four guards pass, 0 public functions callable by anon.

---

## R18-01 · Commit everything · High

Prod depends on files that exist **only on this computer**: `supabase/functions/fleet-recon-cron/`, `recon_worker_wake.ts`, `recon_worker_google.ts`, `recon_worker_switch*.ts`, `WeekCalculatorPage.tsx`, `.gcloudignore`, both new migrations, and edits to the Dockerfile, Cloud Build, the deploy script and the worker. 24 files in total. Commit them.

## R18-02 · Migration history drifted again · Medium

| Repo file | Prod history |
|---|---|
| `20261022200000_recon_enqueue_reason_and_revoke.sql` | **not recorded**, but applied (`recon_enqueue_unit` has `p_reason`) |
| `20261022210000_recon_worker_autowake.sql` | `20261023011034 recon_worker_autowake` |
| `20261022211000_recon_week_desk_snapshot.sql` | `20261023011035 recon_week_desk_snapshot` |

Rename the two repo files to prod's versions, and record `…200000` with `supabase migration repair --status applied`. From now on, apply migrations from the repo file, so the version in prod matches the file name.

## R18-03 · Close Oct 12–18: the first real close through the workflow · High (ops)

`close_workflows` is still empty, and Kenny's $17,183.53 is unpaid (the week's only blocker). **Pay** from the Settlement step, then **Close**. Confirm:
- the workflow reaches `succeeded`;
- `recon.week_runs` for Oct 12 / rideshare shows `closed`;
- Kenny's period shows `closed_at`.

This is the last proof the new design works end to end.

## R18-04 · Page loads: 3.5 s average, target under 1 s · Medium

On the current version: 6 loads, average 3.5 s, p95 5.9 s, no failures. The new `recon_week_desk_snapshot` should bring this down once it's committed and deployed. Re-measure; if p95 is still over 1 s, add timing logs to `buildRunPayload` to find the slow read.

## R18-05 · Let the nightly check run for 7 days · Low (just wait)

It now runs automatically every night. On **2026-10-30**, check the worker log for 7 `shadow_ok` entries and no `shadow_mismatch`, before relying on it for a larger fleet.

---

## Still to come

- Phase 5 cleanup: delete the old on-request recompute code once Oct 12 has closed through the workflow.
- Phase 6 Delivery: a Delivery run for Oct 12 now exists (opened by the nightly pass); `courierWeekMoney.ts` is started. Q2, Q3 and Q5 wait for it.
- After two closes through the wizard: `SOURCE_ENFORCE=enforce`.
