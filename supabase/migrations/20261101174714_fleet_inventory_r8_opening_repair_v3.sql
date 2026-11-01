-- R8 opening repair v3 (prod 20261101174714): warehouse phone mount leg + unit cost alignment.

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_mount uuid := 'ca661367-4e4e-4d2a-9cfb-774ae21c4120';
  v_loc uuid;
  v_drift numeric;
BEGIN
  UPDATE fleet.inv_item
  SET default_unit_cost = 5400,
      name = 'Phone Holder Mount',
      updated_at = now()
  WHERE organization_id = v_org
    AND id = v_mount;

  SELECT b.location_id,
    b.on_hand - coalesce((
      SELECT sum(l.qty_delta)
      FROM fleet.inv_ledger l
      JOIN fleet.inv_location loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id
      WHERE l.organization_id = b.organization_id
        AND l.item_id = b.item_id
        AND l.location_id = b.location_id
        AND loc.kind <> 'virtual'
        AND coalesce(l.bin_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(b.bin_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ), 0)
  INTO v_loc, v_drift
  FROM fleet.inv_balance b
  JOIN fleet.inv_location loc ON loc.id = b.location_id AND loc.organization_id = b.organization_id
  WHERE b.organization_id = v_org
    AND b.item_id = v_mount
    AND loc.kind = 'warehouse'
    AND b.on_hand > 0
  ORDER BY b.on_hand DESC
  LIMIT 1;

  IF v_drift IS NOT NULL AND v_drift > 0 AND v_loc IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM fleet.inv_movement m
      WHERE m.organization_id = v_org AND m.idempotency_key = 'r8-03-phone-mount-leg'
    ) THEN
      PERFORM fleet.inv_opening_balance(
        v_org,
        jsonb_build_array(jsonb_build_object(
          'item_id', v_mount,
          'location_id', v_loc,
          'qty', v_drift,
          'unit_cost', 5400
        )),
        'r8-03-phone-mount-leg'
      );
    END IF;
  END IF;
END $$;
