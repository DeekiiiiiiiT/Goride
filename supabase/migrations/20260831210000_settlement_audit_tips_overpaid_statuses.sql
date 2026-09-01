-- Settlement audit remediation: tips columns + overpaid / awaiting_tolls statuses

ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS tips_paid_to_driver NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS tips_withheld NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN ledger.driver_financial_periods.tips_paid_to_driver IS
  'Tips paid to driver this week (quota met or quota off). Adds to payout_net.';
COMMENT ON COLUMN ledger.driver_financial_periods.tips_withheld IS
  'Tips withheld when quota missed — belongs to fleet share.';

ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_settlement_status_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_settlement_status_check
  CHECK (settlement_status IN (
    'pending', 'settled', 'company_owes', 'driver_owes',
    'overpaid',
    'processing', 'failed', 'on_hold'
  ));

ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_payout_status_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_payout_status_check
  CHECK (payout_status IN ('pending', 'awaiting_cash', 'awaiting_tolls', 'finalized'));

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
    AND COALESCE(tips_paid_to_driver, 0) >= 0
    AND COALESCE(tips_withheld, 0) >= 0
  );

-- Views created with SELECT * freeze columns at create time — recreate after ALTER.
CREATE OR REPLACE VIEW public.driver_financial_periods AS
  SELECT * FROM ledger.driver_financial_periods;
CREATE OR REPLACE VIEW public.driver_financial_period_lines AS
  SELECT * FROM ledger.driver_financial_period_lines;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
GRANT SELECT ON public.driver_financial_period_lines TO authenticated, service_role;
