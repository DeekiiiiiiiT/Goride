-- Research engine RE-73 (27 Nov): one rule for "can this car have this part on this axle?", asked by every door that
-- opens a research job or browser check.
--
-- Why: the Toyota Roomy M900A (rear drums) got a "Brake pads · Rear" browser check on 27 Nov 08:41. RE-72's drum rule
-- lived only inside catalog_research_fill_car. The saved-page upload (research_saved_page_job) and the single-item
-- button (catalog_research_queue_item) have no such rule, so a held saved-page row ("04495-B1310 Brake pads, set",
-- listed under "SHOE KIT, REAR BRAKE") opened a rear pads check that could never be answered.
-- RE-72 also ignored vehicle_catalog.rear_brake_type, which already says "Drum" for this car.
--
-- The rule (public.catalog_part_fits_axle):
--   * only disc-only parts are judged: Brake pads, Brake rotor, Brake caliper, on the front or rear axle;
--   * the car's own brake type for that axle decides first: a drum type (Drum, Leading Trailing, Duo Servo) → no;
--     any other recorded type (Disc, Ventilated Disc, Solid Disc, Carbon Ceramic) → yes;
--   * no brake type on the car → a Confirmed brake drum on that axle means no. Brake shoes alone do not, because
--     rear-disc cars often have parking-brake shoes;
--   * anything else → yes. The rule never blocks a part it can't judge.

CREATE OR REPLACE FUNCTION public.catalog_part_fits_axle(p_vehicle_catalog_id uuid, p_component_id uuid, p_axle text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_op text;
  v_axle text := CASE
    WHEN lower(coalesce(p_axle, '')) LIKE '%rear%' THEN 'rear'
    WHEN lower(coalesce(p_axle, '')) LIKE '%front%' THEN 'front'
    ELSE NULL END;
  v_type text;
BEGIN
  IF p_vehicle_catalog_id IS NULL OR p_component_id IS NULL OR v_axle IS NULL THEN RETURN true; END IF;

  SELECT c.op_code INTO v_op FROM public.maintenance_service_categories c WHERE c.id = p_component_id;
  IF v_op IS NULL OR v_op NOT IN ('BRK-PADS', 'BRK-ROTOR', 'BRK-CALIPER') THEN RETURN true; END IF;

  SELECT CASE v_axle WHEN 'rear' THEN vc.rear_brake_type ELSE vc.front_brake_type END
  INTO v_type
  FROM public.vehicle_catalog vc WHERE vc.id = p_vehicle_catalog_id;

  v_type := nullif(btrim(coalesce(v_type, '')), '');
  IF v_type IS NOT NULL THEN
    RETURN v_type !~* '(drum|leading|trailing|duo.?servo)';
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.part_listing pl
    JOIN public.part_master pm ON pm.interchange_group_id = pl.interchange_group_id
    JOIN public.maintenance_service_categories dc ON dc.id = pm.maintenance_component_id
    WHERE pl.vehicle_catalog_id = p_vehicle_catalog_id
      AND pl.trust = 'confirmed'
      AND lower(coalesce(pl.position, '')) LIKE v_axle || '%'
      AND dc.op_code = 'BRK-DRUM'
  );
END;
$$;

COMMENT ON FUNCTION public.catalog_part_fits_axle(uuid, uuid, text) IS
  'RE-73: false when a disc-only part (pads, rotor, caliper) is asked for an axle with drum brakes on this car. Every job door asks it.';

