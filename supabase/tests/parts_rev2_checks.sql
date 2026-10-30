-- Run on a Supabase branch, not production. The whole script rolls back.
BEGIN;

INSERT INTO public.engine_family (id, code) VALUES
  ('11111111-1111-4111-8111-111111111111', 'REV2-1NZ-FE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.vehicle_platform (id, code, maker) VALUES
  ('22222222-2222-4222-8222-222222222222', 'REV2-ZRR80G', 'Toyota')
ON CONFLICT (maker, code) DO NOTHING;

INSERT INTO public.vehicle_catalog (id, make, model, chassis_code, engine_code, production_start_year, production_end_year, platform_id, engine_family_id)
SELECT
  '33333333-3333-4333-8333-333333333333', 'Toyota', 'Noah', 'REV2-ZRR80G', 'REV2-1NZ-FE', 2012, 2019,
  (SELECT id FROM public.vehicle_platform WHERE code = 'REV2-ZRR80G'),
  (SELECT id FROM public.engine_family WHERE code = 'REV2-1NZ-FE')
WHERE NOT EXISTS (SELECT 1 FROM public.vehicle_catalog WHERE id = '33333333-3333-4333-8333-333333333333');

INSERT INTO public.part_category (id, slug, label, sort_order)
SELECT '44444444-4444-4444-8444-444444444444', 'rev2-engine', 'Rev2 engine', 1
WHERE NOT EXISTS (SELECT 1 FROM public.part_category WHERE slug = 'rev2-engine');

INSERT INTO public.part_interchange_group (id, code, fit_scope)
VALUES ('55555555-5555-4555-8555-555555555555', 'REV2-OIL', 'powertrain')
ON CONFLICT (code) DO NOTHING;

-- Schema-only CI has no garage seed. Coverage + engine-fit checks need the 10 core components.
INSERT INTO public.maintenance_service_categories (id, code, name, kind, icon_key, sort_order)
VALUES
  ('b1000000-0000-4000-8000-000000000004', 'rev2-brakes', 'Brakes', 'system', 'brakes', 4),
  ('b1000000-0000-4000-8000-000000000008', 'rev2-suspension', 'Suspension', 'system', 'suspension', 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, parent_id, icon_key, sort_order)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'rev2-eng-oil', 'Oil filter', 'component', 'ENG-OIL', NULL, 'wrench', 10),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'rev2-eng-spark', 'Spark plugs', 'component', 'ENG-SPARK', NULL, 'wrench', 20),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'rev2-eng-therm', 'Thermostat', 'component', 'ENG-THERM', NULL, 'wrench', 30),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'rev2-filt-air', 'Air filter', 'component', 'FILT-AIR', NULL, 'wrench', 40),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'rev2-hvac-cabin', 'Cabin filter', 'component', 'HVAC-CABIN', NULL, 'wrench', 50),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 'rev2-brk-pads', 'Brake pads', 'component', 'BRK-PADS', 'b1000000-0000-4000-8000-000000000004', 'brakes', 60),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 'rev2-brk-rotor', 'Brake rotor', 'component', 'BRK-ROTOR', 'b1000000-0000-4000-8000-000000000004', 'brakes', 70),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 'rev2-belt-serp', 'Serpentine belt', 'component', 'BELT-SERP', NULL, 'wrench', 80),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 'rev2-lgt-wiper', 'Wipers', 'component', 'LGT-WIPER', NULL, 'wrench', 90),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', 'rev2-sus-shock', 'Shock absorber', 'component', 'SUS-SHOCK', 'b1000000-0000-4000-8000-000000000008', 'suspension', 100)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id, maintenance_component_id)
SELECT
  '66666666-6666-4666-8666-666666666666',
  (SELECT id FROM public.part_category WHERE slug = 'rev2-engine'),
  'Rev2 oil filter', 'REV2-OIL-1', 'Toyota', 'oem',
  (SELECT id FROM public.part_interchange_group WHERE code = 'REV2-OIL'),
  (SELECT id FROM public.maintenance_service_categories WHERE op_code = 'ENG-OIL' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.part_master WHERE id = '66666666-6666-4666-8666-666666666666');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.part_master pm
    JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
    WHERE pm.id = '66666666-6666-4666-8666-666666666666' AND c.op_code = 'ENG-OIL'
  ) THEN
    RAISE EXCEPTION 'Rev2 oil filter must be linked to ENG-OIL before the engine fit rule';
  END IF;
