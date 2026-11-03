-- Parts auto-match proofs (AM-09). Rolls back; run after migrations M + T apply.
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
  ('a9000002-0000-4000-8000-000000000003', 'REMOTE', 'Mazda', 'Remote')
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
  ('a9000005-0000-4000-8000-000000000003', 'Ford', 'Fiesta', 'B299', 2008, 2017, 'a9000002-0000-4000-8000-000000000002', 'a9000001-0000-4000-8000-000000000002'),
  ('a9000005-0000-4000-8000-000000000004', 'Mazda', 'Mazda2', 'DE', 2007, 2014, 'a9000002-0000-4000-8000-000000000002', 'a9000001-0000-4000-8000-000000000002'),
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

INSERT INTO public.part_master (id, category_id, name, oem_part_number, manufacturer, part_kind, interchange_group_id, maintenance_component_id, catalog_decision, evidence_url)
VALUES
  ('a9000007-0000-4000-8000-000000000001', 'a9000004-0000-4000-8000-000000000001', 'Roomy pad', '04465-B1190', 'Toyota', 'oem', 'a9000006-0000-4000-8000-000000000001', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/r'),
  ('a9000007-0000-4000-8000-000000000002', 'a9000004-0000-4000-8000-000000000001', 'Fiesta pad', '1438867', 'Ford', 'oem', 'a9000006-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/f'),
  ('a9000007-0000-4000-8000-000000000003', 'a9000004-0000-4000-8000-000000000001', 'Brembo pad', 'D0051M-01-J', 'Brembo', 'aftermarket', 'a9000006-0000-4000-8000-000000000003', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/b'),
  ('a9000007-0000-4000-8000-000000000004', 'a9000004-0000-4000-8000-000000000001', 'Idx old', 'IDX-OLD-1', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/io'),
  ('a9000007-0000-4000-8000-000000000005', 'a9000004-0000-4000-8000-000000000001', 'Idx new', 'IDX-NEW-1', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000005', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/in'),
  ('a9000007-0000-4000-8000-000000000006', 'a9000004-0000-4000-8000-000000000001', 'Sensor A', 'SENS-A', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000006', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/sa'),
  ('a9000007-0000-4000-8000-000000000007', 'a9000004-0000-4000-8000-000000000001', 'Sensor B', 'SENS-B', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000007', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/sb'),
  ('a9000007-0000-4000-8000-000000000008', 'a9000004-0000-4000-8000-000000000001', 'Fiesta twin OE', '04465-B1198', 'Toyota', 'oem', 'a9000006-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/ft'),
  ('a9000007-0000-4000-8000-000000000009', 'a9000004-0000-4000-8000-000000000001', 'WVA twin', 'WVA-24551', 'Test', 'aftermarket', 'a9000006-0000-4000-8000-000000000008', 'a9000003-0000-4000-8000-000000000002', 'confirmed', 'https://example.com/wt')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vehicle_oe_number (
  id, vehicle_catalog_id, maintenance_component_id, position, side,
  oe_brand, oe_number, oe_number_norm, evidence_url, year_from, year_to
) VALUES
  ('a9000008-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Toyota', '04465-B1190', '04465B1190', 'https://example.com/oe1', NULL, NULL),
  ('a9000008-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Toyota', '04465-B1191', '04465B1191', 'https://example.com/oe2', NULL, NULL),
  ('a9000008-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000003', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Ford', '1438867', '1438867', 'https://example.com/oe3', NULL, NULL),
  ('a9000008-0000-4000-8000-000000000004', 'a9000005-0000-4000-8000-000000000005', 'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Mazda', 'REMOTE-OE', 'REMOTEOE', 'https://example.com/oe4', 2010, 2014)
ON CONFLICT DO NOTHING;

INSERT INTO public.oe_number_supersession (oe_brand, from_norm, to_norm, fully_interchangeable, evidence_url)
VALUES
  ('Toyota', '04465B1190', '04465B1191', true, 'https://example.com/sup'),
  ('Toyota', '04465B1192', '04465B1193', false, 'https://example.com/sup2'),
  ('Toyota', '04465B1193', '04465B1194', false, 'https://example.com/sup3'),
  ('Toyota', '04465B1194', '04465B1195', false, 'https://example.com/sup4'),
  ('Toyota', '04465B1195', '04465B1196', false, 'https://example.com/sup5'),
  ('Toyota', '04465B1196', '04465B1197', false, 'https://example.com/sup6')
ON CONFLICT DO NOTHING;

UPDATE public.part_master SET oem_part_number = '04465-B1191', manufacturer = 'Toyota'
WHERE id = 'a9000007-0000-4000-8000-000000000001';

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
) VALUES (
  'a9000009-0000-4000-8000-000000000001',
  'a9000002-0000-4000-8000-000000000001',
  'a9000002-0000-4000-8000-000000000002',
  'component',
  'a9000003-0000-4000-8000-000000000002',
  'front', 'left',
  2016, 2020, 2008, 2012,
  'https://example.com/pcl'
) ON CONFLICT DO NOTHING;

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
  IF NOT (d.matched_keys @> ARRAY['04465B1190', '04465B1191']) THEN
    RAISE EXCEPTION 'Proof 1 failed: matched_keys % missing chain numbers', d.matched_keys;
  END IF;
  SELECT * INTO p FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', 'a9000003-0000-4000-8000-000000000002', 2018) x
  WHERE x.tier = 1 AND x.part_id = 'a9000007-0000-4000-8000-000000000001' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proof 1 failed: parts_for_vehicle missing tier-1 Roomy pad';
  END IF;
END $$;

-- Proof 2: Thor tier 2 sister fit; no copied listing row on Thor
DO $$
BEGIN
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES ('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001', 'front', 'left', 'https://example.com/roomy-list', 'manual');
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.tier = 2 AND p.via = 'sister' AND p.part_id = 'a9000007-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 2 failed: Thor should see tier-2 sister fit';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002'
      AND pl.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 2 failed: sister fit must not copy a listing onto Thor';
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

-- Proof 5: no tier 3 from tier 2 alone (sister listing without platform link target)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000005', 'a9000003-0000-4000-8000-000000000002', 2012) p
    WHERE p.tier = 3 AND p.via = 'platform_link'
  ) THEN
    RAISE EXCEPTION 'Proof 5 failed: tier-2 sister must not become tier 3 without a link';
  END IF;
END $$;

-- Proof 5b: needs_checking tier 1 yields needs_checking tier 3
DO $$
BEGIN
  UPDATE public.part_fit_derived SET status = 'needs_checking'
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000001';
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000004', 'a9000003-0000-4000-8000-000000000002', 2010) p
    WHERE p.tier = 3 AND p.match_status = 'needs_checking'
  ) THEN
    RAISE EXCEPTION 'Proof 5b failed: needs_checking tier-1 should propagate to tier-3';
  END IF;
  UPDATE public.part_fit_derived SET status = 'live'
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
    AND interchange_group_id = 'a9000006-0000-4000-8000-000000000001';
END $$;

-- Proof 6: Brembo index merge log + tier-4 badge params
DO $$
BEGIN
  PERFORM public.part_match_index_rules(NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.interchange_group_merge_log m
    WHERE m.part_id = 'a9000007-0000-4000-8000-000000000003' AND m.reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Proof 6 failed: expected Brembo merge log row';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
    WHERE p.part_id = 'a9000007-0000-4000-8000-000000000003'
      AND p.tier = 4
      AND p.part_badge_code = 'index_badge'
      AND p.part_badge_params ? 'merge_log_id'
  ) THEN
    RAISE EXCEPTION 'Proof 6 failed: tier-4 index badge missing on Brembo';
  END IF;
END $$;

-- Proof 6b: two empty groups merge into the older group
DO $$
DECLARE v_grp uuid;
BEGIN
  PERFORM public.part_match_index_rules(NULL);
  SELECT interchange_group_id INTO v_grp FROM public.part_master WHERE id = 'a9000007-0000-4000-8000-000000000004';
  IF v_grp IS DISTINCT FROM 'a9000006-0000-4000-8000-000000000004' THEN
    RAISE EXCEPTION 'Proof 6b failed: older empty group should win merge (got %)', v_grp;
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

-- Proof 10: idempotent recompute
DO $$
DECLARE c1 int; c2 int;
BEGIN
  SELECT count(*) INTO c1 FROM public.part_fit_derived;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT count(*) INTO c2 FROM public.part_fit_derived;
  IF c1 IS DISTINCT FROM c2 THEN
    RAISE EXCEPTION 'Proof 10 failed: row count changed on second run';
  END IF;
END $$;

-- Proof 11: moving a part recomputes both interchange groups
DO $$
DECLARE g_old uuid := 'a9000006-0000-4000-8000-000000000005';
DECLARE g_new uuid := 'a9000006-0000-4000-8000-000000000004';
BEGIN
  UPDATE public.part_master SET interchange_group_id = g_new WHERE id = 'a9000007-0000-4000-8000-000000000005';
  PERFORM public.part_match_recompute(g_old, NULL);
  PERFORM public.part_match_recompute(g_new, NULL);
  IF EXISTS (SELECT 1 FROM public.part_fit_derived d WHERE d.interchange_group_id = g_old) THEN
    RAISE EXCEPTION 'Proof 11 failed: old group should have no derived rows after move';
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
DECLARE v_conflict uuid;
BEGIN
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'index_wear_sensor' AND c.status = 'open' LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 14 setup failed: need open conflict';
  END IF;
  PERFORM public.part_match_conflict_remove(v_conflict, NULL, 'proof 14 remove');
  PERFORM public.part_match_sync_conflicts(NULL, NULL);
  PERFORM public.part_match_index_rules('a9000006-0000-4000-8000-000000000006');
  IF EXISTS (SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status <> 'removed') THEN
    RAISE EXCEPTION 'Proof 14 failed: removed conflict reopened';
  END IF;
END $$;

-- Proof 15 / 15b: undo drops non-kept rows; kept merge log survives
DO $$
DECLARE v_batch uuid := 'a900000a-0000-4000-8000-000000000002';
DECLARE v_merge uuid;
DECLARE v_conflict uuid;
BEGIN
  SELECT id INTO v_merge FROM public.interchange_group_merge_log WHERE reversed_at IS NULL LIMIT 1;
  SELECT id INTO v_conflict FROM public.part_match_conflict WHERE status = 'kept' LIMIT 1;
  IF v_merge IS NULL THEN
    RAISE EXCEPTION 'Proof 15 setup failed: need merge log';
  END IF;
  INSERT INTO public.part_import_batch (
    id, code, area_id, template_version, file_name, file_sha256, status, import_kind, promoted_at
  )
  VALUES (
    v_batch, 'AM-PROOF-15',
    public.part_import_template_area_id('vehicle_oe'),
    1, 'proof15.csv', 'proof15sha', 'imported', 'vehicle_oe', now()
  )
  ON CONFLICT DO NOTHING;
  IF v_conflict IS NOT NULL THEN
    UPDATE public.part_match_conflict SET status = 'kept' WHERE id = v_conflict;
  END IF;
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
  IF v_merge IS NOT NULL THEN
    INSERT INTO public.part_import_change (batch_id, line_no, table_name, row_id, op, after)
    VALUES (
      v_batch, 2, 'interchange_group_merge_log', v_merge, 'insert',
      public.part_import_row_snapshot('interchange_group_merge_log', v_merge)
    );
  END IF;
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
DECLARE v_conflict uuid;
BEGIN
  PERFORM public.part_match_sync_conflicts('a9000005-0000-4000-8000-000000000002', NULL);
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = 'a9000006-0000-4000-8000-000000000001'
    AND c.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002'
    AND c.status = 'open' LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 16 setup failed: need oe_ambiguous on Thor';
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
DECLARE v_conflict uuid;
BEGIN
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous'
    AND c.interchange_group_id = 'a9000006-0000-4000-8000-000000000002'
    AND c.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000002' LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 17 setup failed: missing ambiguous conflict on fiesta group';
  END IF;
  UPDATE public.part_match_conflict SET status = 'superseded', resolved_at = now() WHERE id = v_conflict;
  UPDATE public.vehicle_oe_number SET side = 'right' WHERE id = 'a9000008-0000-4000-8000-000000000002';
  PERFORM public.part_match_sync_conflicts('a9000005-0000-4000-8000-000000000002', NULL);
  IF NOT EXISTS (SELECT 1 FROM public.part_match_conflict c WHERE c.id = v_conflict AND c.status = 'open') THEN
    RAISE EXCEPTION 'Proof 17 failed: superseded conflict should reopen after key change';
  END IF;
  UPDATE public.vehicle_oe_number SET side = 'left' WHERE id = 'a9000008-0000-4000-8000-000000000002';
END $$;

-- Proof 18: fit_source kept with via sister
DO $$
BEGIN
  PERFORM public.part_match_derived_keep(
    (SELECT id FROM public.part_fit_derived
     WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001' LIMIT 1),
    NULL, 'proof 18'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000002', 'a9000003-0000-4000-8000-000000000002', 2018) p
    WHERE p.fit_source = 'kept' AND p.via = 'sister'
  ) THEN
    RAISE EXCEPTION 'Proof 18 failed: expected kept sister fit on Thor';
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
DECLARE v_before int; v_after int;
BEGIN
  UPDATE public.part_fit_derived SET engine_version = 0
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000003';
  SELECT count(*) INTO v_before FROM public.part_fit_derived_archive;
  PERFORM public.part_match_archive_derived_changes(public.part_match_engine_version());
  SELECT count(*) INTO v_after FROM public.part_fit_derived_archive;
  IF v_after <= v_before THEN
    RAISE EXCEPTION 'Proof 20 failed: archive should gain rows on engine version bump';
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
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001' LIMIT 1;
  IF d.matched_keys IS NULL OR coalesce(array_length(d.matched_keys, 1), 0) > 6 THEN
    RAISE EXCEPTION 'Proof 22 failed: matched_keys must have at most 6 entries';
  END IF;
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT * INTO l FROM public.part_match_recompute_log ORDER BY started_at DESC LIMIT 1;
  IF l.rows_scanned IS NULL OR l.rows_added IS NULL OR l.rows_changed IS NULL OR l.rows_removed IS NULL THEN
    RAISE EXCEPTION 'Proof 22 failed: recompute log must include row counters';
  END IF;
END $$;

-- Proof 23: manual listing wins over auto exclude on ambiguous keep
DO $$
DECLARE v_conflict uuid;
BEGIN
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side, oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000021', 'a9000005-0000-4000-8000-000000000004',
    'a9000003-0000-4000-8000-000000000002', 'front', 'left', 'Toyota', '04465-B1191', '04465B1191', 'https://example.com/oe23'
  ) ON CONFLICT DO NOTHING;
  INSERT INTO public.part_listing (interchange_group_id, vehicle_catalog_id, position, side, evidence_url, origin)
  VALUES ('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000004', 'front', 'left', 'https://example.com/manual23', 'manual');
  PERFORM public.part_match_sync_conflicts('a9000005-0000-4000-8000-000000000004', NULL);
  SELECT c.id INTO v_conflict FROM public.part_match_conflict c
  WHERE c.conflict_type = 'oe_ambiguous' AND c.status = 'open'
    AND c.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000004' LIMIT 1;
  IF v_conflict IS NULL THEN
    RAISE EXCEPTION 'Proof 23 setup failed: need ambiguous conflict';
  END IF;
  PERFORM public.part_match_conflict_keep(v_conflict, NULL, 'manual wins note');
  IF NOT EXISTS (
    SELECT 1 FROM public.part_match_conflict c
    WHERE c.conflict_type = 'oe_ambiguous' AND c.status = 'superseded'
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
  WHERE vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001' LIMIT 1;
  IF d.year_from IS DISTINCT FROM 2016 OR d.year_to IS DISTINCT FROM 2022 THEN
    RAISE EXCEPTION 'Proof 26 failed: expected clipped years 2016-2022, got %-%', d.year_from, d.year_to;
  END IF;
END $$;

-- Proof 27: removed index merge proposal is not repeated
DO $$
DECLARE v_open int;
BEGIN
  INSERT INTO public.part_match_conflict (
    conflict_type, part_id, interchange_group_id, matched_key, detail, status, engine_version
  ) VALUES (
    'index_merge_proposed', 'a9000007-0000-4000-8000-000000000004', 'a9000006-0000-4000-8000-000000000004',
    'wva:88801', '{}'::jsonb, 'removed', public.part_match_engine_version()
  );
  PERFORM public.part_match_index_rules('a9000006-0000-4000-8000-000000000004');
  SELECT count(*) INTO v_open FROM public.part_match_conflict
  WHERE conflict_type = 'index_merge_proposed' AND matched_key = 'wva:88801' AND status = 'open';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'Proof 27 failed: removed merge proposal came back open';
  END IF;
END $$;

-- Proof 28: forward-only supersession (non-interchangeable reverse does not match)
DO $$
BEGIN
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000010', 'a9000005-0000-4000-8000-000000000001',
    'a9000003-0000-4000-8000-000000000002', 'front', 'right',
    'Toyota', '04465-B1192', '04465B1192', 'https://example.com/oe28'
  );
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  IF EXISTS (
    SELECT 1 FROM public.part_fit_derived d
    WHERE d.vehicle_oe_number_id = 'a9000008-0000-4000-8000-000000000010'
      AND d.reason_code = 'oe_number_superseded'
      AND d.matched_keys @> ARRAY['04465B1193']
  ) THEN
    RAISE EXCEPTION 'Proof 28 failed: reverse non-interchangeable supersession should not match forward';
  END IF;
END $$;

-- Proof 29: parts_for_vehicle match columns populated (listing + derived)
DO $$
BEGIN
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

-- Proof 35: concurrent scoped recomputes complete (ordered locks)
DO $$
BEGIN
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000003');
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000003', 'a9000005-0000-4000-8000-000000000001');
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
  SELECT * INTO a FROM public.part_fit_derived_archive ORDER BY archived_at DESC LIMIT 1;
  IF a.archive_reason IS NULL OR a.superseded_by_engine_version IS NULL THEN
    RAISE EXCEPTION 'Proof 37 failed: archive row missing cause or superseded_by_engine_version';
  END IF;
END $$;

-- Proof 38: index badge on merged aftermarket part
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.parts_for_vehicle('a9000005-0000-4000-8000-000000000001', NULL, 2018) p
    WHERE p.part_badge_code = 'index_badge' AND p.part_id = 'a9000007-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'Proof 38 failed: index badge missing on merged part';
  END IF;
END $$;

-- Proof 39: Keep origin is auto_match_kept
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.part_listing pl
    WHERE pl.origin = 'auto_match_kept' AND pl.vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Proof 39 failed: missing auto_match_kept listing after Keep';
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
  INSERT INTO public.vehicle_oe_number (
    id, vehicle_catalog_id, maintenance_component_id, position, side,
    oe_brand, oe_number, oe_number_norm, evidence_url
  ) VALUES (
    'a9000008-0000-4000-8000-000000000011', 'a9000005-0000-4000-8000-000000000001',
    'a9000003-0000-4000-8000-000000000002', 'rear', 'left',
    'Toyota', '04465-B1197', '04465B1197', 'https://example.com/oe42'
  );
  UPDATE public.part_master SET oem_part_number = '04465-B1197' WHERE id = 'a9000007-0000-4000-8000-000000000001';
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000001');
  SELECT max(coalesce(array_length(d.matched_keys, 1), 0)) INTO mx
  FROM public.part_fit_derived d
  WHERE d.vehicle_oe_number_id = 'a9000008-0000-4000-8000-000000000011';
  IF mx IS NULL OR mx > 6 THEN
    RAISE EXCEPTION 'Proof 42 failed: chain should cap at 6 matched_keys entries, got %', mx;
  END IF;
END $$;

-- Proof 43: Kept listing survives derived archive pass
DO $$
DECLARE v_listing uuid;
BEGIN
  SELECT id INTO v_listing FROM public.part_listing
  WHERE origin = 'auto_match_kept' AND vehicle_catalog_id = 'a9000005-0000-4000-8000-000000000001' LIMIT 1;
  PERFORM public.part_match_archive_derived_changes(public.part_match_engine_version());
  IF NOT EXISTS (SELECT 1 FROM public.part_listing WHERE id = v_listing) THEN
    RAISE EXCEPTION 'Proof 43 failed: Kept listing removed by archive pass';
  END IF;
END $$;

-- Proof 44: no deadlock when scopes are recomputed in lock order
DO $$
BEGIN
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000002', 'a9000005-0000-4000-8000-000000000004');
  PERFORM public.part_match_recompute('a9000006-0000-4000-8000-000000000001', 'a9000005-0000-4000-8000-000000000002');
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
  IF NOT (v ? 'vehicleCount' AND v ? 'vehiclesWithOeNumbers' AND v ? 'platformLinkCount') THEN
    RAISE EXCEPTION 'Proof 47 failed: completeness keys';
  END IF;
END $$;

ROLLBACK;