REVOKE ALL ON FUNCTION public.catalog_part_fits_axle(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_part_fits_axle(uuid, uuid, text) TO service_role;

-- Door 1: "Fill this car" / "Fill this model". Same body as 20261121193554; the RE-72 block now asks the shared rule.
CREATE OR REPLACE FUNCTION public.catalog_research_fill_car(p_vehicle_catalog_id uuid, p_origin text DEFAULT 'owner_fill')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_car public.vehicle_catalog%ROWTYPE;
  v_cells jsonb;
  v_comp record;
  v_key text;
  v_axle text;
  v_r jsonb;
  v_new integer := 0;
  v_joined integer := 0;
BEGIN
  SELECT * INTO v_car FROM public.vehicle_catalog WHERE id = p_vehicle_catalog_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'car_not_found'; END IF;

  -- RE-04: no frame code → find the identity first; parts and specs wait for it.
  IF nullif(btrim(coalesce(v_car.chassis_code, '')), '') IS NULL THEN
    v_r := public.catalog_research_queue_identity(p_vehicle_catalog_id);
    RETURN jsonb_build_object('identityFirst', true, 'identityJobId', v_r->>'jobId', 'newJobs', 0, 'joined', 0);
  END IF;

  SELECT r.cells INTO v_cells FROM public.variant_parts_readiness r WHERE r.variant_id = p_vehicle_catalog_id;

  FOR v_comp IN
    SELECT c.id, c.op_code, c.position_scheme
    FROM public.maintenance_service_categories c
    WHERE c.kind = 'component'
      AND c.op_code IN ('ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN', 'BRK-PADS', 'BELT-SERP',
                        'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK')
  LOOP
    IF coalesce(v_cells->>v_comp.op_code, 'missing') = 'not_applicable' THEN CONTINUE; END IF;
    IF v_comp.position_scheme IN ('axle', 'four_corners', 'axle_left_right', 'axle_inner_outer') THEN
      -- An open job from before per-axle filling (no position) already covers both axles: join it, don't duplicate.
      IF EXISTS (
        SELECT 1 FROM public.catalog_research_job j
        WHERE j.vehicle_catalog_id = p_vehicle_catalog_id AND j.maintenance_component_id = v_comp.id
          AND nullif(btrim(coalesce(j.fit_descriptor, '')), '') IS NULL
          AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'browser_check', 'browser_check_queued')
      ) THEN
        v_joined := v_joined + 1;
        CONTINUE;
      END IF;
      -- RE-69: one job per axle, skipping an axle that already has a confirmed part on this car.
      FOREACH v_axle IN ARRAY ARRAY['front', 'rear'] LOOP
        -- RE-72 / RE-73: no disc-only part on an axle with drum brakes (shared rule).
        IF NOT public.catalog_part_fits_axle(p_vehicle_catalog_id, v_comp.id, v_axle) THEN
          CONTINUE;
        END IF;
        IF EXISTS (
          SELECT 1
          FROM public.parts_for_vehicle(p_vehicle_catalog_id, v_comp.id, NULL) p
          JOIN public.part_listing pl
            ON pl.vehicle_catalog_id = p_vehicle_catalog_id AND pl.interchange_group_id = p.interchange_group_id
          WHERE pl.trust = 'confirmed' AND lower(coalesce(pl.position, '')) = v_axle
        ) THEN
          CONTINUE;
        END IF;
        v_r := public.catalog_research_queue_item(p_vehicle_catalog_id, v_comp.id, NULL, v_axle, p_origin);
        IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
      END LOOP;
    ELSE
      IF coalesce(v_cells->>v_comp.op_code, 'missing') = 'verified' THEN CONTINUE; END IF;
      -- RE-71: the readiness summary can be stale; a confirmed part on this car is enough to skip it.
      IF EXISTS (
        SELECT 1
        FROM public.parts_for_vehicle(p_vehicle_catalog_id, v_comp.id, NULL) p
        JOIN public.part_listing pl
          ON pl.vehicle_catalog_id = p_vehicle_catalog_id AND pl.interchange_group_id = p.interchange_group_id
        WHERE pl.trust = 'confirmed'
      ) THEN
        CONTINUE;
      END IF;
      v_r :=public.catalog_research_queue_item(p_vehicle_catalog_id, v_comp.id, NULL, NULL, p_origin);
      IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY public.catalog_research_core_spec_keys() LOOP
    IF EXISTS (SELECT 1 FROM public.specs_for_variant(p_vehicle_catalog_id) s WHERE s.spec_key = v_key AND s.sourced) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.spec_key k WHERE k.key = v_key) THEN CONTINUE; END IF;
    v_r := public.catalog_research_queue_item(p_vehicle_catalog_id, NULL, v_key, NULL, p_origin);
    IF (v_r->>'newJob')::boolean THEN v_new := v_new + 1; ELSE v_joined := v_joined + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('identityFirst', false, 'newJobs', v_new, 'joined', v_joined);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_fill_car(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_fill_car(uuid, text) TO service_role;

-- Door 2: the single-item button and every other caller of queue_item. Same body as live; one guard added.
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

-- Door 3: the saved-page upload. Same body as 20261125205644; one guard added after the axle word is read.
CREATE OR REPLACE FUNCTION public.research_saved_page_job(
  p_vehicle_catalog_id uuid,
  p_component_id uuid,
  p_axle text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_want text;
  v_job public.catalog_research_job%ROWTYPE;
  v_job_id uuid;
  v_state text;
  v_key text;
BEGIN
  IF p_vehicle_catalog_id IS NULL OR p_component_id IS NULL THEN
    RAISE EXCEPTION 'car and part type required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The axle word: 'front' / 'rear' / none. Same words the browser-check save uses on fit_descriptor.
  v_want := CASE
    WHEN lower(coalesce(p_axle, '')) LIKE '%rear%' THEN 'rear'
    WHEN lower(coalesce(p_axle, '')) LIKE '%front%' THEN 'front'
    ELSE '' END;

  -- RE-73: a part this car can't have on that axle never gets a browser check (e.g. rear pads on a rear-drum car).
  IF NOT public.catalog_part_fits_axle(p_vehicle_catalog_id, p_component_id, v_want) THEN
    RETURN jsonb_build_object('notApplicable', true);
  END IF;

  SELECT * INTO v_job
  FROM public.catalog_research_job j
  WHERE j.vehicle_catalog_id = p_vehicle_catalog_id
    AND j.job_type = 'part'
    AND j.maintenance_component_id = p_component_id
    AND (CASE
           WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%rear%' THEN 'rear'
           WHEN lower(coalesce(j.fit_descriptor, '')) LIKE '%front%' THEN 'front'
           ELSE '' END) = v_want
    AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check',
                    'browser_check_queued')
  ORDER BY (j.state = 'browser_check') DESC, j.updated_at DESC, j.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_job.state IN ('queued', 'needs_review', 'browser_check_queued') THEN
      UPDATE public.catalog_research_job
      SET state = 'browser_check', updated_at = now()
      WHERE id = v_job.id;
      v_job.state := 'browser_check';
    ELSIF v_job.state IN ('researching', 'checking') THEN
      RETURN jsonb_build_object('busy', true);
    END IF;
    RETURN jsonb_build_object('jobId', v_job.id, 'state', v_job.state);
  END IF;

  -- No open job for this axle: open the browser check the owner would have opened by hand.
  v_key := concat_ws(':', 'fill', p_vehicle_catalog_id::text, p_component_id::text, v_want);
  INSERT INTO public.catalog_research_job (
    job_type, group_key, vehicle_catalog_id, maintenance_component_id, fit_descriptor, fleet_count, state, origin,
    browser_check_allowed
  ) VALUES (
    'part', v_key, p_vehicle_catalog_id, p_component_id, nullif(v_want, ''), 0, 'browser_check', 'owner_fill', true
  )
  ON CONFLICT (group_key) WHERE state IN (
    'queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check', 'browser_check_queued'
  ) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    -- The key was taken between the lookup and the insert: return that open job, never a second one.
    SELECT j.id, j.state INTO v_job_id, v_state
    FROM public.catalog_research_job j
    WHERE j.group_key = v_key
      AND j.state IN ('queued', 'researching', 'checking', 'needs_review', 'auto_added', 'browser_check',
                      'browser_check_queued')
    ORDER BY (j.state = 'browser_check') DESC, j.updated_at DESC
    LIMIT 1;
  ELSE
    v_state := 'browser_check';
    PERFORM public.catalog_research_log_event(v_job_id, 'browser_check', 'created',
      jsonb_build_object('origin', 'owner_fill', 'source', 'saved_page'), p_actor);
  END IF;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'saved page job could not be opened' USING ERRCODE = 'unique_violation';
  END IF;

  IF v_state IN ('queued', 'needs_review', 'browser_check_queued') THEN
    UPDATE public.catalog_research_job
    SET state = 'browser_check', updated_at = now()
    WHERE id = v_job_id;
    v_state := 'browser_check';
  ELSIF v_state IN ('researching', 'checking') THEN
    RETURN jsonb_build_object('busy', true);
  END IF;

  RETURN jsonb_build_object('jobId', v_job_id, 'state', v_state);
END;
$$;

COMMENT ON FUNCTION public.research_saved_page_job(uuid, uuid, text, uuid) IS
  'The one open browser check for a car + part type + axle; returns { jobId, state }, { busy: true } or { notApplicable: true } (RE-73). service_role only.';

REVOKE ALL ON FUNCTION public.research_saved_page_job(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_saved_page_job(uuid, uuid, text, uuid) TO service_role;
