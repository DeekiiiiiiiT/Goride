-- LC-15 (docs/log-service-parts-gaps-audit.md): a job an inspection found can carry the garage's QUOTE (what it will
-- cost; not paid). Stored only in values_json.quote_amount on the J$ 0 found line: it is never in line_total, the
-- service total or spend. It fills in the price when the job is marked Done (Log it now), where the real cost is saved.
-- Replaces fleet_add_found_job (20261119211043) with one extra, optional argument p_quote.

DROP FUNCTION IF EXISTS public.fleet_add_found_job(text, uuid, uuid, uuid, text[], text);

CREATE OR REPLACE FUNCTION public.fleet_add_found_job(
  p_organization_id text,
  p_actor_id uuid,
  p_work_order_id uuid,
  p_component_id uuid,
  p_positions text[],
  p_note text,
  p_quote numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_wo record;
  v_inspection_job uuid;
  v_job record;
  v_system record;
  v_line_id uuid;
  v_sorted_positions text[];
  v_allowed text[];
  v_pos_code text;
  v_note text;
  v_listed_line record;
  v_sort integer;
  v_quote numeric;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  SELECT w.id, w.vehicle_id, w.status, w.voided_at
  INTO v_wo
  FROM public.maintenance_work_orders w
  WHERE w.id = p_work_order_id
    AND w.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;
  IF v_wo.voided_at IS NOT NULL OR v_wo.status <> 'completed' THEN
    RAISE EXCEPTION 'service_not_open_for_finds'
      USING HINT = 'Only a saved, not deleted inspection can get more jobs.';
  END IF;

  -- The service's inspection job (first one, same rule as the found-work list's "inspectionJobName").
  SELECT il.component_id INTO v_inspection_job
  FROM public.maintenance_work_order_lines il
  JOIN public.maintenance_service_categories c ON c.id = il.component_id
  WHERE il.work_order_id = p_work_order_id
    AND il.voided_at IS NULL
    AND coalesce(il.recommended, false) = false
    AND c.records_findings = true
  ORDER BY il.sort_order, il.created_at, il.id
  LIMIT 1;

  IF v_inspection_job IS NULL THEN
    RAISE EXCEPTION 'not_an_inspection'
      USING HINT = 'This service has no inspection job.';
  END IF;

  SELECT c.id, c.code, c.name, c.position_aware, c.position_scheme, c.records_findings, c.default_action
  INTO v_job
  FROM public.maintenance_service_categories c
  WHERE c.id = p_component_id
    AND coalesce(c.status, 'active') = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_not_found';
  END IF;
  IF coalesce(v_job.records_findings, false) THEN
    RAISE EXCEPTION 'job_is_inspection'
      USING HINT = 'An inspection can''t be a job the inspection found.';
  END IF;

  v_sorted_positions := NULL;
  IF coalesce(array_length(p_positions, 1), 0) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT e ORDER BY e), ARRAY[]::text[])
    INTO v_sorted_positions
    FROM unnest(p_positions) e;

    v_allowed := public.maintenance_position_codes_allowed(
      v_job.code, v_job.position_aware, v_job.position_scheme
    );

    IF 'unknown' = ANY(v_sorted_positions) AND array_length(v_sorted_positions, 1) > 1 THEN
      RAISE EXCEPTION 'position_invalid'
        USING HINT = '"Not sure" can''t be picked together with a position.';
    END IF;

    FOREACH v_pos_code IN ARRAY p_positions LOOP
      IF NOT (v_pos_code = ANY(v_allowed)) THEN
        RAISE EXCEPTION 'position_invalid'
          USING HINT = 'That position doesn''t fit this job.';
      END IF;
    END LOOP;
  END IF;

  v_note := nullif(left(trim(coalesce(p_note, '')), 500), '');

  IF p_quote IS NOT NULL AND (p_quote < 0 OR p_quote > 100000000) THEN
    RAISE EXCEPTION 'quote_invalid'
      USING HINT = 'The quote must be a price from 0 up.';
  END IF;
  v_quote := CASE WHEN p_quote IS NULL OR p_quote = 0 THEN NULL ELSE round(p_quote, 2) END;

  -- Same lock as fleet_plan_job: two taps (or Plan it + Add) for the same car and job list it once.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('fleet_plan_job|' || p_organization_id || '|' || v_wo.vehicle_id || '|' || p_component_id::text, 0)
  );

  -- Already waiting on this car (same job, same places): don't list it twice.
  SELECT l.id, l.work_order_id
  INTO v_listed_line
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  WHERE wo.organization_id = p_organization_id
    AND wo.vehicle_id = v_wo.vehicle_id
    AND l.component_id = p_component_id
    AND l.recommended = true
    AND l.voided_at IS NULL
    AND public.maintenance_found_line_is_open(l.id)
    AND nullif(
      (
        SELECT coalesce(array_agg(DISTINCT p ORDER BY p), ARRAY[]::text[])
        FROM unnest(coalesce(l.positions, ARRAY[]::text[])) p
      ),
      ARRAY[]::text[]
    ) IS NOT DISTINCT FROM nullif(v_sorted_positions, ARRAY[]::text[])
  ORDER BY wo.opened_at, l.id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'workOrderId', v_listed_line.work_order_id,
      'lineId', v_listed_line.id,
      'created', false,
      'alreadyListed', true
    );
  END IF;

  SELECT sys.id, sys.code, sys.name
  INTO v_system
  FROM public.maintenance_job_section_members m
  JOIN public.maintenance_service_categories sys ON sys.id = m.system_id
  WHERE m.category_id = p_component_id
  LIMIT 1;

  SELECT coalesce(max(l.sort_order), -1) + 1 INTO v_sort
  FROM public.maintenance_work_order_lines l
  WHERE l.work_order_id = p_work_order_id;

  v_line_id := gen_random_uuid();

  INSERT INTO public.maintenance_work_order_lines (
    id,
    work_order_id,
    sort_order,
    system_id,
    component_id,
    system_code,
    system_name,
    component_code,
    component_name,
    action,
    positions,
    notes,
    values_json,
    recommended,
    declined,
    line_total,
    items_amount,
    updated_by,
    updated_at
  ) VALUES (
    v_line_id,
    p_work_order_id,
    v_sort,
    v_system.id,
    p_component_id,
    v_system.code,
    v_system.name,
    v_job.code,
    v_job.name,
    coalesce(nullif(v_job.default_action, ''), 'replace'),
    v_sorted_positions,
    v_note,
    jsonb_build_object('found_by_job', v_inspection_job::text)
      || CASE WHEN v_quote IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quote_amount', v_quote) END,
    true,
    false,
    0,
    0,
    p_actor_id,
    now()
  );

  RETURN jsonb_build_object(
    'workOrderId', p_work_order_id,
    'lineId', v_line_id,
    'created', true,
    'alreadyListed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_add_found_job(text, uuid, uuid, uuid, text[], text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_add_found_job(text, uuid, uuid, uuid, text[], text, numeric) TO service_role;

-- Self-check: the function exists with the right grants.
DO $check$
BEGIN
  IF to_regprocedure('public.fleet_add_found_job(text, uuid, uuid, uuid, text[], text, numeric)') IS NULL THEN
    RAISE EXCEPTION 'fleet_add_found_job missing';
  END IF;
  IF has_function_privilege('authenticated', 'public.fleet_add_found_job(text, uuid, uuid, uuid, text[], text, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fleet_add_found_job must not be callable by signed-in users directly';
  END IF;
END;
$check$;
