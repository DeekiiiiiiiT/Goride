-- Engine sections — run once on live right after migration (DC1, DC9). Count must be 0.

SELECT count(*)::bigint AS dc1_engine_home_jobs_not_in_engine_section
FROM public.maintenance_service_categories c
WHERE c.kind = 'component'
  AND c.status = 'active'
  AND c.parent_id = (SELECT id FROM public.maintenance_service_categories WHERE code = 'sys_engine')
  AND NOT EXISTS (
    SELECT 1
    FROM public.maintenance_job_section_members m
    JOIN public.maintenance_job_sections s ON s.id = m.section_id
    JOIN public.maintenance_job_section_groups g ON g.id = s.group_id
    WHERE g.system_id = (SELECT id FROM public.maintenance_service_categories WHERE code = 'sys_engine')
      AND m.category_id = c.id
  );

SELECT CASE
  WHEN (
    SELECT count(*)::bigint
    FROM public.maintenance_service_categories c
    WHERE c.kind = 'component'
      AND c.status = 'active'
      AND c.parent_id = (SELECT id FROM public.maintenance_service_categories WHERE code = 'sys_engine')
  ) <> 29 THEN 1
  ELSE 0
END::bigint AS dc9_engine_home_job_count_not_29;
