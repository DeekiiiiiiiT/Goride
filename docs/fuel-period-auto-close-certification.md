# Consumption Reconciliation — staging certification (Wave F)

Run against **staging** after Waves A–E **and Flawless Waves 1–3** are deployed. Do **not** treat production cron as trusted until F1–F3 pass.

**Code readiness (2026-09-02):** NEW-12/13 engine consolidation + CI render coverage landed. Dual mode default remains `skip`. Edge twin: `supabase/functions/_shared/fuelCore.ts`.

## Prerequisites

- Staging edge functions include NEW-9 auto-close skip + cursor threshold + fuel-core assembler.
- GitHub Action secret `FLEET_CRON_SECRET` (or `CRON_SECRET`) matches the edge env.
- Org preference `fuelSecondApproverThreshold` known (0 = off; default often 50_000 JMD).
- `gh auth login` (or `GH_TOKEN`) so you can `workflow_dispatch`.

## How to run F1 (cron dry-run)

```bash
gh workflow run fuel-period-auto-close-cron.yml
gh run list --workflow=fuel-period-auto-close-cron.yml --limit 1
gh run view <run-id> --log
```

Pass when the log body JSON includes `skipByReason`, `enqueued`, `skipped`, `details`, and HTTP 200. Confirm digest notification `fuel-autoclose-digest:YYYY-MM-DD`.

### Manual curl (same endpoint)

```bash
curl -sS -X POST \
  "${SUPABASE_URL}/functions/v1/make-server-37f42386/fuel/periods/auto-close?orgId=all" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "X-Fleet-Cron-Secret: ${FLEET_CRON_SECRET}" \
  -d '{}'
```

## Checklist

### F1 — Cron dry-run
- [ ] Trigger [fuel-period-auto-close-cron](../.github/workflows/fuel-period-auto-close-cron.yml) via `workflow_dispatch`.
- [ ] Response JSON includes `skipByReason`, `enqueued`, `skipped`, `details`.
- [ ] Digest alert appears (`fuel-autoclose-digest` / notification bell).

### F2 — Dual approval (NEW-9)
- [ ] Week with spend **above** threshold and otherwise clean → `skip_needs_approval` (not locked).
- [ ] Week with spend **below** threshold (or threshold 0) and otherwise eligible → can lock.

### F3 — Snapshot build (Program 4 / fuel-core)
- [ ] Money week never finalized, otherwise eligible, under threshold → cron **builds snapshots** and locks (or `skip_build_failed` / `skip_missing_snapshots` only when no settleable entries).
- [ ] Landing no longer requires “Finalize once” for clean money weeks (server builds on close).
- [ ] Golden check: UI strip `driverShare` / `companyShare` / `miscellaneousCost` match server snap for one locked week (NEW-12/13).

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

**Full cert (production-certified recon) requires F1–F8.**

Record pass date and who signed off below:

| Item | Pass date | Signer |
|---|---|---|
| F1 | | |
| F2 | | |
| F3 | | |
| F4–F8 (full cert) | | |

## Abort

If any F-item fails: stop cron trust, file regression against Flawless Waves 1–3, re-run only failed IDs. Disable the GitHub workflow if money is at risk.
