-- Parts auto-match proofs (AM-09). Rolls back; run after migrations M + T apply.
-- Fixtures use made-up part numbers (99465-B…, 9438867, Z0051M…) so they can never collide with real catalog rows.
BEGIN;

CREATE TEMP TABLE _am_proof (id int PRIMARY KEY, note text);

INSERT INTO _am_proof (id, note) VALUES (0, 'fixture bootstrap');

-- Fixture IDs (Roomy / Thor / Fiesta / Mazda2-style)
INSERT INTO public.engine_family (id, code) VALUES
  ('a9000001-0000-4000-8000-000000000001', 'AM-1NZ'),
  ('a9000001-0000-4000-8000-000000000002', 'AM-Fiesta'),
  ('a9000001-0000-4000-8000-000000000003', 'AM-Remote')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_platform (id, code, maker, label) VALUES
  ('a9000002-0000-4000-8000-000000000001', 'M900', 'Toyota', 'M900'),
  ('a9000002-0000-4000-8000-000000000002', 'B299', 'Ford', 'Fiesta'),
  ('a9000002-0000-4000-8000-000000000003', 'REMOTE', 'Mazda', 'Remote'),
  ('a9000002-0000-4000-8000-000000000004', 'DE', 'Mazda', 'Mazda2')
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, parent_id, icon_key, sort_order)
VALUES
  ('a9000003-0000-4000-8000-000000000001', 'am-brakes', 'Brakes', 'system', 'BRK', NULL, 'brakes', 1),
  ('a9000003-0000-4000-8000-000000000002', 'am-brk-pads', 'Brake pads', 'component', 'BRK-PADS', 'a9000003-0000-4000-8000-000000000001', 'brakes', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.part_category (id, slug, label, sort_order)
VALUES ('a9000004-0000-4000-8000-000000000001', 'am-brakes', 'Brakes', 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_catalog (id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id)
VALUES
  ('a9000005-0000-4000-8000-000000000001', 'Toyota', 'Roomy', 'M900A', 2016, 2022, 'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'),
  ('a9000005-0000-4000-8000-000000000002', 'Toyota', 'Thor', 'M900S', 2016, 2022, 'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'),
  ('a9000005-0000-4000-8000-000000000006', 'Toyota', 'Tank', 'M900A', 2016, 2020, 'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'),
  ('a9000005-0000-4000-8000-000000000003', 'Ford', 'Fiesta', 'B299', 2008, 2017, 'a9000002-0000-4000-8000-000000000002', 'a9000001-0000-4000-8000-000000000002'),
  ('a9000005-0000-4000-8000-000000000004', 'Mazda', 'Mazda2', 'DE', 2007, 2014, 'a9000002-0000-4000-8000-000000000004', 'a9000001-0000-4000-8000-000000000002'),
  ('a9000005-0000-4000-8000-000000000005', 'Mazda', 'Mazda3', 'BM', 2010, 2018, 'a9000002-0000-4000-8000-000000000003', 'a9000001-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
  ('a9000006-0000-4000-8000-000000000001', 'AM-ROOMY-PAD', 'body'),
  ('a9000006-0000-4000-8000-000000000002', 'AM-FIESTA-PAD', 'body'),
  ('a9000006-0000-4000-8000-000000000003', 'AM-BREMBO', 'body'),
  ('a9000006-0000-4000-8000-000000000004', 'AM-IDX-OLD', 'body'),
  ('a9000006-0000-4000-8000-000000000005', 'AM-IDX-NEW', 'body'),
  ('a9000006-0000-4000-8000-000000000006', 'AM-SENSOR-A', 'body'),
  ('a9000006-0000-4000-8000-000000000007', 'AM-SENSOR-B', 'body'),
  ('a9000006-0000-4000-8000-000000000008', 'AM-WVA24551', 'body')
ON CONFLICT (id) DO NOTHING;

UPDATE public.part_interchange_group
SET created_at = timestamptz '2021-06-01'
WHERE id = 'a9000006-0000-4000-8000-000000000004';
UPDATE public.part_interchange_group
SET created_at = timestamptz '2020-06-01'
WHERE id = 'a9000006-0000-4000-8000-000000000005';

-- Fleet/seed catalog may already use these mfr+norm keys; remove so fixture rows can insert (rolled back).
DELETE FROM public.part_master pm
WHERE (upper(coalesce(pm.manufacturer, '')), pm.oem_part_number_norm) IN (
  ('TOYOTA', '99465B1190'),
  ('TOYOTA', '99465B1191'),
  ('TOYOTA', '99465B1197'),
  ('TOYOTA', '99465B1198'),
  ('TOYOTA', '99465B1199'),
  ('FORD', '9438867'),
  ('BREMBO', 'Z0051M01J')
);

INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id, maintenance_component_id, catalog_decision, evidence_url)
VALUES
  ('a9000007-0000-4000-8000-000000000001', 'a9000004-0000-4000-8000-000000000001', 'Roomy pad', '99465-B1191', 'Toyota', 'oem', 'a9000006-0000-4000-8000-000000000001', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/r'),
  ('a9000007-0000-4000-8000-000000000002', 'a9000004-0000-4000-8000-000000000001', 'Fiesta pad', '9438867', 'Ford', 'oem', 'a9000006-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/f'),
  ('a9000007-0000-4000-8000-000000000003', 'a9000004-0000-4000-8000-000000000001', 'Brembo pad', 'Z0051M-01-J', 'Brembo', 'aftermarket', 'a9000006-0000-4000-8000-000000000003', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/b'),
  ('a9000007-0000-4000-8000-000000000004', 'a9000004-0000-4000-8000-000000000001', 'Idx old', 'IDX-OLD-1', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/io'),
  ('a9000007-0000-4000-8000-000000000005', 'a9000004-0000-4000-8000-000000000001', 'Idx new', 'IDX-NEW-1', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000005', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/in'),
  ('a9000007-0000-4000-8000-000000000006', 'a9000004-0000-4000-8000-000000000001', 'Sensor A', 'SENS-A', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000006', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/sa'),
  ('a9000007-0000-4000-8000-000000000007', 'a9000004-0000-4000-8000-000000000001', 'Sensor B', 'SENS-B', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000007', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/sb'),
  ('a9000007-0000-4000-8000-000000000008', 'a9000004-0000-4000-8000-000000000001', 'Fiesta twin OE', '99465-B1199', 'Toyota', 'oem', 'a9000006-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/ft'),
  ('a9000007-0000-4000-8000-000000000009', 'a9000004-0000-4000-8000-000000000001', 'WVA twin', 'WVA-24551', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000008', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/wt')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.part_oe_reference (
  id, part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url
) VALUES (
  'a900000a-0000-4000-8000-000000000001',
  'a9000007-0000-4000-8000-000000000008',
  'cross_ref',
  'Toyota',
  '99465-B1191',
  '99465B1191',
  'https://example.com/ft-xref'
) ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_oe_number (
  id, vehicle_catalog_id, maintenance_component_id, position, side,
  oe_brand, oe_number, oe_number_norm, evidence_url, year_from, year_to
) VALUES
  ('a9000008-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Toyota', '99465-B1190', '99465B1190', 'https://example.com/oe1', NULL, NULL),
  ('a9000008-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Toyota', '99465-B1191', '99465B1191', 'https://example.com/oe2', NULL, NULL),
  ('a9000008-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000003', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Ford', '9438867', '9438867', 'https://example.com/oe3', NULL, NULL),
  ('a9000008-0000-4000-8000-000000000004', 'a9000005-0000-4000-8000-000000000005', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Mazda', 'REMOTE-OE', 'REMOTEOE', 'https://example.com/oe4', 2010, 2014)
ON CONFLICT DO NOTHING;

INSERT INTO public.oe_number_supersession (oe_brand, from_norm, to_norm, fully_interchangeable, evidence_url)
VALUES
  ('Toyota', '99465B1190', '99465B1191', true, 'https://example.com/sup'),
  ('Toyota', '99465B1192', '99465B1193', false, 'https://example.com/sup2'),
  ('Toyota', '99465B1193', '99465B1194', false, 'https://example.com/sup3'),
  ('Toyota', '99465B1194', '99465B1195', false, 'https://example.com/sup4'),
  ('Toyota', '99465B1195', '99465B1196', false, 'https://example.com/sup5'),
  ('Toyota', '99465B1196', '99465B1197', false, 'https://example.com/sup6')
ON CONFLICT DO NOTHING;

INSERT INTO public.part_index_number (part_id, index_type, value, value_norm, wear_sensor, evidence_url)
VALUES
  ('a9000007-0000-4000-8000-000000000003', 'wva', '24551', '24551', 'none', 'https://example.com/wva'),
  ('a9000007-0000-4000-8000-000000000004', 'wva', '88801', '88801', 'none', 'https://example.com/wva2'),
  ('a9000007-0000-4000-8000-000000000005', 'wva', '88801', '88801', 'none', 'https://example.com/wva3'),
  ('a9000007-0000-4000-8000-000000000006', 'wva', '77701', '77701', 'separate', 'https://example.com/wva4'),
  ('a9000007-0000-4000-8000-000000000007', 'wva', '77701', '77701', 'none', 'https://example.com/wva5'),
  ('a9000007-0000-4000-8000-000000000009', 'wva', '24551', '24551', 'none', 'https://example.com/wva6')
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_component_link (
  id, platform_a_id, platform_b_id, scope, maintenance_component_id, position, side,
  platform_a_year_from, platform_a_year_to, platform_b_year_from, platform_b_year_to, evidence_url
) VALUES
  (
    'a9000009-0000-4000-8000-000000000001',
    'a9000002-0000-4000-8000-000000000001',
    'a9000002-0000-4000-8000-000000000002',
    'component',
    'a9000003-0000-4000-8000-000000000002',
    'front', 'left',
    2016, 2020, 2008, 2012,
    'https://example.com/pcl'
  ),
  (
    'a9000009-0000-4000-8000-000000000002',
    'a9000002-0000-4000-8000-000000000001',
    'a9000002-0000-4000-8000-000000000004',
    'component',
    'a9000003-0000-4000-8000-000000000002',
    'front', 'left',
    2016, 2020, 2007, 2012,
    'https://example.com/pcl-mazda2'
  )
ON CONFLICT DO NOTHING;

UPDATE public.platform_feature_flags SET enabled = true WHERE name = 'parts_auto_match_enabled';

-- Baseline recompute for Roomy OE group
SELECT public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');

-- Proof 1: Roomy tier 1 via supersession; both numbers in matched_keys
DO $$
DECLARE
  d record;
  p record;
BEGIN
  SELECT * INTO d FROM public.part_fit_derived
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND position = 'front' AND side = 'left';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proof 1 failed: missing derived fit on Roomy';
  END IF;
  IF d.reason_code IS DISTINCT FROM 'oe_number_superseded' THEN
    RAISE EXCEPTION 'Proof 1 failed: expected oe_number_superseded, got %', d.reason_code;
  END IF;
  IF NOT (d.matched_keys @> ARRAY['99465B1190', '99465B1191']) THEN
    RAISE EXCEPTION 'Proof 1 failed: matched_keys % missing chain numbers', d.matched_keys;
  END IF;
  SELECT * INTO p FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', 'a9000003-0000-4000-8000-000000000002', 2018) x
  WHERE x.tier = 1 AND x.part_id = 'a9000007-0000-4000-8000-000000000001' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proof 1 failed: parts_for_vehicle missing tier-1 Roomy pad';
  END IF;
END $$;

-- Proof 2: M900 sister car (no factory OE) tier 2 via Roomy listing; no copied listing on Tank
DO $$
BEGIN
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES ('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001', 'front', 'left', 'https://example.com/roomy-list', 'manual');
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000006', 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.tier = 2 AND p.via = 'sister' AND p.part_id = 'a9000007-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 2 failed: Tank (no OE) should see tier-2 sister fit from Roomy listing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000006'
      AND pl.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 2 failed: sister fit must not copy a listing onto Tank';
  END IF;
END $$;

-- Proof 3: Fiesta tier 1 direct OE match
DO $$
BEGIN
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000003', 'a9000003-0000-4000-8000-000000000002', 2012) p
    WHERE p.tier = 1 AND p.via = 'direct' AND p.part_id = 'a9000007-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'Proof 3 failed: Fiesta tier-1 OE match missing';
  END IF;
END $$;

-- Proof 4: Mazda2 tier 3 via platform link inside year overlap only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2016) p
    WHERE p.tier = 3 AND p.via = 'platform_link'
  ) THEN
    RAISE EXCEPTION 'Proof 4 failed: tier 3 should not apply outside link year overlap';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2010) p
    WHERE p.tier = 3 AND p.via = 'platform_link'
  ) THEN
    RAISE EXCEPTION 'Proof 4 failed: Mazda2 tier-3 missing inside overlap window';
  END IF;
END $$;

-- Proof 5: no tier 3 from tier 2 alone (sister on M900 family without tier-1 on M900 platform cars)
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-000000000009';
BEGIN
  INSERT INTO public.vehicle_platform (id, code, maker, label, parent_id, family_evidence_url)
  VALUES (
    'a9000002-0000-4000-8000-000000000007', 'M900C', 'Toyota', 'M900 child',
    'a9000002-0000-4000-8000-000000000001', 'https://example.com/am-proof5-family'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    'a9000005-0000-4000-8000-000000000007', 'Toyota', 'Proof5', 'M900C', 2016, 2022,
    'a9000002-0000-4000-8000-000000000007', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-NO-CHAIN', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    'a9000007-0000-4000-8000-00000000000a', 'a9000004-0000-4000-8000-000000000001',
    'No chain pad', 'NO-CHAIN-1', 'Test', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/nc'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES (v_grp, 'a9000005-0000-4000-8000-000000000007', 'front', 'left', 'https://example.com/nc-list', 'manual');
  PERFORM public.part_match_recompute(v_grp, NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000006', 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.tier = 2 AND p.via = 'sister' AND p.interchange_group_id = v_grp
  ) THEN
    RAISE EXCEPTION 'Proof 5 failed: M900-family car should see tier-2 sister for child-platform listing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2010) p
    WHERE p.tier = 3 AND p.via = 'platform_link' AND p.interchange_group_id = v_grp
  ) THEN
    RAISE EXCEPTION 'Proof 5 failed: tier-2 sister alone must not become tier 3 on linked Mazda2';
  END IF;
END $$;

-- Proof 5b: needs_checking tier 1 on M900 yields needs_checking tier 3 on Mazda2 (no live listing shadowing)
DO $$
BEGIN
  DELETE FROM public.part_listing
  WHERE interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND origin = 'manual'
    AND evidence_url = 'https://example.com/roomy-list';
  UPDATE public.part_fit_derived SET status = 'needs_checking'
  WHERE interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND vehicle_catalog_id IN (
      'a9000005-0000-4000-8000-000000000001',
      'a9000005-0000-4000-8000-000000000002',
      'a9000005-0000-4000-8000-000000000006'
    );
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2010) p
    WHERE p.tier = 3 AND p.match_status = 'needs_checking'
  ) THEN
    RAISE EXCEPTION 'Proof 5b failed: needs_checking tier-1 should propagate to tier-3';
  END IF;
  UPDATE public.part_fit_derived SET status = 'live'
  WHERE interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND vehicle_catalog_id IN (
      'a9000005-0000-4000-8000-000000000001',
      'a9000005-0000-4000-8000-000000000002',
      'a9000005-0000-4000-8000-000000000006'
    );
END $$;

-- Proof 6: WVA index merge (Brembo + twin) + tier-4 badge on moved part
DO $$
DECLARE
  v_grp_b uuid;
  v_grp_w uuid;
  v_log_count integer;
  v_moved uuid;
BEGIN
  PERFORM public.part_match_index_rules(NULL);
  SELECT interchange_group_id INTO v_grp_b FROM public.part_master WHERE id = 'a9000007-0000-4000-8000-000000000003';
  SELECT interchange_group_id INTO v_grp_w FROM public.part_master WHERE id = 'a9000007-0000-4000-8000-000000000009';
  IF v_grp_b IS NULL OR v_grp_w IS NULL OR v_grp_b IS DISTINCT FROM v_grp_w THEN
    RAISE EXCEPTION 'Proof 6 failed: Brembo and WVA twin should share one interchange group after index merge';
  END IF;
  SELECT count(*) INTO v_log_count
  FROM public.interchange_group_merge_log m
  WHERE m.reversed_at IS NULL
    AND m.matched_key = 'wva:24551'
    AND m.part_id IN (
      'a9000007-0000-4000-8000-000000000003',
      'a9000007-0000-4000-8000-000000000009'
    );
  IF v_log_count <> 1 THEN
    RAISE EXCEPTION 'Proof 6 failed: expected exactly one open merge log for WVA 24551 (got %)', v_log_count;
  END IF;
  SELECT m.part_id INTO v_moved
  FROM public.interchange_group_merge_log m
  WHERE m.reversed_at IS NULL
    AND m.matched_key = 'wva:24551'
    AND m.part_id IN (
      'a9000007-0000-4000-8000-000000000003',
      'a9000007-0000-4000-8000-000000000009'
    )
  LIMIT 1;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES (
    v_grp_b,
    'a9000005-0000-4000-8000-000000000001',
    'front',
    'left',
    'https://example.com/brembo-roomy-p6',
    'manual'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
    WHERE p.part_id = v_moved
      AND p.tier = 4
      AND p.part_badge_code = 'index_badge'
      AND p.part_badge_params ? 'merge_log_id'
  ) THEN
    RAISE EXCEPTION 'Proof 6 failed: tier-4 index badge missing on moved part %', v_moved;
  END IF;
END $$;

-- Proof 6b: two empty groups merge into the older group (created_at, not id)
DO $$
DECLARE v_grp uuid;
BEGIN
  SELECT interchange_group_id INTO v_grp FROM public.part_master WHERE id = 'a9000007-0000-4000-8000-000000000004';
  IF v_grp IS DISTINCT FROM 'a9000006-0000-4000-8000-000000000005' THEN
    RAISE EXCEPTION 'Proof 6b failed: older created_at group should win merge (got %)', v_grp;
  END IF;
END $$;

-- Proof 7: sensor mismatch opens index_wear_sensor conflict
DO $$
BEGIN
  PERFORM public.part_match_index_rules('a9000006-0000-4000-8000-000000000006');
  IF NOT EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'index_wear_sensor' AND c.part_id = 'a9000007-0000-4000-8000-000000000006' AND c.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Proof 7 failed: expected open index_wear_sensor conflict';
  END IF;
END $$;

-- Proof 8: Thor 4WD exclusion blocks sister listing
DO $$
BEGIN
  INSERT INTO public.part_listing_exclusion (
    interchange_group_id, vehicle_catalog_id, position, side, reason, evidence_url, source
  ) VALUES (
    'a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000002',
    NULL, NULL, '4WD variant excluded', 'https://example.com/ex8', 'manual'
  );
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.tier = 2 AND p.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 8 failed: exclusion should block Thor sister fit';
  END IF;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000002');
  DELETE FROM public.part_listing_exclusion
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND reason = '4WD variant excluded';
END $$;

-- Proof 9: both covers left
DO $$
BEGIN
  IF NOT public.part_side_covers('front', 'both', 'front', 'left') THEN
    RAISE EXCEPTION 'Proof 9 failed: both should cover left';
  END IF;
END $$;

-- Proof 10: idempotent recompute (full derived content, not row count)
DO $$
DECLARE h1 text; h2 text;
BEGIN
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT md5(coalesce(string_agg(sig, '' ORDER BY interchange_group_id, vehicle_catalog_id, position, side, row_id::text), ''))
  INTO h1
  FROM (
    SELECT
      d.id AS row_id,
      d.interchange_group_id,
      d.vehicle_catalog_id,
      d.position,
      d.side,
      md5((to_jsonb(d) - 'computed_at')::text) AS sig
    FROM public.part_fit_derived d
  ) q;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT md5(coalesce(string_agg(sig, '' ORDER BY interchange_group_id, vehicle_catalog_id, position, side, row_id::text), ''))
  INTO h2
  FROM (
    SELECT
      d.id AS row_id,
      d.interchange_group_id,
      d.vehicle_catalog_id,
      d.position,
      d.side,
      md5((to_jsonb(d) - 'computed_at')::text) AS sig
    FROM public.part_fit_derived d
  ) q;
  IF h1 IS DISTINCT FROM h2 THEN
    RAISE EXCEPTION 'Proof 10 failed: derived content changed on second recompute';
  END IF;
END $$;

-- Proof 11: moving a part recomputes both interchange groups
DO $$
DECLARE g_old uuid := 'a9000006-0000-4000-8000-000000000005';
DECLARE g_new uuid := 'a9000006-0000-4000-8000-000000000004';
BEGIN
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000030', 'a9000005-0000-4000-8000-000000000003',
    'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Test', 'IDX-NEW-1', 'IDXNEW1', 'https://example.com/oe11'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(g_old, NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.interchange_group_id = g_old AND d.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'Proof 11 setup failed: old group needs derived row before move';
  END IF;
  UPDATE public.part_master SET interchange_group_id = g_new WHERE id = 'a9000007-0000-4000-8000-000000000005';
  PERFORM public.part_match_recompute(g_old, NULL);
  PERFORM public.part_match_recompute(g_new, NULL);
  IF EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.interchange_group_id = g_old) THEN
    RAISE EXCEPTION 'Proof 11 failed: old group should have no derived rows after move';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    JOIN public.part_master pm ON pm.interchange_group_id = d.interchange_group_id
    WHERE d.interchange_group_id = g_new AND pm.id = 'a9000007-0000-4000-8000-000000000005'
  ) THEN
    RAISE EXCEPTION 'Proof 11 failed: new group should have derived row for moved part';
  END IF;
