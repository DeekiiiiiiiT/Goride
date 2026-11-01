-- Additional inventory RPCs (audit R3-06) + return from vehicle

CREATE OR REPLACE FUNCTION fleet.inv_return_from_vehicle(
  p_org_id text,
  p_item_id uuid,
  p_vehicle_id text,
  p_to_location_id uuid,
  p_qty numeric,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_from_location_id uuid;
  v_existing uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'return qty must be positive';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_existing := fleet._inv_movement_by_key(p_org_id, p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('movement_id', v_existing, 'idempotent_replay', true);
    END IF;
  END IF;

  SELECT id INTO v_from_location_id
  FROM fleet.inv_location
  WHERE organization_id = p_org_id
    AND kind = 'vehicle'
    AND vehicle_id = p_vehicle_id
  LIMIT 1;

  IF v_from_location_id IS NULL THEN
    RAISE EXCEPTION 'vehicle location not found for %', p_vehicle_id;
  END IF;

  RETURN fleet.inv_transfer(
    p_org_id,
    p_item_id,
    v_from_location_id,
    p_to_location_id,
    NULL,
    NULL,
    p_qty,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_reserve(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  UPDATE fleet.inv_balance
  SET reserved = reserved + p_qty, updated_at = now()
  WHERE organization_id = p_org_id
    AND item_id = p_item_id
    AND location_id = p_location_id
    AND bin_key = '00000000-0000-0000-0000-000000000000'::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'balance row not found for reserve';
  END IF;
  RETURN jsonb_build_object('ok', true, 'reference', p_reference);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_release(
  p_org_id text,
  p_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  UPDATE fleet.inv_balance
  SET reserved = GREATEST(0, reserved - p_qty), updated_at = now()
  WHERE organization_id = p_org_id
    AND item_id = p_item_id
    AND location_id = p_location_id
    AND bin_key = '00000000-0000-0000-0000-000000000000'::uuid;
  RETURN jsonb_build_object('ok', true, 'reference', p_reference);
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_recompute_reorder(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM fleet.inv_reorder_policy
  WHERE organization_id = p_org_id;
  RETURN jsonb_build_object('organization_id', p_org_id, 'policies', v_count, 'recomputed_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_publish_kit_version(
  p_org_id text,
  p_template_id uuid,
  p_version_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  UPDATE fleet.kit_template_version
  SET status = 'published', published_at = now()
  WHERE organization_id = p_org_id
    AND template_id = p_template_id
    AND id = p_version_id;
  RETURN jsonb_build_object(
    'template_id', p_template_id,
    'version_id', p_version_id,
    'status', 'published'
  );
END;
$$;

CREATE OR REPLACE FUNCTION fleet.inv_pair_scanner(
  p_org_id text,
  p_pairing_code text,
  p_device_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
BEGIN
  INSERT INTO fleet.inv_scan_device (organization_id, name, kind, pairing_code, paired_at)
  VALUES (p_org_id, coalesce(p_device_label, 'Scanner'), 'handheld', p_pairing_code, now())
  ON CONFLICT DO NOTHING;
  UPDATE fleet.inv_scan_device
  SET paired_at = now(), name = coalesce(p_device_label, name)
  WHERE organization_id = p_org_id AND pairing_code = p_pairing_code;
  RETURN jsonb_build_object('paired', true, 'pairing_code', p_pairing_code);
END;
$$;

REVOKE ALL ON FUNCTION fleet.inv_return_from_vehicle(text, uuid, text, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_reserve(text, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_release(text, uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_recompute_reorder(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_publish_kit_version(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fleet.inv_pair_scanner(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION fleet.inv_return_from_vehicle(text, uuid, text, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_reserve(text, uuid, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_release(text, uuid, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_recompute_reorder(text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_publish_kit_version(text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION fleet.inv_pair_scanner(text, text, text) TO service_role;
