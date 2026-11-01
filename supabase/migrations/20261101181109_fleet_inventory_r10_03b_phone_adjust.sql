-- R10-03b: Adjust off legacy phone holder at 5179KZ and archive item.

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
      SELECT 1 FROM fleet.inv_movement m
      WHERE m.organization_id = v_org AND m.idempotency_key = 'r10-03-adj-phone-holder-5179'
    ) THEN
      PERFORM fleet.inv_adjust(
        v_org, v_old_phone, v_vehicle_loc, NULL, -1, 0,
        'R10-03 retire legacy Phone holder at vehicle',
        'r10-03-adj-phone-holder-5179'
      );
    END IF;

    UPDATE fleet.inv_item
    SET archived_at = coalesce(archived_at, now()), updated_at = now()
    WHERE id = v_old_phone;
  END IF;
END $$;