END $$;

-- Proof 12 / 12a / 12b / 12c: suppression and un-suppression
DO $$
DECLARE v_listing uuid;
DECLARE v_derived uuid;
BEGIN
  SELECT id INTO v_derived FROM public.part_fit_derived
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000002' LIMIT 1;
  IF v_derived IS NULL THEN
    RAISE EXCEPTION 'Proof 12 failed: need Fiesta derived row';
  END IF;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES ('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003', 'front', 'both', 'https://example.com/sup12', 'manual')
  RETURNING id INTO v_listing;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  IF NOT EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.id = v_derived AND d.status = 'suppressed') THEN
    RAISE EXCEPTION 'Proof 12 failed: derived row should be suppressed when listing covers';
  END IF;
  UPDATE public.part_listing SET side = 'left' WHERE id = v_listing;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  IF NOT EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.id = v_derived AND d.status = 'suppressed') THEN
    RAISE EXCEPTION 'Proof 12b failed: derived stays suppressed when listing covers only one side';
  END IF;
  UPDATE public.part_listing SET side = 'right' WHERE id = v_listing;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  IF NOT EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.id = v_derived AND d.status IN ('live', 'needs_checking')) THEN
    RAISE EXCEPTION 'Proof 12a failed: derived should un-suppress when listing no longer covers';
  END IF;
  UPDATE public.part_listing SET side = 'both' WHERE id = v_listing;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  DELETE FROM public.part_listing WHERE id = v_listing;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  IF NOT EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.id = v_derived AND d.status IN ('live', 'needs_checking')) THEN
    RAISE EXCEPTION 'Proof 12c failed: derived should un-suppress when listing deleted';
  END IF;
END $$;

-- Proof 13: Keep survives import undo (auto_match_kept listing retained)
DO $$
DECLARE v_batch uuid := 'a900000a-0000-4000-8000-000000000001';
DECLARE v_listing uuid;
BEGIN
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at
  )
  VALUES (
    v_batch, 'AM-PROOF-13',
    public.part_import_template_area_id('vehicle_oe'),
    1, 'proof13.csv', 'proof13sha', 'imported', 'vehicle_oe', now()
  )
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_listing FROM public.part_listing
  WHERE origin = 'auto_match_kept' AND vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001' LIMIT 1;
  IF v_listing IS NULL THEN
    PERFORM public.part_match_derived_keep(
      (SELECT id FROM public.part_fit_derived
       WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001' LIMIT 1),
      NULL, 'proof 13 keep'
    );
    SELECT id INTO v_listing FROM public.part_listing
    WHERE origin = 'auto_match_kept' AND vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001' LIMIT 1;
  END IF;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side, oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000020', 'a9000005-0000-4000-8000-000000000003',
    'a9000003-0000-4000-8000-000000000002', 'rear', 'right', 'Ford', 'UNDO-OE', 'UNDOOE', 'https://example.com/undo13'
  );
  INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
  VALUES (
    v_batch, 1, 'vehicle_oe_number', 'a9000008-0000-4000-8000-000000000020', 'insert',
    public.part_import_row_snapshot('vehicle_oe_number', 'a9000008-0000-4000-8000-000000000020')
  );
  PERFORM public.part_import_undo(v_batch, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.part_listing WHERE id = v_listing AND origin = 'auto_match_kept') THEN
    RAISE EXCEPTION 'Proof 13 failed: Kept listing should survive undo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vehicle_oe_number WHERE id = 'a9000008-0000-4000-8000-000000000020') THEN
    RAISE EXCEPTION 'Proof 13 failed: batch OE row should be undone';
  END IF;
END $$;

-- Proof 14: Remove never comes back on recompute
DO $$
DECLARE
  v_conflict uuid;
  v_part uuid := 'a9000007-0000-4000-8000-000000000006';
  v_key text := 'wva:77701';
BEGIN
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'index_wear_sensor'
    AND c.part_id = v_part
    AND c.matched_key = v_key
    AND c.status = 'open';
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 14 setup failed: need open index_wear_sensor conflict wva:77701';
  END IF;
  PERFORM public.part_match_conflict_remove(v_conflict, NULL, 'proof 14 remove');
  PERFORM public.part_match_sync_conflicts(NULL, NULL);
  PERFORM public.part_match_index_rules('a9000006-0000-4000-8000-000000000006');
  IF EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'index_wear_sensor'
      AND c.part_id = v_part
      AND c.matched_key = v_key
      AND c.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Proof 14 failed: removed conflict reopened with same type/part/key';
  END IF;
END $$;

-- Proof 15 / 15b: undo drops non-kept rows; kept merge log survives
DO $$
DECLARE
  v_batch uuid := 'a900000a-0000-4000-8000-000000000002';
  v_merge uuid;
  v_conflict uuid;
  v_merge_row public.interchange_group_merge_log%ROWTYPE;
BEGIN
  SELECT id INTO v_merge FROM public.interchange_group_merge_log WHERE reversed_at IS NULL LIMIT 1;
  IF v_merge IS NULL THEN
    RAISE EXCEPTION 'Proof 15 setup failed: need merge log';
  END IF;
  SELECT * INTO v_merge_row FROM public.interchange_group_merge_log WHERE id = v_merge;
  INSERT INTO public.part_match_conflict (
    conflict_type, part_id, interchange_group_id, matched_key, detail, status, resolution_note, resolved_at, engine_version
  ) VALUES (
    'index_merge_proposed',
    v_merge_row.part_id,
    v_merge_row.from_group,
    v_merge_row.matched_key,
    jsonb_build_object(
      'moving_part_id', v_merge_row.part_id,
      'source_group_id', v_merge_row.from_group,
      'target_group_id', v_merge_row.to_group
    ),
    'kept',
    'proof 15b kept index merge',
    now(),
    public.part_match_engine_version()
  )
  RETURNING id INTO v_conflict;
  UPDATE public.interchange_group_merge_log
  SET conflict_id = v_conflict
  WHERE id = v_merge;
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at
  )
  VALUES (
    v_batch, 'AM-PROOF-15',
    public.part_import_template_area_id('vehicle_oe'),
    1, 'proof15.csv', 'proof15sha', 'imported', 'vehicle_oe', now()
  )
  ON CONFLICT DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side, oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000099', 'a9000005-0000-4000-8000-000000000003',
    'a9000003-0000-4000-8000-000000000002', 'front', 'right', 'Ford', 'TMP-OE', 'TMPOE', 'https://example.com/tmp'
  );
  INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
  VALUES (
    v_batch, 1, 'vehicle_oe_number', 'a9000008-0000-4000-8000-000000000099', 'insert',
    public.part_import_row_snapshot('vehicle_oe_number', 'a9000008-0000-4000-8000-000000000099')
  );
  INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
  VALUES (
    v_batch, 2, 'interchange_group_merge_log', v_merge, 'insert',
    public.part_import_row_snapshot('interchange_group_merge_log', v_merge)
  );
  PERFORM public.part_import_undo(v_batch, NULL);
  IF EXISTS (SELECT 1 FROM public.vehicle_oe_number WHERE id = 'a9000008-0000-4000-8000-000000000099') THEN
    RAISE EXCEPTION 'Proof 15 failed: undo should remove non-kept OE row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.interchange_group_merge_log m WHERE m.id = v_merge AND m.reversed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Proof 15b failed: Kept merge log must not be reversed on undo';
  END IF;
END $$;

-- Proof 16: Keep(A) excludes B when B has no manual listing
DO $$
DECLARE
  v_conflict uuid;
  v_thor_oe uuid := 'a9000008-0000-4000-8000-000000000032';
BEGIN
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_thor_oe, 'a9000005-0000-4000-8000-000000000002',
    'a9000003-0000-4000-8000-000000000002', 'rear', 'left',
    'Toyota', '99465-B1191', '99465B1191', 'https://example.com/oe16-thor'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000002');
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000002');
  PERFORM public.part_match_sync_conflicts(NULL, 'a9000005-0000-4000-8000-000000000002');
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND c.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002'
    AND c.vehicle_oe_number_id = v_thor_oe
    AND c.status = 'open';
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 16 setup failed: need oe_ambiguous on Thor rear OE for AM-ROOMY-PAD';
  END IF;
  PERFORM public.part_match_conflict_keep(v_conflict, NULL, 'keep roomy group');
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing_exclusion ex
    WHERE ex.interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
      AND ex.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002'
      AND ex.source = 'auto_match_removed'
  ) THEN
    RAISE EXCEPTION 'Proof 16 failed: Keep(A) should exclude group B on the car';
  END IF;
END $$;

-- Proof 17: superseded conflict reopens when match key changes
DO $$
DECLARE
  v_conflict uuid;
  v_thor_oe uuid := 'a9000008-0000-4000-8000-000000000032';
