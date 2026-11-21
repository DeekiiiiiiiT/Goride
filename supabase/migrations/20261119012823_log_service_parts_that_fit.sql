-- Slice C Data: planned jobs, fleet_plan_job, found-work enrichment, parts notices, catalog resolve by group.

-- ---------------------------------------------------------------------------
-- 1a. Work order status `planned`
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_work_orders
  DROP CONSTRAINT IF EXISTS maintenance_work_orders_status_check;

ALTER TABLE public.maintenance_work_orders
  ADD CONSTRAINT maintenance_work_orders_status_check
  CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled', 'planned'));

COMMENT ON COLUMN public.maintenance_work_orders.status IS
  'Service lifecycle status. planned = a job the fleet plans to do (bought part first); holds one not-done-yet line, J$ 0; never finished, booked or counted as spend.';

-- ---------------------------------------------------------------------------
-- 1b. Planned parent work orders count as open found work
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_found_line_is_open(p_line_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((
    SELECT
      l.recommended = true
      AND l.declined = false
      AND l.closed_at IS NULL
      AND l.voided_at IS NULL
      AND wo.status IN ('completed', 'planned')
      AND wo.voided_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.maintenance_work_order_lines cl
        JOIN public.maintenance_work_orders cwo ON cwo.id = cl.work_order_id
        WHERE cl.from_found_line_id = p_line_id
          AND cl.voided_at IS NULL
          AND cwo.voided_at IS NULL
          AND cwo.status = 'completed'
      )
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    WHERE l.id = p_line_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.maintenance_found_line_is_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_found_line_is_open(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 1c. Found-work list carries part + source
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_open_found_work(
  p_organization_id text,
  p_vehicle_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x."foundDate", x."lineId"), '[]'::jsonb)
  FROM (
    SELECT
      l.id AS "lineId",
      wo.id AS "workOrderId",
      wo.vehicle_id AS "vehicleId",
      l.component_id AS "jobId",
      l.component_name AS "jobName",
      l.system_name AS "systemName",
      l.notes AS "note",
      coalesce(
        wo.performed_at_date,
        (wo.opened_at AT TIME ZONE 'UTC')::date
      ) AS "foundDate",
      greatest(
        0,
        (current_date - coalesce(
          wo.performed_at_date,
          (wo.opened_at AT TIME ZONE 'UTC')::date
        ))
      )::integer AS "daysWaiting",
      wo.provider AS "garage",
      (
        SELECT il.component_name
        FROM public.maintenance_work_order_lines il
        JOIN public.maintenance_service_categories c ON c.id = il.component_id
        WHERE il.work_order_id = wo.id
          AND il.voided_at IS NULL
          AND c.records_findings = true
        ORDER BY il.sort_order, il.created_at, il.id
        LIMIT 1
      ) AS "inspectionJobName",
      coalesce(l.positions, ARRAY[]::text[]) AS "positions",
      c.position_scheme AS "positionScheme",
      c.position_aware AS "positionAware",
      CASE WHEN wo.status = 'planned' THEN 'planned' ELSE 'inspection' END AS "source",
      l.part_id AS "partId",
      pm.name AS "partName",
      pm.manufacturer AS "partBrand",
      pm.oem_part_number AS "partNumber"
    FROM public.maintenance_work_order_lines l
    JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
    LEFT JOIN public.maintenance_service_categories c ON c.id = l.component_id
    LEFT JOIN public.part_master pm ON pm.id = l.part_id
    WHERE wo.organization_id = p_organization_id
      AND (p_vehicle_id IS NULL OR wo.vehicle_id = p_vehicle_id)
      AND l.recommended = true
      AND l.voided_at IS NULL
      AND public.maintenance_found_line_is_open(l.id)
  ) x;
$$;

REVOKE ALL ON FUNCTION public.fleet_open_found_work(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_open_found_work(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 1d. Plan a job (bought part first)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_plan_job(
  p_organization_id text,
  p_actor_id uuid,
  p_vehicle_id text,
  p_component_id uuid,
  p_positions text[],
  p_part_id uuid,
  p_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job record;
  v_system record;
  v_wo_id uuid;
  v_line_id uuid;
  v_existing_wo uuid;
  v_existing_line uuid;
  v_sorted_positions text[];
  v_note text;
  v_allowed text[];
  v_pos_code text;
  v_stored_sorted text[];
  v_listed_line record;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fleet.vehicles v
    WHERE v.id = p_vehicle_id AND v.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'vehicle_not_found';
  END IF;

  SELECT c.id, c.code, c.name, c.position_aware, c.position_scheme
  INTO v_job
  FROM public.maintenance_service_categories c
  WHERE c.id = p_component_id
    AND coalesce(c.status, 'active') = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_not_found';
  END IF;

  IF p_part_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.id = p_part_id) THEN
    RAISE EXCEPTION 'part_not_found';
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

  -- Two taps at once for the same car and job wait for each other, so the job is listed once.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('fleet_plan_job|' || p_organization_id || '|' || p_vehicle_id || '|' || p_component_id::text, 0)
  );

  IF nullif(trim(coalesce(p_idempotency_key, '')), '') IS NOT NULL THEN
    SELECT w.id INTO v_existing_wo
    FROM public.maintenance_work_orders w
    WHERE w.organization_id = p_organization_id
      AND w.idempotency_key = nullif(trim(p_idempotency_key), '');

    IF FOUND THEN
      SELECT l.id INTO v_existing_line
      FROM public.maintenance_work_order_lines l
      WHERE l.work_order_id = v_existing_wo
        AND l.voided_at IS NULL
      ORDER BY l.sort_order, l.created_at, l.id
      LIMIT 1;

      RETURN jsonb_build_object(
        'workOrderId', v_existing_wo,
        'lineId', v_existing_line,
        'created', false,
        'alreadyListed', false
      );
    END IF;
  END IF;

  SELECT l.id, l.work_order_id
  INTO v_listed_line
  FROM public.maintenance_work_order_lines l
  JOIN public.maintenance_work_orders wo ON wo.id = l.work_order_id
  WHERE wo.organization_id = p_organization_id
    AND wo.vehicle_id = p_vehicle_id
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

  v_wo_id := gen_random_uuid();
  v_line_id := gen_random_uuid();

  INSERT INTO public.maintenance_work_orders (
    id,
    organization_id,
    vehicle_id,
    status,
    log_mode,
    idempotency_key,
    performed_at_date,
    odometer,
    currency,
    package_complete,
    discount_amount,
    payload_json,
    updated_by,
    opened_at,
    total_cost,
    version
  ) VALUES (
    v_wo_id,
    p_organization_id,
    p_vehicle_id,
    'planned',
    'quick_job',
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    NULL,
    NULL,
    'JMD',
    false,
    0,
    '{}'::jsonb,
    p_actor_id,
    now(),
    0,
    1
  );

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
    part_id,
    notes,
    recommended,
    declined,
    line_total,
    items_amount,
    updated_by,
    updated_at
  ) VALUES (
    v_line_id,
    v_wo_id,
    0,
    v_system.id,
    p_component_id,
    v_system.code,
    v_system.name,
    v_job.code,
    v_job.name,
    'replace',
    v_sorted_positions,
    p_part_id,
    v_note,
    true,
    false,
    0,
    0,
    p_actor_id,
    now()
  );

  RETURN jsonb_build_object(
    'workOrderId', v_wo_id,
    'lineId', v_line_id,
    'created', true,
    'alreadyListed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_plan_job(
  text, uuid, text, uuid, text[], uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_plan_job(
  text, uuid, text, uuid, text[], uuid, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 1e. Parts notices — context + read state
-- ---------------------------------------------------------------------------
ALTER TABLE public.fleet_parts_notices
  ADD COLUMN IF NOT EXISTS vehicle_catalog_id uuid NULL,
  ADD COLUMN IF NOT EXISTS maintenance_component_id uuid NULL,
  ADD COLUMN IF NOT EXISTS position_codes text[] NULL,
  ADD COLUMN IF NOT EXISTS read_at timestamptz NULL;

COMMENT ON COLUMN public.fleet_parts_notices.vehicle_catalog_id IS
  'Car model the notice is about (catalog_added with context).';
COMMENT ON COLUMN public.fleet_parts_notices.maintenance_component_id IS
  'Maintenance job the notice is about (catalog_added with context).';
COMMENT ON COLUMN public.fleet_parts_notices.position_codes IS
  'Position codes when the notice is about a placed part (e.g. before_cat).';
COMMENT ON COLUMN public.fleet_parts_notices.read_at IS
  'When the fleet dismissed or opened the notice; NULL = unread.';

CREATE INDEX IF NOT EXISTS idx_fleet_parts_notices_org_unread
  ON public.fleet_parts_notices (organization_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.fleet_parts_notices_mark_read(
  p_organization_id text,
  p_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_cnt integer;
BEGIN
  UPDATE public.fleet_parts_notices n
  SET read_at = now()
  WHERE n.organization_id = p_organization_id
    AND n.id = ANY(p_ids)
    AND n.read_at IS NULL;

  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN v_cnt;
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_parts_notices_mark_read(text, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_parts_notices_mark_read(text, uuid[])
  TO service_role;

-- ---------------------------------------------------------------------------
-- 1f. Resolve an ask group when Dominion added the part by hand
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_resolve_request_group(
  p_group_key text,
  p_part_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_job record;
  v_req record;
  v_org record;
  v_part_label text;
  v_car_label text;
  v_resolved integer := 0;
  v_companies integer := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.part_master pm WHERE pm.id = p_part_id) THEN
    RAISE EXCEPTION 'part_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parts_sourcing_requests r
    WHERE r.kind = 'add_part_info'
      AND r.research_group_key = p_group_key
      AND r.status IN ('open', 'in_progress')
  ) THEN
    RETURN jsonb_build_object('resolved', 0);
  END IF;

  FOR v_req IN
    SELECT r.id
    FROM public.parts_sourcing_requests r
    WHERE r.kind = 'add_part_info'
      AND r.research_group_key = p_group_key
      AND r.status IN ('open', 'in_progress')
    FOR UPDATE
  LOOP
    UPDATE public.parts_sourcing_requests r
    SET
      status = 'resolved',
      resolved_part_id = p_part_id,
      added_at = now(),
      resolution_note = coalesce(r.resolution_note, 'Added to catalog')
    WHERE r.id = v_req.id;
    v_resolved := v_resolved + 1;
    v_ids := v_ids || v_req.id;
  END LOOP;

  SELECT * INTO v_job
  FROM public.catalog_research_job j
  WHERE j.group_key = p_group_key
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.catalog_research_job
    SET state = 'added', updated_at = now()
    WHERE id = v_job.id;

    PERFORM public.catalog_research_log_event(
      v_job.id,
      'added_by_hand',
      'added',
      jsonb_build_object('partId', p_part_id, 'actorId', p_actor_id),
      p_actor_id
    );
  END IF;

  FOR v_org IN
    -- Only the companies whose asks were answered by this call (never re-notify an earlier answer).
    SELECT DISTINCT r.organization_id
    FROM public.parts_sourcing_requests r
    WHERE r.id = ANY(v_ids)
  LOOP
    SELECT r.vehicle_catalog_id, r.maintenance_component_id, r.position_codes
    INTO v_req
    FROM public.parts_sourcing_requests r
    WHERE r.organization_id = v_org.organization_id
      AND r.id = ANY(v_ids)
    ORDER BY r.created_at, r.id
    LIMIT 1;

    SELECT coalesce(c.name, pm.name) INTO v_part_label
    FROM public.part_master pm
    LEFT JOIN public.maintenance_service_categories c ON c.id = v_req.maintenance_component_id
    WHERE pm.id = p_part_id;

    SELECT concat_ws(' ', vc.make, vc.model, vc.production_start_year::text) INTO v_car_label
    FROM public.vehicle_catalog vc
    WHERE vc.id = v_req.vehicle_catalog_id;

    INSERT INTO public.fleet_parts_notices (
      organization_id,
      kind,
      title,
      body,
      vehicle_catalog_id,
      maintenance_component_id,
      position_codes
    ) VALUES (
      v_org.organization_id,
      'catalog_added',
      'Part on file',
      format('%s for your %s is now on file.', coalesce(v_part_label, 'Part'), coalesce(v_car_label, 'vehicle')),
      v_req.vehicle_catalog_id,
      v_req.maintenance_component_id,
      v_req.position_codes
    );

    v_companies := v_companies + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'resolved', v_resolved,
    'companies', v_companies,
    'jobId', v_job.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.catalog_resolve_request_group(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_resolve_request_group(text, uuid, uuid)
  TO service_role;