-- Fuel Expenses status mirrors Consumption Reconciliation week lock (toll_status pattern).
ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS fuel_status TEXT NOT NULL DEFAULT 'n/a';

COMMENT ON COLUMN ledger.driver_financial_periods.fuel_status IS
  'n/a | pending | in_progress | finalized — SoT is fuel_reconciliation_period lock, not money-posted events';

ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_fuel_status_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_fuel_status_check
  CHECK (fuel_status IN ('n/a', 'pending', 'in_progress', 'finalized'));

CREATE OR REPLACE VIEW public.driver_financial_periods AS
  SELECT * FROM ledger.driver_financial_periods;
CREATE OR REPLACE VIEW public.driver_financial_period_lines AS
  SELECT * FROM ledger.driver_financial_period_lines;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
GRANT SELECT ON public.driver_financial_period_lines TO authenticated, service_role;
