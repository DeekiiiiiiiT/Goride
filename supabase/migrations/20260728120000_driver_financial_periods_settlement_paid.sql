-- Driver Payouts: cleared fleet→driver disbursements that reduce company_owes residual.
ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS settlement_paid NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN ledger.driver_financial_periods.settlement_paid IS
  'Sum of cleared Driver Payout (Payout / Driver Payouts) txs tagged to this Settlement Week. Reduces settlement_amount when company owes; never cash_returned.';

-- Views created with SELECT * freeze columns at create time — recreate after ALTER.
CREATE OR REPLACE VIEW public.driver_financial_periods AS
  SELECT * FROM ledger.driver_financial_periods;
CREATE OR REPLACE VIEW public.driver_financial_period_lines AS
  SELECT * FROM ledger.driver_financial_period_lines;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
GRANT SELECT ON public.driver_financial_period_lines TO authenticated, service_role;

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
    AND COALESCE(settlement_paid, 0) >= 0
  );
