-- Research engine RE-75 (27 Nov): a research job or browser check whose answer is already Confirmed on the car is
-- closed, and a new one is never made.
--
-- Root cause: every door decided once, at the moment a job was made, whether it was needed, and nothing looked again.
-- A part confirmed later (another saved page, an import, another check) left the old check open in Pending catalog
-- and in the "N of 25" count. Seen: Roomy M900A "Brake drum · Rear" check open while 42431-B1021 was Confirmed since
-- 7 Nov.
--
-- One rule, public.catalog_research_job_covered(job), used in two places:
--   1. catalog_research_queue_item never makes a job the rule says is covered (returns alreadyOnFile).
--   2. catalog_research_close_covered_jobs() closes open covered jobs; a cron runs it every 10 minutes, and this file
--      runs it once now.
--
-- "Covered" means:
--   * part job: for every axle the job is for (front / rear, or both when it has none) and that the part fits
--     (RE-73 catalog_part_fits_axle), Confirmed listings on this car cover every production year, and both sides for
--     a left/right part. A car with no years only needs one Confirmed listing per place;
--   * spec job: the spec is sourced on this car (specs_for_variant.sourced);
--   * other job types are never closed by this rule.
-- Closed jobs go to 'auto_added' ("its number is already on the car", SP-39), with a log line saying why. Only jobs that
-- have not moved for 5 minutes are closed, so a check being saved right now is never touched.

CREATE OR REPLACE FUNCTION public.catalog_part_place_confirmed(p_vehicle_catalog_id uuid, p_component_id uuid, p_axle text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_scheme text;
  v_from integer;
  v_to integer;
  v_axle text := CASE
    WHEN lower(coalesce(p_axle, '')) LIKE '%rear%' THEN 'rear'
    WHEN lower(coalesce(p_axle, '')) LIKE '%front%' THEN 'front'
    ELSE NULL END;
  v_sides text[];
  v_side text;
BEGIN
  IF p_vehicle_catalog_id IS NULL OR p_component_id IS NULL THEN RETURN false; END IF;

  SELECT c.position_scheme INTO v_scheme FROM public.maintenance_service_categories c WHERE c.id = p_component_id;
  SELECT coalesce(vc.production_start_year, vc.year), coalesce(vc.production_end_year, vc.production_start_year, vc.year)
  INTO v_from, v_to
  FROM public.vehicle_catalog vc WHERE vc.id = p_vehicle_catalog_id;
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from THEN v_to := v_from; END IF;

  v_sides := CASE WHEN v_scheme IN ('axle_left_right', 'four_corners') THEN ARRAY['left', 'right'] ELSE ARRAY[NULL::text] END;

  FOREACH v_side IN ARRAY v_sides LOOP
    IF v_from IS NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.part_listing pl
        JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
        WHERE pl.vehicle_catalog_id = p_vehicle_catalog_id
          AND pl.trust = 'confirmed'
          AND pm.maintenance_component_id = p_component_id
          AND coalesce(pm.catalog_decision, '') <> 'rejected'
          AND (v_axle IS NULL OR lower(coalesce(pl.position, '')) LIKE v_axle || '%')
          AND (v_side IS NULL OR pl.side IS NULL OR pl.side IN (v_side, 'both'))
      ) THEN RETURN false; END IF;
    ELSE
      IF EXISTS (
        SELECT 1 FROM generate_series(v_from, v_to) y
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.part_listing pl
          JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
          WHERE pl.vehicle_catalog_id = p_vehicle_catalog_id
            AND pl.trust = 'confirmed'
            AND pm.maintenance_component_id = p_component_id
            AND coalesce(pm.catalog_decision, '') <> 'rejected'
            AND (v_axle IS NULL OR lower(coalesce(pl.position, '')) LIKE v_axle || '%')
            AND (v_side IS NULL OR pl.side IS NULL OR pl.side IN (v_side, 'both'))
            AND coalesce(pl.year_from, y) <= y AND coalesce(pl.year_to, y) >= y
        )
      ) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_item_covered(
  p_vehicle_catalog_id uuid, p_component_id uuid, p_spec_key text, p_fit_descriptor text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_scheme text;
  v_axle text := CASE
    WHEN lower(coalesce(p_fit_descriptor, '')) LIKE '%rear%' THEN 'rear'
    WHEN lower(coalesce(p_fit_descriptor, '')) LIKE '%front%' THEN 'front'
    ELSE NULL END;
  v_a text;
  v_any boolean := false;
BEGIN
  IF p_vehicle_catalog_id IS NULL THEN RETURN false; END IF;

  IF p_spec_key IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.specs_for_variant(p_vehicle_catalog_id) s WHERE s.spec_key = p_spec_key AND s.sourced);
  END IF;
  IF p_component_id IS NULL THEN RETURN false; END IF;

  SELECT c.position_scheme INTO v_scheme FROM public.maintenance_service_categories c WHERE c.id = p_component_id;
  IF v_scheme IS NULL OR v_scheme NOT IN ('axle', 'four_corners', 'axle_left_right', 'axle_inner_outer', 'axle_numbered') THEN
    RETURN public.catalog_part_place_confirmed(p_vehicle_catalog_id, p_component_id, NULL);
  END IF;

  -- One axle, or both when the job names none (jobs from before per-axle filling). An axle the part can't be on
  -- (RE-73, pads on a drum axle) needs nothing.
  FOREACH v_a IN ARRAY CASE WHEN v_axle IS NULL THEN ARRAY['front', 'rear'] ELSE ARRAY[v_axle] END LOOP
    IF NOT public.catalog_part_fits_axle(p_vehicle_catalog_id, p_component_id, v_a) THEN CONTINUE; END IF;
    v_any := true;
    IF NOT public.catalog_part_place_confirmed(p_vehicle_catalog_id, p_component_id, v_a) THEN RETURN false; END IF;
  END LOOP;
  RETURN v_any;
