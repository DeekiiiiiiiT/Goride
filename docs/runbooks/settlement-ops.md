# Settlement Operations Runbook

## Incident decision tree

```
Nightly drift alert (FINANCE_RECON_WEBHOOK_URL)
  ├─ kind starts with "ledger_" → projection vs financial_events mismatch
  │    └─ Check metadata.projectionSources on the week → flip source flag below
  └─ formula / minor parity → run repairDriverSettlementWeeks for driver/week

Cash transactions wrong
  └─ SETTLEMENT_TX_TABLE_READ=false (rollback to KV/table scan)
  └─ Do NOT use PROJECTION_EVENTS_CASH — reserved, no effect (see docs/adr/settlement-cash-events-deferred.md)

Toll money wrong (after PROJECTION_EVENTS_TOLLS wired)
  └─ PROJECTION_EVENTS_TOLLS=false (rollback to toll_ledger spend)

Fares / commission wrong
  └─ PROJECTION_EVENTS_FARES=false (re-enable trip gross fallback)

Fuel wrong
  └─ PROJECTION_EVENTS_FUEL=false OR PROJECTION_ALLOW_FUEL_SNAPSHOT=true (emergency only)
```

## Projection feature flags

| Env var | Default | Wired | Controls |
|---------|---------|-------|----------|
| `PROJECTION_EVENTS_FUEL` | ON (`!== false`) | Yes | Fuel from `financial_events`; snapshot fallback off unless opt-in |
| `PROJECTION_ALLOW_FUEL_SNAPSHOT` | OFF | Yes | Opt-in `finalized_report` fuel snapshot fallback |
| `PROJECTION_EVENTS_FARES` | OFF | Yes | When true, disables trip gross fallback (ledger `fare_earning` only) |
| `PROJECTION_EVENTS_TOLLS` | OFF | Yes | When true, toll spend from `toll_usage` events; workflow still from ledger |
| `PROJECTION_EVENTS_CASH` | — | **No (reserved)** | No effect — see [ADR](../adr/settlement-cash-events-deferred.md) |
| `SETTLEMENT_TX_TABLE_READ` | ON | Yes | Settlement tx storage: mirror table vs KV scan (A-11) |

## finance-recon drift

1. Check `finance_recon_runs.details` for `kind` (formula vs ledger vs minor parity).
2. Formula drift → run `repairDriverSettlementWeeks` for affected driver/week.
3. Ledger drift → compare `financial_events` vs period fuel/toll/fare columns.
4. Webhook payload includes `runId`, `driverId`, `week`, `kind`, `persisted`, `expected`.

### Nightly alerting

- `FINANCE_RECON_WEBHOOK_URL` — Slack/incoming webhook POST on any drift
- `FINANCE_RECON_WEBHOOK_DRY_RUN=true` — log payload without POST

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
4. Predicate triple-lock: `node scripts/verify_settlement_predicate_parity.mjs`
5. Read path defaults **ON** after deploy. To force-enable: `SETTLEMENT_TX_TABLE_READ=true`.
6. Spot-check one driver who has Cash Write Off and Toll Charge rows.

### Rollback

Set `SETTLEMENT_TX_TABLE_READ=false` on the fleet edge. Rebuild falls back to `getByPrefix("transaction:")` (fleet table scan).

## Predicate change process

Changing `isSettlementParticipantTransaction` requires same PR:

1. `packages/finance-core/src/driverCashPayment.ts`
2. `scripts/lib/settlementParticipant.mjs`
3. `scripts/lib/settlementParticipantSql.mjs`
4. `scripts/sql/backfill_settlement_transactions.sql`
5. `scripts/fixtures/settlement_participant_samples.json`

Run `node scripts/verify_settlement_predicate_parity.mjs` before merge.

## Cash source mismatch (§3.7)

Amber badge only. Does **not** block Pay. Ledger passenger cash wins over trip CSV.

## Toll reimbursed (§3.8)

Display-only on Expenses. Live trace complete — decision locked in `docs/settlement-toll-reimbursement-trace.md` (2026-08-24 week).

## A-3 minor-unit cutover

- `*_minor` columns dual-written on persist; `mapDbPeriod` prefers minors for settlement triple.
- Nightly recon checks minor/NUMERIC parity when columns present.
- Full formula cutover tracked in Flawless Finish Phase 4.

## Verification checklist

See `docs/settlement-finish-verification.md` for phase sign-off gates.
