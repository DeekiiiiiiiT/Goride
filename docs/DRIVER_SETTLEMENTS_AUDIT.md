# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 22 · 2026-10-27 · §1 + §2 fixed in code/ops · closes still operator-driven**

Rev 1–21 are in git history. This revision records what shipped and what you still do by hand.

> **Next action:** after edge deploy of the fill-gate fix, Finalize Sep 14 → close Sep 14 → Sep 21 → Sep 28 → Oct 5 in order. Log only cash really received. Recheck Oct 19 = +37,397.13 after each close and the morning after.

## Closed — 1. Sep 14 Finalize blocked by declined card swipes
**Fix shipped (code):** `weekHasUnreviewedImplausibleFills` now skips rows where `countsInFuelLogSpend` is false (declined/fee/awaiting), before price and odometer checks. Tests cover declined $7,001.70 → not blocked; same row without `jaaRowKind` → blocked.

**Verify after edge deploy:** Sep 14 Fuel → Finalize week enabled (no `implausible_fills_unreviewed` from declined swipes).

## Closed — 2. Oct 19 resets to −7,313 every night
**Root cause confirmed:** Cloud Run `recon-worker` was on revision `00010` (2026-10-24), older than `postedAdjustments` / `statementBackedSettlement`. Nightly rebuilds wrote −7,313; edge rebuilds wrote +37,397.13.

**Ops done 2026-10-27:**
- Redeployed `recon-worker` → revision **`recon-worker-00012-cds`** (us-east1 / `goride-recon`), with Deno `--reload` cache bust.
- Hardened rebuild to always resolve `postedAdjustments` (and log when applied); pass sliced week anchor into rebuild.
- Rebuilt Kenny Oct 19 → **+37,397.13** with `postedAdjustments` **44,710.13**.
- Re-ran worker enqueue on the new revision; amount **stayed +37,397.13**.

**CI:** [`.github/workflows/deploy-recon-worker.yml`](../.github/workflows/deploy-recon-worker.yml) deploys on `main` when `_fleet-server` / `packages` / Dockerfile change. Needs GitHub secrets `GCP_RECON_WORKLOAD_IDENTITY_PROVIDER` + `GCP_RECON_SERVICE_ACCOUNT` (or keep using `scripts/deploy-recon-worker.ps1`).

**Still watch:** next nightly ~01:12 UTC — Oct 19 must remain +37,397.13.

## After §1 + §2 are live (operator)
1. **Sep 14:** Fuel → Finalize → Trips & earnings → Settlement preview → Close. Log only cash really received.
2. **Then Sep 21 → Sep 28 → Oct 5, in order.** After each close, check Oct 19 still reads +37,397.13, including the morning after.
3. **Don't:** reopen Oct 12, post a second −13,191.88, or edit cash rows.
