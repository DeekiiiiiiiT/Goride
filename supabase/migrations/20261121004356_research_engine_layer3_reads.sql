-- Research engine layer 3 (docs/research-engine-audit.md §4): read-only numbers the Dominion screens show.
--   1. catalog_research_screen_summary() — Pending catalog cards, browser-check counter, cost + progress (S1 / S4 / S5).
--   2. catalog_research_coverage(car)    — Coverage tab tiles: the 10 core part types + core spec keys (S6 / S7).
-- Both are server-only (service role), like every research function (RE-26). Neither returns who asked, when, or how
-- many companies asked (RE-23): no fleet_count, no origin, no request ids.

CREATE OR REPLACE FUNCTION public.catalog_research_screen_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'private', 'public', 'pg_temp'
AS $$
DECLARE
  v_settings public.catalog_research_settings%ROWTYPE;
  v_counts jsonb;
  v_spend_today numeric;
  v_spend_7d numeric;
  v_jobs_7d integer;
  v_remaining integer;
  v_per_day numeric;
  v_no_frame integer;
  v_open_conflicts integer;
  v_filling jsonb;
  v_plan jsonb;
  v_researching_car text;
BEGIN
  SELECT * INTO v_settings FROM public.catalog_research_settings WHERE id = 1;

  SELECT jsonb_build_object(
    'needsReview',      count(*) FILTER (WHERE state = 'needs_review' AND job_type IN ('part', 'spec')),
    'browserCheckOpen', count(*) FILTER (WHERE state = 'browser_check'),
    'browserCheckWaiting', count(*) FILTER (WHERE state = 'browser_check_queued'),
    'researching',      count(*) FILTER (WHERE state IN ('researching', 'checking')),
    'waiting',          count(*) FILTER (WHERE state IN ('queued', 'browser_check_queued')),
    'addedThisWeek',    count(*) FILTER (WHERE state IN ('added', 'auto_added') AND updated_at >= now() - interval '7 days'),
    'addedAutoThisWeek', count(*) FILTER (WHERE state = 'auto_added' AND updated_at >= now() - interval '7 days'),
    'vehiclesNeedsReview', count(*) FILTER (WHERE state = 'needs_review' AND job_type IN ('vehicle', 'vehicle_identity', 'vehicle_model'))
  ) INTO v_counts
  FROM public.catalog_research_job;

  v_spend_today := public.catalog_research_spend_today();

  SELECT coalesce(sum(e.cost_usd), 0) INTO v_spend_7d
  FROM private.api_usage_events e
  WHERE e.route LIKE 'catalog_research/%' AND e.occurred_at >= now() - interval '7 days';

  SELECT count(DISTINCT ev.job_id)::int INTO v_jobs_7d
  FROM public.catalog_research_event ev
  WHERE ev.step = 'route' AND ev.at >= now() - interval '7 days';

  -- Work left in the fill plan: every open job that has not finished yet.
  SELECT count(*)::int INTO v_remaining
  FROM public.catalog_research_job
  WHERE state IN ('queued', 'browser_check_queued', 'researching', 'checking');

  v_per_day := CASE WHEN v_jobs_7d > 0 THEN v_jobs_7d / 7.0 ELSE 0 END;

  SELECT count(*)::int INTO v_no_frame
  FROM public.vehicle_catalog
  WHERE nullif(btrim(coalesce(chassis_code, '')), '') IS NULL;

  SELECT count(*)::int INTO v_open_conflicts FROM public.research_number_conflict WHERE closed_at IS NULL;

  -- "Cars being filled first" (Screen 5): cars with open fill-plan jobs and their readiness. Never says why.
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'label'), '[]'::jsonb) INTO v_filling
  FROM (
    SELECT jsonb_build_object(
      'vehicleCatalogId', vc.id,
      'label', concat_ws(' ', vc.make, vc.model,
                         CASE WHEN vc.production_start_year IS NOT NULL
                              THEN vc.production_start_year::text || '–' || coalesce(vc.production_end_year::text, '') END),
      'chassisCode', vc.chassis_code,
      'partsReady', coalesce(r.components_ready, 0),
      'openJobs', f.open_jobs
    ) AS x
    FROM (
      SELECT j.vehicle_catalog_id, count(*)::int AS open_jobs
      FROM public.catalog_research_job j
      WHERE j.origin IN ('sweep', 'owner_fill')
        AND j.vehicle_catalog_id IS NOT NULL
        AND j.state IN ('queued', 'browser_check_queued', 'researching', 'checking', 'browser_check', 'needs_review')
      GROUP BY j.vehicle_catalog_id
      ORDER BY count(*) DESC
      LIMIT 5
    ) f
    JOIN public.vehicle_catalog vc ON vc.id = f.vehicle_catalog_id
    LEFT JOIN public.variant_parts_readiness r ON r.variant_id = vc.id
  ) q;

  -- The fill plan as a whole: every car with a fill-plan job. Ready = all core parts ready; waiting = nothing started.
  WITH plan AS (
    SELECT j.vehicle_catalog_id,
           bool_or(j.state NOT IN ('queued', 'browser_check_queued')) AS started
    FROM public.catalog_research_job j
    WHERE j.origin IN ('sweep', 'owner_fill') AND j.vehicle_catalog_id IS NOT NULL
    GROUP BY j.vehicle_catalog_id
  )
  SELECT jsonb_build_object(
    'cars', count(*),
    'ready', count(*) FILTER (WHERE coalesce(r.ready, false)),
    'inProgress', count(*) FILTER (WHERE NOT coalesce(r.ready, false) AND p.started),
    'waiting', count(*) FILTER (WHERE NOT coalesce(r.ready, false) AND NOT p.started)
  ) INTO v_plan
  FROM plan p
  LEFT JOIN public.variant_parts_readiness r ON r.variant_id = p.vehicle_catalog_id;

  SELECT concat_ws(' ', vc.make, vc.model,
                   CASE WHEN vc.production_start_year IS NOT NULL
                        THEN vc.production_start_year::text || '–' || coalesce(vc.production_end_year::text, '') END)
    INTO v_researching_car
  FROM public.catalog_research_job j
  JOIN public.vehicle_catalog vc ON vc.id = j.vehicle_catalog_id
  WHERE j.state IN ('researching', 'checking')
  ORDER BY j.updated_at DESC
  LIMIT 1;

  RETURN v_counts || jsonb_build_object(
    'fillPlan', v_plan,
    'researchingCar', v_researching_car,
    'browserCheckMax', coalesce(v_settings.max_open_browser_checks, 25),
    'conflictsOpen', v_open_conflicts,
    'spendTodayUsd', round(v_spend_today, 4),
    'dailySpendUsd', v_settings.daily_spend_usd,
    'costPerJob7dUsd', CASE WHEN v_jobs_7d > 0 THEN round(v_spend_7d / v_jobs_7d, 4) END,
    'jobsDone7d', v_jobs_7d,
    'remainingJobs', v_remaining,
    'fillTargetDate', v_settings.fill_target_date,
    'expectedFinishDate', CASE WHEN v_remaining = 0 THEN current_date
                               WHEN v_per_day > 0 THEN current_date + ceil(v_remaining / v_per_day)::int END,
    'carsWithoutFrameCode', v_no_frame,
    'shadowMode', coalesce(v_settings.shadow_mode, true),
    'shadowStreak', coalesce(v_settings.shadow_approve_streak, 0),
    'paused', coalesce(v_settings.paused, false),
    'pausedReason', v_settings.paused_reason,
    'autoResumeAt', v_settings.auto_resume_at,
    'enabled', coalesce(v_settings.enabled, false),
    'fillingFirst', v_filling
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_coverage(p_vehicle_catalog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_car public.vehicle_catalog%ROWTYPE;
  v_cells jsonb;
  v_ready integer;
  v_parts jsonb := '[]'::jsonb;
  v_specs jsonb := '[]'::jsonb;
  v_comp record;
  v_key text;
  v_part record;
  v_job record;
  v_conflict uuid;
  v_spec record;
  v_all_specs jsonb;
BEGIN
  SELECT * INTO v_car FROM public.vehicle_catalog WHERE id = p_vehicle_catalog_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'car_not_found'; END IF;

  SELECT r.cells, r.components_ready INTO v_cells, v_ready
  FROM public.variant_parts_readiness r WHERE r.variant_id = p_vehicle_catalog_id;

  FOR v_comp IN
    SELECT c.id, c.op_code, c.name, o.ord
    FROM unnest(ARRAY['ENG-OIL', 'ENG-SPARK', 'ENG-THERM', 'FILT-AIR', 'HVAC-CABIN', 'BRK-PADS', 'BELT-SERP',
                      'LGT-WIPER', 'BRK-ROTOR', 'SUS-SHOCK']) WITH ORDINALITY AS o(op_code, ord)
    JOIN public.maintenance_service_categories c ON c.op_code = o.op_code AND c.kind = 'component'
    ORDER BY o.ord
  LOOP
    SELECT p.oem_part_number, p.manufacturer, p.evidence_url, p.tier
      INTO v_part
    FROM public.parts_for_vehicle(p_vehicle_catalog_id, v_comp.id, NULL::integer) p
    WHERE p.tier BETWEEN 1 AND 3
    ORDER BY p.tier
    LIMIT 1;

    SELECT j.id, j.state INTO v_job
    FROM public.catalog_research_job j
    WHERE j.job_type = 'part' AND j.vehicle_catalog_id = p_vehicle_catalog_id AND j.maintenance_component_id = v_comp.id
    ORDER BY j.updated_at DESC
    LIMIT 1;

    SELECT n.id INTO v_conflict
    FROM public.research_number_conflict n
    WHERE n.vehicle_catalog_id = p_vehicle_catalog_id AND n.platform_component_id = v_comp.id AND n.closed_at IS NULL
    LIMIT 1;

    v_parts := v_parts || jsonb_build_object(
      'componentId', v_comp.id,
      'opCode', v_comp.op_code,
      'name', v_comp.name,
      'cell', coalesce(v_cells->>v_comp.op_code, 'missing'),
      'partNumber', v_part.oem_part_number,
      'maker', v_part.manufacturer,
      'sourceUrl', v_part.evidence_url,
      'jobId', v_job.id,
      'jobState', v_job.state,
      'conflictId', v_conflict
    );
    v_part := NULL; v_job := NULL; v_conflict := NULL;
  END LOOP;

  FOREACH v_key IN ARRAY public.catalog_research_core_spec_keys() LOOP
    SELECT s.value, s.unit, s.trust, s.source_note, s.evidence_url, sk.label, own.trust_route, own.verified_at
      INTO v_spec
    FROM public.spec_key sk
    LEFT JOIN LATERAL (
      SELECT f.value, f.unit, f.trust, f.source_note, f.evidence_url
      FROM public.specs_for_variant(p_vehicle_catalog_id) f
      WHERE f.spec_key = sk.key
      LIMIT 1
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT v.trust_route, v.verified_at
      FROM public.catalog_spec_value v
      WHERE v.spec_key = sk.key AND v.scope = 'variant' AND v.vehicle_catalog_id = p_vehicle_catalog_id
      LIMIT 1
    ) own ON true
    WHERE sk.key = v_key;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT j.id, j.state INTO v_job
    FROM public.catalog_research_job j
    WHERE j.job_type = 'spec' AND j.vehicle_catalog_id = p_vehicle_catalog_id AND j.spec_key = v_key
    ORDER BY j.updated_at DESC
    LIMIT 1;

    v_specs := v_specs || jsonb_build_object(
      'specKey', v_key,
      'label', v_spec.label,
      'value', v_spec.value,
      'unit', v_spec.unit,
      'trust', v_spec.trust,
      'sourceNote', v_spec.source_note,
      'sourceUrl', v_spec.evidence_url,
      'trustRoute', v_spec.trust_route,
      'checkedAt', v_spec.verified_at,
      'jobId', v_job.id,
      'jobState', v_job.state
    );
    v_spec := NULL; v_job := NULL;
  END LOOP;

  -- S7: every spec on file for this car with its trust and source, plus the latest research job per key.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'specKey', f.spec_key,
           'label', f.label,
           'value', f.value,
           'unit', f.unit,
           'trust', f.trust,
           'sourceNote', f.source_note,
           'sourceUrl', f.evidence_url,
           'trustRoute', own.trust_route,
           'checkedAt', own.verified_at,
           'jobId', jb.id,
           'jobState', jb.state
         ) ORDER BY f.label), '[]'::jsonb)
    INTO v_all_specs
  FROM public.specs_for_variant(p_vehicle_catalog_id) f
  LEFT JOIN LATERAL (
    SELECT v.trust_route, v.verified_at FROM public.catalog_spec_value v
    WHERE v.spec_key = f.spec_key AND v.scope = 'variant' AND v.vehicle_catalog_id = p_vehicle_catalog_id LIMIT 1
  ) own ON true
  LEFT JOIN LATERAL (
    SELECT j.id, j.state FROM public.catalog_research_job j
    WHERE j.job_type = 'spec' AND j.vehicle_catalog_id = p_vehicle_catalog_id AND j.spec_key = f.spec_key
    ORDER BY j.updated_at DESC LIMIT 1
  ) jb ON true;

  RETURN jsonb_build_object(
    'allSpecs', v_all_specs,
    'vehicleCatalogId', v_car.id,
    'make', v_car.make,
    'model', v_car.model,
    'chassisCode', nullif(btrim(coalesce(v_car.chassis_code, '')), ''),
    'engineCode', v_car.engine_code,
    'partsReady', coalesce(v_ready, 0),
    'parts', v_parts,
    'specs', v_specs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_research_screen_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_research_coverage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_research_screen_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_research_coverage(uuid) TO service_role;
