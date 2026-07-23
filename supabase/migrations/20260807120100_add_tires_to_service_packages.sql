-- Ensure Tires category is in Basic / Intermediate / Major packages.
WITH pkgs AS (
  SELECT id FROM public.maintenance_task_templates
  WHERE lower(coalesce(task_code, '')) IN ('a', 'b', 'c', 'basic', 'intermediate', 'major')
     OR lower(task_name) LIKE 'basic%'
     OR lower(task_name) LIKE 'intermediate%'
     OR lower(task_name) LIKE 'major%'
)
INSERT INTO public.maintenance_package_categories (template_id, category_id, sort_order)
SELECT p.id, 'a1000000-0000-4000-8000-000000000002'::uuid, 15
FROM pkgs p
ON CONFLICT (template_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order;

UPDATE public.maintenance_task_templates t
SET description = sub.lines, updated_at = now()
FROM (
  SELECT mpc.template_id, string_agg(c.name, E'\n' ORDER BY mpc.sort_order) AS lines
  FROM public.maintenance_package_categories mpc
  JOIN public.maintenance_service_categories c ON c.id = mpc.category_id
  GROUP BY mpc.template_id
) sub
WHERE t.id = sub.template_id;
