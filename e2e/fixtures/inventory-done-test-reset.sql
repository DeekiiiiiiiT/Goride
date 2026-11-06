-- Reset local inventory done-test baseline: flags, purge ZZ-TEST-* rows, tear down done-test org.
BEGIN;

INSERT INTO public.platform_feature_flags (name, enabled) VALUES
  ('fleet_inventory_phase0_security', true),
  ('fleet_inventory_phase1_engine', true),
  ('fleet_inventory_phase2_stock', true),
  ('fleet_inventory_phase3_kits', true),
  ('fleet_inventory_phase4_assets', false),
  ('fleet_inventory_phase5_maintenance', false),
  ('fleet_inventory_phase6_purchasing', false),
  ('fleet_inventory_phase7_counts', false),
  ('fleet_inventory_phase8_telematics', false),
  ('inv_road_clearance_gate', true)
ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled;

-- Purge all made-up ZZ-TEST-* inventory data (local / CI only).
DO $$
DECLARE
  v_item_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_item_ids
  FROM fleet.inv_item
  WHERE sku ILIKE 'ZZ-TEST-%';

  IF v_item_ids IS NOT NULL AND array_length(v_item_ids, 1) > 0 THEN
    DELETE FROM fleet.inv_driver_report_update
    WHERE report_id IN (SELECT id FROM fleet.inv_driver_report WHERE item_id = ANY(v_item_ids));
    DELETE FROM fleet.inv_driver_report WHERE item_id = ANY(v_item_ids);
    DELETE FROM fleet.inv_ledger WHERE item_id = ANY(v_item_ids);
    DELETE FROM fleet.inv_movement
    WHERE organization_id IN (SELECT DISTINCT organization_id FROM fleet.inv_item WHERE id = ANY(v_item_ids));
    DELETE FROM fleet.inv_balance WHERE item_id = ANY(v_item_ids);
    DELETE FROM fleet.inv_cost_layer WHERE item_id = ANY(v_item_ids);
    DELETE FROM fleet.inv_reservation WHERE item_id = ANY(v_item_ids);
    DELETE FROM fleet.inv_asset_event
    WHERE asset_id IN (SELECT id FROM fleet.inv_asset WHERE item_id = ANY(v_item_ids));
    DELETE FROM fleet.inv_asset_diagnostic
    WHERE asset_id IN (SELECT id FROM fleet.inv_asset WHERE item_id = ANY(v_item_ids));
    DELETE FROM fleet.inv_asset WHERE item_id = ANY(v_item_ids);
    DELETE FROM fleet.kit_template_line WHERE item_id = ANY(v_item_ids);
    DELETE FROM fleet.inv_item WHERE id = ANY(v_item_ids);
  END IF;

  DELETE FROM fleet.kit_template_line
  WHERE version_id IN (
    SELECT ktv.id FROM fleet.kit_template_version ktv
    JOIN fleet.kit_template kt ON kt.id = ktv.template_id
    WHERE kt.code ILIKE 'ZZ-TEST-%'
  );
  DELETE FROM fleet.vehicle_kit
  WHERE template_id IN (SELECT id FROM fleet.kit_template WHERE code ILIKE 'ZZ-TEST-%');
  DELETE FROM fleet.kit_template_version
  WHERE template_id IN (SELECT id FROM fleet.kit_template WHERE code ILIKE 'ZZ-TEST-%');
  DELETE FROM fleet.kit_template WHERE code ILIKE 'ZZ-TEST-%';

  DELETE FROM fleet.inv_item WHERE sku ILIKE 'ZZ-TEST-%';
END $$;

COMMIT;
