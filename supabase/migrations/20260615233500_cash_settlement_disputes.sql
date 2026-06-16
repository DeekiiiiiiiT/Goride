-- Cash settlement disputes: allow riders to dispute contested amounts

-- Create disputes table
CREATE TABLE IF NOT EXISTS rides.cash_settlement_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id),
  rider_user_id UUID NOT NULL,
  driver_user_id UUID NOT NULL,
  disputed_amount_minor INTEGER NOT NULL,
  dispute_reason TEXT NOT NULL,
  dispute_status TEXT NOT NULL DEFAULT 'open'
    CHECK (dispute_status IN ('open', 'under_review', 'resolved_rider_favor', 'resolved_driver_favor', 'resolved_partial', 'rejected')),
  rider_notes TEXT,
  admin_notes TEXT,
  resolution_amount_minor INTEGER,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_disputes_ride ON rides.cash_settlement_disputes(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_disputes_rider ON rides.cash_settlement_disputes(rider_user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON rides.cash_settlement_disputes(dispute_status);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON rides.cash_settlement_disputes(created_at DESC);

-- Add dispute flag to ride_requests for quick filtering
ALTER TABLE rides.ride_requests 
ADD COLUMN IF NOT EXISTS has_active_dispute BOOLEAN DEFAULT false;

-- Expand entry_type CHECK constraint to include dispute_resolution_credit
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
    'dispute_resolution_credit'
  ));

-- Comments
COMMENT ON TABLE rides.cash_settlement_disputes IS 
  'Rider disputes for contested cash settlement amounts';
COMMENT ON COLUMN rides.cash_settlement_disputes.dispute_reason IS 
  'Reason code: full_fare_paid, incorrect_amount, charged_incorrectly, other';
COMMENT ON COLUMN rides.cash_settlement_disputes.resolution_amount_minor IS 
  'Amount credited back to rider on resolution (null if rejected or pending)';

NOTIFY pgrst, 'reload schema';
