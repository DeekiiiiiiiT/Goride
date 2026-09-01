# ADR: Defer PROJECTION_EVENTS_CASH until event writers exist

**Status:** Accepted (2026-09-01)  
**Context:** Settlement audit E-1 / Phase 3C

## Decision

Do **not** wire `PROJECTION_EVENTS_CASH` until `financial_events` rows exist for:

- `cash_collected` (trip import / commission path)
- `cash_returned` and write-offs (transaction POST)
- Settlement-paid flows (may overlap existing types)

## Current cash money path (authoritative)

1. **Cash collected** — trip CSV + ledger `payout_cash` entries via `computeWeekCashBase`
2. **Cash returned / write-off / settlement paid** — settlement transactions via A-11 mirror (`SETTLEMENT_TX_TABLE_READ`, default ON)

These are separate concerns:

| Lever | Layer | Wired |
|-------|-------|-------|
| `SETTLEMENT_TX_TABLE_READ` | Storage (mirror table vs KV scan) | Yes |
| `PROJECTION_EVENTS_CASH` | Source-of-truth (events vs trips+tx) | No — reserved |

## Rollback during incident

- Cash transaction reads wrong → `SETTLEMENT_TX_TABLE_READ=false`
- Do **not** set `PROJECTION_EVENTS_CASH=false` — it has no effect today

## Follow-up (Phase 3C backlog)

1. Dual-write `postFinancialEvent` at mutation points
2. Backfill historical cash events
3. Wire flag with parity script + ledger recon extension
4. Move from RESERVED to WIRED in `period_projection_flags.ts`
