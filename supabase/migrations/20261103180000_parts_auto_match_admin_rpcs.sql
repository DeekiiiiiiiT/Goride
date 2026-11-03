-- AM-06 admin platform RPCs + schedule API field aliases (Rev 9)

CREATE OR REPLACE FUNCTION public.admin_platforms()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'name', p.label,
        'label', p.label,
        'maker', p.maker,
        'body_class', NULL,
        'market', NULL,
        'car_count', (
          SELECT count(*)::integer FROM public.vehicle_catalog vc WHERE vc.platform_id = p.id
        ),
        'link_count', (
          SELECT count(*)::integer
          FROM public.platform_component_link l
          WHERE l.platform_a_id = p.id OR l.platform_b_id = p.id
        )
      )
      ORDER BY p.code
    ),
    '[]'::jsonb
  )
  FROM public.vehicle_platform p;
$$;

CREATE OR REPLACE FUNCTION public.admin_platform(p_platform_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_platform jsonb;
  v_links jsonb;
  v_cars jsonb;
BEGIN
  SELECT to_jsonb(p.*) INTO v_platform
  FROM public.vehicle_platform p
  WHERE p.id = p_platform_id;
  IF v_platform IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(vc.*) ORDER BY vc.make, vc.model), '[]'::jsonb)
  INTO v_cars
  FROM public.vehicle_catalog vc
  WHERE vc.platform_id = p_platform_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'platform_a_id', l.platform_a_id,
      'platform_b_id', l.platform_b_id,
      'platform_a_code', pa.code,
      'platform_b_code', pb.code,
      'maintenance_component_id', l.maintenance_component_id,
      'position', l.position,
      'side', l.side,
      'scope', l.scope,
      'status', l.status
    )
  ), '[]'::jsonb)
  INTO v_links
  FROM public.platform_component_link l
  JOIN public.vehicle_platform pa ON pa.id = l.platform_a_id
  JOIN public.vehicle_platform pb ON pb.id = l.platform_b_id
  WHERE l.platform_a_id = p_platform_id OR l.platform_b_id = p_platform_id;

  RETURN jsonb_build_object(
    'platform', v_platform,
    'cars', v_cars,
    'links', v_links,
    'car_count', jsonb_array_length(v_cars),
    'link_count', jsonb_array_length(v_links)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_platform_export(p_platform_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.admin_platform(p_platform_id);
$$;

CREATE OR REPLACE FUNCTION public.part_match_catalog_completeness()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'groups', (SELECT count(*)::integer FROM public.part_interchange_group),
    'parts', (SELECT count(*)::integer FROM public.part_master),
    'listings', (SELECT count(*)::integer FROM public.part_listing),
    'derived', (SELECT count(*)::integer FROM public.part_fit_derived),
    'openConflicts', (SELECT count(*)::integer FROM public.part_match_conflict WHERE status = 'open'),
    'unresolvedPositionReports', (
      SELECT count(*)::integer FROM public.part_norm_position_backfill_report WHERE resolved_at IS NULL
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.part_match_schedule()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_schedule text;
  v_next timestamptz;
  v_parts text[];
  v_hour integer;
  v_minute integer;
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    SELECT j.schedule INTO v_schedule
    FROM cron.job j
    WHERE j.jobname = 'part-match-nightly'
    LIMIT 1;
  END IF;

  v_schedule := coalesce(v_schedule, '0 3 * * *');
  v_parts := string_to_array(v_schedule, ' ');
  v_minute := coalesce(nullif(v_parts[1], '*')::integer, 0);
  v_hour := coalesce(nullif(v_parts[2], '*')::integer, 3);
  v_next := (date_trunc('day', now() AT TIME ZONE 'UTC') + make_interval(hours => v_hour, mins => v_minute)) AT TIME ZONE 'UTC';
  IF now() >= v_next THEN
    v_next := v_next + interval '1 day';
  END IF;

  RETURN jsonb_build_object(
    'nextRun', v_next,
    'cron', v_schedule,
    'cronSchedule', v_schedule,
    'jobname', 'part-match-nightly',
    'jobName', 'part-match-nightly',
    'intervalLabel', 'Interval · ' || v_schedule
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_platforms() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_platform(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_platform_export(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_match_catalog_completeness() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platforms() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_platform(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_platform_export(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.part_match_catalog_completeness() TO service_role;
