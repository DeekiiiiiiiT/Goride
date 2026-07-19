-- Triggers audit Wave 2: soft-fail audit logging + ride_live_state updated_at

CREATE OR REPLACE FUNCTION rides.audit_offer_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'audit_offer_accepted: failed to log offer % (%)', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION rides.audit_offer_accepted() IS
  'Best-effort audit on offer accept; never rolls back the acceptance transaction.';

DROP TRIGGER IF EXISTS update_rides_ride_live_state_updated_at ON rides.ride_live_state;
CREATE TRIGGER update_rides_ride_live_state_updated_at
  BEFORE UPDATE ON rides.ride_live_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Intentional: rides.driver_offers has no updated_at — offers are short-lived
-- and superseded rather than edited in place.
COMMENT ON TABLE rides.driver_offers IS
  'Short-lived matching offers. No updated_at by design — rows are superseded, not mutated in place.';
