-- Platform transaction-grain ledger lines (Roam passenger trips).
-- Amounts in minor currency units (e.g. JMD cents).

CREATE TABLE IF NOT EXISTS rides.ledger_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES rides.ride_requests(id) ON DELETE CASCADE,
  line_kind TEXT NOT NULL CHECK (line_kind IN (
    'fare_earning', 'tip', 'platform_fee', 'cash_collection',
    'bank_payout', 'prior_period_adjustment', 'toll_refund',
    'cancellation', 'adjustment', 'payout'
  )),
  description TEXT NOT NULL,
  reporting_at TIMESTAMPTZ NOT NULL,
  paid_to_you_minor BIGINT NOT NULL DEFAULT 0,
  earnings_gross_minor BIGINT NOT NULL DEFAULT 0,
  cash_collected_minor BIGINT NOT NULL DEFAULT 0,
  bank_transferred_minor BIGINT NOT NULL DEFAULT 0,
  fare_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card')),
  driver_user_id UUID NULL,
  rider_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_lines_ride ON rides.ledger_lines(ride_request_id);
CREATE INDEX IF NOT EXISTS idx_ledger_lines_driver_reporting ON rides.ledger_lines(driver_user_id, reporting_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_lines_rider_reporting ON rides.ledger_lines(rider_user_id, reporting_at DESC);

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS fare_final_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS tip_minor BIGINT,
  ADD COLUMN IF NOT EXISTS platform_fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS driver_net_minor BIGINT;

DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO service_role;
GRANT SELECT ON public.rides_ride_requests TO authenticated;

NOTIFY pgrst, 'reload schema';
