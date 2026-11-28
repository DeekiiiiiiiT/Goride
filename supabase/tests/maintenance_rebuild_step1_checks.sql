-- Maintenance rebuild step 1 (database only) checks: MER-03, MER-04, MER-06, MER-07 and the
-- database half of MER-05. Fixture data only; every engine function is the real one.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/maintenance_rebuild_step1_checks.sql
-- Rolls back.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. MER-03: the 16 part rules are part schedules, the 5 packages are packages
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_part int;
  v_pkg int;
  v_bad int;
BEGIN
  SELECT count(*) INTO v_part
  FROM public.maintenance_task_templates t
  WHERE t.task_code IN (
    'oil', 'lights', 'air_filter', 'cabin_filter', 'fluids', 'rotate_tires', 'tire_pressure',
    'brakes', 'wipers', 'brake_fluid', 'tires', 'belt', 'suspension', 'transmission',
    'spark_plugs', 'coolant_flush'
  )
    AND t.due_kind = 'part_schedule';
  IF v_part <> 16 THEN
    RAISE EXCEPTION 'expected 16 part_schedule rules, got %', v_part;
  END IF;

  SELECT count(*) INTO v_pkg
  FROM public.maintenance_task_templates t
  WHERE t.component_id IS NULL
    AND t.due_kind = 'service_package';
  IF v_pkg <> 5 THEN
    RAISE EXCEPTION 'expected 5 service_package packages, got %', v_pkg;
  END IF;

  -- No part rule may still claim to be a package, whatever its frequency.
  SELECT count(*) INTO v_bad
  FROM public.maintenance_task_templates t
  WHERE t.component_id IS NOT NULL
    AND t.due_kind <> 'part_schedule';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'part rules not marked part_schedule: %', v_bad;
  END IF;

  RAISE NOTICE 'check_1_due_kind: 16 part_schedule, 5 service_package';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Fixtures: a model family, one car, three part types, two manuals
-- ---------------------------------------------------------------------------
INSERT INTO public.engine_family (id, code)
VALUES ('b5000001-0000-4000-8000-000000000003'::uuid, 'STEP1-ENG')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_platform (id, code, maker, label, parent_id, family_evidence_url)
VALUES
  ('b5000001-0000-4000-8000-000000000001'::uuid, 'STEP1-FAMILY', 'StepOne', 'Step1 family', NULL, NULL),
  ('b5000001-0000-4000-8000-000000000002'::uuid, 'STEP1-VARIANT', 'StepOne', 'Step1 variant',
   'b5000001-0000-4000-8000-000000000001'::uuid, 'https://example.com/step1-family')
ON CONFLICT DO NOTHING;

INSERT INTO public.vehicle_catalog (
  id, make, model, chassis_code, production_start_year, production_end_year,
  platform_id, engine_family_id, vehicle_class, fuel_type, engine_type, fuel_category,
  powertrain, fuel, powertrain_status
) VALUES (
  'b5000001-0000-4000-8000-000000000004'::uuid, 'StepOne', 'Step1Car', 'STEP1-CHASSIS', 2018, 2022,
  'b5000001-0000-4000-8000-000000000002'::uuid,
  'b5000001-0000-4000-8000-000000000003'::uuid,
  'car', 'Petrol', 'Turbo', 'Gas', 'ice', 'petrol', 'confirmed'
)
ON CONFLICT DO NOTHING;

INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year)
VALUES (
  'step1_fixture_car', 'step1_fixture_org', 'step1_plate', 'step1_legacy',
  'b5000001-0000-4000-8000-000000000004', 2020
)
ON CONFLICT (id) DO UPDATE SET vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, icon_key, sort_order, is_part)
VALUES
  ('b5000001-0000-4000-8000-000000000011'::uuid, 'step1-oil-part', 'Step1 engine oil part', 'component', 'STEP1-OIL', 'wrench', 9001, true),
  ('b5000001-0000-4000-8000-000000000012'::uuid, 'step1-family-part', 'Step1 family part', 'component', 'STEP1-FAM', 'wrench', 9002, true),
  ('b5000001-0000-4000-8000-000000000013'::uuid, 'step1-severe-part', 'Step1 severe part', 'component', 'STEP1-SEV', 'wrench', 9003, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.maintenance_manual (
  id, platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to, status
) VALUES
  ('b5000001-0000-4000-8000-000000000021'::uuid, 'b5000001-0000-4000-8000-000000000001'::uuid,
   'JM', 'Step1 Jamaica manual', 'manuals/step1-jm.pdf', repeat('a', 64), 300, 210, 232, 'checked'),
  ('b5000001-0000-4000-8000-000000000022'::uuid, 'b5000001-0000-4000-8000-000000000001'::uuid,
   'JP', 'Step1 Japan manual', 'manuals/step1-jp.pdf', repeat('b', 64), 320, 100, 140, 'checked')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. MER-04: 47 As needed rules, and the two types that moved to "No schedule yet"
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_have int;
  v_excluded int;
  v_bad int;
BEGIN
  -- Every Appendix A "As needed" part type, so this works on a copy that seeds only some of
  -- them (the local copy seeds 103 of the 167). Existing codes are left untouched.
  INSERT INTO public.maintenance_service_categories (code, name, kind, op_code, icon_key, sort_order, is_part)
  SELECT
    v.code,
    initcap(replace(v.code, '_', ' ')),
    'component',
    upper(left(v.code, 12)),
    'wrench',
    9100,
    true
  FROM (
    VALUES
      ('ac_evaporator_cleaning'), ('ac_recharge'), ('ac_disinfection'), ('adblue_topup'),
      ('battery_terminal_cleaning'), ('carburetor_cleaning'), ('ev_charging_port_cleaning'),
      ('rod_bearings'), ('coolant_part'), ('crankshaft_machining'), ('cylinder_head_machining'),
      ('cylinder_honing'), ('dpf_cleaning'), ('egr_cleaning'), ('engine_bay_degreasing'),
      ('engine_oil_part'), ('engine_overhaul'), ('engine_service_labor'),
      ('exhaust_flange_gasket'), ('exhaust_manifold_gasket'), ('exhaust_inspection'),
      ('fuel_induction_service'), ('head_gasket'), ('hv_battery_fan_cleaning'),
      ('hv_battery_health_check'), ('hv_insulation_inspection'), ('inspection_diagnostic_fee'),
      ('intake_manifold_gasket'), ('walnut_blasting'), ('intercooler_cleaning'),
      ('leak_inspection'), ('maf_map_sensor_cleaning'), ('main_bearings'), ('oil_pan_gasket'),
      ('piston_replacement'), ('piston_rings'), ('puncture_repair'), ('scr_service'),
      ('throttle_body_cleaning'), ('throttle_body_relearn'), ('turbo_decoking'),
      ('valve_cover_gasket'), ('valve_grinding_seating'), ('valve_stem_seals'),
      ('washer_fluid_part'), ('wheel_balancing'), ('wheel_straightening')
  ) AS v(code)
  ON CONFLICT (code) DO NOTHING;

  -- The same seeding routine the migration ran, so the part types that only exist on live are
  -- filled by the real code path, not by hand.
  PERFORM public.mm_seed_as_needed_rules();

  SELECT count(*) INTO v_have
  FROM public.maintenance_task_templates t
  WHERE t.frequency_kind = 'manual_only';
  IF v_have <> 47 THEN
    RAISE EXCEPTION 'expected 47 manual_only (As needed) rules, got %', v_have;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.maintenance_task_templates t
  WHERE t.frequency_kind = 'manual_only'
    AND (
      t.due_kind <> 'part_schedule'
      OR t.template_scope <> 'global'
      OR t.source_type <> 'roam_policy'
      OR t.component_id IS NULL
      OR t.status <> 'active'
      OR t.interval_km IS NOT NULL
      OR t.interval_km_max IS NOT NULL
      OR t.interval_months IS NOT NULL
    );
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'As needed rules with a wrong shape: %', v_bad;
  END IF;

  SELECT count(*) INTO v_excluded
  FROM public.maintenance_task_templates t
  JOIN public.maintenance_service_categories c ON c.id = t.component_id
  WHERE c.code IN ('valve_clearance_adjustment', 'wheel_alignment');
  IF v_excluded <> 0 THEN
    RAISE EXCEPTION 'valve clearance / wheel alignment must have no rule, got %', v_excluded;
  END IF;

  RAISE NOTICE 'check_2_as_needed: 47 manual_only rules, valve clearance + wheel alignment none';
END $$;

-- ---------------------------------------------------------------------------
-- 4. MER-04 engine: no row, no due, never counted; a leftover row is retired
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_part uuid;
  v_rows int;
  v_counted int;
  v_row_id uuid;
  v_action text;
  v_status text;
  v_reason text;
BEGIN
  SELECT c.id INTO v_part
  FROM public.maintenance_service_categories c
  WHERE c.code = 'leak_inspection';
  IF v_part IS NULL THEN
    RAISE EXCEPTION 'leak_inspection part type missing';
  END IF;

  -- The resolver never returns an As needed rule, so it can never make a due date.
  SELECT count(*) INTO v_rows
  FROM public.schedule_rule_for_part('step1_fixture_org', 'step1_fixture_car', v_part, NULL) r;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'schedule_rule_for_part returned % rows for an As needed part', v_rows;
  END IF;

  PERFORM public.recompute_component_schedules_for_car('step1_fixture_org', 'step1_fixture_car');

  SELECT count(*) INTO v_rows
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = 'step1_fixture_org'
    AND vcs.vehicle_id = 'step1_fixture_car'
    AND vcs.category_id = v_part;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'recompute made % rows for an As needed part', v_rows;
  END IF;

  SELECT count(*) INTO v_counted
  FROM public.fleet_maintenance_due_v d
  WHERE d.organization_id = 'step1_fixture_org'
    AND d.vehicle_id = 'step1_fixture_car'
    AND d.category_id = v_part
    AND d.due_status IN ('overdue', 'due_soon', 'ok');
  IF v_counted <> 0 THEN
    RAISE EXCEPTION 'an As needed part was counted as Overdue/Due soon/OK: %', v_counted;
  END IF;

  -- A car row left from before the rule existed is retired with the reason the screens show.
  INSERT INTO public.vehicle_component_schedule (
    id, organization_id, vehicle_id, category_id, position, schedule_status,
    baseline_odometer, baseline_date, baseline_source, next_due_km, next_due_date, updated_at
  ) VALUES (
    'b5000001-0000-4000-8000-000000000041'::uuid, 'step1_fixture_org', 'step1_fixture_car', v_part,
    NULL, 'active', 100000, current_date - 30, 'bootstrap', 105000, current_date + 10, now()
  );

  v_row_id := 'b5000001-0000-4000-8000-000000000041'::uuid;
  v_action := public.mm_recompute_schedule_row('step1_fixture_org', 'step1_fixture_car', v_part, NULL, v_row_id);
  IF v_action <> 'retired_as_needed' THEN
    RAISE EXCEPTION 'expected retired_as_needed, got %', v_action;
  END IF;

  SELECT schedule_status, retired_reason INTO v_status, v_reason
  FROM public.vehicle_component_schedule
  WHERE id = v_row_id;
  IF v_status <> 'retired'
    OR v_reason IS DISTINCT FROM 'As needed: done only when a job calls for it'
  THEN
    RAISE EXCEPTION 'leftover row not retired as needed: % / %', v_status, v_reason;
  END IF;

  SELECT count(*) INTO v_counted
  FROM public.fleet_maintenance_due_v d
  WHERE d.vehicle_id = 'step1_fixture_car'
    AND d.category_id = v_part
    AND d.due_status IN ('overdue', 'due_soon', 'ok');
  IF v_counted <> 0 THEN
    RAISE EXCEPTION 'retired As needed part still counted: %', v_counted;
  END IF;

  RAISE NOTICE 'check_3_as_needed_engine: no row, no due, not counted, leftover retired';
END $$;

-- ---------------------------------------------------------------------------
-- 5. MER-06: two manuals, same level, one family - Jamaica wins, then Japan once JM retires
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_part uuid;
  v_km int;
  v_basis text;
  v_rule uuid;
  v_used int;
  v_used_rule uuid;
BEGIN
  SELECT c.id INTO v_part
  FROM public.maintenance_service_categories c
  WHERE c.code = 'step1-oil-part';

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes,
    manual_id, evidence_page, evidence_url
  ) VALUES
    ('b5000001-0000-4000-8000-000000000031'::uuid, 'Step1 oil (JM manual)', 'step1-oil-jm',
     'global', v_part, 7000, 6, 'active', 'maker_manual', 'confirmed', ARRAY['car']::text[],
     'b5000001-0000-4000-8000-000000000021'::uuid, 214, 'https://example.com/step1-jm.pdf'),
    ('b5000001-0000-4000-8000-000000000032'::uuid, 'Step1 oil (JP manual)', 'step1-oil-jp',
     'global', v_part, 5000, 4, 'active', 'maker_manual', 'confirmed', ARRAY['car']::text[],
     'b5000001-0000-4000-8000-000000000022'::uuid, 88, 'https://example.com/step1-jp.pdf');

  -- Two manuals of different markets for the same family are not a conflict.
  IF EXISTS (
    SELECT 1 FROM public.maintenance_task_templates
    WHERE id IN ('b5000001-0000-4000-8000-000000000031'::uuid, 'b5000001-0000-4000-8000-000000000032'::uuid)
      AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'a JM and a JP manual rule at the same level must both stay active';
  END IF;

  -- The rule carries the manual's market, copied by trigger.
  IF EXISTS (
    SELECT 1 FROM public.maintenance_task_templates
    WHERE id = 'b5000001-0000-4000-8000-000000000031'::uuid AND market <> 'JM'
  ) THEN
    RAISE EXCEPTION 'rule market was not copied from the JM manual';
  END IF;

  SELECT r.interval_km, r.interval_basis, r.rule_id INTO v_km, v_basis, v_rule
  FROM public.schedule_rule_for_part('step1_fixture_org', 'step1_fixture_car', v_part, NULL) r
  LIMIT 1;
  IF v_km IS DISTINCT FROM 7000 THEN
    RAISE EXCEPTION 'expected the Jamaica manual numbers (7000), got %', v_km;
  END IF;

  PERFORM public.recompute_component_schedules_for_car('step1_fixture_org', 'step1_fixture_car');
  SELECT vcs.interval_km_used, vcs.rule_id INTO v_used, v_used_rule
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = 'step1_fixture_org'
    AND vcs.vehicle_id = 'step1_fixture_car'
    AND vcs.category_id = v_part;
  IF v_used IS DISTINCT FROM 7000
    OR v_used_rule IS DISTINCT FROM 'b5000001-0000-4000-8000-000000000031'::uuid
  THEN
    RAISE EXCEPTION 'car row not built from the JM rule: km=% rule=%', v_used, v_used_rule;
  END IF;

  -- Retire the Jamaica rule: the Japan manual takes over.
  UPDATE public.maintenance_task_templates
  SET status = 'retired'
  WHERE id = 'b5000001-0000-4000-8000-000000000031'::uuid;

  SELECT r.interval_km, r.interval_basis, r.rule_id INTO v_km, v_basis, v_rule
  FROM public.schedule_rule_for_part('step1_fixture_org', 'step1_fixture_car', v_part, NULL) r
  LIMIT 1;
  IF v_km IS DISTINCT FROM 5000
    OR v_rule IS DISTINCT FROM 'b5000001-0000-4000-8000-000000000032'::uuid
  THEN
    RAISE EXCEPTION 'after retiring JM expected the JP rule (5000), got % / %', v_km, v_rule;
  END IF;

  PERFORM public.recompute_component_schedules_for_car('step1_fixture_org', 'step1_fixture_car');
  SELECT vcs.interval_km_used INTO v_used
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = 'step1_fixture_org'
    AND vcs.vehicle_id = 'step1_fixture_car'
    AND vcs.category_id = v_part;
  IF v_used IS DISTINCT FROM 5000 THEN
    RAISE EXCEPTION 'car row did not move to the JP numbers, got %', v_used;
  END IF;

  RAISE NOTICE 'check_4_market: JM 7000 wins, then JP 5000 after JM retired';
END $$;

-- ---------------------------------------------------------------------------
-- 6. MER-06: a model-family rule beats an everyone rule with the better market
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_part uuid;
  v_km int;
  v_rule uuid;
BEGIN
  SELECT c.id INTO v_part
  FROM public.maintenance_service_categories c
  WHERE c.code = 'step1-family-part';

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes,
    manual_id, evidence_page, evidence_url, platform_id
  ) VALUES
    ('b5000001-0000-4000-8000-000000000033'::uuid, 'Step1 family part (everyone, JM)',
     'step1-fam-everyone', 'global', v_part, 9000, 12, 'active', 'maker_manual', 'confirmed',
     ARRAY['car']::text[], 'b5000001-0000-4000-8000-000000000021'::uuid, 10,
     'https://example.com/step1-jm.pdf', NULL),
    ('b5000001-0000-4000-8000-000000000034'::uuid, 'Step1 family part (family, JP)',
     'step1-fam-family', 'platform', v_part, 8000, 12, 'active', 'maker_manual', 'confirmed',
     ARRAY['car']::text[], 'b5000001-0000-4000-8000-000000000022'::uuid, 20,
     'https://example.com/step1-jp.pdf', 'b5000001-0000-4000-8000-000000000001'::uuid);

  IF (SELECT market FROM public.maintenance_task_templates
      WHERE id = 'b5000001-0000-4000-8000-000000000033'::uuid) <> 'JM'
    OR (SELECT market FROM public.maintenance_task_templates
      WHERE id = 'b5000001-0000-4000-8000-000000000034'::uuid) <> 'JP'
  THEN
    RAISE EXCEPTION 'rule markets not copied from their manuals';
  END IF;

  SELECT r.interval_km, r.rule_id INTO v_km, v_rule
  FROM public.schedule_rule_for_part('step1_fixture_org', 'step1_fixture_car', v_part, NULL) r
  LIMIT 1;
  IF v_km IS DISTINCT FROM 8000
    OR v_rule IS DISTINCT FROM 'b5000001-0000-4000-8000-000000000034'::uuid
  THEN
    RAISE EXCEPTION 'model-family rule must win over an everyone rule with a better market; got % / %',
      v_km, v_rule;
  END IF;

  RAISE NOTICE 'check_5_specificity: family rule (8000) beats everyone rule (9000)';
