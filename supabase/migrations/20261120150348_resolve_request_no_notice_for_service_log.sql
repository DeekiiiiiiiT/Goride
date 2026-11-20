-- LC-21 (docs/log-service-parts-gaps-audit.md 0c2): closing a request in Dominion ("Added — pick the part") tells
-- the company "… is now on file" only for real asks (Find parts / Ask Roam). A request that came from a service log
-- ("Add … as the battery I used") was never an ask: the user already logged the part, so nothing is sent.
-- Same function as 20261119012823 with one change: the notice loop skips origin = 'service_log'.

CREATE OR REPLACE FUNCTION public.catalog_resolve_request_group(p_group_key text, p_part_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    -- Only the companies whose asks were answered by this call (never re-notify an earlier answer),
    -- and never for a part the user logged themselves (origin service_log).
    SELECT DISTINCT r.organization_id
    FROM public.parts_sourcing_requests r
    WHERE r.id = ANY(v_ids)
      AND coalesce(r.origin, '') <> 'service_log'
  LOOP
    SELECT r.vehicle_catalog_id, r.maintenance_component_id, r.position_codes
    INTO v_req
    FROM public.parts_sourcing_requests r
    WHERE r.organization_id = v_org.organization_id
      AND r.id = ANY(v_ids)
      AND coalesce(r.origin, '') <> 'service_log'
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
