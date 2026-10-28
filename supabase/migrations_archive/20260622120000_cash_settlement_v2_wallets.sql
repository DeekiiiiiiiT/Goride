-- Cash settlement V2: driver sub-wallets (digital/cash/debt), obligations, extended journal types.

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS cash_settlement_snapshot JSONB;

CREATE TABLE IF NOT EXISTS rides.payment_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ride_request_id UUID REFERENCES rides.ride_requests(id) ON DELETE SET NULL,
  obligation_type TEXT NOT NULL CHECK (obligation_type IN (
    'change_to_rider', 'arrears_recovery', 'other'
  )),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  remaining_minor BIGINT NOT NULL CHECK (remaining_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'JMD',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_obligations_driver_open
  ON rides.payment_obligations(driver_user_id, status)
  WHERE status IN ('open', 'partial');

CREATE INDEX IF NOT EXISTS idx_payment_obligations_ride
  ON rides.payment_obligations(ride_request_id)
  WHERE ride_request_id IS NOT NULL;

-- Extend journal entry types (drop/recreate CHECK — additive types only).
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
    'fare_allocation_from_cash'
  ));

CREATE OR REPLACE VIEW public.rides_payment_obligations AS
  SELECT * FROM rides.payment_obligations;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides_payment_obligations TO service_role;

NOTIFY pgrst, 'reload schema';
