# ADR 0011: P&L driver cost lines

**Status:** Accepted — 2026-08-18

## Decision

- Passenger cash (`payout_cash`) is not an expense.
- Driver commission (`driverShare`) is cost of revenue.
- Cash write-offs are a visible P&L line.
- `driver_payout` events are actual cash movements (memo / cash basis), not accrued settlements.
- Expense credits may go negative; the statement must foot to operating profit.

## Consequences

`buildPnLFromCanonicalEvents` gains `driver_commission` and `cash_write_offs` line ids. Bundle layer stops silent basis switching.
