-- Rebuild writes toll_status = 'in_progress' when claims/disputes remain open.
-- Prior CHECK omitted it, so fuel expense sync upserts failed for those weeks.
ALTER TABLE ledger.driver_financial_periods
  DROP CONSTRAINT IF EXISTS driver_financial_periods_toll_status_check;
ALTER TABLE ledger.driver_financial_periods
  ADD CONSTRAINT driver_financial_periods_toll_status_check
  CHECK (toll_status IN ('n/a', 'reconciled', 'unmatched', 'in_progress'));