END $$;

-- ---------------------------------------------------------------------------
-- 7. MER-07: a car-maker part rule needs a manual and a page
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_part uuid;
BEGIN
  SELECT c.id INTO v_part
  FROM public.maintenance_service_categories c
  WHERE c.code = 'step1-severe-part';

  BEGIN
    INSERT INTO public.maintenance_task_templates (
      task_name, task_code, template_scope, component_id, interval_km, interval_months,
      status, source_type, confidence, applicable_vehicle_classes, evidence_url
    ) VALUES (
      'Step1 maker rule with no manual', 'step1-bad-maker-1', 'global', v_part, 1000, 1,
      'active', 'maker_manual', 'confirmed', ARRAY['car']::text[], 'https://example.com/x.pdf'
    );
    RAISE EXCEPTION 'maker_manual rule without manual_id/evidence_page was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.maintenance_task_templates (
      task_name, task_code, template_scope, component_id, interval_km, interval_months,
      status, source_type, confidence, applicable_vehicle_classes, evidence_url,
      manual_id
    ) VALUES (
      'Step1 maker rule with no page', 'step1-bad-maker-2', 'global', v_part, 1000, 1,
      'active', 'maker_manual', 'confirmed', ARRAY['car']::text[], 'https://example.com/x.pdf',
      'b5000001-0000-4000-8000-000000000021'::uuid
    );
    RAISE EXCEPTION 'maker_manual rule without evidence_page was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'check_6_maker_manual_evidence: refused without manual_id or evidence_page';