END $$;

INSERT INTO public.part_listing (
  interchange_group_id, vehicle_catalog_id, year_from, evidence_url
)
SELECT
  (SELECT id FROM public.part_interchange_group WHERE code = 'REV2-OIL'),
  '33333333-3333-4333-8333-333333333333',
  2015,
  'https://example.com/rev2-oil'
WHERE NOT EXISTS (
  SELECT 1 FROM public.part_listing
  WHERE vehicle_catalog_id = '33333333-3333-4333-8333-333333333333'
    AND interchange_group_id = (SELECT id FROM public.part_interchange_group WHERE code = 'REV2-OIL')
);

DO $$
DECLARE
  tier_2017 int;
  tier_2012 int;
BEGIN
  SELECT p.tier INTO tier_2017
  FROM public.parts_for_vehicle('33333333-3333-4333-8333-333333333333', NULL, 2017) p
  LIMIT 1;
  IF tier_2017 IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Expected Tier 1 for a 2017 Toyota own-make engine part, got %', tier_2017;
  END IF;

  SELECT p.tier INTO tier_2012
  FROM public.parts_for_vehicle('33333333-3333-4333-8333-333333333333', NULL, 2012) p
  LIMIT 1;
  IF tier_2012 IS NOT NULL THEN
    RAISE EXCEPTION 'A 2015 facelift rule must stay hidden from a 2012 car';
  END IF;
END $$;

DO $$
BEGIN
  INSERT INTO public.part_interchange_group (code, fit_scope) VALUES ('REV2-BODY', 'body');
  BEGIN
    INSERT INTO public.interchange_fitment_rule (interchange_group_id, target_kind, engine_family_id, source)
    SELECT id, 'engine_family', '11111111-1111-4111-8111-111111111111', 'manual'
    FROM public.part_interchange_group WHERE code = 'REV2-BODY';
    RAISE EXCEPTION 'Engine rule on a body group should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%powertrain%' AND SQLERRM NOT ILIKE '%engine-family%' THEN
      RAISE;
    END IF;
  END;
END $$;

DO $$
DECLARE
  result jsonb;
  applied int;
  qty numeric;
  open_count int;
  wo1 uuid := '88888888-8888-4888-8888-888888888881';
  wo2 uuid := '88888888-8888-4888-8888-888888888882';
  line1 uuid := '88888888-8888-4888-8888-888888888883';
  line2 uuid := '88888888-8888-4888-8888-888888888884';
  line3 uuid := '88888888-8888-4888-8888-888888888885';
  comp uuid;
