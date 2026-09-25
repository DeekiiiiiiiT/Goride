# Toll Recon Phase 0 Baseline (2026-09-25)

Org: `8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823` (deekiiiiiii's Fleet)

## Canary weeks (lock for parity)

| period_anchor | unmatched_total | awaiting_tolls | notes |
|---|---:|---:|---|
| 2026-09-07 | 19 | 1 | Primary TR-C1 canary |
| 2026-09-14 | 4 | 0 | Still unmatched; payout awaiting_cash |

## Pending-hold count (26w)

0 trips with `tollRefundResolution.status = 'pending'`. Live unmatched is mostly null-status unlinked trips + unreconciled ledger rows.

## TR-H9

No drivers with toll ledger activity missing a `driver_financial_periods` row in the last 26 weeks.

## HAR / edge p95

Not captured in this pass (no browser session). Re-measure when Phase 3/8 perf gates run.