END;
$$;

COMMENT ON FUNCTION public.catalog_research_item_covered(uuid, uuid, text, text) IS
  'RE-75: true when the answer this research item would find is already Confirmed / sourced on the car.';

CREATE OR REPLACE FUNCTION public.catalog_research_close_covered_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job record;
  v_closed integer := 0;
BEGIN
  FOR v_job IN
    SELECT j.id, j.state
    FROM public.catalog_research_job j
    WHERE j.job_type IN ('part', 'spec')
      AND j.state IN ('queued', 'needs_review', 'browser_check', 'browser_check_queued')
      AND j.updated_at < now() - interval '5 minutes'
      AND public.catalog_research_item_covered(j.vehicle_catalog_id, j.maintenance_component_id, j.spec_key, j.fit_descriptor)
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.catalog_research_job SET state = 'auto_added', updated_at = now() WHERE id = v_job.id;
    PERFORM public.catalog_research_log_event(v_job.id, 'close', 'already_on_file',
      jsonb_build_object('from', v_job.state, 'rule', 'RE-75'));
    v_closed := v_closed + 1;
  END LOOP;
  RETURN v_closed;
END;
$$;

COMMENT ON FUNCTION public.catalog_research_close_covered_jobs() IS
  'RE-75: closes open part/spec jobs whose answer is already Confirmed on the car. Cron research-close-covered, every 10 min.';

