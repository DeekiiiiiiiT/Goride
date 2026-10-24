# Week Reconciliation — Implementation Plan

**Rev 20 · 2026-10-23 · R19-01 fixed in `b3f74786` and live**
Open items only. Earlier revisions are in git history.

## Status

- **Kenny is paid**: Oct 12 period `settled`, $17,183.53 paid.
- **R19-01 is fixed and live.** That was the Close blocker no step showed.
  - Blocker columns were added to the live table.
  - fleet-core and the Cloud Run calculator (`goride-recon`) are deployed.
  - roam-fleet is Ready on Vercel.
  - All 4 GitHub runs passed; fleet `tsc` is still 484.
- **Migration history matches prod**: all 4 recent recon migrations are recorded.

### What R19-01 really was

Rev 19 blamed `SETTLEMENT_PNL_MISMATCH`. **That was wrong.** The page preview skips the P&L tie.

The real cause was that the calculator's saves were failing **silently**:
- **Week-level rows:** two "no activity" sources shared one `(code)` slot. The insert of the whole set failed, and the error was never checked.
- **Driver rows:** two drifts with the same code but different fields did the same thing.

As a result, the steps read **0 blockers** while the Close box (live preview) counted **1**.

**What changed:**
- **One shared check per driver.** `driverCloseBlockers` in `week_close.ts` is now used by both the preview and the calculator.
- **One shared writer.** `recon_week_blockers.ts` stores one row per `(code, source_id)` with amounts. It upserts, then deletes stale rows, and throws on any error.
- **Whole-week checks are stored** each time the calculator settles a week, before the desk is published.
- **The settlement ↔ P&L tie** runs once in the close workflow, right before freezing. It is no longer skipped.
- **The close workflow** counts only its own service line, and its error names the first 3 blockers.
- **The Close box** reads the same stored rows (`closeCheck` on the run payload):
  - It lists each blocker with its amount and a **Go to step** button.
  - If the read fails, Close stays locked.
  - If the calculator has not run for the week yet, it falls back to the old preview.
  - "No activity" confirmations (`SOURCE_ATTESTED_NONE`) are no longer shown as yellow warnings. They appear once in the Evidence box ("You confirmed no activity: …") and stay in the close record. Source warnings are prefixed with the source name. Change is local only: not yet committed or deployed.
  - The Close confirm no longer runs `weekCloseApi.sync` first and asks to confirm again ("Books refreshed — review the numbers"). That sync only started a refresh workflow, and the close workflow already waits for pending units and checks input hashes before freezing. The dialog now shows a check mark ("Everything is complete") and one line on what closing freezes. The money bullets and driver list are removed. Local only.

---

## R20-01 · Refresh, then close Oct 12–18 · High (your action)

Nothing has recalculated since the deploy. In Week Reconciliation, on Oct 12–18 (Rideshare):
1. Press **Refresh** and wait until the steps settle.
2. Open **Close**.
   - If it lists a blocker, it now says what it is and where to fix it.
   - If the list is empty, press **Close**.
3. Pressing Close runs the **P&L tie** for the first time. If the sealed statements don't match the recalculation, Close stops with `SETTLEMENT_PNL_MISMATCH` and the amount.
   - Kenny's earnings were sealed 2026-10-21 but recalculated 2026-10-23, so a mismatch is possible.
   - Fix it by resealing through Refresh, not with an override.

**Done when:**
- The workflow reaches `succeeded`.
- `recon.week_runs` for Oct 12 / rideshare = `closed`.
- Kenny's period has `closed_at`.

## R20-03 · Close-time P&L tie vs the 120 s Cloud Run limit · Medium

- **Risk:** the tie re-runs fuel, toll and earnings for **every driver** in the week inside one wake request. Cloud Run's `--timeout` is `120` (`cloudbuild.recon-worker.yaml`). That is fine for today's driver count, but at about 30 drivers it can run out of time.
- **What it looks like:** the workflow stays at "waiting" and retries.
- **Fix when the fleet grows:** run the tie as its own queued unit, one driver per message, and sum the results.

## R20-04 · `recon.enqueue_unit` executable by anon · Low

- `has_function_privilege('anon', 'recon.enqueue_unit(...)', 'execute')` is true.
- The `public.` wrapper is locked, so this is only reachable if anon has `USAGE` on schema `recon`.
- Check that, and revoke it if anon has usage.

## R18-05 · 7-day nightly check · Low (wait)

On **2026-10-30**: 7 `shadow_ok`, no `shadow_mismatch` in `recon.worker_alerts`.

---

## Still to come

- Page loads: p95 1.5 s vs the 1 s target.
- Phase 5 cleanup, after Oct 12 closes:
  - delete the preview fallback in `ReconCloseStep`;
  - delete `previewWeekClose`'s page use;
  - remove the `weekCloseApi.sync` call before Close.
- Phase 6 Delivery; Q2, Q3 and Q5 wait for it.
- After two closes through the wizard: `SOURCE_ENFORCE=enforce` on the **Cloud Run** service (the calculator's setting is now the one that counts).
