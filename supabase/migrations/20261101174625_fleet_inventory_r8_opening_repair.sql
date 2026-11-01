-- R8-02: Virtual ledger legs must not mutate physical inv_balance (on_hand >= 0).
-- Then backfill supplier offset legs on opening_balance movements.
-- R8-03: Idempotent opening leg for Phone Holder Mount ledger drift.

CREATE OR REPLACE FUNCTION fleet.inv_ledger_refresh_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = fleet, pg_temp
AS $$
DECLARE
  v_line_value numeric(14, 2);
  v_bin_key uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fleet.inv_location loc
    WHERE loc.id = NEW.location_id
      AND loc.organization_id = NEW.organization_id
      AND loc.kind = 'virtual'
  ) THEN
    RETURN NEW;
  END IF;

  v_line_value := COALESCE(NEW.unit_cost, 0) * NEW.qty_delta;
  v_bin_key := COALESCE(NEW.bin_id, '00000000-0000-0000-0000-000000000000'::uuid);

  UPDATE fleet.inv_balance b
  SET
    on_hand = b.on_hand + NEW.qty_delta,
    value = b.value + v_line_value,
    updated_at = now()
  WHERE b.organization_id = NEW.organization_id
    AND b.item_id = NEW.item_id
    AND b.location_id = NEW.location_id
    AND b.bin_key = v_bin_key;

  IF NOT FOUND THEN
    INSERT INTO fleet.inv_balance (
      organization_id, item_id, location_id, bin_id, on_hand, value, updated_at
    )
    VALUES (
      NEW.organization_id, NEW.item_id, NEW.location_id, NEW.bin_id,
      NEW.qty_delta, v_line_value, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_mount uuid := 'ca661367-4e4e-4d2a-9cfb-774ae21c4120';
  v_supplier uuid;
  v_mov record;
  v_leg record;
  v_drift numeric;
  v_loc uuid;
BEGIN
  v_supplier := fleet._inv_virtual_location_id(v_org, 'V-SUPPLIER', 'Supplier (virtual)');

  FOR v_mov IN
    SELECT id FROM fleet.inv_movement
    WHERE organization_id = v_org AND type = 'opening_balance'
  LOOP
    FOR v_leg IN
      SELECT l.*
      FROM fleet.inv_ledger l
      JOIN fleet.inv_location loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id
      WHERE l.organization_id = v_org
        AND l.movement_id = v_mov.id
        AND l.qty_delta > 0
        AND loc.kind <> 'virtual'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM fleet.inv_ledger o
        WHERE o.organization_id = v_org
          AND o.movement_id = v_mov.id
          AND o.item_id = v_leg.item_id
          AND o.location_id = v_supplier
          AND o.qty_delta = -v_leg.qty_delta
      ) THEN
        PERFORM fleet._inv_append_ledger_leg(
          v_org, v_mov.id, v_leg.item_id, v_supplier, NULL, NULL,
          -v_leg.qty_delta, v_leg.unit_cost
        );
      END IF;
    END LOOP;
  END LOOP;

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
  WHERE b.organization_id = v_org AND b.item_id = v_mount AND b.on_hand > 0
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
