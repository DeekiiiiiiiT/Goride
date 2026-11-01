DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_mount uuid := 'ca661367-4e4e-4d2a-9cfb-774ae21c4120';
  v_vehicle_loc uuid := 'b62780a6-c9b8-4de3-8bff-3ce1e55faea3';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fleet.inv_item WHERE id = v_mount) THEN
    RETURN;
  END IF;

  DELETE FROM fleet.inv_balance b
  WHERE b.organization_id = v_org
    AND b.item_id = v_mount
    AND b.location_id = v_vehicle_loc
    AND NOT EXISTS (
      SELECT 1 FROM fleet.inv_ledger l
      WHERE l.organization_id = v_org
        AND l.item_id = v_mount
        AND l.location_id = v_vehicle_loc
    );

  IF NOT EXISTS (
    SELECT 1 FROM fleet.inv_movement m
    WHERE m.organization_id = v_org AND m.idempotency_key = 'r10-03-phone-mount-5179-leg'
  ) THEN
    PERFORM fleet.inv_opening_balance(
      v_org,
      jsonb_build_array(jsonb_build_object(
        'item_id', v_mount,
        'location_id', v_vehicle_loc,
        'qty', 1,
        'unit_cost', 5400
      )),
      'r10-03-phone-mount-5179-leg'
    );
  END IF;

  PERFORM fleet.inv_verify_chain(v_org);
END $$;;
