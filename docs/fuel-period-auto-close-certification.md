# Consumption Reconciliation — staging certification (Wave F)

Run against **staging** after Waves A–E are deployed. Do **not** treat production cron as trusted until F1–F3 pass.

## Prerequisites

- Staging edge functions include NEW-9 auto-close skip + cursor threshold.
- GitHub Action secret `FLEET_CRON_SECRET` (or `CRON_SECRET`) matches the edge env.
- Org preference `fuelSecondApproverThreshold` known (0 = off; default often 50_000 JMD).

## Checklist

### F1 — Cron dry-run
- [ ] Trigger [fuel-period-auto-close-cron](../.github/workflows/fuel-period-auto-close-cron.yml) via `workflow_dispatch`.
- [ ] Response JSON includes `skipByReason`, `enqueued`, `skipped`, `details`.
- [ ] Digest alert appears (`fuel-autoclose-digest` / notification bell).

### F2 — Dual approval (NEW-9)
- [ ] Week with spend **above** threshold and otherwise clean → `skip_needs_approval` (not locked).
- [ ] Week with spend **below** threshold (or threshold 0) and otherwise eligible → can lock.

### F3 — Snapshot build (v1 → Program 4)
- [ ] Money week never finalized, otherwise eligible, under threshold → cron **builds snapshots** and locks (or `skip_build_failed` / `skip_missing_snapshots` only when no settleable entries).
- [ ] Landing no longer requires “Finalize once” for clean money weeks (server builds on close).

### F4 — Partial finalize (NEW-7)
- [ ] Force 1-of-N driver fail → week stays `ready`, toast warns, retry completes.

### F5 — Mid-finalize resume (C4)
- [ ] Kill tab mid-finalize → resume → no double settle / no orphan wallet rows.

### F6 — Cross-operator persistence (H8/H9)
- [ ] Operator A leakage review + step advance → Operator B sees both on another device/session.

### F7 — Cross-tenant reopen (C1)
- [ ] Two orgs, same Monday; Org A reopens → Org B unchanged.

### F8 — Evidence pack
- [ ] Evidence CSV matches settlement table for a locked week.

## Gate

**Production cron trust requires: Wave A deployed + F1–F3 checked.**

Record pass date and who signed off below:

| Item | Pass date | Signer |
|---|---|---|
| F1 | | |
| F2 | | |
| F3 | | |
| F4–F8 (full cert) | | |
