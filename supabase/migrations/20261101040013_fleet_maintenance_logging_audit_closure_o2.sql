CREATE OR REPLACE FUNCTION fleet._map_legacy_checklist_to_category(p_label text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT c.id
  FROM public.maintenance_service_categories c
  WHERE lower(trim(p_label)) = lower(trim(c.name))
     OR lower(trim(p_label)) LIKE '%' || lower(trim(c.name)) || '%'
     OR lower(trim(c.name)) LIKE '%' || lower(split_part(trim(p_label), ' ', 1)) || '%'
  ORDER BY length(c.name) DESC
  LIMIT 1;
$$;;
