CREATE OR REPLACE FUNCTION fleet.ensure_vehicle_inv_locations(p_org_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_row record;
  v_count integer := 0;
  v_plate text;
BEGIN
  FOR v_row IN
    SELECT v.id, v.organization_id, coalesce(v.payload_json->>'licensePlate', v.id) AS plate
    FROM fleet.vehicles v
    WHERE v.organization_id = p_org_id
  LOOP
    v_plate := v_row.plate;
    INSERT INTO fleet.inv_location (
      organization_id, code, name, kind, vehicle_id, is_default, is_active
    )
    SELECT
      p_org_id,
      'VEH-' || upper(v_row.id),
      'Vehicle — ' || v_plate,
      'vehicle',
      v_row.id,
      false,
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM fleet.inv_location l
      WHERE l.organization_id = p_org_id AND l.vehicle_id = v_row.id
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION fleet.trg_vehicles_ensure_inv_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  PERFORM fleet.ensure_vehicle_inv_locations(NEW.organization_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicles_ensure_inv_location ON fleet.vehicles;
CREATE TRIGGER vehicles_ensure_inv_location
  AFTER INSERT ON fleet.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION fleet.trg_vehicles_ensure_inv_location();