END $$;

-- ---------------------------------------------------------------------------
-- 8. MER-05 database half: "the manual gives one figure" means the normal numbers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_part uuid;
  v_km int;
  v_basis text;
BEGIN
  SELECT c.id INTO v_part
  FROM public.maintenance_service_categories c
  WHERE c.code = 'step1-severe-part';

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    severe_same_as_normal, status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'b5000001-0000-4000-8000-000000000035'::uuid, 'Step1 one figure only', 'step1-one-figure',
    'global', v_part, 10000, 12, true, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  );

  UPDATE fleet.vehicles SET severe_duty = true WHERE id = 'step1_fixture_car';

  SELECT r.interval_km, r.interval_basis INTO v_km, v_basis
  FROM public.schedule_rule_for_part('step1_fixture_org', 'step1_fixture_car', v_part, NULL) r
  LIMIT 1;
  IF v_km IS DISTINCT FROM 10000 OR v_basis IS DISTINCT FROM 'rule' THEN
    RAISE EXCEPTION 'hard-use car must use the normal numbers, got % / %', v_km, v_basis;
  END IF;

  -- The severe columns and the tick cannot both be set.
  BEGIN
    UPDATE public.maintenance_task_templates
    SET severe_interval_km = 7000
    WHERE id = 'b5000001-0000-4000-8000-000000000035'::uuid;
    RAISE EXCEPTION 'severe numbers were accepted with severe_same_as_normal set';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  UPDATE fleet.vehicles SET severe_duty = false WHERE id = 'step1_fixture_car';

  RAISE NOTICE 'check_7_severe_same_as_normal: hard-use car gets the normal interval';
