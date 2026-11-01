-- §8 Legacy fleet.inventory → inv_* opening balances (idempotent)

CREATE OR REPLACE FUNCTION fleet.migrate_legacy_inventory_to_engine(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_loc uuid;
  v_lines jsonb := '[]'::jsonb;
  v_row record;
  v_payload jsonb;
  v_qty numeric;
  v_cost numeric;
  v_sku text;
  v_item_id uuid;
BEGIN
  IF p_org_id IS NULL OR length(trim(p_org_id)) = 0 THEN
    RAISE EXCEPTION 'org required';
  END IF;

  INSERT INTO fleet.inv_settings (organization_id)
  VALUES (p_org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT id INTO v_loc
  FROM fleet.inv_location
  WHERE organization_id = p_org_id AND kind = 'warehouse' AND is_default = true
  LIMIT 1;

  IF v_loc IS NULL THEN
    INSERT INTO fleet.inv_location (
      organization_id, code, name, kind, is_default, is_active
    ) VALUES (
      p_org_id, 'JM-KIN-ST01', 'Main store — Kingston', 'warehouse', true, true
    )
    RETURNING id INTO v_loc;
  END IF;

  FOR v_row IN
    SELECT id, payload_json FROM fleet.inventory WHERE organization_id = p_org_id
  LOOP
    v_payload := COALESCE(v_row.payload_json, '{}'::jsonb);
    v_qty := COALESCE((v_payload->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_payload->>'cost')::numeric, (v_payload->>'unitCost')::numeric, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_sku := coalesce(nullif(v_payload->>'sku', ''), 'LEG-' || left(v_row.id, 12));

    INSERT INTO fleet.inv_item (
      organization_id, sku, short_code, name, tracking, default_unit_cost
    ) VALUES (
      p_org_id,
      v_sku,
      coalesce(nullif(v_payload->>'shortCode', ''), 'LEG-' || left(v_row.id, 6)),
      coalesce(nullif(v_payload->>'name', ''), 'Legacy item'),
      'quantity',
      v_cost
    )
    ON CONFLICT (organization_id, lower(sku)) DO UPDATE
      SET updated_at = now()
    RETURNING id INTO v_item_id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id', v_item_id,
      'location_id', v_loc,
      'qty', v_qty,
      'unit_cost', v_cost
    ));
  END LOOP;

  IF jsonb_array_length(v_lines) > 0 THEN
    PERFORM fleet.inv_opening_balance(
      p_org_id,
      v_lines,
      'migration-legacy-inventory-' || p_org_id
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'opening_lines', jsonb_array_length(v_lines),
    'default_location_id', v_loc
  );
END;
$$;

REVOKE ALL ON FUNCTION fleet.migrate_legacy_inventory_to_engine(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet.migrate_legacy_inventory_to_engine(text) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fleet.inventory LIMIT 1) THEN
    PERFORM fleet.migrate_legacy_inventory_to_engine('8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823');
  END IF;
END $$;

COMMENT ON TABLE fleet.inventory IS 'Legacy KV mirror — read-only during inv_* cutover; drop after 30 days post phase2 prod';
COMMENT ON TABLE fleet.equipment IS 'Legacy equipment — superseded by inv_asset / vehicle_kit';