BEGIN
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND c.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002'
    AND c.vehicle_oe_number_id = v_thor_oe;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 17 setup failed: missing ambiguous conflict from proof 16';
  END IF;
  UPDATE public.part_match_conflict SET status = 'superseded', resolved_at = now() WHERE id = v_conflict;
  PERFORM public.part_match_sync_conflicts(NULL, 'a9000005-0000-4000-8000-000000000002');
  IF NOT EXISTS (SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status = 'superseded') THEN
    RAISE EXCEPTION 'Proof 17 failed: superseded conflict should stay superseded when OE unchanged';
  END IF;
  UPDATE public.vehicle_oe_number SET side = 'right' WHERE id = v_thor_oe;
  PERFORM public.part_match_sync_conflicts(NULL, 'a9000005-0000-4000-8000-000000000002');
  IF NOT EXISTS (SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status = 'open') THEN
    RAISE EXCEPTION 'Proof 17 failed: superseded conflict should reopen after key change';
  END IF;
  UPDATE public.vehicle_oe_number SET side = 'left' WHERE id = v_thor_oe;
END $$;

-- Proof 18: fit_source kept with via sister
DO $$
DECLARE v_derived uuid;
BEGIN
  SELECT id INTO v_derived FROM public.part_fit_derived
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND position = 'front'
    AND side = 'left';
  IF v_derived IS NULL THEN
    RAISE EXCEPTION 'Proof 18 setup failed: need Roomy pad derived row for group AM-ROOMY-PAD';
  END IF;
  PERFORM public.part_match_derived_keep(v_derived, NULL, 'proof 18');
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000006', 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.fit_source = 'kept'
      AND p.via = 'sister'
      AND p.part_id = 'a9000007-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 18 failed: expected kept sister fit on Tank (no OE)';
  END IF;
END $$;

-- Proof 19: duplicate whole-car exclusion refused
DO $$
BEGIN
  INSERT INTO public.part_listing_exclusion (
    interchange_group_id, vehicle_catalog_id, reason, evidence_url, source
  ) VALUES (
    'a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003',
    'whole car block', 'https://example.com/w1', 'manual'
  );
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO public.part_listing_exclusion (
      interchange_group_id, vehicle_catalog_id, reason, evidence_url, source
    ) VALUES (
      'a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003',
      'duplicate whole car', 'https://example.com/w2', 'manual'
    );
    RAISE EXCEPTION 'Proof 19 failed: duplicate whole-car exclusion should be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- Proof 20: engine version bump archives changed derived rows
DO $$
DECLARE
  v_before int;
  v_after int;
  v_updated int;
BEGIN
  DELETE FROM public.part_listing_exclusion
  WHERE interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
    AND vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003'
    AND reason = 'whole car block';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  UPDATE public.part_fit_derived SET engine_version = 0
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated < 1 THEN
    RAISE EXCEPTION 'Proof 20 setup failed: expected Fiesta derived rows to update for engine_version bump';
  END IF;
  -- Archiving now happens inside the recompute, scoped to the rows that run changes
  -- (audit §2 Archive), so drive it through a recompute, not a bare archive call.
  SELECT count(*) INTO v_before FROM public.part_fit_derived_archive
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003' AND archive_reason = 'changed';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_after FROM public.part_fit_derived_archive
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003' AND archive_reason = 'changed';
  IF v_after <= v_before THEN
    RAISE EXCEPTION 'Proof 20 failed: archive should gain rows on engine version bump';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_fit_derived
    WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003'
      AND interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
      AND engine_version IS DISTINCT FROM public.part_match_engine_version()
  ) THEN
    RAISE EXCEPTION 'Proof 20 failed: recompute should restamp derived rows with the current engine version';
  END IF;
END $$;

-- Proof 21: authenticated cannot read engine tables; app uses fleet-core edge routes (not direct SQL).
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM 1 FROM public.part_fit_derived LIMIT 1;
    RAISE EXCEPTION 'Proof 21 failed: authenticated read part_fit_derived';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018);
    RAISE EXCEPTION 'Proof 21 failed: authenticated must not execute parts_for_vehicle';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.part_match_health(NULL);
    RAISE EXCEPTION 'Proof 21 failed: authenticated must not execute part_match_health';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;

-- Proof 22: scale limits and log row counts
DO $$
DECLARE d record; l record;
BEGIN
  SELECT * INTO d FROM public.part_fit_derived
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND position = 'front'
    AND side = 'left';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proof 22 setup failed: need Roomy pad derived row';
  END IF;
  IF d.matched_keys IS NULL OR coalesce(array_length(d.matched_keys, 1), 0) > 6 THEN
    RAISE EXCEPTION 'Proof 22 failed: matched_keys must have at most 6 entries';
  END IF;
  UPDATE public.vehicle_oe_number
  SET oe_number = '99465-B1190A', oe_number_norm = '99465B1190A'
  WHERE id = 'a9000008-0000-4000-8000-000000000001';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT * INTO l FROM public.part_match_recompute_log
  WHERE scope_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND scope_vehicle_id = 'a9000005-0000-4000-8000-000000000001'
  ORDER BY started_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proof 22 setup failed: missing recompute log for Roomy pad scope';
  END IF;
  IF l.rows_scanned IS NULL OR l.rows_scanned <= 0 THEN
    RAISE EXCEPTION 'Proof 22 failed: scoped recompute must report rows_scanned > 0';
  END IF;
  IF coalesce(l.rows_added, 0) + coalesce(l.rows_changed, 0) + coalesce(l.rows_removed, 0) <= 0 THEN
    RAISE EXCEPTION 'Proof 22 failed: OE change must produce row counter movement';
  END IF;
  UPDATE public.vehicle_oe_number
  SET oe_number = '99465-B1190', oe_number_norm = '99465B1190'
  WHERE id = 'a9000008-0000-4000-8000-000000000001';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
END $$;

-- Proof 23: manual listing wins over auto exclude on ambiguous keep
DO $$
DECLARE v_conflict uuid;
BEGIN
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side, oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000021', 'a9000005-0000-4000-8000-000000000004',
    'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Toyota', '99465-B1191', '99465B1191', 'https://example.com/oe23'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES ('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000004', 'front', 'left', 'https://example.com/manual23', 'manual');
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000004');
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000004');
  PERFORM public.part_match_sync_conflicts(NULL, 'a9000005-0000-4000-8000-000000000004');
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous'
    AND c.status = 'open'
    AND c.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000004'
    AND c.interchange_group_id = 'a9000006-0000-4000-8000-000000000001';
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 23 setup failed: need ambiguous conflict';
  END IF;
  PERFORM public.part_match_conflict_keep(v_conflict, NULL, 'manual wins note');
  IF NOT EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'oe_ambiguous'
      AND c.status = 'superseded'
      AND c.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000004'
      AND c.interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
      AND c.resolution_note ILIKE '%Manual fit exists%'
  ) THEN
    RAISE EXCEPTION 'Proof 23 failed: manual listing should supersede sibling ambiguous row';
  END IF;
END $$;

-- Proof 24: position normalizer + backfill readers (FL, Front, unknown)
DO $$
DECLARE n record;
BEGIN
  SELECT * INTO n FROM public.part_norm_position('FL', NULL);
  IF n.norm_position IS DISTINCT FROM 'front' OR n.norm_side IS DISTINCT FROM 'left' THEN
    RAISE EXCEPTION 'Proof 24 failed: FL should normalize to front/left';
  END IF;
  SELECT * INTO n FROM public.part_norm_position('Front', NULL);
  IF n.norm_position IS DISTINCT FROM 'front' OR n.norm_side IS NOT NULL THEN
    RAISE EXCEPTION 'Proof 24 failed: Front should normalize to front/null side';
  END IF;
  SELECT * INTO n FROM public.part_norm_position('unknown', NULL);
  IF n.norm_position IS NOT NULL OR n.norm_side IS NOT NULL THEN
    RAISE EXCEPTION 'Proof 24 failed: unknown should normalize to null/null';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.part_norm_position_backfill_report LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM public.part_norm_position_backfill_summary LIMIT 1) THEN
    RAISE EXCEPTION 'Proof 24 failed: backfill report or summary missing';
  END IF;
END $$;

-- Proof 25: checkpoint resume advances (or completes when catalog fits one batch)
DO $$
DECLARE r1 uuid; r2 uuid; g1 uuid; g2 uuid;
DECLARE v_groups int;
BEGIN
  SELECT count(*)::int INTO v_groups FROM public.part_interchange_group;
  DELETE FROM public.part_match_recompute_checkpoint;
  PERFORM public.part_match_recompute(NULL, NULL);
  SELECT run_id, last_group_id INTO r1, g1 FROM public.part_match_recompute_checkpoint ORDER BY started_at DESC LIMIT 1;
  IF v_groups > 500 THEN
    PERFORM public.part_match_recompute(NULL, NULL);
    SELECT run_id, last_group_id INTO r2, g2 FROM public.part_match_recompute_checkpoint ORDER BY started_at DESC LIMIT 1;
    IF r1 IS NULL OR g1 IS NULL THEN
      RAISE EXCEPTION 'Proof 25 failed: checkpoint row missing after first nightly batch';
    END IF;
    IF r2 IS DISTINCT FROM r1 OR g2 IS NULL OR g2 <= g1 THEN
      RAISE EXCEPTION 'Proof 25 failed: checkpoint should resume same run and advance last_group_id';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.part_match_recompute_checkpoint c WHERE c.finished_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Proof 25 failed: small catalog nightly run should finish checkpoint';
  END IF;
END $$;

-- Proof 26: year intersection clips derived years to production window
DO $$
DECLARE d record;
BEGIN
  UPDATE public.vehicle_oe_number SET year_from = 2010, year_to = 2030
  WHERE id = 'a9000008-0000-4000-8000-000000000001';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT * INTO d FROM public.part_fit_derived
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND vehicle_oe_number_id = 'a9000008-0000-4000-8000-000000000001';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proof 26 setup failed: need Roomy derived row for clipped OE';
  END IF;
  IF d.year_from IS DISTINCT FROM 2016 OR d.year_to IS DISTINCT FROM 2022 THEN
    RAISE EXCEPTION 'Proof 26 failed: expected clipped years 2016-2022, got %-%', d.year_from, d.year_to;
  END IF;
END $$;

-- Proof 27: removed index merge proposal is not repeated
DO $$
DECLARE
  v_open int;
  v_conflict uuid;
  v_grp_a uuid := 'a9000006-0000-4000-8000-00000000000b';
  v_grp_b uuid := 'a9000006-0000-4000-8000-00000000000c';
  v_wva text := '99999';
  v_matched_key text := 'wva:99999';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
    (v_grp_a, 'AM-MERGE-A', 'body'),
    (v_grp_b, 'AM-MERGE-B', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    ('a9000007-0000-4000-8000-00000000000b', 'a9000004-0000-4000-8000-000000000001', 'Merge A', 'MRG-A', 'Test', 'aftermarket', v_grp_a, 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/ma'),
    ('a9000007-0000-4000-8000-00000000000c', 'a9000004-0000-4000-8000-000000000001', 'Merge B', 'MRG-B', 'Test', 'aftermarket', v_grp_b, 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/mb')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_index_number (part_id, index_type, value, value_norm, wear_sensor, evidence_url)
  VALUES
    ('a9000007-0000-4000-8000-00000000000b', 'wva', v_wva, v_wva, 'none', 'https://example.com/wva-ma'),
    ('a9000007-0000-4000-8000-00000000000c', 'wva', v_wva, v_wva, 'none', 'https://example.com/wva-mb')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES
    (v_grp_a, 'a9000005-0000-4000-8000-000000000001', 'rear', 'left', 'https://example.com/la', 'manual'),
    (v_grp_b, 'a9000005-0000-4000-8000-000000000003', 'rear', 'right', 'https://example.com/lb', 'manual');
  PERFORM public.part_match_index_rules(NULL);
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'index_merge_proposed'
    AND c.matched_key = v_matched_key
    AND c.status = 'open'
  LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 27 setup failed: need open index_merge_proposed for wva:99999';
  END IF;
  PERFORM public.part_match_conflict_remove(v_conflict, NULL, 'proof 27 remove');
  PERFORM public.part_match_index_rules(v_grp_a);
  PERFORM public.part_match_index_rules(NULL);
  SELECT count(*) INTO v_open FROM public.part_match_conflict
  WHERE conflict_type = 'index_merge_proposed' AND matched_key = v_matched_key AND status = 'open';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'Proof 27 failed: removed merge proposal came back open';
  END IF;
END $$;

-- Proof 28: forward-only supersession (non-interchangeable reverse does not match)
DO $$
DECLARE
  v_grp_x uuid := 'a9000006-0000-4000-8000-00000000000f';
  v_grp_y uuid := 'a9000006-0000-4000-8000-000000000010';
  v_car uuid := 'a9000005-0000-4000-8000-000000000003';
  v_oe_new uuid := 'a9000008-0000-4000-8000-000000000033';
  v_oe_old uuid := 'a9000008-0000-4000-8000-000000000034';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
    (v_grp_x, 'AM-SUP28-X', 'body'),
    (v_grp_y, 'AM-SUP28-Y', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    (
      'a9000007-0000-4000-8000-00000000000f', 'a9000004-0000-4000-8000-000000000001',
      'Sup28 old only', '99465-B1192', 'Toyota', 'oem', v_grp_x,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/p28x'
    ),
    (
      'a9000007-0000-4000-8000-000000000011', 'a9000004-0000-4000-8000-000000000001',
      'Sup28 new only', '99465-B1193', 'Toyota', 'oem', v_grp_y,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/p28y'
    )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_oe_new, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'right',
    'Toyota', '99465-B1193', '99465B1193', 'https://example.com/oe28-new-car'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp_x, v_car);
  IF EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_grp_x
      AND d.vehicle_catalog_id = v_car
  ) THEN
    RAISE EXCEPTION 'Proof 28 failed: car B1193 must not match group X part carrying only B1192';
  END IF;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_oe_old, v_car, 'a9000003-0000-4000-8000-000000000002', 'rear', 'left',
    'Toyota', '99465-B1192', '99465B1192', 'https://example.com/oe28-old-car'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp_y, v_car);
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_grp_y
      AND d.vehicle_catalog_id = v_car
      AND d.vehicle_oe_number_id = v_oe_old
      AND d.reason_code = 'oe_number_superseded'
      AND d.matched_keys @> ARRAY['99465B1192', '99465B1193']
  ) THEN
    RAISE EXCEPTION 'Proof 28 failed: car B1192 should forward-match group Y part carrying B1193';
  END IF;
END $$;

-- Proof 29: parts_for_vehicle match columns populated (listing + derived + universal)
DO $$
BEGIN
  INSERT INTO public.spec_key (key, label, value_type, component_id)
  VALUES (
    'am_proof29_spec', 'Proof 29 spec', 'text', 'a9000003-0000-4000-8000-000000000002'
  ) ON CONFLICT (key) DO NOTHING;
  PERFORM public.save_catalog_spec(jsonb_build_object(
    'variantId', 'a9000005-0000-4000-8000-000000000001',
    'specKey', 'am_proof29_spec',
    'value', 'proof29-val',
    'scope', 'variant',
    'evidenceUrl', 'https://example.com/am29-spec'
  ));
  PERFORM public.save_universal_part(jsonb_build_object(
    'specKey', 'am_proof29_spec',
    'specValue', 'proof29-val',
    'manufacturer', 'Test',
    'partNumber', 'AM29-UNIV',
    'name', 'Proof 29 universal',
    'evidenceUrl', 'https://example.com/am29-univ'
  ));
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000003', NULL, 2012) p
    WHERE p.match_status IS NULL OR p.fit_source IS NULL OR p.via IS NULL OR p.match_reason_code IS NULL
  ) THEN
    RAISE EXCEPTION 'Proof 29 failed: null match_* columns on parts_for_vehicle rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000003', 'a9000003-0000-4000-8000-000000000002', 2012) p
    WHERE p.tier = 1
  ) THEN
    RAISE EXCEPTION 'Proof 29 failed: expected at least one tier-1 row with populated match columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
    WHERE p.fit_source = 'universal'
      AND p.match_status IS NOT NULL
      AND p.via IS NOT NULL
      AND p.match_reason_code IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Proof 29 failed: expected universal fit row on Roomy with populated match columns';
  END IF;