END $$;

-- ---------------------------------------------------------------------------
-- 9. MER-07: page range and one file per family are enforced
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.maintenance_manual (
      platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to
    ) VALUES (
      'b5000001-0000-4000-8000-000000000001'::uuid, 'GEN', 'Step1 bad pages',
      'manuals/step1-bad.pdf', repeat('c', 64), 100, 10, 101
    );
    RAISE EXCEPTION 'page_to greater than page_count was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.maintenance_manual (
      platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to
    ) VALUES (
      'b5000001-0000-4000-8000-000000000001'::uuid, 'OTHER', 'Step1 same file again',
      'manuals/step1-jm-copy.pdf', repeat('a', 64), 300, 210, 232
    );
    RAISE EXCEPTION 'the same file was accepted twice for one family';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.maintenance_manual (
      platform_id, market, title, file_key, file_sha256, page_count, page_from, page_to,
      status, reject_reason
    ) VALUES (
      'b5000001-0000-4000-8000-000000000001'::uuid, 'GEN', 'Step1 rejected',
      'manuals/step1-rejected.pdf', repeat('d', 64), 100, 10, 20, 'rejected', 'bad scan'
    );
    RAISE EXCEPTION 'a rejection with no real reason was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'check_8_manual_shape: page range, one file per family, reject reason enforced';
