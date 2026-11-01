-- see repo supabase/migrations/.tmp_rpc_2.sql
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

  v_cost := fleet._inv_consume_fifo_layers(p_org_id, p_item_id, p_from_location_id, p_qty);

  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_from_location_id, p_bin_from, NULL, -p_qty, v_cost
  );
  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_to_location_id, p_bin_to, NULL, p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
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
SET search_path = fleet, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
  v_threshold numeric;
  v_value numeric;
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
      -v_leg.qty_delta, v_leg.unit_cost, v_leg.currency
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
SET search_path = fleet, public
AS $$
DECLARE
  v_existing uuid;
  v_movement_id uuid;
  v_ref text;
  v_threshold numeric;
  v_cost numeric;
  v_value numeric;
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

  v_ref := fleet._inv_next_ref(p_org_id, 'WOF-');
  INSERT INTO fleet.inv_movement (
    organization_id, ref_no, type, reference_type, reason, memo, idempotency_key
  )
  VALUES (p_org_id, v_ref, 'write_off', 'migration', p_reason, p_memo, p_idempotency_key)
  RETURNING id INTO v_movement_id;

  PERFORM fleet._inv_append_ledger_leg(
    p_org_id, v_movement_id, p_item_id, p_location_id, NULL, p_asset_id, -p_qty, v_cost
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'ref_no', v_ref);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_import_items(
  p_org_id text,
  p_file jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'stub', true,
    'organization_id', p_org_id,
    'message', 'CSV/TSV/XLSX import preview not implemented in Phase 1 migration',
    'received', COALESCE(jsonb_typeof(p_file), 'null')
  );
END;
$$;
;
