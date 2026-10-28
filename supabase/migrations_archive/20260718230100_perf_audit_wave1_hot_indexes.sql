-- Perf audit Wave 1: highest-traffic ride / admin / payment / maintenance indexes

-- Active ride: rider + created_at (passenger app open)
CREATE INDEX IF NOT EXISTS idx_ride_requests_rider_active_created
  ON rides.ride_requests (rider_user_id, created_at DESC)
  WHERE status IN (
    'matching', 'driver_assigned', 'driver_en_route_pickup',
    'driver_arrived_pickup', 'on_trip'
  );

CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger_active_created
  ON rides.ride_requests (passenger_user_id, created_at DESC)
  WHERE passenger_user_id IS NOT NULL
    AND status IN (
      'matching', 'driver_assigned', 'driver_en_route_pickup',
      'driver_arrived_pickup', 'on_trip'
    );

-- Activity / trip history sort
CREATE INDEX IF NOT EXISTS idx_ride_requests_rider_updated
  ON rides.ride_requests (rider_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger_updated
  ON rides.ride_requests (passenger_user_id, updated_at DESC)
  WHERE passenger_user_id IS NOT NULL;

-- Admin dashboard status + time
CREATE INDEX IF NOT EXISTS idx_ride_requests_status_created
  ON rides.ride_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ride_requests_status_updated
  ON rides.ride_requests (status, updated_at DESC);

-- Phone lookup
CREATE INDEX IF NOT EXISTS idx_rides_rider_profiles_phone
  ON rides.rider_profiles (phone)
  WHERE phone IS NOT NULL;

-- Online drivers dashboard
CREATE INDEX IF NOT EXISTS idx_rides_driver_locations_available_updated
  ON rides.driver_locations (available_for_rides, updated_at DESC);

-- Payment webhook lookup
CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_intent_id
  ON payments.payment_intents (provider_intent_id);

-- Maintenance org listing
CREATE INDEX IF NOT EXISTS idx_mr_org_performed
  ON public.maintenance_records (organization_id, performed_at_date DESC);

-- Outbox drain sorts by created_at while filtering pending (complements available_at index)
CREATE INDEX IF NOT EXISTS idx_fin_outbox_pending_created
  ON ledger.financial_outbox (status, created_at ASC)
  WHERE status = ANY (ARRAY['pending'::text, 'processing'::text]);

-- Evidence files (table may be absent on some envs)
DO $ev$
BEGIN
  IF to_regclass('public.evidence_files') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_evidence_files_bucket_active
      ON public.evidence_files (bucket_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_evidence_files_deleted_at
      ON public.evidence_files (deleted_at DESC)
      WHERE status = 'deleted';
  END IF;
END
$ev$;
