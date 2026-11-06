-- M-04 / M-09 recompute (alert supersede stub until migration 210).

CREATE OR REPLACE FUNCTION public.maintenance_alerts_supersede_open(
  p_schedule_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mm_fleet_has_valid_odometer(p_vehicle_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM fleet.vehicle_current_odometer_v o
    WHERE o.vehicle_id = p_vehicle_id
      AND o.reading > 0
  );
$$;

CREATE OR REPLACE FUNCTION public.mm_recompute_schedule_row(
  p_org text,
  p_vehicle_id text,
  p_category_id uuid,
  p_position text,
  p_existing_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res record;
  v_row public.vehicle_component_schedule%ROWTYPE;
  v_ref_km numeric;
  v_ref_date date;
  v_next_km numeric;
  v_next_km_max numeric;
  v_next_date date;
  v_has_odo boolean;
  v_status text;
  v_rule_rev int;
BEGIN
  IF p_existing_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
    IF v_row.schedule_status = 'manual_override' THEN
      SELECT * INTO v_res
      FROM public.schedule_rule_for_part(
        p_org, p_vehicle_id, p_category_id, p_position, false
      )
      LIMIT 1;

      IF FOUND
        AND v_res.interval_basis <> 'custom'
        AND (
          (v_res.interval_km IS NOT NULL AND v_row.custom_interval_km IS NOT NULL
            AND v_res.interval_km < v_row.custom_interval_km)
          OR (v_res.interval_months IS NOT NULL AND v_row.custom_interval_months IS NOT NULL
            AND v_res.interval_months < v_row.custom_interval_months)
        )
      THEN
        UPDATE public.vehicle_component_schedule vcs
        SET
          custom_interval_km = NULL,
          custom_interval_months = NULL,
          custom_reason = NULL,
          custom_set_by = NULL,
          custom_set_at = NULL,
          schedule_status = 'active',
          updated_at = now()
        WHERE vcs.id = p_existing_id;
        v_row.schedule_status := 'active';
      ELSE
        RETURN 'skipped_custom';
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_res
  FROM public.schedule_rule_for_part(
    p_org, p_vehicle_id, p_category_id, p_position
  )
  LIMIT 1;

  IF NOT FOUND OR v_res.rule_id IS NULL THEN
    IF p_existing_id IS NOT NULL THEN
      SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
      UPDATE public.vehicle_component_schedule vcs
      SET
        schedule_status = 'no_rule',
        rule_id = NULL,
        rule_revision_no = NULL,
        interval_km_used = NULL,
        interval_months_used = NULL,
        interval_basis = NULL,
        computed_at = now(),
        updated_at = now()
      WHERE vcs.id = p_existing_id;
      IF v_row.rule_id IS DISTINCT FROM NULL
        OR v_row.next_due_miles IS DISTINCT FROM NULL
        OR v_row.next_due_date IS DISTINCT FROM NULL
        OR v_row.schedule_status IS DISTINCT FROM 'no_rule'
      THEN
        PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'rule_changed');
      END IF;
      RETURN 'no_rule';
    END IF;
    RETURN 'none';
  END IF;

  SELECT revision_no INTO v_rule_rev
  FROM public.maintenance_task_templates
  WHERE id = v_res.rule_id;

  v_ref_km := NULL;
  v_ref_date := NULL;

  IF p_existing_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;

    IF public.mm_fleet_has_valid_odometer(p_vehicle_id)
      AND v_row.baseline_source = 'bootstrap'
      AND v_row.last_performed_miles IS NULL
      AND v_row.last_performed_date IS NULL
    THEN
      SELECT r.reading, coalesce(r.reading_date, r.recorded_at::date)
      INTO v_ref_km, v_ref_date
      FROM fleet.odometer_readings r
      WHERE r.vehicle_id = p_vehicle_id
        AND r.is_voided = false
        AND r.is_anomaly = false
      ORDER BY coalesce(r.reading_date, r.recorded_at::date), r.recorded_at, r.id
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.vehicle_component_schedule vcs
        SET
          baseline_odometer = v_ref_km,
          baseline_date = v_ref_date,
          baseline_source = 'first_reading',
          updated_at = now()
        WHERE vcs.id = p_existing_id;
        SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
      END IF;
    END IF;

    v_ref_km := coalesce(v_row.last_performed_miles, v_row.baseline_odometer);
    v_ref_date := coalesce(v_row.last_performed_date, v_row.baseline_date);
  ELSE
    SELECT o.reading, o.reading_date
    INTO v_ref_km, v_ref_date
    FROM fleet.vehicle_current_odometer_v o
    WHERE o.vehicle_id = p_vehicle_id
    LIMIT 1;
    v_ref_km := coalesce(v_ref_km, 0);
    v_ref_date := coalesce(v_ref_date, current_date);
  END IF;

  v_has_odo := public.mm_fleet_has_valid_odometer(p_vehicle_id);

  IF v_res.interval_km IS NOT NULL AND (v_ref_km IS NULL OR NOT v_has_odo) THEN
    v_next_km := NULL;
    v_next_km_max := NULL;
    v_status := 'odometer_needed';
  ELSE
    v_next_km := CASE
      WHEN v_res.interval_km IS NOT NULL AND v_ref_km IS NOT NULL
        THEN v_ref_km + v_res.interval_km
      ELSE NULL
    END;
    v_next_km_max := CASE
      WHEN v_res.interval_km_max IS NOT NULL AND v_ref_km IS NOT NULL
        THEN v_ref_km + v_res.interval_km_max
      ELSE NULL
    END;
    v_status := 'active';
  END IF;

  v_next_date := CASE
    WHEN v_res.interval_months IS NOT NULL AND v_ref_date IS NOT NULL
      THEN (v_ref_date + (v_res.interval_months || ' months')::interval)::date
    ELSE NULL
  END;

  IF p_existing_id IS NULL THEN
    INSERT INTO public.vehicle_component_schedule (
      organization_id,
      vehicle_id,
      category_id,
      position,
      baseline_odometer,
      baseline_date,
      baseline_source,
      next_due_miles,
      next_due_miles_max,
      next_due_date,
      rule_id,
      rule_revision_no,
      interval_km_used,
      interval_months_used,
      interval_basis,
      schedule_status,
      computed_at,
      updated_at
    )
    VALUES (
      p_org,
      p_vehicle_id,
      p_category_id,
      p_position,
      coalesce(v_ref_km, 0),
      coalesce(v_ref_date, current_date),
      'bootstrap',
      v_next_km,
      v_next_km_max,
      v_next_date,
      v_res.rule_id,
      v_rule_rev,
      v_res.interval_km,
      v_res.interval_months,
      v_res.interval_basis,
      v_status,
      now(),
      now()
    );
    RETURN 'created';
  END IF;

  UPDATE public.vehicle_component_schedule vcs
  SET
    rule_id = v_res.rule_id,
    rule_revision_no = v_rule_rev,
    interval_km_used = v_res.interval_km,
    interval_months_used = v_res.interval_months,
    interval_basis = v_res.interval_basis,
    next_due_miles = v_next_km,
    next_due_miles_max = v_next_km_max,
    next_due_date = v_next_date,
    schedule_status = v_status,
    computed_at = now(),
    updated_at = now()
  WHERE vcs.id = p_existing_id;

  IF v_row.rule_id IS DISTINCT FROM v_res.rule_id
    OR v_row.next_due_miles IS DISTINCT FROM v_next_km
    OR v_row.next_due_date IS DISTINCT FROM v_next_date
    OR v_row.schedule_status IS DISTINCT FROM v_status
  THEN
    PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'rule_changed');
  END IF;
  RETURN 'updated';
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_component_schedules_for_car(
  p_org text,
  p_vehicle_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_part uuid;
  v_pos text;
  v_existing uuid;
  v_action text;
  v_created int := 0;
  v_updated int := 0;
  v_no_rule int := 0;
  v_skipped int := 0;
BEGIN
  -- Parts with a live rule, plus parts this car already has a row for (so a row whose
  -- rules were all retired is revisited and becomes no_rule).
  FOR v_part IN
    SELECT t.component_id
    FROM public.maintenance_task_templates t
    WHERE t.component_id IS NOT NULL
      AND t.status NOT IN ('draft', 'retired')
    UNION
    SELECT vcs.category_id
    FROM public.vehicle_component_schedule vcs
    WHERE vcs.organization_id = p_org
      AND vcs.vehicle_id = p_vehicle_id
      AND vcs.category_id IS NOT NULL
  LOOP
    FOR v_pos IN
      SELECT pos.p
      FROM public.maintenance_service_categories c
      CROSS JOIN LATERAL (
        SELECT unnest(ARRAY['LF', 'RF', 'LR', 'RR']::text[]) AS p
        WHERE c.position_aware
        UNION ALL
        SELECT NULL::text WHERE NOT c.position_aware
      ) pos
      WHERE c.id = v_part
    LOOP
      SELECT vcs.id INTO v_existing
      FROM public.vehicle_component_schedule vcs
      WHERE vcs.organization_id = p_org
        AND vcs.vehicle_id = p_vehicle_id
        AND vcs.category_id = v_part
        AND vcs.position IS NOT DISTINCT FROM v_pos;

      v_action := public.mm_recompute_schedule_row(
        p_org, p_vehicle_id, v_part, v_pos, v_existing
      );

      CASE v_action
        WHEN 'created' THEN v_created := v_created + 1;
        WHEN 'updated' THEN v_updated := v_updated + 1;
        WHEN 'no_rule' THEN v_no_rule := v_no_rule + 1;
        WHEN 'skipped_custom' THEN v_skipped := v_skipped + 1;
        ELSE NULL;
      END CASE;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'no_rule', v_no_rule,
    'skipped_custom', v_skipped
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_rule_impact_cars(p_rule_id uuid)
RETURNS TABLE (organization_id text, vehicle_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rule public.maintenance_task_templates%ROWTYPE;
BEGIN
  SELECT * INTO v_rule FROM public.maintenance_task_templates WHERE id = p_rule_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fv.organization_id, fv.id
  FROM fleet.vehicles fv
  JOIN public.vehicle_catalog vc
    ON vc.id::text = fv.vehicle_catalog_id
    OR vc.id = NULLIF(fv.vehicle_catalog_id, '')::uuid
  LEFT JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
  WHERE
    (v_rule.template_scope = 'variant' AND vc.id = v_rule.vehicle_catalog_id)
    OR (v_rule.template_scope = 'platform' AND vc.platform_id = v_rule.platform_id)
    OR (
      v_rule.template_scope = 'platform'
      AND vp.parent_id = v_rule.platform_id
    )
    OR (v_rule.template_scope = 'engine_family' AND vc.engine_family_id = v_rule.engine_family_id)
    OR v_rule.template_scope = 'global';
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_rule_impact_cars_from_rule(p_rule jsonb)
RETURNS TABLE (organization_id text, vehicle_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scope text := nullif(btrim(p_rule->>'template_scope'), '');
  v_catalog uuid := nullif(p_rule->>'vehicle_catalog_id', '')::uuid;
  v_platform uuid := nullif(p_rule->>'platform_id', '')::uuid;
  v_engine uuid := nullif(p_rule->>'engine_family_id', '')::uuid;
BEGIN
  IF v_scope IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT fv.organization_id, fv.id
  FROM fleet.vehicles fv
  JOIN public.vehicle_catalog vc
    ON vc.id::text = fv.vehicle_catalog_id
    OR vc.id = NULLIF(fv.vehicle_catalog_id, '')::uuid
  LEFT JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
  WHERE
    (v_scope = 'variant' AND vc.id = v_catalog)
    OR (v_scope = 'platform' AND vc.platform_id = v_platform)
    OR (
      v_scope = 'platform'
      AND vp.parent_id = v_platform
    )
    OR (v_scope = 'engine_family' AND vc.engine_family_id = v_engine)
    OR v_scope = 'global';
END;
$$;

CREATE OR REPLACE FUNCTION public.maintenance_rule_impact(p_rule jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_changes jsonb := '[]'::jsonb;
  v_snapshots jsonb := '[]'::jsonb;
  v_component_id uuid := nullif(p_rule->>'component_id', '')::uuid;
  v_rule_id uuid := coalesce(nullif(p_rule->>'id', '')::uuid, gen_random_uuid());
  v_car record;
  v_pos text;
  v_positions text[];
  v_elem jsonb;
  v_existing record;
  v_res record;
  v_classes text[];
BEGIN
  IF v_component_id IS NULL THEN
    RETURN jsonb_build_object('changes', '[]'::jsonb, 'count', 0);
  END IF;

  SELECT CASE
    WHEN c.position_aware THEN ARRAY['LF', 'RF', 'LR', 'RR']::text[]
    ELSE ARRAY[NULL::text]
  END
  INTO v_positions
  FROM public.maintenance_service_categories c
  WHERE c.id = v_component_id;

  IF v_positions IS NULL THEN
    v_positions := ARRAY[NULL::text];
  END IF;

  v_classes := coalesce(
    ARRAY(SELECT jsonb_array_elements_text(p_rule->'applicable_vehicle_classes')),
    ARRAY['car']::text[]
  );

  BEGIN
    FOR v_car IN SELECT * FROM public.maintenance_rule_impact_cars_from_rule(p_rule)
    LOOP
      FOREACH v_pos IN ARRAY v_positions
      LOOP
        SELECT vcs.rule_id, vcs.next_due_miles, vcs.next_due_date
        INTO v_existing
        FROM public.vehicle_component_schedule vcs
        WHERE vcs.organization_id = v_car.organization_id
          AND vcs.vehicle_id = v_car.vehicle_id
          AND vcs.category_id = v_component_id
          AND vcs.position IS NOT DISTINCT FROM v_pos
        LIMIT 1;

        v_snapshots := v_snapshots || jsonb_build_array(jsonb_build_object(
          'organization_id', v_car.organization_id,
          'vehicle_id', v_car.vehicle_id,
          'position', v_pos,
          'before', jsonb_build_object(
            'rule_id', v_existing.rule_id,
            'next_due_miles', v_existing.next_due_miles,
            'next_due_date', v_existing.next_due_date
          )
        ));
      END LOOP;
    END LOOP;

    INSERT INTO public.maintenance_task_templates (
      id,
      task_name,
      task_code,
      template_scope,
      component_id,
      interval_miles,
      interval_months,
      status,
      source_type,
      confidence,
      applicable_vehicle_classes,
      vehicle_catalog_id,
      platform_id,
      engine_family_id
    )
    VALUES (
      v_rule_id,
      coalesce(nullif(p_rule->>'task_name', ''), 'Impact preview'),
      coalesce(nullif(p_rule->>'task_code', ''), 'impact-preview'),
      coalesce(nullif(p_rule->>'template_scope', ''), 'global'),
      v_component_id,
      nullif(p_rule->>'interval_miles', '')::integer,
      nullif(p_rule->>'interval_months', '')::integer,
      coalesce(nullif(p_rule->>'status', ''), 'active'),
      coalesce(nullif(p_rule->>'source_type', ''), 'roam_policy'),
      coalesce(nullif(p_rule->>'confidence', ''), 'uncertain'),
      v_classes,
      nullif(p_rule->>'vehicle_catalog_id', '')::uuid,
      nullif(p_rule->>'platform_id', '')::uuid,
      nullif(p_rule->>'engine_family_id', '')::uuid
    )
    ON CONFLICT (id) DO UPDATE SET
      task_name = EXCLUDED.task_name,
      task_code = EXCLUDED.task_code,
      template_scope = EXCLUDED.template_scope,
      component_id = EXCLUDED.component_id,
      interval_miles = EXCLUDED.interval_miles,
      interval_months = EXCLUDED.interval_months,
      status = EXCLUDED.status,
      source_type = EXCLUDED.source_type,
      confidence = EXCLUDED.confidence,
      applicable_vehicle_classes = EXCLUDED.applicable_vehicle_classes,
      vehicle_catalog_id = EXCLUDED.vehicle_catalog_id,
      platform_id = EXCLUDED.platform_id,
      engine_family_id = EXCLUDED.engine_family_id;

    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_snapshots)
    LOOP
      SELECT * INTO v_res
      FROM public.schedule_rule_for_part(
        v_elem->>'organization_id',
        v_elem->>'vehicle_id',
        v_component_id,
        nullif(v_elem->>'position', '')::text
      )
      LIMIT 1;

      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'organization_id', v_elem->>'organization_id',
        'vehicle_id', v_elem->>'vehicle_id',
        'position', v_elem->>'position',
        'before', v_elem->'before',
        'after', jsonb_build_object(
          'rule_id', v_res.rule_id,
          'interval_km', v_res.interval_km,
          'interval_months', v_res.interval_months
        )
      ));
    END LOOP;

    RAISE EXCEPTION 'mm_rule_impact_rollback';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'mm_rule_impact_rollback' THEN
        RAISE;
      END IF;
  END;

  RETURN jsonb_build_object(
    'changes', v_changes,
    'count', jsonb_array_length(v_changes)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_component_schedules_for_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_car record;
  v_tot jsonb := '[]'::jsonb;
  v_one jsonb;
BEGIN
  FOR v_car IN SELECT * FROM public.maintenance_rule_impact_cars(p_rule_id)
  LOOP
    v_one := public.recompute_component_schedules_for_car(v_car.organization_id, v_car.vehicle_id);
    v_tot := v_tot || jsonb_build_array(v_one);
  END LOOP;
  RETURN jsonb_build_object('cars', v_tot);
END;
$$;

REVOKE ALL ON FUNCTION public.maintenance_alerts_supersede_open(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_fleet_has_valid_odometer(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_recompute_schedule_row(text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_component_schedules_for_car(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_rule_impact_cars(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_rule_impact_cars_from_rule(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_rule_impact(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_component_schedules_for_rule(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_component_schedules_for_car(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintenance_rule_impact(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_component_schedules_for_rule(uuid) TO service_role;
