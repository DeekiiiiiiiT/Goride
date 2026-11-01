-- R10-03b: inv_ledger_refresh_balance must UPDATE existing rows before INSERT (generated bin_key).

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
