-- Fleet showed "Brake fluid: Not on file yet" for the Roomy although the car has
-- a sourced brake_fluid spec. universal_section_for_variant only linked a spec to
-- a part type through spec_key.maintenance_component_id; brake_fluid (and
-- coolant, washer fluid, battery, bulbs, tyre size) are linked through
-- spec_key.component_id or part_type_spec_field instead. Now all three links
-- count, the same rule as parts_finder.loadUniversalToleranceMm.
-- Body otherwise = live (md5 47682192e7db6a59c310c9aa76089b67 before this change).

CREATE OR REPLACE FUNCTION public.universal_section_for_variant(p_catalog_id uuid, p_vehicle_year integer DEFAULT NULL::integer, p_component_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'specKey', spec_key,
    'label', label,
    'value', spec_value,
    'unit', unit,
    'items', items
  ) order by label), '[]'::jsonb)
  from (
    select
      u.spec_key,
      u.label,
      u.spec_value,
      u.unit,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', u.universal_part_id,
        'manufacturer', u.manufacturer,
        'partNumber', u.part_number,
        'name', u.name,
        'extra', u.extra
      ) order by u.manufacturer) filter (where u.universal_part_id is not null), '[]'::jsonb) as items
    from public.universal_parts_for_variant(p_catalog_id, p_vehicle_year) u
    where p_component_id is null
      or exists (
        select 1
        from public.spec_key sk
        where sk.key = u.spec_key
          and (sk.maintenance_component_id = p_component_id or sk.component_id = p_component_id)
      )
      or exists (
        select 1
        from public.part_type_spec_field f
        where f.spec_key = u.spec_key
          and f.part_type_id = p_component_id
      )
    group by u.spec_key, u.label, u.spec_value, u.unit
  ) s;
$function$;

REVOKE EXECUTE ON FUNCTION public.universal_section_for_variant(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.universal_section_for_variant(uuid, integer, uuid) TO service_role;
