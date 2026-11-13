-- LOCAL TEST COPY ONLY (never live). Toll Phase 3 click-through setup for the MM F01 test fleet.
-- Run after `npx supabase db reset` (seeded), before `pnpm testcopy`:
--   docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 < docs/toll-build/p3r4-testcopy-setup.sql
-- Then: `pnpm testcopy`; the local calculator
--   (deno run --allow-env --allow-net --allow-read --no-check scripts/recon-worker-local.ts --nightly, then --loop);
-- upload the 24 Aug files in Step 1. Run `pnpm install` afterwards (Deno runs disturb node_modules).
BEGIN;
DO $$
DECLARE
  v_org text := 'cccccccc-cccc-4ccc-8ccc-0000000000f1';
  v_drv text := 'd1f01000-0000-4000-8000-000000000001';   -- a uuid driver, like live
  v_login text := '10300001-0000-4000-8000-000000000001'; -- testcopy-driver@local.test
  v_veh text := 'mm_f01_5179kz';
BEGIN
  IF inet_server_port() <> 5432 OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'local test copy only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id::text = v_org) THEN
    RAISE EXCEPTION 'MM F01 is missing: run `npx supabase db reset` (seeded) first; `pnpm test:toll` leaves no seed data';
  END IF;

  -- Switches: the week wizard, staged uploads (Step 1 register answers 501 without it), toll v2.
  INSERT INTO kv_store_37f42386 (key, value) VALUES
    ('feature_flag:recon_v2', jsonb_build_object('enabled', false, 'enabledForOrgs', jsonb_build_array(v_org))),
    ('feature_flag:recon_wizard', jsonb_build_object('enabled', false, 'enabledForOrgs', jsonb_build_array(v_org)))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  INSERT INTO toll.switch_state (organization_id, tolls_v2) VALUES (v_org::uuid, true)
  ON CONFLICT (organization_id) DO UPDATE SET tolls_v2 = true;
  PERFORM toll_system.ensure_accounts(v_org::uuid);

  -- The seeded text-id driver moves to the other car; the uuid driver drives 5179KZ and owns the driver login.
  UPDATE fleet.drivers SET assigned_vehicle_id = 'mm_f01_1505lm', user_id = NULL WHERE id = 'testcopy-driver-fleet-row';
  INSERT INTO fleet.drivers (id, legacy_kv_id, organization_id, name, status, assigned_vehicle_id, uber_driver_id,
                             service_lines, user_id, payload_json)
  VALUES (v_drv, 'driver:' || v_drv, v_org, 'Kenny Gregory Rattray', 'active', v_veh, '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
          ARRAY['rideshare'], v_login,
          jsonb_build_object('id', v_drv, 'name', 'Kenny Gregory Rattray', 'uberDriverId', '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
                             'assignedVehicleId', v_veh, 'organizationId', v_org, 'status', 'active', 'userId', v_login))
  ON CONFLICT (id) DO NOTHING;
  UPDATE fleet.vehicles
     SET current_driver_id = v_drv,
         payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object('currentDriverId', v_drv, 'tollTagId', '212100286450')
   WHERE id = v_veh;

  -- Driver app context (cash receipts): the older key-value records it reads.
  INSERT INTO kv_store_37f42386 (key, value) VALUES
    ('driver:' || v_login, jsonb_build_object('id', v_drv, 'organizationId', v_org, 'assignedVehicleId', v_veh))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  INSERT INTO kv_store_37f42386 (key, value)
  SELECT 'vehicle:' || v_veh, payload_json || jsonb_build_object('id', v_veh, 'licensePlate', '5179KZ', 'status', 'Active')
  FROM fleet.vehicles WHERE id = v_veh
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO fleet.toll_tags (id, organization_id, tag_number, vehicle_id, legacy_kv_id, payload_json)
  VALUES ('mm_f01_tag_5179kz', v_org, '212100286450', v_veh, 'toll_tag:mm_f01_tag_5179kz',
          jsonb_build_object('id', 'mm_f01_tag_5179kz', 'tagNumber', '212100286450', 'provider', 'T-Tag',
                             'assignedVehicleId', v_veh, 'assignedVehicleName', '5179KZ', 'status', 'active', 'organizationId', v_org))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO places.place (id, place_type, name, lat, lng, status, pin_state, origin_app, attributes, parish) VALUES
    ('plz-portmore-west', 'toll_plaza', 'Portmore West', 17.9690, -76.8890, 'verified', 'confirmed', 'manual', '{"highway":"Highway 2000"}', 'St. Catherine'),
    ('plz-portmore-east', 'toll_plaza', 'Portmore East', 17.9720, -76.8600, 'verified', 'confirmed', 'manual', '{"highway":"Highway 2000"}', 'St. Catherine'),
    ('plz-st-west', 'toll_plaza', 'Spanish Town West', 18.0010, -76.9790, 'verified', 'confirmed', 'manual', '{"highway":"Highway 2000"}', 'St. Catherine'),
    ('plz-st-east', 'toll_plaza', 'Spanish Town East', 17.9930, -76.9300, 'verified', 'confirmed', 'manual', '{"highway":"Highway 2000"}', 'St. Catherine')
  ON CONFLICT (id) DO NOTHING;

  -- Pay periods so the calculator makes the weeks; one past Uber import so Step 1 shows the Uber card.
  INSERT INTO ledger.driver_financial_periods (organization_id, driver_id, period_anchor, period_end, timezone)
  SELECT v_org::uuid, v_drv, a::date, a::date + 6, 'America/Jamaica'
  FROM unnest(ARRAY['2026-08-24', '2026-08-31']) a
  WHERE NOT EXISTS (SELECT 1 FROM ledger.driver_financial_periods p WHERE p.driver_id = v_drv AND p.period_anchor = a::date);
  INSERT INTO fleet.import_batches (id, organization_id, file_name, upload_date, status, type, legacy_kv_id)
  VALUES ('mm_f01_prior_uber', v_org, 'prior-uber.csv', '2026-08-01', 'completed', 'merged_import', 'batch:mm_f01_prior_uber')
  ON CONFLICT DO NOTHING;
END $$;
COMMIT;
