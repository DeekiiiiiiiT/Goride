-- R12 backfill: open add_part_info requests without a research job
DO $$
DECLARE
  r record;
  v_group_key text;
  v_job_id uuid;
  v_msg_id bigint;
BEGIN
  FOR r IN
    SELECT *
    FROM public.parts_sourcing_requests
    WHERE kind = 'add_part_info'
      AND status IN ('open', 'in_progress')
      AND catalog_research_job_id IS NULL
  LOOP
    v_group_key := coalesce(
      nullif(trim(r.research_group_key), ''),
      public.catalog_research_research_group_key(
        r.vehicle_catalog_id,
        r.maintenance_component_id,
        r.fit_descriptor,
        r.install_side,
        r.match_type
      )
    );

    SELECT j.id INTO v_job_id
    FROM public.catalog_research_job j
    WHERE j.group_key = v_group_key
      AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added')
    LIMIT 1;

    IF v_job_id IS NULL THEN
      INSERT INTO public.catalog_research_job (
        job_type,
        group_key,
        vehicle_catalog_id,
        maintenance_component_id,
        fit_descriptor,
        match_type,
        fleet_count,
        state
      )
      VALUES (
        'part',
        v_group_key,
        r.vehicle_catalog_id,
        r.maintenance_component_id,
        r.fit_descriptor,
        r.match_type,
        1,
        'queued'
      )
      RETURNING id INTO v_job_id;

      SELECT public.catalog_research_enqueue_job(v_job_id) INTO v_msg_id;
      PERFORM public.catalog_research_log_event(v_job_id, 'backfill', 'queued', jsonb_build_object('requestId', r.id));
    END IF;

    UPDATE public.parts_sourcing_requests SET
      catalog_research_job_id = v_job_id,
      research_group_key = v_group_key
    WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.catalog_research_enqueue_vehicle_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_key text;
  v_job_id uuid;
BEGIN
  IF NEW.status NOT IN ('pending', 'needs_info') THEN
    RETURN NEW;
  END IF;

  v_group_key := concat_ws(
    ':',
    'vehicle',
    coalesce(NEW.proposed_make, ''),
    coalesce(NEW.proposed_model, ''),
    coalesce(NEW.proposed_production_start_year::text, ''),
    coalesce(NEW.organization_id, '')
  );

  SELECT j.id INTO v_job_id
  FROM public.catalog_research_job j
  WHERE j.group_key = v_group_key
    AND j.job_type = 'vehicle'
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review')
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.catalog_research_job (job_type, group_key, fleet_count, state, market)
  VALUES ('vehicle', v_group_key, 1, 'queued', 'JM')
  RETURNING id INTO v_job_id;

  PERFORM public.catalog_research_enqueue_job(v_job_id);
  PERFORM public.catalog_research_log_event(v_job_id, 'enqueue', 'vehicle', jsonb_build_object('pendingRequestId', NEW.id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicle_catalog_pending_research_job ON public.vehicle_catalog_pending_requests;
CREATE TRIGGER vehicle_catalog_pending_research_job
  AFTER INSERT ON public.vehicle_catalog_pending_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_research_enqueue_vehicle_job();