-- Week Reconciliation done-tests: made-up companies on the LOCAL database only.
-- Password for every user: WrDoneLocal2026!
--   main company   f6020000-…-099  recon_v2 ON  (owner, manager, accountant, viewer)
--   switch-off co. f6020000-…-098  recon_v2 OFF (owner only)
-- 20 ended weeks of driver weeks (2 drivers, Rideshare), all open. The Deno seed
-- (scripts/seed-week-recon-done-tests.ts) then creates the week runs and publishes
-- every desk with the real server code.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org text := 'f6020000-0000-4000-8000-000000000099';
  v_org_uuid uuid := 'f6020000-0000-4000-8000-000000000099'::uuid;
  v_off_org_uuid uuid := 'f6020000-0000-4000-8000-000000000098'::uuid;
  v_owner uuid := 'b6020001-0000-4000-8000-000000000001'::uuid;
  v_manager uuid := 'b6020002-0000-4000-8000-000000000002'::uuid;
  v_accountant uuid := 'b6020003-0000-4000-8000-000000000003'::uuid;
  v_viewer uuid := 'b6020004-0000-4000-8000-000000000004'::uuid;
  v_off_owner uuid := 'b6020005-0000-4000-8000-000000000005'::uuid;
  -- Upload Co: its own company for the Uber upload done-test (week of 16 Mar 2026 = the sample Uber files).
  v_up_org text := 'f6020000-0000-4000-8000-000000000097';
  v_up_org_uuid uuid := 'f6020000-0000-4000-8000-000000000097'::uuid;
  v_up_owner uuid := 'b6020006-0000-4000-8000-000000000006'::uuid;
  -- Tag Co: its own company with one toll tag, so the Tag account step shows (done-test 9b).
  -- Kept apart: a toll tag makes the tag-account files required for every week of a company.
  v_tag_org text := 'f6020000-0000-4000-8000-000000000096';
  v_tag_org_uuid uuid := 'f6020000-0000-4000-8000-000000000096'::uuid;
  v_tag_owner uuid := 'b6020007-0000-4000-8000-000000000007'::uuid;
  v_pw text := crypt('WrDoneLocal2026!', gen_salt('bf'));
  v_last date := recon.last_ended_week_monday();
  v_week date;
  i int;
  d text;
  u record;
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      (v_owner, 'wr-done-owner@local.test', 'fleet_owner', v_org_uuid, 'WR Done Owner'),
      (v_manager, 'wr-done-manager@local.test', 'fleet_manager', v_org_uuid, 'WR Done Manager'),
      (v_accountant, 'wr-done-accountant@local.test', 'fleet_accountant', v_org_uuid, 'WR Done Accountant'),
      (v_viewer, 'wr-done-viewer@local.test', 'fleet_viewer', v_org_uuid, 'WR Done Viewer'),
      (v_off_owner, 'wr-done-switchoff@local.test', 'fleet_owner', v_off_org_uuid, 'WR Switch-off Owner'),
      (v_up_owner, 'wr-done-uploader@local.test', 'fleet_owner', v_up_org_uuid, 'WR Upload Owner'),
      (v_tag_owner, 'wr-done-tagco@local.test', 'fleet_owner', v_tag_org_uuid, 'WR Tag Owner')
    ) AS t(id, email, role, org, full_name)
  LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
      email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, v_pw, now(), '', '', '', '', '',
      jsonb_build_object(
        'provider', 'email', 'providers', jsonb_build_array('email'),
        'role', u.role, 'roles', jsonb_build_array(u.role),
        'organizationId', u.org::text, 'productLine', 'fleet'
      ),
      jsonb_build_object('full_name', u.full_name, 'name', u.full_name), now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      encrypted_password = EXCLUDED.encrypted_password,
      raw_app_meta_data = EXCLUDED.raw_app_meta_data,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      email_confirmed_at = now();

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    SELECT gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email),
      'email', u.email, now(), now(), now()
    WHERE NOT EXISTS (SELECT 1 FROM auth.identities x WHERE x.user_id = u.id AND x.provider = 'email');
  END LOOP;

  INSERT INTO public.organizations (id, owner_id, name, slug, product_line, status, service_lines)
  VALUES
    (v_org_uuid, v_owner, 'Week Recon Done Test Co', 'test-org-wr', 'fleet', 'active', ARRAY['rideshare']),
    (v_off_org_uuid, v_off_owner, 'Week Recon Switch-off Co', 'test-org-wr-off', 'fleet', 'active', ARRAY['rideshare']),
    (v_up_org_uuid, v_up_owner, 'Week Recon Upload Co', 'test-org-wr-up', 'fleet', 'active', ARRAY['rideshare']),
    (v_tag_org_uuid, v_tag_owner, 'Week Recon Tag Co', 'test-org-wr-tag', 'fleet', 'active', ARRAY['rideshare'])
  ON CONFLICT (id) DO UPDATE SET
    owner_id = EXCLUDED.owner_id,
    slug = EXCLUDED.slug,
    product_line = EXCLUDED.product_line,
    service_lines = EXCLUDED.service_lines;

  -- A fresh local copy has no role list; same rows as live.
  INSERT INTO platform.roles (name, display_name, description, level, product_key, is_system) VALUES
    ('fleet_viewer', 'Fleet Viewer', 'Read-only dashboard', 300, 'fleet', TRUE),
    ('fleet_accountant', 'Fleet Accountant', 'Financial read access', 500, 'fleet', TRUE),
    ('fleet_manager', 'Fleet Manager', 'Operates the fleet; cannot manage staff or the Fleet Tag', 700, 'fleet', TRUE),
    ('fleet_owner', 'Fleet Owner', 'Owns the fleet dashboard', 900, 'fleet', TRUE)
  ON CONFLICT (name) DO NOTHING;

  INSERT INTO platform.user_roles (user_id, role_id, scope_type, scope_id, granted_at, status)
  SELECT t.uid, r.id, 'organization', v_org_uuid, now(), 'active'
  FROM (VALUES (v_manager, 'fleet_manager'), (v_accountant, 'fleet_accountant'), (v_viewer, 'fleet_viewer')) AS t(uid, role_name)
  JOIN platform.roles r ON r.name = t.role_name
  WHERE NOT EXISTS (
    SELECT 1 FROM platform.user_roles ur
    WHERE ur.user_id = t.uid AND ur.role_id = r.id AND ur.scope_type = 'organization' AND ur.scope_id = v_org_uuid
  );

  -- Same as live (checked 2026-11-11): recon_wizard on for everyone — uploads register with
  -- Week Reconciliation through it (off = 501 on /recon/imports).
  INSERT INTO public.kv_store_37f42386 (key, value)
  VALUES ('feature_flag:recon_wizard', jsonb_build_object('enabled', true, 'updatedAt', now()::text))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  -- recon_v2 on for the main company only (server feature flag, kept in the KV store).
  INSERT INTO public.kv_store_37f42386 (key, value)
  VALUES (
    'feature_flag:recon_v2',
    jsonb_build_object('enabled', false, 'enabledForOrgs', jsonb_build_array(v_org, v_up_org, v_tag_org), 'updatedAt', now()::text)
  )
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  -- Toll charges post to the driver's money (production setting: "Sync charges to driver
  -- financials" on). Off, every Charge Driver stops on a "Charge sync is off" box.
  INSERT INTO public.kv_store_37f42386 (key, value)
  VALUES ('toll_reconciliation:settings', jsonb_build_object('driverTollChargeSyncEnabled', true))
  ON CONFLICT (key) DO UPDATE SET value = public.kv_store_37f42386.value || EXCLUDED.value;

  -- Driver records (names are read from here, not from the driver weeks).
  INSERT INTO public.kv_store_37f42386 (key, value) VALUES
    ('driver:wr-driver-1', jsonb_build_object('id', 'wr-driver-1', 'name', 'Test Driver One', 'organizationId', v_org)),
    ('driver:wr-driver-2', jsonb_build_object('id', 'wr-driver-2', 'name', 'Test Driver Two', 'organizationId', v_org))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  -- The company uses Uber (one old upload, no week), so every week needs its Uber file.
  INSERT INTO fleet.import_batches (id, organization_id, legacy_kv_id, file_name, upload_date, status, record_count, type, payload_json)
  VALUES ('wr-done-old-uber', v_org, 'batch:wr-done-old-uber', 'old_uber_upload.csv', now() - interval '400 days',
          'completed', 0, 'merged_import', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- Upload Co: uses Uber (one old upload) and has one open driver week, 16 Mar 2026 (Kenny, the sample files' driver).
  INSERT INTO fleet.import_batches (id, organization_id, legacy_kv_id, file_name, upload_date, status, record_count, type, payload_json)
  VALUES ('wr-up-old-uber', v_up_org, 'batch:wr-up-old-uber', 'old_uber_upload.csv', now() - interval '400 days',
          'completed', 0, 'merged_import', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.kv_store_37f42386 (key, value) VALUES
    ('driver:52ff47da-ef48-41b8-93d5-80a09b85ce5b', jsonb_build_object('id', '52ff47da-ef48-41b8-93d5-80a09b85ce5b', 'name', 'Kenny Gregory Rattray', 'organizationId', v_up_org, 'uberDriverId', '52ff47da-ef48-41b8-93d5-80a09b85ce5b'))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  INSERT INTO public.driver_financial_periods (id, organization_id, driver_id, period_anchor, period_end, status, metadata)
  VALUES (gen_random_uuid(), v_up_org_uuid, '52ff47da-ef48-41b8-93d5-80a09b85ce5b', DATE '2026-03-16', DATE '2026-03-22', 'open', jsonb_build_object('rideshareTripCount', 5));
  -- The sample trips' car and driver, stored like live: the car's id IS its plate (5179KZ),
  -- matched to a catalog row (trip saves refuse unmatched cars); the driver has a company.
  INSERT INTO public.vehicle_catalog (id, make, model, year)
  VALUES ('c6020000-0000-4000-8000-000000000001', 'Toyota', 'Sienta', 2016)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO fleet.vehicles (id, organization_id, license_plate, make, model, year, status, current_driver_id, vehicle_catalog_id, legacy_kv_id, payload_json, service_lines)
  VALUES ('5179KZ', v_up_org, '5179KZ', 'Toyota', 'Sienta', 2016, 'Active', '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
    'c6020000-0000-4000-8000-000000000001', 'vehicle:5179KZ',
    jsonb_build_object('id', '5179KZ', 'organizationId', v_up_org, 'licensePlate', '5179KZ', 'make', 'Toyota', 'model', 'Sienta',
      'year', 2016, 'status', 'Active', 'currentDriverId', '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
      'vehicle_catalog_id', 'c6020000-0000-4000-8000-000000000001', 'catalogStatus', 'matched', 'serviceLines', jsonb_build_array('rideshare')),
    ARRAY['rideshare'])
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.kv_store_37f42386 (key, value)
  SELECT 'vehicle:5179KZ', payload_json FROM fleet.vehicles WHERE id = '5179KZ'
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  INSERT INTO fleet.drivers (id, organization_id, name, uber_driver_id, legacy_kv_id, payload_json)
  VALUES ('52ff47da-ef48-41b8-93d5-80a09b85ce5b', v_up_org, 'Kenny Gregory Rattray', '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
    'driver:52ff47da-ef48-41b8-93d5-80a09b85ce5b',
    jsonb_build_object('id', '52ff47da-ef48-41b8-93d5-80a09b85ce5b', 'organizationId', v_up_org, 'name', 'Kenny Gregory Rattray',
      'uberDriverId', '52ff47da-ef48-41b8-93d5-80a09b85ce5b'))
  ON CONFLICT (id) DO NOTHING;

  -- Tag Co: one toll tag and one open driver week (9 Mar 2026 — no other test company uses it), nothing else.
  INSERT INTO fleet.toll_tags (id, organization_id, tag_number, vehicle_id, legacy_kv_id, payload_json)
  VALUES ('wr-tag-1', v_tag_org, 'WRTAG0001', NULL, 'toll_tag:wr-tag-1',
          jsonb_build_object('id', 'wr-tag-1', 'organizationId', v_tag_org, 'tagNumber', 'WRTAG0001', 'status', 'Active'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.driver_financial_periods (id, organization_id, driver_id, period_anchor, period_end, status, metadata)
  VALUES (gen_random_uuid(), v_tag_org_uuid, 'wr-tag-driver', DATE '2026-03-09', DATE '2026-03-15', 'open', jsonb_build_object('rideshareTripCount', 0));

  -- 20 ended weeks, oldest first; 2 drivers; all open.
  FOR i IN 0..19 LOOP
    v_week := v_last - (19 - i) * 7;
    FOREACH d IN ARRAY ARRAY['wr-driver-1', 'wr-driver-2'] LOOP
      -- The oldest week is the clean-up week: closed in Week Reconciliation by the Deno seed,
      -- so its driver weeks are closed too (the "close in order" rule reads these).
      INSERT INTO public.driver_financial_periods (id, organization_id, driver_id, period_anchor, period_end, status, closed_at, metadata)
      VALUES (
        gen_random_uuid(), v_org_uuid, d,
        v_week, v_week + 6, CASE WHEN i = 0 THEN 'closed' ELSE 'open' END,
        CASE WHEN i = 0 THEN now() ELSE NULL END,
        jsonb_build_object('rideshareTripCount', 5)
      );
    END LOOP;
  END LOOP;
END $$;

COMMIT;
