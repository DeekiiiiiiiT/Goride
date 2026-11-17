# ADR 0009: Month-boundary weeks

**Status:** Superseded for tier MTD (WRA-66, 2026-11-17) — anchor-month full weeks

## Decision

**Tier month-to-date (WRA-66 / owner D4):** Sum **full week** fares for every Monday **anchor** whose calendar month matches this week’s anchor month, from the first such anchor in that month through and including this week. Never count calendar days from the 1st of the month (that double-counts the previous month’s straddling week).

**Quota:** A week that straddles two months is still scored as one full week for weekly quota.

## Consequences

`computeWeekCommissionShare` uses `computeTierMonthToDateFares` in finance-core. Same helper powers ledger earnings history and driver/fleet tier display (`calculateMonthlyEarnings`).

Earlier note (2026-08-18) that tier cumulative ran from month-start through `periodEnd` is **replaced** by anchor-month weeks.