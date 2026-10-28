-- Cash settlement + wallet journal (additive; inactive until CASH_SETTLEMENT_ENABLED=1).

-- Extend ride status for cash settlement phase.
ALTER TABLE rides.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_status_check;
ALTER TABLE rides.ride_requests ADD CONSTRAINT ride_requests_status_check CHECK (status IN (
  'matching',
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
  'on_trip',
  'awaiting_cash_settlement',
  'completed',
  'cancelled'
));

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS cash_received_minor BIGINT,
  ADD COLUMN IF NOT EXISTS tip_received_minor BIGINT,
  ADD COLUMN IF NOT EXISTS cash_settlement_status TEXT
    CHECK (cash_settlement_status IS NULL OR cash_settlement_status IN ('pending', 'settled', 'disputed')),
  ADD COLUMN IF NOT EXISTS cash_settlement_outcome TEXT
    CHECK (cash_settlement_outcome IS NULL OR cash_settlement_outcome IN ('exact', 'underpay', 'overpay', 'unpaid')),
  ADD COLUMN IF NOT EXISTS fare_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rides_requests_cash_settlement_pending
  ON rides.ride_requests(assigned_driver_user_id, fare_locked_at)
  WHERE status = 'awaiting_cash_settlement';

CREATE TABLE IF NOT EXISTS rides.payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('rider', 'driver', 'system')),
  account_key TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JMD',
  balance_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_key, currency)
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_user_role
  ON rides.payment_accounts(user_id, role, currency)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rides.payment_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID REFERENCES rides.ride_requests(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'cash_trip_arrears',
    'cash_change_credit',
    'cash_change_debit',
    'wallet_topup',
    'wallet_adjustment',
    'cash_settlement_confirmed'
  )),
  debit_account_id UUID NOT NULL REFERENCES rides.payment_accounts(id),
  credit_account_id UUID NOT NULL REFERENCES rides.payment_accounts(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'JMD',
  request_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT payment_journal_entries_idempotency_per_ride UNIQUE (ride_request_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_journal_ride
  ON rides.payment_journal_entries(ride_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_journal_debit
  ON rides.payment_journal_entries(debit_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_journal_credit
  ON rides.payment_journal_entries(credit_account_id, created_at DESC);

-- System accounts (JMD).
INSERT INTO rides.payment_accounts (user_id, role, account_key, currency, balance_minor)
VALUES
  (NULL, 'system', 'platform:receivable', 'JMD', 0),
  (NULL, 'system', 'platform:clearing', 'JMD', 0)
ON CONFLICT (account_key, currency) DO NOTHING;

ALTER TABLE rides.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides.payment_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.rides_ride_requests AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO service_role;
GRANT SELECT ON public.rides_ride_requests TO authenticated;

NOTIFY pgrst, 'reload schema';