END $$;

-- Proof 30 / 31: Front vs FRONT dedupe for listings and exclusions
DO $$
DECLARE v_cnt int;
DECLARE v_pos text;
DECLARE v_side text;
BEGIN
  DELETE FROM public.part_listing
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000004'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
    AND position = 'front' AND side IS NULL;
  SELECT n.norm_position, n.norm_side INTO v_pos, v_side
  FROM public.part_norm_position('Front', NULL) AS n;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES ('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000004', v_pos, v_side, 'https://example.com/d1', 'manual');
  SELECT n.norm_position, n.norm_side INTO v_pos, v_side
  FROM public.part_norm_position('FRONT', NULL) AS n;
  BEGIN
    INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
    VALUES ('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000004', v_pos, v_side, 'https://example.com/d2', 'manual');
    RAISE EXCEPTION 'Proof 30 failed: FRONT duplicate should not insert';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  SELECT count(*) INTO v_cnt FROM public.part_listing
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000004'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
    AND position = 'front' AND side IS NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Proof 30 failed: expected one normalized front listing, got %', v_cnt;
  END IF;
  DELETE FROM public.part_listing_exclusion
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000004'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000003'
    AND position = 'front' AND side IS NULL;
  SELECT n.norm_position, n.norm_side INTO v_pos, v_side
  FROM public.part_norm_position('Front', NULL) AS n;
  INSERT INTO public.part_listing_exclusion (
    interchange_group_id, vehicle_catalog_id, position, side, reason, evidence_url, source
  ) VALUES ('a9000006-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000004', v_pos, v_side, 'ex31', 'https://example.com/e31', 'manual');
  BEGIN
    INSERT INTO public.part_listing_exclusion (
      interchange_group_id, vehicle_catalog_id, position, side, reason, evidence_url, source
    ) VALUES ('a9000006-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000004', v_pos, v_side, 'ex31b', 'https://example.com/e31b', 'manual');
    RAISE EXCEPTION 'Proof 31 failed: duplicate front exclusion should not insert';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- Proof 32: XYZ maps to null and is reportable
DO $$
DECLARE n record;
BEGIN
  SELECT * INTO n FROM public.part_norm_position('XYZ', NULL);
  IF n.norm_position IS NOT NULL OR n.norm_side IS NOT NULL THEN
    RAISE EXCEPTION 'Proof 32 failed: XYZ should normalize to null';
  END IF;
END $$;

-- Proof 33: side requires position on listing
DO $$
BEGIN
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url)
  VALUES ('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000002', NULL, 'left', 'https://example.com/bad');
  RAISE EXCEPTION 'Proof 33 failed: side without position should be rejected';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

-- Proof 34: all 8 cells of the position/side category table normalize correctly
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT v.raw, v.exp_pos, v.exp_side FROM (VALUES
      ('FL', 'front', 'left'),
      ('FR', 'front', 'right'),
      ('RL', 'rear', 'left'),
      ('RR', 'rear', 'right'),
      ('Front Both', 'front', 'both'),
      ('BOTH', NULL, NULL),
      ('F', 'front', NULL),
      ('Rear', 'rear', NULL)
    ) AS v(raw, exp_pos, exp_side)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.part_norm_position(r.raw, NULL) n
      WHERE n.norm_position IS NOT DISTINCT FROM r.exp_pos
        AND n.norm_side IS NOT DISTINCT FROM r.exp_side
    ) THEN
      RAISE EXCEPTION 'Proof 34 failed: % did not normalize to %/%', r.raw, r.exp_pos, r.exp_side;
    END IF;
  END LOOP;
END $$;

-- Proof 35: scoped recompute finishes cleanly and materializes expected derived rows
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000eb';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000eb';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000eb';
  v_von uuid := 'a9000008-0000-4000-8000-0000000000eb';
  v_log record;
  v_derived int;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof35', 'P35', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR35', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001', 'Pr35 pad', 'PR35-OE', 'Toyota', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr35-part'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_von, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'left',
    'Toyota', 'PR35-OE', 'PR35OE', 'https://example.com/pr35-oe'
  ) ON CONFLICT (id) DO NOTHING;
  DELETE FROM public.part_fit_derived
  WHERE vehicle_catalog_id = v_car AND interchange_group_id = v_grp;
  PERFORM public.part_match_recompute(v_grp, v_car);
  SELECT count(*)::int INTO v_derived
  FROM public.part_fit_derived d
  WHERE d.vehicle_catalog_id = v_car AND d.interchange_group_id = v_grp;
  IF v_derived <> 1 THEN
    RAISE EXCEPTION 'Proof 35 failed: expected 1 derived row, got %', v_derived;
  END IF;
  SELECT * INTO v_log
  FROM public.part_match_recompute_log l
  WHERE l.scope_group_id = v_grp AND l.scope_vehicle_id = v_car
  ORDER BY l.started_at DESC
  LIMIT 1;
  IF NOT FOUND OR v_log.finished_at IS NULL OR v_log.error IS NOT NULL THEN
    RAISE EXCEPTION 'Proof 35 failed: scoped log must finish without error';
  END IF;
END $$;

-- Proof 36: one log row per buffered statement / scoped call
DO $$
DECLARE c_before int; c_after int;
BEGIN
  SELECT count(*) INTO c_before FROM public.part_match_recompute_log;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES
    ('a9000006-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000001', 'rear', 'left', 'https://example.com/l36a', 'manual'),
    ('a9000006-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000001', 'rear', 'right', 'https://example.com/l36b', 'manual');
  SELECT count(*) INTO c_after FROM public.part_match_recompute_log;
  IF c_after <> c_before + 1 THEN
    RAISE EXCEPTION 'Proof 36 failed: expected exactly one recompute log row for multi-row listing insert (before %, after %)', c_before, c_after;
  END IF;
END $$;

-- Proof 37: archive cause and superseded engine version
DO $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM public.part_fit_derived_archive
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003'
    AND archive_reason = 'changed'
  ORDER BY archived_at DESC
  LIMIT 1;
  IF NOT FOUND OR a.archive_reason IS NULL OR a.superseded_by_engine_version IS NULL THEN
    RAISE EXCEPTION 'Proof 37 failed: Fiesta archive row from proof 20 missing cause or superseded_by_engine_version';
  END IF;
  IF a.removal_cause IS NOT NULL THEN
    RAISE EXCEPTION 'Proof 37 failed: changed archive row should have null removal_cause';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived_archive ar
    WHERE ar.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002'
      AND ar.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
      AND ar.archive_reason = 'removed'
      AND ar.removal_cause = 'exclusion'
  ) THEN
    RAISE EXCEPTION 'Proof 37 failed: Thor exclusion removal archive missing (proof 8)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived_archive ar
    WHERE ar.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003'
      AND ar.archive_reason = 'removed'
      AND ar.removal_cause = 'exclusion'
  ) THEN
    RAISE EXCEPTION 'Proof 37 failed: Fiesta whole-car exclusion archive missing (proof 19)';
  END IF;
END $$;

-- Proof 38: index badge still on merged aftermarket part (moved side of WVA 24551 merge)
DO $$
DECLARE
  v_grp_b uuid;
  v_grp_w uuid;
  v_log_count integer;
  v_moved uuid;
BEGIN
  SELECT interchange_group_id INTO v_grp_b FROM public.part_master WHERE id = 'a9000007-0000-4000-8000-000000000003';
  SELECT interchange_group_id INTO v_grp_w FROM public.part_master WHERE id = 'a9000007-0000-4000-8000-000000000009';
  IF v_grp_b IS NULL OR v_grp_w IS NULL OR v_grp_b IS DISTINCT FROM v_grp_w THEN
    RAISE EXCEPTION 'Proof 38 failed: Brembo and WVA twin should still share one interchange group';
  END IF;
  SELECT count(*) INTO v_log_count
  FROM public.interchange_group_merge_log m
  WHERE m.reversed_at IS NULL
    AND m.matched_key = 'wva:24551'
    AND m.part_id IN (
      'a9000007-0000-4000-8000-000000000003',
      'a9000007-0000-4000-8000-000000000009'
    );
  IF v_log_count <> 1 THEN
    RAISE EXCEPTION 'Proof 38 failed: expected exactly one open merge log for WVA 24551 (got %)', v_log_count;
  END IF;
  SELECT m.part_id INTO v_moved
  FROM public.interchange_group_merge_log m
  WHERE m.reversed_at IS NULL
    AND m.matched_key = 'wva:24551'
    AND m.part_id IN (
      'a9000007-0000-4000-8000-000000000003',
      'a9000007-0000-4000-8000-000000000009'
    )
  ORDER BY m.part_id
  LIMIT 1;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  SELECT
    v_grp_b,
    'a9000005-0000-4000-8000-000000000001',
    'front',
    'left',
    'https://example.com/brembo-roomy-p6',
    'manual'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
      AND pl.evidence_url = 'https://example.com/brembo-roomy-p6'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
    WHERE p.part_id = v_moved
      AND p.part_badge_code = 'index_badge'
      AND p.part_badge_params ? 'merge_log_id'
  ) THEN
    RAISE EXCEPTION 'Proof 38 failed: index badge missing on moved part %', v_moved;
  END IF;
END $$;

-- Proof 39: Keep origin is auto_match_kept
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.origin = 'auto_match_kept'
      AND pl.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
      AND pl.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
      AND pl.position = 'front'
      AND pl.side = 'left'
  ) THEN
    RAISE EXCEPTION 'Proof 39 failed: missing auto_match_kept Roomy pad listing after Keep';
  END IF;
END $$;

-- Proof 40: XYZ-style unknown values do not map for front/rear raw strings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.part_norm_position('XYZ Front', NULL) n WHERE n.norm_position IS NOT NULL) THEN
    RAISE EXCEPTION 'Proof 40 failed: XYZ Front should not map to a position';
  END IF;
  IF EXISTS (SELECT 1 FROM public.part_norm_position('XYZ Rear', NULL) n WHERE n.norm_position IS NOT NULL) THEN
    RAISE EXCEPTION 'Proof 40 failed: XYZ Rear should not map to a position';
  END IF;
END $$;

-- Proof 41: left does not cover both
DO $$
BEGIN
  IF public.part_side_covers('front', 'left', 'front', 'both') THEN
    RAISE EXCEPTION 'Proof 41 failed: left must not cover both';
  END IF;
END $$;

-- Proof 42: 6-step supersession chain stops at 5 hops
DO $$
DECLARE mx int;
BEGIN
  INSERT INTO public.oe_number_supersession (oe_brand, from_norm, to_norm, fully_interchangeable, evidence_url)
  VALUES
    ('Toyota', '99465B1201', '99465B1202', false, 'https://example.com/s1201'),
    ('Toyota', '99465B1202', '99465B1203', false, 'https://example.com/s1202'),
    ('Toyota', '99465B1203', '99465B1204', false, 'https://example.com/s1203'),
    ('Toyota', '99465B1204', '99465B1205', false, 'https://example.com/s1204'),
    ('Toyota', '99465B1205', '99465B1206', false, 'https://example.com/s1205'),
    ('Toyota', '99465B1206', '99465B1207', false, 'https://example.com/s1206')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000011', 'a9000005-0000-4000-8000-000000000001',
    'a9000003-0000-4000-8000-000000000002', 'rear', 'left',
    'Toyota', '99465-B1201', '99465B1201', 'https://example.com/oe42'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    'a9000007-0000-4000-8000-00000000000d', 'a9000004-0000-4000-8000-000000000001',
    'Chain cap 6', '99465-B1206', 'Toyota', 'oem', 'a9000006-0000-4000-8000-000000000001',
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/ch6'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    'a9000007-0000-4000-8000-00000000000e', 'a9000004-0000-4000-8000-000000000001',
    'Chain cap 7', '99465-B1207', 'Toyota', 'oem', 'a9000006-0000-4000-8000-000000000001',
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/ch7'
  ) ON CONFLICT (id) DO NOTHING;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT max(coalesce(array_length(d.matched_keys, 1), 0)) INTO mx
  FROM public.part_fit_derived d
  WHERE d.vehicle_oe_number_id = 'a9000008-0000-4000-8000-000000000011'
    AND d.interchange_group_id = 'a9000006-0000-4000-8000-000000000001';
  IF mx IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Proof 42 failed: B1206 part should cap at 6 matched_keys entries, got %', mx;
  END IF;
  -- Both chain-cap parts share one interchange group, and part_fit_derived is
  -- per group, so test the chain itself: the 7th number must never be reached.
  IF EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.vehicle_oe_number_id = 'a9000008-0000-4000-8000-000000000011'
      AND d.matched_keys @> ARRAY['99465B1207']
  ) THEN
    RAISE EXCEPTION 'Proof 42 failed: B1207 part must not match (6 supersession steps exceeds cap)';
  END IF;
END $$;

-- Proof 43: Kept listing survives OE delete + full recompute
DO $$
DECLARE v_listing uuid;
BEGIN
  SELECT id INTO v_listing FROM public.part_listing
  WHERE origin = 'auto_match_kept'
    AND vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND position = 'front'
    AND side = 'left';
  IF v_listing IS NULL THEN
    RAISE EXCEPTION 'Proof 43 setup failed: need kept listing from proof 18';
  END IF;
  DELETE FROM public.vehicle_oe_number WHERE id = 'a9000008-0000-4000-8000-000000000001';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  IF NOT EXISTS (SELECT 1 FROM public.part_listing WHERE id = v_listing) THEN
    RAISE EXCEPTION 'Proof 43 failed: Kept listing removed after OE delete recompute';
  END IF;
END $$;

