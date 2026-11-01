DO $$
DECLARE r record; v_group_key text; v_job_id uuid; v_msg_id bigint;
BEGIN
  FOR r IN SELECT * FROM public.parts_sourcing_requests
    WHERE kind = 'add_part_info' AND status IN ('open', 'in_progress') AND catalog_research_job_id IS NULL
  LOOP
    v_group_key := coalesce(nullif(trim(r.research_group_key), ''),
      public.catalog_research_research_group_key(r.vehicle_catalog_id, r.maintenance_component_id, r.fit_descriptor, r.install_side, r.match_type));
    SELECT j.id INTO v_job_id FROM public.catalog_research_job j
    WHERE j.group_key = v_group_key AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added') LIMIT 1;
    IF v_job_id IS NULL THEN
      INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id, fit_descriptor, match_type, fleet_count, state)
      VALUES ('part', v_group_key, r.vehicle_catalog_id, r.maintenance_component_id, r.fit_descriptor, r.match_type, 1, 'queued')
      RETURNING id INTO v_job_id;
      SELECT public.catalog_research_enqueue_job(v_job_id) INTO v_msg_id;
      PERFORM public.catalog_research_log_event(v_job_id, 'backfill', 'queued', jsonb_build_object('requestId', r.id));
    END IF;
    UPDATE public.parts_sourcing_requests SET catalog_research_job_id = v_job_id, research_group_key = v_group_key WHERE id = r.id;
  END LOOP;
END $$;;
