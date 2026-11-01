CREATE OR REPLACE FUNCTION fleet.r5_migrate_equipment_and_kits(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = fleet, public
AS $$
DECLARE
  v_eq record;
  v_payload jsonb;
  v_name text;
  v_vehicle_id text;
  v_loc uuid;
  v_cost numeric;
  v_item_id uuid;
  v_sku text;
  v_lines jsonb := '[]'::jsonb;
  v_asset_id uuid;
  v_template_id uuid;
  v_version_id uuid;
  v_line record;
  v_migrated integer := 0;
  v_skipped integer := 0;
  v_spare_done boolean := false;
BEGIN
  PERFORM fleet.ensure_vehicle_inv_locations(p_org_id);
  FOR v_eq IN SELECT id, payload_json FROM fleet.equipment WHERE organization_id = p_org_id LOOP
    v_payload := COALESCE(v_eq.payload_json, '{}'::jsonb);
    v_name := coalesce(v_payload->>'name', 'Equipment');
    v_vehicle_id := coalesce(v_payload->>'vehicleId', v_payload->>'vehicle_id');
    IF v_name ILIKE ANY (ARRAY['%toll tag%', '%gas card%']) THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    IF v_name ILIKE '%spare tire%' THEN
      IF v_spare_done THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
      v_cost := COALESCE((v_payload->>'price')::numeric, 20000); IF v_cost < 20000 THEN v_cost := 20000; END IF; v_spare_done := true;
    ELSIF v_name ILIKE ANY (ARRAY['%tire%', '%wheel%']) THEN
      INSERT INTO fleet.maintenance_events (organization_id, vehicle_id, type, payload, occurred_at)
      VALUES (p_org_id, v_vehicle_id, 'legacy_equipment_component', jsonb_build_object('legacy_equipment_id', v_eq.id, 'name', v_name, 'equipment', v_payload), now());
      v_migrated := v_migrated + 1; CONTINUE;
    ELSIF v_name ILIKE '%dash camera%' THEN
      v_cost := COALESCE((v_payload->>'price')::numeric, 0) + COALESCE((v_payload->>'shippingCost')::numeric, 0);
      v_sku := 'EQ-DASH-CAM';
      INSERT INTO fleet.inv_item (organization_id, sku, short_code, name, tracking, default_unit_cost) VALUES (p_org_id, v_sku, 'DASH', 'Dash Camera', 'serial', v_cost)
      ON CONFLICT (organization_id, lower(sku)) DO UPDATE SET updated_at = now() RETURNING id INTO v_item_id;
      SELECT id INTO v_loc FROM fleet.inv_location WHERE organization_id = p_org_id AND vehicle_id = v_vehicle_id LIMIT 1;
      INSERT INTO fleet.inv_asset (organization_id, asset_tag, item_id, serial_number, status, location_id, purchase_cost, installed_at)
      VALUES (p_org_id, 'AST-' || left(v_eq.id, 8), v_item_id, NULL, 'installed', v_loc, NULLIF(v_cost, 0), now())
      ON CONFLICT (organization_id, asset_tag) DO UPDATE SET location_id = EXCLUDED.location_id, status = EXCLUDED.status, updated_at = now() RETURNING id INTO v_asset_id;
      INSERT INTO fleet.inv_asset_event (organization_id, asset_id, vehicle_id, type, title, body)
      VALUES (p_org_id, v_asset_id, v_vehicle_id, 'migration', 'Add serial', 'Dash camera migrated without serial — capture serial in asset page.');
      v_migrated := v_migrated + 1; CONTINUE;
    ELSE
      v_cost := COALESCE((v_payload->>'price')::numeric, 0) + COALESCE((v_payload->>'shippingCost')::numeric, 0);
    END IF;
    IF v_vehicle_id IS NULL OR btrim(v_vehicle_id) = '' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    SELECT id INTO v_loc FROM fleet.inv_location WHERE organization_id = p_org_id AND vehicle_id = v_vehicle_id LIMIT 1;
    IF v_loc IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_sku := 'EQ-' || upper(left(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'), 24));
    INSERT INTO fleet.inv_item (organization_id, sku, short_code, name, tracking, default_unit_cost) VALUES (p_org_id, v_sku, upper(left(v_sku, 8)), v_name, 'quantity', NULLIF(v_cost, 0))
    ON CONFLICT (organization_id, lower(sku)) DO UPDATE SET name = EXCLUDED.name, default_unit_cost = COALESCE(EXCLUDED.default_unit_cost, fleet.inv_item.default_unit_cost), updated_at = now() RETURNING id INTO v_item_id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('item_id', v_item_id, 'location_id', v_loc, 'qty', 1, 'unit_cost', COALESCE(v_cost, 0)));
    v_migrated := v_migrated + 1;
  END LOOP;
  IF jsonb_array_length(v_lines) > 0 THEN PERFORM fleet.inv_opening_balance(p_org_id, v_lines, 'migration-r5-equipment-' || p_org_id); END IF;
  SELECT id INTO v_template_id FROM fleet.kit_template WHERE organization_id = p_org_id AND lower(code) = lower('RIDESHARE-DEFAULT');
  IF v_template_id IS NULL THEN INSERT INTO fleet.kit_template (organization_id, code, name, classification, is_default) VALUES (p_org_id, 'RIDESHARE-DEFAULT', 'Rideshare car kit', 'rideshare', true) RETURNING id INTO v_template_id;
  ELSE UPDATE fleet.kit_template SET name = 'Rideshare car kit', is_default = true, updated_at = now() WHERE id = v_template_id; END IF;
  INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status, change_note, published_at) VALUES (p_org_id, v_template_id, 1, 'production', 'R5-02 default rideshare kit', now())
  ON CONFLICT (template_id, version) DO UPDATE SET status = 'production', published_at = COALESCE(fleet.kit_template_version.published_at, now()) RETURNING id INTO v_version_id;
  IF v_version_id IS NULL THEN SELECT id INTO v_version_id FROM fleet.kit_template_version WHERE template_id = v_template_id AND version = 1; END IF;
  DELETE FROM fleet.kit_template_line WHERE organization_id = p_org_id AND version_id = v_version_id;
  FOR v_line IN SELECT i.id AS item_id, i.name, row_number() OVER (ORDER BY i.name) AS ord FROM fleet.inv_item i WHERE i.organization_id = p_org_id AND i.tracking IN ('quantity', 'serial') AND lower(i.name) LIKE ANY (ARRAY['%phone holder%','%car jack%','%lug tool%','%car mat%','%spare tire%','%dash camera%','%fire extinguisher%','%first aid%','%warning triangle%','%reflective vest%']) LIMIT 10 LOOP
    INSERT INTO fleet.kit_template_line (organization_id, version_id, line_type, item_id, qty_required, required, blocks_road_clearance, sort_order)
    VALUES (p_org_id, v_version_id, 'item', v_line.item_id, 1, true, lower(v_line.name) LIKE ANY (ARRAY['%dash camera%','%phone holder%','%spare tire%']), v_line.ord);
  END LOOP;
  INSERT INTO fleet.kit_template_line (organization_id, version_id, line_type, item_id, qty_required, required, blocks_road_clearance, sort_order)
  SELECT p_org_id, v_version_id, 'linked_toll_tag', NULL, 1, true, true, 100 WHERE NOT EXISTS (SELECT 1 FROM fleet.kit_template_line WHERE version_id = v_version_id AND line_type = 'linked_toll_tag');
  INSERT INTO fleet.vehicle_kit (organization_id, vehicle_id, template_id, version_id, home_location_id, verification_status)
  SELECT p_org_id, v.id, v_template_id, v_version_id, l.id, 'pending_verification' FROM fleet.vehicles v LEFT JOIN fleet.inv_location l ON l.organization_id = p_org_id AND l.vehicle_id = v.id WHERE v.organization_id = p_org_id
  ON CONFLICT (organization_id, vehicle_id) DO UPDATE SET template_id = EXCLUDED.template_id, version_id = EXCLUDED.version_id, home_location_id = EXCLUDED.home_location_id, updated_at = now();
  RETURN jsonb_build_object('equipment_migrated', v_migrated, 'equipment_skipped', v_skipped, 'kit_template_id', v_template_id, 'kit_version_id', v_version_id);
END;
$$;;
