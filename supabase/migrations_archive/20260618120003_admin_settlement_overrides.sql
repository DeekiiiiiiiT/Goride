-- Admin settlement override tools: write-off, manual settle, driver adjustments

-- Expand entry_type CHECK constraint to include admin override types
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
    'card_shortfall_payment',
    'dispute_resolution_credit',
    'admin_arrears_writeoff',
    'admin_settlement_adjustment',
    'admin_driver_credit',
    'admin_driver_debit'
  ));

-- Audit table for admin overrides
CREATE TABLE IF NOT EXISTS rides.admin_settlement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID REFERENCES rides.ride_requests(id),
  rider_user_id UUID,
  driver_user_id UUID,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'arrears_writeoff',
    'arrears_partial_writeoff',
    'manual_settle',
    'driver_credit',
    'driver_debit',
    'settlement_void'
  )),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JMD',
  reason_code TEXT NOT NULL,
  admin_notes TEXT,
  performed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_overrides_ride ON rides.admin_settlement_overrides(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_rider ON rides.admin_settlement_overrides(rider_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_driver ON rides.admin_settlement_overrides(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_overrides_created ON rides.admin_settlement_overrides(created_at DESC);

-- Comments
COMMENT ON TABLE rides.admin_settlement_overrides IS 
  'Audit trail for admin settlement override actions';
COMMENT ON COLUMN rides.admin_settlement_overrides.action_type IS 
  'Type of override action performed';
COMMENT ON COLUMN rides.admin_settlement_overrides.reason_code IS 
  'Standard reason code: goodwill, system_error, driver_confirmed_paid, duplicate_charge, support_ticket, etc.';

NOTIFY pgrst, 'reload schema';
