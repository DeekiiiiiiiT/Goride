-- Scheduled / reserve rides: additive columns, status, dispatch RPC, stale cleanup.

ALTER TABLE rides.ride_requests
  ADD COLUMN IF NOT EXISTS booking_kind TEXT NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS scheduled_pickup_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pickup_window_minutes INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS scheduled_dispatched_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scheduled_cancel_reason TEXT NULL;

ALTER TABLE rides.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_booking_kind_check;
ALTER TABLE rides.ride_requests ADD CONSTRAINT ride_requests_booking_kind_check
  CHECK (booking_kind IN ('immediate', 'scheduled'));

ALTER TABLE rides.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_pickup_window_minutes_check;
ALTER TABLE rides.ride_requests ADD CONSTRAINT ride_requests_pickup_window_minutes_check
  CHECK (pickup_window_minutes >= 5 AND pickup_window_minutes <= 30);

ALTER TABLE rides.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_scheduled_cancel_reason_check;
ALTER TABLE rides.ride_requests ADD CONSTRAINT ride_requests_scheduled_cancel_reason_check
  CHECK (
    scheduled_cancel_reason IS NULL
    OR scheduled_cancel_reason IN (
      'rider',
      'system_no_drivers',
      'system_rider_busy',
      'system_missed_window'
    )
  );

ALTER TABLE rides.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_status_check;
ALTER TABLE rides.ride_requests ADD CONSTRAINT ride_requests_status_check CHECK (status IN (
  'scheduled',
  'matching',
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
  'on_trip',
  'awaiting_cash_settlement',
  'completed',
  'cancelled'
));

