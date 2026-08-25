# Toll Reconciliation Audit

Audit-only pass over the Toll Reconciliation workflow (landing page ? period wizard),
covering `apps/fleet/src/components/toll-tags/reconciliation/*`,
`apps/fleet/src/hooks/useTollReconciliation*.ts`, `apps/fleet/src/utils/toll*.ts`, and the
backend in `supabase/functions/_fleet-server/toll_controller.tsx` +
`toll_period_controller.tsx`.

Original audit was read-only. Remediation landed on `fix/toll-recon-audit`.

---

## Remediation status (ready to merge ? main)

| ID | Status | Notes |
|----|--------|-------|
| 1.1 | Fixed | Quarantine matches API tx shape (`vendor` / `ledgerPlaza` / Cash). Edge + client deployed/updated. Hard-delete of rows still needs your OK. |
| 1.2 | Done | Content fingerprint on live write + backfill |
| 1.3 | Done | Toll Spend uses week-key + quarantine gate |
| 1.4 / 4.1 | Done | Mirror parity tests |
| 1.5 | Done | Plaza SSOT; `ledgerPlaza` preserved after metadata spread |
| 2.1 / 2.2 | Fixed + edge deployed | 26-week lookback + week-bucketed fleet-loss (`pnpm deploy:edge` 2026-08-25) |
| 2.3?2.6 | Done | Trust server netTollLoss; parallel fetch; React Query; lazy rematch/automation |
| 3.x / 4.x | Done | Repair gate, DEV Test, Retry, caps, Unlinked filter; Vineyards rate documented |
| Net vs Reimbursed | Patched | Periods load includes `toll_reimbursement`; unit test covers Spend ? coverage ? Net |

### Localhost check before you merge
1. Hard refresh `http://localhost:3000`
2. Open Toll Reconciliation ? Aug 17?23
3. Toll Spend should be **below $10180** if fake cash was in that week
4. Landing should load in seconds, not minutes
5. If Reimbursed > 0, Net Toll Loss should be **below** Toll Spend when trip coverage exists in canonical

**Still needs your OK:** hard-delete quarantined rows after `GET ?/toll-ledger/quarantine-report`.

---

## Original findings (archived summary)

See git history of this file for the full audit text (sections 1?4). Headline issues were: synthetic cash Transjam rows inflating Toll Spend; unbounded periods load; duplicated Net Toll Loss refetch; rule drift; UX polish.
