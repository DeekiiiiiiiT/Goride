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

**Backfill + parity completed 2026-09-01** (715/715, misses=0 from `fleet.transactions`).

### Cutover checklist

1. Deploy code that uses `isSettlementParticipantTransaction` (cash + payouts + write-offs + Toll Charge).
2. Backfill (if re-running): `node scripts/backfill_settlement_transactions.mjs`  
   Reads **`fleet.transactions`** (not KV). Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
3. Parity: `node scripts/verify_settlement_tx_parity.mjs`  
   Expect `misses=0`.
4. Read path defaults **ON** after deploy. To force-enable: `SETTLEMENT_TX_TABLE_READ=true`.
5. Spot-check one driver who has Cash Write Off and Toll Charge rows.

### Rollback

Set `SETTLEMENT_TX_TABLE_READ=false` on the fleet edge. Rebuild falls back to `getByPrefix("transaction:")` (fleet table scan).

## Nightly alerting

Set `FINANCE_RECON_WEBHOOK_URL` for Slack/webhook on drift.

## Cash source mismatch (§3.7)

Amber badge only. Does **not** block Pay. Ledger passenger cash wins over trip CSV.

## Toll reimbursed (§3.8)

Display-only on Expenses until the live trace in `docs/settlement-toll-reimbursement-trace.md` is filled and decided.
