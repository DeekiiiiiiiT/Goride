-- Persist verification_pin (and related fields) when booking via rides_create_ride_request RPC.

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
    verification_pin
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
    NULLIF(p_row->>'verification_pin', '')
  )
  RETURNING * INTO rec;

  RETURN to_jsonb(rec);
END;
$$;

REVOKE ALL ON FUNCTION public.rides_create_ride_request(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_create_ride_request(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
