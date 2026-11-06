-- Done-test 08: baseline kit (toll, fuel, qty-2 ext, Boot pump) on both cars; no vest line yet.
BEGIN;
-- Re-apply production kit version lines from base seed (clears draft kit editor state).
DO $$
DECLARE
  v_org text := 'f6010000-0000-4000-8000-000000000099';
  v_kit_tpl uuid;
  v_kit_ver uuid;
  v_pump uuid;
  v_tri uuid;
  v_ext uuid;
BEGIN
  SELECT id INTO v_kit_tpl FROM fleet.kit_template
  WHERE organization_id = v_org AND lower(code) = lower('ZZ-TEST-RIDESHARE-KIT');
  SELECT id INTO v_kit_ver FROM fleet.kit_template_version
  WHERE organization_id = v_org AND template_id = v_kit_tpl AND status = 'production' LIMIT 1;
  SELECT id INTO v_pump FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-PUMP';
  SELECT id INTO v_tri FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-TRI';
  SELECT id INTO v_ext FROM fleet.inv_item WHERE organization_id = v_org AND sku = 'ZZ-TEST-EXT';

  DELETE FROM fleet.kit_template_line WHERE organization_id = v_org AND version_id = v_kit_ver;
  INSERT INTO fleet.kit_template_line (
    organization_id, version_id, line_type, item_id, qty_required, required, blocks_road_clearance, install_position, sort_order
  ) VALUES
    (v_org, v_kit_ver, 'linked_toll_tag', NULL, 1, true, false, NULL, 1),
    (v_org, v_kit_ver, 'linked_fuel_card', NULL, 1, true, false, NULL, 2),
    (v_org, v_kit_ver, 'item', v_pump, 1, true, true, 'Boot', 3),
    (v_org, v_kit_ver, 'item', v_tri, 1, true, true, NULL, 4),
    (v_org, v_kit_ver, 'item', v_ext, 2, true, true, NULL, 5);

  UPDATE fleet.vehicle_kit SET version_id = v_kit_ver
  WHERE organization_id = v_org;
END $$;
COMMIT;
