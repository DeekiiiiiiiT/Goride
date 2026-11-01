CREATE OR REPLACE FUNCTION fleet.r5_fix_phone_holder_opening(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_item_id uuid;
  v_leg fleet.inv_ledger%ROWTYPE;
  v_cost numeric := 5400;
  v_hash text;
BEGIN
  SELECT i.id INTO v_item_id FROM fleet.inv_item i WHERE i.organization_id = p_org_id AND lower(i.name) LIKE '%phone holder mount%' LIMIT 1;
  IF v_item_id IS NULL THEN RETURN jsonb_build_object('skipped', true, 'reason', 'no phone holder item'); END IF;
  UPDATE fleet.inv_item SET default_unit_cost = v_cost WHERE id = v_item_id;
  SELECT * INTO v_leg FROM fleet.inv_ledger WHERE organization_id = p_org_id AND item_id = v_item_id ORDER BY block_no ASC LIMIT 1;
  IF v_leg.id IS NULL THEN RETURN jsonb_build_object('skipped', true, 'reason', 'no ledger row'); END IF;
  UPDATE fleet.inv_ledger SET unit_cost = v_cost WHERE id = v_leg.id;
  v_leg.unit_cost := v_cost;
  v_hash := encode(digest(v_leg.prev_hash || '|' || fleet.inv_ledger_canonical(v_leg), 'sha256'), 'hex');
  UPDATE fleet.inv_ledger SET row_hash = v_hash WHERE id = v_leg.id;
  INSERT INTO fleet.inv_balance (organization_id, item_id, location_id, bin_id, on_hand, value, reserved)
  SELECT l.organization_id, l.item_id, l.location_id, l.bin_id, sum(l.qty_delta), sum(l.qty_delta * COALESCE(l.unit_cost, 0)), 0
  FROM fleet.inv_ledger l WHERE l.organization_id = p_org_id AND l.item_id = v_item_id
  GROUP BY l.organization_id, l.item_id, l.location_id, l.bin_id
  ON CONFLICT (organization_id, item_id, location_id, bin_key) DO UPDATE SET on_hand = EXCLUDED.on_hand, value = EXCLUDED.value, updated_at = now();
  RETURN jsonb_build_object('item_id', v_item_id, 'unit_cost', v_cost, 'row_hash', v_hash);
END;
$$;
