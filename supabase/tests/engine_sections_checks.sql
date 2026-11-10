-- Engine sections SQL checks (DC2–DC8). Every count must be 0.

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_section_members m
  JOIN public.maintenance_service_categories c ON c.id = m.category_id
  WHERE c.kind <> 'component' OR c.status <> 'active';
  RAISE NOTICE 'dc2_section_members_bad_job: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'dc2 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT m.system_id, m.category_id, count(*) AS n
    FROM public.maintenance_job_section_members m
    GROUP BY m.system_id, m.category_id
    HAVING count(*) > 1
  ) dup;
  RAISE NOTICE 'dc3_job_listed_twice_in_group: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'dc3 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT g.id
    FROM public.maintenance_job_section_groups g
    LEFT JOIN public.maintenance_service_categories sys ON sys.id = g.system_id AND sys.kind = 'system'
    WHERE sys.id IS NULL
    UNION ALL
    SELECT s.id
    FROM public.maintenance_job_sections s
    JOIN public.maintenance_job_section_groups g ON g.id = s.group_id
    WHERE s.system_id IS DISTINCT FROM g.system_id
    UNION ALL
    SELECT m.section_id
    FROM public.maintenance_job_section_members m
    JOIN public.maintenance_job_sections s ON s.id = m.section_id
    WHERE m.system_id IS DISTINCT FROM s.system_id
  ) bad;
  RAISE NOTICE 'dc4_section_system_id_drift: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'dc4 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
  v_filters uuid;
  v_belts uuid;
  v_fluids uuid;
  v_engine uuid;
BEGIN
  SELECT id INTO v_filters FROM public.maintenance_service_categories WHERE code = 'sys_filters';
  SELECT id INTO v_belts FROM public.maintenance_service_categories WHERE code = 'sys_belts';
  SELECT id INTO v_fluids FROM public.maintenance_service_categories WHERE code = 'sys_fluids';
  SELECT id INTO v_engine FROM public.maintenance_service_categories WHERE code = 'sys_engine';

  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories c
  WHERE (
    (c.code = 'air_filter' AND c.parent_id IS DISTINCT FROM v_filters)
    OR (c.code = 'belt' AND c.parent_id IS DISTINCT FROM v_belts)
    OR (c.code = 'coolant_flush' AND c.parent_id IS DISTINCT FROM v_fluids)
    OR (c.code IN ('air_filter', 'belt', 'coolant_flush') AND c.parent_id = v_engine)
  );
  RAISE NOTICE 'dc5_star_jobs_home_group: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'dc5 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_service_categories c
  WHERE c.kind = 'component' AND c.default_action IS NULL;
  RAISE NOTICE 'dc6_component_missing_default_action: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'dc6 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_relations r
  LEFT JOIN public.maintenance_service_categories f ON f.id = r.from_category_id
  LEFT JOIN public.maintenance_service_categories t ON t.id = r.to_category_id
  WHERE f.id IS NULL OR t.id IS NULL
    OR f.kind <> 'component' OR t.kind <> 'component'
    OR f.status <> 'active' OR t.status <> 'active';
  RAISE NOTICE 'dc7_relation_inactive_end: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'dc7 failed: % rows', v_cnt;
  END IF;
END $$;

DO $$
DECLARE v_cnt bigint;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM public.maintenance_job_relations r
  WHERE r.relation_type <> 'recommended_with'
    OR r.from_category_id = r.to_category_id;
  RAISE NOTICE 'dc8_relation_type_or_self: %', v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'dc8 failed: % rows', v_cnt;
  END IF;
END $$;
