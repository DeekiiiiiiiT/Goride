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

CREATE OR REPLACE FUNCTION fleet.inv_receive(
  p_org_id text,
  p_receipt jsonb,
  p_lines jsonb,
  p_costs jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, extensions, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_receipt_id uuid;
  v_ref text;
  v_line jsonb;
  v_cost jsonb;
  v_subtotal numeric := 0;
  v_extra numeric := 0;
  v_line_value numeric;
  v_alloc numeric;
  v_landed numeric;
  v_item_id uuid;
  v_location_id uuid;
  v_bin_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_supplier uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_supplier := fleet._inv_virtual_location_id(p_org_id, 'V-SUPPLIER', 'Supplier (virtual)');
  v_ref := COALESCE(NULLIF(p_receipt->>'ref_no', ''), fleet._inv_next_ref(p_org_id, 'RCV-'));
  v_location_id := (p_receipt->>'location_id')::uuid;

  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, memo, idempotency_key
  )
  VALUES (
    p_org_id, v_ref, 'receive', 'receipt',
    COALESCE(p_receipt->>'memo', 'Receive stock'),
    p_idempotency_key
  )
  RETURNING id INTO v_movement_id;

  INSERT INTO fleet.inv_receipt (
    organization_id, ref_no, vendor_id, location_id, received_on, batch_code,
    customs_status, movement_id
  )
  VALUES (
    p_org_id,
    v_ref,
    NULLIF(p_receipt->>'vendor_id', '')::uuid,
    v_location_id,
    COALESCE((p_receipt->>'received_on')::date, CURRENT_DATE),
    p_receipt->>'batch_code',
    p_receipt->>'customs_status',
    v_movement_id
  )
  RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_qty := COALESCE((v_line->>'qty')::numeric, 0);
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price);
  END LOOP;

  FOR v_cost IN SELECT * FROM jsonb_array_elements(COALESCE(p_costs, '[]'::jsonb))
  LOOP
    v_extra := v_extra + COALESCE((v_cost->>'amount')::numeric, 0);
  END LOOP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_item_id := (v_line->>'item_id')::uuid;
    v_bin_id := NULLIF(v_line->>'bin_id', '')::uuid;
    v_qty := COALESCE((v_line->>'qty')::numeric, 0);
    v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
    v_line_value := v_qty * v_unit_price;
    v_alloc := CASE WHEN v_subtotal > 0 THEN v_extra * (v_line_value / v_subtotal) ELSE 0 END;
    v_landed := CASE WHEN v_qty > 0 THEN v_unit_price + (v_alloc / v_qty) ELSE v_unit_price END;

    IF v_qty <> 0 THEN
      PERFORM fleet._inv_append_ledger_leg(
        p_org_id, v_movement_id, v_item_id, v_location_id, v_bin_id, NULL, v_qty, v_landed
      );
      PERFORM fleet._inv_append_ledger_leg(
        p_org_id, v_movement_id, v_item_id, v_supplier, NULL, NULL, -v_qty, v_landed
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'receipt_id', v_receipt_id,
    'ref_no', v_ref
  );
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_adjust(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_bin_id uuid,
  p_qty_delta numeric,
  p_unit_cost numeric,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
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
  v_threshold numeric;
  v_value numeric;
  v_adj uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason required for adjust';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_value := abs(COALESCE(p_unit_cost, 0) * p_qty_delta);
  SELECT COALESCE(s.approval_threshold_jmd, 20000) INTO v_threshold
  FROM fleet.inv_settings s
  WHERE s.organization_id = p_org_id;

  IF v_value >= v_threshold THEN
    RETURN jsonb_build_object(
      'pending_approval', true,
      'message', 'Adjustment exceeds approval threshold; create inv_approval first'
    );
  END IF;

  v_adj := fleet._inv_virtual_location_id(p_org_id, 'V-ADJUSTMENT', 'Adjustment (virtual)');
  v_ref := fleet._inv_next_ref(p_org_id, 'ADJ-');
  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reason, idempotency_key
  )
  VALUES (p_org_id, v_ref, 'adjust', 'count_session', p_reason, p_idempotency_key)
  RETURNING id INTO v_movement_id;

  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, p_bin_id, NULL,
    p_qty_delta, p_unit_cost
  );
  IF p_qty_delta <> 0 THEN
    PERFORM fleet._inv_append_ledger_leg(
      p_org_id, v_movement_id, p_item_id, v_adj, NULL, NULL,
      -p_qty_delta, p_unit_cost
    );
  END IF;

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_write_off(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_asset_id uuid,
  p_qty numeric,
  p_reason text,
  p_memo text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
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
  v_threshold numeric;
  v_cost numeric;
  v_value numeric;
  v_disp uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason required for write_off';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_cost := fleet._inv_consume_fifo_layers(p_org_id, p_item_id, p_location_id, p_qty);
  v_value := abs(v_cost * p_qty);

  SELECT COALESCE(s.approval_threshold_jmd, 20000) INTO v_threshold
  FROM fleet.inv_settings s
  WHERE s.organization_id = p_org_id;

  IF v_value >= v_threshold THEN
    RETURN jsonb_build_object(
      'pending_approval', true,
      'amount_jmd', v_value,
      'message', 'Write-off exceeds approval threshold'
    );
  END IF;

  v_disp := fleet._inv_virtual_location_id(p_org_id, 'V-DISPOSED', 'Disposed (virtual)');
  v_ref := fleet._inv_next_ref(p_org_id, 'WOF-');
  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reason, memo, idempotency_key
  )
  VALUES (p_org_id, v_ref, 'write_off', 'migration', p_reason, p_memo, p_idempotency_key)
  RETURNING id INTO v_movement_id;

  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, NULL, p_asset_id, -p_qty, v_cost
  );
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, v_disp, NULL, p_asset_id, p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

