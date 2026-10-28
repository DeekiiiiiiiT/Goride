-- Atomic Accept RPC for rider-driver matching
-- Eliminates soft race conditions when multiple drivers try to accept the same offer.
-- Single transaction ensures only one driver wins.

--------------------------------------------------------------------------------
-- 1. Atomic Accept Function
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.matching_accept_driver_offer(
  p_offer_id UUID,
  p_driver_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rides, public
AS $$
DECLARE
  v_offer rides.driver_offers%ROWTYPE;
  v_ride rides.ride_requests%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_result JSONB;
BEGIN
  -- 1. Lock and fetch offer
  SELECT * INTO v_offer
  FROM rides.driver_offers
  WHERE id = p_offer_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_found');
  END IF;
  
  -- 2. Verify driver owns the offer
  IF v_offer.driver_user_id != p_driver_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_found');
  END IF;
  
  -- 3. Check offer is pending
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false, 
      'error', 'offer_not_pending',
      'current_status', v_offer.status
    );
  END IF;
  
  -- 4. Check offer hasn't expired
  IF v_offer.expires_at <= v_now THEN
    -- Mark as expired
    UPDATE rides.driver_offers
    SET status = 'expired'
    WHERE id = p_offer_id;
    
    RETURN jsonb_build_object('ok', false, 'error', 'offer_expired');
  END IF;
  
  -- 5. Lock and fetch ride
  SELECT * INTO v_ride
  FROM rides.ride_requests
  WHERE id = v_offer.ride_request_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ride_not_found');
  END IF;
  
  -- 6. Verify ride is still matching
  IF v_ride.status != 'matching' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'ride_not_matching',
      'current_status', v_ride.status
    );
  END IF;
  
  -- 7. Accept the offer
  UPDATE rides.driver_offers
  SET status = 'accepted'
  WHERE id = p_offer_id;
  
  -- 8. Assign driver to ride
  UPDATE rides.ride_requests
  SET 
    status = 'driver_assigned',
    assigned_driver_user_id = p_driver_user_id,
    updated_at = v_now
  WHERE id = v_offer.ride_request_id
    AND status = 'matching';
  
  IF NOT FOUND THEN
    -- Race condition: another driver won
    -- Rollback the offer accept
    UPDATE rides.driver_offers
    SET status = 'superseded'
    WHERE id = p_offer_id;
    
    RETURN jsonb_build_object('ok', false, 'error', 'assign_failed');
  END IF;
  
  -- 9. Supersede other pending offers for this ride
  UPDATE rides.driver_offers
  SET status = 'superseded'
  WHERE ride_request_id = v_offer.ride_request_id
    AND status = 'pending'
    AND id != p_offer_id;
  
  -- 10. Supersede all pending offers for this driver (other rides)
  UPDATE rides.driver_offers
  SET status = 'superseded'
  WHERE driver_user_id = p_driver_user_id
    AND status = 'pending'
    AND id != p_offer_id;
  
  -- 11. Fetch the updated ride
  SELECT * INTO v_ride
  FROM rides.ride_requests
  WHERE id = v_offer.ride_request_id;
  
  -- 12. Return success with ride data
  v_result := jsonb_build_object(
    'ok', true,
    'offer_id', p_offer_id,
    'ride_request_id', v_offer.ride_request_id,
    'ride', to_jsonb(v_ride)
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'internal_error',
      'message', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.matching_accept_driver_offer IS 
  'Atomically accept a driver offer. Prevents race conditions by using row-level locks.';

--------------------------------------------------------------------------------
-- 2. Grant permissions
--------------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.matching_accept_driver_offer TO service_role;

--------------------------------------------------------------------------------
-- 3. Audit event trigger (optional — logs accepts to audit_events)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rides.audit_offer_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO rides.audit_events (
      ride_request_id,
      actor_user_id,
      event_type,
      payload
    ) VALUES (
      NEW.ride_request_id,
      NEW.driver_user_id,
      'offer_accepted_atomic',
      jsonb_build_object(
        'offer_id', NEW.id,
        'wave', NEW.wave,
        'distance_km', NEW.distance_km
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_offer_accepted_trigger ON rides.driver_offers;
CREATE TRIGGER audit_offer_accepted_trigger
  AFTER UPDATE ON rides.driver_offers
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status = 'pending')
  EXECUTE FUNCTION rides.audit_offer_accepted();

NOTIFY pgrst, 'reload schema';
