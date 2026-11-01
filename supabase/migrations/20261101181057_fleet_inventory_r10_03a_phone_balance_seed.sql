-- R10-03a: Seed inv_balance row when ledger shows phone holder on vehicle without balance row.

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_old_phone uuid;
  v_vehicle_loc uuid;
  v_phone_veh_qty numeric;
BEGIN
  SELECT id INTO v_old_phone
  FROM fleet.inv_item
  WHERE organization_id = v_org AND sku = 'EQ-PHONE-HOLDER'
  LIMIT 1;

  SELECT id INTO v_vehicle_loc
  FROM fleet.inv_location
  WHERE organization_id = v_org AND kind = 'vehicle' AND vehicle_id = '5179KZ'
  LIMIT 1;

  IF v_old_phone IS NOT NULL AND v_vehicle_loc IS NOT NULL THEN
    SELECT coalesce(sum(l.qty_delta), 0) INTO v_phone_veh_qty
    FROM fleet.inv_ledger l
    WHERE l.organization_id = v_org
      AND l.item_id = v_old_phone
      AND l.location_id = v_vehicle_loc;

    IF v_phone_veh_qty > 0 AND NOT EXISTS (
      SELECT 1 FROM fleet.inv_balance b
      WHERE b.organization_id = v_org
        AND b.item_id = v_old_phone
        AND b.location_id = v_vehicle_loc
    ) THEN
      INSERT INTO fleet.inv_balance (
        organization_id, item_id, location_id, bin_id, on_hand, value, updated_at
      ) VALUES (v_org, v_old_phone, v_vehicle_loc, NULL, 1, 0, now());
    END IF;
  END IF;
END $$;
