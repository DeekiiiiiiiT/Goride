-- Phase 1 C-2/C-3: allow signed settlement_paid; add reconciliation_status;
-- calendar status/closed_at owned only by closeWeek/reopenWeek.

ALTER TABLE ledger.driver_financial_periods
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'open';

COMMENT ON COLUMN ledger.driver_financial_periods.reconciliation_status IS
  'Toll/fuel reconciliation gate (open|cleared|reopened). Distinct from calendar status/closed_at.';

ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_reconciliation_status_check;

ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_reconciliation_status_check
  CHECK (reconciliation_status IN ('open', 'cleared', 'reopened'));

-- Drop nonneg check and recreate WITHOUT settlement_paid >= 0 (C-2).
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
    AND COALESCE(tips_paid_to_driver, 0) >= 0
    AND COALESCE(tips_withheld, 0) >= 0
  );

-- N-1: MUST keep security_invoker — CREATE OR REPLACE without WITH resets reloptions
-- and reverts the view to security-definer (cross-tenant RLS bypass).
CREATE OR REPLACE VIEW public.driver_financial_periods
WITH (security_invoker = true)
AS
  SELECT * FROM ledger.driver_financial_periods;

GRANT SELECT ON public.driver_financial_periods TO authenticated, service_role;
