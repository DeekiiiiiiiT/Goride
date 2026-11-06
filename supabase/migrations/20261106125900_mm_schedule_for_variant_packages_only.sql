-- M-14: package templates only (exclude part rules with component_id set).

CREATE OR REPLACE FUNCTION public.schedule_for_variant(
  p_catalog_id uuid,
  p_vehicle_year integer DEFAULT NULL
)
RETURNS TABLE (
  template_id uuid,
  task_code text,
  task_name text,
  template_scope text,
  component_id uuid,
  component_op_code text,
  interval_miles numeric,
  interval_months integer,
  platform_id uuid,
  engine_family_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cat AS (
    SELECT
      id,
      platform_id,
      engine_family_id,
      lower(trim(coalesce(vehicle_class, 'car'))) AS vehicle_class
    FROM public.vehicle_catalog
    WHERE id = p_catalog_id
  ),
  mine AS (
    SELECT p.parent_id
    FROM public.vehicle_platform p
    JOIN cat ON p.id = cat.platform_id
  ),
  candidates AS (
    SELECT
      t.id,
      t.task_code,
      t.task_name,
      t.template_scope,
      t.component_id,
      t.interval_miles,
      t.interval_months,
      t.platform_id,
      t.engine_family_id,
      CASE t.template_scope
        WHEN 'variant' THEN 1
        WHEN 'platform' THEN 2
        WHEN 'engine_family' THEN 3
        ELSE 4
      END AS scope_rank
    FROM public.maintenance_task_templates t
    CROSS JOIN cat
    LEFT JOIN mine ON true
    WHERE t.archived_at IS NULL
      AND t.component_id IS NULL
      AND (
        cardinality(coalesce(t.applicable_vehicle_classes, ARRAY['car']::text[])) = 0
        OR cat.vehicle_class = ANY (
          SELECT lower(trim(cls))
          FROM unnest(coalesce(t.applicable_vehicle_classes, ARRAY['car']::text[])) AS cls
        )
      )
      AND (
        (t.template_scope = 'variant' AND t.vehicle_catalog_id = cat.id)
        OR (
          t.template_scope = 'platform'
          AND (t.platform_id = cat.platform_id OR t.platform_id = mine.parent_id)
        )
        OR (t.template_scope = 'engine_family' AND t.engine_family_id = cat.engine_family_id)
        OR t.template_scope = 'global'
      )
  ),
  best AS (
    SELECT DISTINCT ON (COALESCE(NULLIF(trim(task_code), ''), lower(task_name))) *
    FROM candidates
    ORDER BY COALESCE(NULLIF(trim(task_code), ''), lower(task_name)), scope_rank ASC
  )
  SELECT
    b.id,
    b.task_code,
    b.task_name,
    b.template_scope,
    b.component_id,
    c.op_code,
    b.interval_miles,
    b.interval_months,
    b.platform_id,
    b.engine_family_id
  FROM best b
  LEFT JOIN public.maintenance_service_categories c ON c.id = b.component_id;
$$;

REVOKE ALL ON FUNCTION public.schedule_for_variant(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_for_variant(uuid, integer) TO service_role;
