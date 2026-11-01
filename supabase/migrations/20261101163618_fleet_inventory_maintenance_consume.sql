-- Phase 5: maintenance work-order stock consumption

CREATE OR REPLACE FUNCTION fleet.inv_consume_for_work_order(
  p_org_id text,
  p_work_order_line_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
  v_cost numeric;
BEGIN
  v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be positive';
  END IF;

  v_ref := fleet._inv_next_ref(p_org_id, 'WO-');
  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reference_id, reason, idempotency_key
  ) VALUES (
    p_org_id, v_ref, 'work_order_consume', 'work_order_line', p_work_order_line_id,
    'Maintenance parts usage', p_idempotency_key
  )
  RETURNING id INTO v_movement_id;

  v_cost := fleet._inv_consume_fifo_layers(p_org_id, p_item_id, p_location_id, p_qty);
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, NULL, NULL, -p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

REVOKE ALL ON FUNCTION fleet.inv_consume_for_work_order(text, uuid, uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet.inv_consume_for_work_order(text, uuid, uuid, uuid, numeric, text) TO service_role;
