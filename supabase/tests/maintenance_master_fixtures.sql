-- Maintenance master fixtures (§2.2 truth table + §8 done-tests). Rolls back.
BEGIN;

CREATE TEMP TABLE mm_truth_log (
  case_id text PRIMARY KEY,
  note text
);

DO $$
DECLARE
  v_org text := 'fx_org_mm';
  v_part uuid := 'e2000003-0000-4000-8000-000000000099'::uuid;
  v_pkg uuid := 'e2000004-0000-4000-8000-000000000001'::uuid;
  v_eng uuid := 'e2000001-0000-4000-8000-000000000001'::uuid;
  v_plat uuid := 'e2000002-0000-4000-8000-000000000010'::uuid;
  v_fam uuid := 'e2000002-0000-4000-8000-000000000011'::uuid;
  v_car uuid := 'e2000005-0000-4000-8000-000000000010'::uuid;
  v_vehicle text := 'fx_vehicle_mm';
  v_rule uuid;
  v_rank int;
  v_cnt int;
  v_row_id uuid;
  v_res jsonb;
  v_interval int;
  v_basis text;
  v_impact jsonb;
  v_tire_part uuid := 'e2000003-0000-4000-8000-000000000044'::uuid;
  v_sched_id uuid;
BEGIN
  INSERT INTO public.engine_family (id, code) VALUES (v_eng, 'FX-ENG')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vehicle_platform (id, code, maker, label, parent_id, family_evidence_url) VALUES
    (v_fam, 'FX-M900', 'FxToyota', 'Fx M900 family', NULL, NULL),
    (v_plat, 'FX-M900A', 'FxToyota', 'Fx M900A', v_fam, 'https://example.com/fx-m900a-family')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, op_code, icon_key, sort_order, is_part, position_aware
  ) VALUES (
    v_part, 'fx-mm-part', 'Fx MM Part', 'component', 'FX-MM', 'wrench', 9999, true, false
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.vehicle_catalog (
    id, make, model, chassis_code, production_start_year, production_end_year,
    platform_id, engine_family_id, vehicle_class
  ) VALUES (
    v_car, 'FxToyota', 'FxRoomy', 'FX-M900A', 2018, 2022, v_plat, v_eng, 'car'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO fleet.vehicles (
    id, organization_id, license_plate, legacy_kv_id, vehicle_catalog_id, year
  ) VALUES (
    v_vehicle, v_org, 'fx_plate_mm', 'fx_legacy_mm', v_car::text, 2018
  ) ON CONFLICT (id) DO UPDATE SET vehicle_catalog_id = EXCLUDED.vehicle_catalog_id;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes,
    vehicle_catalog_id, platform_id, engine_family_id
  ) VALUES
    -- maintenance_task_templates_scope_check needs each scope's target set at insert time.
    ('e2000010-0000-4000-8000-000000000001'::uuid, 'Fx car rule', 'fx-car', 'variant', v_part, 1000, 1, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], v_car, NULL, NULL),
    ('e2000010-0000-4000-8000-000000000002'::uuid, 'Fx plat rule', 'fx-plat', 'platform', v_part, 2000, 2, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], NULL, v_plat, NULL),
    ('e2000010-0000-4000-8000-000000000003'::uuid, 'Fx fam rule', 'fx-fam', 'platform', v_part, 2500, 2, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], NULL, v_fam, NULL),
    ('e2000010-0000-4000-8000-000000000004'::uuid, 'Fx eng rule', 'fx-eng', 'engine_family', v_part, 3000, 3, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], NULL, NULL, v_eng),
    ('e2000010-0000-4000-8000-000000000005'::uuid, 'Fx global rule', 'fx-glob', 'global', v_part, 4000, 4, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[], NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.maintenance_task_templates SET vehicle_catalog_id = v_car WHERE id = 'e2000010-0000-4000-8000-000000000001'::uuid;
  UPDATE public.maintenance_task_templates SET platform_id = v_plat WHERE id = 'e2000010-0000-4000-8000-000000000002'::uuid;
  UPDATE public.maintenance_task_templates SET platform_id = v_fam WHERE id = 'e2000010-0000-4000-8000-000000000003'::uuid;
  UPDATE public.maintenance_task_templates SET engine_family_id = v_eng WHERE id = 'e2000010-0000-4000-8000-000000000004'::uuid;

  -- TT1 car only (disable other ranks temporarily)
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000002'::uuid,
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid,
    'e2000010-0000-4000-8000-000000000005'::uuid
  );
  SELECT r.rule_id, r.rank INTO v_rule, v_rank
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000001'::uuid OR v_rank <> 1 THEN
    RAISE EXCEPTION 'TT1 failed: got % rank %', v_rule, v_rank;
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT1_car_only', 'ok');

  -- TT2 all active -> car wins
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000002'::uuid,
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid,
    'e2000010-0000-4000-8000-000000000005'::uuid
  );
  SELECT r.rule_id, r.rank INTO v_rule, v_rank
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'TT2 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT2_car_beats_all', 'ok');

  -- TT3 platform beats family (drop car rule)
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id = 'e2000010-0000-4000-8000-000000000001'::uuid;
  SELECT r.rule_id, r.rank INTO v_rule, v_rank
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000002'::uuid OR v_rank <> 2 THEN
    RAISE EXCEPTION 'TT3 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT3_platform_beats_family', 'ok');

  -- TT4 platform family beats engine
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id = 'e2000010-0000-4000-8000-000000000002'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid
  );
  SELECT r.rule_id, r.rank INTO v_rule, v_rank
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000003'::uuid OR v_rank <> 3 THEN
    RAISE EXCEPTION 'TT4 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT4_family_beats_engine', 'ok');

  -- TT5 platform beats engine
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000002'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid
  );
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000005'::uuid
  );
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000002'::uuid THEN
    RAISE EXCEPTION 'TT5 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT5_platform_beats_engine', 'ok');

  -- TT6 engine beats global
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id = 'e2000010-0000-4000-8000-000000000002'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000004'::uuid,
    'e2000010-0000-4000-8000-000000000005'::uuid
  );
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000004'::uuid THEN
    RAISE EXCEPTION 'TT6 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT6_engine_beats_global', 'ok');

  -- TT7 global only
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid
  );
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  SELECT r.rule_id, r.rank INTO v_rule, v_rank
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000005'::uuid OR v_rank <> 5 THEN
    RAISE EXCEPTION 'TT7 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT7_global_only', 'ok');

  -- TT9 active global beats needs_checking engine
  UPDATE public.maintenance_task_templates SET status = 'needs_checking'
  WHERE id = 'e2000010-0000-4000-8000-000000000004'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'TT9 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT9_active_global_beats_weak_engine', 'ok');

  -- TT10 active platform beats needs_checking car
  UPDATE public.maintenance_task_templates SET status = 'needs_checking'
  WHERE id = 'e2000010-0000-4000-8000-000000000001'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000002'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid,
    'e2000010-0000-4000-8000-000000000005'::uuid
  );
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000002'::uuid THEN
    RAISE EXCEPTION 'TT10 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT10_active_platform_beats_weak_car', 'ok');

  -- TT11 needs_checking engine only
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000001'::uuid,
    'e2000010-0000-4000-8000-000000000002'::uuid,
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000005'::uuid
  );
  UPDATE public.maintenance_task_templates SET status = 'needs_checking'
  WHERE id = 'e2000010-0000-4000-8000-000000000004'::uuid;
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000004'::uuid THEN
    RAISE EXCEPTION 'TT11 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT11_needs_checking_engine_only', 'ok');

  -- TT12 needs_checking engine beats needs_checking global
  UPDATE public.maintenance_task_templates SET status = 'needs_checking'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  SELECT r.rule_id, r.rank INTO v_rule, v_rank
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000004'::uuid OR v_rank <> 4 THEN
    RAISE EXCEPTION 'TT12 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT12_weak_engine_beats_weak_global', 'ok');

  -- TT13 vehicle class filter
  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000040'::uuid, 'Fx moto rule', 'fx-moto', 'global', v_part,
    8000, 6, 'active', 'roam_policy', 'uncertain', ARRAY['motorcycle']::text[]
  ) ON CONFLICT (id) DO UPDATE SET applicable_vehicle_classes = ARRAY['motorcycle']::text[], status = 'active';
  UPDATE public.maintenance_task_templates SET status = 'active', applicable_vehicle_classes = ARRAY['car']::text[]
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'TT13 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT13_class_filter_car', 'ok');

  -- TT14 severe duty without severe interval uses normal
  UPDATE fleet.vehicles SET severe_duty = true WHERE id = v_vehicle;
  SELECT r.interval_km INTO v_interval FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_interval <> 4000 THEN
    RAISE EXCEPTION 'TT14 failed: interval %', v_interval;
  END IF;
  UPDATE fleet.vehicles SET severe_duty = false WHERE id = v_vehicle;
  INSERT INTO mm_truth_log VALUES ('TT14_severe_fallback_normal', 'ok');

  -- TT15 year window -> global for 2014 car (catalog year 2018 -> use vehicle year)
  UPDATE fleet.vehicles SET year = 2014 WHERE id = v_vehicle;
  UPDATE public.maintenance_task_templates SET status = 'active', year_from = 2016, year_to = 2020
  WHERE id = 'e2000010-0000-4000-8000-000000000002'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid
  );
  UPDATE public.maintenance_task_templates SET status = 'active', year_from = NULL, year_to = NULL
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'TT15 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT15_year_window_falls_back_global', 'ok');
  UPDATE fleet.vehicles SET year = 2018 WHERE id = v_vehicle;

  -- TT8 active global beats needs_checking global
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id IN (
    'e2000010-0000-4000-8000-000000000002'::uuid,
    'e2000010-0000-4000-8000-000000000003'::uuid,
    'e2000010-0000-4000-8000-000000000004'::uuid
  );
  UPDATE public.maintenance_task_templates SET status = 'needs_checking'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000006'::uuid, 'Fx glob weak', 'fx-glob-w', 'global', v_part,
    4100, 4, 'needs_checking', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET status = 'needs_checking';
  SELECT r.rule_id INTO v_rule FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_rule <> 'e2000010-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'TT8 failed';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT8_active_beats_weak_global', 'ok');

  -- TT16 draft/retired only -> none
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE component_id = v_part;
  SELECT count(*) INTO v_cnt FROM public.schedule_rule_for_part(v_org, v_vehicle, v_part) r;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'TT16 failed: expected no rule';
  END IF;
  INSERT INTO mm_truth_log VALUES ('TT16_draft_only_none', 'ok');

  -- Restore one global active rule for recompute tests
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;

  -- Done test 2: brake fluid 40k/24 from part rule (not package interval)
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, op_code, icon_key, sort_order, is_part
  ) VALUES (
    'e2000003-0000-4000-8000-000000000088'::uuid, 'fx-brake-fluid', 'Fx Brake fluid', 'component', 'FX-BRK-F', 'wrench', 9998, true
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    due_kind, status, source_type, confidence
  ) VALUES (
    v_pkg, 'Fx Basic', 'fx-basic', 'global', NULL, 5000, 3, 'service_package', 'active', 'roam_policy', 'uncertain'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.maintenance_package_categories (template_id, category_id)
  VALUES (v_pkg, 'e2000003-0000-4000-8000-000000000088'::uuid)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence
  ) VALUES (
    'e2000010-0000-4000-8000-000000000020'::uuid, 'Fx brake rule', 'fx-brk', 'global',
    'e2000003-0000-4000-8000-000000000088'::uuid, 40000, 24, 'active', 'roam_policy', 'uncertain'
  ) ON CONFLICT (id) DO UPDATE SET interval_km = 40000, interval_months = 24, status = 'active';

  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_component_schedule vcs
    WHERE vcs.organization_id = v_org
      AND vcs.vehicle_id = v_vehicle
      AND vcs.category_id = 'e2000003-0000-4000-8000-000000000088'::uuid
      AND vcs.interval_km_used = 40000
      AND vcs.interval_months_used = 24
  ) THEN
    RAISE EXCEPTION 'Done test 2 failed: brake fluid interval';
  END IF;

  -- Done test 3: part without own interval uses global roam policy interval
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, op_code, icon_key, sort_order, is_part
  ) VALUES (
    'e2000003-0000-4000-8000-000000000066'::uuid, 'fx-belt', 'Fx Belt', 'component', 'FX-BELT', 'wrench', 9996, true
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence
  ) VALUES (
    'e2000010-0000-4000-8000-000000000021'::uuid, 'Fx belt rule', 'fx-belt', 'global',
    'e2000003-0000-4000-8000-000000000066'::uuid, 40000, 24, 'active', 'roam_policy', 'uncertain'
  ) ON CONFLICT (id) DO UPDATE SET interval_km = 40000, interval_months = 24;
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_component_schedule vcs
    WHERE vcs.category_id = 'e2000003-0000-4000-8000-000000000066'::uuid
      AND vcs.interval_km_used = 40000
      AND vcs.interval_months_used = 24
  ) THEN
    RAISE EXCEPTION 'Done test 3 failed';
  END IF;

  -- Done test 4: date-only due when no odometer (3 month oil)
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, op_code, icon_key, sort_order, is_part
  ) VALUES (
    'e2000003-0000-4000-8000-000000000055'::uuid, 'fx-oil', 'Fx Oil', 'component', 'FX-OIL', 'wrench', 9995, true
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence
  ) VALUES (
    'e2000010-0000-4000-8000-000000000022'::uuid, 'Fx oil rule', 'fx-oil', 'global',
    'e2000003-0000-4000-8000-000000000055'::uuid, 5000, 3, 'active', 'roam_policy', 'uncertain'
  ) ON CONFLICT (id) DO UPDATE SET interval_km = 5000, interval_months = 3;
  DELETE FROM fleet.odometer_readings WHERE vehicle_id = v_vehicle;
  -- Create the Fx Oil schedule row first; the baseline UPDATE below needs it to exist.
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  UPDATE public.vehicle_component_schedule SET baseline_date = date '2026-01-01', baseline_odometer = 0
  WHERE organization_id = v_org AND vehicle_id = v_vehicle
    AND category_id = 'e2000003-0000-4000-8000-000000000055'::uuid;
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_component_schedule vcs
    WHERE vcs.category_id = 'e2000003-0000-4000-8000-000000000055'::uuid
      AND vcs.schedule_status = 'odometer_needed'
      AND vcs.next_due_date = date '2026-04-01'
      AND vcs.next_due_km IS NULL
  ) THEN
    RAISE EXCEPTION 'Done test 4 failed';
  END IF;

  -- Done test 5: car rule keeps car row when platform rule changes
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000001'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000002'::uuid;
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  UPDATE public.maintenance_task_templates SET interval_km = 9999
  WHERE id = 'e2000010-0000-4000-8000-000000000002'::uuid;
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_component_schedule vcs
    WHERE vcs.category_id = v_part AND vcs.rule_id = 'e2000010-0000-4000-8000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION 'Done test 5 failed';
  END IF;

  -- Done test 6: retire rule -> next rank on recompute
  -- Retire the car (rank 1) and platform rules; family/engine are draft since TT15, so global wins.
  UPDATE public.maintenance_task_templates SET status = 'retired'
  WHERE id IN ('e2000010-0000-4000-8000-000000000001'::uuid, 'e2000010-0000-4000-8000-000000000002'::uuid);
  UPDATE public.maintenance_task_templates SET status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_component_schedule vcs
    JOIN public.maintenance_task_templates t ON t.id = vcs.rule_id
    WHERE vcs.category_id = v_part AND t.template_scope = 'global'
  ) THEN
    RAISE EXCEPTION 'Done test 6 failed';
  END IF;

  -- Done test 7: manual_override skipped on recompute (Roam interval longer than custom)
  UPDATE public.maintenance_task_templates SET interval_km = 10000
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  UPDATE public.vehicle_component_schedule vcs
  SET
    schedule_status = 'manual_override',
    custom_interval_km = 9000,
    custom_interval_months = NULL,
    custom_reason = 'fx test',
    custom_set_at = now()
  WHERE vcs.organization_id = v_org
    AND vcs.vehicle_id = v_vehicle
    AND vcs.category_id = v_part
    AND vcs.position IS NULL;

  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  IF coalesce(v_res->>'skipped_custom', '0')::int < 1 THEN
    RAISE EXCEPTION 'Done test 7 failed: expected skipped_custom';
  END IF;

  -- D-01: shorter Roam interval clears manual_override (custom 9,000 -> Roam 5,000)
  UPDATE public.maintenance_task_templates SET interval_km = 5000, status = 'active'
  WHERE id = 'e2000010-0000-4000-8000-000000000005'::uuid;
  UPDATE public.maintenance_task_templates SET status = 'draft'
  WHERE id = 'e2000010-0000-4000-8000-000000000001'::uuid;
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_component_schedule vcs
    WHERE vcs.organization_id = v_org
      AND vcs.vehicle_id = v_vehicle
      AND vcs.category_id = v_part
      AND vcs.position IS NULL
      AND vcs.schedule_status <> 'manual_override'
      AND vcs.interval_km_used = 5000
  ) THEN
    RAISE EXCEPTION 'D-01 failed: custom not replaced by shorter Roam rule';
  END IF;
  INSERT INTO mm_truth_log VALUES ('D01_shorter_roam_clears_custom', 'ok');

  -- D-02: custom on one tyre position does not spread to others
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, op_code, icon_key, sort_order, is_part, position_aware
  ) VALUES (
    v_tire_part, 'fx-mm-tires', 'Fx MM Tires', 'component', 'FX-TIRE', 'tires', 9993, true, true
  ) ON CONFLICT (id) DO UPDATE SET position_aware = true;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000050'::uuid, 'Fx tire rule', 'fx-tire', 'global',
    v_tire_part, 40000, 36, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET interval_km = 40000, status = 'active', component_id = EXCLUDED.component_id;

  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);

  UPDATE public.vehicle_component_schedule vcs
  SET
    schedule_status = 'manual_override',
    custom_interval_km = 9000,
    custom_interval_months = 6,
    custom_reason = 'fx lf only',
    custom_set_at = now()
  WHERE vcs.organization_id = v_org
    AND vcs.vehicle_id = v_vehicle
    AND vcs.category_id = v_tire_part
    AND vcs.position = 'LF';

  SELECT r.interval_basis INTO v_basis
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_tire_part, 'LF') r;
  IF v_basis <> 'custom' THEN
    RAISE EXCEPTION 'D-02 failed: LF expected custom, got %', v_basis;
  END IF;

  SELECT r.interval_basis INTO v_basis
  FROM public.schedule_rule_for_part(v_org, v_vehicle, v_tire_part, 'RF') r;
  IF v_basis <> 'rule' THEN
    RAISE EXCEPTION 'D-02 failed: RF expected rule basis, got %', v_basis;
  END IF;
  INSERT INTO mm_truth_log VALUES ('D02_custom_position_scoped', 'ok');

  -- D-03: first odometer reading sets baseline (50,000 + 40,000 = 90,000 due)
  DELETE FROM fleet.odometer_readings WHERE vehicle_id = v_vehicle;
  UPDATE public.vehicle_component_schedule vcs
  SET
    baseline_odometer = 0,
    baseline_date = date '2026-01-01',
    baseline_source = 'bootstrap',
    last_performed_km = NULL,
    last_performed_date = NULL,
    next_due_km = NULL,
    schedule_status = 'odometer_needed',
    custom_interval_km = NULL,
    custom_interval_months = NULL,
    custom_reason = NULL,
    custom_set_at = NULL
  WHERE vcs.organization_id = v_org
    AND vcs.vehicle_id = v_vehicle
    AND vcs.category_id = v_tire_part
    AND vcs.position = 'RF';

  INSERT INTO fleet.odometer_readings (
    id, organization_id, vehicle_id, reading, reading_date, recorded_at, source,
    legacy_kv_id, is_voided, is_anomaly
  ) VALUES (
    'e20000f0-0000-4000-8000-000000000001'::uuid,
    v_org,
    v_vehicle,
    50000,
    date '2026-02-01',
    timestamptz '2026-02-01 12:00:00+00',
    'manual',
    'fx_odo_mm_1',
    false,
    false
  );

  SELECT vcs.id INTO v_sched_id
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = v_org
    AND vcs.vehicle_id = v_vehicle
    AND vcs.category_id = v_tire_part
    AND vcs.position = 'RF';

  PERFORM public.mm_recompute_schedule_row(v_org, v_vehicle, v_tire_part, 'RF', v_sched_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_component_schedule vcs
    WHERE vcs.id = v_sched_id
      AND vcs.baseline_source = 'first_reading'
      AND vcs.baseline_odometer = 50000
      AND vcs.next_due_km = 90000
      AND vcs.schedule_status = 'active'
  ) THEN
    RAISE EXCEPTION 'D-03 failed: first reading baseline / due';
  END IF;
  INSERT INTO mm_truth_log VALUES ('D03_first_reading_baseline', 'ok');

  -- D-04: impact preview for unsaved global rule includes fx car
  v_impact := public.maintenance_rule_impact(jsonb_build_object(
    'component_id', v_part::text,
    'template_scope', 'global',
    'interval_km', 5500,
    'interval_months', 3,
    'status', 'active',
    'source_type', 'roam_policy',
    'confidence', 'uncertain',
    'applicable_vehicle_classes', jsonb_build_array('car')
  ));
  IF coalesce((v_impact->>'count')::int, 0) < 1 THEN
    RAISE EXCEPTION 'D-04 failed: impact count %', v_impact->>'count';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_impact->'changes') elem
    WHERE elem->>'vehicle_id' = v_vehicle
  ) THEN
    RAISE EXCEPTION 'D-04 failed: fx vehicle missing from impact';
  END IF;
  INSERT INTO mm_truth_log VALUES ('D04_unsaved_rule_impact', 'ok');

  -- D-05: migrated daily alert links to component_schedule_id
  SELECT vcs.id INTO v_sched_id
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = v_org
    AND vcs.vehicle_id = v_vehicle
    AND vcs.category_id = v_part
    AND vcs.position IS NULL
  LIMIT 1;

  INSERT INTO fleet.maintenance_alerts (
    id, organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity, status, created_at
  ) VALUES
    (
      'e20000a0-0000-4000-8000-000000000001'::uuid,
      v_org,
      'fx-mm-alert-old',
      v_vehicle,
      v_part,
      NULL,
      current_date - 2,
      'overdue',
      NULL,
      now() - interval '2 days'
    ),
    (
      'e20000a0-0000-4000-8000-000000000002'::uuid,
      v_org,
      'fx-mm-alert-new',
      v_vehicle,
      v_part,
      NULL,
      current_date - 1,
      'overdue',
      NULL,
      now() - interval '1 day'
    )
  ON CONFLICT (id) DO UPDATE SET
    status = NULL,
    component_schedule_id = NULL,
    alert_key = EXCLUDED.alert_key;

  v_res := public.maintenance_alerts_migrate_daily_rows();

  IF NOT EXISTS (
    SELECT 1 FROM fleet.maintenance_alerts a
    WHERE a.organization_id = v_org
      AND a.vehicle_id = v_vehicle
      AND a.category_id = v_part
      AND a.status = 'open'
      AND a.component_schedule_id = v_sched_id
  ) THEN
    RAISE EXCEPTION 'D-05 failed: open alert missing component_schedule_id';
  END IF;
  INSERT INTO mm_truth_log VALUES ('D05_migrate_links_schedule', 'ok');

  -- Overlap: second active -> needs_checking + conflict (dedicated part)
  INSERT INTO public.maintenance_service_categories (
    id, code, name, kind, op_code, icon_key, sort_order, is_part
  ) VALUES (
    'e2000003-0000-4000-8000-000000000077'::uuid, 'fx-ol-part', 'Fx overlap part', 'component', 'FX-OL', 'wrench', 9997, true
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000030'::uuid, 'Fx glob A', 'fx-ga', 'global',
    'e2000003-0000-4000-8000-000000000077'::uuid,
    5000, 3, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET status = 'active', component_id = EXCLUDED.component_id;

  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000031'::uuid, 'Fx glob B', 'fx-gb', 'global',
    'e2000003-0000-4000-8000-000000000077'::uuid,
    6000, 3, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET status = 'active', component_id = EXCLUDED.component_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_task_templates t
    WHERE t.id = 'e2000010-0000-4000-8000-000000000031'::uuid AND t.status = 'needs_checking'
  ) THEN
    RAISE EXCEPTION 'Overlap test failed: second rule not demoted';
  END IF;
  SELECT count(*) INTO v_cnt FROM public.maintenance_rule_conflict WHERE status = 'open';
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Overlap test failed: no conflict row';
  END IF;

  -- W2: no_rule -> active same row count (before part retire)
  UPDATE public.maintenance_task_templates SET status = 'retired'
  WHERE component_id = v_part AND id <> 'e2000010-0000-4000-8000-000000000032'::uuid;
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  INSERT INTO public.maintenance_task_templates (
    id, task_name, task_code, template_scope, component_id, interval_km, interval_months,
    status, source_type, confidence
  ) VALUES (
    'e2000010-0000-4000-8000-000000000032'::uuid, 'Fx glob C', 'fx-gc', 'global', v_part,
    7000, 3, 'active', 'roam_policy', 'uncertain'
  ) ON CONFLICT (id) DO UPDATE SET status = 'active';
  v_res := public.recompute_component_schedules_for_car(v_org, v_vehicle);
  SELECT count(*) INTO v_cnt FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = v_org AND vcs.vehicle_id = v_vehicle AND vcs.category_id = v_part;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'W2 failed: row count %', v_cnt;
  END IF;

  -- Done test 9: retire part type leaves schedule rows retired
  UPDATE public.maintenance_service_categories SET status = 'retired', retired_at = now()
  WHERE id = v_part;
  UPDATE public.vehicle_component_schedule SET schedule_status = 'retired'
  WHERE organization_id = v_org AND vehicle_id = v_vehicle AND category_id = v_part;

  -- authenticated cannot read conflict table
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM 1 FROM public.maintenance_rule_conflict LIMIT 1;
    RAISE EXCEPTION 'RLS test failed: authenticated read succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%permission denied%' AND SQLERRM NOT LIKE '%Insufficient%' THEN
        RAISE;
      END IF;
  END;
END $$;

\echo '--- maintenance_master_checks (post-fixture) ---'
\i /tmp/maintenance_master_checks.sql

SELECT case_id, note FROM mm_truth_log ORDER BY case_id;

ROLLBACK;
