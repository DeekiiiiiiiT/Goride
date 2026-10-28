-- Card trip completion: credit driver digital wallet from platform clearing.

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
    'card_trip_digital_credit'
  ));

NOTIFY pgrst, 'reload schema';
