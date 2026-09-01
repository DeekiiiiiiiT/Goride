# Settlement Operations Runbook

## finance-recon drift

1. Check `finance_recon_runs.details` for `kind` (formula vs ledger).
2. Formula drift → run `repairDriverSettlementWeeks` for affected driver/week.
3. Ledger drift → compare `financial_events` vs period fuel/toll columns.

## Week invisible in queue

1. Query `settlement_status` — legacy `overpaid` should be zero post P-1 migration.
2. Run `repairDriverSettlementWeeks({ driverId, onlyOpenOrOwes: true })`.

## Dispute / payout proof

1. Read `metadata.signedSnapshot` on `driver_financial_periods`.
2. If missing after rebuild, verify Phase 1 `buildPeriodMetadata` is deployed.

## Enable indexed transaction reads (A-11)

1. Backfill: `node scripts/backfill_settlement_transactions.mjs` (after deploy).
2. Set `SETTLEMENT_TX_TABLE_READ=true` on fleet edge when backfill complete.

## Nightly alerting

Set `FINANCE_RECON_WEBHOOK_URL` for Slack/webhook on drift.
