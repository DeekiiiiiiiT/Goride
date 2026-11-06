-- After custom-interval save, recompute dues using custom intervals (do not skip manual_override rows).

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
AS $func$
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
  v_keep_manual boolean;
  v_target_status text;
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
        OR v_row.next_due_km IS DISTINCT FROM NULL
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
      AND v_row.last_performed_km IS NULL
      AND v_row.last_performed_date IS NULL
      AND coalesce(v_row.schedule_status, '') <> 'manual_override'
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

    v_ref_km := coalesce(v_row.last_performed_km, v_row.baseline_odometer);
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

  v_keep_manual := p_existing_id IS NOT NULL
    AND v_row.schedule_status = 'manual_override'
    AND (v_row.custom_interval_km IS NOT NULL OR v_row.custom_interval_months IS NOT NULL);
  v_target_status := CASE WHEN v_keep_manual THEN 'manual_override' ELSE v_status END;

  IF p_existing_id IS NULL THEN
    INSERT INTO public.vehicle_component_schedule (
      organization_id,
      vehicle_id,
      category_id,
      position,
      baseline_odometer,
      baseline_date,
      baseline_source,
      next_due_km,
      next_due_km_max,
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
    next_due_km = v_next_km,
    next_due_km_max = v_next_km_max,
    next_due_date = v_next_date,
    schedule_status = v_target_status,
    computed_at = now(),
    updated_at = now()
  WHERE vcs.id = p_existing_id;

  IF v_row.rule_id IS DISTINCT FROM v_res.rule_id
    OR v_row.next_due_km IS DISTINCT FROM v_next_km
    OR v_row.next_due_date IS DISTINCT FROM v_next_date
    OR v_row.schedule_status IS DISTINCT FROM v_target_status
  THEN
    PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'rule_changed');
  END IF;
  RETURN 'updated';
END;
$func$;
