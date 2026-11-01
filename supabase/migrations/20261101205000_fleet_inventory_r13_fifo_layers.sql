-- R13-01: FIFO cost layers follow ledger legs (audit Rev 13).
-- Invariants:
--   1) No layers at virtual locations.
--   2) sum(layer qty_remaining) = on_hand and sum(qty * cost) = balance.value per item/location.
--   3) Negative legs at real locations consume FIFO; reverse movements consume by original ledger_id.

-- ---------------------------------------------------------------------------
-- Peek FIFO total cost (approval thresholds without mutating layers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet._inv_peek_fifo_layers_cost(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_need numeric := p_qty;
  v_layer record;
  v_take numeric;
  v_total numeric := 0;
BEGIN
  IF v_need <= 0 THEN
    RETURN 0;
  END IF;
  FOR v_layer IN
    SELECT qty_remaining, unit_cost
    FROM fleet.inv_cost_layer
    WHERE organization_id = p_org_id
      AND item_id = p_item_id
      AND location_id = p_location_id
      AND qty_remaining > 0
    ORDER BY received_at ASC, id ASC
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_layer.qty_remaining, v_need);
    v_total := v_total + (v_take * v_layer.unit_cost);
    v_need := v_need - v_take;
  END LOOP;
  IF v_need > 0 THEN
    RAISE EXCEPTION 'insufficient FIFO layers for item % at location %', p_item_id, p_location_id;
  END IF;
  RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- Consume a layer created by a specific ledger row (reverse of positive receipt)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet._inv_consume_layer_by_ledger_id(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_source_ledger_id uuid,
  p_qty numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_layer record;
  v_take numeric;
  v_need numeric := p_qty;
  v_total numeric := 0;
BEGIN
  IF v_need <= 0 THEN
    RETURN 0;
  END IF;
  SELECT id, qty_remaining, unit_cost INTO v_layer
  FROM fleet.inv_cost_layer
  WHERE organization_id = p_org_id
    AND item_id = p_item_id
    AND location_id = p_location_id
    AND ledger_id = p_source_ledger_id
    AND qty_remaining > 0
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no cost layer for ledger %', p_source_ledger_id;
  END IF;
  v_take := LEAST(v_layer.qty_remaining, v_need);
  UPDATE fleet.inv_cost_layer
  SET qty_remaining = qty_remaining - v_take
  WHERE id = v_layer.id;
  v_total := v_take * v_layer.unit_cost;
  v_need := v_need - v_take;
  IF v_need > 0 THEN
    RAISE EXCEPTION 'layer for ledger % has insufficient qty', p_source_ledger_id;
  END IF;
  RETURN v_total / NULLIF(p_qty, 0);
END;
$$;

DROP FUNCTION IF EXISTS fleet._inv_append_ledger_leg(
  text, uuid, uuid, uuid, uuid, uuid, numeric, numeric, text
);

CREATE OR REPLACE FUNCTION fleet._inv_append_ledger_leg(
  p_org_id text,
  p_movement_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_bin_id uuid,
  p_asset_id uuid,
  p_qty_delta numeric,
  p_unit_cost numeric,
  p_currency text DEFAULT 'JMD',
  p_reverses_ledger_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_id uuid;
  v_loc_kind text;
  v_mov_type text;
  v_unit numeric := p_unit_cost;
BEGIN
  SELECT loc.kind INTO v_loc_kind
  FROM fleet.inv_location loc
  WHERE loc.id = p_location_id AND loc.organization_id = p_org_id;

  SELECT m.type INTO v_mov_type
  FROM fleet.inv_movement m
  WHERE m.id = p_movement_id AND m.organization_id = p_org_id;

  IF p_qty_delta < 0 AND COALESCE(v_loc_kind, 'warehouse') <> 'virtual' THEN
    IF v_mov_type = 'reverse' AND p_reverses_ledger_id IS NOT NULL THEN
      v_unit := fleet._inv_consume_layer_by_ledger_id(
        p_org_id, p_item_id, p_location_id, p_reverses_ledger_id, abs(p_qty_delta)
      );
    ELSE
      v_unit := fleet._inv_consume_fifo_layers(
        p_org_id, p_item_id, p_location_id, abs(p_qty_delta)
      );
    END IF;
  END IF;

  INSERT INTO fleet.inv_ledger (
    organization_id, movement_id, item_id, location_id, bin_id, asset_id,
    qty_delta, unit_cost, currency, block_no, prev_hash, row_hash
  )
  VALUES (
    p_org_id, p_movement_id, p_item_id, p_location_id, p_bin_id, p_asset_id,
    p_qty_delta, v_unit, COALESCE(p_currency, 'JMD'), 0, '', ''
  )
  RETURNING id INTO v_id;

  IF p_qty_delta > 0
     AND v_unit IS NOT NULL
     AND COALESCE(v_loc_kind, 'warehouse') <> 'virtual'
  THEN
    INSERT INTO fleet.inv_cost_layer (
      organization_id, item_id, location_id, ledger_id, qty_remaining, unit_cost, received_at
    )
    VALUES (
      p_org_id, p_item_id, p_location_id, v_id, p_qty_delta, v_unit, now()
    );
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fleet._inv_peek_fifo_layers_cost(text, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION fleet._inv_consume_layer_by_ledger_id(text, uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION fleet._inv_append_ledger_leg(
  text, uuid, uuid, uuid, uuid, uuid, numeric, numeric, text, uuid
) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Rebuild cost layers from existing ledger (no ledger mutation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet._inv_rebuild_cost_layers_from_ledger(p_org_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_leg record;
  v_orig_ledger_id uuid;
  v_unit numeric;
  v_loc_kind text;
BEGIN
  DELETE FROM fleet.inv_cost_layer WHERE organization_id = p_org_id;

  FOR v_leg IN
    SELECT
      l.*,
      m.type AS mov_type,
      m.reverses_movement_id,
      loc.kind AS loc_kind
    FROM fleet.inv_ledger l
    JOIN fleet.inv_movement m
      ON m.id = l.movement_id AND m.organization_id = l.organization_id
    JOIN fleet.inv_location loc
      ON loc.id = l.location_id AND loc.organization_id = l.organization_id
    WHERE l.organization_id = p_org_id
    ORDER BY l.block_no ASC, l.id ASC
  LOOP
    v_orig_ledger_id := NULL;
    IF v_leg.mov_type = 'reverse' AND v_leg.reverses_movement_id IS NOT NULL THEN
      SELECT orig.id INTO v_orig_ledger_id
      FROM fleet.inv_ledger orig
      WHERE orig.organization_id = v_leg.organization_id
        AND orig.movement_id = v_leg.reverses_movement_id
        AND orig.item_id = v_leg.item_id
        AND orig.location_id = v_leg.location_id
        AND COALESCE(orig.bin_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_leg.bin_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND COALESCE(orig.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_leg.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND orig.qty_delta = -v_leg.qty_delta
      LIMIT 1;
    END IF;

    v_loc_kind := v_leg.loc_kind;
    v_unit := v_leg.unit_cost;

    IF v_leg.qty_delta < 0 AND COALESCE(v_loc_kind, 'warehouse') <> 'virtual' THEN
      IF v_leg.mov_type = 'reverse' AND v_orig_ledger_id IS NOT NULL THEN
        PERFORM fleet._inv_consume_layer_by_ledger_id(
          p_org_id, v_leg.item_id, v_leg.location_id, v_orig_ledger_id, abs(v_leg.qty_delta)
        );
      ELSE
        PERFORM fleet._inv_consume_fifo_layers(
          p_org_id, v_leg.item_id, v_leg.location_id, abs(v_leg.qty_delta)
        );
      END IF;
    ELSIF v_leg.qty_delta > 0
      AND v_unit IS NOT NULL
      AND COALESCE(v_loc_kind, 'warehouse') <> 'virtual'
    THEN
      INSERT INTO fleet.inv_cost_layer (
        organization_id, item_id, location_id, ledger_id, qty_remaining, unit_cost, received_at
      )
      VALUES (
        p_org_id, v_leg.item_id, v_leg.location_id, v_leg.id, v_leg.qty_delta, v_unit, v_leg.created_at
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fleet._inv_rebuild_cost_layers_from_ledger(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet._inv_rebuild_cost_layers_from_ledger(text) TO service_role;

-- When ledger unit_cost is wrong but inv_balance.value is correct (legacy patches), align layers.
CREATE OR REPLACE FUNCTION fleet._inv_sync_cost_layers_to_balance(p_org_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  UPDATE fleet.inv_cost_layer cl
  SET unit_cost = round(b.value / NULLIF(b.on_hand, 0), 2)
  FROM fleet.inv_balance b
  JOIN fleet.inv_location loc
    ON loc.id = b.location_id AND loc.organization_id = b.organization_id
  WHERE cl.organization_id = p_org_id
    AND b.organization_id = p_org_id
    AND cl.item_id = b.item_id
    AND cl.location_id = b.location_id
    AND loc.kind <> 'virtual'
    AND b.on_hand > 0
    AND cl.qty_remaining > 0
    AND cl.qty_remaining = b.on_hand
    AND (cl.qty_remaining * cl.unit_cost) IS DISTINCT FROM b.value;
END;
$$;

REVOKE ALL ON FUNCTION fleet._inv_sync_cost_layers_to_balance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet._inv_sync_cost_layers_to_balance(text) TO service_role;

-- ---------------------------------------------------------------------------
-- RPCs: remove duplicate FIFO consume before append
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fleet.inv_transfer(
  p_org_id text,
  p_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_bin_from uuid,
  p_bin_to uuid,
  p_qty numeric,
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
  v_cost numeric;
  v_leg uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  v_ref := fleet._inv_next_ref(p_org_id, 'TRF-');
  INSERT INTO fleet.inv_movement (organization_id, ref_no, type, reference_type, idempotency_key)
  VALUES (p_org_id, v_ref, 'transfer', 'requisition', p_idempotency_key)
  RETURNING id INTO v_movement_id;

  v_leg := fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_from_location_id, p_bin_from, NULL, -p_qty, NULL
  );
  SELECT unit_cost INTO v_cost FROM fleet.inv_ledger WHERE id = v_leg;
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_to_location_id, p_bin_to, NULL, p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_reverse(
  p_org_id text,
  p_movement_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_existing uuid;
  v_new_movement uuid;
  v_ref text;
  v_leg record;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason required for reverse';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fleet.inv_movement m
    WHERE m.id = p_movement_id AND m.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'movement not found for org';
  END IF;

  v_ref := fleet._inv_next_ref(p_org_id, 'REV-');
  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reason,
    reverses_movement_id, idempotency_key
  )
  VALUES (
    p_org_id, v_ref, 'reverse', 'migration', p_reason, p_movement_id, p_idempotency_key
  )
  RETURNING id INTO v_new_movement;

  FOR v_leg IN
    SELECT *
    FROM fleet.inv_ledger
    WHERE organization_id = p_org_id AND movement_id = p_movement_id
  LOOP
    PERFORM fleet._inv_append_ledger_leg(
      p_org_id, v_new_movement, v_leg.item_id, v_leg.location_id, v_leg.bin_id, v_leg.asset_id,
      -v_leg.qty_delta, v_leg.unit_cost, v_leg.currency, v_leg.id
    );
  END LOOP;

  RETURN jsonb_build_object('movement_id', v_new_movement, 'ref_no', v_ref);
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
  v_total_cost numeric;
  v_cost numeric;
  v_disp uuid;
  v_leg uuid;
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

  v_total_cost := fleet._inv_peek_fifo_layers_cost(p_org_id, p_item_id, p_location_id, p_qty);

  SELECT COALESCE(s.approval_threshold_jmd, 20000) INTO v_threshold
  FROM fleet.inv_settings s
  WHERE s.organization_id = p_org_id;

  IF abs(v_total_cost) >= v_threshold THEN
    RETURN jsonb_build_object(
      'pending_approval', true,
      'amount_jmd', abs(v_total_cost),
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

  v_leg := fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, NULL, p_asset_id, -p_qty, NULL
  );
  SELECT unit_cost INTO v_cost FROM fleet.inv_ledger WHERE id = v_leg;
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, v_disp, NULL, p_asset_id, p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

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
  v_leg uuid;
  v_dest uuid;
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
    SELECT id INTO v_dest
    FROM fleet.inv_location
    WHERE organization_id = p_org_id AND vehicle_id = v_vehicle
    LIMIT 1;

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

      IF v_need <= 0 OR v_dest IS NULL THEN
        CONTINUE;
      END IF;

      v_leg := fleet._inv_append_ledger_leg(
        p_org_id, v_movement_id, v_item_id, p_source_location_id, NULL, NULL, -v_need, NULL
      );
      SELECT unit_cost INTO v_avg_cost FROM fleet.inv_ledger WHERE id = v_leg;
      PERFORM fleet._inv_append_ledger_leg(
        p_org_id, v_movement_id, v_item_id, v_dest, NULL, NULL, v_need, v_avg_cost
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
$$;

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

  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, NULL, NULL, -p_qty, NULL
  );

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

    PERFORM fleet._inv_append_ledger_leg(
      p_org_id, v_movement_id, v_item_id, v_location_id, v_bin_id, NULL, v_qty, v_landed
    );
    IF v_qty <> 0 THEN
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

-- Nightly integrity: include cost-layer drift
CREATE OR REPLACE FUNCTION fleet.inv_nightly_integrity(p_org_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_org text;
  v_check jsonb;
  v_bad bigint;
  v_layer_bad bigint;
BEGIN
  FOR v_org IN
    SELECT DISTINCT b.organization_id
    FROM fleet.inv_balance b
    WHERE p_org_id IS NULL OR b.organization_id = p_org_id
  LOOP
    v_check := fleet.inv_verify_chain(v_org);
    SELECT count(*) INTO v_bad
    FROM (
      SELECT b.organization_id, b.item_id, b.location_id, b.bin_key, b.on_hand AS bal_on_hand,
        COALESCE((
          SELECT sum(l.qty_delta)
          FROM fleet.inv_ledger l
          WHERE l.organization_id = b.organization_id
            AND l.item_id = b.item_id
            AND l.location_id = b.location_id
            AND COALESCE(l.bin_id, '00000000-0000-0000-0000-000000000000'::uuid) = b.bin_key
        ), 0) AS ledger_sum
      FROM fleet.inv_balance b
      WHERE b.organization_id = v_org
    ) x
    WHERE x.bal_on_hand IS DISTINCT FROM x.ledger_sum;

    SELECT count(*) INTO v_layer_bad
    FROM (
      SELECT b.organization_id, b.item_id, b.location_id,
        b.on_hand,
        COALESCE((
          SELECT sum(cl.qty_remaining)
          FROM fleet.inv_cost_layer cl
          WHERE cl.organization_id = b.organization_id
            AND cl.item_id = b.item_id
            AND cl.location_id = b.location_id
        ), 0) AS layer_qty
      FROM fleet.inv_balance b
      WHERE b.organization_id = v_org
    ) y
    WHERE y.on_hand IS DISTINCT FROM y.layer_qty;

    IF v_bad > 0 OR v_layer_bad > 0 OR NOT COALESCE((v_check->>'ok')::boolean, false) THEN
      INSERT INTO fleet.inv_alert (
        organization_id, type, chip_label, severity, title, body, status
      )
      VALUES (
        v_org, 'ledger_variance', 'LEDGER VARIANCE', 'critical',
        'Inventory integrity check failed',
        format(
          'balance_drift_rows=%s layer_drift_rows=%s chain_ok=%s',
          v_bad, v_layer_bad, v_check->>'ok'
        ),
        'open'
      );
    END IF;
  END LOOP;
  RETURN gen_random_uuid();
END;
$$;

-- ---------------------------------------------------------------------------
-- Roam org one-time layer repair
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_mount uuid := 'ca661367-4e4e-4d2a-9cfb-774ae21c4120';
  v_vehicle_loc uuid := 'b62780a6-c9b8-4de3-8bff-3ce1e55faea3';
  v_main_store uuid;
  v_layers bigint;
  v_value numeric;
  v_mount_vehicle_cost numeric;
  v_mount_store_cost numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fleet.inv_balance WHERE organization_id = v_org LIMIT 1) THEN
    RAISE NOTICE 'R13 repair skipped: org % has no inventory balances', v_org;
    RETURN;
  END IF;

  PERFORM fleet._inv_rebuild_cost_layers_from_ledger(v_org);
  PERFORM fleet._inv_sync_cost_layers_to_balance(v_org);

  SELECT id INTO v_main_store
  FROM fleet.inv_location
  WHERE organization_id = v_org AND code = 'JM-KIN-ST01'
  LIMIT 1;

  SELECT count(*) INTO v_layers
  FROM fleet.inv_cost_layer cl
  JOIN fleet.inv_balance b
    ON b.organization_id = cl.organization_id
   AND b.item_id = cl.item_id
   AND b.location_id = cl.location_id
  WHERE cl.organization_id = v_org
    AND cl.qty_remaining > 0
    AND b.on_hand > 0;

  SELECT COALESCE(sum(cl.qty_remaining * cl.unit_cost), 0) INTO v_value
  FROM fleet.inv_cost_layer cl
  WHERE cl.organization_id = v_org AND cl.qty_remaining > 0;

  IF v_layers <> 7 THEN
    RAISE EXCEPTION 'R13 repair: expected 7 active layers, got %', v_layers;
  END IF;

  IF v_value <> 69380 THEN
    RAISE EXCEPTION 'R13 repair: expected layer value 69380, got %', v_value;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fleet.inv_cost_layer cl
    JOIN fleet.inv_location loc ON loc.id = cl.location_id AND loc.organization_id = cl.organization_id
    WHERE cl.organization_id = v_org AND loc.kind = 'virtual' AND cl.qty_remaining > 0
  ) THEN
    RAISE EXCEPTION 'R13 repair: virtual location still has cost layers';
  END IF;

  SELECT cl.unit_cost INTO v_mount_vehicle_cost
  FROM fleet.inv_cost_layer cl
  WHERE cl.organization_id = v_org
    AND cl.item_id = v_mount
    AND cl.location_id = v_vehicle_loc
    AND cl.qty_remaining > 0
  LIMIT 1;

  IF v_mount_vehicle_cost IS DISTINCT FROM 3675 THEN
    RAISE EXCEPTION 'R13 repair: mount @ vehicle expected unit_cost 3675, got %', v_mount_vehicle_cost;
  END IF;

  IF v_main_store IS NOT NULL THEN
    SELECT cl.unit_cost INTO v_mount_store_cost
    FROM fleet.inv_cost_layer cl
    WHERE cl.organization_id = v_org
      AND cl.item_id = v_mount
      AND cl.location_id = v_main_store
      AND cl.qty_remaining > 0
    LIMIT 1;
    IF v_mount_store_cost IS DISTINCT FROM 5400 THEN
      RAISE EXCEPTION 'R13 repair: mount @ main store expected unit_cost 5400, got %', v_mount_store_cost;
    END IF;
  END IF;

  PERFORM fleet.inv_verify_chain(v_org);
END $$;
