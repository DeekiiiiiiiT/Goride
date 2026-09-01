# Settlement Program — Phase 0 Pre-flight

**Date:** 2026-09-01  
**Gate:** Must pass before Phase 1 deploy

## P-1 — Legacy `overpaid` status backfill

**Pre-check** (run against target environment):

```sql
-- scripts/pre_deploy_overpaid_count.sql
SELECT COUNT(*) AS overpaid_status_rows
FROM ledger.driver_financial_periods
WHERE settlement_status = 'overpaid';
```

**Post-migration** (`20260831220000_settlement_overpaid_status_backfill.sql`): expect `overpaid_status_rows = 0`.

## P-0 — finance-recon baseline

Confirm `finance_recon_runs.ok = true` for the last 7 days on drivers with cash tolls:

```sql
SELECT run_at, ok, period_count, drift_count
FROM public.finance_recon_runs
ORDER BY run_at DESC
LIMIT 7;
```

Invoke manually (staging/prod):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/finance-recon" \
  -H "X-Fleet-Cron-Secret: $FLEET_CRON_SECRET"
```

## Scope freeze (Phase 0 → Phase 1)

No new settlement projection fields or desk columns until unified `buildPersistBody` ships (closes C-1, C-2, A-2).

## Program tracker

- Repo: `SETTLEMENT_CALCULATION_AUDIT.md`
- Notion: [Settlement Calculation Remediation](https://app.notion.com/p/3ce2ac0f759881dca6f2f2778e35a21e)