END $$;

-- ---------------------------------------------------------------------------
-- 10. MER-07 security: anon and authenticated cannot read the manual table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.maintenance_manual LIMIT 1;
    RAISE EXCEPTION 'anon could read maintenance_manual';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%Insufficient%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM 1 FROM public.maintenance_manual LIMIT 1;
    RAISE EXCEPTION 'authenticated could read maintenance_manual';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%Insufficient%' THEN
        RAISE;
      END IF;
  END;

  -- The server reads it with the service role.
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM 1 FROM public.maintenance_manual LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'service_role must be able to read maintenance_manual: %', SQLERRM;
  END;

  RAISE NOTICE 'check_9_manual_security: anon and authenticated refused, service_role allowed';
END $$;

-- ---------------------------------------------------------------------------
-- 10. Retired rows: only As needed drops out of the due list
-- ---------------------------------------------------------------------------
-- Before this step every retired row was scored from its due columns, so a job that does not fit
-- the car still showed in Fleet struck through with its reason. That must stay true. Only the
-- As needed retirement reads 'retired', with no due km and no due date.
DO $$
DECLARE
  v_ok uuid := 'b5000001-0000-4000-8000-000000000014'::uuid;
  v_late uuid := 'b5000001-0000-4000-8000-000000000015'::uuid;
  v_as_needed uuid;
  v_status text;
  v_km numeric;
  v_date date;
  v_days int;
