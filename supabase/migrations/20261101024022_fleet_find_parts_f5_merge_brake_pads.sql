-- F1: Merge duplicate F5 "Brake pads" (brake_pads) into canonical BRK-PADS row (2 Nov 2026)

DO $$
DECLARE
  v_canonical uuid;
  v_duplicate uuid := 'f5a10001-0000-4000-8000-000000000001'::uuid;
  v_dup_name_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maintenance_service_categories WHERE id = v_duplicate) THEN
    RAISE NOTICE 'F1 merge: duplicate row % already removed', v_duplicate;
    RETURN;
  END IF;

  SELECT id INTO v_canonical
  FROM public.maintenance_service_categories
  WHERE op_code = 'BRK-PADS'
    AND kind = 'component'
  ORDER BY sort_order NULLS LAST, id
  LIMIT 1;

  IF v_canonical IS NULL THEN
    SELECT id INTO v_canonical
    FROM public.maintenance_service_categories
    WHERE id = 'a1000000-0000-4000-8000-00000000000a'::uuid;
  END IF;

  IF v_canonical IS NULL THEN
    RAISE EXCEPTION 'F1 merge: canonical Brake pads (BRK-PADS) not found';
  END IF;

  IF v_canonical = v_duplicate THEN
    RAISE EXCEPTION 'F1 merge: canonical and duplicate ids are the same (%)', v_canonical;
  END IF;

  UPDATE public.part_master
  SET maintenance_component_id = v_canonical
  WHERE maintenance_component_id = v_duplicate;

  UPDATE public.parts_sourcing_requests
  SET maintenance_component_id = v_canonical
  WHERE maintenance_component_id = v_duplicate;

  UPDATE public.part_term_synonym
  SET maintenance_component_id = v_canonical
  WHERE maintenance_component_id = v_duplicate;

  UPDATE public.part_symptom_component psc1
  SET component_id = v_canonical
  WHERE psc1.component_id = v_duplicate
    AND NOT EXISTS (
      SELECT 1 FROM public.part_symptom_component psc2
      WHERE psc2.symptom_id = psc1.symptom_id
        AND psc2.component_id = v_canonical
    );

  DELETE FROM public.part_symptom_component
  WHERE component_id = v_duplicate;

  UPDATE public.fleet_parts_list_line
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.catalog_component_applicability
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.catalog_task
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.component_related_supply
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.maintenance_inspection_findings
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.maintenance_inspection_items
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.maintenance_task_templates
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.maintenance_work_order_lines
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.part_repeat_alert
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  UPDATE public.spec_key
  SET component_id = v_canonical
  WHERE component_id = v_duplicate;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'spec_key'
      AND column_name = 'maintenance_component_id'
  ) THEN
    EXECUTE 'UPDATE public.spec_key SET maintenance_component_id = $1 WHERE maintenance_component_id = $2'
    USING v_canonical, v_duplicate;
  END IF;

  DELETE FROM public.maintenance_service_categories
  WHERE id = v_duplicate;

  SELECT count(*) INTO v_dup_name_count
  FROM (
    SELECT lower(coalesce(c.plain_name, c.name)) AS label
    FROM public.maintenance_service_categories c
    WHERE c.parent_id IS NOT NULL
      AND c.kind = 'component'
    GROUP BY c.parent_id, lower(coalesce(c.plain_name, c.name))
    HAVING count(*) > 1
  ) dup;

  IF v_dup_name_count > 0 THEN
    RAISE EXCEPTION 'F1 merge: duplicate component names still exist under the same area';
  END IF;
END $$;
