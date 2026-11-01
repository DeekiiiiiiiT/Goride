-- R8-04: Legacy equipment events → completed maintenance work orders; second spare opening balance.

DO $$
DECLARE
  v_org text := '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';
  v_vehicle text;
  v_ev record;
  v_wo uuid;
  v_price numeric;
  v_ship numeric;
  v_total numeric;
  v_date date;
  v_name text;
  v_spare uuid;
  v_main uuid;
BEGIN
  SELECT id INTO v_vehicle
  FROM fleet.vehicles
  WHERE organization_id = v_org AND license_plate ILIKE '%5179%'
  LIMIT 1;

  IF v_vehicle IS NULL THEN
    RETURN;
  END IF;

  FOR v_ev IN
    SELECT *
    FROM fleet.maintenance_events me
    WHERE me.organization_id = v_org
      AND me.vehicle_id = v_vehicle
      AND me.type IN ('legacy_equipment_migrated', 'legacy_equipment_component')
      AND me.processed_at IS NULL
  LOOP
    v_name := coalesce(v_ev.payload->>'name', 'Tyre / wheel');
    v_price := coalesce((v_ev.payload->>'price')::numeric, 0);
    v_ship := coalesce((v_ev.payload->>'shipping_cost')::numeric, 0);
    v_total := v_price + v_ship;
    v_date := coalesce((v_ev.payload->>'purchase_date')::date, v_ev.occurred_at::date, current_date);

    IF EXISTS (
      SELECT 1 FROM public.maintenance_work_orders wo
      WHERE wo.organization_id = v_org
        AND wo.payload_json->>'legacyMaintenanceEventId' = v_ev.id::text
    ) THEN
      UPDATE fleet.maintenance_events SET processed_at = now() WHERE id = v_ev.id;
      CONTINUE;
    END IF;

    v_wo := gen_random_uuid();
    INSERT INTO public.maintenance_work_orders (
      id, organization_id, vehicle_id, status,
      opened_at, closed_at, performed_at_date,
      provider, currency, log_mode, package_complete,
      notes, total_cost, payload_json, updated_at
    ) VALUES (
      v_wo,
      v_org,
      v_vehicle,
      'completed',
      coalesce(v_ev.occurred_at, now()),
      now(),
      v_date,
      'Legacy equipment import',
      'JMD',
      'quick_job',
      false,
      coalesce(v_ev.payload->>'notes', v_name),
      v_total,
      jsonb_build_object(
        'source', 'inventory_r8_04',
        'legacyMaintenanceEventId', v_ev.id::text,
        'corner', v_ev.payload->>'position',
        'damage_history', v_ev.payload->'damage_history'
      ),
      now()
    );

    INSERT INTO public.maintenance_work_order_lines (
      id, work_order_id, sort_order, component_name, action,
      material, labor_amount, line_total, notes
    ) VALUES (
      gen_random_uuid(),
      v_wo,
      1,
      v_name,
      'replace',
      v_total,
      0,
      v_total,
      coalesce(v_ev.payload->>'notes', 'Migrated from fleet.equipment')
    );

    UPDATE fleet.maintenance_events SET processed_at = now() WHERE id = v_ev.id;
  END LOOP;

  SELECT id INTO v_spare
  FROM fleet.inv_item
  WHERE organization_id = v_org AND name ILIKE 'Spare Tire'
  LIMIT 1;

  SELECT id INTO v_main
  FROM fleet.inv_location
  WHERE organization_id = v_org AND is_default = true
  LIMIT 1;

  IF v_spare IS NOT NULL AND v_main IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM fleet.inv_movement m
      WHERE m.organization_id = v_org AND m.idempotency_key = 'r8-04-second-spare'
    ) THEN
      PERFORM fleet.inv_opening_balance(
        v_org,
        jsonb_build_array(jsonb_build_object(
          'item_id', v_spare,
          'location_id', v_main,
          'qty', 1,
          'unit_cost', 15000
        )),
        'r8-04-second-spare'
      );
    END IF;
  END IF;
END $$;