BEGIN
  SELECT public.import_parts_catalog_rows(
    jsonb_build_array(jsonb_build_object(
      'manufacturer', 'Toyota',
      'part_number', 'REV2-IMP-1',
      'part_name', 'Imported filter',
      'part_kind', 'oem',
      'category_slug', 'rev2-engine',
      'job', 'ENG-OIL',
      'vehicle', '33333333-3333-4333-8333-333333333333',
      'evidence_url', 'https://example.com/rev2-import',
      'year_from', 2015
    )),
    '77777777-7777-4777-8777-777777777777'
  ) INTO result;
  applied := (result->>'applied')::int;
  IF applied IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Import should apply 1 row, got % errors %', applied, result->>'errors';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    WHERE pm.oem_part_number = 'REV2-IMP-1'
      AND pm.catalog_decision = 'pending'
      AND pl.vehicle_catalog_id = '33333333-3333-4333-8333-333333333333'
  ) THEN
    RAISE EXCEPTION 'Import must write a pending listing';
  END IF;

  INSERT INTO public.org_part_stock (organization_id, part_id, qty)
  VALUES ('rev2-org', '66666666-6666-4666-8666-666666666666', 5);

  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, closed_at, odometer)
  VALUES (wo1, 'rev2-org', 'rev2-veh', 'completed', now(), 1000);

  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, part_id, qty, action)
  VALUES (line1, wo1, '66666666-6666-4666-8666-666666666666', 2, 'inspect');

  PERFORM public.apply_parts_usage_for_work_order(wo1);
  PERFORM public.apply_parts_usage_for_work_order(wo1);
  SELECT s.qty INTO qty FROM public.org_part_stock s
  WHERE s.organization_id = 'rev2-org' AND s.part_id = '66666666-6666-4666-8666-666666666666';
  IF qty IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'A second usage save must not drop stock twice, qty %', qty;
  END IF;

  SELECT id INTO comp FROM public.maintenance_service_categories WHERE op_code = 'ENG-OIL' LIMIT 1;
  IF comp IS NULL THEN
    RAISE EXCEPTION 'ENG-OIL component is missing';
  END IF;

  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, closed_at, odometer)
  VALUES
    (wo2, 'rev2-org', 'rev2-alert-veh', 'completed', now() - interval '1 day', 4000),
    ('88888888-8888-4888-8888-888888888886', 'rev2-org', 'rev2-alert-veh', 'completed', now() - interval '20 days', 1000);
  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, component_id, action)
  VALUES
    (line2, wo2, comp, 'replace'),
    (line3, '88888888-8888-4888-8888-888888888886', comp, 'replace');

  PERFORM public.refresh_repeat_part_alerts(10000, 90, 'rev2-alert-veh');
  SELECT count(*) INTO open_count FROM public.part_repeat_alert
  WHERE vehicle_id = 'rev2-alert-veh' AND component_id = comp AND status = 'open';
  IF open_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Expected one open repeat alert, got %', open_count;
  END IF;

  UPDATE public.part_repeat_alert
  SET status = 'dismissed', dismissed_at = now()
  WHERE vehicle_id = 'rev2-alert-veh' AND component_id = comp AND status = 'open';

  PERFORM public.refresh_repeat_part_alerts(10000, 90, 'rev2-alert-veh');
  SELECT count(*) INTO open_count FROM public.part_repeat_alert
  WHERE vehicle_id = 'rev2-alert-veh' AND component_id = comp AND status = 'open';
  IF open_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'A dismiss must stick, open alerts %', open_count;
  END IF;
END $$;

DO $$
DECLARE
  result jsonb;
  codes text[];
  qty numeric;
  decremented numeric;
  shelf_count int;
  wo_none uuid := '99999999-9999-4999-8999-999999999991';
  line_none uuid := '99999999-9999-4999-8999-999999999992';
  part_none uuid := '99999999-9999-4999-8999-999999999990';
  wo_short uuid := '99999999-9999-4999-8999-999999999993';
  line_short uuid := '99999999-9999-4999-8999-999999999994';
  engine_rules int;
