-- P14: relink orphan vehicle inv_location rows on re-insert (same code) instead of duplicate insert.

CREATE OR REPLACE FUNCTION fleet.ensure_vehicle_inv_location(p_org_id text, p_vehicle_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_plate text;
  v_code text;
BEGIN
  SELECT coalesce(v.payload_json->>'licensePlate', v.license_plate, v.id)
  INTO v_plate
  FROM fleet.vehicles v
  WHERE v.id = p_vehicle_id AND v.organization_id = p_org_id;

  IF v_plate IS NULL THEN
    RETURN;
  END IF;

  v_code := 'VEH-' || upper(p_vehicle_id);

  UPDATE fleet.inv_location l
  SET
    vehicle_id = p_vehicle_id,
    is_active = true,
    name = 'Vehicle — ' || v_plate
  WHERE l.organization_id = p_org_id
    AND lower(l.code) = lower(v_code);

  IF NOT FOUND THEN
    INSERT INTO fleet.inv_location (
      organization_id, code, name, kind, vehicle_id, is_default, is_active
    )
    SELECT
      p_org_id,
      v_code,
      'Vehicle — ' || v_plate,
      'vehicle',
      p_vehicle_id,
      false,
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM fleet.inv_location l2
      WHERE l2.organization_id = p_org_id AND l2.vehicle_id = p_vehicle_id
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fleet.ensure_vehicle_inv_locations(p_org_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT v.id
    FROM fleet.vehicles v
    WHERE v.organization_id = p_org_id
  LOOP
    PERFORM fleet.ensure_vehicle_inv_location(p_org_id, v_row.id);
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
  PERFORM fleet.ensure_vehicle_inv_location(NEW.organization_id, NEW.id);
  RETURN NEW;
END;
$$;
