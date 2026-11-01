-- Phase 0: org backfill for legacy fleet inventory/equipment + atomic legacy stock draw (INV-02 interim)

UPDATE fleet.inventory
SET
  organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  payload_json = jsonb_set(
    COALESCE(payload_json, '{}'::jsonb),
    '{organizationId}',
    '"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823"'::jsonb,
    true
  ),
  updated_at = now()
WHERE organization_id IS NULL;

UPDATE fleet.equipment
SET
  organization_id = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
  payload_json = jsonb_set(
    COALESCE(payload_json, '{}'::jsonb),
    '{organizationId}',
    '"8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823"'::jsonb,
    true
  ),
  updated_at = now()
WHERE organization_id IS NULL;

CREATE OR REPLACE FUNCTION fleet.legacy_inventory_draw(
  p_inventory_id text,
  p_org_id text,
  p_draw numeric,
  p_expected_qty numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_row fleet.inventory%ROWTYPE;
  v_qty numeric;
  v_next numeric;
  v_payload jsonb;
BEGIN
  IF p_draw IS NULL OR p_draw <= 0 THEN
    RAISE EXCEPTION 'draw must be positive';
  END IF;

  SELECT * INTO v_row
  FROM fleet.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory not found: %', p_inventory_id;
  END IF;

  IF v_row.organization_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'forbidden org mismatch';
  END IF;

  v_payload := COALESCE(v_row.payload_json, '{}'::jsonb);
  v_qty := COALESCE((v_payload->>'quantity')::numeric, 0);

  IF v_qty IS DISTINCT FROM p_expected_qty THEN
    RAISE EXCEPTION 'stock changed concurrently (expected % have %)', p_expected_qty, v_qty
      USING ERRCODE = '40001';
  END IF;

  IF v_qty < p_draw THEN
    RAISE EXCEPTION 'insufficient stock: need % have %', p_draw, v_qty
      USING ERRCODE = 'check_violation';
  END IF;

  v_next := v_qty - p_draw;
  v_payload := jsonb_set(
    jsonb_set(v_payload, '{quantity}', to_jsonb(v_next), true),
    '{updatedAt}',
    to_jsonb(to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    true
  );

  UPDATE fleet.inventory
  SET payload_json = v_payload, updated_at = now()
  WHERE id = p_inventory_id;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION fleet.legacy_inventory_draw(text, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fleet.legacy_inventory_draw(text, text, numeric, numeric) TO service_role;

INSERT INTO public.platform_feature_flags (name, enabled)
VALUES
  ('fleet_inventory_phase0_security', true),
  ('fleet_inventory_phase1_engine', false),
  ('fleet_inventory_phase2_stock', false),
  ('fleet_inventory_phase3_kits', false),
  ('fleet_inventory_phase4_assets', false),
  ('fleet_inventory_phase5_maintenance', false),
  ('fleet_inventory_phase6_purchasing', false),
  ('fleet_inventory_phase7_counts', false),
  ('fleet_inventory_phase8_telematics', false),
  ('inv_road_clearance_gate', false)
ON CONFLICT (name) DO NOTHING;;
