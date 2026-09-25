# Toll Recon Phase 0 Baseline

Org: `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823` (deekiiiiiii's Fleet)

## Canary weeks

### Pre-flip (2026-09-25 Rev 1/2)

| period_anchor | unmatched_total | awaiting_tolls | notes |
|---|---:|---:|---|
| 2026-09-07 | 19 | 1 | Primary TR-C1 canary |
| 2026-09-14 | 4 | 0 | Still unmatched; payout awaiting_cash |

### Post-flip re-measure (2026-09-25 Rev 3 closeout)

| period_anchor | unmatched_total | awaiting_tolls_drivers | notes |
|---|---:|---:|---|
| 2026-09-07 | 16 | **0** | awaiting_tolls cleared (was 1); remaining unmatched is genuine actionable work |
| 2026-09-14 | 4 | **0** | Unchanged unmatched; no awaiting_tolls |

**TR-C1 canary:** `weeks_awaiting_tolls` driver-rows over last 26 weeks = **0**.

## Pending-hold count (26w)

0 trips with `tollRefundResolution.status = 'pending'` (re-confirmed 2026-09-25).

## TR-H5 actor proof

0 `toll_ledger:*` rows in the last 14 days with audit `userId` literal `admin`.

## TR-H9

No drivers with toll ledger activity missing a `driver_financial_periods` row in the last 26 weeks (Phase 0).

## Open question — disputeRefundTripSyncEnabled

**ON in production** (`toll_reconciliation:settings` → `disputeRefundTripSyncEnabled: true`). Counts readiness depends on this flag; treat as known.

## HAR / edge p95

Not captured in browser HAR this pass. Instrumentation now emits:
- `toll_recon.wizard_open.duration_ms` (client Sentry breadcrumb)
- `toll_recon.endpoint.duration_ms` / `toll_recon.ledger_loads_per_page_open` (server structured logs)
- `toll_recon.weeks_awaiting_tolls` / `toll_recon.command.*.PERIOD_SEALED`

Re-measure p95 against `docs/toll-recon-slos.md` after one week of emitted metrics.
