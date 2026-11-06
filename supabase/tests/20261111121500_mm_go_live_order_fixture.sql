-- S-04 fixture: 3 legacy daily alert rows → migrate + recompute → 1 open linked alert.
BEGIN;

CREATE TEMP TABLE mm_truth_log (case_id text PRIMARY KEY, note text);

DO $$
DECLARE
  v_org text := 'fx_org_mm';
  v_part uuid := 'e2000003-0000-4000-8000-000000000099'::uuid;
  v_eng uuid := 'e2000001-0000-4000-8000-000000000001'::uuid;
  v_plat uuid := 'e2000002-0000-4000-8000-000000000010'::uuid;
  v_car uuid := 'e2000005-0000-4000-8000-000000000010'::uuid;
  v_vehicle text := 'fx_vehicle_mm';
  v_sched_id uuid;
  v_open int;
  v_super int;
BEGIN
  INSERT INTO public.engine_family (id, code) VALUES (v_eng, 'FX-ENG')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vehicle_platform (id, code, maker, label) VALUES
    (v_plat, 'FX-M900A', 'FxToyota', 'Fx M900A')
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
    status, source_type, confidence, applicable_vehicle_classes
  ) VALUES (
    'e2000010-0000-4000-8000-000000000005'::uuid, 'Fx global rule', 'fx-glob', 'global', v_part,
    1000, 1, 'active', 'roam_policy', 'uncertain', ARRAY['car']::text[]
  ) ON CONFLICT (id) DO UPDATE SET status = 'active', component_id = EXCLUDED.component_id;

  PERFORM public.recompute_component_schedules_for_car(v_org, v_vehicle);

  SELECT vcs.id INTO v_sched_id
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.organization_id = v_org
    AND vcs.vehicle_id = v_vehicle
    AND vcs.category_id = v_part
    AND vcs.position IS NULL
  LIMIT 1;

  IF v_sched_id IS NULL THEN
    RAISE EXCEPTION 'S-04 fixture setup failed: no schedule row';
  END IF;

  INSERT INTO fleet.maintenance_alerts (
    id, organization_id, alert_key, vehicle_id, category_id, position, alert_date, severity, status, created_at
  ) VALUES
    (
      'e20000b0-0000-4000-8000-000000000001'::uuid,
      v_org,
      'fx-mm-alert-oldest',
      v_vehicle,
      v_part,
      NULL,
      current_date - 3,
      'overdue',
      NULL,
      now() - interval '3 days'
    ),
    (
      'e20000b0-0000-4000-8000-000000000002'::uuid,
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
      'e20000b0-0000-4000-8000-000000000003'::uuid,
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
    resolved_at = NULL,
    resolution_reason = NULL,
    alert_key = EXCLUDED.alert_key,
    created_at = EXCLUDED.created_at;

  PERFORM public.maintenance_alerts_migrate_daily_rows();
  PERFORM public.recompute_component_schedules_for_car(v_org, v_vehicle);

  SELECT count(*) INTO v_open
  FROM fleet.maintenance_alerts a
  WHERE a.organization_id = v_org
    AND a.vehicle_id = v_vehicle
    AND a.category_id = v_part
    AND a.status = 'open';

  IF v_open <> 1 THEN
    RAISE EXCEPTION 'S-04 fixture failed: % open alerts (expected 1)', v_open;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fleet.maintenance_alerts a
    WHERE a.organization_id = v_org
      AND a.vehicle_id = v_vehicle
      AND a.category_id = v_part
      AND a.status = 'open'
      AND a.component_schedule_id = v_sched_id
  ) THEN
    RAISE EXCEPTION 'S-04 fixture failed: open alert not linked to schedule';
  END IF;

  SELECT count(*) INTO v_super
  FROM fleet.maintenance_alerts a
  WHERE a.organization_id = v_org
    AND a.vehicle_id = v_vehicle
    AND a.category_id = v_part
    AND a.status = 'superseded'
    AND a.resolution_reason = 'migrated_daily_row';

  IF v_super <> 2 THEN
    RAISE EXCEPTION 'S-04 fixture failed: % superseded migrated rows (expected 2)', v_super;
  END IF;

  INSERT INTO mm_truth_log VALUES ('S04_go_live_order_one_open_linked', 'ok');
END $$;

SELECT case_id, note FROM mm_truth_log;

ROLLBACK;
