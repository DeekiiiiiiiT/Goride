-- Cash Wallet write-off: company loss that reduces cash still held without counting as cash returned.
ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS cash_written_off NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN ledger.driver_financial_periods.cash_written_off IS
  'Sum of Cash_Write_Off txs tagged to this Settlement Week. Reduces cash_still_held; never cash_returned.';

-- Views created with SELECT * freeze columns at create time — recreate after ALTER.
CREATE OR REPLACE VIEW public.driver_financial_periods AS
  SELECT * FROM ledger.driver_financial_periods;
CREATE OR REPLACE VIEW public.driver_financial_period_lines AS
  SELECT * FROM ledger.driver_financial_period_lines;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
GRANT SELECT ON public.driver_financial_period_lines TO authenticated, service_role;

-- Extend non-neg cash check to include write-offs.
ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_cash_nonneg_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_cash_nonneg_check
  CHECK (
    COALESCE(cash_collected, 0) >= 0
    AND COALESCE(cash_returned, 0) >= 0
    AND COALESCE(cash_still_held, 0) >= 0
    AND COALESCE(toll_cash_spend, 0) >= 0
    AND COALESCE(cash_written_off, 0) >= 0
  );