-- Proof 44: scoped recompute on two groups for one car (lock-order path)
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000ec';
  v_grp_a uuid := 'a9000006-0000-4000-8000-0000000000ec';
  v_grp_b uuid := 'a9000006-0000-4000-8000-0000000000ed';
  v_part_a uuid := 'a9000007-0000-4000-8000-0000000000ec';
  v_part_b uuid := 'a9000007-0000-4000-8000-0000000000ed';
  v_von_a uuid := 'a9000008-0000-4000-8000-0000000000ec';
  v_von_b uuid := 'a9000008-0000-4000-8000-0000000000ed';
  v_log record;
  v_cnt int;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Mazda', 'Proof44', 'P44', 2010, 2014,
    'a9000002-0000-4000-8000-000000000004', 'a9000001-0000-4000-8000-000000000002'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
    (v_grp_a, 'AM-PR44A', 'body'),
    (v_grp_b, 'AM-PR44B', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    (v_part_a, 'a9000004-0000-4000-8000-000000000001', 'Pr44A', 'PR44-A', 'Mazda', 'oem', v_grp_a,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr44a'),
    (v_part_b, 'a9000004-0000-4000-8000-000000000001', 'Pr44B', 'PR44-B', 'Mazda', 'oem', v_grp_b,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr44b')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES
    (v_von_a, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'left',
      'Mazda', 'PR44-A', 'PR44A', 'https://example.com/pr44-oe-a'),
    (v_von_b, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'right',
      'Mazda', 'PR44-B', 'PR44B', 'https://example.com/pr44-oe-b')
  ON CONFLICT (id) DO NOTHING;
  DELETE FROM public.part_fit_derived WHERE vehicle_catalog_id = v_car;
  PERFORM public.part_match_recompute(v_grp_b, v_car);
  PERFORM public.part_match_recompute(v_grp_a, v_car);
  SELECT count(*)::int INTO v_cnt
  FROM public.part_fit_derived d
  WHERE d.vehicle_catalog_id = v_car
    AND d.interchange_group_id IN (v_grp_a, v_grp_b);
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'Proof 44 failed: expected 2 derived rows on one car, got %', v_cnt;
  END IF;
  SELECT * INTO v_log
  FROM public.part_match_recompute_log l
  WHERE l.scope_group_id = v_grp_a AND l.scope_vehicle_id = v_car
  ORDER BY l.started_at DESC
  LIMIT 1;
  IF NOT FOUND OR v_log.finished_at IS NULL OR v_log.error IS NOT NULL THEN
    RAISE EXCEPTION 'Proof 44 failed: final scoped log must finish without error';
  END IF;
END $$;

-- Proof 45: admin_platforms shape (AM-22 list)
DO $$
DECLARE v jsonb;
BEGIN
  v := public.admin_platforms();
  IF NOT (v ? 'items') THEN RAISE EXCEPTION 'Proof 45 failed: admin_platforms missing items'; END IF;
  IF jsonb_array_length(v->'items') > 0 THEN
    IF NOT ((v->'items'->0) ? 'carCount') THEN RAISE EXCEPTION 'Proof 45 failed: carCount'; END IF;
  END IF;
END $$;

-- Proof 46: admin_platform link status (A3)
DO $$
DECLARE v jsonb;
BEGIN
  v := public.admin_platform('a9000002-0000-4000-8000-000000000001');
  IF v IS NULL THEN RAISE EXCEPTION 'Proof 46 failed: platform missing'; END IF;
  IF jsonb_array_length(v->'links') < 1 THEN RAISE EXCEPTION 'Proof 46 failed: expected link'; END IF;
  IF NOT ((v->'links'->0) ? 'conflict_status') THEN RAISE EXCEPTION 'Proof 46 failed: conflict_status'; END IF;
END $$;

-- Proof 47: catalog completeness keys (AM-25)
DO $$
DECLARE v jsonb;
BEGIN
  v := public.part_match_catalog_completeness();
  IF NOT (v ? 'vehicleCount' AND v ? 'vehiclesWithOeNumbers' AND v ? 'platformLinkCount' AND v ? 'partsWithSpecAttributes') THEN
    RAISE EXCEPTION 'Proof 47 failed: completeness keys';
  END IF;
END $$;

-- Proof 48: parts_for_vehicle exposes side and checking_note columns
DO $$
BEGIN
  UPDATE public.part_fit_derived
  SET checking_note = 'proof 48 note'
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
    AND checking_note IS NULL;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000003', 'a9000003-0000-4000-8000-000000000002', 2012) p
    WHERE p.derived_id IS NOT NULL
      AND p.side IS NOT NULL
      AND p.checking_note IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Proof 48 failed: expected derived_id, side, and checking_note on same PFV row';
  END IF;
END $$;

-- Proof 49: tier-3 respects platform link year window (regression guard)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2016) p
    WHERE p.tier = 3 AND p.via = 'platform_link'
  ) THEN
    RAISE EXCEPTION 'Proof 49 failed: tier 3 outside link overlap';
  END IF;
END $$;

-- Proof 50: admin_vehicle_oe_numbers includes supersession_note
DO $$
DECLARE v jsonb;
BEGIN
  v := public.admin_vehicle_oe_numbers('a9000005-0000-4000-8000-000000000001');
  IF jsonb_array_length(coalesce(v->'rows', '[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'Proof 50 setup failed: need OE rows';
  END IF;
  IF NOT ((v->'rows'->0) ? 'supersession_note') THEN
    RAISE EXCEPTION 'Proof 50 failed: supersession_note missing on OE payload';
  END IF;
END $$;

-- Proof 51: index merge + recompute without stack depth (X7)
DO $$
BEGIN
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000003');
  UPDATE public.part_master SET manufacturer = coalesce(manufacturer, 'Brembo') WHERE id = 'a9000007-0000-4000-8000-000000000003';
  PERFORM public.part_match_index_rules('a9000006-0000-4000-8000-000000000004');
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000004', NULL);
END $$;

-- Proof 52: variant_parts_readiness exists after Rev 13 (X8)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'variant_parts_readiness'
  ) THEN
    RAISE EXCEPTION 'Proof 52 failed: variant_parts_readiness materialized view missing';
  END IF;
  PERFORM public.refresh_variant_parts_readiness();
END $$;

-- Proof 53: tier-2 sister fit from derived tier-1 (no listing on source car)
DO $$
BEGIN
  DELETE FROM public.part_listing
  WHERE interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001';
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
      AND d.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
      AND d.status IN ('live', 'needs_checking')
  ) THEN
    RAISE EXCEPTION 'Proof 53 setup failed: need derived tier-1 on Roomy';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000006', 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.tier = 2
      AND p.via = 'sister'
      AND p.fit_source = 'derived'
      AND p.derived_id IS NOT NULL
      AND p.part_id = 'a9000007-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 53 failed: Tank should see tier-2 sister from Roomy derived fit';
  END IF;
END $$;

-- Proof 54: engine tier 3 respects listing year window
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000a0';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000a0';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-ENG-YEAR', 'powertrain')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001',
    'Engine year pad', 'ENG-YR-1', 'Test', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/engyr'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, year_from, year_to, evidence_url, origin
  ) VALUES (
    v_grp, 'a9000005-0000-4000-8000-000000000003', 'front', 'left', 2010, 2012,
    'https://example.com/engyr-list', 'manual'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2011) p
    WHERE p.tier = 3 AND p.via = 'engine' AND p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Proof 54 failed: Mazda2 should see engine tier 3 inside listing year window';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2016) p
    WHERE p.tier = 3 AND p.via = 'engine' AND p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Proof 54 failed: engine tier 3 must not apply outside listing year window';
  END IF;
END $$;

-- Proof 55: derived rows honor year, exclusion, applicability, and rejected catalog
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000a1';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000a1';
  v_tank uuid := 'a9000005-0000-4000-8000-000000000006';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-DER-GUARD', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001',
    'Derived guard pad', 'DER-G-1', 'Toyota', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/dg'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-0000000000a1', 'a9000005-0000-4000-8000-000000000001',
    'a9000003-0000-4000-8000-000000000002', 'front', 'left',
    'Toyota', 'DER-G-1', 'DERG1', 'https://example.com/dg-oe'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp, 'a9000005-0000-4000-8000-000000000001');
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_tank, 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.tier = 2 AND p.fit_source = 'derived' AND p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Proof 55 setup failed: Tank should see sister derived fit';
  END IF;
  UPDATE public.part_fit_derived
  SET year_from = 2019, year_to = NULL
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = v_grp;
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_tank, 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Proof 55 failed: derived year_from should block fit before window';
  END IF;
  UPDATE public.part_fit_derived
  SET year_from = NULL, year_to = NULL
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = v_grp;
  INSERT INTO public.part_listing_exclusion (
    interchange_group_id, vehicle_catalog_id, position, side, reason, evidence_url, source
  ) VALUES (
    v_grp, v_tank, 'front', 'left', 'proof 55 block', 'https://example.com/p55-ex', 'manual'
  );
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_tank, 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Proof 55 failed: exclusion should block sister derived fit';
  END IF;
  DELETE FROM public.part_listing_exclusion
  WHERE interchange_group_id = v_grp AND vehicle_catalog_id = v_tank AND reason = 'proof 55 block';
  INSERT INTO public.catalog_component_applicability (
    scope, vehicle_catalog_id, component_id, applicable, reason, evidence_url
  ) VALUES (
    'variant', v_tank, 'a9000003-0000-4000-8000-000000000002', false,
    'proof 55 NA', 'https://example.com/p55-na'
  );
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_tank, 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Proof 55 failed: variant not-applicable should block derived fit';
  END IF;
  DELETE FROM public.catalog_component_applicability
  WHERE scope = 'variant' AND vehicle_catalog_id = v_tank AND reason = 'proof 55 NA';
  UPDATE public.part_master SET catalog_decision = 'rejected' WHERE id = v_part;
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle(v_tank, 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.part_id = v_part
  ) THEN
    RAISE EXCEPTION 'Proof 55 failed: rejected catalog_decision should block derived fit';
  END IF;
  UPDATE public.part_master SET catalog_decision = 'confirmed' WHERE id = v_part;
END $$;

-- Proof 56: parts_for_vehicle returns rows in tier/name/position/side order
DO $$
DECLARE
  r record;
  prev_tier integer := NULL;
  prev_name text := NULL;
  prev_pos text := NULL;
  prev_side text := NULL;
  row_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.tier, p.part_name, p.position, p.side
    FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
  LOOP
    row_count := row_count + 1;
    IF prev_tier IS NOT NULL AND (
      r.tier < prev_tier
      OR (r.tier = prev_tier AND coalesce(r.part_name, '') < coalesce(prev_name, ''))
      OR (
        r.tier = prev_tier
        AND coalesce(r.part_name, '') = coalesce(prev_name, '')
        AND coalesce(r.position, '') < coalesce(prev_pos, '')
      )
      OR (
        r.tier = prev_tier
        AND coalesce(r.part_name, '') = coalesce(prev_name, '')
        AND coalesce(r.position, '') = coalesce(prev_pos, '')
        AND coalesce(r.side, '') < coalesce(prev_side, '')
      )
    ) THEN
      RAISE EXCEPTION 'Proof 56 failed: result set not ordered by tier, name, position, side';
    END IF;
    prev_tier := r.tier;
    prev_name := r.part_name;
    prev_pos := r.position;
    prev_side := r.side;
  END LOOP;
  IF row_count < 1 THEN
    RAISE EXCEPTION 'Proof 56 setup failed: expected at least one parts_for_vehicle row';
  END IF;
END $$;

-- Proof 57: index badge does not duplicate PFV rows when multiple merge logs exist
DO $$
DECLARE
  v_part uuid := 'a9000007-0000-4000-8000-000000000003';
  v_to uuid;
  v_rows integer;
BEGIN
  SELECT interchange_group_id INTO v_to FROM public.part_master WHERE id = v_part;
  INSERT INTO public.interchange_group_merge_log (
    part_id, from_group, to_group, rule, matched_key
  )
  SELECT v_part, 'a9000006-0000-4000-8000-000000000004', v_to, 'index', 'wva:proof57b'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.interchange_group_merge_log m
    WHERE m.part_id = v_part AND m.matched_key = 'wva:proof57b' AND m.reversed_at IS NULL
  );
  -- The part legitimately fits Roomy at several position/side slots (earlier
  -- proofs add them); the badge must not add a second row for any one slot.
  SELECT count(*)::integer - count(DISTINCT (p.position, p.side))::integer INTO v_rows
  FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
  WHERE p.part_id = v_part;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'Proof 57 failed: badge duplicated % PFV row(s) for the same position/side', v_rows;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
    WHERE p.part_id = v_part AND p.part_badge_code = 'index_badge'
  ) THEN
    RAISE EXCEPTION 'Proof 57 failed: index badge missing on deduped row';
  END IF;
END $$;

-- Proof 58: ungrouped part auto-merges into empty group (merge_log.from_group null)
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000b0';
  v_part_in uuid := 'a9000007-0000-4000-8000-0000000000b0';
  v_part_ungrp uuid := 'a9000007-0000-4000-8000-0000000000b1';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-UNGRP-TGT', 'body')
  ON CONFLICT (id) DO UPDATE SET fit_scope = EXCLUDED.fit_scope;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part_in, 'a9000004-0000-4000-8000-000000000001',
    'Grouped index twin', 'UNGRP-IN', 'Test', 'aftermarket', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/ungrp-in'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part_ungrp, 'a9000004-0000-4000-8000-000000000001',
    'Ungrouped index twin', 'UNGRP-OUT', 'Test', 'aftermarket', NULL,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/ungrp-out'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = NULL;
  INSERT INTO public.part_index_number (part_id, index_type, value, value_norm, wear_sensor, evidence_url)
  VALUES
    (v_part_in, 'wva', 'PROOF58', 'PROOF58', 'none', 'https://example.com/wva58a'),
    (v_part_ungrp, 'wva', 'PROOF58', 'PROOF58', 'none', 'https://example.com/wva58b')
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_index_rules(NULL);
  IF (SELECT interchange_group_id FROM public.part_master WHERE id = v_part_ungrp) IS DISTINCT FROM v_grp THEN
    RAISE EXCEPTION 'Proof 58 failed: ungrouped part should join empty target group';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.interchange_group_merge_log m
    WHERE m.part_id = v_part_ungrp
      AND m.to_group = v_grp
      AND m.from_group IS NULL
      AND m.reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Proof 58 failed: merge log should record null from_group';
  END IF;
END $$;

