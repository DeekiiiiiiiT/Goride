-- Persist PIN, wait time, and toll fields via rides_patch_ride_request RPC.

CREATE OR REPLACE FUNCTION public.rides_patch_ride_request(p_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  rec rides.ride_requests;
  bump_version BOOLEAN := FALSE;
BEGIN
  IF p_patch ? 'status' THEN
    bump_version := TRUE;
  END IF;

  UPDATE rides.ride_requests SET
    status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
    matching_wave = CASE WHEN p_patch ? 'matching_wave' THEN (p_patch->>'matching_wave')::INTEGER ELSE matching_wave END,
    updated_at = CASE WHEN p_patch ? 'updated_at' THEN (p_patch->>'updated_at')::TIMESTAMPTZ ELSE NOW() END,
    cancelled_by = CASE WHEN p_patch ? 'cancelled_by' THEN p_patch->>'cancelled_by' ELSE cancelled_by END,
    cancel_reason = CASE WHEN p_patch ? 'cancel_reason' THEN p_patch->>'cancel_reason' ELSE cancel_reason END,
    assigned_driver_user_id = CASE
      WHEN p_patch ? 'assigned_driver_user_id' THEN NULLIF(p_patch->>'assigned_driver_user_id', '')::UUID
      ELSE assigned_driver_user_id
    END,
    fare_final_minor = CASE
      WHEN p_patch ? 'fare_final_minor' THEN (p_patch->>'fare_final_minor')::BIGINT
      ELSE fare_final_minor
    END,
    payment_method = CASE
      WHEN p_patch ? 'payment_method' THEN NULLIF(p_patch->>'payment_method', '')
      ELSE payment_method
    END,
    completed_at = CASE
      WHEN p_patch ? 'completed_at' THEN (p_patch->>'completed_at')::TIMESTAMPTZ
      ELSE completed_at
    END,
    fare_final_breakdown = CASE
      WHEN p_patch ? 'fare_final_breakdown' THEN p_patch->'fare_final_breakdown'
      ELSE fare_final_breakdown
    END,
    platform_fee_minor = CASE
      WHEN p_patch ? 'platform_fee_minor' THEN (p_patch->>'platform_fee_minor')::BIGINT
      ELSE platform_fee_minor
    END,
    tip_minor = CASE
      WHEN p_patch ? 'tip_minor' THEN (p_patch->>'tip_minor')::BIGINT
      ELSE tip_minor
    END,
    driver_net_minor = CASE
      WHEN p_patch ? 'driver_net_minor' THEN (p_patch->>'driver_net_minor')::BIGINT
      ELSE driver_net_minor
    END,
    en_route_at = CASE
      WHEN p_patch ? 'en_route_at' THEN (p_patch->>'en_route_at')::TIMESTAMPTZ
      ELSE en_route_at
    END,
    arrived_pickup_at = CASE
      WHEN p_patch ? 'arrived_pickup_at' THEN (p_patch->>'arrived_pickup_at')::TIMESTAMPTZ
      ELSE arrived_pickup_at
    END,
    trip_started_at = CASE
      WHEN p_patch ? 'trip_started_at' THEN (p_patch->>'trip_started_at')::TIMESTAMPTZ
      ELSE trip_started_at
    END,
    route_polyline_encoded = CASE
      WHEN p_patch ? 'route_polyline_encoded' THEN p_patch->>'route_polyline_encoded'
      ELSE route_polyline_encoded
    END,
    transition_version = CASE
      WHEN bump_version THEN transition_version + 1
      WHEN p_patch ? 'transition_version' THEN (p_patch->>'transition_version')::INTEGER
      ELSE transition_version
    END,
    last_driver_lat = CASE
      WHEN p_patch ? 'last_driver_lat' THEN (p_patch->>'last_driver_lat')::DOUBLE PRECISION
      ELSE last_driver_lat
    END,
    last_driver_lng = CASE
      WHEN p_patch ? 'last_driver_lng' THEN (p_patch->>'last_driver_lng')::DOUBLE PRECISION
      ELSE last_driver_lng
    END,
    last_driver_heading = CASE
      WHEN p_patch ? 'last_driver_heading' THEN (p_patch->>'last_driver_heading')::DOUBLE PRECISION
      ELSE last_driver_heading
    END,
    last_driver_location_at = CASE
      WHEN p_patch ? 'last_driver_location_at' THEN (p_patch->>'last_driver_location_at')::TIMESTAMPTZ
      ELSE last_driver_location_at
    END,
    complete_suggested_at = CASE
      WHEN p_patch ? 'complete_suggested_at' THEN (p_patch->>'complete_suggested_at')::TIMESTAMPTZ
      ELSE complete_suggested_at
    END,
    wait_time_started_at = CASE
      WHEN p_patch ? 'wait_time_started_at' THEN (p_patch->>'wait_time_started_at')::TIMESTAMPTZ
      ELSE wait_time_started_at
    END,
    wait_time_fee_minor = CASE
      WHEN p_patch ? 'wait_time_fee_minor' THEN (p_patch->>'wait_time_fee_minor')::BIGINT
      ELSE wait_time_fee_minor
    END,
    verification_pin = CASE
      WHEN p_patch ? 'verification_pin' THEN NULLIF(p_patch->>'verification_pin', '')
      ELSE verification_pin
    END,
    pin_verified_at = CASE
      WHEN p_patch ? 'pin_verified_at' THEN (p_patch->>'pin_verified_at')::TIMESTAMPTZ
      ELSE pin_verified_at
    END,
    actual_tolls_minor = CASE
      WHEN p_patch ? 'actual_tolls_minor' THEN (p_patch->>'actual_tolls_minor')::BIGINT
      ELSE actual_tolls_minor
    END,
    dropoff_arrived_at = CASE
      WHEN p_patch ? 'dropoff_arrived_at' THEN (p_patch->>'dropoff_arrived_at')::TIMESTAMPTZ
      ELSE dropoff_arrived_at
    END
  WHERE id = p_id
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(rec);
END;
$$;

REVOKE ALL ON FUNCTION public.rides_patch_ride_request(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rides_patch_ride_request(UUID, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
