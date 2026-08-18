# ADR 0008: Tips and weekly quota

**Status:** Accepted — 2026-08-18. **Owner-ratified 2026-08-18.**

## Decision

Tips count toward the weekly quota (earnings policy; currently $100,000). Quota progress = fares + tips.

- Quota met → the driver receives 100% of that week’s tips. Tips are never commissioned.
- Quota missed → the driver does not receive the tips; they still count in the % toward quota. The fleet keeps them.
- Quota disabled → driver keeps tips.

## Consequences

`computeWeekCommissionShare` returns `tipsPaidToDriver` / `tipsWithheld`. `computePeriodSettlement` adds `tipsPaidToDriver` to net payout.
