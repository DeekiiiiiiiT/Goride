-- §3.6 maintenance master SQL checks (counts must be 0).

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.schedule_status = 'active'
    AND vcs.next_due_km IS NULL
    AND vcs.next_due_date IS NULL;
  RAISE NOTICE 'check_1_active_rows_without_due: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_1 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.vehicle_component_schedule vcs
  JOIN public.maintenance_task_templates t ON t.id = vcs.rule_id
  CROSS JOIN LATERAL (
    SELECT r.interval_km, r.interval_months, r.interval_basis
    FROM public.schedule_rule_for_part(
      vcs.organization_id, vcs.vehicle_id, vcs.category_id, vcs.position
    ) r
    LIMIT 1
  ) sr
  WHERE vcs.schedule_status NOT IN ('manual_override', 'no_rule', 'retired')
    AND vcs.rule_id IS NOT NULL
    AND (
      vcs.interval_km_used IS DISTINCT FROM sr.interval_km
      OR vcs.interval_months_used IS DISTINCT FROM sr.interval_months
      OR vcs.interval_basis IS DISTINCT FROM sr.interval_basis
    );
  RAISE NOTICE 'check_2_interval_used_mismatch: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_2 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.vehicle_component_schedule vcs
  JOIN public.maintenance_task_templates t ON t.id = vcs.rule_id
  WHERE vcs.schedule_status NOT IN ('manual_override', 'no_rule', 'retired')  -- same exclusions as check_2
    AND vcs.rule_revision_no IS NOT NULL
    AND vcs.rule_revision_no < t.revision_no;
  RAISE NOTICE 'check_3_rule_revision_behind: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_3 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_task_templates t
  WHERE t.component_id IS NOT NULL
    AND t.status = 'active'
    AND t.source_type <> 'roam_policy'
    AND t.evidence_url IS NULL;
  RAISE NOTICE 'check_4_active_rules_missing_evidence: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_4 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  -- Audit §196/§265: a package is a rule with component_id NULL (due_kind is unchanged and stays
  -- 'service_package' on every row), so the only bad shape is a part rule with package links.
  FROM (
    SELECT t.id
    FROM public.maintenance_task_templates t
    WHERE t.component_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.maintenance_package_categories mpc
        WHERE mpc.template_id = t.id
      )
  ) x;
  RAISE NOTICE 'check_5_package_part_rule_shape: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_5 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT
      a.organization_id,
      a.vehicle_id,
      a.category_id,
      coalesce(a.position, '-') AS pos
    FROM fleet.maintenance_alerts a
    WHERE a.status = 'open'
    GROUP BY 1, 2, 3, 4
    HAVING count(*) > 1
  ) d;
  RAISE NOTICE 'check_6_multiple_open_alerts: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_6 failed: % groups', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT grantee, table_schema, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee IN ('anon', 'authenticated')
      AND table_schema = 'public'
      AND table_name IN (
        'maintenance_task_templates',
        'maintenance_package_categories',
        'maintenance_service_categories',
        'vehicle_component_schedule',
        'maintenance_rule_conflict',
        'vehicle_catalog',
        'vehicle_platform',
        'engine_family',
        'catalog_spec_value',
        'spec_key',
        'vehicle_oe_number',
        'platform_revision'
      )
  ) g;
  RAISE NOTICE 'check_7_anon_authenticated_grants: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_7 failed: % grants', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_task_templates a
  JOIN public.maintenance_task_templates b
    ON b.id <> a.id
   AND b.component_id = a.component_id
   AND b.template_scope = a.template_scope
   AND b.status = 'active'
   AND a.status = 'active'
   AND a.component_id IS NOT NULL
   AND public.mm_rule_target_key(
     a.template_scope, a.vehicle_catalog_id, a.platform_id, a.engine_family_id
   ) = public.mm_rule_target_key(
     b.template_scope, b.vehicle_catalog_id, b.platform_id, b.engine_family_id
   )
   AND int4range(coalesce(a.year_from, 0), coalesce(a.year_to, 9999), '[]')
     && int4range(coalesce(b.year_from, 0), coalesce(b.year_to, 9999), '[]')
   AND public.mm_classes_overlap(a.applicable_vehicle_classes, b.applicable_vehicle_classes);
  RAISE NOTICE 'check_8_active_rule_overlaps: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_8 failed: % pairs', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM fleet.maintenance_alerts a
  WHERE a.status = 'open'
    AND a.component_schedule_id IS NULL;
  RAISE NOTICE 'check_9_open_alerts_missing_schedule_link: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_9 failed: % alerts', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'fleet')
    AND p.prosrc ~* '(next_due_miles|last_performed_miles|interval_miles|default_interval_miles)'
    AND p.prosrc ~* '(vehicle_component_schedule|maintenance_task_templates|maintenance_service_categories)';
  RAISE NOTICE 'check_10_db_functions_stale_mile_columns: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_10 failed: % functions', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.vehicle_component_schedule vcs
  WHERE vcs.schedule_status = 'odometer_needed'
    AND public.mm_fleet_has_valid_odometer(vcs.vehicle_id);
  RAISE NOTICE 'check_11_odometer_needed_with_valid_odometer: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'check_11 failed: % rows', v_cnt;
  END IF;
END $$;
