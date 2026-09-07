# Close Week runbook

## How to close a week

1. Open **Close the Week** and pick the Monday week.
2. Clear Fuel / Tolls / Settlement blockers (Review deep-links).
3. Unverified lanes mean the statement is still draft — finalize fuel or seal tolls from events.
4. Press **Close week** only when blockers = 0 (warnings alone do not block).

## When Close is blocked

| Code | Meaning | Fix |
|------|---------|-----|
| `FUEL_STATEMENT_MISSING` / `UNVERIFIED` | No closed fuel statement | Finalize Consumption Reconciliation |
| `TOLL_STATEMENT_MISSING` / `UNVERIFIED` | No closed toll statement from events | Finish Toll Reconciliation / ensure events exist |
| `EARNINGS_STATEMENT_MISSING` | Rebuild has not published earnings | Rebuild driver financial periods |
| `*_MISMATCH` | Period ≠ independent statement | Investigate drift; do not force-close |
| `CASH_SOURCE_MISMATCH` | Trip CSV vs ledger cash | Resolve cash source before close |
| `BUSINESS_WEEK_PNL_UNAVAILABLE` | Warn only — P&L feed not wired | Informational until Pass 4 P&L tie |

## How to restate

1. Late facts on a **Closed** week create a **draft** statement (version n+1).
2. Open **Restatement Queue** → **Open Close Week** for that week.
3. Sign through Close Week — never approve outside that flow.
