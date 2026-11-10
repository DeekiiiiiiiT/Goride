-- Fleet Inventory completion audit — done-tests 1, 2, 3, 4, 14 (docs/fleet-inventory-completion-audit.md).
-- Made-up org and cars only; everything rolls back.
BEGIN;

DO $$
DECLARE
  v_org text := 'ZZ-TEST-IVC-ORG';
  v_car_a text := 'ZZ-IVC-CAR-A';
  v_car_b text := 'ZZ-IVC-CAR-B';
  v_driver text := 'ZZ-IVC-DRIVER-A';
  v_store uuid;
  v_loc_a uuid;
  v_jack uuid;
  v_pump uuid;
  v_ext uuid;
  v_cam uuid;
  v_tpl uuid;
  v_ver uuid;
  v_status text;
  v_n int;
  v_needed numeric;
  v_need_status text;
  v_cars_value numeric;
  v_required boolean;
  v_road boolean;
BEGIN
  INSERT INTO fleet.inv_settings (organization_id) VALUES (v_org) ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id, current_driver_id)
  VALUES (v_car_a, v_org, 'IVC-A', 'legacy-' || v_car_a, v_driver),
         (v_car_b, v_org, 'IVC-B', 'legacy-' || v_car_b, NULL);

  SELECT id INTO v_loc_a FROM fleet.inv_location WHERE organization_id = v_org AND vehicle_id = v_car_a;
  IF v_loc_a IS NULL THEN RAISE EXCEPTION 'FAIL setup: car location not created'; END IF;

  INSERT INTO fleet.inv_location (organization_id, code, name, kind, is_default, is_active)
  VALUES (v_org, 'ZZ-STORE', 'ZZ store', 'warehouse', true, true) RETURNING id INTO v_store;

  INSERT INTO fleet.inv_item (organization_id, sku, name, tracking, default_unit_cost)
  VALUES (v_org, 'ZZ-JACK', 'ZZ Jack', 'quantity', 100) RETURNING id INTO v_jack;
  INSERT INTO fleet.inv_item (organization_id, sku, name, tracking)
  VALUES (v_org, 'ZZ-PUMP', 'ZZ Pump', 'quantity') RETURNING id INTO v_pump;
  INSERT INTO fleet.inv_item (organization_id, sku, name, tracking)
  VALUES (v_org, 'ZZ-EXT', 'ZZ Extinguisher', 'quantity') RETURNING id INTO v_ext;
  INSERT INTO fleet.inv_item (organization_id, sku, name, tracking)
  VALUES (v_org, 'ZZ-CAM', 'ZZ Camera', 'serial') RETURNING id INTO v_cam;

  INSERT INTO fleet.kit_template (organization_id, code, name) VALUES (v_org, 'ZZ-KIT', 'ZZ kit') RETURNING id INTO v_tpl;
  INSERT INTO fleet.kit_template_version (organization_id, template_id, version, status)
  VALUES (v_org, v_tpl, 1, 'production') RETURNING id INTO v_ver;
  INSERT INTO fleet.kit_template_line (organization_id, version_id, line_type, item_id, qty_required, required, blocks_road_clearance, sort_order)
  VALUES (v_org, v_ver, 'item', v_jack, 1, true, true, 1),
         (v_org, v_ver, 'item', v_pump, 1, true, false, 2),
         (v_org, v_ver, 'item', v_ext, 1, false, true, 3),
         (v_org, v_ver, 'item', v_cam, 1, true, false, 4),
         (v_org, v_ver, 'linked_toll_tag', NULL, 1, true, false, 5),
         (v_org, v_ver, 'linked_fuel_card', NULL, 1, true, false, 6);
  INSERT INTO fleet.vehicle_kit (organization_id, vehicle_id, template_id, version_id)
  VALUES (v_org, v_car_a, v_tpl, v_ver), (v_org, v_car_b, v_tpl, v_ver);

  -- Car A: jack on hand, camera installed (single unit), toll tag, fuel card via its driver.
  INSERT INTO fleet.inv_balance (organization_id, item_id, location_id, bin_key, on_hand, reserved, value)
  VALUES (v_org, v_jack, v_loc_a, '00000000-0000-0000-0000-000000000000', 1, 0, 100);
  INSERT INTO fleet.inv_asset (organization_id, asset_tag, item_id, status, location_id, purchase_cost)
  VALUES (v_org, 'ZZ-CAM-1', v_cam, 'installed', v_loc_a, 500);
  INSERT INTO fleet.toll_tags (id, organization_id, tag_number, vehicle_id, legacy_kv_id)
  VALUES ('ZZ-IVC-TAG', v_org, 'ZZTAG-1', v_car_a, 'legacy-ZZ-IVC-TAG');
  INSERT INTO fleet.fuel_cards (id, organization_id, legacy_kv_id, payload_json)
  VALUES ('ZZ-IVC-CARD', v_org, 'legacy-ZZ-IVC-CARD', jsonb_build_object('status', 'Active', 'assignedDriverId', v_driver));

  -- Done-test 1: fuel card / toll tag lines are really checked.
  SELECT line_status INTO v_status FROM fleet.v_inv_kit_compliance
  WHERE organization_id = v_org AND vehicle_id = v_car_b AND line_type = 'linked_toll_tag';
  IF v_status IS DISTINCT FROM 'missing' THEN RAISE EXCEPTION 'FAIL 1: car B toll tag = %, want missing', v_status; END IF;
  SELECT line_status INTO v_status FROM fleet.v_inv_kit_compliance
  WHERE organization_id = v_org AND vehicle_id = v_car_b AND line_type = 'linked_fuel_card';
  IF v_status IS DISTINCT FROM 'missing' THEN RAISE EXCEPTION 'FAIL 1: car B fuel card = %, want missing', v_status; END IF;
  SELECT line_status INTO v_status FROM fleet.v_inv_kit_compliance
  WHERE organization_id = v_org AND vehicle_id = v_car_a AND line_type = 'linked_toll_tag';
  IF v_status IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FAIL 1: car A toll tag = %, want ok', v_status; END IF;
  SELECT line_status INTO v_status FROM fleet.v_inv_kit_compliance
  WHERE organization_id = v_org AND vehicle_id = v_car_a AND line_type = 'linked_fuel_card';
  IF v_status IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FAIL 1: car A fuel card (via driver) = %, want ok', v_status; END IF;

  -- Done-test 2: pump has no balance row anywhere, both cars miss it → out, 2 needed.
  SELECT needed, need_status INTO v_needed, v_need_status FROM fleet.v_inv_store_needs
  WHERE organization_id = v_org AND item_id = v_pump;
  IF v_needed IS DISTINCT FROM 2 OR v_need_status IS DISTINCT FROM 'out' THEN
    RAISE EXCEPTION 'FAIL 2: pump needed=% status=%, want 2 / out', v_needed, v_need_status;
  END IF;
  -- Optional extinguisher is never "needed".
  SELECT needed INTO v_needed FROM fleet.v_inv_store_needs WHERE organization_id = v_org AND item_id = v_ext;
  IF v_needed IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL 2: optional line counted as needed (%)', v_needed; END IF;

  -- Done-test 3: the installed camera's cost is on the cars side.
  SELECT on_cars_value INTO v_cars_value FROM fleet.v_inv_asset_value WHERE organization_id = v_org;
  IF v_cars_value IS DISTINCT FROM 500 THEN RAISE EXCEPTION 'FAIL 3: asset on-cars value %, want 500', v_cars_value; END IF;

  -- Done-test 4: car A misses only pump (required) — extinguisher is optional; road clearance ignores it.
  SELECT count(*) INTO v_n FROM fleet.v_inv_kit_compliance
  WHERE organization_id = v_org AND vehicle_id = v_car_a AND required AND line_status <> 'ok';
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 4: car A required missing = %, want 1', v_n; END IF;
  SELECT required, road_clear INTO v_required, v_road FROM fleet.v_inv_kit_compliance
  WHERE organization_id = v_org AND vehicle_id = v_car_a AND item_id = v_ext;
  IF v_required IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL 4: required flag not exposed'; END IF;
  IF v_road IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL 4: optional blocking line blocked road clearance'; END IF;

  -- Done-test 14: nightly job writes today's kit snapshot.
  PERFORM fleet.inv_nightly_integrity(v_org);
  SELECT count(*) INTO v_n FROM fleet.inv_kit_compliance_daily
  WHERE organization_id = v_org AND snapshot_date = (now() AT TIME ZONE 'America/Jamaica')::date
    AND vehicles = 2 AND vehicles_complete = 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 14: no kit snapshot row for today'; END IF;

  RAISE NOTICE 'Fleet inventory completion SQL tests: ok';
END $$;

ROLLBACK;