-- Proof 59: busy group + empty group opens index_merge_proposed (not silent merge)
DO $$
DECLARE
  v_grp_busy uuid := 'a9000006-0000-4000-8000-0000000000b4';
  v_grp_empty uuid := 'a9000006-0000-4000-8000-0000000000b5';
  v_part_busy uuid := 'a9000007-0000-4000-8000-0000000000b4';
  v_part_empty uuid := 'a9000007-0000-4000-8000-0000000000b5';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
    (v_grp_busy, 'AM-BUSY-MRG', 'body'),
    (v_grp_empty, 'AM-EMPTY-MRG', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    (v_part_busy, 'a9000004-0000-4000-8000-000000000001', 'Busy merge A', 'BUSY-M-A', 'Test', 'aftermarket', v_grp_busy, 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/busy-ma'),
    (v_part_empty, 'a9000004-0000-4000-8000-000000000001', 'Empty merge B', 'BUSY-M-B', 'Test', 'aftermarket', v_grp_empty, 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/busy-mb')
  ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin
  ) VALUES (
    v_grp_busy, 'a9000005-0000-4000-8000-000000000003', 'rear', 'right',
    'https://example.com/busy-mrg-list', 'manual'
  );
  INSERT INTO public.part_index_number (part_id, index_type, value, value_norm, wear_sensor, evidence_url)
  VALUES
    (v_part_busy, 'wva', 'PROOF59', 'PROOF59', 'none', 'https://example.com/wva59a'),
    (v_part_empty, 'wva', 'PROOF59', 'PROOF59', 'none', 'https://example.com/wva59b')
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_index_rules(NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'index_merge_proposed'
      AND c.status = 'open'
      AND c.matched_key = 'wva:PROOF59'
  ) THEN
    RAISE EXCEPTION 'Proof 59 failed: busy+empty pair should open index_merge_proposed';
  END IF;
  IF (SELECT interchange_group_id FROM public.part_master WHERE id = v_part_empty) IS DISTINCT FROM v_grp_empty THEN
    RAISE EXCEPTION 'Proof 59 failed: empty-group part must not auto-merge while peer group is busy';
  END IF;
END $$;

-- Proof 60: equal group created_at → lower group id wins empty merge
DO $$
DECLARE
  v_grp_win uuid := 'a9000006-0000-4000-8000-0000000000b2';
  v_grp_lose uuid := 'a9000006-0000-4000-8000-0000000000b3';
  v_part_win uuid := 'a9000007-0000-4000-8000-0000000000b2';
  v_part_lose uuid := 'a9000007-0000-4000-8000-0000000000b3';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope, created_at) VALUES
    (v_grp_win, 'AM-TIE-WIN', 'body', timestamptz '2024-06-01'),
    (v_grp_lose, 'AM-TIE-LOSE', 'body', timestamptz '2024-06-01')
  ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    (v_part_win, 'a9000004-0000-4000-8000-000000000001', 'Tie win part', 'TIE-WIN', 'Test', 'aftermarket', v_grp_win, 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/tie-win'),
    (v_part_lose, 'a9000004-0000-4000-8000-000000000001', 'Tie lose part', 'TIE-LOSE', 'Test', 'aftermarket', v_grp_lose, 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/tie-lose')
  ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.part_index_number (part_id, index_type, value, value_norm, wear_sensor, evidence_url)
  VALUES
    (v_part_win, 'wva', 'PROOF60', 'PROOF60', 'none', 'https://example.com/wva60a'),
    (v_part_lose, 'wva', 'PROOF60', 'PROOF60', 'none', 'https://example.com/wva60b')
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_index_rules(NULL);
  IF (SELECT interchange_group_id FROM public.part_master WHERE id = v_part_lose) IS DISTINCT FROM v_grp_win THEN
    RAISE EXCEPTION 'Proof 60 failed: part in higher-id group should move to lower-id survivor group';
  END IF;
  IF (SELECT interchange_group_id FROM public.part_master WHERE id = v_part_win) IS DISTINCT FROM v_grp_win THEN
    RAISE EXCEPTION 'Proof 60 failed: survivor-group part should stay on winning group';
  END IF;
END $$;

-- Proof 61: Keep must not overwrite import-origin listing
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000b6';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000b6';
  v_derived uuid;
  v_car uuid := 'a9000005-0000-4000-8000-000000000003';
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-KEEP-IMPORT', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001',
    'Import keep pad', 'IMP-KP-1', 'Ford', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/imp-kp'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-0000000000b6', v_car,
    'a9000003-0000-4000-8000-000000000002', 'rear', 'left',
    'Ford', 'IMP-KP-1', 'IMPKP1', 'https://example.com/imp-kp-oe'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp, v_car);
  SELECT id INTO v_derived FROM public.part_fit_derived
  WHERE vehicle_catalog_id = v_car
    AND interchange_group_id = v_grp
    AND position = 'rear'
    AND side = 'left';
  IF v_derived IS NULL THEN
    RAISE EXCEPTION 'Proof 61 setup failed: need derived fit on Fiesta';
  END IF;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin
  ) VALUES (
    v_grp, v_car, 'rear', 'left', 'https://example.com/imp-kp-list', 'import'
  )
  ON CONFLICT (interchange_group_id, vehicle_catalog_id, position, side) DO UPDATE
    SET origin = 'import', evidence_url = EXCLUDED.evidence_url;
  PERFORM public.part_match_derived_keep(v_derived, NULL, 'proof 61');
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.interchange_group_id = v_grp
      AND pl.vehicle_catalog_id = v_car
      AND pl.position = 'rear'
      AND pl.side = 'left'
      AND pl.origin = 'import'
  ) THEN
    RAISE EXCEPTION 'Proof 61 failed: Keep must not convert import listing to auto_match_kept';
  END IF;
END $$;

-- Proof 62: nightly recompute(NULL,NULL) drains every batch in one call
DO $$
DECLARE
  v_run uuid;
  v_logs integer;
BEGIN
  UPDATE public.part_match_recompute_checkpoint
  SET finished_at = now()
  WHERE finished_at IS NULL;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  SELECT
    ('a9000006-0000-4000-8000-' || lpad(to_hex(192 + gs), 12, '0'))::uuid,
    'AM-NB-' || gs,
    'body'
  FROM generate_series(0, 500) gs
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.part_match_recompute(NULL, NULL);
  SELECT run_id INTO v_run
  FROM public.part_match_recompute_checkpoint
  ORDER BY started_at DESC
  LIMIT 1;
  SELECT count(*)::integer INTO v_logs
  FROM public.part_match_recompute_log
  WHERE kind = 'nightly' AND run_id = v_run AND rows_scanned IS NOT NULL;
  IF v_logs < 2 THEN
    RAISE EXCEPTION 'Proof 62 failed: expected >=2 nightly batch logs in one recompute, got %', v_logs;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_match_recompute_checkpoint c
    WHERE c.run_id = v_run AND c.finished_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Proof 62 failed: checkpoint should finish in one nightly recompute';
  END IF;
END $$;

-- Proof 63: suppressed derived stays suppressed across back-to-back recomputes
DO $$
DECLARE
  v_status1 text;
  v_status2 text;
BEGIN
  -- Proof 43 deletes Roomy's front-left OE (…0001), so give this proof its own
  -- front-left OE matching the Roomy pad (99465-B1191) to create a derived row.
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-0000000000d0', 'a9000005-0000-4000-8000-000000000001',
    'a9000003-0000-4000-8000-000000000002', 'front', 'left',
    'Toyota', '99465-B1191', '99465B1191', 'https://example.com/oe63'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.part_listing (
    interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin
  )
  SELECT
    'a9000006-0000-4000-8000-000000000001',
    'a9000005-0000-4000-8000-000000000001',
    'front', 'left',
    'https://example.com/proof63-list',
    'manual'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
      AND pl.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
      AND pl.position = 'front'
      AND pl.side = 'left'
      AND pl.origin = 'manual'
  );
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT d.status INTO v_status1 FROM public.part_fit_derived d
  WHERE d.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND d.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND d.position = 'front' AND d.side = 'left';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT d.status INTO v_status2 FROM public.part_fit_derived d
  WHERE d.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND d.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND d.position = 'front' AND d.side = 'left';
  IF v_status1 IS DISTINCT FROM 'suppressed' OR v_status2 IS DISTINCT FROM 'suppressed' THEN
    RAISE EXCEPTION 'Proof 63 failed: expected suppressed after each recompute, got % then %', v_status1, v_status2;
  END IF;
END $$;

-- Proof 64: archive_derived_changes without scope is a no-op; scoped recompute archives only touched rows
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000c9';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000c9';
  v_car uuid := 'a9000005-0000-4000-8000-000000000003';
  v_other uuid := 'a9000005-0000-4000-8000-000000000004';
  v_derived uuid;
  v_other_derived uuid;
  v_arch_before integer;
  v_arch_after_global integer;
  v_arch_other integer;
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-ARCH-SCOPE', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001',
    'Archive scope pad', 'ARCH-SC-1', 'Ford', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/arch-sc'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-0000000000c9', v_car,
    'a9000003-0000-4000-8000-000000000002', 'front', 'left',
    'Ford', 'ARCH-SC-1', 'ARCHSC1', 'https://example.com/arch-sc-oe'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp, v_car);
  SELECT id INTO v_derived FROM public.part_fit_derived
  WHERE interchange_group_id = v_grp AND vehicle_catalog_id = v_car
    AND position = 'front' AND side = 'left';
  INSERT INTO public.part_fit_derived (
    interchange_group_id, vehicle_catalog_id, position, side, rule,
    matched_keys, vehicle_oe_number_id, part_oe_reference_ids,
    reason_code, reason_params, status, engine_version, computed_at
  )
  SELECT
    v_grp, v_other, 'front', 'left', 'oe_number',
    ARRAY['OTHER']::text[], NULL, ARRAY[]::uuid[],
    'manual_seed', '{}'::jsonb, 'live', public.part_match_engine_version() - 1, now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_grp AND d.vehicle_catalog_id = v_other
  )
  RETURNING id INTO v_other_derived;
  IF v_other_derived IS NULL THEN
    SELECT id INTO v_other_derived FROM public.part_fit_derived
    WHERE interchange_group_id = v_grp AND vehicle_catalog_id = v_other LIMIT 1;
  END IF;
  SELECT count(*)::integer INTO v_arch_before FROM public.part_fit_derived_archive;
  PERFORM public.part_match_archive_derived_changes(public.part_match_engine_version());
  SELECT count(*)::integer INTO v_arch_after_global FROM public.part_fit_derived_archive;
  IF v_arch_after_global <> v_arch_before THEN
    RAISE EXCEPTION 'Proof 64 failed: archive_derived_changes without scope must not write rows';
  END IF;
  UPDATE public.part_fit_derived
  SET engine_version = public.part_match_engine_version() - 1
  WHERE id = v_derived;
  PERFORM public.part_match_recompute(v_grp, v_car);
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived_archive ar
    WHERE ar.derived_id = v_derived AND ar.archive_reason IN ('changed', 'removed')
  ) THEN
    RAISE EXCEPTION 'Proof 64 failed: scoped recompute should archive the touched derived row';
  END IF;
  SELECT count(*)::integer INTO v_arch_other
  FROM public.part_fit_derived_archive ar
  WHERE ar.derived_id = v_other_derived
    AND ar.superseded_by_engine_version = public.part_match_engine_version();
  IF v_arch_other > 0 THEN
    RAISE EXCEPTION 'Proof 64 failed: out-of-scope derived row should not be archived on scoped recompute';
  END IF;
END $$;

-- Proof 65: group-scoped recompute includes derived-only cars (no OE on that variant)
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000ca';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000ca';
  v_roomy uuid := 'a9000005-0000-4000-8000-000000000001';
  v_tank uuid := 'a9000005-0000-4000-8000-000000000006';
  v_tank_derived uuid;
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-DER-ONLY', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001',
    'Derived only pad', 'DER-ONLY-1', 'Toyota', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/der-only'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-0000000000ca', v_roomy,
    'a9000003-0000-4000-8000-000000000002', 'rear', 'right',
    'Toyota', 'DER-ONLY-1', 'DERONLY1', 'https://example.com/der-only-oe'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.part_fit_derived (
    interchange_group_id, vehicle_catalog_id, position, side, rule,
    matched_keys, vehicle_oe_number_id, part_oe_reference_ids,
    reason_code, reason_params, status, engine_version, computed_at
  ) VALUES (
    v_grp, v_tank, 'rear', 'right', 'oe_number',
    ARRAY['DERONLY1']::text[], NULL, ARRAY[]::uuid[],
    'manual_seed', jsonb_build_object('proof', 65), 'live',
    public.part_match_engine_version() - 1, now()
  );
  SELECT id INTO v_tank_derived FROM public.part_fit_derived
  WHERE interchange_group_id = v_grp AND vehicle_catalog_id = v_tank
    AND position = 'rear' AND side = 'right';
  PERFORM public.part_match_recompute(v_grp, NULL);
  IF EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.id = v_tank_derived
  ) THEN
    RAISE EXCEPTION 'Proof 65 failed: derived-only Tank row should be removed when in group scope';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived_archive ar
    WHERE ar.derived_id = v_tank_derived
      AND ar.removal_cause = 'keys_no_longer_match'
  ) THEN
    RAISE EXCEPTION 'Proof 65 failed: derived-only car should be processed in group-scoped recompute';
  END IF;
END $$;

