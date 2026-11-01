-- R12-01 + R12-02: Double-entry for receive/opening/adjust/write-off; repair ADJ-0001/OPN-0004; repost mount at J$3,675.

CREATE OR REPLACE FUNCTION fleet.inv_opening_balance(
  p_org_id text,
  p_lines jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
  v_line jsonb;
  v_item_id uuid;
  v_location_id uuid;
  v_bin_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_supplier uuid;
BEGIN
  v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
  END IF;

  v_supplier := fleet._inv_virtual_location_id(p_org_id, 'V-SUPPLIER', 'Supplier (virtual)');
  v_ref := fleet._inv_next_ref(p_org_id, 'OPN-');

  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reason, idempotency_key
  )
  VALUES (
    p_org_id, v_ref, 'opening_balance', 'migration', 'Opening balance', p_idempotency_key
  )
  RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_item_id := (v_line->>'item_id')::uuid;
    v_location_id := (v_line->>'location_id')::uuid;
    v_bin_id := NULLIF(v_line->>'bin_id', '')::uuid;
    v_qty := COALESCE((v_line->>'qty')::numeric, 0);
    v_cost := (v_line->>'unit_cost')::numeric;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'opening balance qty must be positive';
    END IF;
    PERFORM fleet._inv_append_ledger_leg(
      p_org_id, v_movement_id, v_item_id, v_location_id, v_bin_id, NULL, v_qty, v_cost
    );
    PERFORM fleet._inv_append_ledger_leg(
      p_org_id, v_movement_id, v_item_id, v_supplier, NULL, NULL, -v_qty, v_cost
    );
  END LOOP;

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;
