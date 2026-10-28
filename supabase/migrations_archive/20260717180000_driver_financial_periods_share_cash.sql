-- Phase 2: commission share + trip/tier fields on weekly driver financial periods.
ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS driver_share NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_share NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_share_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trip_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_id TEXT,
  ADD COLUMN IF NOT EXISTS tier_name TEXT;

-- Views created with SELECT * freeze columns at create time — recreate after ALTER.
CREATE OR REPLACE VIEW public.driver_financial_periods AS
  SELECT * FROM ledger.driver_financial_periods;
CREATE OR REPLACE VIEW public.driver_financial_period_lines AS
  SELECT * FROM ledger.driver_financial_period_lines;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
GRANT SELECT ON public.driver_financial_period_lines TO authenticated, service_role;

COMMENT ON COLUMN ledger.driver_financial_periods.driver_share IS
  'Commission Driver Share for the week (gross × tier %). Settlement/Payout SSOT.';
COMMENT ON COLUMN ledger.driver_financial_periods.fleet_share IS
  'Fleet residual of gross after driver share.';
