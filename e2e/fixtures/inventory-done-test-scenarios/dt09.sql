-- Done-test 09: fleet courier (inv-done-driver) + ready order + pending offer for road-clearance accept test.
BEGIN;

DO $$
DECLARE
  v_org text := 'f6010000-0000-4000-8000-000000000099';
  v_org_uuid uuid := 'f6010000-0000-4000-8000-000000000099'::uuid;
  v_driver uuid := 'a6010004-0000-4000-8000-000000000004'::uuid;
  v_order uuid := 'b6010009-0000-4000-8000-000000000902'::uuid;
  v_offer uuid := 'b6010009-0000-4000-8000-000000000901'::uuid;
  v_merchant uuid := 'b6010009-0000-4000-8000-000000000903'::uuid;
BEGIN
  INSERT INTO delivery.merchants (id, name, slug, operational_status, lat, lng, address, phone, vertical_type, fulfillment_type, submitted_at, procurement_mode)
  VALUES (
    v_merchant,
    'ZZ Inv Test Merchant',
    'zz-inv-test-merchant',
    'active',
    18.015,
    -76.955,
    'Spanish Town test',
    '+18765550199',
    'restaurant',
    'cook_to_order',
    now(),
    'in_house'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO delivery.courier_profiles (user_id, status, mode, fleet_id, display_name, fleet_role)
  VALUES (v_driver, 'active', 'fleet', v_org_uuid, 'Inv Done Driver', 'courier')
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'active',
    mode = 'fleet',
    fleet_id = EXCLUDED.fleet_id,
    display_name = EXCLUDED.display_name;

  INSERT INTO fleet.drivers (id, organization_id, user_id, assigned_vehicle_id, name, service_lines, legacy_kv_id)
  VALUES (
    'inv-done-driver-fleet-row',
    v_org,
    v_driver::text,
    'test-org-inv-veh-001',
    'Inv Done Driver',
    ARRAY['rideshare', 'rush_delivery'],
    'legacy-inv-done-driver-fleet-row'
  )
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    user_id = EXCLUDED.user_id,
    assigned_vehicle_id = EXCLUDED.assigned_vehicle_id;

  INSERT INTO delivery.courier_availability (driver_id, is_online, current_lat, current_lng, updated_at, h3_cell, h3_res)
  VALUES (v_driver, true, 18.014, -76.954, now(), '876732d73ffffff', 7)
  ON CONFLICT (driver_id) DO UPDATE SET
    is_online = true,
    current_lat = EXCLUDED.current_lat,
    current_lng = EXCLUDED.current_lng,
    h3_cell = EXCLUDED.h3_cell,
    h3_res = EXCLUDED.h3_res,
    updated_at = now();

  DELETE FROM delivery.courier_offers WHERE id = v_offer OR order_id = v_order;
  DELETE FROM delivery.orders WHERE id = v_order;

  INSERT INTO delivery.orders (
    id, order_number, status, merchant_id, total, delivery_fee, subtotal, platform_fee,
    delivery_address, delivery_lat, delivery_lng, ready_at, items, channel, fulfillment_type
  ) VALUES (
    v_order,
    'ZZ-DT09-001',
    'ready',
    v_merchant,
    2500,
    500,
    2000,
    0,
    '12 Burke Rd, Spanish Town',
    18.015,
    -76.955,
    now(),
    '[]'::jsonb,
    'phone',
    'delivery'
  );

  INSERT INTO delivery.courier_offers (id, order_id, courier_user_id, status, wave, expires_at)
  VALUES (
    v_offer,
    v_order,
    v_driver,
    'pending',
    1,
    now() + interval '30 minutes'
  );
END $$;

COMMIT;
