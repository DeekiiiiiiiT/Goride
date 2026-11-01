-- Fleet inventory engine RPCs, read views, nightly integrity job.

-- ---------------------------------------------------------------------------
-- Internal helpers (not granted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet._inv_next_ref(p_org_id text, p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) + 1 INTO v_n
  FROM fleet.inv_movement m
  WHERE m.organization_id = p_org_id
    AND m.ref_no LIKE p_prefix || '%';
  RETURN p_prefix || lpad(v_n::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION fleet._inv_movement_by_key(
  p_org_id text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
  SELECT m.id
  FROM fleet.inv_movement m
  WHERE m.organization_id = p_org_id
    AND m.idempotency_key = p_idempotency_key
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fleet._inv_append_ledger_leg(
  p_org_id text,
  p_movement_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_bin_id uuid,
  p_asset_id uuid,
  p_qty_delta numeric,
  p_unit_cost numeric,
  p_currency text DEFAULT 'JMD'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO fleet.inv_ledger (
    organization_id, movement_id, item_id, location_id, bin_id, asset_id,
    qty_delta, unit_cost, currency, block_no, prev_hash, row_hash
  )
  VALUES (
    p_org_id, p_movement_id, p_item_id, p_location_id, p_bin_id, p_asset_id,
    p_qty_delta, p_unit_cost, COALESCE(p_currency, 'JMD'), 0, '', ''
  )
  RETURNING id INTO v_id;

  IF p_qty_delta > 0 AND p_unit_cost IS NOT NULL THEN
    INSERT INTO fleet.inv_cost_layer (
      organization_id, item_id, location_id, ledger_id, qty_remaining, unit_cost
    )
    VALUES (
      p_org_id, p_item_id, p_location_id, v_id, p_qty_delta, p_unit_cost
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION fleet._inv_consume_fifo_layers(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_need numeric := p_qty;
  v_layer record;
  v_take numeric;
  v_cost numeric := 0;
BEGIN
  IF v_need <= 0 THEN
    RETURN 0;
  END IF;

  FOR v_layer IN
    SELECT id, qty_remaining, unit_cost
    FROM fleet.inv_cost_layer
    WHERE organization_id = p_org_id
      AND item_id = p_item_id
      AND location_id = p_location_id
      AND qty_remaining > 0
    ORDER BY received_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_layer.qty_remaining, v_need);
    UPDATE fleet.inv_cost_layer
    SET qty_remaining = qty_remaining - v_take
    WHERE id = v_layer.id;
    v_cost := v_cost + (v_take * v_layer.unit_cost);
    v_need := v_need - v_take;
  END LOOP;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'insufficient FIFO layers for item % at location %', p_item_id, p_location_id;
  END IF;

  RETURN v_cost / NULLIF(p_qty, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- inv_verify_chain(org) — org-scoped only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_verify_chain(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_row record;
  v_prev_hash text := repeat('0', 64);
  v_expected text;
  v_canonical text;
  v_count bigint := 0;
  v_ok boolean := true;
  v_broken bigint;
  v_head_block bigint;
  v_head_hash text;
BEGIN
  IF p_org_id IS NULL OR btrim(p_org_id) = '' THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  FOR v_row IN
    SELECT *
    FROM fleet.inv_ledger
    WHERE organization_id = p_org_id
    ORDER BY block_no ASC
  LOOP
    v_count := v_count + 1;
    IF v_row.prev_hash IS DISTINCT FROM v_prev_hash THEN
      v_ok := false;
      v_broken := COALESCE(v_broken, v_row.block_no);
    END IF;

    v_canonical := fleet.inv_ledger_canonical(v_row);
    v_expected := encode(digest(v_row.prev_hash || '|' || v_canonical, 'sha256'), 'hex');
    IF v_row.row_hash IS DISTINCT FROM v_expected THEN
      v_ok := false;
      v_broken := COALESCE(v_broken, v_row.block_no);
    END IF;

    v_prev_hash := v_row.row_hash;
    v_head_block := v_row.block_no;
    v_head_hash := v_row.row_hash;
  END LOOP;

  INSERT INTO fleet.inv_chain_check (
    organization_id, entries, head_block, head_hash, ok, broken_at_block, checked_by
  )
  VALUES (
    p_org_id, v_count, v_head_block, v_head_hash, v_ok, v_broken, 'system'
  );

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'ok', v_ok,
    'entries', v_count,
    'head_block', v_head_block,
    'head_hash', v_head_hash,
    'broken_at_block', v_broken
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- inv_opening_balance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_opening_balance(
  p_org_id text,
  p_lines jsonb,
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
  v_line jsonb;
  v_item_id uuid;
  v_location_id uuid;
  v_bin_id uuid;
  v_qty numeric;
  v_cost numeric;
BEGIN
  v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
  END IF;

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
  END LOOP;

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

-- ---------------------------------------------------------------------------
-- inv_receive (simplified: receipt + lines + landed costs)
-- ---------------------------------------------------------------------------
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
SET search_path = fleet, public
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
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

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

    PERFORM fleet._inv_append_ledger_leg(
      p_org_id, v_movement_id, v_item_id, v_location_id, v_bin_id, NULL, v_qty, v_landed
    );
  END LOOP;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'receipt_id', v_receipt_id,
    'ref_no', v_ref
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- inv_issue_to_vehicles (dry_run preview)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_issue_to_vehicles(
  p_org_id text,
  p_source_location_id uuid,
  p_lines jsonb,
  p_vehicle_ids text[],
  p_issue_available_only boolean DEFAULT false,
  p_dry_run boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL
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
  v_batch text;
  v_line jsonb;
  v_vehicle text;
  v_item_id uuid;
  v_need numeric;
  v_on_hand numeric;
  v_preview jsonb := '[]'::jsonb;
  v_shortfalls jsonb := '[]'::jsonb;
  v_avg_cost numeric;
BEGIN
  IF NOT p_dry_run AND p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  FOR v_vehicle IN SELECT unnest(COALESCE(p_vehicle_ids, ARRAY[]::text[]))
  LOOP
    FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
    LOOP
      v_item_id := (v_line->>'item_id')::uuid;
      v_need := COALESCE((v_line->>'qty')::numeric, 0);

      SELECT COALESCE(sum(b.on_hand - b.reserved), 0) INTO v_on_hand
      FROM fleet.inv_balance b
      WHERE b.organization_id = p_org_id
        AND b.item_id = v_item_id
        AND b.location_id = p_source_location_id;

      v_preview := v_preview || jsonb_build_array(jsonb_build_object(
        'vehicle_id', v_vehicle,
        'item_id', v_item_id,
        'requested', v_need,
        'available', v_on_hand,
        'will_issue', CASE
          WHEN p_issue_available_only THEN LEAST(v_need, v_on_hand)
          WHEN v_on_hand >= v_need THEN v_need
          ELSE NULL
        END,
        'short', GREATEST(v_need - v_on_hand, 0)
      ));

      IF v_on_hand < v_need THEN
        v_shortfalls := v_shortfalls || jsonb_build_array(jsonb_build_object(
          'item_id', v_item_id, 'short_by', v_need - v_on_hand
        ));
      END IF;
    END LOOP;
  END LOOP;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'preview', v_preview,
      'shortfalls', v_shortfalls
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_preview) e
    WHERE (e->>'will_issue') IS NULL AND NOT p_issue_available_only
  ) THEN
    RAISE EXCEPTION 'insufficient stock for full issue; use issue_available_only or dry_run first';
  END IF;

  v_ref := fleet._inv_next_ref(p_org_id, 'ISS-');
  v_batch := 'BATCH-ALLOC-' || lpad((random() * 9999)::int::text, 4, '0');

  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, batch_no, type, reference_type, idempotency_key
  )
  VALUES (
    p_org_id, v_ref, v_batch, 'issue', 'kit_issue', p_idempotency_key
  )
  RETURNING id INTO v_movement_id;

  FOR v_vehicle IN SELECT unnest(COALESCE(p_vehicle_ids, ARRAY[]::text[]))
  LOOP
    FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
    LOOP
      v_item_id := (v_line->>'item_id')::uuid;
      v_need := COALESCE((v_line->>'qty')::numeric, 0);

      SELECT COALESCE(sum(b.on_hand - b.reserved), 0) INTO v_on_hand
      FROM fleet.inv_balance b
      WHERE b.organization_id = p_org_id
        AND b.item_id = v_item_id
        AND b.location_id = p_source_location_id;

      IF p_issue_available_only THEN
        v_need := LEAST(v_need, v_on_hand);
      END IF;

      IF v_need <= 0 THEN
        CONTINUE;
      END IF;

      v_avg_cost := fleet._inv_consume_fifo_layers(p_org_id, v_item_id, p_source_location_id, v_need);

      PERFORM fleet._inv_append_ledger_leg(
        p_org_id, v_movement_id, v_item_id, p_source_location_id, NULL, NULL, -v_need, v_avg_cost
      );

      PERFORM fleet._inv_append_ledger_leg(
        p_org_id, v_movement_id, v_item_id,
        (SELECT id FROM fleet.inv_location
         WHERE organization_id = p_org_id AND vehicle_id = v_vehicle
         LIMIT 1),
        NULL, NULL, v_need, v_avg_cost
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'movement_id', v_movement_id,
    'ref_no', v_ref,
    'batch_no', v_batch,
    'preview', v_preview
  );
END;
$$;;
