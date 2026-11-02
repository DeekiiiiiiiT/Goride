-- Full database area facets from maintenance systems (IM-06)

CREATE OR REPLACE FUNCTION public.admin_catalog_area_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(sys.plain_name, sys.name),
    'icon', coalesce(sys.icon_key, 'category'),
    'count', coalesce(cnt.n, 0)
  ) ORDER BY sys.sort_order, coalesce(sys.plain_name, sys.name)), '[]'::jsonb)
  FROM public.maintenance_service_categories sys
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS n
    FROM public.part_master pm
    JOIN public.maintenance_service_categories comp ON comp.id = pm.maintenance_component_id
    WHERE comp.parent_id = sys.id
      AND pm.catalog_decision IS DISTINCT FROM 'rejected'
  ) cnt ON true
  WHERE sys.kind = 'system';
$$;

REVOKE ALL ON FUNCTION public.admin_catalog_area_facets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_catalog_area_facets() TO service_role;
