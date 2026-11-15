-- Powertrain job fit — Round S1 (schedules + job_fit_models + service history columns).

CREATE OR REPLACE FUNCTION public._job_fit_resolve_overrides(
  p_job_id uuid,
  p_overrides jsonb,
  OUT fits_powertrains text[],
  OUT fits_fuels text[]
)
RETURNS record
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_key text;
BEGIN
  SELECT j.*, g.fits_powertrains AS g_pt, g.fits_fuels AS g_fu
  INTO v_job
  FROM public.maintenance_service_categories j
  LEFT JOIN public.maintenance_service_categories g ON g.id = j.parent_id
  WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_fit_count_bad_override' USING HINT = 'Job not found.';
  END IF;

  fits_powertrains := coalesce(v_job.fits_powertrains, v_job.g_pt);
  fits_fuels := coalesce(v_job.fits_fuels, v_job.g_fu);

  IF p_overrides IS NULL THEN
    RETURN;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_overrides)
  LOOP
    IF v_key NOT IN ('fits_powertrains', 'fits_fuels') THEN
      RAISE EXCEPTION 'job_fit_count_bad_override'
        USING HINT = 'Only fits_powertrains and fits_fuels may be overridden.';
    END IF;
  END LOOP;

  IF p_overrides ? 'fits_powertrains' THEN
    IF jsonb_typeof(p_overrides -> 'fits_powertrains') = 'null' THEN
      fits_powertrains := v_job.g_pt;
    ELSIF jsonb_typeof(p_overrides -> 'fits_powertrains') = 'array' THEN
      IF jsonb_array_length(p_overrides -> 'fits_powertrains') = 0 THEN
        RAISE EXCEPTION 'job_fit_count_bad_override'
          USING HINT = 'fits_powertrains cannot be an empty array.';
      END IF;
      fits_powertrains := ARRAY(SELECT jsonb_array_elements_text(p_overrides -> 'fits_powertrains'));
    ELSE
      RAISE EXCEPTION 'job_fit_count_bad_override'
        USING HINT = 'fits_powertrains override must be null or an array.';
    END IF;
  END IF;

  IF p_overrides ? 'fits_fuels' THEN
    IF jsonb_typeof(p_overrides -> 'fits_fuels') = 'null' THEN
      fits_fuels := v_job.g_fu;
    ELSIF jsonb_typeof(p_overrides -> 'fits_fuels') = 'array' THEN
      IF jsonb_array_length(p_overrides -> 'fits_fuels') = 0 THEN
        RAISE EXCEPTION 'job_fit_count_bad_override'
          USING HINT = 'fits_fuels cannot be an empty array.';
      END IF;
      fits_fuels := ARRAY(SELECT jsonb_array_elements_text(p_overrides -> 'fits_fuels'));
    ELSE
      RAISE EXCEPTION 'job_fit_count_bad_override'
        USING HINT = 'fits_fuels override must be null or an array.';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.job_fit_count(
  p_job_id uuid,
  p_overrides jsonb DEFAULT NULL
)
RETURNS TABLE (fits int, unknown int, total int)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pt text[];
  v_fu text[];
BEGIN
  SELECT r.fits_powertrains, r.fits_fuels
  INTO v_pt, v_fu
  FROM public._job_fit_resolve_overrides(p_job_id, p_overrides) r;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE x.a = 'yes')::int,
    count(*) FILTER (WHERE x.a = 'unknown')::int,
    count(*)::int
  FROM (
    SELECT public._job_fit_for_model(p_job_id, c.id, v_pt, v_fu, true) AS a
    FROM public.vehicle_catalog c
    WHERE c.vehicle_class = 'car'
  ) x;
END;
$$;

