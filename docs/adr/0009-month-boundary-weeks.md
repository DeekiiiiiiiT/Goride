# ADR 0009: Month-boundary weeks

**Status:** Accepted — 2026-08-18

## Decision

A week that straddles two months is scored as one full week for both quota and tier. Cumulative earnings for tier lookup run from the month-start of the week’s Monday through the week’s Sunday — not truncated at month-end.

## Consequences

`computeWeekCommissionShare` uses `cumulativeCap = periodEnd`.
