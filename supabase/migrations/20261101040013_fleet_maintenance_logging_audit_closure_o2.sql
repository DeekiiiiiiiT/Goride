-- Prod-applied: fleet_maintenance_logging_audit_closure_o2 (audit O-02)

-- ---------------------------------------------------------------------------
-- O-02: Legacy fleet.maintenance_logs → completed work orders + lines
-- ---------------------------------------------------------------------------
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
  IF v_label LIKE '%engine oil%' OR v_label LIKE '%oil filter%' THEN
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

DO $$
DECLARE
  r record;
  v_wo_id uuid;
  v_item text;
  v_idx integer;
  v_cost jsonb;
  v_material numeric;
  v_labor numeric;
  v_line_total numeric;
  v_comp uuid;
  v_odo integer;
  v_date date;
  v_exists uuid;
BEGIN
  FOR r IN
    SELECT ml.*
    FROM fleet.maintenance_logs ml
    WHERE coalesce(ml.payload_json->>'workOrderId', '') = ''
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_work_orders wo
        WHERE wo.payload_json->>'legacyMaintenanceLogId' = ml.id::text
      )
  LOOP
    v_wo_id := gen_random_uuid();
    v_odo := coalesce(
      nullif((r.payload_json->>'odo')::integer, 0),
      nullif(r.odometer, 0),
      nullif((r.payload_json->>'performed_at_miles')::integer, 0)
    );
    v_date := coalesce(
      nullif(r.payload_json->>'date', '')::date,
      r.service_date,
      current_date
    );

    INSERT INTO public.maintenance_work_orders (
      id,
      organization_id,
      vehicle_id,
      status,
      opened_at,
      closed_at,
      performed_at_date,
      odometer,
      provider,
      currency,
      log_mode,
      package_complete,
      notes,
      total_cost,
      payload_json,
      updated_at
    ) VALUES (
      v_wo_id,
      r.organization_id,
      r.vehicle_id,
      'completed',
      coalesce(r.created_at, now()),
      coalesce(r.updated_at, now()),
      v_date,
      v_odo,
      coalesce(r.payload_json->>'provider', 'Unknown'),
      'JMD',
      coalesce(r.payload_json->>'logMode', 'quick_job'),
      false,
      coalesce(r.payload_json->>'notes', ''),
      coalesce(r.cost, (r.payload_json->>'cost')::numeric, 0),
      jsonb_build_object(
        'source', 'legacy_maintenance_log_backfill',
        'legacyMaintenanceLogId', r.id::text
      ),
      now()
    );

    v_idx := 0;
    FOR v_item IN
      SELECT jsonb_array_elements_text(coalesce(r.payload_json->'checklist', '[]'::jsonb))
    LOOP
      v_idx := v_idx + 1;
      v_comp := fleet._map_legacy_checklist_to_category(v_item);
      v_cost := coalesce(r.payload_json->'itemCosts'->v_item, '{}'::jsonb);
      v_material := coalesce((v_cost->>'material')::numeric, 0);
      v_labor := coalesce((v_cost->>'labor')::numeric, 0);
      v_line_total := v_material + v_labor;

      INSERT INTO public.maintenance_work_order_lines (
        id,
        work_order_id,
        sort_order,
        component_id,
        component_name,
        action,
        material,
        labor_amount,
        line_total,
        notes
      ) VALUES (
        gen_random_uuid(),
        v_wo_id,
        v_idx,
        v_comp,
        v_item,
        'replace',
        v_material,
        v_labor,
        v_line_total,
        CASE WHEN v_comp IS NULL THEN 'Unmapped legacy checklist item' ELSE NULL END
      );
    END LOOP;

    UPDATE fleet.maintenance_logs
    SET payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object('workOrderId', v_wo_id::text),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT mr.*
    FROM public.maintenance_records mr
    WHERE coalesce(mr.payload_json->>'workOrderId', '') = ''
      AND lower(coalesce(mr.status, '')) NOT IN ('requested', 'draft')
  LOOP
    v_wo_id := gen_random_uuid();
    v_odo := coalesce(
      nullif(r.performed_at_miles, 0),
      nullif((r.payload_json->>'odo')::integer, 0)
    );
    v_date := coalesce(r.performed_at_date, nullif(r.payload_json->>'date', '')::date, current_date);

    INSERT INTO public.maintenance_work_orders (
      id,
      organization_id,
      vehicle_id,
      status,
      opened_at,
      closed_at,
      performed_at_date,
      odometer,
      provider,
      currency,
      log_mode,
      package_complete,
      notes,
      total_cost,
      maintenance_record_id,
      payload_json,
      updated_at
    ) VALUES (
      v_wo_id,
      r.organization_id,
      r.vehicle_id,
      'completed',
      coalesce(r.updated_at, now()),
      coalesce(r.updated_at, now()),
      v_date,
      v_odo,
      coalesce(r.provider, r.payload_json->>'provider', 'Unknown'),
      coalesce(r.currency, 'JMD'),
      coalesce(r.payload_json->>'logMode', 'quick_job'),
      coalesce((r.payload_json->>'packageComplete')::boolean, false),
      coalesce(r.notes, r.payload_json->>'notes', ''),
      coalesce(r.cost, 0),
      r.id,
      jsonb_build_object('source', 'legacy_maintenance_record_backfill', 'recordId', r.id::text),
      now()
    );

    v_idx := 0;
    IF jsonb_typeof(r.payload_json->'lines') = 'array'
      AND jsonb_array_length(r.payload_json->'lines') > 0
    THEN
      FOR v_cost IN SELECT jsonb_array_elements(r.payload_json->'lines') LOOP
        v_idx := v_idx + 1;
        v_comp := nullif(v_cost->>'categoryId', '')::uuid;
        IF v_comp IS NULL THEN
          v_comp := fleet._map_legacy_checklist_to_category(coalesce(v_cost->>'categoryName', ''));
        END IF;
        v_material := coalesce((v_cost->'values'->>'unit_price')::numeric, (v_cost->>'unitPrice')::numeric, 0)
          * coalesce((v_cost->>'qty')::numeric, 1);
        v_labor := coalesce((v_cost->'values'->>'labor')::numeric, (v_cost->>'labor')::numeric, 0);
        INSERT INTO public.maintenance_work_order_lines (
          id,
          work_order_id,
          sort_order,
          system_id,
          component_id,
          system_code,
          system_name,
          component_code,
          component_name,
          action,
          qty,
          unit_price,
          material,
          labor_amount,
          line_total,
          positions,
          brand,
          complimentary,
          values_json
        ) VALUES (
          gen_random_uuid(),
          v_wo_id,
          v_idx,
          nullif(v_cost->>'systemId', '')::uuid,
          v_comp,
          v_cost->>'systemCode',
          v_cost->>'systemName',
          v_cost->>'categoryCode',
          coalesce(v_cost->>'categoryName', v_cost->>'categoryCode'),
          coalesce(v_cost->>'action', 'replace'),
          coalesce((v_cost->>'qty')::numeric, 1),
          coalesce((v_cost->>'unitPrice')::numeric, 0),
          v_material,
          v_labor,
          v_material + v_labor,
          CASE
            WHEN jsonb_typeof(v_cost->'positions') = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(v_cost->'positions'))
            ELSE NULL
          END,
          v_cost->>'brand',
          coalesce((v_cost->>'complimentary')::boolean, false),
          coalesce(v_cost->'values', '{}'::jsonb)
        );
      END LOOP;
    ELSE
      FOR v_item IN
        SELECT jsonb_array_elements_text(coalesce(r.payload_json->'checklist', '[]'::jsonb))
      LOOP
        v_idx := v_idx + 1;
        v_comp := fleet._map_legacy_checklist_to_category(v_item);
        v_cost := coalesce(r.payload_json->'itemCosts'->v_item, '{}'::jsonb);
        v_material := coalesce((v_cost->>'material')::numeric, 0);
        v_labor := coalesce((v_cost->>'labor')::numeric, 0);
        v_line_total := v_material + v_labor;

        INSERT INTO public.maintenance_work_order_lines (
          id,
          work_order_id,
          sort_order,
          component_id,
          component_name,
          action,
          material,
          labor_amount,
          line_total,
          notes
        ) VALUES (
          gen_random_uuid(),
          v_wo_id,
          v_idx,
          v_comp,
          v_item,
          'replace',
          v_material,
          v_labor,
          v_line_total,
          CASE WHEN v_comp IS NULL THEN 'Unmapped legacy checklist item' ELSE NULL END
        );
      END LOOP;
    END IF;

    UPDATE public.maintenance_records
    SET payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object('workOrderId', v_wo_id::text),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;