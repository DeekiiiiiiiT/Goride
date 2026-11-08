-- 5-13: part lookup returns identity + trust source for "Add more cars to it".

CREATE OR REPLACE FUNCTION public.self_serve_part_lookup(p_brand text, p_number text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_part record;
  v_norm text;
  v_catalog_car_maker text;
BEGIN
  v_norm := public.part_import_norm_number(p_number);
  IF v_norm IS NULL OR v_norm = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT
    pm.id,
    pm.manufacturer,
    pm.oem_part_number,
    pm.interchange_group_id,
    pm.maintenance_component_id,
    pm.catalog_decision,
    pm.source_type,
    pm.part_kind
  INTO v_part
  FROM public.part_master pm
  WHERE upper(coalesce(pm.manufacturer, '')) = upper(btrim(p_brand))
    AND pm.oem_part_number_norm = v_norm
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'normalized', v_norm);
  END IF;

  v_catalog_car_maker := NULL;
  IF coalesce(v_part.source_type, '') = 'car_maker_catalogue' THEN
    SELECT vc.make INTO v_catalog_car_maker
    FROM public.part_listing pl
    JOIN public.vehicle_catalog vc ON vc.id = pl.vehicle_catalog_id
    WHERE pl.interchange_group_id = v_part.interchange_group_id
    ORDER BY
      CASE COALESCE(pl.trust, 'confirmed')
        WHEN 'confirmed' THEN 0
        WHEN 'needs_checking' THEN 1
        ELSE 2
      END,
      pl.trust_set_at DESC NULLS LAST,
      vc.make
    LIMIT 1;
    v_catalog_car_maker := coalesce(nullif(btrim(v_catalog_car_maker), ''), nullif(btrim(v_part.manufacturer), ''));
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'partId', v_part.id,
    'brand', v_part.manufacturer,
    'number', v_part.oem_part_number,
    'normalized', v_norm,
    'groupId', v_part.interchange_group_id,
    'partTypeId', v_part.maintenance_component_id,
    'listingCount', (SELECT count(*)::int FROM public.part_listing pl WHERE pl.interchange_group_id = v_part.interchange_group_id),
    'partKind', v_part.part_kind,
    'sourceType', v_part.source_type,
    'catalogCarMaker', coalesce(v_catalog_car_maker, '')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.self_serve_part_lookup(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_serve_part_lookup(text, text) TO service_role;
