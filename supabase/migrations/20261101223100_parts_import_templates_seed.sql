-- Seed part_import_template v1 for each maintenance system (audit §5)

WITH common_cols AS (
  SELECT jsonb_build_array(
    jsonb_build_object('name', 'vehicle', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'part_type', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'brand', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'part_number', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'part_name', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'match_type', 'required', true, 'type', 'text'),
    jsonb_build_object('name', 'year_from', 'required', true, 'type', 'integer'),
    jsonb_build_object('name', 'year_to', 'required', true, 'type', 'integer'),
    jsonb_build_object('name', 'source_url', 'required', true, 'type', 'url'),
    jsonb_build_object('name', 'replaces_oem_number', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'position', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'side', 'required', false, 'type', 'text'),
    jsonb_build_object('name', 'note', 'required', false, 'type', 'text')
  ) AS cols
)
INSERT INTO public.part_import_template (area_id, version, columns, allowed_part_type_ids, example_rows, active)
SELECT
  sys.id,
  1,
  cc.cols,
  coalesce(array_agg(child.id) FILTER (WHERE child.id IS NOT NULL), '{}'::uuid[]),
  '[]'::jsonb,
  true
FROM public.maintenance_service_categories sys
CROSS JOIN common_cols cc
LEFT JOIN public.maintenance_service_categories child
  ON child.parent_id = sys.id AND child.is_part IS TRUE
WHERE sys.kind = 'system'
GROUP BY sys.id, cc.cols
ON CONFLICT (area_id, version) DO UPDATE SET
  columns = excluded.columns,
  allowed_part_type_ids = excluded.allowed_part_type_ids,
  active = true;
