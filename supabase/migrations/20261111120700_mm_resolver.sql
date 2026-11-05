-- §2.2 schedule_rule_for_part resolver (interval columns still *_miles in storage).

ALTER TABLE fleet.vehicles
  ADD COLUMN IF NOT EXISTS severe_duty boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.mm_vehicle_catalog_for_fleet(
  p_org text,
  p_vehicle_id text
)
RETURNS TABLE (
  catalog_id uuid,
  platform_id uuid,
  platform_family_id uuid,
  engine_family_id uuid,
  vehicle_class text,
  vehicle_year integer,
  severe_duty boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    vc.id,
    vc.platform_id,
    vp.parent_id,
    vc.engine_family_id,
    lower(trim(coalesce(vc.vehicle_class, 'car'))),
    coalesce(
      nullif(fv.year, 0),
      nullif((to_jsonb(fv.*)->>'model_year')::integer, 0),
      vc.production_start_year
    ),
    coalesce(fv.severe_duty, false)
  FROM fleet.vehicles fv
  JOIN public.vehicle_catalog vc
    ON vc.id::text = fv.vehicle_catalog_id
    OR vc.id = NULLIF(fv.vehicle_catalog_id, '')::uuid
  LEFT JOIN public.vehicle_platform vp ON vp.id = vc.platform_id
  WHERE fv.organization_id = p_org
    AND fv.id = p_vehicle_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mm_part_rule_rank(
  p_scope text,
  p_catalog uuid,
  p_platform uuid,
  p_family uuid,
  p_engine uuid,
  p_rule_catalog uuid,
  p_rule_platform uuid,
  p_rule_engine uuid
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_scope = 'variant' AND p_rule_catalog = p_catalog THEN 1
    WHEN p_scope = 'platform' AND p_rule_platform = p_platform THEN 2
    WHEN p_scope = 'platform'
      AND p_rule_platform = p_family
      AND p_family IS NOT NULL
      AND p_rule_platform IS DISTINCT FROM p_platform THEN 3
    WHEN p_scope = 'engine_family' AND p_rule_engine = p_engine THEN 4
    WHEN p_scope = 'global' THEN 5
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.mm_pick_part_rule(
  p_component_id uuid,
  p_catalog_id uuid,
  p_platform_id uuid,
  p_platform_family_id uuid,
  p_engine_family_id uuid,
  p_vehicle_class text,
  p_vehicle_year integer,
  p_statuses text[]
)
RETURNS public.maintenance_task_templates
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT t.*
  FROM public.maintenance_task_templates t
  WHERE t.component_id = p_component_id
    AND t.status = ANY (p_statuses)
    AND (
      p_vehicle_year IS NULL
      OR (
        p_vehicle_year >= coalesce(t.year_from, 0)
        AND p_vehicle_year <= coalesce(t.year_to, 9999)
      )
    )
    AND (
      cardinality(coalesce(t.applicable_vehicle_classes, ARRAY[]::text[])) = 0
      OR p_vehicle_class = ANY (
        SELECT lower(trim(x))
        FROM unnest(t.applicable_vehicle_classes) AS x
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_component_applicability a
      WHERE a.component_id = p_component_id
        AND a.applicable IS FALSE
        AND (
          (a.scope = 'variant' AND a.vehicle_catalog_id = p_catalog_id)
          OR (a.scope = 'platform' AND a.platform_id IN (p_platform_id, p_platform_family_id))
          OR (a.scope = 'engine_family' AND a.engine_family_id = p_engine_family_id)
        )
    )
    AND public.mm_part_rule_rank(
      t.template_scope,
      p_catalog_id,
      p_platform_id,
      p_platform_family_id,
      p_engine_family_id,
      t.vehicle_catalog_id,
      t.platform_id,
      t.engine_family_id
    ) IS NOT NULL
  ORDER BY public.mm_part_rule_rank(
    t.template_scope,
    p_catalog_id,
    p_platform_id,
    p_platform_family_id,
    p_engine_family_id,
    t.vehicle_catalog_id,
    t.platform_id,
    t.engine_family_id
  )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mm_vehicle_catalog_for_fleet(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_part_rule_rank(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_pick_part_rule(uuid, uuid, uuid, uuid, uuid, text, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_vehicle_catalog_for_fleet(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mm_part_rule_rank(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mm_pick_part_rule(uuid, uuid, uuid, uuid, uuid, text, integer, text[]) TO service_role;