CREATE OR REPLACE FUNCTION public.job_fit_models(
  p_job_id uuid,
  p_overrides jsonb DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  vehicle_catalog_id uuid,
  make text,
  model text,
  year_from int,
  year_to int,
  powertrain text,
  fuel text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pt text[];
  v_fu text[];
  v_lim int;
BEGIN
  SELECT r.fits_powertrains, r.fits_fuels
  INTO v_pt, v_fu
  FROM public._job_fit_resolve_overrides(p_job_id, p_overrides) r;

  v_lim := greatest(1, coalesce(p_limit, 50));

  RETURN QUERY
  SELECT
    c.id,
    c.make,
    c.model,
    c.production_start_year,
    c.production_end_year,
    c.powertrain,
    c.fuel
  FROM public.vehicle_catalog c
  WHERE c.vehicle_class = 'car'
    AND public._job_fit_for_model(p_job_id, c.id, v_pt, v_fu, true) = 'yes'
  ORDER BY c.make, c.model, c.production_start_year, c.production_end_year, c.id
  LIMIT v_lim;
END;
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
  v_catalog_raw text;
  v_catalog_id uuid;
  v_fits text;
  v_no_fit_reason constant text := 'Job doesn''t fit this car''s powertrain';
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

  SELECT v.vehicle_catalog_id INTO v_catalog_raw
  FROM fleet.vehicles v
  WHERE v.id = p_vehicle_id;

  v_catalog_id := NULL;
  IF v_catalog_raw IS NOT NULL AND btrim(v_catalog_raw) <> '' THEN
    IF v_catalog_raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      v_catalog_id := v_catalog_raw::uuid;
    END IF;
  END IF;

  SELECT f.fits INTO v_fits
  FROM public.job_fits_car(v_catalog_id, ARRAY[p_category_id]) f
  LIMIT 1;

  v_fits := coalesce(v_fits, 'unknown');

  IF v_fits = 'no' THEN
    IF p_existing_id IS NOT NULL THEN
      SELECT * INTO v_row FROM public.vehicle_component_schedule WHERE id = p_existing_id;
      IF coalesce(v_row.schedule_status, '') = 'retired' THEN
        RETURN 'skipped_no_fit';
      END IF;
      UPDATE public.vehicle_component_schedule vcs
      SET
        schedule_status = 'retired',
        retired_reason = v_no_fit_reason,
        updated_at = now()
      WHERE vcs.id = p_existing_id;
      PERFORM public.maintenance_alerts_supersede_open(p_existing_id, 'schedule_retired');
      RETURN 'retired_no_fit';
    END IF;
    RETURN 'skipped_no_fit';
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
      AND coalesce(v_row.baseline_source, 'bootstrap') = 'bootstrap'
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
    retired_reason = CASE
      WHEN v_target_status <> 'retired'
        AND coalesce(v_row.retired_reason, '') = v_no_fit_reason
      THEN NULL
      ELSE vcs.retired_reason
    END,
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

CREATE OR REPLACE VIEW fleet.maintenance_service_history_v AS
 SELECT l.id AS line_id,
    wo.organization_id,
    wo.vehicle_id,
    wo.id AS work_order_id,
    wo.log_number,
    wo.performed_at_date,
    wo.odometer AS performed_at_miles,
    wo.provider,
    wo.currency,
    wo.invoice_url,
    wo.voided_at,
    l.component_id AS category_id,
    l.component_code AS category_code,
    l.component_name AS category_name,
    l.action,
    l.positions,
    l.part_number,
    l.brand,
    l.material,
    l.line_total,
    l.values_json,
    wo.closed_at AS completed_at,
    wo.discount_amount,
    l.fit_at_log,
    j.is_high_voltage
   FROM public.maintenance_work_order_lines l
     JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
     LEFT JOIN public.maintenance_service_categories j ON j.id = l.component_id
  WHERE wo.status = 'completed'::text AND wo.voided_at IS NULL AND l.voided_at IS NULL;

CREATE OR REPLACE VIEW public.fleet_maintenance_service_history_v
  WITH (security_invoker = true) AS
 SELECT * FROM fleet.maintenance_service_history_v;

GRANT SELECT ON public.fleet_maintenance_service_history_v TO service_role;

REVOKE ALL ON FUNCTION public._job_fit_resolve_overrides(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_fit_models(uuid, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._job_fit_resolve_overrides(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_fit_models(uuid, jsonb, int) TO service_role;

NOTIFY pgrst, 'reload schema';