ALTER TABLE rides.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_booking_kind_scheduled_pickup_check;
ALTER TABLE rides.ride_requests ADD CONSTRAINT ride_requests_booking_kind_scheduled_pickup_check
  CHECK (
    (booking_kind = 'immediate' AND scheduled_pickup_at IS NULL)
    OR (booking_kind = 'scheduled' AND scheduled_pickup_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_rides_requests_scheduled_due
  ON rides.ride_requests (scheduled_pickup_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_rides_requests_rider_scheduled
  ON rides.ride_requests (rider_user_id, scheduled_pickup_at)
  WHERE status = 'scheduled';

COMMENT ON COLUMN rides.ride_requests.booking_kind IS 'immediate = on-demand; scheduled = reserve ride awaiting dispatch cron.';
COMMENT ON COLUMN rides.ride_requests.scheduled_pickup_at IS 'Target pickup time for scheduled bookings.';
COMMENT ON COLUMN rides.ride_requests.scheduled_dispatched_at IS 'When cron transitioned scheduled → matching.';

-- Refresh public view for PostgREST reads (policy depends on this view — drop/recreate in order).
DROP POLICY IF EXISTS ride_messages_participant_select ON public.ride_messages;

DROP VIEW IF EXISTS public.rides_ride_requests;
CREATE VIEW public.rides_ride_requests AS
  SELECT * FROM rides.ride_requests;

GRANT SELECT ON public.rides_ride_requests TO authenticated, service_role;

CREATE POLICY ride_messages_participant_select ON public.ride_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rides.ride_requests r
      WHERE r.id = ride_request_id
        AND (
          r.rider_user_id = auth.uid()
          OR r.assigned_driver_user_id = auth.uid()
          OR r.passenger_user_id = auth.uid()
        )
    )
  );

-- Extend create RPC (on-demand defaults unchanged).
CREATE OR REPLACE FUNCTION public.rides_create_ride_request(p_row JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.ride_requests;
BEGIN
  INSERT INTO rides.ride_requests (
    rider_user_id,
    status,
    pickup_lat,
    pickup_lng,
    pickup_address,
    dropoff_lat,
    dropoff_lng,
    dropoff_address,
    vehicle_option,
    fare_estimate_minor,
    surge_multiplier,
    currency,
    distance_estimate_km,
    duration_estimate_minutes,
    eta_pickup_seconds_estimate,
    quote_token_hash,
    fare_breakdown,
    idempotency_key,
    driver_offer_timeout_seconds,
    matching_wave,
    route_polyline_encoded,
    verification_pin,
    payment_method,
    guest_passenger_name,
    guest_passenger_phone,
    booking_purpose,
    passenger_user_id,
    rider_contact_id,
    booking_request_id,
    roam_mode,
    booking_kind,
    scheduled_pickup_at,
    pickup_window_minutes,
    scheduled_dispatched_at,
    scheduled_cancel_reason
  )
  VALUES (
    (p_row->>'rider_user_id')::UUID,
    COALESCE(p_row->>'status', 'matching'),
    (p_row->>'pickup_lat')::DOUBLE PRECISION,
    (p_row->>'pickup_lng')::DOUBLE PRECISION,
    NULLIF(p_row->>'pickup_address', ''),
    (p_row->>'dropoff_lat')::DOUBLE PRECISION,
    (p_row->>'dropoff_lng')::DOUBLE PRECISION,
    NULLIF(p_row->>'dropoff_address', ''),
    COALESCE(p_row->>'vehicle_option', 'standard'),
    (p_row->>'fare_estimate_minor')::BIGINT,
    COALESCE((p_row->>'surge_multiplier')::NUMERIC, 1),
    COALESCE(p_row->>'currency', 'USD'),
    NULLIF(p_row->>'distance_estimate_km', '')::NUMERIC,
    NULLIF(p_row->>'duration_estimate_minutes', '')::NUMERIC,
    NULLIF(p_row->>'eta_pickup_seconds_estimate', '')::INTEGER,
    NULLIF(p_row->>'quote_token_hash', ''),
    p_row->'fare_breakdown',
    NULLIF(p_row->>'idempotency_key', ''),
    COALESCE((p_row->>'driver_offer_timeout_seconds')::INTEGER, 15),
    COALESCE((p_row->>'matching_wave')::INTEGER, 0),
    NULLIF(p_row->>'route_polyline_encoded', ''),
    NULLIF(p_row->>'verification_pin', ''),
    NULLIF(p_row->>'payment_method', ''),
    NULLIF(p_row->>'guest_passenger_name', ''),
    NULLIF(p_row->>'guest_passenger_phone', ''),
    NULLIF(p_row->>'booking_purpose', ''),
    NULLIF(p_row->>'passenger_user_id', '')::UUID,
    NULLIF(p_row->>'rider_contact_id', '')::UUID,
    NULLIF(p_row->>'booking_request_id', '')::UUID,
    NULLIF(p_row->>'roam_mode', ''),
    COALESCE(p_row->>'booking_kind', 'immediate'),
    NULLIF(p_row->>'scheduled_pickup_at', '')::TIMESTAMPTZ,
    COALESCE((p_row->>'pickup_window_minutes')::INTEGER, 10),
    NULLIF(p_row->>'scheduled_dispatched_at', '')::TIMESTAMPTZ,
    NULLIF(p_row->>'scheduled_cancel_reason', '')
  )
  RETURNING * INTO rec;

  RETURN to_jsonb(rec);
END;
$$;

REVOKE ALL ON FUNCTION public.rides_create_ride_request(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_create_ride_request(JSONB) TO service_role;

-- Active ride statuses for rider busy check (mirrors Edge ACTIVE_RIDE_STATUSES).
CREATE OR REPLACE FUNCTION public.rides_rider_has_active_ride(p_rider_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = rides, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rides.ride_requests r
    WHERE r.rider_user_id = p_rider_user_id
      AND r.status IN (
        'matching',
        'driver_assigned',
        'driver_en_route_pickup',
        'driver_arrived_pickup',
        'on_trip',
        'awaiting_cash_settlement'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.rides_rider_has_active_ride(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_rider_has_active_ride(UUID) TO service_role;

-- Activate due scheduled rides; skip when rider has active trip.
CREATE OR REPLACE FUNCTION public.rides_dispatch_due_scheduled_rides(
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_buffer_minutes INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.ride_requests;
  activated UUID[] := ARRAY[]::UUID[];
  skipped_busy UUID[] := ARRAY[]::UUID[];
  cancelled_missed INT := 0;
BEGIN
  -- Missed window: scheduled pickup passed without dispatch.
  UPDATE rides.ride_requests
  SET
    status = 'cancelled',
    cancelled_by = 'system',
    cancel_reason = 'scheduled_missed_window',
    scheduled_cancel_reason = 'system_missed_window',
    updated_at = p_now
  WHERE status = 'scheduled'
    AND scheduled_pickup_at < p_now - INTERVAL '15 minutes';
  GET DIAGNOSTICS cancelled_missed = ROW_COUNT;

  FOR rec IN
    SELECT *
    FROM rides.ride_requests
    WHERE status = 'scheduled'
      AND scheduled_pickup_at <= p_now + (p_buffer_minutes || ' minutes')::INTERVAL
      AND scheduled_pickup_at > p_now - INTERVAL '5 minutes'
    ORDER BY scheduled_pickup_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.rides_rider_has_active_ride(rec.rider_user_id) THEN
      UPDATE rides.ride_requests
      SET
        status = 'cancelled',
        cancelled_by = 'system',
        cancel_reason = 'rider_busy_at_dispatch',
        scheduled_cancel_reason = 'system_rider_busy',
        updated_at = p_now
      WHERE id = rec.id;
      skipped_busy := array_append(skipped_busy, rec.id);
      CONTINUE;
    END IF;

    UPDATE rides.ride_requests
    SET
      status = 'matching',
      scheduled_dispatched_at = p_now,
      matching_wave = 0,
      updated_at = p_now
    WHERE id = rec.id;

    activated := array_append(activated, rec.id);
  END LOOP;

  RETURN jsonb_build_object(
    'activated_ids', to_jsonb(activated),
    'skipped_busy_ids', to_jsonb(skipped_busy),
    'cancelled_missed', cancelled_missed,
    'ran_at', p_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rides_dispatch_due_scheduled_rides(TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_dispatch_due_scheduled_rides(TIMESTAMPTZ, INT) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('rides-dispatch-scheduled');
    PERFORM cron.schedule(
      'rides-dispatch-scheduled',
      '*/2 * * * *',
      $cmd$SELECT public.rides_dispatch_due_scheduled_rides();$cmd$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available; schedule rides_dispatch_due_scheduled_rides manually.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'rides-dispatch-scheduled cron schedule skipped: %', SQLERRM;
END;
$$;

NOTIFY pgrst, 'reload schema';
