-- LC-14 fleet_add_found_job: add a job a saved inspection found, without changing what was paid.
-- Makes its own made-up rows and rolls everything back.

BEGIN;

DO $$
DECLARE
  v_org text := 'afj-org-never-real';
  v_org_other text := 'afj-org-other-never-real';
  v_veh text := 'afj-veh-never-real';
  v_actor uuid := 'a5555555-5555-4555-8555-555555555501';
  v_insp uuid := 'f0000501-0000-4000-8000-000000000501';
  v_o2 uuid := 'f0000502-0000-4000-8000-000000000502';
  v_pads uuid := 'f0000503-0000-4000-8000-000000000503';
  v_wo uuid := 'f0000504-0000-4000-8000-000000000504';
  v_wo_plain uuid := 'f0000505-0000-4000-8000-000000000505';
  v_wo_void uuid := 'f0000506-0000-4000-8000-000000000506';
  v_json jsonb;
  v_line uuid;
  v_total_before numeric;
  v_version_before integer;
  v_caught text;
  v_open jsonb;
BEGIN
  INSERT INTO public.maintenance_service_categories (id, code, name, kind, status, records_findings) VALUES
    (v_insp, 'afj_inspection_never', 'AFJ inspection never', 'component', 'active', true),
    (v_pads, 'afj_pads_never', 'AFJ pads never', 'component', 'active', false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.maintenance_service_categories (id, code, name, kind, is_part, status, position_scheme, position_aware)
  VALUES (v_o2, 'afj_oxygen_never', 'AFJ oxygen never', 'component', true, 'active', 'before_after_catalyst', false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO fleet.vehicles (id, organization_id, license_plate, legacy_kv_id, make, model, year, status)
  VALUES (v_veh, v_org, 'AFJ001', 'afj-leg', 'AFJ', 'Car', 2020, 'active')
  ON CONFLICT (id) DO NOTHING;

  -- A saved inspection (J$ 8,000), a saved service without an inspection, and a deleted inspection.
  INSERT INTO public.maintenance_work_orders (id, organization_id, vehicle_id, status, version, total_cost, currency, performed_at_date, opened_at)
  VALUES
    (v_wo, v_org, v_veh, 'completed', 1, 8000, 'JMD', '2026-08-22', now() - interval '3 days'),
    (v_wo_plain, v_org, v_veh, 'completed', 1, 500, 'JMD', '2026-08-20', now() - interval '5 days'),
    (v_wo_void, v_org, v_veh, 'completed', 1, 100, 'JMD', '2026-08-18', now() - interval '6 days');
  INSERT INTO public.maintenance_work_order_lines (id, work_order_id, sort_order, component_id, component_name, action, recommended, declined, line_total, items_amount)
  VALUES
    (gen_random_uuid(), v_wo, 0, v_insp, 'AFJ inspection never', 'inspect', false, false, 8000, 0),
    (gen_random_uuid(), v_wo_plain, 0, v_pads, 'AFJ pads never', 'replace', false, false, 500, 0),
    (gen_random_uuid(), v_wo_void, 0, v_insp, 'AFJ inspection never', 'inspect', false, false, 100, 0);
  UPDATE public.maintenance_work_orders SET voided_at = now() WHERE id = v_wo_void;

  SELECT total_cost, version INTO v_total_before, v_version_before FROM public.maintenance_work_orders WHERE id = v_wo;

  -- 1. Add Oxygen sensor · Front to the inspection: one J$ 0 found line, linked to the inspection job.
  v_json := public.fleet_add_found_job(v_org, v_actor, v_wo, v_o2, ARRAY['before_cat']::text[], '  Worn  ');
  IF (v_json ->> 'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'proof 1: created expected, got %', v_json; END IF;
  v_line := (v_json ->> 'lineId')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_work_order_lines l
    WHERE l.id = v_line AND l.work_order_id = v_wo AND l.recommended = true AND l.declined = false
      AND l.line_total = 0 AND l.positions = ARRAY['before_cat']::text[] AND l.notes = 'Worn'
      AND l.values_json ->> 'found_by_job' = v_insp::text AND l.sort_order = 1
  ) THEN
    RAISE EXCEPTION 'proof 1: line not stored as a found job of the inspection';
  END IF;
  IF NOT public.maintenance_found_line_is_open(v_line) THEN RAISE EXCEPTION 'proof 1: line should be open'; END IF;

  -- 2. What was paid didn't change (total, version untouched).
  IF (SELECT total_cost FROM public.maintenance_work_orders WHERE id = v_wo) <> v_total_before
     OR (SELECT version FROM public.maintenance_work_orders WHERE id = v_wo) <> v_version_before THEN
    RAISE EXCEPTION 'proof 2: the saved service changed';
  END IF;

  -- 3. It shows on Not done yet, from that inspection.
  v_open := public.fleet_open_found_work(v_org, v_veh);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_open) e
    WHERE e ->> 'lineId' = v_line::text AND e ->> 'source' = 'inspection' AND e ->> 'inspectionJobName' = 'AFJ inspection never'
  ) THEN
    RAISE EXCEPTION 'proof 3: not on the found list as from the inspection: %', v_open;
  END IF;

  -- 4. Same job and place again: listed once.
  v_json := public.fleet_add_found_job(v_org, v_actor, v_wo, v_o2, ARRAY['before_cat']::text[], NULL);
  IF (v_json ->> 'alreadyListed')::boolean IS NOT TRUE OR (v_json ->> 'lineId')::uuid <> v_line THEN
    RAISE EXCEPTION 'proof 4: expected alreadyListed on the same line, got %', v_json;
  END IF;
  IF (SELECT count(*) FROM public.maintenance_work_order_lines WHERE work_order_id = v_wo AND recommended = true) <> 1 THEN
    RAISE EXCEPTION 'proof 4: listed twice';
  END IF;

  -- 5. A job without places, then the refusals.
  v_json := public.fleet_add_found_job(v_org, v_actor, v_wo, v_pads, NULL, NULL);
  IF (v_json ->> 'created')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'proof 5: pads not added'; END IF;

  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org, v_actor, v_wo, v_o2, ARRAY['LF']::text[], NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'position_invalid' THEN RAISE EXCEPTION 'proof 5a: got %', v_caught; END IF;

  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org, v_actor, v_wo, v_insp, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'job_is_inspection' THEN RAISE EXCEPTION 'proof 5b: got %', v_caught; END IF;

  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org, v_actor, v_wo_plain, v_o2, ARRAY['after_cat']::text[], NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'not_an_inspection' THEN RAISE EXCEPTION 'proof 5c: got %', v_caught; END IF;

  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org, v_actor, v_wo_void, v_o2, ARRAY['after_cat']::text[], NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'service_not_open_for_finds' THEN RAISE EXCEPTION 'proof 5d: got %', v_caught; END IF;

  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org_other, v_actor, v_wo, v_o2, ARRAY['after_cat']::text[], NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'service_not_found' THEN RAISE EXCEPTION 'proof 5e (other company): got %', v_caught; END IF;

  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org, NULL, v_wo, v_o2, ARRAY['after_cat']::text[], NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'actor_required' THEN RAISE EXCEPTION 'proof 5f: got %', v_caught; END IF;

  -- 7. LC-15 garage quote: stored on the found line only; the line and the service total stay as they were.
  v_json := public.fleet_add_found_job(v_org, v_actor, v_wo, v_o2, ARRAY['after_cat']::text[], NULL, 12000.456);
  v_line := (v_json ->> 'lineId')::uuid;
  IF (SELECT (values_json ->> 'quote_amount')::numeric FROM public.maintenance_work_order_lines WHERE id = v_line) <> 12000.46
     OR (SELECT line_total FROM public.maintenance_work_order_lines WHERE id = v_line) <> 0 THEN
    RAISE EXCEPTION 'proof 7: quote not stored as a quote only';
  END IF;
  IF (SELECT total_cost FROM public.maintenance_work_orders WHERE id = v_wo) <> v_total_before THEN
    RAISE EXCEPTION 'proof 7: the quote changed the service total';
  END IF;
  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org, v_actor, v_wo, v_pads, NULL, NULL, -5);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'quote_invalid' THEN RAISE EXCEPTION 'proof 7b: got %', v_caught; END IF;

  -- 8. LC-16 full quote form: kept as a snapshot only; still J$ 0, no item rows, no totals touched.
  INSERT INTO public.maintenance_service_categories (id, code, name, kind, status, records_findings)
  VALUES ('f0000507-0000-4000-8000-000000000507', 'afj_cleaning_never', 'AFJ cleaning never', 'component', 'active', false)
  ON CONFLICT (id) DO NOTHING;
  v_json := public.fleet_add_found_job(v_org, v_actor, v_wo, 'f0000507-0000-4000-8000-000000000507'::uuid, NULL, NULL, 9500,
    '{"values":{"labor":3500},"items":[{"itemName":"Brake cleaner","qty":1,"unitCost":6000}]}'::jsonb);
  v_line := (v_json ->> 'lineId')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.maintenance_work_order_lines
    WHERE id = v_line AND line_total = 0 AND items_amount = 0
      AND values_json -> 'quote' -> 'values' ->> 'labor' = '3500'
      AND (values_json ->> 'quote_amount')::numeric = 9500
  ) THEN
    RAISE EXCEPTION 'proof 8: quote form not kept as a snapshot only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.maintenance_work_order_line_item WHERE work_order_line_id = v_line) THEN
    RAISE EXCEPTION 'proof 8: quote items became real item rows';
  END IF;
  IF (SELECT total_cost FROM public.maintenance_work_orders WHERE id = v_wo) <> v_total_before THEN
    RAISE EXCEPTION 'proof 8: the quote changed the service total';
  END IF;
  v_caught := NULL;
  BEGIN PERFORM public.fleet_add_found_job(v_org, v_actor, v_wo, v_pads, NULL, NULL, 1, '[1,2]'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'quote_invalid' THEN RAISE EXCEPTION 'proof 8b: got %', v_caught; END IF;

  -- 9. LC-17 Edit quote on an open found job: quote + note change; nothing else may; total untouched.
  v_json := public.fleet_set_found_quote(v_org, v_actor, v_line, 5000, '{"values":{"service_amount":5000}}'::jsonb, 'Garage called back');
  IF (SELECT (values_json->>'quote_amount')::numeric FROM public.maintenance_work_order_lines WHERE id = v_line) <> 5000
     OR (SELECT values_json->'quote'->'values'->>'service_amount' FROM public.maintenance_work_order_lines WHERE id = v_line) <> '5000'
     OR (SELECT notes FROM public.maintenance_work_order_lines WHERE id = v_line) <> 'Garage called back'
     OR (SELECT values_json->>'found_by_job' FROM public.maintenance_work_order_lines WHERE id = v_line) <> v_insp::text
     OR (SELECT line_total FROM public.maintenance_work_order_lines WHERE id = v_line) <> 0 THEN
    RAISE EXCEPTION 'proof 9: quote not edited as a quote only';
  END IF;
  IF (SELECT total_cost FROM public.maintenance_work_orders WHERE id = v_wo) <> v_total_before THEN
    RAISE EXCEPTION 'proof 9: the edit changed the service total';
  END IF;
  -- any other change on the line is still refused
  v_caught := NULL;
  BEGIN UPDATE public.maintenance_work_order_lines SET line_total = 99 WHERE id = v_line;
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'completed work order lines cannot be edited' THEN RAISE EXCEPTION 'proof 9b: got %', v_caught; END IF;
  v_caught := NULL;
  BEGIN UPDATE public.maintenance_work_order_lines SET values_json = values_json || '{"labor":1}'::jsonb WHERE id = v_line;
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'completed work order lines cannot be edited' THEN RAISE EXCEPTION 'proof 9c: got %', v_caught; END IF;
  -- other company / closed job refused
  v_caught := NULL;
  BEGIN PERFORM public.fleet_set_found_quote(v_org_other, v_actor, v_line, 1, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'found_line_not_found' THEN RAISE EXCEPTION 'proof 9d: got %', v_caught; END IF;
  UPDATE public.maintenance_work_order_lines
  SET declined = true, closed_at = now(), closed_reason = 'not_needed'
  WHERE id = v_line;
  v_caught := NULL;
  BEGIN PERFORM public.fleet_set_found_quote(v_org, v_actor, v_line, 1, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
  IF v_caught IS DISTINCT FROM 'found_line_not_open' THEN RAISE EXCEPTION 'proof 9e: got %', v_caught; END IF;

  -- 6. Signed-in users can't call it directly (only the server can).
  IF has_function_privilege('authenticated', 'public.fleet_add_found_job(text, uuid, uuid, uuid, text[], text, numeric, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'proof 6: authenticated can execute';
  END IF;

  RAISE NOTICE 'add_found_job_to_inspection_checks: ok';
END $$;

ROLLBACK;
