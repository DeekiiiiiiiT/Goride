-- Route maintenance parts shelf adjustments through fleet inventory (org_part_stock is a read-only view).

CREATE OR REPLACE FUNCTION public.adjust_org_part_stock(p_org text, p_part uuid, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_item uuid; v_loc uuid; v_bin uuid; v_qty numeric; v_applied numeric; v_mov uuid; v_cost numeric;
BEGIN
  IF p_org IS NULL OR p_part IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN 0;
  END IF;
  SELECT b.item_id, b.location_id, b.bin_id, b.on_hand
  INTO v_item, v_loc, v_bin, v_qty
  FROM fleet.inv_balance b
  JOIN fleet.inv_item i ON i.id = b.item_id AND i.organization_id = b.organization_id
  JOIN fleet.inv_location l ON l.id = b.location_id AND l.organization_id = b.organization_id
  WHERE b.organization_id = p_org AND i.part_master_id = p_part
    AND i.archived_at IS NULL AND l.kind <> 'virtual'
  ORDER BY b.on_hand DESC
  LIMIT 1;
  IF v_item IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_delta < 0 THEN
    v_applied := -LEAST(GREATEST(v_qty, 0), -p_delta);
    IF v_applied = 0 THEN RETURN 0; END IF;
    PERFORM fleet.inv_consume_for_work_order(p_org, NULL, v_item, v_loc, -v_applied, 'parts-usage-' || gen_random_uuid());
  ELSE
    v_applied := p_delta;
    SELECT cl.unit_cost INTO v_cost FROM fleet.inv_cost_layer cl
    WHERE cl.organization_id = p_org AND cl.item_id = v_item
    ORDER BY cl.received_at DESC LIMIT 1;
    INSERT INTO fleet.inv_movement (organization_id, ref_no, type, reference_type, reason)
    VALUES (p_org, fleet._inv_next_ref(p_org, 'WO-'), 'work_order_return', 'work_order_line', 'Maintenance parts usage undone')
    RETURNING id INTO v_mov;
    PERFORM fleet._inv_append_ledger_leg(p_org, v_mov, v_item, v_loc, v_bin, NULL, v_applied, COALESCE(v_cost, 0));
  END IF;
  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_org_part_stock(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_org_part_stock(text, uuid, numeric) TO service_role;