REVOKE ALL ON FUNCTION public.catalog_part_place_confirmed(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_part_place_confirmed(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.catalog_research_item_covered(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_item_covered(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.catalog_research_close_covered_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_close_covered_jobs() TO service_role;

-- Door: queue_item (Fill this car, Fill this model, the single-item button, Fleet requests). Same body as
-- 20261127122811; one more guard.
CREATE OR REPLACE FUNCTION public.catalog_research_queue_item(p_vehicle_catalog_id uuid, p_component_id uuid, p_spec_key text, p_fit_descriptor text, p_origin text DEFAULT 'owner_fill'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_job uuid;
  v_type text := CASE WHEN p_spec_key IS NOT NULL THEN 'spec' ELSE 'part' END;
  v_fit text := nullif(lower(btrim(coalesce(p_fit_descriptor, ''))), '');
  v_key text;
BEGIN
  IF p_vehicle_catalog_id IS NULL OR (p_component_id IS NULL AND p_spec_key IS NULL) THEN
    RAISE EXCEPTION 'car and part type or spec required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_origin NOT IN ('fleet', 'owner_fill', 'sweep') THEN
    RAISE EXCEPTION 'unknown origin %', p_origin USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- RE-73: a part this car can't have on that axle never gets a job.
  IF v_type = 'part' AND NOT public.catalog_part_fits_axle(p_vehicle_catalog_id, p_component_id, v_fit) THEN
    RETURN jsonb_build_object('jobId', NULL, 'newJob', false, 'notApplicable', true);
  END IF;
  -- RE-75: an answer already Confirmed / sourced on this car never gets a job.
  IF public.catalog_research_item_covered(p_vehicle_catalog_id, p_component_id, p_spec_key, v_fit) THEN
    RETURN jsonb_build_object('jobId', NULL, 'newJob', false, 'alreadyOnFile', true);
  END IF;

  SELECT j.id INTO v_job
  FROM public.catalog_research_job j
  WHERE j.vehicle_catalog_id = p_vehicle_catalog_id
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'browser_check', 'browser_check_queued')
    AND ((v_type = 'spec' AND j.job_type = 'spec' AND j.spec_key = p_spec_key)
      OR (v_type = 'part' AND j.job_type = 'part' AND j.maintenance_component_id = p_component_id
          AND coalesce(lower(j.fit_descriptor), '') = coalesce(v_fit, '')))
  LIMIT 1;
  IF v_job IS NOT NULL THEN
    -- Owner asking for something a sweep queued: it may now open a browser check.
    UPDATE public.catalog_research_job SET browser_check_allowed = true
    WHERE id = v_job AND p_origin <> 'sweep' AND NOT browser_check_allowed;
    RETURN jsonb_build_object('jobId', v_job, 'newJob', false);
  END IF;

  v_key := CASE v_type
    WHEN 'spec' THEN concat_ws(':', 'spec', p_vehicle_catalog_id::text, p_spec_key)
    ELSE concat_ws(':', 'fill', p_vehicle_catalog_id::text, p_component_id::text, coalesce(v_fit, ''))
  END;

  INSERT INTO public.catalog_research_job (job_type, group_key, vehicle_catalog_id, maintenance_component_id, spec_key,
                                           fit_descriptor, fleet_count, state, origin, browser_check_allowed)
  VALUES (v_type, v_key, p_vehicle_catalog_id, p_component_id, p_spec_key, v_fit, 0, 'queued', p_origin,
          p_origin <> 'sweep')
  ON CONFLICT (group_key) WHERE state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued') DO NOTHING
  RETURNING id INTO v_job;
  IF v_job IS NULL THEN
    SELECT id INTO v_job FROM public.catalog_research_job WHERE group_key = v_key ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('jobId', v_job, 'newJob', false);
  END IF;
  PERFORM public.catalog_research_enqueue_job(v_job);
  PERFORM public.catalog_research_log_event(v_job, 'enqueue', 'queued', jsonb_build_object('origin', p_origin));
  RETURN jsonb_build_object('jobId', v_job, 'newJob', true);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_queue_item(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_queue_item(uuid, uuid, text, text, text) TO service_role;

-- Every 10 minutes, close what became covered. Small: it only reads open part/spec jobs (a handful).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'research-close-covered';
    PERFORM cron.schedule(
      'research-close-covered',
      '*/10 * * * *',
      $cron$SELECT public.catalog_research_close_covered_jobs();$cron$
    );
  END IF;
END;
$$;

-- Once now: close the checks that are already covered today.
SELECT public.catalog_research_close_covered_jobs();
