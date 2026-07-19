-- Schema audit Wave 3: driver ledger status CHECKs + child FK RESTRICT

ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_settlement_status_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_settlement_status_check
  CHECK (settlement_status IN (
    'pending', 'settled', 'company_owes', 'driver_owes',
    'processing', 'failed', 'on_hold'
  ));

ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_payout_status_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_payout_status_check
  CHECK (payout_status IN ('pending', 'awaiting_cash', 'finalized'));

ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_toll_status_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_toll_status_check
  CHECK (toll_status IN ('n/a', 'reconciled', 'unmatched'));

-- Non-neg cash columns (settlement_amount intentionally signed)
ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_cash_nonneg_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_cash_nonneg_check
  CHECK (
    COALESCE(cash_collected, 0) >= 0
    AND COALESCE(cash_returned, 0) >= 0
    AND COALESCE(cash_still_held, 0) >= 0
    AND COALESCE(toll_cash_spend, 0) >= 0
  );

ALTER TABLE ledger.financial_allocations
  DROP CONSTRAINT IF EXISTS financial_allocations_financial_event_id_fkey;
ALTER TABLE ledger.financial_allocations
  ADD CONSTRAINT financial_allocations_financial_event_id_fkey
  FOREIGN KEY (financial_event_id) REFERENCES ledger.financial_events(id) ON DELETE RESTRICT;

ALTER TABLE ledger.driver_financial_period_lines
  DROP CONSTRAINT IF EXISTS driver_financial_period_lines_period_id_fkey;
ALTER TABLE ledger.driver_financial_period_lines
  ADD CONSTRAINT driver_financial_period_lines_period_id_fkey
  FOREIGN KEY (period_id) REFERENCES ledger.driver_financial_periods(id) ON DELETE RESTRICT;