-- Idempotent offset backfill + OPN-0004 valuation repair
DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_supplier uuid;
  v_adj uuid;
  v_disp uuid;
  v_mov record;
  v_leg record;
  v_opn4_id uuid;
  v_vehicle_loc uuid;
  v_mount uuid := 'ca661367-4e4e-4d2a-9cfb-774ae21c4120';
BEGIN
  v_supplier := fleet._inv_virtual_location_id(v_org, 'V-SUPPLIER', 'Supplier (virtual)');
  v_adj := fleet._inv_virtual_location_id(v_org, 'V-ADJUSTMENT', 'Adjustment (virtual)');
  v_disp := fleet._inv_virtual_location_id(v_org, 'V-DISPOSED', 'Disposed (virtual)');

  -- opening_balance + receive: missing supplier offset for non-virtual legs
  FOR v_mov IN
    SELECT id, type FROM fleet.inv_movement
    WHERE organization_id = v_org AND type IN ('opening_balance', 'receive')
  LOOP
    FOR v_leg IN
      SELECT l.*
      FROM fleet.inv_ledger l
      JOIN fleet.inv_location loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id
      WHERE l.organization_id = v_org
        AND l.movement_id = v_mov.id
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

  -- adjust: missing V-ADJUSTMENT offset
  FOR v_mov IN
    SELECT id FROM fleet.inv_movement
    WHERE organization_id = v_org AND type = 'adjust'
  LOOP
    FOR v_leg IN
      SELECT l.*
      FROM fleet.inv_ledger l
      JOIN fleet.inv_location loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id
      WHERE l.organization_id = v_org
        AND l.movement_id = v_mov.id
        AND loc.kind <> 'virtual'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM fleet.inv_ledger o
        WHERE o.organization_id = v_org
          AND o.movement_id = v_mov.id
          AND o.item_id = v_leg.item_id
          AND o.location_id = v_adj
          AND o.qty_delta = -v_leg.qty_delta
      ) THEN
        PERFORM fleet._inv_append_ledger_leg(
          v_org, v_mov.id, v_leg.item_id, v_adj, NULL, NULL,
          -v_leg.qty_delta, v_leg.unit_cost
        );
      END IF;
    END LOOP;
  END LOOP;

  -- write_off: missing V-DISPOSED offset
  FOR v_mov IN
    SELECT id FROM fleet.inv_movement
    WHERE organization_id = v_org AND type = 'write_off'
  LOOP
    FOR v_leg IN
      SELECT l.*
      FROM fleet.inv_ledger l
      JOIN fleet.inv_location loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id
      WHERE l.organization_id = v_org
        AND l.movement_id = v_mov.id
        AND loc.kind <> 'virtual'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM fleet.inv_ledger o
        WHERE o.organization_id = v_org
          AND o.movement_id = v_mov.id
          AND o.item_id = v_leg.item_id
          AND o.location_id = v_disp
          AND o.qty_delta = -v_leg.qty_delta
      ) THEN
        PERFORM fleet._inv_append_ledger_leg(
          v_org, v_mov.id, v_leg.item_id, v_disp, NULL, v_leg.asset_id,
          -v_leg.qty_delta, v_leg.unit_cost
        );
      END IF;
    END LOOP;
  END LOOP;

  -- R12-02: reverse OPN-0004 (wrong J$5,400 mount opening) and repost at J$3,675
  SELECT id INTO v_opn4_id
  FROM fleet.inv_movement
  WHERE organization_id = v_org AND ref_no = 'OPN-0004'
  LIMIT 1;

  IF v_opn4_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fleet.inv_movement
    WHERE organization_id = v_org AND idempotency_key = 'r12-reverse-opn-0004'
  ) THEN
    PERFORM fleet.inv_reverse(
      v_org, v_opn4_id, 'R12-02 reverse OPN-0004 wrong mount cost', 'r12-reverse-opn-0004'
    );
  END IF;

  SELECT id INTO v_vehicle_loc
  FROM fleet.inv_location
  WHERE organization_id = v_org AND kind = 'vehicle' AND vehicle_id = '5179KZ'
  LIMIT 1;

  IF v_vehicle_loc IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM fleet.inv_movement
    WHERE organization_id = v_org AND idempotency_key = 'r12-opn-phone-mount-5179'
  ) THEN
    PERFORM fleet.inv_opening_balance(
      v_org,
      jsonb_build_array(jsonb_build_object(
        'item_id', v_mount,
        'location_id', v_vehicle_loc,
        'qty', 1,
        'unit_cost', 3675
      )),
      'r12-opn-phone-mount-5179'
    );
  END IF;

  PERFORM fleet.inv_verify_chain(v_org);
END $$;