BEGIN
  INSERT INTO public.maintenance_service_categories (id, code, name, kind, op_code, icon_key, sort_order, is_part)
  VALUES
    (v_ok, 'step1-fit-part', 'Step1 powertrain part', 'component', 'STEP1-FIT', 'wrench', 9004, true),
    (v_late, 'step1-late-part', 'Step1 late part', 'component', 'STEP1-LATE', 'wrench', 9005, true)
  ON CONFLICT DO NOTHING;

  -- Two rows the engine retired because the job does not fit this car's powertrain.
  INSERT INTO public.vehicle_component_schedule (
    id, organization_id, vehicle_id, category_id, position, schedule_status, retired_reason,
    baseline_odometer, baseline_date, baseline_source, next_due_km, next_due_date, updated_at
  ) VALUES
    ('b5000001-0000-4000-8000-000000000051'::uuid, 'step1_fixture_org', 'step1_fixture_car', v_ok, NULL,
     'retired', 'Job doesn''t fit this car''s powertrain', 100000, current_date - 30, 'bootstrap',
     NULL, current_date + 100, now()),
    ('b5000001-0000-4000-8000-000000000052'::uuid, 'step1_fixture_org', 'step1_fixture_car', v_late, NULL,
     'retired', 'Job doesn''t fit this car''s powertrain', 100000, current_date - 30, 'bootstrap',
     NULL, current_date - 5, now());

  -- A due date in the future still reads ok, and the due date is still returned.
  SELECT due_status, next_due_date INTO v_status, v_date
  FROM public.fleet_maintenance_due_v
  WHERE vehicle_id = 'step1_fixture_car'
    AND category_id = v_ok;
  IF v_status IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'powertrain-retired row must still read ok, got %', v_status;
  END IF;
  IF v_date IS DISTINCT FROM current_date + 100 THEN
    RAISE EXCEPTION 'powertrain-retired row lost its due date, got %', v_date;
  END IF;

  -- A due date in the past still reads overdue, with the days it is late.
  SELECT due_status, days_overdue INTO v_status, v_days
  FROM public.fleet_maintenance_due_v
  WHERE vehicle_id = 'step1_fixture_car'
    AND category_id = v_late;
  IF v_status IS DISTINCT FROM 'overdue' OR v_days IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'powertrain-retired row must still read overdue/5, got % / %', v_status, v_days;
  END IF;

  -- The As needed retirement: 'retired', and no due numbers at all, even if the row carries stale
  -- ones from before the rule existed.
  SELECT c.id INTO v_as_needed
  FROM public.maintenance_service_categories c
  WHERE c.code = 'wheel_balancing';

  INSERT INTO public.vehicle_component_schedule (
    id, organization_id, vehicle_id, category_id, position, schedule_status, retired_reason,
    baseline_odometer, baseline_date, baseline_source, next_due_km, next_due_date, updated_at
  ) VALUES (
    'b5000001-0000-4000-8000-000000000053'::uuid, 'step1_fixture_org', 'step1_fixture_car', v_as_needed, NULL,
    'retired', 'As needed: done only when a job calls for it', 100000, current_date - 30, 'bootstrap',
    105000, current_date + 10, now()
  );

  SELECT due_status, next_due_km, next_due_date INTO v_status, v_km, v_date
  FROM public.fleet_maintenance_due_v
  WHERE vehicle_id = 'step1_fixture_car'
    AND category_id = v_as_needed;

  IF v_status IS DISTINCT FROM 'retired' THEN
    RAISE EXCEPTION 'As needed retired row must read retired, got %', v_status;
  END IF;
  IF v_km IS NOT NULL OR v_date IS NOT NULL THEN
    RAISE EXCEPTION 'As needed retired row still carries a due: % / %', v_km, v_date;
  END IF;

  -- And the same row's overdue numbers are gone too.
  IF EXISTS (
    SELECT 1
    FROM public.fleet_maintenance_due_v
    WHERE vehicle_id = 'step1_fixture_car'
      AND category_id = v_as_needed
      AND (km_overdue IS NOT NULL OR days_overdue IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'As needed retired row still carries an overdue number';
  END IF;

  RAISE NOTICE 'check_10_retired_due_status: As needed reads retired, a powertrain retirement keeps its status';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'maintenance_rebuild_step1_checks: ok';
END $$;

ROLLBACK;
