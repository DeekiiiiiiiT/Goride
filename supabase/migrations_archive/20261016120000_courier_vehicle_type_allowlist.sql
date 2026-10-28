-- Enforce courier.signup.vehicle_types on direct profile/vehicle writes (RLS bypass backstop).

CREATE OR REPLACE FUNCTION delivery.enforce_courier_vehicle_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = delivery, rush_config, public
AS $$
DECLARE
  allowed jsonb;
  vt text;
BEGIN
  vt := NEW.vehicle_type;
  IF vt IS NULL OR btrim(vt) = '' THEN
    RETURN NEW;
  END IF;

  SELECT sv.value INTO allowed
  FROM rush_config.setting_values sv
  WHERE sv.key = 'courier.signup.vehicle_types'
    AND sv.scope = 'platform'
    AND sv.scope_id = '00000000-0000-0000-0000-000000000000';

  IF allowed IS NULL THEN
    allowed := '["bicycle","motorcycle","car"]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(allowed) AS elem(value)
    WHERE elem.value = vt
  ) THEN
    RAISE EXCEPTION 'vehicle_type % is not in courier.signup.vehicle_types', vt
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courier_profiles_vehicle_type ON delivery.courier_profiles;
CREATE TRIGGER trg_courier_profiles_vehicle_type
  BEFORE INSERT OR UPDATE OF vehicle_type ON delivery.courier_profiles
  FOR EACH ROW
  EXECUTE FUNCTION delivery.enforce_courier_vehicle_type();

DROP TRIGGER IF EXISTS trg_courier_vehicles_vehicle_type ON delivery.courier_vehicles;
CREATE TRIGGER trg_courier_vehicles_vehicle_type
  BEFORE INSERT OR UPDATE OF vehicle_type ON delivery.courier_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION delivery.enforce_courier_vehicle_type();

COMMENT ON FUNCTION delivery.enforce_courier_vehicle_type() IS
  'Rejects vehicle_type not listed in rush_config courier.signup.vehicle_types (default bicycle/motorcycle/car)';

-- Align wait-pay comment with configurable rate setting
COMMENT ON COLUMN delivery.courier_wait_events.wait_pay_jmd IS
  'billable_minutes * courier.delivery.wait_pay_jmd_per_min at log time';
