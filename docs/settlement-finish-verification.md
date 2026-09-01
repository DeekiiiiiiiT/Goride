# Settlement Flawless Finish — Verification Checklist

Use after each phase deploy. All automated checks must pass before prod flag flips.

## Automated (every phase)

```bash
pnpm --filter @roam/finance-core test
pnpm --filter @roam/fleet test
node scripts/verify_settlement_predicate_parity.mjs
node scripts/check-projection-flags-wired.mjs
node scripts/verify_settlement_tx_parity.mjs   # requires Supabase env
```

## Phase 0 — Hygiene

- [ ] `PROJECTION_EVENTS_CASH` docblock says RESERVED
- [ ] Runbook flag matrix matches `period_projection_flags.ts`
- [ ] CI runs predicate + projection-flag guards

## Phase 1 — Ops

- [ ] `FINANCE_RECON_WEBHOOK_URL` set (or dry-run tested)
- [ ] finance-recon SELECT includes `*_minor` columns
- [ ] Test drift triggers webhook payload with `runId`

## Phase 2 — Predicate triple-lock

- [ ] Fixture file covers all predicate branches
- [ ] TS / `.mjs` / SQL mirror agree on fixtures

## Phase 3A — Fares events

- [ ] `node scripts/report_fare_events_parity.mjs` reviewed
- [ ] `PROJECTION_EVENTS_FARES=true` in staging
- [ ] Kenny Gregory weeks unchanged on settlement desk

## Phase 3B — Tolls events

- [ ] `PROJECTION_EVENTS_TOLLS=true` in staging
- [ ] `projectionSources.tolls` = `"events"` on rebuilt weeks
- [ ] Workflow counts still from ledger (unmatched badges)

## Phase 3C — Cash events

- [ ] ADR accepted: cash flag deferred until event writers
- [ ] `SETTLEMENT_TX_TABLE_READ` rollback documented

## Phase 4 — A-3 minors

- [ ] Migration `20260901120000` backfills NULL minors
- [ ] `computePeriodSettlementMinor` tests green
- [ ] Nightly recon minor parity zero false positives

## Phase 5 — UX

- [ ] Reconciled overlay shows Data sources panel
- [ ] Badge tooltips plain English (not env var names)

## Phase 6 — Sign-off

- [ ] Collect $10,819.39 / Pay $9,947.32 unchanged (Kenny Gregory)
- [ ] Cash Write Off + Toll Charge week has mirror rows
- [ ] Notion Audit Tracker updated