BEGIN
  SELECT COALESCE(u.stock_decremented, -1) INTO decremented
  FROM public.maintenance_parts_usage u
  WHERE u.line_id = '88888888-8888-4888-8888-888888888883';
  IF decremented IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Usage must remember the 2 units taken from the shelf, got %', decremented;
  END IF;

  INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id)
  SELECT
    part_none,
    (SELECT id FROM public.part_category WHERE slug = 'rev2-engine'),
    'Rev2 no-shelf filter', 'REV2-NOSHELF', 'Toyota', 'oem',
    (SELECT id FROM public.part_interchange_group WHERE code = 'REV2-OIL')
  WHERE NOT EXISTS (SELECT 1 FROM public.part_master WHERE id = part_none);

  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status)
  VALUES (wo_none, 'rev2-org', 'rev2-veh', 'completed');
  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, part_id, qty, action)
  VALUES (line_none, wo_none, part_none, 1, 'replace');
  PERFORM public.apply_parts_usage_for_work_order(wo_none);
  SELECT count(*) INTO shelf_count FROM public.org_part_stock WHERE part_id = part_none;
  IF shelf_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'A job with no shelf row must not create one';
  END IF;
  PERFORM public.reverse_parts_usage_for_work_order(wo_none);
  SELECT count(*) INTO shelf_count FROM public.org_part_stock WHERE part_id = part_none;
  IF shelf_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Reversing a job that took nothing must not create shelf stock';
  END IF;

  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status)
  VALUES (wo_short, 'rev2-org', 'rev2-veh', 'completed');
  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, part_id, qty, action)
  VALUES (line_short, wo_short, '66666666-6666-4666-8666-666666666666', 5, 'replace');
  SELECT public.apply_parts_usage_for_work_order(wo_short) INTO result;
  IF COALESCE((result->'stockWarnings'->0->>'shortBy')::numeric, -1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Expected a short-by-2 warning, got %', result->'stockWarnings';
  END IF;
  SELECT s.qty INTO qty FROM public.org_part_stock s
  WHERE s.organization_id = 'rev2-org' AND s.part_id = '66666666-6666-4666-8666-666666666666';
  IF qty IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Short shelf should land on 0, got %', qty;
  END IF;
  SELECT u.stock_decremented INTO decremented FROM public.maintenance_parts_usage u WHERE u.line_id = line_short;
  IF decremented IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Only the 3 on the shelf should be recorded as taken, got %', decremented;
  END IF;
  PERFORM public.reverse_parts_usage_for_work_order(wo_short);
  SELECT s.qty INTO qty FROM public.org_part_stock s
  WHERE s.organization_id = 'rev2-org' AND s.part_id = '66666666-6666-4666-8666-666666666666';
  IF qty IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Undo must restore only the 3 taken, got %', qty;
  END IF;

  result := public.parts_fleet_coverage('[]'::jsonb);
  SELECT COALESCE(array_agg(code ORDER BY code), ARRAY[]::text[])
  INTO codes
  FROM (
    SELECT x->>'opCode' AS code
    FROM jsonb_array_elements(COALESCE(result->'components', '[]'::jsonb)) x
  ) s;
  IF codes IS DISTINCT FROM ARRAY[
    'BELT-SERP', 'BRK-PADS', 'BRK-ROTOR', 'ENG-OIL', 'ENG-SPARK',
    'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN', 'LGT-WIPER', 'SUS-SHOCK'
  ]::text[] THEN
    RAISE EXCEPTION 'Coverage list is not the 10 parts, got %', codes;
  END IF;
  IF result::text ILIKE '%SUS-INSP%' OR result::text ILIKE '%FLD-COOL%' OR result::text ILIKE '%TRN-FLUID%' THEN
    RAISE EXCEPTION 'Coverage still scores an inspection or fluid service';
  END IF;

  SELECT count(*) INTO engine_rules
  FROM public.interchange_fitment_rule r
  JOIN public.part_master pm ON pm.interchange_group_id = r.interchange_group_id
  JOIN public.maintenance_service_categories c ON c.id = pm.maintenance_component_id
  WHERE c.op_code IN ('FILT-AIR', 'BELT-SERP', 'ENG-O2', 'ENG-WPUMP')
    AND r.target_kind = 'engine_family';
  IF engine_rules IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Air, belt, oxygen sensor and water pump rules must not be engine rules, found %', engine_rules;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maintenance_service_categories
    WHERE op_code = 'BRK-ROTOR'
      AND (parent_id IS DISTINCT FROM 'b1000000-0000-4000-8000-000000000004'::uuid OR icon_key IS DISTINCT FROM 'brakes')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'BRK-ROTOR'
  ) THEN
    RAISE EXCEPTION 'Brake rotor must sit under Brakes with the brakes icon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maintenance_service_categories
    WHERE op_code = 'SUS-SHOCK'
      AND (parent_id IS DISTINCT FROM 'b1000000-0000-4000-8000-000000000008'::uuid OR icon_key IS DISTINCT FROM 'suspension')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.maintenance_service_categories WHERE op_code = 'SUS-SHOCK'
  ) THEN
    RAISE EXCEPTION 'Shock absorber must sit under Suspension with the suspension icon';
  END IF;
END $$;

ROLLBACK;
