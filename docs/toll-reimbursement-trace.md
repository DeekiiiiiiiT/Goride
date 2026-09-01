# Toll Reimbursement Trace Playbook (P-6 / §3.8)

**Status:** Awaiting product-owner sign-off before any formula change.

## Steps

1. Pick one week with `toll_reimbursed > 0` on `driver_financial_periods`.
2. Note driver id, `period_anchor`, and a known plaza toll amount.
3. Trace in order:
   - Toll ledger row → `financial_events` (`toll_reimbursed`, `trip_refund`, etc.)
   - Trip `fare_earning` / gross for same day
   - Period `driver_share`, `toll_cash_spend`, `metadata.financeCore.tollCashWashEligible`
   - Uber statement line (if available)
4. Record outcome:

| Outcome | Action |
|---------|--------|
| Reimbursement already inside fare gross | Adjust commission or add deduction in projection |
| Reimbursement booked separately | Keep display-only; close P-6 |
| Unclear | Escalate with statement line item |

## Sign-off

Product owner decision memo required before changing `computePeriodSettlement`.