-- Proof 66: superseded oe_ambiguous reopens only on key / id / position / side change (0e0 fixtures)
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e0';
  v_grp_a uuid := 'a9000006-0000-4000-8000-0000000000e0';
  v_grp_b uuid := 'a9000006-0000-4000-8000-0000000000e1';
  v_part_a uuid := 'a9000007-0000-4000-8000-0000000000e0';
  v_part_b uuid := 'a9000007-0000-4000-8000-0000000000e1';
  v_von uuid := 'a9000008-0000-4000-8000-0000000000e0';
  v_conflict uuid;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof66', 'P66', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
    (v_grp_a, 'AM-PR66-A', 'body'),
    (v_grp_b, 'AM-PR66-B', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    (v_part_a, 'a9000004-0000-4000-8000-000000000001', 'Pr66 pad A', 'PR66-SHARE', 'Toyota', 'oem', v_grp_a,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr66-a'),
    (v_part_b, 'a9000004-0000-4000-8000-000000000001', 'Pr66 pad B', 'PR66-B', 'Toyota', 'oem', v_grp_b,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr66-b')
  ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  -- part_master_mfr_number_unique forbids two Toyota PR66-SHARE parts, so group B
  -- carries the shared number as a cross-reference (same pattern as the base fixture).
  INSERT INTO public.part_oe_reference (
    id, part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a900000a-0000-4000-8000-0000000000e0', v_part_b, 'cross_ref',
    'Toyota', 'PR66-SHARE', 'PR66SHARE', 'https://example.com/pr66-b-xref'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_von, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'left',
    'Toyota', 'PR66-SHARE', 'PR66SHARE', 'https://example.com/pr66-oe'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_sync_conflicts(NULL, v_car);
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous'
    AND c.vehicle_catalog_id = v_car
    AND c.vehicle_oe_number_id = v_von
    AND c.interchange_group_id = v_grp_a
  LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 66 setup failed: expected ambiguous conflict';
  END IF;
  UPDATE public.part_match_conflict SET status = 'superseded', resolved_at = now() WHERE id = v_conflict;
  PERFORM public.part_match_sync_conflicts(NULL, v_car);
  IF NOT EXISTS (SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status = 'superseded') THEN
    RAISE EXCEPTION 'Proof 66 failed: superseded conflict should stay closed when identity unchanged';
  END IF;
  UPDATE public.vehicle_oe_number SET side = 'right' WHERE id = v_von;
  PERFORM public.part_match_sync_conflicts(NULL, v_car);
  IF NOT EXISTS (SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status = 'open') THEN
    RAISE EXCEPTION 'Proof 66 failed: superseded conflict should reopen after side change';
  END IF;
  UPDATE public.vehicle_oe_number SET side = 'left' WHERE id = v_von;
END $$;

-- Proof 67: oe_number_supersession change scopes vehicles on the full chain (tail-only OE)
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e2';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000e2';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000e2';
  v_von uuid := 'a9000008-0000-4000-8000-0000000000e2';
  v_ev_before integer;
  v_ev_after integer;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof67', 'P67', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR67', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001', 'Pr67 tail pad', 'PR67-TAIL', 'Toyota', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr67-part'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_von, v_car, 'a9000003-0000-4000-8000-000000000002', 'rear', 'left',
    'Toyota', 'PR67-TAIL', 'PR67TAIL', 'https://example.com/pr67-oe'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.oe_number_supersession (oe_brand, from_norm, to_norm, fully_interchangeable, evidence_url)
  VALUES ('Toyota', 'PR67MID', 'PR67TAIL', true, 'https://example.com/pr67-mid-tail')
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp, v_car);
  SELECT d.engine_version INTO v_ev_before FROM public.part_fit_derived d
  WHERE d.interchange_group_id = v_grp AND d.vehicle_catalog_id = v_car
    AND d.position = 'rear' AND d.side = 'left';
  IF v_ev_before IS NULL THEN
    RAISE EXCEPTION 'Proof 67 setup failed: expected derived row on tail-only vehicle';
  END IF;
  -- A recompute stamps the same engine version (and now() is frozen in one
  -- transaction), so mark the row stale; only a recompute that scopes this car
  -- restamps it.
  UPDATE public.part_fit_derived SET engine_version = 0
  WHERE interchange_group_id = v_grp AND vehicle_catalog_id = v_car
    AND position = 'rear' AND side = 'left';
  INSERT INTO public.oe_number_supersession (oe_brand, from_norm, to_norm, fully_interchangeable, evidence_url)
  VALUES ('Toyota', 'PR67HEAD', 'PR67MID', true, 'https://example.com/pr67-head-mid')
  ON CONFLICT DO NOTHING;
  SELECT d.engine_version INTO v_ev_after FROM public.part_fit_derived d
  WHERE d.interchange_group_id = v_grp AND d.vehicle_catalog_id = v_car
    AND d.position = 'rear' AND d.side = 'left';
  IF v_ev_after IS DISTINCT FROM public.part_match_engine_version() THEN
    RAISE EXCEPTION 'Proof 67 failed: head supersession link should recompute tail-only vehicle via chain (engine_version %)', v_ev_after;
  END IF;
END $$;

-- Proof 68: part_supersession change scopes vehicles via OE chain, not derived rows only
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e3';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000e3';
  v_part_tail uuid := 'a9000007-0000-4000-8000-0000000000e3';
  v_part_mid uuid := 'a9000007-0000-4000-8000-0000000000e4';
  v_part_head uuid := 'a9000007-0000-4000-8000-0000000000e5';
  v_von uuid := 'a9000008-0000-4000-8000-0000000000e3';
  v_logs_before integer;
  v_logs_after integer;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof68', 'P68', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR68', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    (v_part_tail, 'a9000004-0000-4000-8000-000000000001', 'Pr68 tail', 'PR68-TAIL', 'Toyota', 'oem', v_grp,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr68-tail'),
    (v_part_mid, 'a9000004-0000-4000-8000-000000000001', 'Pr68 mid', 'PR68-MID', 'Toyota', 'oem', v_grp,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr68-mid'),
    (v_part_head, 'a9000004-0000-4000-8000-000000000001', 'Pr68 head', 'PR68-HEAD', 'Toyota', 'oem', v_grp,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr68-head')
  ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_von, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'right',
    'Toyota', 'PR68-TAIL', 'PR68TAIL', 'https://example.com/pr68-oe'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.part_supersession (old_part_id, new_part_id)
  VALUES (v_part_mid, v_part_tail)
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp, v_car);
  IF NOT EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.interchange_group_id = v_grp AND d.vehicle_catalog_id = v_car
      AND d.position = 'front' AND d.side = 'right'
  ) THEN
    RAISE EXCEPTION 'Proof 68 setup failed: expected derived fit on tail OE vehicle';
  END IF;
  SELECT count(*)::integer INTO v_logs_before FROM public.part_match_recompute_log;
  INSERT INTO public.part_supersession (old_part_id, new_part_id)
  VALUES (v_part_head, v_part_mid)
  ON CONFLICT DO NOTHING;
  SELECT count(*)::integer INTO v_logs_after FROM public.part_match_recompute_log;
  IF v_logs_after - v_logs_before <> 1 THEN
    RAISE EXCEPTION 'Proof 68 failed: part supersession head link should trigger one scoped recompute, got %', v_logs_after - v_logs_before;
  END IF;
END $$;

-- Proof 69: part_match_health(NULL) returns tierBreakdown when catalog rows exist
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e4';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000e4';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000e6';
  v_health jsonb;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof69', 'P69', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR69', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001', 'Pr69 pad', 'PR69-ONLY', 'Toyota', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr69-part'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-0000000000e4', v_car,
    'a9000003-0000-4000-8000-000000000002', 'front', 'left',
    'Toyota', 'PR69-ONLY', 'PR69ONLY', 'https://example.com/pr69-oe'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp, v_car);
  v_health := public.part_match_health(NULL);
  IF coalesce(v_health->'tierBreakdown', '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'Proof 69 failed: health with no car should include tierBreakdown';
  END IF;
END $$;

-- Proof 70: editing a listing position resolves its norm backfill report row
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e5';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000e5';
  v_listing uuid := 'a9000009-0000-4000-8000-0000000000e5';
  v_report uuid := 'a900000b-0000-4000-8000-0000000000e5';
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof70', 'P70', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR70', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_listing (
    id, interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin
  ) VALUES (
    v_listing, v_grp, v_car, 'front', 'left', 'https://example.com/pr70-list', 'manual'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_norm_position_backfill_report (
    id, table_name, row_id, original_position, original_side, reason
  ) VALUES (
    v_report, 'part_listing', v_listing, 'FR', NULL, 'unmapped'
  ) ON CONFLICT (id) DO NOTHING;
  UPDATE public.part_listing SET position = 'rear', side = 'left' WHERE id = v_listing;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_norm_position_backfill_report r
    WHERE r.id = v_report AND r.resolved_at IS NOT NULL AND r.resolution_source = 'listing_edit'
  ) THEN
    RAISE EXCEPTION 'Proof 70 failed: listing position edit should auto-resolve report row';
  END IF;
END $$;

-- Proof 71: part_match_derived_keep_batch runs one scoped recompute for all ids
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e6';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000e6';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000e7';
  v_von_l uuid := 'a9000008-0000-4000-8000-0000000000e6';
  v_von_r uuid := 'a9000008-0000-4000-8000-0000000000e7';
  v_der_l uuid;
  v_der_r uuid;
  v_logs_before integer;
  v_logs_after integer;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof71', 'P71', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR71', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001', 'Pr71 pad', 'PR71-DUAL', 'Toyota', 'oem', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr71-part'
  ) ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES
    (v_von_l, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'left',
      'Toyota', 'PR71-DUAL-L', 'PR71DUALL', 'https://example.com/pr71-oe-l'),
    (v_von_r, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'right',
      'Toyota', 'PR71-DUAL-R', 'PR71DUALR', 'https://example.com/pr71-oe-r')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.part_oe_reference (
    id, part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES
    ('a900000a-0000-4000-8000-0000000000e6', v_part, 'cross_ref', 'Toyota', 'PR71-DUAL-L', 'PR71DUALL', 'https://example.com/pr71-x-l'),
    ('a900000a-0000-4000-8000-0000000000e7', v_part, 'cross_ref', 'Toyota', 'PR71-DUAL-R', 'PR71DUALR', 'https://example.com/pr71-x-r')
  ON CONFLICT DO NOTHING;
  PERFORM public.part_match_recompute(v_grp, v_car);
  SELECT id INTO v_der_l FROM public.part_fit_derived d
  WHERE d.interchange_group_id = v_grp AND d.vehicle_catalog_id = v_car AND d.position = 'front' AND d.side = 'left';
  SELECT id INTO v_der_r FROM public.part_fit_derived d
  WHERE d.interchange_group_id = v_grp AND d.vehicle_catalog_id = v_car AND d.position = 'front' AND d.side = 'right';
  IF v_der_l IS NULL OR v_der_r IS NULL THEN
    RAISE EXCEPTION 'Proof 71 setup failed: expected two derived rows';
  END IF;
  SELECT count(*)::integer INTO v_logs_before FROM public.part_match_recompute_log;
  PERFORM public.part_match_derived_keep_batch(ARRAY[v_der_l, v_der_r], NULL, 'proof 71 batch keep');
  SELECT count(*)::integer INTO v_logs_after FROM public.part_match_recompute_log;
  IF v_logs_after - v_logs_before <> 1 THEN
    RAISE EXCEPTION 'Proof 71 failed: keep_batch should add exactly one recompute log, got %', v_logs_after - v_logs_before;
  END IF;
END $$;

-- Proof 72: remap "Any" saves null on listing (AM-25)
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e8';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000e8';
  v_listing uuid := 'a9000009-0000-4000-8000-0000000000e8';
  v_report uuid := 'a900000b-0000-4000-8000-0000000000e8';
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof72', 'P72', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR72', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_listing (
    id, interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin
  ) VALUES (
    v_listing, v_grp, v_car, 'front', 'left', 'https://example.com/pr72-list', 'manual'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_norm_position_backfill_report (
    id, table_name, row_id, original_position, original_side, reason
  ) VALUES (
    v_report, 'part_listing', v_listing, 'XYZ', NULL, 'unmapped'
  ) ON CONFLICT (id) DO NOTHING;
  PERFORM public.part_norm_position_report_remap(v_report, NULL, NULL, NULL);
  IF EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.id = v_listing AND (pl.position IS NOT NULL OR pl.side IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Proof 72 failed: Any remap should set position and side to null';
  END IF;
END $$;

-- Proof 73: confirm merge deletes duplicate listing (AM-25)
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000e9';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000e9';
  v_survivor uuid := 'a9000009-0000-4000-8000-0000000000e9';
  v_drop uuid := 'a9000009-0000-4000-8000-0000000000ea';
  v_report uuid := 'a900000b-0000-4000-8000-0000000000e9';
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof73', 'P73', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR73', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_listing (
    id, interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin, created_at
  ) VALUES
    (v_survivor, v_grp, v_car, 'front', 'both', 'https://example.com/pr73-a', 'manual', now() - interval '1 day'),
    -- part_listing_group_car_position_side forbids an exact twin, so the leftover row
    -- the report points at keeps a different side.
    (v_drop, v_grp, v_car, 'front', 'left', 'https://example.com/pr73-b', 'manual', now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_norm_position_backfill_report (
    id, table_name, row_id, original_position, original_side, reason, survivor_id
  ) VALUES (
    v_report, 'part_listing', v_drop, 'FRT', 'both', 'duplicate_after_normalization', v_survivor
  ) ON CONFLICT (id) DO NOTHING;
  PERFORM public.part_norm_position_report_confirm_merge(v_report, v_survivor, NULL);
  IF EXISTS (SELECT 1 FROM public.part_listing pl WHERE pl.id = v_drop) THEN
    RAISE EXCEPTION 'Proof 73 failed: duplicate listing should be removed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_norm_position_backfill_report r
    WHERE r.id = v_report AND r.resolved_at IS NOT NULL AND r.resolution_source = 'manual'
  ) THEN
    RAISE EXCEPTION 'Proof 73 failed: report should be resolved manual';
  END IF;
END $$;

-- Proof 74: editing a group writes platform_revision and bumps revision
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000ee';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000ee';
  v_rev_before int;
  v_rev_after int;
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope, revision)
  VALUES (v_grp, 'AM-PR74', 'body', 0) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001', 'Pr74 pad', 'PR74-X', 'Test', 'aftermarket', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr74-part'
  ) ON CONFLICT (id) DO NOTHING;
  SELECT revision INTO v_rev_before FROM public.part_interchange_group WHERE id = v_grp;
  UPDATE public.part_interchange_group SET code = 'AM-PR74B' WHERE id = v_grp;
  SELECT revision INTO v_rev_after FROM public.part_interchange_group WHERE id = v_grp;
  IF v_rev_after IS DISTINCT FROM v_rev_before + 1 THEN
    RAISE EXCEPTION 'Proof 74 failed: group revision should bump by 1 (before %, after %)', v_rev_before, v_rev_after;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_revision r
    WHERE r.entity_table = 'part_interchange_group'
      AND r.entity_id = v_grp
      AND (r.new_row->>'code') = 'AM-PR74B'
  ) THEN
    RAISE EXCEPTION 'Proof 74 failed: platform_revision row missing for group edit';
  END IF;
END $$;

-- Proof 75: nightly cron job exists with expected schedule
DO $$
DECLARE v_schedule text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'Proof 75 skipped: pg_cron not installed';
    RETURN;
  END IF;
  SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = 'part-match-nightly' LIMIT 1;
  IF v_schedule IS DISTINCT FROM '0 3 * * *' THEN
    RAISE EXCEPTION 'Proof 75 failed: part-match-nightly schedule expected 0 3 * * *, got %', v_schedule;
  END IF;
END $$;

-- Proof 76: part_match_health(car) returns that car's derived counts only
DO $$
DECLARE
  v_car_a uuid := 'a9000005-0000-4000-8000-0000000000ef';
  v_car_b uuid := 'a9000005-0000-4000-8000-0000000000f0';
  v_grp_a uuid := 'a9000006-0000-4000-8000-0000000000ef';
  v_grp_b uuid := 'a9000006-0000-4000-8000-0000000000f0';
  v_health_a jsonb;
  v_health_b jsonb;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES
    (v_car_a, 'Toyota', 'Proof76A', 'P76A', 2018, 2022,
      'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'),
    (v_car_b, 'Toyota', 'Proof76B', 'P76B', 2018, 2022,
      'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
    (v_grp_a, 'AM-PR76A', 'body'),
    (v_grp_b, 'AM-PR76B', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    ('a9000007-0000-4000-8000-0000000000ef', 'a9000004-0000-4000-8000-000000000001', 'Pr76A', 'PR76-A', 'Toyota', 'oem', v_grp_a,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr76a'),
    ('a9000007-0000-4000-8000-0000000000f0', 'a9000004-0000-4000-8000-000000000001', 'Pr76B', 'PR76-B', 'Toyota', 'oem', v_grp_b,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr76b')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES
    ('a9000008-0000-4000-8000-0000000000ef', v_car_a, 'a9000003-0000-4000-8000-000000000002', 'front', 'left',
      'Toyota', 'PR76-A', 'PR76A', 'https://example.com/pr76-oe-a'),
    ('a9000008-0000-4000-8000-0000000000f0', v_car_b, 'a9000003-0000-4000-8000-000000000002', 'front', 'left',
      'Toyota', 'PR76-B', 'PR76B', 'https://example.com/pr76-oe-b')
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.part_match_recompute(v_grp_a, v_car_a);
  PERFORM public.part_match_recompute(v_grp_b, v_car_b);
  v_health_a := public.part_match_health(v_car_a);
  v_health_b := public.part_match_health(v_car_b);
  IF (v_health_a->'derived'->>'live')::int <> 1 THEN
    RAISE EXCEPTION 'Proof 76 failed: car A should report 1 live derived, got %', v_health_a->'derived'->>'live';
  END IF;
  IF (v_health_b->'derived'->>'live')::int <> 1 THEN
    RAISE EXCEPTION 'Proof 76 failed: car B should report 1 live derived, got %', v_health_b->'derived'->>'live';
  END IF;
  IF (public.part_match_health(v_car_a)->'derived'->>'live')::int
     = (public.part_match_health(NULL)->'derived'->>'live')::int THEN
    RAISE EXCEPTION 'Proof 76 failed: scoped health must differ from global live total';
  END IF;
END $$;

-- Proof 77: admin_catalog_master_part returns WVA and fitment count
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-0000000000f1';
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000f1';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000f1';
  v_json jsonb;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof77', 'P77', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope)
  VALUES (v_grp, 'AM-PR77', 'body') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001', 'Pr77 pad', 'PR77-X', 'Test', 'aftermarket', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr77-part'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_index_number (part_id, index_type, value, value_norm, wear_sensor, evidence_url)
  VALUES (v_part, 'wva', '77001', '77001', 'none', 'https://example.com/pr77-wva')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES
    (v_grp, v_car, 'front', 'left', 'https://example.com/pr77-list-a', 'manual'),
    (v_grp, 'a9000005-0000-4000-8000-000000000006', 'front', 'left', 'https://example.com/pr77-list-b', 'manual')
  ON CONFLICT DO NOTHING;
  v_json := public.admin_catalog_master_part(v_part);
  IF coalesce(v_json->>'wva', '') <> '77001' THEN
    RAISE EXCEPTION 'Proof 77 failed: expected wva 77001, got %', v_json->>'wva';
  END IF;
  IF (v_json->>'fitCount')::int <> 2 THEN
    RAISE EXCEPTION 'Proof 77 failed: expected fitCount 2, got %', v_json->>'fitCount';
  END IF;
END $$;

-- Proof 78: admin_platform returns vehicles with platform_role labels
DO $$
DECLARE
  v_plat uuid := 'a9000002-0000-4000-8000-0000000000f2';
  v_car uuid := 'a9000005-0000-4000-8000-0000000000f2';
  v_json jsonb;
  v_vehicle jsonb;
BEGIN
  INSERT INTO public.vehicle_platform (id, code, maker, label)
  VALUES (v_plat, 'PR78', 'Toyota', 'Proof78 platform')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id,
    platform_role
  ) VALUES (
    v_car, 'Toyota', 'Proof78', 'P78', 2018, 2022,
    v_plat, 'a9000001-0000-4000-8000-000000000001', 'badge_twin'
  ) ON CONFLICT (id) DO NOTHING;
  v_json := public.admin_platform(v_plat);
  IF v_json IS NULL THEN
    RAISE EXCEPTION 'Proof 78 failed: admin_platform returned null';
  END IF;
  SELECT elem INTO v_vehicle
  FROM jsonb_array_elements(v_json->'vehicles') elem
  WHERE elem->>'id' = v_car::text
  LIMIT 1;
  IF v_vehicle IS NULL OR v_vehicle->>'platform_role' IS DISTINCT FROM 'badge_twin' THEN
    RAISE EXCEPTION 'Proof 78 failed: vehicle platform_role missing or wrong';
  END IF;
END $$;

-- Proof 79: nightly batch logs carry row counter columns
DO $$
DECLARE
  v_run uuid;
BEGIN
  UPDATE public.part_match_recompute_checkpoint SET finished_at = now() WHERE finished_at IS NULL;
  PERFORM public.part_match_recompute(NULL, NULL);
  SELECT run_id INTO v_run
  FROM public.part_match_recompute_checkpoint
  ORDER BY started_at DESC
  LIMIT 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.part_match_recompute_log l
    WHERE l.kind = 'nightly'
      AND l.run_id = v_run
      AND l.rows_scanned IS NOT NULL
      AND l.rows_added IS NOT NULL
      AND l.rows_changed IS NOT NULL
      AND l.rows_removed IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Proof 79 failed: nightly log missing row counter columns';
  END IF;
END $$;

-- Proof 80: 90-day retention cleanup deletes old rows and keeps recent ones
DO $$
DECLARE
  v_old_log uuid := 'a900000c-0000-4000-8000-0000000000f3';
  v_new_log uuid := 'a900000c-0000-4000-8000-0000000000f4';
  v_old_arch uuid := 'a900000d-0000-4000-8000-0000000000f3';
  v_new_arch uuid := 'a900000d-0000-4000-8000-0000000000f4';
BEGIN
  INSERT INTO public.part_match_recompute_log (
    id, run_id, kind, started_at, finished_at, rows_scanned, rows_added, rows_changed, rows_removed
  ) VALUES
    (v_old_log, v_old_log, 'scoped', now() - interval '100 days', now() - interval '100 days', 1, 0, 0, 0),
    (v_new_log, v_new_log, 'scoped', now() - interval '1 day', now() - interval '1 day', 1, 0, 0, 0)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_fit_derived_archive (
    id, derived_id, interchange_group_id, vehicle_catalog_id, position, side,
    rule, matched_keys, part_oe_reference_ids, reason_code, reason_params, status,
    engine_version, computed_at, archive_reason, archived_at
  ) VALUES
    (v_old_arch, 'a900000a-0000-4000-8000-0000000000f3', 'a9000006-0000-4000-8000-0000000000eb',
      'a9000005-0000-4000-8000-0000000000eb', 'front', 'left', 'oe', ARRAY['PR35OE'], ARRAY[]::uuid[],
      'direct_oe', '{}'::jsonb, 'live', public.part_match_engine_version(), now() - interval '100 days',
      'removed', now() - interval '100 days'),
    (v_new_arch, 'a900000a-0000-4000-8000-0000000000f4', 'a9000006-0000-4000-8000-0000000000eb',
      'a9000005-0000-4000-8000-0000000000eb', 'front', 'left', 'oe', ARRAY['PR35OE'], ARRAY[]::uuid[],
      'direct_oe', '{}'::jsonb, 'live', public.part_match_engine_version(), now() - interval '1 day',
      'removed', now() - interval '1 day')
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.part_match_retention_cleanup();
  IF EXISTS (SELECT 1 FROM public.part_match_recompute_log WHERE id = v_old_log) THEN
    RAISE EXCEPTION 'Proof 80 failed: old recompute log should be deleted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.part_match_recompute_log WHERE id = v_new_log) THEN
    RAISE EXCEPTION 'Proof 80 failed: recent recompute log should remain';
  END IF;
  IF EXISTS (SELECT 1 FROM public.part_fit_derived_archive WHERE id = v_old_arch) THEN
    RAISE EXCEPTION 'Proof 80 failed: old archive row should be deleted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.part_fit_derived_archive WHERE id = v_new_arch) THEN
    RAISE EXCEPTION 'Proof 80 failed: recent archive row should remain';
  END IF;
END $$;

-- Proof 81: one part edit writes exactly one platform_revision row (20261106122100)
DO $$
DECLARE
  v_grp uuid := 'a9000006-0000-4000-8000-0000000000f7';
  v_part uuid := 'a9000007-0000-4000-8000-0000000000f7';
  v_rev_before int;
  v_rev_after int;
  v_rows int;
BEGIN
  INSERT INTO public.part_interchange_group (id, code, fit_scope, revision)
  VALUES (v_grp, 'AM-PR81', 'body', 0) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES (
    v_part, 'a9000004-0000-4000-8000-000000000001', 'Pr81 pad', 'PR81-X', 'Test', 'aftermarket', v_grp,
    'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr81-part'
  ) ON CONFLICT (id) DO NOTHING;
  SELECT revision INTO v_rev_before FROM public.part_interchange_group WHERE id = v_grp;
  INSERT INTO public.part_index_number (part_id, index_type, value, value_norm, wear_sensor, evidence_url)
  VALUES (v_part, 'wva', '81081', '81081', 'none', 'https://example.com/pr81-wva');
  SELECT revision INTO v_rev_after FROM public.part_interchange_group WHERE id = v_grp;
  IF v_rev_after IS DISTINCT FROM v_rev_before + 1 THEN
    RAISE EXCEPTION 'Proof 81 failed: part edit should bump group revision by 1 (before %, after %)', v_rev_before, v_rev_after;
  END IF;
  SELECT count(*)::int INTO v_rows FROM public.platform_revision r
  WHERE r.entity_table = 'part_interchange_group'
    AND r.entity_id = v_grp
    AND (r.new_row->>'revision')::int = v_rev_after;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Proof 81 failed: expected exactly 1 platform_revision row for one part edit, got %', v_rows;
  END IF;
END $$;

-- Proof 82: API callers run with safeupdate (authenticator preloads it), which rejects any DELETE
-- without WHERE, even inside functions. The SQL editor does not, so check the bodies directly.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND (p.proname LIKE 'part_match%' OR p.proname LIKE 'trg_part%' OR p.proname LIKE 'parts_for_vehicle%')
    AND p.prosrc ~* 'DELETE\s+FROM\s+[a-z_.]+\s*;';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Proof 82 failed: DELETE without WHERE (breaks under safeupdate) in %', v_bad;
  END IF;
END $$;

-- Proof 83: Keep never leaves a pad both kept and removed on the same car (live 4 Nov: Thor showed 3 of 6 kept pads).
-- Proof 16 kept group A (…0001) on Thor and removed group B (…0002). Now Keep B on the same car/OE:
-- B's earlier removal must be lifted, and A (already kept) must not be removed.
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-000000000002';
  v_a uuid := 'a9000006-0000-4000-8000-000000000001';
  v_b uuid := 'a9000006-0000-4000-8000-000000000002';
  v_thor_oe uuid := 'a9000008-0000-4000-8000-000000000032';
  v_conflict uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.interchange_group_id = v_a AND pl.vehicle_catalog_id = v_car AND pl.origin = 'auto_match_kept'
  ) THEN
    RAISE EXCEPTION 'Proof 83 setup failed: proof 16 should have kept group A on Thor';
  END IF;
  INSERT INTO public.part_listing_exclusion (interchange_group_id, vehicle_catalog_id, reason, source)
  VALUES (v_b, v_car, 'proof 83 earlier removal', 'auto_match_removed')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.part_match_conflict (
    conflict_type, interchange_group_id, vehicle_catalog_id, vehicle_oe_number_id, matched_key, detail, status
  ) VALUES (
    'oe_ambiguous', v_b, v_car, v_thor_oe, '99465B1191',
    jsonb_build_object('group_ids', jsonb_build_array(v_a, v_b), 'oe_number_norm', '99465B1191',
      'vehicle_oe_number_id', v_thor_oe, 'position', 'rear', 'side', 'left'),
    'open'
  )
  ON CONFLICT DO NOTHING;
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous' AND c.interchange_group_id = v_b
    AND c.vehicle_catalog_id = v_car AND c.status = 'open'
  LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 83 setup failed: no open oe_ambiguous conflict for group B on Thor';
  END IF;

  PERFORM public.part_match_conflict_keep(v_conflict, NULL, 'proof 83 keep B');

  IF EXISTS (
    SELECT 1 FROM public.part_listing_exclusion ex
    WHERE ex.interchange_group_id = v_b AND ex.vehicle_catalog_id = v_car AND ex.source = 'auto_match_removed'
  ) THEN
    RAISE EXCEPTION 'Proof 83 failed: Keep(B) left B removed on the car';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_listing_exclusion ex
    WHERE ex.interchange_group_id = v_a AND ex.vehicle_catalog_id = v_car AND ex.source = 'auto_match_removed'
  ) THEN
    RAISE EXCEPTION 'Proof 83 failed: Keep(B) removed A, which was already kept on the car';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_listing_exclusion ex
    JOIN public.part_listing pl
      ON pl.interchange_group_id = ex.interchange_group_id
     AND pl.vehicle_catalog_id = ex.vehicle_catalog_id
     AND pl.origin = 'auto_match_kept'
    WHERE ex.source = 'auto_match_removed'
  ) THEN
    RAISE EXCEPTION 'Proof 83 failed: a pad is both kept and removed on the same car';
  END IF;
END $$;

-- Proof 84 (AM-01): same-part merge combines oe_ambiguous groups; unmerge restores both.
DO $$
DECLARE
  v_car uuid := 'a9000005-0000-4000-8000-000000000840';
  v_grp_a uuid := 'a9000006-0000-4000-8000-000000000840';
  v_grp_b uuid := 'a9000006-0000-4000-8000-000000000841';
  v_part_a uuid := 'a9000007-0000-4000-8000-000000000840';
  v_part_b uuid := 'a9000007-0000-4000-8000-000000000841';
  v_von uuid := 'a9000008-0000-4000-8000-000000000840';
  v_conflict uuid;
  v_merge uuid;
  v_cnt int;
BEGIN
  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year, platform_id, engine_family_id
  ) VALUES (
    v_car, 'Toyota', 'Proof84', 'P84', 2018, 2022,
    'a9000002-0000-4000-8000-000000000001', 'a9000001-0000-4000-8000-000000000001'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_interchange_group (id, code, fit_scope) VALUES
    (v_grp_a, 'AM-PR84-A', 'body'),
    (v_grp_b, 'AM-PR84-B', 'body')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.part_master (
    id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id,
    maintenance_component_id, catalog_decision, evidence_url
  ) VALUES
    (v_part_a, 'a9000004-0000-4000-8000-000000000001', 'Pr84 NiBK', 'PR84-SAME', 'NiBK', 'aftermarket', v_grp_a,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr84-a'),
    (v_part_b, 'a9000004-0000-4000-8000-000000000001', 'Pr84 MK', 'PR84-MK', 'MK Kashiyama', 'aftermarket', v_grp_b,
      'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/pr84-b')
  ON CONFLICT (id) DO UPDATE SET interchange_group_id = EXCLUDED.interchange_group_id;
  INSERT INTO public.part_oe_reference (
    id, part_id, reference_type, oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES
    -- Both brands cross-reference the same Toyota number, so the car's OE number matches two groups.
    ('a900000a-0000-4000-8000-000000000841', v_part_a, 'cross_ref',
      'Toyota', 'PR84-SAME', 'PR84SAME', 'https://example.com/pr84-a-xref'),
    ('a900000a-0000-4000-8000-000000000840', v_part_b, 'cross_ref',
      'Toyota', 'PR84-SAME', 'PR84SAME', 'https://example.com/pr84-b-xref')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    v_von, v_car, 'a9000003-0000-4000-8000-000000000002', 'front', 'left',
    'Toyota', 'PR84-SAME', 'PR84SAME', 'https://example.com/pr84-oe'
  ) ON CONFLICT DO NOTHING;
  PERFORM public.part_match_sync_conflicts(NULL, v_car);
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous'
    AND c.vehicle_catalog_id = v_car
    AND c.vehicle_oe_number_id = v_von
    AND c.interchange_group_id = v_grp_a
    AND c.status = 'open'
  LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 84 setup failed: expected open oe_ambiguous conflict';
  END IF;

  PERFORM public.part_match_conflict_merge_same_part(v_conflict, NULL, 'proof 84 same pad two brands');

  SELECT count(*)::int INTO v_cnt FROM public.part_master pm
  WHERE pm.id IN (v_part_a, v_part_b) AND pm.interchange_group_id = v_grp_a;
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'Proof 84 failed: expected both parts on survivor group, got %', v_cnt;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status <> 'kept'
  ) THEN
    RAISE EXCEPTION 'Proof 84 failed: conflict should be kept after merge';
  END IF;

  SELECT m.id INTO v_merge FROM public.interchange_group_merge_log m
  WHERE m.part_id = v_part_b AND m.from_group = v_grp_b AND m.to_group = v_grp_a
    AND m.reversed_at IS NULL
  LIMIT 1;
  IF v_merge IS NULL THEN
    RAISE EXCEPTION 'Proof 84 failed: missing merge log for moved part';
  END IF;

  PERFORM public.part_match_unmerge_same_part(v_conflict, NULL);

  SELECT count(*)::int INTO v_cnt FROM public.part_master pm
  WHERE pm.id = v_part_a AND pm.interchange_group_id = v_grp_a;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Proof 84 unmerge failed: part A group';
  END IF;
  SELECT count(*)::int INTO v_cnt FROM public.part_master pm
  WHERE pm.id = v_part_b AND pm.interchange_group_id = v_grp_b;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Proof 84 unmerge failed: part B group';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status <> 'open'
  ) THEN
    RAISE EXCEPTION 'Proof 84 unmerge failed: conflict should reopen';
  END IF;
END $$;

ROLLBACK;
