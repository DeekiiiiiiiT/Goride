CREATE OR REPLACE FUNCTION fleet.r5_fix_phone_holder_opening(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_movement_id uuid;
  v_item_id uuid;
  v_loc uuid;
  v_lines jsonb;
  v_cost numeric := 5400;
  v_leg record;
BEGIN
  SELECT i.id INTO v_item_id FROM fleet.inv_item i WHERE i.organization_id = p_org_id AND lower(i.name) LIKE '%phone holder mount%' LIMIT 1;
  IF v_item_id IS NULL THEN RETURN jsonb_build_object('skipped', true, 'reason', 'no phone holder item'); END IF;
  SELECT l.organization_id, l.item_id, l.location_id, l.bin_id, sum(l.qty_delta) AS on_hand, sum(l.qty_delta * COALESCE(l.unit_cost,0)) AS val
  INTO v_leg FROM fleet.inv_ledger l WHERE l.organization_id = p_org_id AND l.item_id = v_item_id
  GROUP BY l.organization_id, l.item_id, l.location_id, l.bin_id;
  IF v_leg.on_hand IS NOT NULL AND v_leg.on_hand > 0 THEN
    INSERT INTO fleet.inv_balance (organization_id, item_id, location_id, bin_id, on_hand, value, reserved)
    VALUES (v_leg.organization_id, v_leg.item_id, v_leg.location_id, v_leg.bin_id, v_leg.on_hand, v_leg.val, 0)
    ON CONFLICT (organization_id, item_id, location_id, bin_key) DO UPDATE SET on_hand = EXCLUDED.on_hand, value = EXCLUDED.value, updated_at = now();
  END IF;
  SELECT id INTO v_movement_id FROM fleet.inv_movement WHERE organization_id = p_org_id AND ref_no = 'OPN-0001' LIMIT 1;
  IF v_movement_id IS NOT NULL THEN
    PERFORM fleet.inv_reverse(p_org_id, v_movement_id, 'R5-02 correct Phone Holder Mount unit cost', 'migration-r5-reverse-opn-0001-v3');
  END IF;
  SELECT id INTO v_loc FROM fleet.inv_location WHERE organization_id = p_org_id AND kind = 'warehouse' AND is_default = true LIMIT 1;
  UPDATE fleet.inv_item SET default_unit_cost = v_cost WHERE id = v_item_id;
  v_lines := jsonb_build_array(jsonb_build_object('item_id', v_item_id, 'location_id', v_loc, 'qty', 1, 'unit_cost', v_cost));
  PERFORM fleet.inv_opening_balance(p_org_id, v_lines, 'migration-r5-phone-holder-5400-v3');
  RETURN jsonb_build_object('item_id', v_item_id, 'unit_cost', v_cost);
END;
$$;
