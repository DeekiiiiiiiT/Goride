-- P14: add car → delete → add again → one location, linked. Made-up data only; rolls back.
BEGIN;

DO $$
DECLARE
  v_org text := 'ZZ-TEST-P14-ORG';
  v_vehicle text := 'ZZ-TEST-VEH-P14';
  v_loc_count int;
  v_linked text;
BEGIN
  INSERT INTO fleet.inv_settings (organization_id)
  VALUES (v_org)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id)
  VALUES (v_vehicle, v_org, 'TEST-P14', 'legacy-' || v_vehicle)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id;

  SELECT count(*)::int, max(l.vehicle_id)
  INTO v_loc_count, v_linked
  FROM fleet.inv_location l
  WHERE l.organization_id = v_org AND lower(l.code) = lower('VEH-' || upper(v_vehicle));

  IF v_loc_count <> 1 OR v_linked IS DISTINCT FROM v_vehicle THEN
    RAISE EXCEPTION 'FAIL P14 step1: expected 1 linked location, got % rows linked %', v_loc_count, v_linked;
  END IF;

  DELETE FROM fleet.vehicles WHERE id = v_vehicle;

  SELECT count(*)::int, max(l.vehicle_id)
  INTO v_loc_count, v_linked
  FROM fleet.inv_location l
  WHERE l.organization_id = v_org AND lower(l.code) = lower('VEH-' || upper(v_vehicle));

  IF v_loc_count <> 1 OR v_linked IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL P14 orphan: expected 1 orphan location, got % rows vehicle_id %', v_loc_count, v_linked;
  END IF;

  INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id)
  VALUES (v_vehicle, v_org, 'TEST-P14', 'legacy-' || v_vehicle);

  SELECT count(*)::int, max(l.vehicle_id)
  INTO v_loc_count, v_linked
  FROM fleet.inv_location l
  WHERE l.organization_id = v_org AND lower(l.code) = lower('VEH-' || upper(v_vehicle));

  IF v_loc_count <> 1 OR v_linked IS DISTINCT FROM v_vehicle THEN
    RAISE EXCEPTION 'FAIL P14 step3: expected 1 relinked location, got % rows linked %', v_loc_count, v_linked;
  END IF;
END $$;

ROLLBACK;
