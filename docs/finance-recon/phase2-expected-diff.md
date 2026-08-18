# Phase 2 expected diffs (locked policy)

Characterization (Phase 0) vs after hotfixes.

## Kenny Aug 3–9 2026

| Metric | Phase 0 (wrong) | After D1 de-dupe |
|---|---|---|
| Uber cash | 59,952.52 (doubled payout_cash) | 29,976.26 |
| Passenger cash | 84,172.52 | 54,196.26 |
| CSV warning | hidden overwrite $30,927.05 | warn $950.79 vs payout_cash |
| Settlement | −18,867.05 | +11,109.21 before tips (quota not met; tips $580 withheld) |

## Display

- Net fare + tips: stop adding `totalTips` on top of `periodEarnings`.
- Dispute recoveries: Toll card only.
- Collect KPI: two numbers.
- P&L: `payout_cash` not an expense; commission COGS; write-offs foot.
