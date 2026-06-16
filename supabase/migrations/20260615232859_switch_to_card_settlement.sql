-- Switch-to-card settlement: allow riders to pay shortfall via card instead of arrears

-- Expand entry_type CHECK constraint to include card_shortfall_payment
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
    'platform_fare_guarantee',
    'card_shortfall_payment'
  ));

-- Add column to track how shortfall was paid
ALTER TABLE rides.ride_requests
ADD COLUMN IF NOT EXISTS shortfall_payment_method TEXT
CHECK (shortfall_payment_method IN ('wallet', 'card', 'arrears'));

-- Add comment
COMMENT ON COLUMN rides.ride_requests.shortfall_payment_method IS 
  'How the rider paid any shortfall: wallet (auto-deducted), card (manually paid via card), or arrears (owed to platform)';

NOTIFY pgrst, 'reload schema';
