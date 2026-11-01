CREATE OR REPLACE FUNCTION public.catalog_research_part_kind_from_match(p_match_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(trim(p_match_type), ''))
    WHEN 'AFTERMARKET' THEN 'aftermarket'
    WHEN 'UNIVERSAL' THEN 'aftermarket'
    WHEN 'OE_SUPPLIER' THEN 'oe_supplier'
    WHEN 'REMAN' THEN 'reman'
    WHEN 'USED' THEN 'used'
    ELSE 'oem'
  END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_research_research_group_key(
  p_vehicle_catalog_id uuid,
  p_component_id uuid,
  p_fit_descriptor text,
  p_install_side text,
  p_match_type text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat_ws(
    ':',
    coalesce(p_vehicle_catalog_id::text, ''),
    coalesce(p_component_id::text, ''),
    coalesce(nullif(trim(p_fit_descriptor), ''), coalesce(nullif(trim(p_install_side), ''), '')),
    coalesce(nullif(trim(p_match_type), ''), '')
  );
$$;;
