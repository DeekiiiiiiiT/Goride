BEGIN;

DO $test$
DECLARE
  v_roomy uuid;
  v_lbl text;
  v_json jsonb;
BEGIN
  SELECT id INTO v_roomy
  FROM public.vehicle_catalog
  WHERE lower(make) = 'toyota' AND lower(model) = 'roomy' AND chassis_code = 'M900A'
  ORDER BY production_start_year
  LIMIT 1;

  IF v_roomy IS NULL THEN
    RAISE NOTICE 'SKIP vehicles_d1_d2: no Roomy M900A in vehicle_catalog';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.catalog_maker WHERE lower(make) = 'toyota') THEN
    RAISE EXCEPTION 'catalog_maker missing Toyota seed';
  END IF;

  v_lbl := public.vehicle_version_difference_label(vc.*)
  FROM public.vehicle_catalog vc
  WHERE vc.id = v_roomy;

  IF v_lbl IS NULL OR v_lbl = '' THEN
    RAISE EXCEPTION 'difference label empty for Roomy';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vehicle_catalog WHERE id = '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid
  ) THEN
    SELECT public.vehicle_version_difference_label(vc.*) INTO v_lbl
    FROM public.vehicle_catalog vc
    WHERE vc.id = '3cd9cbf3-a804-4817-82db-400cf6abf13a'::uuid;
    IF v_lbl IS DISTINCT FROM '2WD · 1.0 petrol' THEN
      RAISE EXCEPTION 'Roomy 3cd9cbf3 label expected 2WD · 1.0 petrol, got %', v_lbl;
    END IF;
  END IF;
  IF v_lbl NOT LIKE '%2WD%' AND v_lbl NOT LIKE '%4WD%' THEN
    RAISE NOTICE 'difference label may omit drive: %', v_lbl;
  END IF;

  v_json := public.list_catalog_makers_summary();
  IF jsonb_array_length(v_json) < 1 THEN
    RAISE EXCEPTION 'list_catalog_makers_summary empty';
  END IF;

  v_json := public.list_vehicle_catalog_revisions(v_roomy, 5);
  IF v_json IS NULL THEN
    RAISE EXCEPTION 'list_vehicle_catalog_revisions returned null';
  END IF;
END;
$test$;

ROLLBACK;
