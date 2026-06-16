-- Cash + rider wallet split settlement: split outcome + journal entry types.

ALTER TABLE rides.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_cash_settlement_outcome_check;
ALTER TABLE rides.ride_requests ADD CONSTRAINT ride_requests_cash_settlement_outcome_check
  CHECK (cash_settlement_outcome IS NULL OR cash_settlement_outcome IN (
    'exact', 'underpay', 'overpay', 'unpaid', 'split'
  ));

ALTER TABLE rides.payment_journal_entries DROP CONSTRAINT IF EXISTS payment_journal_entries_entry_type_check;
ALTER TABLE rides.payment_journal_entries ADD CONSTRAINT payment_journal_entries_entry_type_check
  CHECK (entry_type IN (
    'cash_trip_arrears',
    'cash_change_credit',
    'cash_change_debit',
    'wallet_topup',
    'wallet_adjustment',
    'cash_settlement_confirmed',
    'cash_trip_collection',
    'change_paid_from_digital',
    'change_debt_open',
    'debt_repay_from_digital',
    'fare_allocation_from_cash',
    'card_trip_digital_credit',
    'wallet_fare_from_rider',
    'wallet_fare_to_driver',
    'platform_fare_guarantee'
  ));

NOTIFY pgrst, 'reload schema';
