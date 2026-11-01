-- Prod-applied: fleet_maintenance_logging_map_fix (audit R-06)

CREATE OR REPLACE FUNCTION fleet._map_legacy_checklist_to_category(p_label text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_label text := lower(trim(p_label));
  v_id uuid;
BEGIN
  IF v_label LIKE '%engine oil%' OR v_label LIKE '%oil filter%' OR v_label LIKE '%oil & filter%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'oil' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%cabin%' AND v_label LIKE '%filter%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'cabin_filter' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%air filter%' OR v_label LIKE '%engine air%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'air_filter' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%brake fluid%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'brake_fluid' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%coolant%' OR v_label LIKE '%radiator%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code IN ('coolant', 'radiator_coolant') LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%tire%' AND (v_label LIKE '%rotate%' OR v_label LIKE '%rotation%') THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'rotate_tires' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%tire%' AND (v_label LIKE '%change%' OR v_label LIKE '%replace%') THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'tire_change' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%washer%' OR v_label LIKE '%windshield%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'washer_fluid' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_label LIKE '%tire pressure%' THEN
    SELECT id INTO v_id FROM public.maintenance_service_categories WHERE code = 'tire_pressure' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  SELECT c.id INTO v_id
  FROM public.maintenance_service_categories c
  WHERE lower(trim(c.name)) = v_label
  ORDER BY length(c.name) DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT c.id INTO v_id
  FROM public.maintenance_service_categories c
  WHERE v_label LIKE '%' || lower(trim(c.name)) || '%'
  ORDER BY length(c.name) DESC
  LIMIT 1;
  RETURN v_id;
END;
$$;
