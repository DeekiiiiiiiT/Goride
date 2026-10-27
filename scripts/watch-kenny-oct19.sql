-- Phase D: Oct 19 Kenny residual. Compare settlement_amount to EXPECTED (default 37397.13 until closes finish).
select settlement_amount, status, updated_at
from ledger.driver_financial_periods
where driver_id = '73e5b1dc-01b4-45ee-a34a-25a3256b9841'
  and period_anchor = '2026-10-19';
