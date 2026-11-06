-- Undo preflight uses part_import_row_snapshot; self-serve logs fitment rules and exclusions.

CREATE OR REPLACE FUNCTION public.part_import_row_snapshot(
  p_table text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_table = 'part_master' THEN
    RETURN (SELECT to_jsonb(pm.*) FROM public.part_master pm WHERE pm.id = p_id);
  ELSIF p_table = 'part_listing' THEN
    RETURN (SELECT to_jsonb(pl.*) FROM public.part_listing pl WHERE pl.id = p_id);
  ELSIF p_table = 'part_interchange_group' THEN
    RETURN (SELECT to_jsonb(g.*) FROM public.part_interchange_group g WHERE g.id = p_id);
  ELSIF p_table = 'vehicle_oe_number' THEN
    RETURN (SELECT to_jsonb(v.*) FROM public.vehicle_oe_number v WHERE v.id = p_id);
  ELSIF p_table = 'part_oe_reference' THEN
    RETURN (SELECT to_jsonb(r.*) FROM public.part_oe_reference r WHERE r.id = p_id);
  ELSIF p_table = 'part_index_number' THEN
    RETURN (SELECT to_jsonb(i.*) FROM public.part_index_number i WHERE i.id = p_id);
  ELSIF p_table = 'part_approval' THEN
    RETURN (SELECT to_jsonb(a.*) FROM public.part_approval a WHERE a.id = p_id);
  ELSIF p_table = 'platform_component_link' THEN
    RETURN (SELECT to_jsonb(l.*) FROM public.platform_component_link l WHERE l.id = p_id);
  ELSIF p_table = 'interchange_group_merge_log' THEN
    RETURN (SELECT to_jsonb(m.*) FROM public.interchange_group_merge_log m WHERE m.id = p_id);
  ELSIF p_table = 'catalog_spec_value' THEN
    RETURN (SELECT to_jsonb(s.*) FROM public.catalog_spec_value s WHERE s.id = p_id);
  ELSIF p_table = 'interchange_fitment_rule' THEN
    RETURN (SELECT to_jsonb(r.*) FROM public.interchange_fitment_rule r WHERE r.id = p_id);
  ELSIF p_table = 'part_listing_exclusion' THEN
    RETURN (SELECT to_jsonb(e.*) FROM public.part_listing_exclusion e WHERE e.id = p_id);
  ELSIF p_table = 'universal_part' THEN
    RETURN (SELECT to_jsonb(u.*) FROM public.universal_part u WHERE u.id = p_id);
  END IF;
  RETURN NULL;
END;
$$;
