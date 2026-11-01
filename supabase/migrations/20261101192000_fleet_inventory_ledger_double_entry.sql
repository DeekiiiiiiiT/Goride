-- R6-04: Virtual locations + double-entry legs for opening balance, receive, adjust, write-off.

CREATE OR REPLACE FUNCTION fleet._inv_virtual_location_id(
  p_org_id text,
  p_code text,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM fleet.inv_location
  WHERE organization_id = p_org_id AND code = p_code AND kind = 'virtual'
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO fleet.inv_location (organization_id, code, name, kind, is_active)
    VALUES (p_org_id, p_code, p_name, 'virtual', true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION fleet._inv_virtual_location_id(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet._inv_virtual_location_id(text, text, text) TO service_role;

-- Seed standard virtual locations for every org with inventory activity
INSERT INTO fleet.inv_location (organization_id, code, name, kind, is_active)
SELECT DISTINCT b.organization_id, v.code, v.name, 'virtual', true
FROM fleet.inv_balance b
CROSS JOIN (VALUES
  ('V-SUPPLIER', 'Supplier (virtual)'),
  ('V-ADJUSTMENT', 'Adjustment (virtual)'),
  ('V-DISPOSED', 'Disposed (virtual)'),
  ('V-IN-TRANSIT', 'In transit (virtual)')
) AS v(code, name)
WHERE NOT EXISTS (
  SELECT 1 FROM fleet.inv_location l
  WHERE l.organization_id = b.organization_id AND l.code = v.code
);

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

-- Backfill offset legs for existing opening_balance movements (OPN-0001 / OPN-0002)
DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_supplier uuid;
  v_mov record;
  v_leg record;
BEGIN
  v_supplier := fleet._inv_virtual_location_id(v_org, 'V-SUPPLIER', 'Supplier (virtual)');
  FOR v_mov IN
    SELECT id FROM fleet.inv_movement
    WHERE organization_id = v_org AND type = 'opening_balance'
  LOOP
    FOR v_leg IN
      SELECT l.*
      FROM fleet.inv_ledger l
      JOIN fleet.inv_location loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id
      WHERE l.organization_id = v_org
        AND l.movement_id = v_mov.id
        AND l.qty_delta > 0
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
END $$;

-- receive / adjust / write-off: matching virtual offset legs (new movements only)
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
