-- Allow trip_cancelled audit lines on platform ledger.

ALTER TABLE rides.ledger_lines DROP CONSTRAINT IF EXISTS ledger_lines_line_kind_check;
ALTER TABLE rides.ledger_lines ADD CONSTRAINT ledger_lines_line_kind_check CHECK (line_kind IN (
  'fare_earning', 'tip', 'platform_fee', 'cash_collection',
  'bank_payout', 'prior_period_adjustment', 'toll_refund',
  'cancellation', 'adjustment', 'payout', 'trip_cancelled'
));

NOTIFY pgrst, 'reload schema';
