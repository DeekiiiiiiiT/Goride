# ADR 0008: Tips and weekly quota

**Status:** Accepted — 2026-08-18

## Decision

Tips count toward the weekly quota (earnings policy; currently $100,000). The driver receives 100% of that week’s tips only if quota is met. If not met, tips stay with the fleet but still count as quota progress. Quota disabled → driver keeps tips. Tips are never commissioned.

## Consequences

`computeWeekCommissionShare` returns `tipsPaidToDriver` / `tipsWithheld`. `computePeriodSettlement` adds `tipsPaidToDriver` to net payout.
