-- R6-02 payload_json equipment migration
DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_vehicle text;
  v_row record;
  v_payload jsonb;
  v_name text;
BEGIN
  SELECT id INTO v_vehicle FROM fleet.vehicles WHERE organization_id = v_org AND license_plate ILIKE '%5179%' LIMIT 1;
  IF v_vehicle IS NULL OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'fleet' AND table_name = 'equipment') THEN RETURN; END IF;
  FOR v_row IN SELECT e.id, e.organization_id, e.payload_json FROM fleet.equipment e WHERE e.organization_id = v_org LOOP
    v_payload := coalesce(v_row.payload_json, '{}'::jsonb);
    IF coalesce(v_payload->>'vehicleId', v_payload->>'vehicle_id') IS DISTINCT FROM v_vehicle THEN CONTINUE; END IF;
    v_name := coalesce(v_payload->>'name', v_payload->>'title', 'Tyre / wheel');
    IF v_name NOT ILIKE '%tire%' AND v_name NOT ILIKE '%tyre%' AND v_name NOT ILIKE '%wheel%' AND v_name NOT ILIKE '%spare%' THEN CONTINUE; END IF;
    INSERT INTO fleet.maintenance_events (organization_id, vehicle_id, type, payload, occurred_at)
    SELECT v_org, v_vehicle, 'legacy_equipment_migrated', jsonb_build_object('source','inventory_r6_02','equipment_id',v_row.id,'name',v_name,'price',v_payload->>'price','shipping_cost',v_payload->>'shippingCost','purchase_date',v_payload->>'purchaseDate','status',v_payload->>'status','damage_history',v_payload->'damageHistory','notes','Migrated from fleet.equipment before inv_* cutover'), coalesce((v_payload->>'purchaseDate')::timestamptz, now())
    WHERE NOT EXISTS (SELECT 1 FROM fleet.maintenance_events me WHERE me.organization_id = v_org AND me.vehicle_id = v_vehicle AND me.type = 'legacy_equipment_migrated' AND me.payload->>'equipment_id' = v_row.id::text);
  END LOOP;
  BEGIN
    PERFORM fleet.inv_opening_balance(v_org, jsonb_build_array(jsonb_build_object('item_id',(SELECT id FROM fleet.inv_item WHERE organization_id = v_org AND name ILIKE 'Spare Tire' LIMIT 1),'location_id',(SELECT id FROM fleet.inv_location WHERE organization_id = v_org AND code ILIKE '%main%' LIMIT 1),'qty',1,'unit_cost',15000)), 'r6-02-second-spare-opening');
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;;
